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

import {
  resolveFormTarget,
  recordFormTargetSuccess,
  markFormTargetUnhealthy,
  targetKey,
} from './form-targets.js';
import { recordVerifiedRecipe } from './form-recipes.js';

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

// ── Failure classification we can branch on, and a cheap pre-flight ─────────
//
// Skyvern's docs call failure_reason string-matching "fragile" and point at
// `error_code_mapping`, which returns OUR codes in `output.error`. These are the codes
// the agent branches on and the parent is told the truth about, instead of "a snag".

export type SkyvernErrorCode =
  | 'no_form' | 'signin_required' | 'captcha_blocked' | 'access_denied' | 'validation_error'
  /** The fill path submitted/sent/paid/finalized something. Must never happen: the ONLY route
   * to a submission is the consent-gated submit step. Reported so it cannot pass unnoticed. */
  | 'submitted_without_authorization';

const ERROR_CODES: Record<string, string> = {
  no_form: 'The page contains no form fields to fill — it is an information page, not an application form.',
  signin_required: 'A sign-in or account-creation wall is blocking this form.',
  captcha_blocked: 'A CAPTCHA or bot check is blocking progress.',
  access_denied: 'The site refused access to this form.',
  validation_error: 'The form rejected the submitted values with a validation error.',
  submitted_without_authorization: 'The form was submitted, sent, finalized or paid on the page',
};

/** Guardrails every fill task carries. Stated as completion criteria because Skyvern's
 * documented top failure modes are "completed too early" and "completed without submitting". */
const FILL_RULES =
  'Fill ONLY the fields listed above, then STOP — do not click Submit, Enroll, Apply, Pay, ' +
  'purchase anything, or create an account. COMPLETE when the listed fields are filled. ' +
  'TERMINATE IMMEDIATELY with error_code "no_form" if the first page contains no form fields to ' +
  'fill (it may be an information page rather than the application). ' +
  'TERMINATE with "signin_required" if a sign-in or account-creation wall appears, and with ' +
  '"captcha_blocked" if a CAPTCHA or bot check blocks you. Leave any field you do not have empty.';

const SUBMIT_RULES =
  'Fill in this form, then CLICK the Submit button to submit it. Do not create an account and do ' +
  'not pay for anything. After clicking Submit, REPORT HONESTLY what the site did: set submitted ' +
  'to true ONLY if the site showed a confirmation, thank-you page, or confirmation/reference ' +
  'number; set it to false if nothing changed, an error appeared, or you are unsure. Put the ' +
  'confirmation or reference text in "confirmation", and whatever stopped you in "blocker". ' +
  'NEVER report submitted = true without a confirmation visible on the page. ' +
  'TERMINATE with "captcha_blocked" for a CAPTCHA, "signin_required" for a login wall, and ' +
  '"validation_error" if the form rejects the values.';

/** The fill task reports whether the page ended up submitted. This is the code-level check
 * behind the prompt's prohibition: a prohibition alone is a request, and this makes it
 * observable and refusable. */
const FILL_SCHEMA = {
  type: 'object',
  properties: {
    form_present: { type: 'boolean', description: 'True if the page actually contained form fields to fill.' },
    submitted_anything: { type: 'boolean', description: 'True if the form was submitted, sent, paid, finalized or confirmed on the page.' },
    blocker: { type: 'string', description: 'What stopped you (sign-in, CAPTCHA, no form).' },
  },
  required: ['form_present'],
} as const;

const SUBMIT_SCHEMA = {
  type: 'object',
  properties: {
    submitted: { type: 'boolean', description: 'True ONLY if the site confirmed the submission (confirmation or reference shown).' },
    confirmation: { type: 'string', description: 'The confirmation/reference text the site displayed, if any.' },
    blocker: { type: 'string', description: 'What prevented submission, if it failed.' },
  },
  required: ['submitted'],
} as const;

