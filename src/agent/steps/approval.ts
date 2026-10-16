import { createHash } from 'node:crypto';
import type { Step } from './types.js';

/**
 * What a parent's YES is bound to.
 *
 * A YES authorizes the exact proposal the parent was shown: the same recipients, the same
 * values, the same form. We record a digest of the proposal when it is shown, and run it only
 * if the steps about to execute digest the same, within the approval's lifetime. Anything else
 * (a value changed after the review, a proposal staged without being shown, an approval left
 * open for days) re-shows the proposal and asks again. The gate fails closed.
 *
 * None of this is the parent's job. They answer the way they would answer a person ("yes",
 * "sounds good, send it", "dale"); the binding happens underneath. (Mitch, 2026-10-16: no codes,
 * no all-caps YES. If it's clear they want it done, do it. This configuration is good for now,
 * not final; see docs/RELIABILITY.md, "The YES check".)
 */

export interface ApprovalStamp {
  /** sha256 over the canonical proposal (see proposalDigest). */
  hash: string;
  shownAt: number;
  expiresAt: number;
  /** A message went out after the proposal that did not mention it, so a "yes" may be answering
   * that message instead. We check once, in a sentence, which one they mean. */
  stale?: boolean;
  /** We already asked "want me to go ahead?" once for a reply that was probably a yes. */
  confirmAsked?: boolean;
}

/** How long a shown proposal stays approvable. A day: long enough to answer after work. */
export function approvalTtlMs(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.CONSENT_TTL_MS);
  return Number.isFinite(n) && n > 0 ? n : 24 * 60 * 60 * 1000;
}

/** Keys whose values are never echoed to a parent, stored in the consent log, or shown. A bare
 * "code" is not here: a zip or postal code is a value the parent must see. */
export const SECRET_KEY = /password|passwd|pwd|otp|one[- ]?time|(security|verification|access|auth\w*) code|^code$|secret|token|cvv|ssn|social security/i;

/** The consequential content of one step, without fields that change between show and run
 * (ids, status, a vendor's browser session). Keys are sorted so the digest is stable. */
function canonical(step: Step): unknown {
  const { skyvernSessionId: _session, ...payload } = step.payload as Record<string, unknown>;
  void _session;
  return sortKeys({
    channel: step.channel,
    intent: step.intent,
    to: { name: step.counterparty.name, email: step.counterparty.email, phone: step.counterparty.phone },
    payload,
  });
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([, x]) => x !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, x]) => [k, sortKeys(x)]),
    );
  }
  return v;
}

/** Digest of every consent-gated step, in order. */
export function proposalDigest(steps: Step[] | undefined): string {
  const gated = (steps ?? []).filter((s) => s.requiresConsent).map(canonical);
  return createHash('sha256').update(JSON.stringify(gated)).digest('hex');
}

export function stampApproval(steps: Step[] | undefined, now = Date.now(), env: NodeJS.ProcessEnv = process.env): ApprovalStamp {
  return { hash: proposalDigest(steps), shownAt: now, expiresAt: now + approvalTtlMs(env) };
}

/** Does the message ask the parent to approve something? Narrow on purpose: "want me to look up
 * the bus times?" is not an invitation to run the staged proposal. */
export function invitesYes(text: string): boolean {
  return /\b(reply|say|text|answer)( with)? yes\b|\bwant me to (go ahead|send|submit|file|make the call|call|fill)\b|\b(ok|okay|good) to (send|submit|go)\b|\bshall i (send|submit|go ahead)\b/i.test(
    text,
  );
}

export type ApprovalCheck = { ok: true } | { ok: false; reason: 'not_shown' | 'changed' | 'expired' | 'stale' };

/** May these steps run on a yes given now? Only while they are what the parent was last shown. */
export function checkApproval(steps: Step[] | undefined, stamp: ApprovalStamp | undefined, now = Date.now()): ApprovalCheck {
  if (!stamp) return { ok: false, reason: 'not_shown' };
  if (now > stamp.expiresAt) return { ok: false, reason: 'expired' };
  if (proposalDigest(steps) !== stamp.hash) return { ok: false, reason: 'changed' };
  if (stamp.stale) return { ok: false, reason: 'stale' };
  return { ok: true };
}

/** The strings a parent must have seen for a step to count as shown: each value, recipient
 * and message body. Secret keys are excluded (they are never shown). */
export function visibleParts(step: Step): string[] {
  const p = step.payload as Record<string, unknown>;
  const parts: string[] = [];
  const values = p.values as Record<string, string> | undefined;
  if (values) for (const [k, v] of Object.entries(values)) if (!SECRET_KEY.test(k) && v) parts.push(String(v));
  const fields = p.fields as Record<string, string> | Array<{ label: string; value: string }> | undefined;
  if (Array.isArray(fields)) for (const f of fields) { if (!SECRET_KEY.test(f.label) && f.value) parts.push(f.value); }
  else if (fields) for (const [k, v] of Object.entries(fields)) if (!SECRET_KEY.test(k) && v) parts.push(String(v));
  if (typeof p.body === 'string' && p.body) parts.push(p.body);
  if (typeof p.subject === 'string' && p.subject) parts.push(p.subject);
  if (step.channel === 'email' && step.counterparty.email) parts.push(step.counterparty.email);
  return parts;
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** True when every consequential part of every gated step appears in what the parent was sent. */
export function shownIn(texts: string[], steps: Step[] | undefined): boolean {
  const seen = norm(texts.join('\n'));
  return (steps ?? []).filter((s) => s.requiresConsent).every((s) => visibleParts(s).every((part) => seen.includes(norm(part))));
}

/** What the consent log keeps for each approved step: the plain values and the digest (Mitch,
 * 2026-10-16: "plain values + hash"). Secrets never go in. */
export function consentRecord(step: Step): Record<string, unknown> {
  const p = step.payload as Record<string, unknown>;
  const values = p.values as Record<string, string> | undefined;
  const fields = p.fields as Record<string, string> | Array<{ label: string; value: string }> | undefined;
  const clean = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([k]) => !SECRET_KEY.test(k)));
  return {
    ...(values ? { values: clean(values) } : {}),
    ...(Array.isArray(fields)
      ? { values: clean(Object.fromEntries(fields.map((f) => [f.label, f.value]))) }
      : fields
        ? { values: clean(fields) }
        : {}),
    ...(typeof p.subject === 'string' ? { subject: p.subject } : {}),
    ...(typeof p.body === 'string' ? { body: p.body } : {}),
    digest: proposalDigest([step]),
  };
}
