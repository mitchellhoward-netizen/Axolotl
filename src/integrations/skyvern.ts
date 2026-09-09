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
