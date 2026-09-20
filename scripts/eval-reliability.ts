#!/usr/bin/env tsx
/**
 * RELIABILITY EVAL — the honest number.
 *
 * We claim a parent can have a form filled for them. Nobody has ever measured our success
 * rate. This measures it: one representative form, N attempts, real Skyvern, against our own
 * fake district, split into FIRST attempt (cold) and REPEAT attempts (warm-in-intent).
 *
 * DO NOT OPTIMISE ANYTHING TO MAKE THIS LOOK BETTER. It is a baseline. A flattering
 * measurement is worse than no measurement, because this number gets shown to people
 * deciding whether to trust the product with their child's enrollment.
 *
 * SAFETY — submissions are intercepted. The world's `/apply` POSTs to `/apply/done`, a FAKE
 * confirmation page in our own `.test` fixture, and this script refuses to run against any
 * host that is not the `/world/` mount. Nothing real is ever submitted, and nobody should
 * ever re-point this at a live school form.
 *
 *   railway run --service get-axolotl-agent -- npm run eval:reliability
 *   EVAL_N=5 EVAL_STEPS=12 EVAL_SCENARIO=apply ... (defaults shown)
 */
import { CONFIRMATION_REF, startTestWorld } from '../src/testworld/world.js';

/**
 * EVAL_LOCAL=1 runs ONLY the fixture self-check against an in-process world: no Skyvern, no
 * credits. Use it to prove the ruler before measuring with it, and to validate a fixture change
 * before it is deployed.
 */
const LOCAL = process.env.EVAL_LOCAL === '1';

const TOKEN = process.env.TESTWORLD_TOKEN ?? '';
const HOST = process.env.RAILWAY_PUBLIC_DOMAIN ?? '';
let BASE = (process.env.TESTWORLD_BASE_URL
  ?? (HOST ? `https://${HOST}/world/${TOKEN}` : '')).replace(/\/$/, '');
let localWorld: { close: () => Promise<void> } | undefined;
if (LOCAL) {
  const w = await startTestWorld();
  localWorld = w;
  BASE = `${w.url}/world`;
}

// ── Hard safety gate, before anything can spend money or touch a site ────────
if (!BASE || (!TOKEN && !LOCAL)) {
  console.error('Set TESTWORLD_BASE_URL (https://<host>/world/<token>), or run with the service env, or EVAL_LOCAL=1.');
  process.exit(2);
}
if (!LOCAL && !/\/world\/[A-Za-z0-9_-]+\/?$/.test(BASE)) {
  console.error(`REFUSING: ${BASE} is not the /world/ test mount. This eval must never run against a real site.`);
  process.exit(2);
}
if (!LOCAL && !process.env.SKYVERN_API_KEY) {
  console.error('SKYVERN_API_KEY is required — this measures real browser runs.');
  process.exit(2);
}

const N = Math.min(Number(process.env.EVAL_N ?? 5), 8); // hard cap bounds the spend
const MAX_STEPS = Number(process.env.EVAL_STEPS ?? 12);
const SCENARIO = process.env.EVAL_SCENARIO ?? 'apply';
const SCENARIOS: Record<string, { path: string; fields: Record<string, string> }> = {
  apply: {
    path: '/apply',
    fields: { child_first_name: 'Leo', child_last_name: 'Proof', grade: 'K', parent_email: 'parent@example.test' },
  },
  wizard: { path: '/wizard/1', fields: { child_first_name: 'Leo', grade: 'K' } },
};
const scenario = SCENARIOS[SCENARIO];
if (!scenario) {
  console.error(`Unknown scenario "${SCENARIO}". Known: ${Object.keys(SCENARIOS).join(', ')}`);
  process.exit(2);
}
const FORM_URL = `${BASE}${scenario.path}`;

const { fillFormForReviewAsync, submitFilledForm, closeSession, skyvernApiGet } = await import('../src/integrations/skyvern.js');

