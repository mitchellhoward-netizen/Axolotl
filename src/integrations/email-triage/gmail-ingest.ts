/**
 * Read school mail straight from the parent's Gmail, instead of waiting for them to forward it.
 *
 * Forwarding asks a parent to build a Gmail filter before they get any value, and most never
 * do. With the Google account connected (gmail.readonly, which the connect link already asks
 * for) and monitoring turned on, this reader checks for new mail from the school every few
 * minutes and hands each message to the same triage the forwarding path uses: classify, keep
 * the summary, never the body, and batch it into the digest.
 *
 * What it reads, and only this:
 *  - families that turned monitoring on (family_inbox.monitoring_consented_at) AND connected Google;
 *  - mail FROM their school domains or a school platform (ParentSquare, ClassDojo, Remind…),
 *    selected by the Gmail search itself, so other mail is never downloaded at all;
 *  - mail whose sender Google authenticated (Gmail's own Authentication-Results header).
 *
 * The cursor (gmail_ingest.last_checked_at) moves only after a pass succeeds, with an overlap,
 * so a failed poll re-reads rather than skips; Message-ID dedupe makes the re-read harmless.
 */
import { getSupabase } from '../db.js';
import type { LlmClient } from '../../agent/llm.js';
import { refreshGmailAccessToken, getGmailToken } from '../gmail.js';
import { SCHOOL_PLATFORM_SENDERS, isSchoolSender, authVerdicts, domainOf, triageForFamily, type InboundEmailPayload, type TriageResult, type TriageSink } from './triage.js';

const API = () => (process.env.GMAIL_API_BASE ?? 'https://gmail.googleapis.com').replace(/\/$/, '');
/** First pass reaches back this far, so connecting shows value right away. */
const BACKFILL_MS = (Number(process.env.GMAIL_BACKFILL_DAYS) || 3) * 24 * 60 * 60 * 1000;
/** Re-read this much before the cursor, to cover mail that lands late in the index. */
const OVERLAP_MS = 10 * 60 * 1000;
const MAX_PER_PASS = 25;

export interface GmailMessage {
  id: string;
  payload?: GmailPart & { headers?: Array<{ name: string; value: string }> };
}
interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
}

/** The Gmail search that selects school mail after a point in time. */
export function schoolMailQuery(schoolDomains: string[], afterMs: number): string {
  const extra = (process.env.EMAIL_PLATFORM_SENDERS ?? '').split(',').map((d) => d.trim()).filter(Boolean);
  const senders = [...new Set([...schoolDomains, ...SCHOOL_PLATFORM_SENDERS, ...extra].map((d) => d.toLowerCase()).filter(Boolean))];
  // {a b} is OR in Gmail search; `from:domain` matches the domain and its subdomains.
  return `after:${Math.floor(afterMs / 1000)} {${senders.map((d) => `from:${d}`).join(' ')}} -in:chats -in:sent -in:drafts`;
}

const decode = (data?: string) => (data ? Buffer.from(data, 'base64url').toString('utf8') : '');

function findPart(part: GmailPart | undefined, mime: string): string {
  if (!part) return '';
  if (part.mimeType === mime && part.body?.data) return decode(part.body.data);
  for (const p of part.parts ?? []) {
    const hit = findPart(p, mime);
    if (hit) return hit;
  }
  return '';
}

/** A Gmail API message as the payload the triage pipeline takes. */
export function toInboundPayload(msg: GmailMessage, to?: string): InboundEmailPayload {
  const headers = Object.fromEntries((msg.payload?.headers ?? []).map((h) => [h.name.toLowerCase(), h.value]));
  const text = findPart(msg.payload, 'text/plain');
  const html = text ? undefined : findPart(msg.payload, 'text/html') || decode(msg.payload?.body?.data);
  return {
    to: to ?? headers['to'],
    from: headers['from'],
    subject: headers['subject'],
    text: text || undefined,
    html,
    headers,
    // Same key as a forwarded copy of the same mail, so the two paths dedupe against each other.
    message_id: headers['message-id'] || `gmail:${msg.id}`,
    // Added by Google's own servers on receipt, so it is not the sender's claim.
    auth_results: headers['authentication-results'] ?? headers['arc-authentication-results'],
  };
}

/** Accept only mail from the school, and only when Google authenticated the sender. */
export function acceptGmailMessage(p: InboundEmailPayload, schoolDomains: string[]): string | null {
  const fromDomain = domainOf(p.from);
  if (!fromDomain) return 'no sender';
  if (!isSchoolSender(fromDomain, schoolDomains)) return 'sender not a school';
  const auth = authVerdicts(p.auth_results);
  if (auth.dmarc === 'fail') return 'dmarc failed';
  if (auth.dkim !== 'pass' && auth.spf !== 'pass') return 'sender not authenticated';
  return null;
}

