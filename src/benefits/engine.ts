import { randomUUID } from 'node:crypto';
import { TERMINAL, type BenefitCase, type LabState } from './model.js';
import { assess, contextHash, isClaim, prepareProposal } from './policy.js';
import { SimulatedProvider, type BenefitProvider, type ProviderOrder } from './provider.js';
import { SCENARIOS } from './scenarios.js';
import { BenefitStore, LabError } from './store.js';

export type Command = 'prepare' | 'approve' | 'cancel' | 'repair' | 'revise' | 'confirm';
function event(c: BenefitCase, now: number, type: string, text: string): void {
  c.events.push({ at: new Date(now).toISOString(), type, text });
}
function invalidate(c: BenefitCase): void {
  c.revision++;
  delete c.authorization;
  delete c.proposal;
  delete c.actionKey;
  delete c.nextRunAt;
  c.attempts = 0;
}
function prepare(c: BenefitCase, now: number): void {
  const failure = assess(c, now);
  if (failure) {
    c.status = failure.status; c.nextAction = failure.reason; c.owner = 'Operator';
    event(c, now, 'eligibility_blocked', failure.reason);
    return;
  }
  c.proposal = prepareProposal(c, now);
  c.status = 'awaiting_approval'; c.owner = 'You';
  c.nextAction = 'Review destination, amount, disclosures, deadline and exact action. Nothing has been sent.';
  event(c, now, 'proposal_prepared', `Revision ${c.revision} prepared from fictional evidence; approval required.`);
}

export class BenefitsEngine {
  constructor(readonly store: BenefitStore, readonly provider: BenefitProvider = new SimulatedProvider(store)) {}

  async load(owner: string, scenarioId: string): Promise<BenefitCase> {
    const s = SCENARIOS.find(s => s.id === scenarioId);
    if (!s) throw new LabError('Unknown fictional scenario', 400);
    const now = await this.store.now(owner);
    return this.store.insert(owner, {
      id: randomUUID(), scenarioId, workflow: s.workflow, title: s.title, need: s.need, person: s.person,
      status: 'opportunity', revision: 1, facts: structuredClone(s.facts), fault: s.fault,
      evidence: structuredClone(s.evidence), nextAction: s.need, owner: 'Benny', attempts: 0,
      realizedCents: 0, createdAt: new Date(now).toISOString(),
      events: [{ at: new Date(now).toISOString(), type: 'opportunity_found', text: s.need }],
    });
  }

  async state(owner: string): Promise<LabState> {
    return { mode: 'simulation', now: new Date(await this.store.now(owner)).toISOString(), timezone: 'America/Los_Angeles',
      scenarios: SCENARIOS.map(({ id, workflow, title, description, expected }) => ({ id, workflow, title, description, expected })),
      cases: await this.store.list(owner), metrics: await this.store.metrics(owner) };
  }

