#!/usr/bin/env tsx
/**
 * Retention (#5) and review-link durability (#6).
 *
 *   npm run test:retention
 *
 * Two things are proven here and neither needs a network:
 *   1. the retention PREDICATE — 89 days kept / 91 deleted, 59 kept / 61 deleted, plus the
 *      boundary and the "no timestamp" case, over fixed dates;
 *   2. a review link SURVIVES A RESTART — mint, drop every in-memory mapping, and resolve it
 *      again. That is the regression: the mapping used to live only in memory, so a redeploy
 *      broke a live link and the parent was told it had expired.
 */
import { randomBytes } from 'node:crypto';

let pass = 0; let fail = 0;
const check = (n: string, c: boolean, d?: string) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } };

// Set the sealing key BEFORE the module loads (secretBox memoises on first use).
process.env.SECRETS_ENC_KEY = randomBytes(32).toString('base64');
process.env.CONNECT_BASE_URL = 'https://agent.example.test';

const { isExpired, cutoffIso, RETENTION_RULES } = await import('./prune-retention.js');
const { reviewUrlFor, resolveReviewToken, resetReviewLinksForTest, reviewLinkCount, REVIEW_LINK_TTL_MS } = await import('../src/integrations/review-links.js');

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-09-20T12:00:00.000Z');
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

console.log('# the published schedule is the one the job enforces');
check('messages: 90 days', RETENTION_RULES.find((r) => r.table === 'message')?.days === 90);
check('triaged email: 60 days', RETENTION_RULES.find((r) => r.table === 'incoming_email')?.days === 60);
check('exactly two tables are pruned (consent_event is not one)', RETENTION_RULES.length === 2 && !RETENTION_RULES.some((r) => r.table === 'consent_event'));

console.log('\n# the selection predicate (pure, fixed dates)');
check('messages: 89 days old is KEPT', isExpired(ago(89), 90, NOW) === false);
check('messages: 91 days old is DELETED', isExpired(ago(91), 90, NOW) === true);
check('messages: exactly 90 days is kept (boundary rounds toward keeping)', isExpired(cutoffIso(90, NOW), 90, NOW) === false);
check('email: 59 days old is KEPT', isExpired(ago(59), 60, NOW) === false);
check('email: 61 days old is DELETED', isExpired(ago(61), 60, NOW) === true);
check('email: exactly 60 days is kept', isExpired(cutoffIso(60, NOW), 60, NOW) === false);
check('a message from today is kept', isExpired(ago(0), 90, NOW) === false);
check('a row with no timestamp is left alone (never guessed at)', isExpired(null, 90, NOW) === false && isExpired(undefined, 60, NOW) === false);
check('an unparseable timestamp is left alone', isExpired('not-a-date', 90, NOW) === false);
check('the same row is deleted under the 60d rule but kept under 90d', isExpired(ago(75), 60, NOW) === true && isExpired(ago(75), 90, NOW) === false);

console.log('\n# review links: our URL, and it survives a restart');
{
  const ARTIFACT = 'https://api.skyvern.com/v1/artifacts/a_576336882491650818/content?expiry=1789875689&kid=2026-03-12-v1&sig=vOStVJzJ5zaotwqQgQSamT2DTbFmqgvZAM2kMHNW8bo';
  resetReviewLinksForTest();
  const url = reviewUrlFor(ARTIFACT, NOW);
  check('we hand back OUR url, not the vendor one', Boolean(url) && url!.startsWith('https://agent.example.test/review/'), String(url));
  check('the vendor url is NOT readable in the token', Boolean(url) && !url!.includes('api.skyvern.com') && !url!.includes('sig='), 'vendor URL leaked into the link');
  const token = url!.split('/review/')[1]!;
  check('it resolves to the artifact server-side', resolveReviewToken(token, NOW) === ARTIFACT);
  check('the same artifact reuses its link (no sprawl)', reviewUrlFor(ARTIFACT, NOW) === url && reviewLinkCount() === 1);

  // THE REGRESSION: this is what used to break a live link on every deploy.
  resetReviewLinksForTest();
  check('...and it still resolves after every in-memory mapping is dropped (a redeploy)', resolveReviewToken(token, NOW) === ARTIFACT);
  check('...with no in-memory state needed at all', reviewLinkCount() === 0);
}
{
  const ARTIFACT = 'https://api.skyvern.com/v1/artifacts/a_expiry/content?sig=x';
  resetReviewLinksForTest();
  const token = reviewUrlFor(ARTIFACT, NOW)!.split('/review/')[1]!;
  check('it resolves inside the window', resolveReviewToken(token, NOW + REVIEW_LINK_TTL_MS - 1000) === ARTIFACT);
  check('and is honestly gone after it (the route renders 410)', resolveReviewToken(token, NOW + REVIEW_LINK_TTL_MS + 1000) === undefined);
}
{
  resetReviewLinksForTest();
  check('an unknown token resolves to nothing', resolveReviewToken('not-a-real-token', NOW) === undefined);
  check('a tampered token resolves to nothing', (() => {
    const url = reviewUrlFor('https://api.skyvern.com/v1/artifacts/a_tamper/content?sig=y', NOW)!;
    const token = url.split('/review/')[1]!;
    const flipped = (token.slice(0, -1) + (token.slice(-1) === 'A' ? 'B' : 'A'));
    return resolveReviewToken(flipped, NOW) === undefined;
  })());
  check('a url that is already ours passes through unchanged', reviewUrlFor('https://agent.example.test/review/abc', NOW) === 'https://agent.example.test/review/abc');
  check('an over-long token is refused rather than chewed on', resolveReviewToken('A'.repeat(5000), NOW) === undefined);
  check('nothing to show → no link at all', reviewUrlFor(undefined, NOW) === undefined);

  // Rotating the key must invalidate outstanding links rather than resolving them to garbage.
  const beforeRotation = reviewUrlFor('https://api.skyvern.com/v1/artifacts/a_key/content?sig=z', NOW)!;
  const rotatedToken = beforeRotation.split('/review/')[1]!;
  process.env.SECRETS_ENC_KEY = randomBytes(32).toString('base64');
  const keys = await import('../src/lib/secret-box.js');
  keys.resetSecretBoxForTest();
  check('a token sealed under an OLD key resolves to nothing', resolveReviewToken(rotatedToken, NOW) === undefined);
}

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
