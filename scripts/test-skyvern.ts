#!/usr/bin/env tsx
/**
 * M12 regression tests: a browser run that says "completed" is NOT a submission.
 *
 * We stand up a fake Skyvern on localhost and drive the REAL integration against it, so
 * the exact failure that matters — telling a parent their child is enrolled when nothing
 * was submitted — cannot come back. Also covers the new error codes and the pre-flight
 * that stops us spending a browser session on a page with no form.
 *
 *   npm run test:skyvern
 */
import { createServer, type Server } from 'node:http';

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, detail?: string) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

// ── Fake Skyvern ────────────────────────────────────────────────────────────
interface FakeRun { status: string; output?: unknown; failure?: string }
const runs = new Map<string, FakeRun>();
const calls: string[] = [];
let nextRun = 0;
/** What the next created run should resolve to. */
let nextResult: FakeRun = { status: 'completed' };
/** Serve for the pre-flight fetch. */
let pageHtml = '<html><body><input name="child"></body></html>';
let pageContentType = 'text/html';

const server: Server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  calls.push(`${req.method} ${url.pathname}`);
  const json = (code: number, body: unknown) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (url.pathname === '/page') {
    res.writeHead(200, { 'Content-Type': pageContentType });
    res.end(pageHtml);
    return;
  }
  if (url.pathname === '/v1/browser_sessions' && req.method === 'POST') return json(200, { browser_session_id: 'bs_test' });
  if (url.pathname === '/v1/browser_sessions/bs_test/close') return json(200, {});
  if (url.pathname === '/v1/run/tasks' && req.method === 'POST') {
    const id = `run_${++nextRun}`;
    runs.set(id, nextResult);
    return json(200, { run_id: id });
  }
  if (url.pathname.startsWith('/v1/runs/') && url.pathname.endsWith('/artifacts')) return json(200, []);
  if (url.pathname.startsWith('/v1/runs/')) {
    const r = runs.get(url.pathname.split('/')[3]!);
    return r ? json(200, { status: r.status, output: r.output, failure_reason: r.failure }) : json(404, {});
  }
  return json(404, {});
});

await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const port = (server.address() as { port: number }).port;

process.env.SKYVERN_BASE_URL = `http://127.0.0.1:${port}`;
process.env.SKYVERN_API_KEY = 'test-key';
process.env.SKYVERN_POLLER_MS = '10';
const { submitFilledForm, fillFormForReviewAsync, pageHasForm } = await import('../src/integrations/skyvern.js');

const FORM_URL = `http://127.0.0.1:${port}/page`;

console.log('# a completed run is NOT a submission (the M12 regression)');
{
  nextResult = { status: 'completed', output: { submitted: false, blocker: 'the site showed a validation error' } };
  const sub = await submitFilledForm({ url: FORM_URL, values: { a: '1' } });
  check('completed + submitted:false → ok is FALSE', sub.ok === false, JSON.stringify(sub));
  check('...and we surface the blocker', /validation error/.test(sub.blocker ?? ''), String(sub.blocker));
}
{
  nextResult = { status: 'completed' }; // no extraction at all
  const sub = await submitFilledForm({ url: FORM_URL, values: { a: '1' } });
  check('completed with no confirmation evidence → ok is FALSE', sub.ok === false, JSON.stringify(sub));
  check('...status is unconfirmed', sub.status === 'unconfirmed', sub.status);
  check('...we never invent a confirmation', !sub.confirmation, String(sub.confirmation));
}
{
  nextResult = { status: 'completed', output: { extracted: { submitted: true, confirmation: 'REF-12345' } } };
  const sub = await submitFilledForm({ url: FORM_URL, values: { a: '1' } });
  check('completed + submitted:true → ok is TRUE', sub.ok === true, JSON.stringify(sub));
  check('...with the site reference', sub.confirmation === 'REF-12345', String(sub.confirmation));
}
{
  nextResult = { status: 'timed_out' };
  const sub = await submitFilledForm({ url: FORM_URL, values: { a: '1' } });
  check('a timed-out run is not a submission', sub.ok === false && sub.status === 'unconfirmed', JSON.stringify(sub));
}
console.log('\n# Skyvern error codes become specific, actionable reasons');
{
  nextResult = { status: 'terminated', output: { error: 'captcha_blocked' } };
  const sub = await submitFilledForm({ url: FORM_URL, values: { a: '1' } });
  check('error_code_mapping is read and surfaced', sub.status === 'blocked' && sub.errorCode === 'captcha_blocked', JSON.stringify(sub));
  check('...with a human reason, not a raw code', /CAPTCHA/.test(sub.blocker ?? ''), String(sub.blocker));
}
{
  nextResult = { status: 'terminated', output: { error: 'validation_error' } };
  const sub = await submitFilledForm({ url: FORM_URL, values: { a: '1' } });
  check('validation_error is distinguishable', sub.errorCode === 'validation_error', JSON.stringify(sub));
}

console.log('\n# pre-flight: never spend a browser session on a page with no form');
{
  pageHtml = '<html><body><h1>Our afterschool program</h1><p>Email us for details.</p></body></html>';
  check('a static page with no form → false', (await pageHasForm(FORM_URL)) === false);
  pageHtml = '<html><body><form><input name="a"><textarea></textarea></form></body></html>';
  check('a page with inputs → true', (await pageHasForm(FORM_URL)) === true);
  pageHtml = '<html><body><div id="__NEXT_DATA__"></div><script src="/app.js"></script></body></html>';
  check('a client-rendered app → unknown (let Skyvern try)', (await pageHasForm(FORM_URL)) === undefined);
  pageContentType = 'application/pdf';
  check('a PDF → unknown', (await pageHasForm(FORM_URL)) === undefined);
  pageContentType = 'text/html';
}
{
  pageHtml = '<html><body><h1>Afterschool info</h1></body></html>';
  calls.length = 0;
  const res = await fillFormForReviewAsync({ formUrl: FORM_URL, values: { a: '1' } });
  check('fill on a formless page fails fast as no_form', res.ok === false && res.errorCode === 'no_form', JSON.stringify(res));
  check('...and does NOT open a browser session', !calls.includes('POST /v1/browser_sessions'), calls.join(','));
}

server.close();
console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
