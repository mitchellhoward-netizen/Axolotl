import 'dotenv/config';

/**
 * Skyvern form-fill service, wired strictly behind chuy's consent gate.
 *
 * THE SAFETY PRINCIPLE: "fill + submit" is NEVER one action, and "don't submit" is
 * never the guarantee. Phase A fills only; Phase B is a SEPARATE task reachable only
 * from the post-YES, consent-gated code path. There is no code path that submits
 * before the parent's strict YES.
 *
 * IMPORTANT: never log the API key or the family's PII values.
 */

const BASE = process.env.SKYVERN_BASE_URL ?? 'https://api.skyvern.com';
const KEY = process.env.SKYVERN_API_KEY ?? '';
const MAX_STEPS = Number(process.env.SKYVERN_MAX_STEPS) || 25;
const FILL_TIMEOUT_MS = Number(process.env.SKYVERN_FILL_TIMEOUT_MS) || 60000;
const POLL_MS = 1500;

export function skyvernEnabled(): boolean {
  return Boolean(KEY);
}

// ── Shared low-level access (used by the connector in integrations/connections) ──
// Keeps the API key encapsulated: callers pass a path, never the key.

/** POST a JSON body to a Skyvern v1 path (x-api-key auth). Returns null on any failure. */
export async function skyvernApi(path: string, body: unknown, timeoutMs = 20000): Promise<Record<string, unknown> | null> {
  return api(path, body, timeoutMs);
}

