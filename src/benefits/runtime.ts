import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { actionSchema, outcomeSchema, PORTALS, portalIn, workflowIn,
  type Action, type BennyConnector, type Outcome, type WorkflowKind } from './connectors.js';
import { BennyStore } from './runtime-store.js';
import { documentDigest, documentSummary, extractDocument, reviewDocuments, type DocumentReview } from './documents.js';
import { emptyPersonalContext, extendPersonalCase, openPersonalCase, personalView, rememberFact, requireReadyStep, type PersonalContext } from '../domain/personal-context.js';
import { isPersonalControl, personalCommand, personalPlanSchema, personalTaskInput, type PersonalPlan, type PersonalPlanner } from '../agent/personal.js';
import type { PortalAccess, PortalState } from './portal-access.js';

type TaskStatus = 'needs_information' | 'manual_handoff' | 'reading_documents' | 'preparing' | 'awaiting_approval' | 'queued' |
  'executing' | 'reconciling' | Outcome['state'] | 'cancelled';
interface Lease { token: string; until: number }
export interface Task {
  id: string; workflow: WorkflowKind; provider?: string; request: string;
  caseId?: string; stepId?: string; factIds?: string[];
  revision: number; status: TaskStatus; detail: string; documents: string[];
  documentReview?: DocumentReview;
  proposal?: { action: Action; hash: string; code: string; connection: string; accountId: string; expiresAt: number };
  approval?: { hash: string; at: number };
  actionKey?: string; attempts: number; failures: number; nextRunAt?: number;
  lease?: Lease; outcome?: Outcome; createdAt: number;
  handoff?: { at: number; report?: { text: string; messageId: string; at: number } };
  followupAt?: number;
  events: Array<{ at: number; type: string; detail: string }>;
}
interface Connection {
  generation: string; status: 'awaiting_login' | 'awaiting_verification' | 'awaiting_confirmation' | 'active' | 'expired' | 'revoked';
  expiresAt: number; credential?: string; accountId?: string; accountLabel?: string; code?: string; confirmBy?: number;
  browser?: PortalState;
}
interface Outbox {
  id: string; text: string; proactive: boolean; attempts: number; nextRunAt: number;
  lease?: Lease;
  /** Drop an obsolete approval/link rather than sending a stale prompt. */
  guard?: { task?: string; hash?: string; revision?: number; enrollment?: boolean; followupTask?: string; provider?: string; generation?: string; connectionStatus?: Connection['status'] };
}
export interface Account {
  sender: string; space: string; line: string; paused: boolean;
  personal?: PersonalContext;
  pilot?: { noticeVersion: string; acceptedAt?: number };
  feedback?: Array<{ text: string; at: number; messageId: string }>;
  tasks: Task[]; connections: Record<string, Connection>; outbox: Outbox[];
  attachTo?: string;
  revocations: Array<{ id: string; provider: string; credential: string; browser?: boolean; nextRunAt: number; lease?: Lease }>;
}
interface Link { provider: string; generation: string; verifier: string }
export interface Inbound {
  id: string; sender: string; space: string; line: string;
  text?: string;
  attachment?: { task: string; revision: number; mimeType: string; bytes: Buffer };
  notice?: string;
}
export const HELP = "I'm Benny. Tell me one family, school or work-benefits task you want help finishing. I can remember context, draft messages, organize documents when intake is enabled, and track your next step. Portal access is limited; nothing is submitted without a separate exact approval.\n\nCASES / CONTEXT: see shared memory. STATUS: see tasks. HANDOFF task: take over a provider step. REPORT task update: record what happened, not verified completion. FOLLOWUP task ISO-timestamp: request an iMessage check-in with an explicit timezone. FEEDBACK comment: save pilot feedback, not live support.\n\nOther commands: CONNECTIONS, CONNECT provider, PREPARE task, UPDATE task details, ATTACH task, DOCUMENTS task, READ task, REMOVE task document-id, CANCEL task, DISCONNECT provider. STOP pauses background work and updates; START resumes. Never send passwords or security codes.";
export const PILOT_VERSION = '2026-09-15';
export const PILOT_NOTICE = "Welcome to Axolotl’s invitation-only life/benefits pilot. These tools extend your existing school conversation; they do not replace it. I can organize a task, draft a next step and track updates. Portal access is limited; I’ll say when you need to finish a step yourself. This is not medical advice or an emergency service.\n\nLife-work records are encrypted in a separate store. Ordinary conversation and school profiles still use the existing school service’s storage and configured AI providers; this is not an isolated health-data channel. School information may be reused after you join. iMessage passes through our messaging provider. Don’t send passwords, security codes, government IDs or medical details; health and document integrations require separate review. STOP pauses life work and background updates, but does not delete records or undo actions already sent.\n\nReply JOIN PILOT to accept and begin, or STOP. Joining never approves a submission. Send FEEDBACK followed by your comment during testing; feedback is stored, not a live support channel.";
const code = () => randomBytes(4).toString('hex').toUpperCase();
const final = (t: Task) => ['completed', 'denied', 'cancelled'].includes(t.status);
const pending = (t: Task) => ['submitted', 'pending', 'reconciling', 'executing', 'queued'].includes(t.status);
const label = (id: string) => PORTALS.find(p => p.id === id)?.label ?? id;

function note(t: Task, now: number, type: string, detail: string): void {
  t.detail = detail; t.events.push({ at: now, type, detail });
}
export function enqueue(a: Account, text: string, now: number, proactive = false, guard?: Outbox['guard']): void {
  a.outbox.push({ id: randomUUID(), text, proactive, attempts: 0, nextRunAt: now, guard });
}
function invalidate(t: Task): void {
  t.revision++; delete t.proposal; delete t.approval; delete t.actionKey; delete t.lease; delete t.nextRunAt;
}
function taskSummary(t: Task): string {
  return `${t.id} · ${t.workflow} · ${t.provider ? label(t.provider) : 'provider needed'}\n${t.status.replaceAll('_', ' ')}: ${t.detail}`;
}
function review(t: Task): string {
  const p = t.proposal!;
  const a = p.action;
  return `Review ${t.id}, revision ${t.revision}. Nothing submitted.\n${a.summary}\nAction: ${a.operation}\nTo: ${a.destination}\nFor: ${a.subject}\nAmount: $${(a.amountCents / 100).toFixed(2)}\nShared: ${a.disclosures.join('; ')}\n${a.deadline ? `Filing/action deadline: ${a.deadline}\n` : ''}Approval expires: ${new Date(p.expiresAt).toISOString()}\nEvidence: ${a.evidence.map(e => `${e.source}: ${e.detail}`).join('; ')}\n\nReply YES ${p.code} to approve only this action, or NO ${p.code}. Changes require a new approval.`;
}

