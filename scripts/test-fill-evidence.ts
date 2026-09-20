#!/usr/bin/env tsx
/**
 * Fixes 2-4: proving what we may claim, refusing to delegate diagnostics, and never
 * texting a vendor URL.
 *
 * These are structural checks. There is no live vendor here on purpose: what is worth
 * pinning down is whether the STATE the brain reads can distinguish a completed fill from
 * an imagined one, whether the prompt says so in words a model can act on, and whether the
 * review link we hand a parent is ours.
 *
 *   npm run test:evidence
 */
import { createHash } from 'node:crypto';

let pass = 0; let fail = 0;
const check = (n: string, c: boolean, d?: string) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } };

// No real mail may leave this suite either (see test-consent for why).
delete process.env.RESEND_API_KEY;
delete process.env.EMAIL_FROM;

const { fillEvidenceLine, systemPrompt, LLM_TOOLS } = await import('../src/agent/tools.js');
const { Agent } = await import('../src/agent/agent.js');
const { RulesIntentEngine } = await import('../src/agent/intent/rules.js');
const { MockCalendarProvider } = await import('../src/integrations/calendar.js');
const { MockMealsProvider } = await import('../src/integrations/meals.js');
const { MockSis } = await import('../src/integrations/sis.js');
const { createEmailProvider } = await import('../src/integrations/email.js');
const { createSeedDb, provisionFamily } = await import('../src/seed.js');
const { reviewUrlFor, resolveReviewToken, resetReviewLinksForTest, reviewLinkCount } = await import('../src/integrations/review-links.js');
import type { Step } from '../src/agent/steps/types.js';

const ID = 'evidence-test-conv';
const ARTIFACT = 'https://api.skyvern.com/v1/artifacts/a_123/content?expiry=1&sig=SECRETSIG';

console.log('# the evidence line the brain must read (Fix 2)');
{
  check('no fill → says none', /^none/.test(fillEvidenceLine({})));
  check('a staged submit without a fill → explicitly warns NOT to describe it as filled',
    /NO completed fill is recorded/.test(fillEvidenceLine({ pendingSteps: [{ channel: 'submit' } as Step] })));
  const line = fillEvidenceLine({
    completedFill: { url: 'https://world.example/apply', runId: 'tsk_123', at: '2026-09-19T20:00:00Z', hasReview: true },
    pendingSteps: [{ channel: 'submit' } as Step],
  });
  check('a completed fill → names the URL and run', line.includes('https://world.example/apply') && line.includes('tsk_123'), line);
  check('...and says the submit is waiting on their YES', /awaiting their YES/.test(line), line);
  check('...and that a review image was sent', /review image/.test(line), line);
}

console.log('\n# stageFormSubmit is what records it (Fix 2)');
{
  const db = createSeedDb();
  db.parents.push({ id: 'parent-maya', phone: '15555550100', email: '', firstName: 'Maya', lastName: 'Lee', studentIds: [] });
  provisionFamily(db, 'parent-maya', { children: [{ name: 'Emma', grade: '3rd' }], school: 'Soquel Elementary School', district: 'Soquel Union Elementary School District', schoolType: 'public', needs: [], challenges: [] });
  const agent = new Agent({ intentEngine: new RulesIntentEngine(), sis: new MockSis(db), calendar: new MockCalendarProvider(), meals: new MockMealsProvider({}), db, defaultParentId: 'parent-maya', requireVerification: false, email: createEmailProvider() });

  const before = agent.getStateForTest(ID);
  check('no evidence before a fill', !before?.completedFill);

  await agent.stageFormSubmit(ID, { url: 'https://world.example/apply', values: { child_last_name: 'Howard' } }, { runId: 'tsk_999', reviewUrl: ARTIFACT });
  const staged = agent.getStateForTest(ID);
  check('staging records the completed fill', staged?.completedFill?.runId === 'tsk_999', JSON.stringify(staged?.completedFill));
  check('...with the url, the time and whether a review exists', staged?.completedFill?.url === 'https://world.example/apply' && Boolean(staged?.completedFill?.at) && staged?.completedFill?.hasReview === true);
  check('...and the prompt now shows it', /a fill COMPLETED/.test(fillEvidenceLine(agent.getStateForTest(ID) ?? {})));

  // A brain turn must not drop the evidence (save() preserves it), and an unrelated reply that
  // expires the proposal must clear it — an authorization we cannot see is worse than none.
  agent.setStateForTest(ID, { ...(staged as never), phase: 'confirming' });
  await agent.handle(ID, 'ok thanks');
  check('expiring the proposal clears the fill evidence', !agent.getStateForTest(ID)?.completedFill, JSON.stringify(agent.getStateForTest(ID)?.completedFill));
}

