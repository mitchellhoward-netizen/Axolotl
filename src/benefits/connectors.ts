import { z } from 'zod';
import type { DocumentReview } from './documents.js';
import type { PersonalFact } from '../domain/personal-context.js';

export const WORKFLOWS = ['fsa', 'reimbursement', 'refill', 'appointment', 'dependent'] as const;
export type WorkflowKind = typeof WORKFLOWS[number];

/** Inventory is not a claim of operational support. Only injected, validated
 * connectors can connect or execute. No lab fixture is registered here. */
export const PORTALS = [
  { id: 'cvs', label: 'CVS Pharmacy', pattern: /\bcvs\b/i },
  { id: 'walgreens', label: 'Walgreens', pattern: /\bwalgreens\b/i },
  { id: 'wex', label: 'WEX', pattern: /\bwex\b/i },
  { id: 'healthequity', label: 'HealthEquity', pattern: /\b(healthequity|health equity|wageworks)\b/i },
  { id: 'optum-financial', label: 'Optum Financial', pattern: /\boptum financial\b/i },
  { id: 'fidelity', label: 'Fidelity', pattern: /\bfidelity\b/i },
  { id: 'uhc', label: 'UnitedHealthcare', pattern: /\b(uhc|unitedhealthcare)\b/i },
  { id: 'workday', label: 'Workday', pattern: /\bworkday\b/i },
  { id: 'rippling', label: 'Rippling', pattern: /\brippling\b/i },
  { id: 'mychart', label: 'MyChart (organization-specific)', pattern: /\bmychart\b/i },
  // Fictional demo institutions (see src/demo/). Real connectors must be added above.
  { id: 'northstar', label: 'Northstar Benefits (demo)', pattern: /\bnorthstar benefits\b/i },
  { id: 'bright', label: 'Bright Pediatrics (demo)', pattern: /\bbright pediatrics\b/i },
] as const;

export function portalIn(text: string): string | undefined {
  const matches = PORTALS.filter(p => p.pattern.test(text));
  return matches.length === 1 ? matches[0]!.id : undefined;
}

export function workflowIn(text: string): WorkflowKind | undefined {
  if (/\bfsa\b/i.test(text)) return 'fsa';
  if (/\b(hsa|hra)\b/i.test(text)) return 'reimbursement';
  if (/\b(refill|prescription|renewal)\b/i.test(text)) return 'refill';
  if (/\b(appointment|doctor|pediatrician)\b/i.test(text)) return 'appointment';
  if (/\b(dependent|enroll)\b/i.test(text)) return 'dependent';
  if (/\b(reimburse|reimbursement|claim)\b/i.test(text)) return 'reimbursement';
  return undefined;
}

const bounded = z.string().trim().min(1).max(1500);
export const actionSchema = z.object({
  operation: z.enum(['submit_claim', 'request_refill', 'request_renewal', 'book_appointment', 'enroll_dependent']),
  // Stable provider-account + expense/Rx/slot identity, NOT a task ID. Used to
  // prevent duplicate approvals for the same action across different messages.
  resourceKey: bounded,
  destination: bounded,
  subject: bounded,
  summary: bounded,
  amountCents: z.number().int().nonnegative().max(100_000_000),
  disclosures: z.array(bounded).min(1).max(20),
  // Exact executor payload is hashed with the displayed terms and evidence.
  payload: z.record(z.string(), z.unknown()),
  evidence: z.array(z.object({ source: bounded, detail: bounded, observedAt: z.iso.datetime() })).min(1).max(20),
  expiresAt: z.iso.datetime(),
  deadline: z.iso.datetime().optional(),
}).strict();
export type Action = z.infer<typeof actionSchema>;

export const outcomeSchema = z.object({
  state: z.enum(['submitted', 'pending', 'ready', 'completed', 'denied', 'needs_information']),
  reference: bounded,
  detail: bounded,
  evidence: bounded,
  observedAt: z.iso.datetime(),
  realizedCents: z.number().int().nonnegative().max(100_000_000),
}).strict();
export type Outcome = z.infer<typeof outcomeSchema>;

export interface ConnectorContext {
  owner: string;
  credential: string;
  signal: AbortSignal;
}

/** Trusted server-side adapter boundary, not model-accessible browser primitives.
 * A browser adapter must constrain reads/writes in code, support secure takeover,
 * and validate callback proofs. OAuth adapters must validate provider responses.
 * Neither a prompt nor a saved cookie establishes those guarantees. */
export interface BennyConnector {
  id: string;
  label: string;
  validated: boolean;
  method: 'oauth' | 'browser';
  workflows: readonly WorkflowKind[];
  authorizationOrigins: readonly string[];
  /** True only if the PROVIDER enforces the supplied idempotency key. */
  idempotentSubmit: boolean;
  authorizationUrl(input: { state: string; challenge: string; redirectUri: string }): string;
  exchange(input: { code: string; verifier: string; redirectUri: string; signal: AbortSignal }): Promise<{
    // Provider-verified stable account/tenant ID, not a display label or login email.
    credential: string; accountId: string; accountLabel: string; expiresAt: number;
  }>;
  revoke(context: ConnectorContext): Promise<void>;
  /** Read-only. Return blockers rather than inventing eligibility or documents. */
  prepare(context: ConnectorContext, input: {
    workflow: WorkflowKind; request: string;
    documents: Array<{ id: string; mimeType: string; bytes: Buffer }>;
    /** Untrusted extracted candidates, never proof of eligibility or authority.
     * Resolve missing information against the source/provider before proposing. */
    documentReview?: DocumentReview;
    /** Task-selected facts only, not the household's whole context. These are
     * unverified reports; any external disclosure must appear in the action. */
    contextFacts?: PersonalFact[];
  }): Promise<{ action: Action } | { blocked: string }>;
  /** Recheck evidence, account, eligibility and exact transaction before submit. */
  validate(context: ConnectorContext, action: Action): Promise<boolean>;
  /** `absent` must be definitive. Use `unknown` for lagging/incomplete searches. */
  lookup(context: ConnectorContext, key: string): Promise<
    { kind: 'found'; outcome: Outcome } | { kind: 'absent' } | { kind: 'unknown' }
  >;
  submit(context: ConnectorContext, action: Action, key: string): Promise<Outcome>;
}
