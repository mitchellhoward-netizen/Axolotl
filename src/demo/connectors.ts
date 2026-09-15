/**
 * Benny demo — the CONNECTORS (the "act" half of the missing last mile).
 *
 * Real implementations of the production `BennyConnector` interface, driving the two
 * fictional institutions over plain HTTP. This is the same adapter boundary the real
 * product needs per provider (CVS / HealthEquity / UHC / …), except these talk to demo
 * endpoints instead of a live portal or API — so the full prepare → validate → lookup →
 * submit → follow-through loop runs for real, deterministically, with no account.
 *
 * `northstar` = coverage/claims (FSA + wellness/books reimbursement); `bright` = the
 * in-network directory (book an appointment). FICTION ONLY.
 */
import type { PersonalFact } from '../domain/personal-context.js';
import type { Action, BennyConnector, ConnectorContext, Outcome, WorkflowKind } from '../benefits/connectors.js';

const BASE = () => (process.env.DEMO_BASE_URL ?? 'http://localhost:4310').replace(/\/$/, '');
const DEMO_ORIGIN = () => new URL(BASE()).origin;

const MEMBER = 'member-maya';

function fact(facts: PersonalFact[] | undefined, subject: string): string | undefined {
  return facts?.find((f) => f.subject === subject)?.statement;
}

async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE()}${path}`, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`GET ${path} ${r.status}`);
  return (await r.json()) as T;
}
async function postJson<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE()}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new Error(`POST ${path} ${r.status}`);
  return (await r.json()) as T;
}

const inTenMinutes = () => new Date(Date.now() + 10 * 60 * 1000).toISOString();
const nowIso = () => new Date().toISOString();

function demoOAuth(id: string): Pick<BennyConnector, 'authorizationUrl' | 'exchange' | 'revoke' | 'authorizationOrigins'> {
  return {
    authorizationOrigins: [DEMO_ORIGIN()],
    authorizationUrl: ({ state, challenge }) =>
      `${DEMO_ORIGIN()}/connect/demo/${id}?state=${encodeURIComponent(state)}&challenge=${encodeURIComponent(challenge)}`,
    exchange: async () => ({
      credential: `demo-credential-${id}`, accountId: MEMBER, accountLabel: 'Maya',
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
    }),
    revoke: async () => { /* demo: nothing to revoke */ },
  };
}

interface Coverage { member: { id: string }; network: { id: string; name: string }; benefits: { preventive: { covered: boolean; costShare: string } } }
interface Provider { id: string; name: string; specialty: string; address: string; inNetwork: boolean; nextSlots: string[] }

/** Bright Pediatrics — the in-network directory + appointment booking. */
export const brightConnector: BennyConnector = {
  id: 'bright',
  label: 'Bright Pediatrics',
  validated: true,
  method: 'oauth',
  workflows: ['appointment'],
  idempotentSubmit: true,
  ...demoOAuth('bright'),

  async prepare(_ctx, input) {
    const dependent = fact(input.contextFacts, 'dependent') ?? 'your child';
    const specialty = (fact(input.contextFacts, 'specialty') ?? 'pediatrics').toLowerCase();
    const coverage = await getJson<Coverage>('/northstar/coverage/member-maya');
    const providers = await getJson<Provider[]>(`/bright/providers?specialty=${specialty}&network=${coverage.network.id}`);
    const inNetwork = providers.filter((p) => p.inNetwork);
    const pick = inNetwork[0];
    if (!pick) return { blocked: `No in-network ${specialty} found in your area.` };
    const when = pick.nextSlots[0]!;

    const action: Action = {
      operation: 'book_appointment',
      resourceKey: `${MEMBER}|${pick.id}|${when}`,
      destination: 'Bright Pediatrics',
      subject: `In-network ${specialty} for ${dependent}`,
      summary: `${pick.name}, ${when} at ${pick.address}.`,
      amountCents: 0,
      disclosures: [
        `${coverage.benefits.preventive.costShare} preventive visit (your plan's in-network rate).`,
        'Booking an appointment — this does not submit a claim or charge you now.',
      ],
      payload: { providerId: pick.id, dependentId: fact(input.contextFacts, 'dependentId') ?? dependent, when },
      evidence: [
        { source: 'coverage', detail: `Network: ${coverage.network.name}`, observedAt: nowIso() },
        { source: 'directory', detail: `${pick.name} is in-network`, observedAt: nowIso() },
      ],
      expiresAt: inTenMinutes(),
    };
    return { action };
  },

  async validate(_ctx, action) {
    const providers = await getJson<Provider[]>('/bright/providers?specialty=pediatrics&network=bright-net');
    const p = providers.find((x) => x.id === (action.payload as { providerId?: string }).providerId);
    return Boolean(p?.inNetwork);
  },

  async lookup(_ctx, key) {
    const ref = key.replace(/^bright:/, '');
    const appt = await getJson<{ confirmationId: string; status: string; providerName: string; when: string }>(`/bright/appointments/${ref}`).catch(() => undefined);
    if (!appt) return { kind: 'absent' };
    const outcome: Outcome = {
      state: appt.status === 'confirmed' ? 'submitted' : 'completed',
      reference: appt.confirmationId, detail: `Appointment confirmed: ${appt.providerName}, ${appt.when}.`,
      evidence: `Confirmation ${appt.confirmationId}`, observedAt: nowIso(), realizedCents: 0,
    };
    return { kind: 'found', outcome };
  },

  async submit(_ctx, action) {
    const payload = action.payload as { providerId: string; dependentId: string; when: string };
    const appt = await postJson<{ confirmationId: string; providerName: string; when: string; status: string }>('/bright/book', {
      providerId: payload.providerId, dependentId: payload.dependentId, when: payload.when, idempotencyKey: action.resourceKey,
    });
    return {
      state: 'submitted', reference: appt.confirmationId, detail: `Booked ${appt.providerName}, ${appt.when}.`,
      evidence: `Confirmation ${appt.confirmationId}`, observedAt: nowIso(), realizedCents: 0,
    };
  },
};

