import assert from 'node:assert';
import { SearchSession, DEFAULT_BUDGET, normalizeQuery, normalizeUrl, extractSearchTerms } from '../src/knowledge/trajectory.js';
import { extractUrls, inferCategory } from '../src/knowledge/research.js';

let passed = 0;
function ok(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log('trajectory + researcher logic');

// 1. query dedup
ok('normalizeQuery dedupes casing/whitespace/punctuation', () => {
  assert.strictEqual(normalizeQuery('Transportation Bus!!'), normalizeQuery('  transportation   bus  '));
  const s = new SearchSession('q');
  assert.strictEqual(s.issueQuery('bus pass'), 'bus pass');
  assert.strictEqual(s.issueQuery('  Bus   Pass? '), null); // duplicate
  assert.strictEqual(s.searchesUsed, 1);
});

// 2. search budget
ok('issueQuery respects maxSearches', () => {
  const s = new SearchSession('q', { ...DEFAULT_BUDGET, maxSearches: 2 });
  assert.ok(s.issueQuery('a'));
  assert.ok(s.issueQuery('b'));
  assert.strictEqual(s.issueQuery('c'), null);
});

// 3. fetch budget + seen dedup
ok('markFetched dedupes URLs and respects maxFetches', () => {
  const s = new SearchSession('q', { ...DEFAULT_BUDGET, maxFetches: 1 });
  s.markFetched({ url: 'https://example.com/x?utm_source=news', useful: true });
  s.markFetched({ url: 'https://example.com/x', useful: false }); // over budget → ignored
  assert.strictEqual(s.fetchesUsed, 1);
  assert.ok(s.hasSeen('https://example.com/x/'));
  assert.deepStrictEqual(s.usefulUrls, ['https://example.com/x?utm_source=news']);
});

// 4. stuck detection
ok('isStuck after maxNoProgress no-progress steps', () => {
  const s = new SearchSession('q', { ...DEFAULT_BUDGET, maxNoProgress: 3 });
  for (let i = 0; i < 2; i++) s.recordStep({ kind: 'search', subject: 'q' + i, reason: 'gap', newSources: 0, usefulSources: 0, learnedTerms: [] });
  assert.strictEqual(s.isStuck(), false);
  s.recordStep({ kind: 'search', subject: 'q2', reason: 'gap', newSources: 0, usefulSources: 0, learnedTerms: [] });
  assert.strictEqual(s.isStuck(), true);
});

// 5. recovery queries
ok('recoveryQueries produce exact-phrase and site: variants', () => {
  const s = new SearchSession('q');
  assert.deepStrictEqual(s.recoveryQueries('Soquel Union transportation', 'suesd.org'), [
    '"Soquel Union transportation"',
    '"Soquel Union transportation" site:suesd.org',
  ]);
});

// 6. learned-term extraction
ok('extractSearchTerms finds policy numbers, acronyms, keywords', () => {
  const terms = extractSearchTerms(
    'Transportation is governed by Administrative Regulation 3541. Submit the application by the deadline. IEP and FAPE apply.',
  );
  assert.ok(terms.some((t) => t.toLowerCase().includes('3541')));
  assert.ok(terms.some((t) => t.toLowerCase() === 'application'));
  assert.ok(terms.some((t) => t === 'IEP'));
});

// 7. URL extraction from DDG markdown
ok('extractUrls pulls multiple result URLs', () => {
  const md = `results\nhttps://duckduckgo.com/l/?uddg=${encodeURIComponent('https://www.suesd.org/mckinney-vento')}&rut=x\nmore\nhttps://duckduckgo.com/l/?uddg=${encodeURIComponent('https://www.suesd.org/transportation')}&rut=y`;
  const urls = extractUrls(md, 5);
  assert.deepStrictEqual(urls, ['https://www.suesd.org/mckinney-vento', 'https://www.suesd.org/transportation']);
});

// 8. category inference
ok('inferCategory maps free-text goals to categories', () => {
  assert.strictEqual(inferCategory('my kid needs a bus'), 'TRANSPORTATION');
  assert.strictEqual(inferCategory('we need help with food'), 'MEALS');
  assert.strictEqual(inferCategory('she is struggling in math'), undefined);
});

// 9. stopping: covered
ok('evaluateStop reports covered when gaps are zero', () => {
  const s = new SearchSession('q');
  assert.deepStrictEqual(s.evaluateStop(0), { stop: true, reason: 'covered' });
  assert.strictEqual(s.evaluateStop(2).stop, false);
});

console.log(`\n${passed} assertions passed`);