console.log('\n# the prompt says it in words a model can act on (Fix 2 + Fix 3)');
{
  const prompt = systemPrompt({ profile: { children: [{ name: 'Leo' }], school: 'Soquel', needs: [], challenges: [] }, fillEvidence: 'none — no form fill has completed in this conversation' });
  check('carries a FORM FILL EVIDENCE block', /FORM FILL EVIDENCE/.test(prompt));
  check('...with the actual evidence text spliced in', /no form fill has completed/.test(prompt));
  check('forbids claiming a fill without evidence', /may say a form is filled ONLY when that line says a fill COMPLETED/i.test(prompt));
  check('forbids listing field values as done', /Never list field values as done/i.test(prompt));
  check('tells it what to do when there is no finished fill', /don't have a finished fill/i.test(prompt));
  check('forbids asking the parent to inspect a page (Fix 3)', /NEVER ASK THE PARENT TO INSPECT A PAGE OR LINK/.test(prompt));
  check('makes skyvern_fill_form the only filling path (Fix 3)', /FILLING IS skyvern_fill_form ONLY/.test(prompt));
  check('...and rules out browser_fill for a parent', /browser_fill must NEVER be used to fill a form for a parent/.test(prompt));
}

console.log('\n# tool descriptions agree with the prompt (Fix 3)');
{
  const desc = (name: string) => {
    const t = LLM_TOOLS.find((x) => (x as { function: { name: string } }).function.name === name) as { function: { description: string } } | undefined;
    return t?.function.description ?? '';
  };
  check('browser_fill is scoped to reading/diagnosing, not parent forms', /NOT for filling a school or program form/.test(desc('browser_fill')), desc('browser_fill').slice(0, 80));
  check('skyvern_fill_form is named the ONE filling tool', /The ONE tool for filling a form for a parent/.test(desc('skyvern_fill_form')));
  check('browser_observe is reading-only', /Reading only/.test(desc('browser_observe')));
}

console.log('\n# review links are ours, never the vendor URL (Fix 4)');
{
  resetReviewLinksForTest();
  const url = reviewUrlFor(ARTIFACT);
  check('a link is minted', Boolean(url) && /\/review\//.test(String(url)), String(url));
  check('...and does NOT contain the vendor artifact URL or its signature', !String(url).includes('skyvern.com') && !String(url).includes('SECRETSIG'), String(url));
  check('the token is opaque (no artifact id, no hash of it)', !String(url).includes('a_123') && !String(url).includes(createHash('sha256').update(ARTIFACT).digest('hex').slice(0, 8)));
  const token = String(url).split('/review/')[1]!;
  check('the token resolves to the artifact server-side', resolveReviewToken(token) === ARTIFACT);
  check('the same artifact reuses its token (no link sprawl)', reviewUrlFor(ARTIFACT) === url && reviewLinkCount() === 1);
  check('an unknown token resolves to nothing', resolveReviewToken('not-a-real-token') === undefined);
  check('an expired token resolves to nothing', resolveReviewToken(token, Date.now() + 25 * 60 * 60 * 1000) === undefined);
  resetReviewLinksForTest();
  check('nothing to show → no link at all (rather than a raw URL)', reviewUrlFor(undefined) === undefined);
}

console.log('\n# the /review route actually serves the image from our host (Fix 4)');
{
  // The route is the part a parent touches, so exercise it over real HTTP: point the server at a
  // local stand-in for the vendor artifact and confirm we proxy it, never revealing the vendor URL.
  const { startWebServer } = await import('../src/integrations/web.js');
  resetReviewLinksForTest();
  const { createServer } = await import('node:http');
  const fake = createServer((req, res) => {
    // The proxy must send our Skyvern key upstream and never leak it downstream.
    if (req.headers['x-api-key'] !== 'test-skyvern-key') { res.writeHead(403); res.end('no key'); return; }
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });
  await new Promise<void>((r) => fake.listen(0, '127.0.0.1', r));
  const fakePort = (fake.address() as { port: number }).port;
  process.env.SKYVERN_API_KEY = 'test-skyvern-key';

  const server = await startWebServer({ ready: async () => true }, 0);
  const addr = server.address() as { port: number } | null;
  const port = addr?.port ?? 0;
  // Our link must point at the server we just started (reviewBaseUrl reads env at call time).
  process.env.CONNECT_BASE_URL = `http://127.0.0.1:${port}`;
  const link = reviewUrlFor(`http://127.0.0.1:${fakePort}/artifact`)!;
  check('the parent-facing URL is ours', link.startsWith(`http://127.0.0.1:${port}/review/`), link);

  const okRes = await fetch(link);
  check('the route returns the artifact image', okRes.status === 200 && okRes.headers.get('content-type') === 'image/png', `${okRes.status} ${okRes.headers.get('content-type')}`);
  const bytes = Buffer.from(await okRes.arrayBuffer());
  check('...with the actual bytes', bytes.length === 4 && bytes[0] === 0x89);

  const badRes = await fetch(`http://127.0.0.1:${port}/review/expired-or-unknown`);
  check('an unknown/expired token gets an honest page, not a broken image', badRes.status === 410 && /expired/i.test(await badRes.text()), String(badRes.status));

  server.close(); fake.close();
}

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