/** Pull our structured extraction out of a run's output, tolerating nesting. */
function readExtraction(output: unknown): { submitted?: boolean; submitted_anything?: boolean; confirmation?: string; blocker?: string } {
  const seen = new Set<unknown>();
  const visit = (v: unknown, depth: number): Record<string, unknown> | undefined => {
    if (!v || typeof v !== 'object' || depth > 4 || seen.has(v)) return undefined;
    seen.add(v);
    const o = v as Record<string, unknown>;
    if (typeof o.submitted === 'boolean' || typeof o.submitted_anything === 'boolean') return o;
    for (const key of ['extracted', 'extraction', 'data', 'output', 'result', 'extracted_content', 'task_output', 'content']) {
      const hit = visit(o[key], depth + 1);
      if (hit) return hit;
    }
    for (const val of Object.values(o)) {
      const hit = visit(val, depth + 1);
      if (hit) return hit;
    }
    return undefined;
  };
  const hit = visit(output, 0) ?? {};
  return {
    submitted: typeof hit.submitted === 'boolean' ? hit.submitted : undefined,
    submitted_anything: typeof hit.submitted_anything === 'boolean' ? hit.submitted_anything : undefined,
    confirmation: typeof hit.confirmation === 'string' && hit.confirmation.trim() ? hit.confirmation.trim() : undefined,
    blocker: typeof hit.blocker === 'string' && hit.blocker.trim() ? hit.blocker.trim() : undefined,
  };
}

/** Our error code from `error_code_mapping`, if the run set one. */
function readErrorCode(output: unknown): SkyvernErrorCode | undefined {
  if (!output || typeof output !== 'object') return undefined;
  const e = (output as { error?: unknown }).error;
  return typeof e === 'string' && e in ERROR_CODES ? (e as SkyvernErrorCode) : undefined;
}

export function errorCodeDetail(code?: SkyvernErrorCode): string | undefined {
  return code ? ERROR_CODES[code] : undefined;
}

/**
 * Cheap pre-flight: does this URL look like it even has a form? We ask over plain HTTP so
 * a wrong URL costs one request instead of a browser session and a 50-step timeout — this
 * is the "handed Skyvern a landing page" failure.
 *
 * Deliberately conservative: anything that looks like a client-rendered app returns
 * `undefined` (unknown, let Skyvern try), because a JS app's form is not in the HTML.
 * Only a plainly static page with zero form affordances returns false.
 */
export async function pageHasForm(url: string): Promise<boolean | undefined> {
  try {
    const r = await withTimeout(
      fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Axolotl/1.0)' } }),
      8000,
      null,
    );
    if (!r?.ok) return undefined; // 403/404/etc are not proof of "no form"
    const ct = r.headers.get('content-type') ?? '';
    if (!/text\/html/i.test(ct)) return undefined; // PDFs, JSON, images: not our call
    const html = (await r.text()).slice(0, 400_000);
    if (/<(input|select|textarea|form)[\s>]/i.test(html)) return true;
    // An embedded frame means the form may be one level down: the top-level HTML has no
    // inputs even though the page is genuinely fillable. School portals embed forms in
    // iframes constantly, so refusing here would silently block real enrollments. Unknown,
    // not "no" — the browser gets to try.
    if (/<(iframe|frame|object|embed)[\s>]/i.test(html)) return undefined;
    if (/react|vue|angular|__NEXT_DATA__|svelte|astro|nuxt|data-reactroot|ember/i.test(html)) return undefined;
    return false;
  } catch {
    return undefined;
  }
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

/**
 * Phase B: navigate to the form, RE-FILL it with the same values, then submit.
 * Called ONLY from the post-YES consent path (SubmitAdapter). The filled page from
 * Phase A does not survive between Skyvern tasks, so we re-fill here; Phase A's
 * screenshot was the review preview. `browserSessionId` is optional and only needed
 * to carry sign-in cookies for auth-gated forms.
 */
export interface SubmitResult {
  /** TRUE only when the SITE ITSELF confirmed the submission. Never set from run status alone. */
  ok: boolean;
  status: 'confirmed' | 'unconfirmed' | 'blocked' | 'failed' | 'no_url' | 'disabled';
  /** The confirmation/reference text the site displayed, when we got one. */
  confirmation?: string;
  /** What stopped it, when it failed. */
  blocker?: string;
  errorCode?: SkyvernErrorCode;
  confirmationScreenshotUrl?: string;
}