async function gmailGet<T>(path: string, token: string, fetchImpl: typeof fetch): Promise<T> {
  const r = await fetchImpl(`${API()}/gmail/v1/users/me/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`gmail ${r.status}`);
  return (await r.json()) as T;
}

export interface IngestInput {
  familyId: string;
  schoolDomains: string[];
  accessToken: string;
  /** Read mail after this time (ms). */
  afterMs: number;
  mailbox?: string;
  llm?: LlmClient;
  sink?: TriageSink;
  fetchImpl?: typeof fetch;
}

export interface IngestResult {
  listed: number;
  triaged: number;
  skipped: Record<string, number>;
  results: TriageResult[];
}

/** One pass over one family's inbox. Throws on an API failure so the caller keeps the cursor. */
export async function ingestGmailForFamily(input: IngestInput): Promise<IngestResult> {
  const f = input.fetchImpl ?? fetch;
  const q = encodeURIComponent(schoolMailQuery(input.schoolDomains, input.afterMs));
  const list = await gmailGet<{ messages?: Array<{ id: string }> }>(`messages?q=${q}&maxResults=${MAX_PER_PASS}`, input.accessToken, f);
  const out: IngestResult = { listed: list.messages?.length ?? 0, triaged: 0, skipped: {}, results: [] };
  for (const { id } of list.messages ?? []) {
    const msg = await gmailGet<GmailMessage>(`messages/${encodeURIComponent(id)}?format=full`, input.accessToken, f);
    const payload = toInboundPayload(msg, input.mailbox);
    const why = acceptGmailMessage(payload, input.schoolDomains);
    if (why) {
      out.skipped[why] = (out.skipped[why] ?? 0) + 1;
      continue;
    }
    const r = await triageForFamily(input.familyId, payload, input.llm, input.sink);
    out.results.push(r);
    if (r.status === 'ok') out.triaged++;
  }
  return out;
}

// ── The poller ──────────────────────────────────────────────────────────────

interface CursorRow {
  guardian_id: string;
  last_checked_at: string | null;
}

async function readCursor(familyId: string): Promise<number | undefined> {
  const c = getSupabase();
  if (!c) return undefined;
  const { data } = await c.from('gmail_ingest').select('guardian_id, last_checked_at').eq('guardian_id', familyId).maybeSingle();
  const at = (data as CursorRow | null)?.last_checked_at;
  return at ? Date.parse(at) : undefined;
}

async function writeCursor(familyId: string, patch: { last_checked_at?: string; last_error?: string | null }): Promise<void> {
  const c = getSupabase();
  if (!c) return;
  const { error } = await c.from('gmail_ingest').upsert({ guardian_id: familyId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'guardian_id' });
  if (error) console.warn('[gmail-ingest] cursor write failed:', error.message);
}

/** Check every consenting, connected family once. */
export async function pollGmailInboxes(llm?: LlmClient): Promise<void> {
  const c = getSupabase();
  if (!c) return;
  const { data, error } = await c
    .from('family_inbox')
    .select('family_id, school_domains, monitoring_consented_at')
    .not('monitoring_consented_at', 'is', null)
    .limit(500);
  if (error) {
    console.warn('[gmail-ingest] could not list inboxes:', error.message);
    return;
  }
  for (const row of data ?? []) {
    const familyId = String(row.family_id);
    const tok = await getGmailToken(familyId).catch(() => undefined);
    if (!tok?.refreshToken) continue; // forwarding-only family
    const startedAt = Date.now();
    try {
      const { accessToken } = await refreshGmailAccessToken(tok.refreshToken);
      const cursor = await readCursor(familyId);
      const consentedAt = Date.parse(String(row.monitoring_consented_at)) || startedAt;
      const afterMs = cursor ? cursor - OVERLAP_MS : Math.min(consentedAt, startedAt) - BACKFILL_MS;
      const r = await ingestGmailForFamily({
        familyId,
        schoolDomains: (row.school_domains as string[] | null) ?? [],
        accessToken,
        afterMs,
        mailbox: tok.email,
        llm,
      });
      await writeCursor(familyId, { last_checked_at: new Date(startedAt).toISOString(), last_error: null });
      if (r.listed) console.log(`[gmail-ingest] ${familyId}: ${r.listed} school message(s), ${r.triaged} new, skipped ${JSON.stringify(r.skipped)}`);
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      console.warn(`[gmail-ingest] ${familyId}: ${msg}`);
      await writeCursor(familyId, { last_error: msg.slice(0, 200) });
    }
  }
}

/** Start the reader. Off unless Google OAuth is configured. */
export function startGmailIngest(llm?: LlmClient, intervalMs = Number(process.env.GMAIL_POLL_MS) || 5 * 60 * 1000): void {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return;
  let running = false;
  const tick = () => {
    if (running) return; // a slow pass never overlaps the next
    running = true;
    pollGmailInboxes(llm)
      .catch((e) => console.error('[gmail-ingest] poll error:', (e as Error)?.message ?? e))
      .finally(() => {
        running = false;
      });
  };
  setTimeout(tick, 30_000);
  setInterval(tick, intervalMs);
}
