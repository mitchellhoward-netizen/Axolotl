/**
 * Consent resolution for a pending consequential action.
 *
 * The gate stays strict on purpose: nothing executes unless the parent's message IS an
 * affirmation. But real parents answer "YES" and make a change in the same breath —
 * "yes last name Howard". The old gate treated anything that wasn't a bare yes/no as a
 * subject change and EXPIRED the proposal, so the most natural reply to "Reply YES to
 * submit, or tell me what to change" destroyed the staged submit and started the work over.
 *
 * This module keeps the invariant and fixes the ergonomics:
 *   - a leading affirmation plus extra words is approval OF THE PENDING STEP WITH AN AMENDMENT;
 *   - the amendment is applied to the staged payload only where we can parse it honestly;
 *   - consent is for the EXACT proposal shown, so a changed proposal is re-shown and needs a
 *     fresh YES. We never execute values the parent has not seen;
 *   - extra words we cannot turn into a change are never guessed at. The step stays staged and
 *     we ask, instead of expiring it or inventing a value.
 *
 * What this deliberately does NOT do: treat a question, a negation, or an unrelated message as
 * consent. Those still expire the proposal (see the caller), which is what keeps a stray
 * "ok thanks" from firing a stale submission.
 */
import type { Step } from './types.js';

export type CanonicalField = 'first_name' | 'last_name' | 'grade' | 'email' | 'phone' | 'address' | 'dob';

export interface Amendment {
  /** Field edits we understood, in the order they appeared. */
  changes: Array<{ field: CanonicalField; value: string }>;
  /** Free text to add to a staged email ("yes and mention the bus"). */
  appendBody?: string;
  /** Replacement subject for a staged email. */
  subject?: string;
  /** Parts of the message we could not read as a change, kept so we can ask rather than guess. */
  unparsed: string[];
}

/** Anything a parent might open a consent reply with. */
const AFFIRM = /^(?:y|yes|yeah|yep|yup|sure|ok|okay|kk|confirm|go ahead|go|please|do it|submit|submit it|go for it|sounds good|perfect|correct)\b/i;

/**
 * A closing pleasantry carries no instruction. "ok thanks" must keep its old meaning (the
 * parent has moved on, so the proposal expires) while "yes what about the other one" is a live
 * question about the pending work and must NOT expire it. This is the line between them.
 */
const PLEASANTRY_ONLY = /^(?:thanks|thank you|ty|thx|cheers|great|nice|cool)[\s!.,]*$/i;