// ── FIXTURE SELF-CHECK, before a cent of vendor spend ───────────────────────
// The first run of this eval reported 0/5 confirmed and it was MY FIXTURE: every form POSTed to
// an absolute /world/apply with no token, so the submission 404'd and the number measured a broken
// test world rather than the product. A measurement that cannot tell "the product failed" from
// "my ruler is bent" is worthless, so the fixture proves its own submit path over plain HTTP first.
{
  const page = await (await fetch(FORM_URL)).text();
  const action = /<form[^>]*action="([^"]+)"/i.exec(page)?.[1];
  if (!action) {
    console.error(`FIXTURE BROKEN: no form action found at ${FORM_URL} — refusing to measure.`);
    process.exit(3);
  }
  const target = new URL(action, FORM_URL).toString();
  const res = await fetch(target, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(scenario.fields).toString(),
  });
  const body = await res.text();
  if (res.status !== 200 || !body.includes(CONFIRMATION_REF)) {
    console.error(
      `FIXTURE BROKEN: POST ${target} returned ${res.status} and ${body.includes(CONFIRMATION_REF) ? 'had' : 'did NOT have'} the ` +
        `confirmation reference. The submit path cannot succeed, so any number produced here would measure the fixture, not the product.`,
    );
    process.exit(3);
  }
  console.log(`fixture self-check OK: POST ${target} -> confirmation ${CONFIRMATION_REF}\n`);
  if (LOCAL) {
    console.log('EVAL_LOCAL=1: fixture validated, no vendor spend. Nothing measured.');
    await localWorld?.close();
    process.exit(0);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The fill call is FIRE-AND-FORGET: `fill.ok === true` only means the task was ACCEPTED, not
 * that anything was filled. Reporting that as "fill success" would be a lie, so we poll the run
 * to a terminal state ourselves (read-only) and report the vendor's actual verdict.
 */
async function fillOutcome(runId: string, timeoutMs = 90_000): Promise<{ status: string; failure?: string }> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const r = (await skyvernApiGet(`/v1/runs/${runId}`).catch(() => null)) as { status?: string; failure_reason?: string } | null;
    if (r?.status && ['completed', 'failed', 'terminated', 'canceled', 'timed_out'].includes(r.status)) {
      return { status: r.status, failure: r.failure_reason };
    }
    await sleep(2000);
  }
  return { status: 'poll_timeout' };
}

interface Attempt {
  n: number;
  /** The vendor ACCEPTED the task. Not success — the fill may still fail. */
  accepted: boolean;
  /** Did the vendor report the fill finished? This is a VENDOR SELF-REPORT, not verification. */
  fillComplete: boolean;
  fillStatus?: string;
  runId?: string;
  errorCode?: string;
  /** Did the site itself confirm the submission, with its reference number? Verifiable. */
  confirmed: boolean;
  submitStatus?: string;
  confirmation?: string;
  seconds: number;
  note?: string;
}

console.log(`reliability eval — scenario "${SCENARIO}" at ${FORM_URL}`);
console.log(`N=${N} (attempt 1 cold, attempts 2..${N} warm-in-intent), steps cap ${MAX_STEPS}\n`);

const attempts: Attempt[] = [];
let runsStarted = 0;
let sessions = 0;

for (let n = 1; n <= N; n++) {
  const t0 = Date.now();
  let accepted = false;
  let fillComplete = false;
  let fillStatus: string | undefined;
  let runId: string | undefined;
  let errorCode: string | undefined;
  let confirmed = false;
  let submitStatus: string | undefined;
  let confirmation: string | undefined;
  let note: string | undefined;

  try {
    const fill = await fillFormForReviewAsync({ formUrl: FORM_URL, values: scenario.fields, maxSteps: MAX_STEPS });
    accepted = fill.ok === true && Boolean(fill.runId);
    if (fill.runId) runsStarted += 1;
    if (fill.browserSessionId) sessions += 1;
    runId = fill.runId;
    errorCode = fill.errorCode;
    if (fill.runId) {
      // The honest verdict: poll the run. "accepted" is not "filled".
      const outcome = await fillOutcome(fill.runId);
      fillComplete = outcome.status === 'completed';
      fillStatus = outcome.status;
      if (!fillComplete && outcome.failure) note = String(outcome.failure).slice(0, 90);
    } else {
      fillStatus = 'not-started';
      if (fill.detail) note = fill.detail;
    }

    // The end-to-end truth: does the SITE confirm it, with its own reference?
    if (fill.browserSessionId) {
      const sub = await submitFilledForm({ url: FORM_URL, values: scenario.fields, browserSessionId: fill.browserSessionId });
      runsStarted += 1;
      confirmed = sub.ok === true && sub.status === 'confirmed' && String(sub.confirmation ?? '').includes(CONFIRMATION_REF);
      submitStatus = sub.status;
      confirmation = sub.confirmation;
      if (!confirmed && !note) note = sub.blocker ?? sub.confirmation ?? undefined;
      await closeSession(fill.browserSessionId).catch(() => {});
    } else {
      note = note ?? 'no browser session opened (pre-flight or task creation failed)';
    }
  } catch (e) {
    note = `threw: ${(e as Error).message}`;
  }

  const seconds = Math.round((Date.now() - t0) / 1000);
  attempts.push({ n, accepted, fillComplete, fillStatus, runId, errorCode, confirmed, submitStatus, confirmation, seconds, note });
  console.log(
    `  attempt ${n}: accepted=${accepted ? 'yes' : 'NO'} fill=${fillComplete ? 'complete' : 'NO'} confirmed=${confirmed ? 'YES' : 'no'}` +
      ` ${seconds}s run=${runId ?? '-'}${errorCode ? ` code=${errorCode}` : ''}${note ? ` note=${note.slice(0, 70)}` : ''}`,
  );
}