/** GET a Skyvern v1 path as JSON. Returns null on any failure. */
export async function skyvernApiGet(path: string): Promise<Record<string, unknown> | null> {
  try {
    const r = await withTimeout(fetch(`${BASE}${path}`, { headers: { 'x-api-key': KEY } }), 15000, null);
    if (!r?.ok) return null;
    return (await r.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Build the authenticated RFB-over-WebSocket URL for a live browser session. This is the
 * ONLY handle that can see the portal as the parent — it carries our API key, so it must
 * NEVER reach a parent's browser. `web.ts` proxies it server-side for the takeover page.
 */
export function skyvernVncUrl(browserSessionId: string): { url: string; clientId: string } | null {
  if (!KEY || !browserSessionId) return null;
  const clientId = 'chuy-' + Math.random().toString(36).slice(2, 10);
  const wsBase = BASE.replace(/^http/i, 'ws');
  return {
    url: `${wsBase}/v1/stream/vnc/browser_session/${browserSessionId}?apikey=${encodeURIComponent(KEY)}&client_id=${encodeURIComponent(clientId)}`,
    clientId,
  };
}

/** Close a Skyvern browser profile (revoke a connection's only credential). */
export async function deleteBrowserProfile(browserProfileId: string): Promise<boolean> {
  if (!KEY || !browserProfileId) return false;
  try {
    const r = await withTimeout(
      fetch(`${BASE}/v1/browser_profiles/${browserProfileId}`, { method: 'DELETE', headers: { 'x-api-key': KEY } }),
      15000,
      null,
    );
    return Boolean(r?.ok);
  } catch {
    return false;
  }
}

/** Poll a run to a terminal state (bounded). Exposed for the connector's read/verify tasks. */
export async function skyvernPollRun(
  runId: string,
  timeoutMs: number,
): Promise<{ status: string; output?: unknown; failure?: unknown }> {
  return pollRun(runId, timeoutMs);
}

/** The artifacts (screenshot) URL for a finished run. */
export async function skyvernRunScreenshot(runId: string): Promise<string | undefined> {
  return reviewScreenshot(runId);
}

export interface FillResult {
  ok: boolean;
  runId?: string;
  browserSessionId?: string;
  status: string;
  reviewScreenshotUrl?: string;
  blocked?: 'account' | 'captcha' | 'signin' | 'not_found' | null;
  detail?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

async function api(path: string, body: unknown, timeoutMs = 20000): Promise<Record<string, unknown> | null> {
  try {
    const res = await withTimeout(
      fetch(`${BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': KEY },
        body: JSON.stringify(body),
      }),
      timeoutMs,
      null,
    );
    if (!res) return null;
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.warn(`[skyvern] ${path} non-OK ${res.status}: ${txt.slice(0, 200)}`);
      return null;
    }
    return (await res.json()) as Record<string, unknown>;
  } catch (e) {
    console.warn('[skyvern] api error', path, (e as Error)?.message ?? e);
    return null;
  }
}

function blockedFrom(output: unknown, failure: unknown): FillResult['blocked'] {
  const s = JSON.stringify([output, failure]).toLowerCase();
  if (/captcha/i.test(s)) return 'captcha';
  if (/sign ?in|log ?in|authenticate|credential/i.test(s)) return 'signin';
  if (/create an account|sign ?up|account creation/i.test(s)) return 'account';
  if (/not found|404|could not find|does not exist/i.test(s)) return 'not_found';
  return null;
}

async function pollRun(runId: string, timeoutMs: number): Promise<{ status: string; output?: unknown; failure?: unknown }> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const r = await withTimeout(fetch(`${BASE}/v1/runs/${runId}`, { headers: { 'x-api-key': KEY } }), 10000, null);
    if (r?.ok) {
      const j = (await r.json()) as { status?: string; output?: unknown; failure_reason?: unknown };
      if (j.status && ['completed', 'failed', 'terminated', 'canceled', 'timed_out'].includes(j.status)) {
        return { status: j.status, output: j.output, failure: j.failure_reason };
      }
    }
    await sleep(POLL_MS);
  }
  return { status: 'timed_out' };
}

async function reviewScreenshot(runId: string): Promise<string | undefined> {
  try {
    const r = await withTimeout(fetch(`${BASE}/v1/runs/${runId}/artifacts`, { headers: { 'x-api-key': KEY } }), 10000, null);
    if (!r?.ok) return undefined;
    const j = (await r.json()) as unknown;
    const arts = (Array.isArray(j) ? j : ((j as { artifacts?: unknown[] })?.artifacts ?? [])) as Array<{ artifact_type?: string; signed_url?: string }>;
    return arts.find((a) => a.artifact_type === 'screenshot_final')?.signed_url;
  } catch {
    return undefined;
  }
}

/** Phase A: open a persistent browser session + FILL the form (never submit). */
export async function fillFormForReview(input: {
  formUrl: string;
  values: Record<string, string>;
  program?: string;
  maxSteps?: number;
}): Promise<FillResult> {
  if (!KEY) return { ok: false, status: 'disabled', blocked: null };
  // 1. Open a persistent session.
  const session = await api('/v1/browser_sessions', {});
  const browserSessionId = String(session?.browser_session_id ?? '');
  if (!browserSessionId) return { ok: false, status: 'session_failed', blocked: null };

  // 2. Phase A task: FILL ONLY. The prompt NEVER instructs submit, enroll, pay, or
  // account creation — those are forbidden; stop after filling, report a wall.
  const fieldLines = Object.entries(input.values)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');
  const prompt =
    `Fill out this form using the following information (for the family's own application). Do NOT click Submit, Enroll, Pay, purchase, or create an account. ` +
    `Stop after filling every field. If you hit a sign-in, CAPTCHA, or account-creation wall, stop and report which. ` +
    `Leave any field you don't have empty. Do NOT submit or complete the form.\n\nFields to enter:\n${fieldLines}`;
  const runRes = await api('/v1/run/tasks', {
    prompt,
    url: input.formUrl,
    max_steps: input.maxSteps ?? MAX_STEPS,
    browser_session_id: browserSessionId,
  });
  const runId = String(runRes?.run_id ?? '');
  if (!runId) return { ok: false, browserSessionId, status: 'task_failed', blocked: null };

  // 3. Poll to terminal (bounded) — on timeout, cancel.
  const terminal = await pollRun(runId, FILL_TIMEOUT_MS);
  if (terminal.status === 'timed_out') {
    void fetch(`${BASE}/v1/runs/${runId}/cancel`, { method: 'POST', headers: { 'x-api-key': KEY } }).catch(() => {});
    return { ok: false, runId, browserSessionId, status: 'timed_out', blocked: blockedFrom(terminal.output, terminal.failure), detail: 'Timed out filling — I cancelled it; I can hand you the link instead.' };
  }
  const screenshot = await reviewScreenshot(runId);
  const ok = terminal.status === 'completed';
  return {
    ok,
    runId,
    browserSessionId,
    status: terminal.status,
    reviewScreenshotUrl: screenshot,
    blocked: blockedFrom(terminal.output, terminal.failure),
    detail: ok ? undefined : `Skyvern ${terminal.status} — check the screenshot / I'll hand you the link.`,
  };
}

/**
 * Phase B: navigate to the form, RE-FILL it with the same values, then submit.
 * Called ONLY from the post-YES consent path (SubmitAdapter). The filled page from
 * Phase A does not survive between Skyvern tasks, so we re-fill here; Phase A's
 * screenshot was the review preview. `browserSessionId` is optional and only needed
 * to carry sign-in cookies for auth-gated forms.
 */
export async function submitFilledForm(input: {
  url: string;
  values: Record<string, string>;
  browserSessionId?: string;
}): Promise<{ ok: boolean; status: string; confirmationScreenshotUrl?: string }> {
  if (!KEY) return { ok: false, status: 'disabled' };
  if (!input.url) return { ok: false, status: 'no_url' };
  const fieldLines = Object.entries(input.values).map(([k, v]) => `- ${k}: ${v}`).join('\n');
  const prompt =
    `Go to this form, fill it in with the following information, then CLICK the Submit button to submit it. ` +
    `Do not create an account or pay. Fill every field you can, then submit.\n\nFields:\n${fieldLines}`;
  const runRes = await api('/v1/run/tasks', {
    prompt,
    url: input.url,
    max_steps: 12,
    ...(input.browserSessionId ? { browser_session_id: input.browserSessionId } : {}),
  });
  const runId = String(runRes?.run_id ?? '');
  if (!runId) return { ok: false, status: 'task_failed' };
  const terminal = await pollRun(runId, 60000);
  const screenshot = await reviewScreenshot(runId);
  return { ok: terminal.status === 'completed', status: terminal.status, confirmationScreenshotUrl: screenshot };
}

/** Always close the persistent session when done / on decline / on timeout. */
export async function closeSession(browserSessionId: string): Promise<void> {
  if (!browserSessionId) return;
  try {
    await fetch(`${BASE}/v1/browser_sessions/${browserSessionId}/close`, { method: 'POST', headers: { 'x-api-key': KEY } }).catch(() => {});
  } catch {
    /* best-effort */
  }
}

// ── Async fill (fire-and-forget + webhook) ──────────────────────────────────
// The browser often needs several minutes to fill a form. Instead of holding the
// parent's turn open on that (or worse, hitting a short timeout and cancelling),
// we FIRE the fill task and return instantly. The Skyvern webhook (or a fallback
// poller) completes the run later; the parent is then texted the filled-form
// preview + a consent-gated "reply YES to submit" step. Nothing submits until the
// parent's strict YES.
//
// SAFETY: the "fill" task is NEVER a submit. The submit only happens through the
// post-YES, consent-gated SubmitAdapter (Phase B), unchanged.

/** How long to poll a webhook-reported run for a true terminal state (never short). */
const POLL_TIMEOUT_MS = Number(process.env.SKYVERN_POLL_TIMEOUT_MS) || 900000; // 15 min
/** After this long, send the parent a gentle "still working" notice (once per fill). */
const STILL_WORKING_MS = Number(process.env.SKYVERN_STILL_WORKING_MS) || 20 * 60 * 1000; // 20 min
/** Safety valve — drop a pending fill that never resolved (well beyond any real fill). */
const STALE_MS = Number(process.env.SKYVERN_EXPIRE_MS) || 3 * 60 * 60 * 1000; // 3 h
const TERMINAL = ['completed', 'failed', 'terminated', 'canceled', 'timed_out'];

interface PendingFill {
  runId: string;
  formUrl: string;
  values: Record<string, string>;
  browserSessionId: string;
  startedAt: number;
  /** When (ms epoch) we last sent the parent a "still working" notice (once). */
  progressNoticeAt?: number;
  /** Opaque context carried through to the completion handler (e.g. conversationId). */
  meta?: Record<string, unknown>;
}

export interface FillCompleteInfo {
  runId: string;
  ok: boolean;
  status: string;
  reviewScreenshotUrl?: string;
  blocked?: FillResult['blocked'];
  detail?: string;
  meta?: Record<string, unknown>;
}

type FillCompleteHandler = (info: FillCompleteInfo) => Promise<void>;
/** Optional gentle "still working" notice (parent told "On it" but the fill is slow). */
type FillStillWorkingHandler = (info: { runId: string; meta?: Record<string, unknown> }) => Promise<void>;

const pendingFills = new Map<string, PendingFill>();
/** runId's actually DELIVERED to the handler — a later webhook/poller won't re-deliver. */
const completedFills = new Set<string>();
/** runId's currently being resolved (in-flight) — guards concurrent webhook+poller double-fire. */
const handlingFills = new Set<string>();
let fillCompleteHandler: FillCompleteHandler | undefined;
let fillStillWorkingHandler: FillStillWorkingHandler | undefined;

/** Register the callback that receives a finished fill (texts the parent + stages the submit). */
export function setFillCompleteHandler(fn: FillCompleteHandler): void {
  fillCompleteHandler = fn;
}

/** Register the callback that sends a gentle "still working" notice for a slow fill. */
export function setFillStillWorkingHandler(fn: FillStillWorkingHandler): void {
  fillStillWorkingHandler = fn;
}

/**
 * Fire the Phase A FILL task but DON'T wait for it to finish. Creates a persistent
 * browser session, submits a fill-only task (never a submit), records it as pending,
 * and returns as soon as the run is created. The parent keeps the conversation going
 * meanwhile; the webhook/poller completes it.
 */
export async function fillFormForReviewAsync(input: {
  formUrl: string;
  values: Record<string, string>;
  program?: string;
  maxSteps?: number;
  meta?: Record<string, string>;
}): Promise<{ ok: boolean; runId?: string; browserSessionId?: string; detail?: string }> {
  if (!KEY) return { ok: false, detail: 'disabled' };
  // 1. Open a persistent browser session (carried so Phase B can reuse sign-in cookies).
  const session = await api('/v1/browser_sessions', {});
  const browserSessionId = String(session?.browser_session_id ?? '');
  if (!browserSessionId) return { ok: false, detail: 'session_failed' };

  // 2. Phase A task: FILL ONLY. The prompt NEVER instructs submit / enroll / pay /
  // account-creation — stop after filling and report a wall.
  const fieldLines = Object.entries(input.values)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');
  const prompt =
    `Fill out this form using the following information (for the family's own application). Do NOT click Submit, Enroll, Pay, purchase, or create an account. ` +
    `Stop after filling every field. If you hit a sign-in, CAPTCHA, or account-creation wall, stop and report which. ` +
    `Leave any field you don't have empty. Do NOT submit or complete the form.\n\nFields to enter:\n${fieldLines}`;
  const webhookUrl =
    process.env.SKYVERN_WEBHOOK_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/webhooks/skyvern` : undefined);
  const runRes = await api('/v1/run/tasks', {
    prompt,
    url: input.formUrl,
    max_steps: input.maxSteps ?? MAX_STEPS,
    browser_session_id: browserSessionId,
    ...(webhookUrl ? { webhook_url: webhookUrl } : {}),
  });
  const runId = String(runRes?.run_id ?? '');
  if (!runId) {
    await closeSession(browserSessionId);
    return { ok: false, browserSessionId, detail: 'task_failed' };
  }

  pendingFills.set(runId, {
    runId,
    formUrl: input.formUrl,
    values: input.values,
    browserSessionId,
    startedAt: Date.now(),
    // Fill in the run-specific context so the completion handler can text the right
    // family the preview and stage a consent-gated submit (reusing the session).
    meta: { ...(input.meta ?? {}), formUrl: input.formUrl, browserSessionId },
  });
  return { ok: true, runId, browserSessionId };
}

/**
 * Resolve a run to a true terminal state (polling, never a short timeout), fetch the
 * review screenshot, drop the pending row, and hand the result to the registered
 * handler. On a FAILED fill the browser session is closed; on a SUCCESSFUL fill it is
 * left open so the post-YES Phase B submit can reuse it (SubmitAdapter closes it
 * after). Idempotent: called by both the webhook and the fallback poller; a concurrent
 * in-flight call is skipped, and a delivered run is never re-delivered. A run that has
 * NOT reached a true terminal state (poll timed out) stays reloadable — a later
 * webhook/poller can retry it.
 */
export async function handleFillComplete(runId: string): Promise<void> {
  // Synchronous in-flight guard: claim the run before any await so a concurrent
  // webhook + poller for the same runId can't double-deliver.
  if (handlingFills.has(runId) || completedFills.has(runId)) return;
  handlingFills.add(runId);
  try {
    const terminal = await pollRun(runId, POLL_TIMEOUT_MS);
    if (terminal.status === 'timed_out') {
      // Not actually terminal — leave it pending so the webhook/poller can retry later.
      return;
    }

    const pending = pendingFills.get(runId);
    const screenshot = await reviewScreenshot(runId);
    if (pending) {
      pendingFills.delete(runId);
      // On a FAILED fill there's nothing to submit, so close the session. On a SUCCESSFUL
      // fill we KEEP it open — the post-YES Phase B submit reuses it to carry sign-in
      // cookies, and SubmitAdapter closes it after that submit.
      if (pending.browserSessionId && terminal.status !== 'completed') await closeSession(pending.browserSessionId);
    }

    const info: FillCompleteInfo = {
      runId,
      ok: terminal.status === 'completed',
      status: terminal.status,
      reviewScreenshotUrl: screenshot,
      blocked: blockedFrom(terminal.output, terminal.failure),
      detail: terminal.status === 'completed' ? undefined : `Skyvern ${terminal.status}${terminal.failure ? ` — ${String(terminal.failure).slice(0, 160)}` : ''}`,
      // Deliver the family context + values so the handler can text the right parent and
      // stage a consent-gated submit (Phase B re-fills these exact values).
      meta: pending
        ? { ...(pending.meta ?? {}), formUrl: pending.formUrl, browserSessionId: pending.browserSessionId, values: pending.values }
        : undefined,
    };

    // Only mark delivered once we actually have a terminal result to hand off.
    completedFills.add(runId);
    if (!fillCompleteHandler) {
      console.warn('[skyvern] fill complete but no handler registered:', runId, terminal.status);
      return;
    }
    await fillCompleteHandler(info);
  } catch (e) {
    console.error('[skyvern] fill-complete handler error:', (e as Error)?.message ?? e);
  } finally {
    handlingFills.delete(runId);
  }
}

/**
 * Fallback poller (safety net in case the Skyvern webhook never reaches us — e.g. a
 * misconfigured URL or a private host): sweep pending runs and complete any that have
 * reached a terminal state; for a still-running fill past ~20 min, send the parent a
 * gentle "still working" notice (once). NEVER imposes a short timeout on the run.
 */
export async function checkPendingFills(): Promise<void> {
  const now = Date.now();
  for (const [runId, p] of [...pendingFills]) {
    const r = await withTimeout(fetch(`${BASE}/v1/runs/${runId}`, { headers: { 'x-api-key': KEY } }), 10000, null);
    if (!r?.ok) continue;
    const j = (await r.json().catch(() => null)) as { status?: string } | null;
    if (!j?.status) continue;
    if (TERMINAL.includes(j.status)) {
      void handleFillComplete(runId);
      continue;
    }
    // Still running — if it's been a while and we haven't told the parent, send a soft
    // "still working" notice (once) so they don't think it's stuck.
    if (p.startedAt && now - p.startedAt > STILL_WORKING_MS && !p.progressNoticeAt) {
      p.progressNoticeAt = now;
      if (fillStillWorkingHandler) {
        void fillStillWorkingHandler({ runId, meta: p.meta ?? {} }).catch((e) =>
          console.error('[skyvern] still-working handler error:', (e as Error)?.message ?? e),
        );
      }
    }
  }
  expireStaleFills();
}

/** Drop pending fills that never resolved — a long safety valve (never mid-fill). */
export function expireStaleFills(maxAgeMs = STALE_MS): void {
  const now = Date.now();
  for (const [runId, p] of pendingFills) {
    if (now - p.startedAt > maxAgeMs) {
      pendingFills.delete(runId);
      console.warn('[skyvern] expired stale pending fill', runId);
    }
  }
}

/** Start the interim sweep (interval) that completes orphaned fills. */
export function startFillPoller(intervalMs = Number(process.env.SKYVERN_POLLER_MS) || 60_000): void {
  if (!KEY) return;
  setInterval(() => {
    checkPendingFills().catch((e) => console.error('[skyvern] poller error:', (e as Error)?.message ?? e));
  }, intervalMs);
}
