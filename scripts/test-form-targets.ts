#!/usr/bin/env tsx
/**
 * Form targets: reuse a verified URL, and never learn from anything unverified.
 *
 * The reuse decision is tested with injected dependencies, so every branch is reachable
 * without a database or a network. The learning rule is tested against the same predicates
 * the vendor paths use, because "learn only from success" is the property that decides
 * whether this feature helps or quietly poisons every future fill.
 *
 *   npm run test:form-targets
 */
import {
  targetKey,
  hostOf,
  programSlugFrom,
  isStale,
  isHealthy,
  canReuse,
  resolveFormTarget,
  type FormTarget,
} from '../src/integrations/form-targets.js';

let pass = 0; let fail = 0;
const check = (n: string, c: boolean, d?: string) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } };

const NOW = 1_800_000_000_000;
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

const target = (over: Partial<FormTarget> = {}): FormTarget => ({
  key: 'ps134.test|apply',
  url: 'https://ps134.test/apply',
  host: 'ps134.test',
  program: 'apply',
  source: 'learned',
  verifiedAt: daysAgo(1),
  successCount: 1,
  failCount: 0,
  ...over,
});

console.log('# keying is per school and per program, never global');
check('the host is the school, so two schools do not share a target',
  targetKey({ url: 'https://ps134.test/apply' }) !== targetKey({ url: 'https://lincoln.test/apply' }));
check('two programs on the same school do not share a target',
  targetKey({ url: 'https://ps134.test/apply' }) !== targetKey({ url: 'https://ps134.test/afterschool' }));
check('the same school and program produce the same key',
  targetKey({ url: 'https://ps134.test/apply' }) === targetKey({ url: 'https://ps134.test/apply/' }));
check('www and the apex are the same school', hostOf('https://www.ps134.test/apply') === hostOf('https://ps134.test/apply'));
check('an explicit program beats one derived from the path',
  targetKey({ url: 'https://ps134.test/enrollment/new', program: 'Kindergarten' }) === 'ps134.test|kindergarten');
check('a path slug is the fallback, with files and queries ignored',
  programSlugFrom('https://ps134.test/forms/apply.php?y=2026') === 'apply');
check('a bare host still yields a usable key', programSlugFrom('https://ps134.test/') === 'form');

console.log('\n# freshness and health are pure decisions');
check('a target verified yesterday is reusable', canReuse(target(), NOW));
check('a target verified 181 days ago is stale', !canReuse(target({ verifiedAt: daysAgo(181) }), NOW) && isStale(target({ verifiedAt: daysAgo(181) }), NOW));
check('a target with an unparseable date is stale, not trusted', isStale(target({ verifiedAt: 'not-a-date' }), NOW));
check('an unhealthy target is never reused, however recent', !canReuse(target({ unhealthyAt: daysAgo(1) }), NOW) && !isHealthy(target({ unhealthyAt: daysAgo(1) })));

console.log('\n# resolution: the verified target wins, after a cheap check');
{
  const get = async () => target();
  const hasForm = async () => true;
  const r = await resolveFormTarget({ givenUrl: 'https://ps134.test/some-guess', now: NOW }, { get, hasForm });
  check('a stored target is preferred over the caller\'s guess', r.via === 'stored' && r.url === 'https://ps134.test/apply', JSON.stringify(r));
}
{
  const r = await resolveFormTarget({ givenUrl: 'https://newschool.test/apply', now: NOW },
    { get: async () => undefined, hasForm: async () => true });
  check('with nothing stored, the caller\'s URL is used (a discovery result)', r.via === 'given' && r.url === 'https://newschool.test/apply');
  check('...and it is reported as no fallback, because nothing was skipped', r.fellBack === 'none');
}
{
  const r = await resolveFormTarget({ now: NOW }, { get: async () => undefined, hasForm: async () => true });
  check('with nothing stored and no URL given, the caller must rediscover', r.url === '' && r.via === 'given', JSON.stringify(r));
}

console.log('\n# a stored target that stopped working falls back AND is marked unhealthy');
{
  let marked: string | undefined;
  const r = await resolveFormTarget({ givenUrl: 'https://ps134.test/new-apply', now: NOW },
    { get: async () => target(), hasForm: async () => false, markUnhealthy: async (_k, reason) => { marked = reason; } });
  check('pre-flight false -> the caller\'s URL is used instead', r.via === 'given' && r.url === 'https://ps134.test/new-apply', JSON.stringify(r));
  check('...the fallback is attributed to no-form', r.fellBack === 'no-form');
  check('...and the target is marked unhealthy for next time', Boolean(marked), String(marked));
}
{
  // Already known bad: the next attempt must not re-check it, it goes straight to discovery.
  let preflighted = false;
  const r = await resolveFormTarget({ givenUrl: 'https://ps134.test/new-apply', now: NOW },
    { get: async () => target({ unhealthyAt: daysAgo(1) }), hasForm: async () => { preflighted = true; return true; } });
  check('an unhealthy target skips pre-flight and goes straight to the caller\'s URL', r.via === 'given' && r.fellBack === 'unhealthy');
  check('...and we did not spend a pre-flight on it', preflighted === false);
}
{
  const r = await resolveFormTarget({ givenUrl: 'https://ps134.test/new-apply', now: NOW },
    { get: async () => target({ verifiedAt: daysAgo(200) }), hasForm: async () => true });
  check('a stale target with a newer URL given falls back to the newer URL', r.via === 'given' && r.fellBack === 'stale', JSON.stringify(r));
}
{
  const r = await resolveFormTarget({ givenUrl: 'https://ps134.test/apply', now: NOW },
    { get: async () => target(), hasForm: async () => undefined });
  check('a JS-rendered form ("cannot tell") still reuses the verified target', r.via === 'stored', JSON.stringify(r));
}
{
  const r = await resolveFormTarget({ givenUrl: 'https://ps134.test/apply', now: NOW }, { get: async () => target() });
  check('without a pre-flight capability the verified target is still used', r.via === 'stored');
}