const FIELD_PATTERNS: Array<{ field: CanonicalField; re: RegExp }> = [
  // "last name Howard", "change the last name to Howard", "lastname is Howard"
  { field: 'last_name', re: /\b(?:change\s+)?(?:the\s+)?(?:child'?s\s+|his\s+|her\s+|my\s+)?(?:last\s*name|surname|family\s*name)(?:\s+(?:is|to|should\s+be))?\s*[:=]?\s*(.+)$/i },
  { field: 'first_name', re: /\b(?:change\s+)?(?:the\s+)?(?:child'?s\s+|his\s+|her\s+|my\s+)?(?:first\s*name|given\s*name)(?:\s+(?:is|to|should\s+be))?\s*[:=]?\s*(.+)$/i },
  // "grade to 2", "change the grade to 2", "he's in grade 2"
  { field: 'grade', re: /\b(?:change\s+)?(?:the\s+)?(?:grade|year|class)(?:\s+(?:is|to|should\s+be))?\s*[:=]?\s*([^\s,;]+)/i },
  { field: 'email', re: /\b(?:e-?mail|email\s+address)(?:\s+(?:is|to|should\s+be))?\s*[:=]?\s*([^\s,;]+)/i },
  { field: 'phone', re: /\b(?:phone|cell|mobile|telephone|number)(?:\s+(?:is|to|should\s+be))?\s*[:=]?\s*([+\d][\d\s().-]{6,}\d)/i },
  { field: 'address', re: /\b(?:address|street|addr)(?:\s+(?:is|to|should\s+be))?\s*[:=]?\s*(.+)$/i },
  { field: 'dob', re: /\b(?:date\s+of\s+birth|dob|birthday|birth\s*date)(?:\s+(?:is|to|should\s+be))?\s*[:=]?\s*(.+)$/i },
];

/** A bare email or a bare street address, with no field label in front of it. */
const BARE_EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const BARE_ADDRESS = /^\d+\s+\S+.*\b(?:st|street|ave|avenue|rd|road|dr|drive|blvd|ln|lane|way|ct|court|pl|place|ter|terrace)\b/i;

/** Strip the connective tissue a fast typist adds: "is", "to", quotes, trailing punctuation. */
function tidy(value: string): string {
  return value
    .trim()
    .replace(/^[:=\s-]+/, '')
    .replace(/^(?:is|to|the|as|it|should\s+be)\s+/i, '')
    .replace(/[.!?,;]+$/, '')
    .replace(/^["']|["']$/g, '')
    .trim();
}

/** Read one clause as a change. Returns null when the clause is not a change we understand. */
function parseClause(clause: string): { field: CanonicalField; value: string } | null {
  const s = clause.trim();
  if (!s) return null;
  for (const { field, re } of FIELD_PATTERNS) {
    const m = s.match(re);
    if (m?.[1]) {
      const value = tidy(m[1]);
      if (value) return { field, value };
    }
  }
  const bare = tidy(s);
  if (BARE_EMAIL.test(bare)) return { field: 'email', value: bare };
  if (BARE_ADDRESS.test(bare)) return { field: 'address', value: bare };
  // "use 456 Oak Ave" — an instruction to use something, where the something is an address.
  const use = s.match(/^(?:please\s+)?(?:use|make it|put)\s+(.+)$/i);
  if (use?.[1]) {
    const value = tidy(use[1]);
    if (value) {
      if (BARE_EMAIL.test(value)) return { field: 'email', value };
      if (BARE_ADDRESS.test(value)) return { field: 'address', value };
    }
  }
  return null;
}

/**
 * A leading affirmation followed by extra words → an amendment. Returns null when the message
 * is a bare affirmation (the caller's strict-YES path owns that), when it isn't an affirmation
 * at all, or when the extra words are only a pleasantry.
 */
export function parseConsentAmendment(text: string): Amendment | null {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!AFFIRM.test(t)) return null;
  const m = t.match(new RegExp(AFFIRM.source + '[\\s,.:;!-]*(?:but\\s+|and\\s+|then\\s+)?(.+)$', 'i'));
  if (!m?.[1]) return null;
  const rest = m[1].trim();
  if (!rest || PLEASANTRY_ONLY.test(rest)) return null;

  const amendment: Amendment = { changes: [], unparsed: [] };

  // An email instruction ("and mention the bus", "subject: bus pass") is not a field edit.
  const append = rest.match(/^(?:please\s+)?(?:also\s+)?(?:add|mention|say|tell\s+(?:them|the\s+school)|include|write)\s*[:,]?\s*(.+)$/i);
  if (append?.[1]) {
    amendment.appendBody = tidy(append[1]);
    return amendment;
  }
  const subj = rest.match(/^(?:change\s+)?(?:the\s+)?subject(?:\s+line)?(?:\s+(?:is|to))?\s*[:=]?\s*(.+)$/i);
  if (subj?.[1]) {
    amendment.subject = tidy(subj[1]);
    return amendment;
  }

  // One message can carry several edits ("last name Howard and grade 2").
  for (const clause of rest.split(/\s*(?:,|;|\band\b)\s*/i)) {
    if (!clause.trim()) continue;
    const one = parseClause(clause);
    if (one) amendment.changes.push(one);
    else amendment.unparsed.push(clause.trim());
  }
  return amendment;
}

/** True when the amendment actually asks for something (vs. "yes, what about the other one"). */
export function amendmentHasEdits(a: Amendment): boolean {
  return a.changes.length > 0 || Boolean(a.appendBody) || Boolean(a.subject);
}

/** Which key in a payload's values a canonical field refers to. */
const KEY_HINTS: Record<CanonicalField, RegExp> = {
  first_name: /first.*name|fname|given/i,
  last_name: /last.*name|surname|family.*name|lname/i,
  grade: /grade|year|class/i,
  email: /e?mail/i,
  phone: /phone|cell|mobile|tel/i,
  address: /address|street|addr/i,
  dob: /dob|birth|birthday/i,
};

const FIELD_LABEL: Record<CanonicalField, string> = {
  first_name: 'first name',
  last_name: 'last name',
  grade: 'grade',
  email: 'email',
  phone: 'phone',
  address: 'address',
  dob: 'date of birth',
};

export interface AmendmentOutcome {
  /** Human-readable list of what we changed, e.g. "last name -> Howard". */
  applied: string[];
  /** Changes we understood but could not place on this proposal, so the parent is told. */
  unapplied: string[];
}

/**
 * Apply an amendment to the staged steps in place.
 *
 * A field edit only lands when the payload actually has a matching field: adding a key the form
 * does not have would change the proposal into something the parent never saw. Email steps take
 * only body/subject edits — rewriting the prose of a drafted email from "last name Howard" would
 * be guessing, so that is reported as unapplied instead.
 */
export function applyAmendmentToSteps(steps: Step[] | undefined, amendment: Amendment): AmendmentOutcome {
  const applied: string[] = [];
  const unapplied: string[] = [];
  for (const step of steps ?? []) {
    if (step.channel === 'submit') {
      const payload = step.payload as { channel: 'submit'; values?: Record<string, string> };
      const values = payload.values ?? {};
      for (const change of amendment.changes) {
        const key = Object.keys(values).find((k) => KEY_HINTS[change.field].test(k));
        if (!key) {
          unapplied.push(`${FIELD_LABEL[change.field]} -> ${change.value} (no such field on this form)`);
          continue;
        }
        values[key] = change.value;
        applied.push(`${FIELD_LABEL[change.field]} -> ${change.value}`);
      }
      payload.values = values;
    } else if (step.channel === 'email') {
      const payload = step.payload as { channel: 'email'; subject: string; body: string };
      if (amendment.appendBody) {
        payload.body = `${payload.body.trimEnd()}\n\n${amendment.appendBody}`;
        applied.push(`added to the email: "${amendment.appendBody}"`);
      }
      if (amendment.subject) {
        payload.subject = amendment.subject;
        applied.push(`subject -> ${amendment.subject}`);
      }
      for (const change of amendment.changes) {
        unapplied.push(`${FIELD_LABEL[change.field]} -> ${change.value} (I'd need to rewrite the email for that)`);
      }
    } else {
      for (const change of amendment.changes) unapplied.push(`${FIELD_LABEL[change.field]} -> ${change.value}`);
    }
  }
  return { applied, unapplied };
}

/** Keys we never echo back to a parent or into a proposal summary. */
const SECRET_KEY = /password|passwd|pwd|otp|code|secret|token|cvv|ssn/i;

/** The proposal in plain text, so an amended step is shown before it is approved again. */
export function describeProposal(steps: Step[] | undefined): string {
  return (steps ?? [])
    .map((step) => {
      if (step.channel === 'submit') {
        const p = step.payload as { channel: 'submit'; url: string; values?: Record<string, string> };
        const lines = Object.entries(p.values ?? {})
          .filter(([k]) => !SECRET_KEY.test(k))
          .map(([k, v]) => `  - ${k}: ${v}`);
        return `Submit the form at ${p.url}${lines.length ? `\n${lines.join('\n')}` : ''}`;
      }
      if (step.channel === 'email') {
        const p = step.payload as { channel: 'email'; subject: string; body: string };
        return `Email to ${step.counterparty.email ?? step.counterparty.name ?? 'the school'}\n  Subject: ${p.subject}\n${p.body
          .split('\n')
          .map((l) => `  ${l}`)
          .join('\n')}`;
      }
      if (step.channel === 'call') {
        const p = step.payload as { channel: 'call'; objective: { goal: string } };
        return `Call ${step.counterparty.name ?? 'the school'} about ${p.objective.goal}`;
      }
      return `${step.channel} (${step.intent})`;
    })
    .join('\n\n');
}

/** A one-line reminder of what is waiting, for when we could not read the amendment. */
export function describeShortly(steps: Step[] | undefined): string {
  const first = (steps ?? [])[0];
  if (!first) return 'that';
  if (first.channel === 'submit') return 'the form ready to submit';
  if (first.channel === 'email') return 'the email ready to send';
  if (first.channel === 'call') return 'the call ready to make';
  return `the ${first.channel} step ready to go`;
}
