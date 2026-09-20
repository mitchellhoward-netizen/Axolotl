/**
 * Inbox provisioning — issuing a family their forwarding address.
 *
 * The triage pipeline (guards → classify → digest → action) is proven, but until now the
 * only way a family could get an inbound address was to ask the agent for one and name
 * their school's domain (`monitor_school_email` in src/agent/tools.ts). That means the
 * product's core promise had no trigger a parent would ever find. This module issues the
 * address during onboarding instead, and learns what it needs along the way.
 *
 * Two things it deliberately does NOT do:
 *  - it never invents an address when INBOUND_DOMAIN is unset. A made-up address is worse
 *    than no address: the parent forwards real school mail into a void.
 *  - it never weakens the sender-domain guard. We only ever ADD domains we actually read
 *    from the parent (or a school-shaped address they sent us). An empty allowlist is a
 *    real state and the copy says so rather than pretending the address will work.
 */
import { getFamilyInbox, makeLocalPart, upsertFamilyInbox, updateFamilyInbox, type FamilyInboxRow } from './store.js';

/** Consumer mailbox providers are never a school's sending domain. */
const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'outlook.com', 'hotmail.com', 'live.com',
  'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'msn.com', 'gmx.com',
  'comcast.net', 'att.net', 'verizon.net', 'sbcglobal.net', 'cox.net', 'charter.net', 'mail.com',
]);

const SCHOOLISH = /\b(school|district|office|teacher|principal|academy|elementary|middle|high|usd|isd|pta|p ta)\b/i;

/** A street address: a house number, a street name, and a suffix or a ZIP. */
const STREET_SUFFIX = /\b(st|street|ave|avenue|rd|road|dr|drive|blvd|boulevard|ln|lane|way|ct|court|pl|place|ter|terrace|cir|circle|hwy|highway|pkwy|parkway|trl|trail|loop|run|cv|cove)\b/i;
const ZIP = /\b\d{5}(?:-\d{4})?\b/;

function normalizeDomain(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@/, '').replace(/[.,;:)]+$/, '');
}

/**
 * The school's sending domain, read from what the parent actually sent.
 *
 * Priority: an email address they gave us that isn't a consumer mailbox → a bare domain
 * they gave us when the message is talking about school. Deliberately conservative: a
 * wrong domain silently blocks real mail, and a spoofing guard that accepts too much is
 * worse than one that accepts too little.
 */