// ── Numbers ─────────────────────────────────────────────────────────────────
const cold = [attempts[0]!];
const warm = attempts.slice(1);
const rate = (xs: Attempt[], f: (a: Attempt) => boolean) => (xs.length ? xs.filter(f).length / xs.length : 0);
const fmt = (xs: Attempt[], f: (a: Attempt) => boolean) => `${xs.filter(f).length}/${xs.length} (${Math.round(rate(xs, f) * 100)}%)`;

const fillAll = fmt(attempts, (a) => a.fillComplete);
const confAll = fmt(attempts, (a) => a.confirmed);
const fillCold = fmt(cold, (a) => a.fillComplete);
const confCold = fmt(cold, (a) => a.confirmed);
const fillWarm = warm.length ? fmt(warm, (a) => a.fillComplete) : 'n/a';
const confWarm = warm.length ? fmt(warm, (a) => a.confirmed) : 'n/a';
// The metric that matters most: the vendor said it filled, but the site never confirmed.
const falseSuccesses = attempts.filter((a) => a.fillComplete && !a.confirmed).length;

console.log('\n─────────────────────────────────────────────');
console.log(`scenario           ${SCENARIO} (${FORM_URL})`);
console.log(`attempts           ${attempts.length}`);
console.log(`task accepted      ${fmt(attempts, (a) => a.accepted)}   (the vendor took the job — not success)`);
console.log(`fill COMPLETED     ${fillAll}   [cold ${fillCold} | warm ${fillWarm}]`);
console.log(`submit confirmed   ${confAll}   [cold ${confCold} | warm ${confWarm}]`);
console.log(`false successes    ${falseSuccesses}  (vendor said filled, the site never confirmed)`);
console.log(`browser runs       ${runsStarted}   sessions ${sessions}   wall ${attempts.reduce((s, a) => s + a.seconds, 0)}s`);
console.log('─────────────────────────────────────────────');

// ── Forensics: why did the failures fail? ───────────────────────────────────
// Our wrapper returns a status but not the submit run id or its failure_reason, so a bare
// "Skyvern failed" is not diagnosable from here. This read-only query is the difference
// between publishing a number and publishing a number plus its cause.
console.log('\n── recent vendor runs (read-only, for diagnosing the failures) ──');
interface VendorRun { run_id?: string; status?: string; failure_reason?: string | null; created_at?: string }
let vendorRuns: VendorRun[] = [];
try {
  const raw = await skyvernApiGet('/v1/runs?page=1&page_size=20');
  const list = Array.isArray(raw) ? raw : ((raw as { runs?: unknown[] } | null)?.runs ?? []);
  vendorRuns = (list as VendorRun[]).slice(0, 20);
  const reasons = new Map<string, number>();
  for (const r of vendorRuns) {
    const key = `${r.status ?? '?'}${r.failure_reason ? ` — ${String(r.failure_reason).slice(0, 90)}` : ''}`;
    reasons.set(key, (reasons.get(key) ?? 0) + 1);
  }
  for (const [k, v] of reasons) console.log(`   ${v} × ${k}`);
} catch (e) {
  console.log(`   (could not read vendor runs: ${(e as Error).message})`);
}