export class BennyRuntime {
  private readonly connectors: Map<string, BennyConnector>;
  readonly redirectUri: string;
  personalPlanner?: PersonalPlanner;
  seedPersonalContext?: (sender: string) => Promise<PersonalContext>;
  requireEnrollment = false;
  portalAccess?: PortalAccess;
  constructor(readonly store: BennyStore, connectors: BennyConnector[], origin: string,
    readonly now = Date.now, readonly accessAllowed: (sender: string) => boolean = () => true) {
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new Error('BENNY_PUBLIC_ORIGIN must be an HTTPS origin');
    }
    this.redirectUri = `${url.origin}/benny/callback`;
    this.connectors = new Map();
    for (const c of connectors) {
      if (this.connectors.has(c.id) || !PORTALS.some(p => p.id === c.id)) throw new Error('Invalid connector registration');
      if (c.validated) this.connectors.set(c.id, c);
    }
  }
  owner(sender: string): string { return this.store.vault.hash(`imessage:${sender}`); }
  get connectorIds(): string[] { return [...this.connectors.keys()]; }
  enrolled(account: Account | undefined): boolean {
    return !this.requireEnrollment || (account?.pilot?.noticeVersion === PILOT_VERSION && account.pilot.acceptedAt !== undefined);
  }

  /** Inbox marker, state and reply commit together; no best-effort persistence. */
  async receive(input: Inbound): Promise<void> {
    if (!input.id || !input.sender || !input.space || !input.line) throw new Error('Missing message identity');
    if (!this.accessAllowed(input.sender)) throw new Error('Sender no longer allowed');
    const owner = this.owner(input.sender);
    await this.store.change(owner, { sender: input.sender, space: input.space, line: input.line, paused: false,
      tasks: [], connections: {}, outbox: [], revocations: [] }, async (a, tx) => {
      const inserted = await tx.query('INSERT INTO inbox(owner,message_hash) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING message_hash',
        [owner, this.store.vault.hash(`message:${input.id}`)]);
      if (!inserted.rows.length) return;
      a.space = input.space; a.line = input.line;
      const text = input.text?.trim() ?? '';
      if (!this.enrolled(a) && !/^stop$/i.test(text)) {
        if (/^join pilot$/i.test(text) && a.pilot?.noticeVersion === PILOT_VERSION) {
          a.pilot.acceptedAt = this.now();
          enqueue(a, `You’re in. Tell me one real task you want help finishing. Share only the minimum details; no passwords or medical details.${a.paused ? ' Background work remains paused; START resumes it.' : ''}`, this.now());
        } else {
          a.pilot = { noticeVersion: PILOT_VERSION };
          enqueue(a, PILOT_NOTICE, this.now(), false, { enrollment: true });
        }
        return; // no model, school import, raw message history or attachment storage before acceptance
      }
      if (this.personalPlanner && text && text.length <= 6000 && !input.notice && !input.attachment && !isPersonalControl(text)) {
        if (!a.personal) a.personal = await this.seedPersonalContext?.(a.sender) ?? emptyPersonalContext();
        await this.converse(a, tx, input, text); return;
      }
      await this.handleInput(a, tx, input);
    });
  }

  private async handleInput(a: Account, tx: PoolClient, input: Inbound): Promise<void> {
      const owner = this.owner(input.sender);
      const now = this.now();
      if (input.notice) { enqueue(a, input.notice, now); return; }
      if (input.attachment) { await this.attach(owner, a, input.attachment, tx); return; }
      const text = input.text?.trim() ?? '';
      if (!text || text.length > 6000) {
        enqueue(a, 'Please send a text of at most 6,000 characters, or attach a JPEG, PNG or PDF after ATTACH task.', now); return;
      }
      if (/^stop$/i.test(text)) {
        a.paused = true;
        a.outbox = a.outbox.filter(m => m.lease || m.guard?.followupTask); // retain paused reminders; cannot retract in-flight sends
        enqueue(a, 'Paused background work and updates. An action already sent may still finish at the provider. STATUS is available; START resumes. DISCONNECT provider also removes Benny’s account access.', now, false, { enrollment: true }); return;
      }
      if (/^start$/i.test(text)) { a.paused = false; enqueue(a, 'Background work and updates resumed. Expired approvals still require a fresh review.', now); return; }
      if (/^join pilot$/i.test(text)) { enqueue(a, 'You have already joined. Tell me what you want help finishing, or send HELP.', now); return; }
      if (/^feedback(?:\s|$)/i.test(text)) {
        const feedback = text.replace(/^feedback\s*/i, '').trim();
        if (!feedback || feedback.length > 1500) { enqueue(a, 'Send FEEDBACK followed by 1–1,500 characters. Do not include sensitive details.', now); return; }
        if ((a.feedback?.length ?? 0) >= 100) { enqueue(a, 'This pilot’s feedback limit is reached. Please contact the person who invited you.', now); return; }
        (a.feedback ??= []).push({ text: feedback, at: now, messageId: input.id });
        enqueue(a, 'Feedback saved for review. No live support agent has been notified. For urgent help, contact the appropriate provider directly.', now); return;
      }
      if (/^(context|cases)$/i.test(text)) {
        const view = personalView(a.personal ?? emptyPersonalContext(), a.tasks, now);
        enqueue(a, /^context$/i.test(text) ? JSON.stringify(view, null, 2) : JSON.stringify(view.cases, null, 2), now); return;
      }
      if (/^(help|hi|hello|hey|benny)$/i.test(text)) { enqueue(a, HELP, now); return; }
      if (/^connections$/i.test(text)) {
        enqueue(a, PORTALS.map(p => `${p.label}: ${a.connections[p.id]?.status ?? (this.connectors.has(p.id) ? 'available to connect' : this.portalAccess?.readPortalIds.includes(p.id) ? 'configured browser reads only' : this.portalAccess?.policies.has(p.id) ? 'sign-in-only setup; no automated reads or actions' : 'not enabled')}`).join('\n'), now); return;
      }
      if (/^status$/i.test(text)) {
        enqueue(a, `${a.paused ? 'Background work is paused.\n' : ''}${a.tasks.length ? a.tasks.slice(-10).map(taskSummary).join('\n\n') : 'No tasks yet. Tell me what you need and which provider you use.'}`, now); return;
      }
      const confirmation = text.match(/^CONNECT ([A-F0-9]{8})$/i);
      if (confirmation) {
        const entry = Object.entries(a.connections).find(([, c]) => c.code === confirmation[1]!.toUpperCase());
        if (!entry || entry[1].status !== 'awaiting_confirmation' || now >= entry[1].confirmBy! || now >= entry[1].expiresAt) {
          enqueue(a, 'That connection confirmation is not active. Request a fresh CONNECT provider link.', now); return;
        }
        const [provider, c] = entry;
        c.status = 'active'; delete c.code; delete c.confirmBy;
        if (c.browser) {
          enqueue(a, `${label(provider)} browser account confirmed. CHECK ${provider} reads only the configured fields, after rechecking the account. Automated writes are not enabled. DISCONNECT ${provider} removes saved access.`, now); return;
        }
        enqueue(a, `${label(provider)} connected. This permits preparing and checking tasks, not submitting them. Use PREPARE task when ready. DISCONNECT ${provider} revokes access.`, now); return;
      }
      const check = text.match(/^CHECK (.+)$/i);
      if (check) {
        const provider = PORTALS.find(p => p.id === check[1]!.toLowerCase())?.id ?? portalIn(check[1]!);
        if (!provider || !this.portalAccess?.policies.has(provider)) { enqueue(a, 'No configured browser read is enabled for that provider. Send CONNECTIONS.', now); return; }
        this.portalAccess.requestCheck(a, provider); return;
      }
      const connect = text.match(/^(CONNECT|DISCONNECT) (.+)$/i);
      if (connect) {
        const provider = PORTALS.find(p => p.id === connect[2]!.toLowerCase())?.id ?? portalIn(connect[2]!);
        if (!provider) { enqueue(a, 'Name one provider. Send CONNECTIONS for the supported inventory.', now); return; }
        if (connect[1]!.toUpperCase() === 'DISCONNECT') {
          this.disconnect(a, provider, now);
          enqueue(a, `${label(provider)} access disabled in Benny. Remote revocation will be attempted if credentials exist. Requests already sent cannot be undone here.`, now); return;
        }
        const connector = this.connectors.get(provider);
        if (!connector && this.portalAccess?.policies.has(provider)) {
          if (a.paused) { enqueue(a, 'START before opening a browser sign-in.', now); return; }
          if (a.connections[provider]?.status === 'active') { enqueue(a, `Already connected. CHECK ${provider} requests a read; DISCONNECT first to link another account.`, now); return; }
          if (a.connections[provider]) this.disconnect(a, provider, now);
          await this.portalAccess.begin(a, tx, provider); return;
        }
        if (!connector) {
          enqueue(a, `${label(provider)} is not enabled for live access. No account was connected. I can keep your task here, but cannot sign in or submit to this provider yet.`, now); return;
        }
        if (a.connections[provider]?.status === 'active') {
          enqueue(a, 'This provider is already connected. DISCONNECT it before linking a different account.', now); return;
        }
        const existing = a.connections[provider];
        if (existing?.credential) this.disconnect(a, provider, now);
        const state = randomBytes(32).toString('base64url');
        const verifier = randomBytes(32).toString('base64url');
        const generation = randomUUID();
        const expiresAt = now + 10 * 60_000;
        const target = new URL(connector.authorizationUrl({ state,
          challenge: createHash('sha256').update(verifier).digest('base64url'), redirectUri: this.redirectUri }));
        if (target.protocol !== 'https:' || target.username || target.password || !connector.authorizationOrigins.includes(target.origin)) {
          throw new Error('Connector returned an untrusted authorization origin');
        }
        a.connections[provider] = { generation, status: 'awaiting_login', expiresAt };
        const hash = this.store.vault.hash(`link:${state}`);
        await tx.query('INSERT INTO links(token_hash,owner,expires_at,sealed) VALUES($1,$2,$3,$4)',
          [hash, owner, expiresAt, this.store.vault.seal({ provider, generation, verifier }, `link:${hash}`)]);
        enqueue(a, `Connect ${connector.label} using this private, 10-minute link:\n${target.href}\nSign in only on the provider’s secure page. Return here to confirm the account before Benny can use it. Never text credentials.`, now,
          false, { provider, generation, connectionStatus: 'awaiting_login' }); return;
      }
      const approval = text.match(/^(YES|NO) ([A-F0-9]{8})$/i);
      if (approval) {
        const t = a.tasks.find(t => t.proposal?.code === approval[2]!.toUpperCase());
        if (!t || t.status !== 'awaiting_approval') { enqueue(a, 'No current proposal matches that code. Send STATUS to review your tasks.', now); return; }
        if (approval[1]!.toUpperCase() === 'NO') {
          invalidate(t); t.status = 'cancelled'; note(t, now, 'cancelled', 'Cancelled before submission.');
        } else {
          const p = t.proposal!;
          const c = a.connections[t.provider!];
          if (a.paused || now >= p.expiresAt || c?.status !== 'active' || c.generation !== p.connection || now >= c.expiresAt) {
            enqueue(a, 'Approval not accepted: work is paused, the review expired, or the connection changed. START or reconnect as needed, then PREPARE the task again.', now); return;
          }
          if (!this.contextReady(a, t)) {
            enqueue(a, 'Approval not accepted: a case dependency or supporting fact needs review. Check CASES and CONTEXT.', now); return;
          }
          if (a.tasks.some(other => other.id !== t.id && other.provider === t.provider &&
            (other.attempts > 0 || other.approval) && other.status !== 'cancelled' &&
            other.proposal?.action.operation === p.action.operation && other.proposal.action.resourceKey === p.action.resourceKey)) {
            enqueue(a, 'Another task already has approval or a provider attempt for this same expense/request. Check STATUS; I will not submit it twice.', now); return;
          }
          t.approval = { hash: p.hash, at: now }; t.actionKey = `${owner}:${t.id}:${t.revision}:${p.hash}`;
          t.status = 'queued'; t.nextRunAt = now;
          note(t, now, 'approved', 'Exact action approved and queued. Not yet submitted.');
        }
        enqueue(a, taskSummary(t), now); return;
      }
      if (/^(yes|no)\b/i.test(text)) {
        enqueue(a, 'Nothing approved. Reply with the exact YES code from a current proposal, or send STATUS.', now); return;
      }
      const command = text.match(/^(PREPARE|UPDATE|ATTACH|CANCEL|STATUS|RETRY|DOCUMENTS|READ|REMOVE|HANDOFF|REPORT|FOLLOWUP) ([A-F0-9]{8})(?:\s+([\s\S]+))?$/i);
      if (command) {
        const t = a.tasks.find(t => t.id === command[2]!.toUpperCase());
        if (!t) { enqueue(a, 'Task not found in this conversation.', now); return; }
        const verb = command[1]!.toUpperCase();
        if (verb === 'FOLLOWUP') {
          const parsed = z.iso.datetime({ offset: true, precision: 0 }).safeParse(command[3]);
          const at = parsed.success ? Date.parse(parsed.data) : NaN;
          if (final(t) || a.paused || !Number.isFinite(at) || at <= now || at > now + 366 * 86_400_000) {
            enqueue(a, 'Choose a future follow-up within a year, with an explicit timezone, for an open task while START is active. Format: FOLLOWUP task 2026-09-18T09:00:00-07:00.', now); return;
          }
          t.followupAt = at;
          a.outbox = a.outbox.filter(m => m.lease || m.guard?.followupTask !== t.id);
          enqueue(a, `Follow-up saved for ${new Date(at).toISOString()} on ${t.id}. I’ll ask for an update here; this is not a verified filing deadline. STOP pauses it.`, now); return;
        }
        if (verb === 'DOCUMENTS') {
          enqueue(a, t.documentReview ? documentSummary(t.documentReview) : `${t.documents.length} documents stored:\n${t.documents.join('\n')}\n${t.status === 'reading_documents' ? 'Local review is queued.' : `Send READ ${t.id} to review them.`}`,
            now, false, { task: t.id, revision: t.revision }); return;
        }
        if (verb === 'STATUS') {
          enqueue(a, t.status === 'awaiting_approval' ? review(t) : taskSummary(t), now, false,
            t.status === 'awaiting_approval' ? { task: t.id, hash: t.proposal!.hash } : undefined); return;
        }
        if (verb === 'RETRY' && t.actionKey && t.attempts > 0 && !final(t)) {
          t.status = 'reconciling'; t.nextRunAt = now; t.failures = 0;
          enqueue(a, 'Queued a provider-status check. This does not authorize a new submission.', now); return;
        }
        if (t.attempts > 0 || t.status === 'executing' || final(t)) {
          enqueue(a, 'This task may already have been sent or is closed. I will not edit, cancel or resubmit it locally. Use STATUS or RETRY for an unresolved request.', now); return;
        }
        if (verb === 'HANDOFF' || verb === 'REPORT') {
          if (verb === 'REPORT' && (!command[3] || command[3].length > 1500)) {
            enqueue(a, 'Send REPORT task followed by your update, at most 1,500 characters. Do not include account credentials or medical details.', now); return;
          }
          invalidate(t); t.handoff ??= { at: now }; t.status = 'manual_handoff';
          if (verb === 'REPORT') {
            t.handoff.report = { text: command[3]!, messageId: input.id, at: now };
            note(t, now, 'person_report', `Your update: ${command[3]}. Not independently verified; no payment or completion inferred.`);
            enqueue(a, taskSummary(t), now); return;
          }
          note(t, now, 'manual_handoff', 'You handle the provider step; automatic submission on this task is disabled. Nothing sent by Benny.');
          enqueue(a, `Your handoff for ${t.id} — ${t.provider ? label(t.provider) : 'provider not yet identified'}\nRequest: ${t.request}\n\n${t.documents.length} source documents are stored on this task. Keep your originals for the provider; I have not uploaded them.\n${t.documentReview ? 'Send DOCUMENTS ' + t.id + ' for extracted fields, source references and unresolved questions.' : 'No source review is available yet. Requirements and eligibility remain unverified.'}\n\nNext: use the provider’s official app/site or contact them. Confirm the applicable plan, deadline, dependent authority and whether this request already exists before submitting. Do not submit twice.\n\nSend REPORT ${t.id} with what happened (requested, submitted, denied, or paid). These are your reports, not provider verification. Ask me to draft the next message or set a follow-up.`, now, false, { task: t.id, revision: t.revision }); return;
        }
        if (verb === 'CANCEL') {
          invalidate(t); delete t.followupAt; t.status = 'cancelled';
          note(t, now, 'cancelled', t.handoff ? 'Local tracking closed. This does not cancel anything you sent to the provider.' : 'Cancelled before submission.');
        } else if (verb === 'READ' || verb === 'REMOVE') {
          if (verb === 'REMOVE') {
            const id = t.documents.find(id => id === command[3]?.toLowerCase());
            if (!id) { enqueue(a, `Copy the exact document ID from DOCUMENTS ${t.id}.`, now); return; }
            await tx.query('DELETE FROM documents WHERE owner=$1 AND id=$2', [owner, id]);
            t.documents = t.documents.filter(d => d !== id);
          }
          invalidate(t); delete t.documentReview;
          t.status = t.documents.length ? 'reading_documents' : 'needs_information';
          if (t.documents.length) t.nextRunAt = now;
          note(t, now, 'document_review_requested', t.documents.length ? 'Local document review queued. No provider access or submission.' : 'No documents remain on this task.');
        } else if (verb === 'ATTACH') {
          a.attachTo = t.id;
          enqueue(a, `Send one JPEG, PNG or PDF receipt/document for ${t.id}, at most 5 MiB. It will be stored for this task, not submitted. Do not send passwords.`, now); return;
        } else if (verb === 'UPDATE') {
          if (!command[3]) { enqueue(a, 'Add the new details after UPDATE task.', now); return; }
          invalidate(t); t.request = command[3]; t.provider = portalIn(command[3]) ?? t.provider;
          t.factIds = t.factIds?.map(id => {
            let next = a.personal?.facts.find(f => f.supersedes === id);
            while (next) { id = next.id; next = a.personal?.facts.find(f => f.supersedes === id); }
            return id;
          });
          t.status = 'needs_information'; note(t, now, 'updated', 'Details updated. PREPARE this task for a new review.');
        } else if (verb === 'PREPARE') {
          if (t.handoff) {
            enqueue(a, 'This task is being handled by you. Automatic submission stays disabled to avoid duplicates. Send REPORT with the task ID and your update.', now); return;
          }
          if (!this.contextReady(a, t)) {
            enqueue(a, 'Cannot prepare: finish the preceding case steps or update stale supporting facts and task details. Check CASES and CONTEXT. Nothing sent.', now); return;
          }
          if (t.documents.length && (!t.documentReview || t.documentReview.issues.length)) {
            enqueue(a, `Review the documents first: DOCUMENTS ${t.id}. Resolve unreadable, ambiguous or conflicting sources, then READ ${t.id}. Nothing sent to a provider.`, now); return;
          }
          const connector = t.provider && this.connectors.get(t.provider);
          const c = t.provider && a.connections[t.provider];
          if (a.paused || !connector || !connector.workflows.includes(t.workflow) || !c || c.status !== 'active' || now >= c.expiresAt) {
            enqueue(a, 'Cannot prepare yet. Check CONNECTIONS, connect a validated provider for this task, and START if paused. No action has been sent.', now); return;
          }
          invalidate(t); t.status = 'preparing'; t.nextRunAt = now; t.failures = 0;
          note(t, now, 'preparation_requested', 'Checking source evidence and preparing a review. Nothing submitted.');
        } else { enqueue(a, 'There is no unresolved provider request to retry.', now); return; }
        enqueue(a, taskSummary(t), now); return;
      }
      if (this.personalPlanner) { enqueue(a, 'That command is not recognized. You can describe what you need, or use CASES, CONTEXT, STATUS, or an exact task command.', now); return; }
      const workflow = workflowIn(text);
      if (!workflow) { enqueue(a, HELP, now); return; }
      this.addTask(a, { workflow, request: text, provider: portalIn(text) });
  }

  private addTask(a: Account, input: Pick<Task, 'workflow' | 'request' | 'provider' | 'caseId' | 'stepId' | 'factIds'>): boolean {
      const now = this.now();
      if (a.tasks.filter(t => !final(t)).length >= 30) {
        enqueue(a, 'You have 30 open tasks. Send STATUS and finish or cancel one before opening another.', now); return false;
      }
      const t: Task = { ...input, id: code(), revision: 1,
        status: 'needs_information', detail: 'Saved your request; eligibility and provider access have not been verified.',
        documents: [], attempts: 0, failures: 0, createdAt: now, events: [] };
      a.tasks.push(t);
      enqueue(a, `${taskSummary(t)}\n\n${t.provider && this.connectors.has(t.provider) ? `Send CONNECT ${t.provider} to check access.` : `No live connection is enabled for this provider. Send HANDOFF ${t.id} for a next-step checklist; I can help you draft it and track your updates.`} Document intake, when enabled, starts with ATTACH ${t.id}.`, now);
      return true;
  }

  private contextReady(a: Account, t: Task): boolean {
    try {
      if (t.caseId || t.stepId) requireReadyStep(a.personal, a.tasks, t.caseId ?? '', t.stepId ?? '');
      const active = personalView(a.personal ?? emptyPersonalContext(), a.tasks, this.now()).facts;
      return !t.factIds?.some(id => !active.some(f => f.id === id));
    } catch { return false; }
  }

  /** One planner and one encrypted memory for every domain. No school/benefits
   * classifier and no forwarding private turns to legacy transcript storage. */
  private async converse(a: Account, tx: PoolClient, input: Inbound, text: string): Promise<void> {
    const now = this.now();
    const plan = personalPlanSchema.parse(await this.personalPlanner!(text, structuredClone(a), now, [...this.connectors.keys()], this.portalAccess?.readPortalIds ?? []));
    await this.applyPlan(a, tx, input, text, plan);
  }

  /** The existing school brain can plan work, never fabricate human approvals.
   * At most one committed plan per original inbound message, independent of SDK
   * dedupe. A failed transaction remains retryable; repeated tool calls are not. */
  async plan(input: Inbound, raw: unknown): Promise<boolean> {
    if (!input.id || !input.sender || !input.space || !input.line || !this.accessAllowed(input.sender)) throw new Error('Life tools unavailable');
    const plan = personalPlanSchema.parse(raw);
    const owner = this.owner(input.sender);
    return this.store.change(owner, undefined, async (a, tx) => {
      if (!this.enrolled(a) || a.paused || a.sender !== input.sender) throw new Error('Join the pilot and START before planning work');
      const inserted = await tx.query('INSERT INTO inbox(owner,message_hash) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING message_hash',
        [owner, this.store.vault.hash(`life-plan:${input.id}`)]);
      if (!inserted.rows.length) return false;
      a.space = input.space; a.line = input.line;
      if (!a.personal) a.personal = await this.seedPersonalContext?.(a.sender) ?? emptyPersonalContext();
      await this.applyPlan(a, tx, input, input.text ?? '', plan);
      return true;
    });
  }

  private async applyPlan(a: Account, tx: PoolClient, input: Inbound, text: string, plan: PersonalPlan): Promise<void> {
    const now = this.now();
    const personal = a.personal ??= emptyPersonalContext();
    const receipts: string[] = [];
    for (const raw of plan.facts) {
      const fact = rememberFact(personal, raw, input.id, now);
      receipts.push(`Remembered (${fact.source.kind}): ${fact.subject} — ${fact.statement}`);
      if (fact.supersedes) for (const t of a.tasks.filter(t => t.factIds?.includes(fact.supersedes!))) {
        if (t.attempts || t.status === 'executing') {
          receipts.push(`${t.id}: an earlier version may already have been sent. Check its status; this correction cannot undo it.`);
        } else if (!final(t)) {
          invalidate(t); t.status = 'needs_information';
          note(t, now, 'context_changed', 'A supporting fact changed. Update the task with current details before preparing it again.');
        }
      }
    }
    for (const raw of plan.newCases) {
      const c = openPersonalCase(personal, raw, input.id, now);
      receipts.push(`Tracking: ${c.goal}\nCase: ${c.id}\n${c.steps.map(s => `${s.domain}: ${s.goal}`).join('\n')}`);
    }
    for (const extension of plan.extendCases) {
      const c = extendPersonalCase(personal, extension.caseId, extension.steps);
      receipts.push(`Added steps to the same case: ${c.goal}. No action submitted.`);
    }
    for (const report of plan.reports) {
      const step = personal.cases.find(c => c.id === report.caseId)?.steps.find(s => s.id === report.stepId);
      if (!step) throw new Error('Case step unavailable');
      step.report = { text: report.text, messageId: input.id, at: new Date(now).toISOString() };
      receipts.push(`Recorded your update for ${step.goal}; not independently verified.`);
    }
    // History stores conversation, not executor responses containing codes/links.
    personal.history.push({ role: 'user', content: text });
    if (plan.action?.kind === 'task') {
      const t = personalTaskInput.parse(plan.action.task);
      const c = personal.cases.find(c => c.id === t.caseId);
      const step = c?.steps.find(s => s.id === t.stepId);
      const domain = ['appointment', 'refill'].includes(t.workflow) ? 'healthcare' : 'benefits';
      if (!step || step.domain !== domain) throw new Error('Wrong case step for task');
      if (a.tasks.some(existing => existing.caseId === t.caseId && existing.stepId === t.stepId)) throw new Error('Case step already has a task');
      const available = personalView(personal, a.tasks, now).facts;
      if (t.factIds.some(id => !available.some(f => f.id === id))) throw new Error('Fact unavailable');
      const added = this.addTask(a, t);
      personal.history.push({ role: 'assistant', content: added ? 'Saved the requested task under the existing case. Nothing submitted.' : 'Task limit reached; no new task saved.' });
    } else if (plan.action?.kind === 'command') {
      await this.handleInput(a, tx, { ...input, text: personalCommand(plan.action.command) });
      personal.history.push({ role: 'assistant', content: `Processed ${plan.action.command.verb}; consult current task state for the result, not this history entry.` });
    } else {
      enqueue(a, plan.reply, now);
      personal.history.push({ role: 'assistant', content: plan.reply });
    }
    if (receipts.length) enqueue(a, receipts.join('\n\n'), now);
    personal.history = personal.history.slice(-40);
  }

  private async attach(owner: string, a: Account, file: NonNullable<Inbound['attachment']>, tx: PoolClient): Promise<void> {
    const now = this.now();
    const t = a.tasks.find(t => t.id === a.attachTo);
    if (!t || t.id !== file.task || t.revision !== file.revision || t.attempts || final(t) || t.status === 'executing') {
      enqueue(a, 'The selected task is missing or changed during upload. Send ATTACH task and upload again; nothing was stored.', now); return;
    }
    const b = file.bytes;
    const signature = file.mimeType === 'application/pdf' ? b.subarray(0, 5).toString() === '%PDF-' :
      file.mimeType === 'image/png' ? b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) :
        file.mimeType === 'image/jpeg' && b[0] === 255 && b[1] === 216 && b[2] === 255;
    if (!signature || b.length > 5 * 1024 * 1024 || t.documents.length >= 10) {
      enqueue(a, 'Document rejected. Use a JPEG, PNG or PDF up to 5 MiB, with at most 10 documents per task.', now); return;
    }
    const digest = documentDigest(b);
    const existing = await tx.query('SELECT id,sealed FROM documents WHERE owner=$1 AND id=ANY($2::uuid[])', [owner, t.documents]);
    if (existing.rows.some(row => {
      const saved = this.store.vault.open<{ base64: string }>(row.sealed, `document:${owner}:${row.id}`);
      return documentDigest(Buffer.from(saved.base64, 'base64')) === digest;
    })) {
      delete a.attachTo;
      enqueue(a, 'This exact file is already attached to this task. No duplicate stored and no approval changed.', now); return;
    }
    const id = randomUUID();
    await tx.query('INSERT INTO documents(id,owner,sealed) VALUES($1,$2,$3)',
      [id, owner, this.store.vault.seal({ mimeType: file.mimeType, base64: b.toString('base64') }, `document:${owner}:${id}`)]);
    t.documents.push(id); delete a.attachTo; invalidate(t); delete t.documentReview;
    t.status = 'reading_documents'; t.nextRunAt = now;
    note(t, now, 'document_received', 'Document stored; local text/OCR review queued. Eligibility is not verified. Nothing submitted.');
    enqueue(a, `${taskSummary(t)}\nDocument ID: ${id}\nUse DOCUMENTS ${t.id} for extracted facts, or REMOVE ${t.id} ${id} to remove this file.`, now);
  }

  private disconnect(a: Account, provider: string, now: number): void {
    const c = a.connections[provider];
    if (c?.browser) this.portalAccess?.cleanup(a, provider, c.browser);
    if (c?.credential) a.revocations.push({ id: randomUUID(), provider, credential: c.credential, nextRunAt: now });
    a.connections[provider] = { generation: randomUUID(), status: 'revoked', expiresAt: now };
    for (const t of a.tasks.filter(t => t.provider === provider && !final(t))) {
      if (!t.attempts && t.status !== 'executing') { invalidate(t); t.status = 'needs_information'; }
      note(t, now, 'access_revoked', 'Connection revoked. No further access will start; in-flight provider actions may still finish.');
    }
  }

  /** Callback carries only provider proof and opaque state. It cannot select an
   * owner or activate access; the initiating sender must confirm in iMessage. */
  async callback(state: string, authorizationCode: string): Promise<boolean> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(state) || !authorizationCode || authorizationCode.length > 4096) return false;
    const link = await this.store.consumeLink<Link>(state, this.now());
    if (!link) return false;
    const { owner, data } = link;
    const connector = this.connectors.get(data.provider);
    if (!connector) return false;
    const active = await this.store.change(owner, undefined, a => this.accessAllowed(a.sender) && a.connections[data.provider]?.generation === data.generation && a.connections[data.provider]?.status === 'awaiting_login');
    if (!active) return false;
    try {
      const result = await this.bounded(signal => connector.exchange({ code: authorizationCode,
        verifier: data.verifier, redirectUri: this.redirectUri, signal }));
      if (!result.credential || !result.accountId || result.accountId.length > 1500 || !result.accountLabel || result.accountLabel.length > 200 || !Number.isFinite(result.expiresAt) || result.expiresAt <= this.now()) throw new Error('Invalid connection');
      return await this.store.change(owner, undefined, a => {
        const c = a.connections[data.provider];
        if (!this.accessAllowed(a.sender) || !c || c.generation !== data.generation || c.status !== 'awaiting_login' || this.now() >= c.expiresAt) {
          a.revocations.push({ id: randomUUID(), provider: data.provider, credential: result.credential, nextRunAt: this.now() });
          return false;
        }
        Object.assign(c, result, { status: 'awaiting_confirmation', code: code(), confirmBy: this.now() + 10 * 60_000 });
        enqueue(a, `Sign-in returned for ${connector.label}: ${result.accountLabel}. Only confirm if this is the account you intended.\nReply CONNECT ${c.code} within 10 minutes to allow read/preparation access, or DISCONNECT ${data.provider}. Nothing has been submitted.`, this.now(), false,
          { provider: data.provider, generation: data.generation, connectionStatus: 'awaiting_confirmation' });
        return true;
      });
    } catch {
      await this.store.change(owner, undefined, a => {
        if (a.connections[data.provider]?.generation === data.generation) {
          a.connections[data.provider]!.status = 'expired';
          enqueue(a, `Could not complete ${label(data.provider)} sign-in. Send CONNECT ${data.provider} for a fresh link.`, this.now());
        }
      });
      return false;
    }
  }

  private async bounded<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([fn(controller.signal), new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('Connector timed out')); }, 15_000);
      })]);
    } finally { clearTimeout(timer); }
  }

  async tick(): Promise<void> {
    for (const owner of await this.store.owners()) {
      await this.revokePending(owner);
      const ids = await this.store.change(owner, undefined, a => {
        if (!this.enrolled(a)) return [];
        const now = this.now();
        for (const [provider, c] of Object.entries(a.connections)) {
          if (c.status !== 'revoked' && (now >= c.expiresAt || (c.confirmBy && now >= c.confirmBy))) {
            if (c.credential || c.browser) this.disconnect(a, provider, now);
            a.connections[provider]!.status = 'expired';
          }
        }
        for (const t of a.tasks) {
          if (!a.paused && this.accessAllowed(a.sender) && t.followupAt !== undefined && t.followupAt <= now) {
            delete t.followupAt;
            if (!final(t)) enqueue(a, `Following up on ${t.id}: ${t.request}\nAny update? Tell me what happened, or send REPORT ${t.id} with your update. Nothing new has been submitted.`, now, true, { followupTask: t.id });
          }
          if (t.status === 'awaiting_approval' && now >= t.proposal!.expiresAt) {
            invalidate(t); t.status = 'needs_information'; note(t, now, 'approval_expired', 'Review expired. PREPARE for a fresh approval.');
            enqueue(a, taskSummary(t), now, true);
          }
        }
        return a.paused || !this.accessAllowed(a.sender) ? [] : a.tasks.filter(t => (t.status === 'reading_documents' || t.status === 'preparing' || pending(t)) && t.nextRunAt !== undefined && t.nextRunAt <= now && (!t.lease || t.lease.until <= now)).map(t => t.id);
      });
      await this.portalAccess?.tick(owner);
      for (const id of ids) await this.work(owner, id);
    }
    await this.store.pool.query('DELETE FROM links WHERE expires_at <= $1', [this.now()]);
  }

  private async work(owner: string, id: string): Promise<void> {
    const job = await this.store.change(owner, undefined, a => {
      const t = a.tasks.find(t => t.id === id)!;
      const c = t.provider && a.connections[t.provider];
      if (a.paused || !this.accessAllowed(a.sender) || (t.status !== 'reading_documents' && t.status !== 'preparing' && !pending(t)) || t.nextRunAt === undefined || t.nextRunAt > this.now() || (t.lease && t.lease.until > this.now())) return;
      if (!t.attempts && t.status !== 'reading_documents' && !this.contextReady(a, t)) {
        invalidate(t); t.status = 'needs_information';
        note(t, this.now(), 'context_blocked', 'Case dependencies or supporting facts require review. Nothing newly sent.');
        enqueue(a, taskSummary(t), this.now(), true); return;
      }
      if (t.status !== 'reading_documents' && (!c || c.status !== 'active' || !c.credential || this.now() >= c.expiresAt)) {
        delete t.nextRunAt; t.status = t.attempts ? 'reconciling' : 'needs_information';
        note(t, this.now(), 'connection_required', 'Reconnect the provider, then PREPARE an unsent task or RETRY to check a prior request.');
        enqueue(a, taskSummary(t), this.now(), true); return;
      }
      t.lease = { token: randomUUID(), until: this.now() + 60_000 };
      return { task: structuredClone(t), connection: structuredClone(c),
        contextFacts: structuredClone(personalView(a.personal ?? emptyPersonalContext(), a.tasks, this.now()).facts.filter(f => t.factIds?.includes(f.id))) };
    });
    if (!job) return;
    const { task: t, connection: c } = job;
    const connector = this.connectors.get(t.provider!);
    try {
      if (t.status === 'reading_documents') {
        const files = await this.store.documents(owner, t.documents);
        const documents = [];
        const signal = AbortSignal.timeout(45_000);
        for (const id of t.documents) documents.push(await extractDocument(files.find(f => f.id === id)!, signal));
        const report = reviewDocuments(documents);
        await this.finish(owner, t, current => {
          current.documentReview = report; current.status = 'needs_information'; delete current.nextRunAt;
          note(current, this.now(), 'documents_reviewed', `Local review complete. ${report.issues.length} issues; source/provider verification still required. Send DOCUMENTS ${current.id}.`);
        });
        return;
      }
      if (!connector || !connector.workflows.includes(t.workflow) || !c || !c.credential) throw new Error('Connector unavailable');
      const context = (signal: AbortSignal) => ({ owner, credential: c.credential!, signal });
      if (t.status === 'preparing') {
        const documents = await this.store.documents(owner, t.documents);
        const prepared = await this.bounded(signal => connector.prepare(context(signal), { workflow: t.workflow, request: t.request, documents, documentReview: t.documentReview, contextFacts: job.contextFacts }));
        if ('blocked' in prepared) {
          await this.finish(owner, t, current => {
            current.status = 'needs_information'; delete current.nextRunAt;
            note(current, this.now(), 'preparation_blocked', prepared.blocked.slice(0, 1500));
          }); return;
        }
        const action = actionSchema.parse(prepared.action);
        const allowed: Record<WorkflowKind, string[]> = { fsa: ['submit_claim'], reimbursement: ['submit_claim'],
          refill: ['request_refill', 'request_renewal'], appointment: ['book_appointment'], dependent: ['enroll_dependent'] };
        if (!allowed[t.workflow].includes(action.operation) || Date.parse(action.expiresAt) <= this.now() ||
          (action.deadline && Date.parse(action.deadline) <= this.now())) throw new Error('Invalid action');
        await this.finish(owner, t, current => {
          const expiresAt = Math.min(Date.parse(action.expiresAt), action.deadline ? Date.parse(action.deadline) : Infinity, this.now() + 15 * 60_000);
          current.proposal = { action, expiresAt, code: code(), connection: c.generation, accountId: c.accountId!,
            hash: this.store.vault.hash(JSON.stringify({ action, revision: current.revision, connection: c.generation, accountId: c.accountId })) };
          current.status = 'awaiting_approval'; delete current.nextRunAt;
          note(current, this.now(), 'prepared', 'Grounded proposal ready for exact approval. Nothing submitted.');
        }); return;
      }
      if (!t.actionKey || !t.proposal || !t.approval || t.approval.hash !== t.proposal.hash ||
        c.accountId !== t.proposal.accountId ||
        t.proposal.hash !== this.store.vault.hash(JSON.stringify({ action: t.proposal.action, revision: t.revision, connection: t.proposal.connection, accountId: t.proposal.accountId }))) throw new Error('Authorization missing or changed');
      // Always reconcile first, even after approval expires or a process restarts.
      const lookup = await this.bounded(signal => connector.lookup(context(signal), t.actionKey!));
      let result: Outcome;
      if (lookup.kind === 'found') result = lookup.outcome;
      else {
        if (lookup.kind === 'unknown' || (t.attempts > 0 && !connector.idempotentSubmit)) throw new Error('Uncertain provider state');
        if (this.now() >= t.proposal.expiresAt || c.generation !== t.proposal.connection) throw new Error('Approval expired or account changed');
        if (!await this.bounded(signal => connector.validate(context(signal), structuredClone(t.proposal!.action)))) {
          await this.finish(owner, t, current => {
            current.status = 'needs_information'; delete current.nextRunAt;
            // Keep the action key for any prior attempt; never re-prepare uncertain work.
            if (!current.attempts) { delete current.proposal; delete current.approval; }
            note(current, this.now(), 'evidence_changed', 'Provider details changed. Nothing newly submitted; review required.');
          }); return;
        }
        // Commit the dispatch intent BEFORE calling the provider. STOP, edits,
        // disconnect and another worker fence this transition under the same lock.
        const permitted = await this.store.change(owner, undefined, a => {
          const current = a.tasks.find(j => j.id === id)!;
          const conn = a.connections[t.provider!];
          if (a.paused || !this.accessAllowed(a.sender) || current.lease?.token !== t.lease?.token || conn?.generation !== c.generation || conn.status !== 'active' ||
            this.now() >= conn.expiresAt || this.now() >= current.proposal!.expiresAt) return false;
          if (!current.attempts && !this.contextReady(a, current)) return false;
          current.status = 'executing'; current.attempts++;
          note(current, this.now(), 'dispatch_started', 'Provider request starting; an interrupted response must be reconciled.');
          return true;
        });
        if (!permitted) return;
        result = await this.bounded(signal => connector.submit(context(signal), t.proposal!.action, t.actionKey!));
      }
      const outcome = outcomeSchema.parse(result);
      if ((outcome.state !== 'completed' && outcome.realizedCents !== 0) ||
        (!['fsa', 'reimbursement'].includes(t.workflow) && outcome.realizedCents !== 0) ||
        outcome.realizedCents > t.proposal.action.amountCents ||
        (t.proposal.action.operation === 'request_renewal' && ['completed', 'ready'].includes(outcome.state))) {
        throw new Error('Outcome does not establish realized benefit');
      }
      await this.finish(owner, t, current => {
        current.outcome = outcome; current.status = outcome.state; current.failures = 0;
        if (['submitted', 'pending'].includes(outcome.state)) current.nextRunAt = this.now() + 5 * 60_000;
        else delete current.nextRunAt;
        note(current, this.now(), 'provider_status', `${outcome.detail}\nReference: ${outcome.reference}\nEvidence: ${outcome.evidence}`);
      });
    } catch {
      // Never echo arbitrary exception strings: they may contain health data,
      // authentication URLs, tokens, or remote HTML.
      await this.finish(owner, t, current => {
        current.failures++;
        const uncertain = current.attempts > 0;
        current.status = uncertain ? 'reconciling' : 'needs_information';
        if (uncertain && current.failures < 3) current.nextRunAt = this.now() + 60_000 * 2 ** current.failures;
        else delete current.nextRunAt;
        note(current, this.now(), 'work_blocked', uncertain ?
          'Provider result uncertain. I will check for the existing request, not assume failure. After three failed checks, RETRY requests another status check.' :
          'Could not safely prepare or start this action. Check the connection and PREPARE a fresh review. No submission was confirmed.');
      });
    }
  }

  private async finish(owner: string, original: Task, change: (task: Task) => void): Promise<void> {
    await this.store.change(owner, undefined, a => {
      const t = a.tasks.find(t => t.id === original.id)!;
      if (t.lease?.token !== original.lease?.token) return;
      const previous = `${t.status}:${t.detail}`;
      delete t.lease; change(t);
      if (original.status === 'reading_documents' && t.documentReview) {
        enqueue(a, documentSummary(t.documentReview), this.now(), true, { task: t.id, revision: t.revision }); return;
      }
      if (`${t.status}:${t.detail}` !== previous) enqueue(a, t.status === 'awaiting_approval' ? review(t) : taskSummary(t), this.now(), true,
        t.status === 'awaiting_approval' ? { task: t.id, hash: t.proposal!.hash } : undefined);
    });
  }

  private async revokePending(owner: string): Promise<void> {
    const job = await this.store.change(owner, undefined, a => {
      const r = a.revocations.find(r => r.nextRunAt <= this.now() && (!r.lease || r.lease.until <= this.now()));
      if (!r) return;
      r.lease = { token: randomUUID(), until: this.now() + 60_000 }; return structuredClone(r);
    });
    if (!job) return;
    try {
      const c = this.connectors.get(job.provider);
      if (job.browser) {
        if (!this.portalAccess) throw new Error('Browser cleanup unavailable');
        await this.portalAccess.revoke(owner, job.credential);
      } else {
        if (!c) throw new Error('Connector unavailable');
        await this.bounded(signal => c.revoke({ owner, credential: job.credential, signal }));
      }
      await this.store.change(owner, undefined, a => { a.revocations = a.revocations.filter(r => r.id !== job.id); });
    } catch {
      await this.store.change(owner, undefined, a => {
        const r = a.revocations.find(r => r.id === job.id);
        if (r && r.lease?.token === job.lease?.token) { delete r.lease; r.nextRunAt = this.now() + 60 * 60_000; }
      });
    }
  }

  /** Delivery is at-least-once: a crash after Spectrum accepts a send may repeat
   * a notification. Approval and provider submission remain independently deduped. */
  async deliver(send: (route: { sender: string; space: string; line: string }, text: string) => Promise<void>): Promise<void> {
    for (const owner of await this.store.owners()) {
      const job = await this.store.change(owner, undefined, a => {
        if (!this.accessAllowed(a.sender)) return;
        a.outbox = a.outbox.filter(m => {
          if (m.lease && m.lease.until > this.now()) return true;
          const g = m.guard;
          if (g?.followupTask) return a.tasks.some(t => t.id === g.followupTask && !final(t) && t.followupAt === undefined);
          if (g?.task && g.revision !== undefined) return a.tasks.some(t => t.id === g.task && t.revision === g.revision);
          if (g?.task) return a.tasks.some(t => t.id === g.task && t.status === 'awaiting_approval' && t.proposal && t.proposal.hash === g.hash && this.now() < t.proposal.expiresAt);
          if (g?.provider) { const c = a.connections[g.provider]; return c && c.generation === g.generation && c.status === g.connectionStatus && this.now() < Math.min(c.confirmBy ?? Infinity, c.expiresAt); }
          return true;
        });
        const m = a.outbox.find(m => (this.enrolled(a) || m.guard?.enrollment) && (!a.paused || !m.proactive));
        if (!m || m.nextRunAt > this.now() || (m.lease && m.lease.until > this.now())) return;
        m.lease = { token: randomUUID(), until: this.now() + 60_000 };
        return { message: structuredClone(m), route: { sender: a.sender, space: a.space, line: a.line } };
      });
      if (!job) continue;
      try {
        await this.bounded(() => send(job.route, job.message.text));
        await this.store.change(owner, undefined, a => {
          a.outbox = a.outbox.filter(m => m.id !== job.message.id || m.lease?.token !== job.message.lease?.token);
        });
      } catch {
        await this.store.change(owner, undefined, a => {
          const m = a.outbox.find(m => m.id === job.message.id);
          if (!m || m.lease?.token !== job.message.lease?.token) return;
          delete m.lease; m.attempts++; m.nextRunAt = this.now() + Math.min(60 * 60_000, 1000 * 2 ** Math.min(m.attempts, 12));
        });
      }
    }
  }
}