export async function submitFilledForm(input: {
  url: string;
  values: Record<string, string>;
  browserSessionId?: string;
}): Promise<SubmitResult> {
  if (!KEY) return { ok: false, status: 'disabled' };
  if (!input.url) return { ok: false, status: 'no_url' };
  const fieldLines = Object.entries(input.values).map(([k, v]) => `- ${k}: ${v}`).join('\n');
  const prompt = `${SUBMIT_RULES}\n\nFields:\n${fieldLines}`;
  const runRes = await api('/v1/run/tasks', {
    prompt,
    url: input.url,
    max_steps: 12,
    ...(input.browserSessionId ? { browser_session_id: input.browserSessionId } : {}),
    data_extraction_schema: SUBMIT_SCHEMA,
    error_code_mapping: ERROR_CODES,
  });
  const runId = String(runRes?.run_id ?? '');
  if (!runId) return { ok: false, status: 'failed', blocker: 'could not start the submit task' };
  const terminal = await pollRun(runId, 60_000);
  const screenshot = await reviewScreenshot(runId);
  const x = readExtraction(terminal.output);
  const errorCode = readErrorCode(terminal.output);
  // The whole point of M12: a completed run is NOT a submission. We require the site's own
  // confirmation, reported by the task we asked to check for it.
  const confirmed = terminal.status === 'completed' && x.submitted === true;
  // The strongest evidence we ever get: the site itself confirmed. Record the target from it.
  if (confirmed) {
    await recordFormTargetSuccess({ url: input.url, evidence: 'confirmed-submit' }).catch((e) =>
      console.warn('[skyvern] could not record form target:', (e as Error)?.message ?? e),
    );
    await recordVerifiedRecipe({
      url: input.url,
      valueKeys: Object.keys(input.values ?? {}),
      evidence: 'confirmed-submit',
    }).catch((e) => console.warn('[skyvern] could not record recipe:', (e as Error)?.message ?? e));
  } else if (errorCode === 'no_form') {
    await markFormTargetUnhealthy(targetKey({ url: input.url }), 'no_form').catch(() => {});
  }
  return {
    ok: confirmed,
    status: confirmed ? 'confirmed' : errorCode ? 'blocked' : 'unconfirmed',
    confirmation: x.confirmation,
    // Only describe a blocker when something actually blocked: a confirmed submission that
    // still carries a "never showed a confirmation" string is the kind of contradictory
    // output that makes a log reader distrust the whole result.
    blocker: confirmed
      ? undefined
      : x.blocker ??
        errorCodeDetail(errorCode) ??
        (terminal.status !== 'completed' ? `Skyvern ${terminal.status}` : 'the site never showed a confirmation'),
    errorCode,
    confirmationScreenshotUrl: screenshot,
  };
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
  /** Our machine-readable reason (from error_code_mapping), when Skyvern set one. */
  errorCode?: SkyvernErrorCode;
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
  /** Skip the plain-HTTP pre-flight (used by tests and when we already know the page). */
  skipPreflight?: boolean;
}): Promise<{ ok: boolean; runId?: string; browserSessionId?: string; detail?: string; errorCode?: SkyvernErrorCode }> {
  if (!KEY) return { ok: false, detail: 'disabled' };

  // 0a. Reuse a target that already worked. The caller's URL is usually a fresh guess or a
  //     fresh discovery; a stored target is the one we have actually watched succeed, so it
  //     wins — after a cheap pre-flight that catches a form that has since become an info page.
  const resolved = await resolveFormTarget(
    { givenUrl: input.formUrl, program: input.program, school: input.meta?.school, now: Date.now() },
    { hasForm: input.skipPreflight ? undefined : pageHasForm },
  ).catch(() => undefined);
  const formUrl = resolved?.url || input.formUrl;
  if (resolved?.via === 'stored') {
    console.log(`[skyvern] reusing verified form target for ${targetKey({ url: input.formUrl, program: input.program })}`);
  } else if (resolved?.fellBack && resolved.fellBack !== 'none') {
    console.log(`[skyvern] stored form target not reused (${resolved.fellBack}) — using ${formUrl || 'discovery'}`);
  }
  if (!formUrl) return { ok: false, detail: 'no_form_url', errorCode: 'no_form' };

  // 0b. Pre-flight the URL we are actually about to use (the stored one may be the same URL).
  if (!input.skipPreflight) {
    const hasForm = await pageHasForm(formUrl).catch(() => undefined);
    if (hasForm === false) {
      console.log('[skyvern] pre-flight found no form on', formUrl);
      return { ok: false, detail: 'no_form', errorCode: 'no_form' };
    }
  }

  // 1. Open a persistent browser session (carried so Phase B can reuse sign-in cookies).
  const session = await api('/v1/browser_sessions', {});
  const browserSessionId = String(session?.browser_session_id ?? '');
  if (!browserSessionId) return { ok: false, detail: 'session_failed' };

  // 2. Phase A task: FILL ONLY. The prompt NEVER instructs submit / enroll / pay /
  // account-creation — stop after filling and report a wall.
  const fieldLines = Object.entries(input.values)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');
  const prompt = `Fill out this form using the following information (for the family's own application).\n\n${FILL_RULES}\n\nFields to enter:\n${fieldLines}`;
  const webhookUrl =
    process.env.SKYVERN_WEBHOOK_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/webhooks/skyvern` : undefined);
  const runRes = await api('/v1/run/tasks', {
    prompt,
    url: formUrl,
    max_steps: input.maxSteps ?? MAX_STEPS,
    browser_session_id: browserSessionId,
    ...(webhookUrl ? { webhook_url: webhookUrl } : {}),
    error_code_mapping: ERROR_CODES,
    data_extraction_schema: FILL_SCHEMA,
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
    meta: { ...(input.meta ?? {}), formUrl, browserSessionId, program: input.program ?? '' },
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

    // CODE-LEVEL GUARD ON THE IRREVERSIBLE ACTION. The fill task is told never to submit, and
    // it also reports whether the page ended up submitted. A prohibition alone is a request;
    // this is the refusal. If anything was submitted, we do NOT stage a submit, we kill the
    // session, and we tell the parent plainly — a silent success here would be the worst
    // outcome in the product.
    const fillExtraction = readExtraction(terminal.output);
    if (terminal.status === 'completed' && (fillExtraction.submitted_anything === true || fillExtraction.submitted === true || readErrorCode(terminal.output) === 'submitted_without_authorization')) {
      if (pending?.browserSessionId) await closeSession(pending.browserSessionId);
      console.warn('[skyvern] POLICY: a fill task reported a submission it was not authorized to make', runId);
      completedFills.add(runId);
      if (fillCompleteHandler) {
        await fillCompleteHandler({
          runId,
          ok: false,
          status: 'policy_violation',
          errorCode: 'submitted_without_authorization',
          detail: errorCodeDetail('submitted_without_authorization'),
          meta: pending ? { ...(pending.meta ?? {}), formUrl: pending.formUrl } : undefined,
        });
      }
      return;
    }

    const info: FillCompleteInfo = {
      runId,
      ok: terminal.status === 'completed',
      status: terminal.status,
      reviewScreenshotUrl: screenshot,
      blocked: blockedFrom(terminal.output, terminal.failure),
      errorCode: readErrorCode(terminal.output),
      detail: terminal.status === 'completed'
        ? undefined
        : errorCodeDetail(readErrorCode(terminal.output)) ?? `Skyvern ${terminal.status}${terminal.failure ? ` — ${String(terminal.failure).slice(0, 160)}` : ''}`,
      // Deliver the family context + values so the handler can text the right parent and
      // stage a consent-gated submit (Phase B re-fills these exact values).
      meta: pending
        ? { ...(pending.meta ?? {}), formUrl: pending.formUrl, browserSessionId: pending.browserSessionId, values: pending.values }
        : undefined,
    };

    // LEARN, but only from a verified outcome. A completed fill with no error code and no
    // policy violation is the weaker evidence we accept for a fill-only run; a confirmed
    // submit (below, in submitFilledForm) is the stronger one. A failure, a timeout, or a
    // run that merely claimed success while reporting a blocker records NOTHING — a target
    // learned from a bad run would be preferred over the model's next, better guess, which
    // would make this feature worse than not having it.
    if (pending) {
      const learned = terminal.status === 'completed' && !readErrorCode(terminal.output);
      if (learned) {
        await recordFormTargetSuccess({
          url: pending.formUrl,
          evidence: 'completed-fill',
          program: (pending.meta?.program as string | undefined) || undefined,
          runId,
        }).catch((e) => console.warn('[skyvern] could not record form target:', (e as Error)?.message ?? e));
        await recordVerifiedRecipe({
          url: pending.formUrl,
          valueKeys: Object.keys(pending.values ?? {}),
          evidence: 'completed-fill',
          runId,
        }).catch((e) => console.warn('[skyvern] could not record recipe:', (e as Error)?.message ?? e));
      } else {
        // The URL itself was the problem (a page with no form, or a 404) — mark it unhealthy so
        // the next attempt skips straight to discovery rather than repeating the failure.
        const code = readErrorCode(terminal.output);
        const blocked = blockedFrom(terminal.output, terminal.failure);
        if (code === 'no_form' || blocked === 'not_found') {
          await markFormTargetUnhealthy(
            targetKey({ url: pending.formUrl, program: (pending.meta?.program as string | undefined) || undefined }),
            code ?? 'not_found',
          ).catch(() => {});
        }
      }
    }

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