  async command(owner: string, id: string, command: Command, revision?: number, hash?: string): Promise<void> {
    const now = await this.store.now(owner);
    await this.store.change(owner, id, async (c, tx) => {
      if (command === 'approve') {
        const p = c.proposal;
        if (!p || p.revision !== revision || p.hash !== hash) throw new LabError('Proposal changed. Review the current revision before approving.');
        if (c.authorization?.hash === hash) return; // A repeated click cannot enqueue another action.
        if (c.status !== 'awaiting_approval') throw new LabError('Case is not awaiting approval');
        if (now >= Date.parse(p.expiresAt) || assess(c, now) || p.contextHash !== contextHash(c)) {
          throw new LabError('Proposal expired or evidence changed. Refresh and prepare again.');
        }
        const at = new Date(now).toISOString();
        await tx.query('INSERT INTO approvals(id,owner,case_id,revision,proposal_hash,payload,approved_at) VALUES($1,$2,$3,$4,$5,$6,$7)',
          [randomUUID(), owner, id, c.revision, hash, p, at]);
        c.authorization = { revision: c.revision, hash: p.hash, at };
        c.actionKey = `${owner}:${id}:${c.revision}:${p.hash}`;
        c.status = 'queued'; c.owner = 'Benny'; c.nextRunAt = at;
        c.nextAction = 'Approved action queued; worker will recheck eligibility before sending.';
        event(c, now, 'approved', `Exact revision ${c.revision} approved. Authorization stored before execution.`);
        return;
      }
      if (command === 'cancel') {
        if (c.status === 'cancelled') return;
        if (c.providerReference || !['opportunity', 'needs_information', 'awaiting_approval', 'queued', 'blocked', 'ineligible', 'expired'].includes(c.status)) {
          throw new LabError('A submitted or potentially submitted request cannot be cancelled locally. Reconcile with the provider.');
        }
        // Blocked after a retry may still represent an uncertain external result.
        if (c.attempts > 0) throw new LabError('Prior execution requires operator reconciliation before cancellation');
        invalidate(c); c.status = 'cancelled'; c.owner = 'None'; c.nextAction = 'Cancelled before provider submission.';
        event(c, now, 'cancelled', c.nextAction); return;
      }
      if (TERMINAL.includes(c.status)) throw new LabError('This case is closed');
      if (command === 'confirm') {
        if (c.status !== 'ready' || !['refill', 'appointment'].includes(c.workflow)) throw new LabError('No pickup or visit is ready for confirmation');
        if (c.workflow === 'appointment' && now < Date.parse(c.facts.appointmentAt!)) throw new LabError('A future appointment cannot be marked attended');
        c.status = 'completed'; c.owner = 'None';
        c.outcome = c.workflow === 'refill' ? 'Participant confirmed simulated medication pickup.' : 'Participant confirmed simulated visit attendance.';
        c.nextAction = c.outcome;
        c.evidence.push({ id: randomUUID(), title: 'Fictional participant confirmation', source: 'participant', detail: c.outcome, observedAt: new Date(now).toISOString() });
        event(c, now, 'completed', c.outcome); return;
      }
      if (command === 'repair') {
        if (!['blocked', 'needs_information'].includes(c.status)) throw new LabError('No repair is needed');
        if (c.attempts > 0 && !['expired_connection', 'slot_lost', 'missing_document'].includes(c.fault)) {
          throw new LabError('Prior execution requires operator reconciliation, not a new request');
        }
        if (c.providerReference && c.fault !== 'missing_document') throw new LabError('Existing provider request requires operator review');
        c.facts.covered = true; c.facts.authorizedDependent = true; c.facts.documentsComplete = true;
        c.facts.connectionActive = true;
        // A balance shortage is not evidence that more money exists.
        if (isClaim(c) && c.facts.balanceCents < c.facts.amountCents) throw new LabError('Insufficient balance needs plan-specific resolution; simulation will not invent funds');
        if (c.fault === 'slot_lost') {
          c.facts.appointmentAt = new Date(Math.max(now + 86400000, Date.parse(c.facts.appointmentAt!) + 3600000)).toISOString();
          c.facts.serviceAt = c.facts.appointmentAt; c.facts.slotAvailable = true;
        }
        c.fault = 'none'; invalidate(c);
        c.evidence.push({ id: randomUUID(), title: 'Supplied fictional evidence / reconnected fixture', source: 'fictional_portal',
          observedAt: new Date(now).toISOString(), detail: 'Test-only repair establishes the missing rule, authority, document or connection. Any changed action needs fresh approval.' });
        event(c, now, 'evidence_updated', 'Simulated repair invalidated prior approval.'); prepare(c, now); return;
      }
      if (command === 'revise') {
        if (!['awaiting_approval', 'queued'].includes(c.status) || c.providerReference) throw new LabError('Cannot revise an executing or submitted request');
        if (c.workflow === 'appointment') {
          c.facts.appointmentAt = new Date(Date.parse(c.facts.appointmentAt!) + 3600000).toISOString();
          c.facts.serviceAt = c.facts.appointmentAt;
        } else { c.facts.amountCents += 100; }
        invalidate(c); event(c, now, 'proposal_revised', 'Fixture action changed; previous approval revoked.'); prepare(c, now); return;
      }
      if (command !== 'prepare' || c.status !== 'opportunity') throw new LabError('Command not valid in this state');
      if (c.facts.existingRequest && c.workflow === 'refill') {
        c.actionKey = `${owner}:${id}:existing`; c.status = 'queued'; c.nextRunAt = new Date(now).toISOString();
        c.nextAction = 'Observe existing fictional refill; do not submit another.';
        event(c, now, 'existing_request_found', c.nextAction);
      } else { prepare(c, now); }
    });
  }