/** Northstar Benefits — FSA + wellness/books reimbursement (submit_claim). */
export const northstarConnector: BennyConnector = {
  id: 'northstar',
  label: 'Northstar Benefits',
  validated: true,
  method: 'oauth',
  workflows: ['reimbursement', 'fsa'],
  idempotentSubmit: true,
  ...demoOAuth('northstar'),

  async prepare(_ctx, input) {
    // The demo harness encodes the concrete claim as a `claim` fact:
    // statement = "category|amountCents|description".
    const claim = fact(input.contextFacts, 'claim');
    if (!claim) return { blocked: 'Nothing concrete to reimburse yet.' };
    const [category = '', amountCentsStr = '0', description = ''] = claim.split('|');
    const amountCents = Number(amountCentsStr ?? 0);
    const action: Action = {
      operation: 'submit_claim',
      resourceKey: `${MEMBER}|${category}|${amountCents}|${description}`,
      destination: 'Northstar Benefits',
      subject: category === 'wellness-books' ? 'Wellness: books stipend' : `FSA claim — ${description}`,
      summary: category === 'wellness-books'
        ? `Reimburse ${description} against your monthly books stipend.`
        : `Submit ${description} for FSA reimbursement.`,
      amountCents,
      disclosures: [
        category === 'wellness-books'
          ? 'Covered by your wellness books stipend; no cost to you if within the monthly limit.'
          : 'Uses your FSA balance (use-it-or-lose-it); this is a claim, not a charge.',
        `Amount: $${(amountCents / 100).toFixed(2)}`,
      ],
      payload: { category, amountCents, description, memberId: MEMBER },
      evidence: [{ source: 'receipt', detail: description || category, observedAt: nowIso() }],
      expiresAt: inTenMinutes(),
    };
    return { action };
  },

  async validate(_ctx, action) {
    const p = action.payload as { category: string; amountCents: number };
    return p.category.length > 0 && Number.isFinite(p.amountCents) && p.amountCents > 0;
  },

  async lookup(_ctx, key) {
    const ref = key.replace(/^northstar:/, '');
    const c = await getJson<{ reference: string; status: 'submitted' | 'paid'; amountCents: number; category: string }>(`/northstar/claims/${ref}`).catch(() => undefined);
    if (!c) return { kind: 'absent' };
    const outcome: Outcome = {
      state: c.status === 'paid' ? 'completed' : 'submitted',
      reference: c.reference, detail: `${c.category} claim ${c.status}.`,
      evidence: `Claim ${c.reference}`, observedAt: nowIso(), realizedCents: c.status === 'paid' ? c.amountCents : 0,
    };
    return { kind: 'found', outcome };
  },

  async submit(_ctx, action) {
    const p = action.payload as { category: string; amountCents: number; description: string; memberId: string };
    const c = await postJson<{ reference: string; status: 'submitted'; amountCents: number; category: string }>('/northstar/claims', {
      memberId: p.memberId, category: p.category, amountCents: p.amountCents, description: p.description, idempotencyKey: action.resourceKey,
    });
    return {
      state: 'submitted', reference: c.reference, detail: `${c.category} claim submitted (${c.reference}).`,
      evidence: `Claim ${c.reference}`, observedAt: nowIso(), realizedCents: 0,
    };
  },
};

/** The demo connector set — register these into the runtime (or use directly). */
export const demoConnectors: BennyConnector[] = [brightConnector, northstarConnector];
export const workflowOf: Record<string, WorkflowKind> = { bright: 'appointment', northstar: 'reimbursement' };