export function parseSchoolDomain(text: string, options: { inboundDomain?: string } = {}): string | undefined {
  const body = String(text ?? '');
  if (!body.trim()) return undefined;
  const inbound = normalizeDomain(options.inboundDomain ?? process.env.INBOUND_DOMAIN ?? '');
  const emails = body.match(/[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g) ?? [];
  for (const e of emails) {
    const domain = normalizeDomain(e.slice(e.indexOf('@') + 1));
    if (!domain || domain === inbound) continue;
    if (PERSONAL_DOMAINS.has(domain)) continue;
    return domain;
  }
  // A bare domain, only when the message is clearly about the school ("office@suesd.org"
  // without a scheme, or "their address is suesd.org"). Avoids grabbing any old .com.
  if (SCHOOLISH.test(body)) {
    const bare = body.match(/(?:^|\s|@)([a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:org|edu|gov|us|net|com))\b/i);
    const domain = bare?.[1] ? normalizeDomain(bare[1]) : '';
    if (domain && !PERSONAL_DOMAINS.has(domain) && domain !== inbound && !ZIP.test(domain)) return domain;
  }
  return undefined;
}

/**
 * A mailing address, captured for one reason: the FTC health-breach rule cannot be
 * satisfied over iMessage (notice needs email plus text, or postal mail), so it has to be
 * collected before there is ever an incident, not after one.
 *
 * Conservative on purpose — we would rather store nothing than store half an address or a
 * street number scraped out of an unrelated sentence.
 */
export function parseMailingAddress(text: string): string | undefined {
  const body = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!body || body.length > 400) return undefined;
  // "123 Main St", "456 Oak Ave Apt 3, Santa Cruz, CA 95060"
  const m = body.match(/\b\d{1,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,4}\s+(?:st|street|ave|avenue|rd|road|dr|drive|blvd|boulevard|ln|lane|way|ct|court|pl|place|ter|terrace|cir|circle|hwy|highway|pkwy|parkway|trl|trail|loop|run|cv|cove)\b\.?(?:\s*(?:apt|unit|ste|suite|#)\s*[A-Za-z0-9-]+)?(?:,\s*[A-Za-z .'-]+)?(?:,\s*[A-Z]{2})?(?:\s+\d{5}(?:-\d{4})?)?/i);
  if (m) return m[0].trim().slice(0, 200);
  // A bare "123 Main St, Soquel, CA 95073" where the suffix is abbreviated oddly still
  // needs a house number plus a ZIP to count.
  const zipForm = body.match(/\b\d{1,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){1,4},\s*[A-Za-z .'-]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?/);
  if (zipForm && STREET_SUFFIX.test(zipForm[0]) ) return zipForm[0].trim().slice(0, 200);
  if (zipForm) return zipForm[0].trim().slice(0, 200);
  return undefined;
}

export interface ProvisionInput {
  familyId: string;
  /** Used only to build a readable local part on FIRST provisioning. */
  seed?: string;
  /** Domains to ADD to the allowlist (never removes any). */
  domains?: string[];
  mailingAddress?: string;
}

export interface ProvisionResult {
  ok: boolean;
  /** True the first time we create the row — the caller uses this to send the address ONCE. */
  created: boolean;
  localPart?: string;
  /** The full address, only when INBOUND_DOMAIN is configured. */
  address?: string;
  domains: string[];
  hasMailingAddress: boolean;
  detail?: string;
}

/**
 * Idempotent: the local part is generated once and then reused forever, so a family's
 * address never changes under them (and a re-run on every message is safe).
 */
export async function provisionFamilyInbox(input: ProvisionInput): Promise<ProvisionResult> {
  const existing: FamilyInboxRow | null = await getFamilyInbox(input.familyId);
  const localPart = existing?.local_part ?? makeLocalPart(input.seed);
  const before = (existing?.school_domains ?? []).map(normalizeDomain).filter(Boolean);
  const incoming = (input.domains ?? []).map(normalizeDomain).filter(Boolean);
  const domains = [...new Set([...before, ...incoming])];

  const inboundDomain = normalizeDomain(process.env.INBOUND_DOMAIN ?? '');
  const address = inboundDomain ? `${localPart}@${inboundDomain}` : undefined;

  // Nothing new to write and the row already exists: report state without touching the row.
  const learningAddress = Boolean(input.mailingAddress && !existing?.mailing_address);
  const learningDomains = incoming.some((d) => !before.includes(d));
  if (existing && !learningAddress && !learningDomains) {
    return {
      ok: Boolean(address),
      created: false,
      localPart,
      address,
      domains,
      hasMailingAddress: Boolean(existing.mailing_address),
      detail: inboundDomain ? undefined : 'INBOUND_DOMAIN is not set on this deployment, so there is no address to hand out yet',
    };
  }

  let row = await upsertFamilyInbox({
    family_id: input.familyId,
    local_part: localPart,
    school_domains: domains,
    // The disclosure ("forward school mail here and I'll read it") precedes this and is
    // logged; the parent controls what actually arrives. Recorded so the audit trail shows
    // when monitoring began, and so evaluateInbound can accept real mail.
    monitoring_consented_at: existing?.monitoring_consented_at ?? new Date().toISOString(),
    ...(learningAddress ? { mailing_address: input.mailingAddress } : {}),
  });
  // If the write failed while we were trying to store an address, the most likely cause is a
  // database that has not had `db/email-triage.sql` applied since mailing_address was added.
  // Name the migration in the log rather than failing silently: a mailing address we believe
  // we hold but do not is exactly the kind of gap that only shows up during an incident.
  if (!row && learningAddress) {
    await updateFamilyInbox(input.familyId, { mailing_address: input.mailingAddress }).catch(() => {});
    row = await getFamilyInbox(input.familyId);
    if (!row?.mailing_address) {
      console.warn('[email] could not store a mailing address — apply db/email-triage.sql (adds family_inbox.mailing_address)');
    }
  }

  return {
    ok: Boolean(address),
    created: !existing,
    localPart,
    address,
    domains,
    hasMailingAddress: Boolean(row?.mailing_address ?? existing?.mailing_address),
    detail: row ? (inboundDomain ? undefined : 'INBOUND_DOMAIN is not set on this deployment, so there is no address to hand out yet') : 'could not save the inbox row',
  };
}

/**
 * What the parent is told when we hand over the address. Honest about the two things that
 * are true and easy to get wrong: we only ever read what they forward, and mail only gets
 * through once we know the school's sending domain.
 */
export function forwardingAddressMessage(result: ProvisionResult): string | undefined {
  if (!result.address) return undefined;
  const lines = [
    `Your private forwarding address is ${result.address}`,
    '',
    `Forward any school email to it and I'll triage it into one short list of what actually needs you. I only ever read what you forward; your inbox stays yours.`,
  ];
  if (!result.domains.length) {
    lines.push('', `One thing first: I need the email address your school sends from (like office@yourschool.org) before I can accept anything. Send it to me and you're set.`);
  }
  lines.push('', 'School mail only — please don\u2019t forward anything with medical records or passwords in it.');
  return lines.join('\n');
}