console.log('\n# learn from success ONLY (the predicate the vendor paths apply)');
// Mirrors handleFillComplete / submitFilledForm: which terminal outcomes are allowed to teach us.
const learns = (o: { status: string; errorCode?: string; policyViolation?: boolean }) =>
  o.status === 'completed' && !o.errorCode && !o.policyViolation;
{
  check('a completed fill with no error code teaches', learns({ status: 'completed' }));
  check('a fill that reported a blocker does NOT teach', !learns({ status: 'completed', errorCode: 'captcha_blocked' }));
  check('a fill with no form does NOT teach (and is marked unhealthy instead)', !learns({ status: 'completed', errorCode: 'no_form' }));
  check('a failed run does NOT teach', !learns({ status: 'failed' }));
  check('a timed-out run does NOT teach', !learns({ status: 'timed_out' }));
  check('a canceled run does NOT teach', !learns({ status: 'canceled' }));
  check('a policy violation (it submitted when told not to) does NOT teach', !learns({ status: 'completed', policyViolation: true }));
}
{
  // The submit path: only a site-confirmed reference counts.
  const submitTeaches = (submitted: boolean | undefined, status: string) => status === 'completed' && submitted === true;
  check('a confirmed submit teaches (the strongest evidence)', submitTeaches(true, 'completed'));
  check('an unconfirmed submit does NOT teach', !submitTeaches(false, 'completed'));
  check('a submit with no extraction at all does NOT teach', !submitTeaches(undefined, 'completed'));
  check('a blocked submit does NOT teach', !submitTeaches(undefined, 'terminated'));
}

console.log('\n# INTEGRATION: the real fill path, against a fake vendor');
// The pure tests above prove the decision. This proves the WIRING — that a completed run
// actually records a target, and that the next fill sends the vendor the stored URL instead of
// the caller's fresh guess. That is the whole point of the workstream.
{
  const { createServer } = await import('node:http');
  const asked: string[] = [];
  let nextRun = 0;
  const runs = new Map<string, { status: string }>();
  const server = createServer(async (req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    const json = (code: number, body: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (u.pathname === '/v1/browser_sessions') return json(200, { browser_session_id: 'bs_test' });
    if (u.pathname === '/v1/browser_sessions/bs_test/close') return json(200, {});
    if (u.pathname === '/v1/run/tasks') {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c)));
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as { url?: string };
      asked.push(String(body.url ?? ''));
      const id = `run_${++nextRun}`;
      runs.set(id, { status: 'completed' });
      return json(200, { run_id: id });
    }
    if (u.pathname.startsWith('/v1/runs/') && u.pathname.endsWith('/artifacts')) return json(200, []);
    if (u.pathname.startsWith('/v1/runs/')) {
      const r = runs.get(u.pathname.split('/')[3]!);
      return r ? json(200, { status: r.status, output: {} }) : json(404, {});
    }
    return json(404, {});
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;

  process.env.SKYVERN_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.SKYVERN_API_KEY = 'test-key';
  const { fillFormForReviewAsync, handleFillComplete } = await import('../src/integrations/skyvern.js');
  const { resetFormTargetsForTest, getFormTarget, targetKey } = await import('../src/integrations/form-targets.js');
  resetFormTargetsForTest();

  const VERIFIED = `http://127.0.0.1:${port}/world/apply`;
  const GUESS = `http://127.0.0.1:${port}/world/some-landing-page`;
  const program = 'afterschool-integration';

  // First fill: the caller's URL is the one we have, and it succeeds.
  const first = await fillFormForReviewAsync({ formUrl: VERIFIED, values: { child_first_name: 'Leo' }, program, skipPreflight: true });
  check('the first fill uses the caller\'s URL', first.ok === true && asked[0] === VERIFIED, String(asked[0]));
  await handleFillComplete(String(first.runId));

  const stored = await getFormTarget(targetKey({ url: VERIFIED, program }));
  check('a completed fill RECORDS the target', Boolean(stored) && stored?.url === VERIFIED, JSON.stringify(stored));
  check('...with provenance marked as learned', stored?.source === 'learned');
  check('...and a success count of one', stored?.successCount === 1, String(stored?.successCount));

  // Second fill: the caller brings a DIFFERENT url (a fresh guess/discovery). The stored one
  // must win — this is the behaviour the whole workstream exists for.
  const second = await fillFormForReviewAsync({ formUrl: GUESS, values: { child_first_name: 'Leo' }, program, skipPreflight: true });
  check('a later fill is sent the STORED url, not the fresh guess', second.ok === true && asked[1] === VERIFIED, `asked=${asked[1]} guess=${GUESS}`);

  // A FAILED run must not teach, and the stored target must survive it.
  runs.set(String(second.runId), { status: 'failed' });
  await handleFillComplete(String(second.runId));
  const after = await getFormTarget(targetKey({ url: VERIFIED, program }));
  check('a failed run does not raise the success count', after?.successCount === 1, String(after?.successCount));
  check('...and does not erase the verified target', after?.url === VERIFIED);

  await new Promise<void>((r) => server.close(() => r()));
}

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