  async tick(owner: string): Promise<void> {
    for (const candidate of await this.store.list(owner)) {
      const now = await this.store.now(owner);
      // Claiming the lease commits before the provider call. A restarted worker can reclaim it.
      const job = await this.store.change(owner, candidate.id, c => {
        if (c.status === 'awaiting_approval' && c.proposal && now >= Date.parse(c.proposal.expiresAt)) {
          invalidate(c); c.status = 'opportunity'; c.owner = 'You'; c.nextAction = 'Approval review expired. Prepare a fresh proposal.';
          event(c, now, 'approval_expired', c.nextAction);
        }
        if (!['queued', 'executing', 'reconciling', 'pending'].includes(c.status)) return;
        if (c.nextRunAt && now < Date.parse(c.nextRunAt)) return;
        if (c.leaseUntil && now < Date.parse(c.leaseUntil)) return;
        c.leaseToken = randomUUID(); c.leaseUntil = new Date(now + 30000).toISOString(); c.status = 'executing';
        return structuredClone(c);
      });
      if (!job) continue;
      const c = job;
      try {
        // Lookup comes BEFORE deadline/approval expiry: a timed-out action may already exist.
        let order = await this.provider.lookup(owner, c.actionKey!);
        if (!order) {
          const failure = assess(c, now);
          if (failure) throw new LabError(failure.reason);
          if (!c.facts.existingRequest) {
            if (!c.authorization || !c.proposal || c.authorization.revision !== c.revision || c.authorization.hash !== c.proposal.hash ||
              now >= Date.parse(c.proposal.expiresAt) || c.proposal.contextHash !== contextHash(c)) {
              throw new LabError('Authorization expired or evidence changed before execution. Prepare and approve again.');
            }
          }
          order = c.facts.existingRequest ? await this.provider.observeExisting(owner, c, now) : await this.provider.submit(owner, c, now);
        }
        await this.store.change(owner, c.id, current => {
          if (current.leaseToken !== c.leaseToken) return;
          delete current.leaseToken; delete current.leaseUntil;
          current.providerReference = order!.reference;
          if (!current.events.some(e => e.type === 'provider_accepted')) event(current, now, 'provider_accepted',
            `${order!.existing ? 'Observed existing request' : 'Provider accepted request'} ${order!.reference}. Acceptance is not completion.`);
          this.applyOutcome(current, order!, now);
        });
      } catch (e) {
        await this.store.change(owner, c.id, current => {
          if (current.leaseToken !== c.leaseToken) return;
          delete current.leaseToken; delete current.leaseUntil;
          current.attempts++;
          if (e instanceof LabError) {
            current.status = 'blocked'; current.owner = 'Operator'; current.nextAction = e.message; delete current.nextRunAt;
            if (current.fault === 'expired_connection') current.facts.connectionActive = false;
            if (current.fault === 'slot_lost') current.facts.slotAvailable = false;
          } else if (current.attempts >= 3) {
            current.status = 'blocked'; current.owner = 'Operator'; delete current.nextRunAt;
            current.nextAction = 'Provider status uncertain after 3 attempts. Operator reconciliation required; no automatic resubmission.';
          } else {
            current.status = 'reconciling'; current.owner = 'Benny';
            current.nextRunAt = new Date(now + 60000 * 2 ** (current.attempts - 1)).toISOString();
            current.nextAction = 'Response unavailable. Look up the existing action before any retry.';
          }
          event(current, now, 'execution_exception', current.nextAction);
        });
      }
    }
  }

  private applyOutcome(c: BenefitCase, order: ProviderOrder, now: number): void {
    if (now < order.readyAt) {
      c.status = 'pending'; c.owner = 'Provider'; c.nextRunAt = new Date(order.readyAt).toISOString();
      c.nextAction = 'Wait for authoritative simulated provider status; submission is not completion.'; return;
    }
    delete c.nextRunAt;
    if (order.fault === 'denial') {
      c.status = 'denied'; c.owner = 'Operator'; c.nextAction = 'Review denial reason and appeal options with the participant. No value counted.';
    } else if (order.fault === 'missing_document') {
      c.status = 'needs_information'; c.owner = 'You'; c.facts.documentsComplete = false;
      c.nextAction = 'Provider needs an additional document. Supply fictional evidence, then approve updating the existing request.';
    } else if (c.workflow === 'refill' && c.proposal?.operation === 'request_renewal') {
      c.status = 'blocked'; c.owner = 'Provider'; c.nextAction = 'Renewal request delivered. Await a licensed prescriber; this is not authorization to dispense medication.';
    } else if (c.workflow === 'appointment' || c.workflow === 'refill') {
      c.status = 'ready'; c.owner = 'You'; c.nextAction = c.workflow === 'appointment' ?
        'Appointment booked. Confirm attendance only after the scheduled time.' : 'Pharmacy reports ready. Confirm pickup before counting completion.';
    } else {
      c.status = 'completed'; c.owner = 'None';
      c.realizedCents = isClaim(c) ? order.amountCents : 0;
      c.nextAction = isClaim(c) ? `Simulated payment confirmed: $${(order.amountCents / 100).toFixed(2)}.` : 'Simulated plan confirms dependent coverage is active.';
    }
    c.outcome = c.nextAction;
    c.evidence.push({ id: randomUUID(), title: 'Simulated provider status', source: 'simulated_provider', detail: `${order.reference}: ${c.nextAction}`, observedAt: new Date(now).toISOString() });
    event(c, now, 'provider_status', c.nextAction);
  }
}