const failureReasons = (() => {
  const seen = new Map<string, number>();
  for (const r of vendorRuns) {
    if (r.status === 'completed') continue;
    const key = `${r.status ?? '?'}${r.failure_reason ? ` — ${String(r.failure_reason).slice(0, 160)}` : ' (no failure_reason)'}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen.entries()].map(([k, v]) => `- ${v} × ${k}`).join('\n') || '- none observed in the last 20 runs';
})();

// ── The report ──────────────────────────────────────────────────────────────
const table = attempts
  .map(
    (a) =>
      `| ${a.n} | ${a.accepted ? 'yes' : 'no'} | ${a.fillComplete ? 'complete' : 'no'} | ${a.confirmed ? 'confirmed' : 'no'} | ${a.submitStatus ?? '-'} | ${a.errorCode ?? '-'} | ${a.seconds}s | \`${a.runId ?? '-'}\` | ${(a.note ?? '').replace(/\|/g, '/').slice(0, 60) || '-'} |`,
  )
  .join('\n');

const doc = `# Reliability — measured, not claimed

Measured on ${new Date().toISOString().slice(0, 10)} against our own fake district. This is a
**baseline**: nothing was optimised for it, and a flattering number would be worse than none.

- **Command:** \`railway run --service get-axolotl-agent -- npm run eval:reliability\`
- **Scenario:** \`${SCENARIO}\` — \`${FORM_URL}\`
- **N:** ${N} (attempt 1 cold, attempts 2..${N} warm-in-intent), step cap ${MAX_STEPS}
- **Spend:** ${runsStarted} browser runs, ${sessions} sessions, ${attempts.reduce((s, a) => s + a.seconds, 0)}s wall clock

## The numbers

| | task accepted | fill COMPLETED (vendor verdict) | submit confirmed by the site |
|---|---|---|---|
| **All ${attempts.length}** | ${fmt(attempts, (a) => a.accepted)} | ${fillAll} | ${confAll} |
| **First attempt (cold)** | ${fmt(cold, (a) => a.accepted)} | ${fillCold} | ${confCold} |
| **Repeat attempts (warm)** | ${warm.length ? fmt(warm, (a) => a.accepted) : 'n/a'} | ${fillWarm} | ${confWarm} |

**False successes: ${falseSuccesses}** — the vendor reported the fill finished and the site never
confirmed it. This is the number that matters most, because it is the one that would tell a parent
their child is enrolled when nothing happened.

### Per attempt

| # | accepted | fill | confirmed | submit status | error code | time | run id | note |
|---|---|---|---|---|---|---|---|---|
${table}

## What this measures, precisely

- **"Task accepted"** only means the vendor took the job. It is NOT success, and it is reported
  separately because the fill call is fire-and-forget and returns before any filling happens.
- **"Fill COMPLETED"** is a **vendor self-report**: the run polled to Skyvern's \`completed\`.
  It is not verification. The fill path asks for no structured extraction, so
  **we cannot currently confirm that the fields were actually filled correctly** — the only
  artefact is a screenshot. Treat this column as an upper bound on success, not the truth.
- **"Submit confirmed"** is verifiable: the fake site's own confirmation page renders the
  reference \`${CONFIRMATION_REF}\`, and we only count it when that reference comes back. This is
  the end-to-end column.

## Cold versus warm — the finding

**There is no warm path in the browser layer.** \`fillFormForReviewAsync\` sends a fresh
\`POST /v1/run/tasks\` every time: no \`run_with: "code"\` compiled replay, no cache, and no recipe
parameter. Attempts 2..N are therefore **structurally identical to attempt 1**, so any difference
between the cold and warm columns above is sampling noise, not learning. Read them as one
distribution.

A warm path *does* exist one layer up, and this eval deliberately does not measure it: the agent
has \`get_form_recipe\` / \`save_form_recipe\` tools, so it can look up a previously saved form
structure and feed better field labels into the fill. That is **model-mediated advice about the
inputs**, not deterministic replay — it cannot make the browser work repeatable, and its ceiling is
bounded by the same per-step model reliability. It is a real mechanism and it is not a substitute
for compilation.

**Consequence:** the >90% warm-path target in \`docs/RELEASE-PLAN.md\` §G is untested and, as the
code stands, unreachable — because the mechanism it depends on (\`run_with: "code"\`) is not wired
in. This measurement is the baseline that change would be measured against.

## Why the failures failed (vendor runs, read-only)

${failureReasons}

## Limitations, stated so nobody over-reads this

1. One form (a clean single-page form). The iframe and multi-step wizard scenarios were rehearsed
   separately and are not part of this number.
2. The fixture is easier than a real portal: no login, no CAPTCHA, no PDF upload, no multi-page
   state. Real district forms are harder, so **treat this as an optimistic baseline**.
3. \`N=${attempts.length}\`. At this sample size one attempt moves the percentage by
   ~${Math.round(100 / Math.max(attempts.length, 1))} points, so the percentages are indicative and the
   raw counts are the real data.
4. Field-level correctness is unverified (see above). A "complete" fill could have wrong or
   missing values and still count here.
5. Vendor-side variance (their scheduling, model sampling, load) is inside these numbers and
   cannot be separated from ours at this sample size.
`;

// APPEND, never overwrite: the document carries hand-written analysis that a later run must not
// silently destroy. Each run adds a dated, self-contained section.
const { readFileSync, writeFileSync, existsSync } = await import('node:fs');
const docPath = new URL('../docs/RELIABILITY.md', import.meta.url);
const header = `\n\n---\n\n## Run — ${new Date().toISOString()}\n\n`;
const existing = existsSync(docPath) ? readFileSync(docPath, 'utf8') : '';
writeFileSync(docPath, (existing.trimEnd() + header + doc.split('\n').slice(1).join('\n')).trimStart() + '\n');
console.log('\nappended a run section to docs/RELIABILITY.md');
