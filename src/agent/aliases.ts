/**
 * Aliases — other words for the same thing.
 *
 * Why this exists: recall is substring matching, so a parent who told us about "the
 * noodles place" and later asks about "pasta" finds nothing, and a typo finds nothing.
 * Their own probe table (see docs/MEMORY-COMPARISON.md) shows a competitor failing the
 * same way; ours fails identically because it is the same technique.
 *
 * THE DISCIPLINE THAT MATTERS: aliases are harvested from the PARENT'S OWN WORDS, and a
 * model-generated alias is a separate, untrusted category that can never outrank them.
 * A drifting alias is worse than no alias at all — it surfaces the wrong memory about a
 * child, and the parent has no way to know why. So everything here is deterministic
 * pattern reading, never generation.
 *
 * Pure: no IO, no clock, no model. The store and the wiring live elsewhere.
 */

export type AliasSource = 'parent' | 'model';

export interface AliasPair {
  /** One name for the thing. */
  a: string;
  /** Another name for the same thing. */
  b: string;
  source: AliasSource;
}

/** Normalise a candidate term: quotes off, whitespace collapsed, lowercase. */
export function normalizeTerm(raw: string): string {
  return raw
    .replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Reject anything that is not plausibly a term: too short, too long, or a sentence. */
function usable(term: string): boolean {
  if (term.length < 2 || term.length > 48) return false;
  if (!/[a-z0-9]/.test(term)) return false;
  // A whole sentence is not an alias; more than six words is prose.
  if (term.split(' ').length > 6) return false;
  return true;
}

/**
 * Equivalence patterns, all requiring the parent to state it explicitly. Deliberately
 * conservative: a missed alias costs one failed search, a wrong alias corrupts recall.
 */
const PATTERNS: Array<[RegExp, number, number]> = [
  // "pasta", also called "noodles"   |   'the bus pass' is also known as 'the yellow card'
  [/["“']([^"”']{2,48})["”']\s*,?\s*(?:also\s+)?(?:called|known\s+as|means|is\s+the\s+same\s+as)\s*["“']?([^"”',.;]{2,48})["”']?/i, 1, 2],
  // by "noodles" I mean pasta   |   when I say noodles I mean the pasta place
  [/\b(?:by|when\s+i\s+say|if\s+i\s+say)\s+["“']?([^"”',.;]{2,48}?)["”']?\s+i\s+mean\s+["“']?([^"”',.;]{2,48})["”']?/i, 1, 2],
  // noodles, also called pasta  |  the afterschool program, otherwise known as CKC
  [/\b([a-z][a-z0-9' -]{1,40}?)\s*,?\s*(?:also|otherwise)\s+(?:called|known\s+as)\s+([a-z][a-z0-9' -]{1,40})/i, 1, 2],
  // we call it the yellow card  |  I call them noodles
  [/\b(?:we|i)\s+call\s+(?:it|them|him|her)\s+["“']?([^"”',.;]{2,48}?)["”']?\s*$/i, 1, -1],
];

/**
 * Read every explicit equivalence out of a message the PARENT wrote. Everything returned is
 * `source: 'parent'` — these are their words, quoted back to themselves.
 *
 * The last pattern ("we call it X") has no second side; the caller supplies the subject it
 * belongs to, so it is returned with `b: ''` and filled in by `harvestAgainst`.
 */
export function harvestAliases(text: string, subject?: string): AliasPair[] {
  const t = String(text ?? '');
  if (!t.trim()) return [];
  const out: AliasPair[] = [];
  const seen = new Set<string>();
  const push = (a: string, b: string) => {
    const x = normalizeTerm(a);
    const y = normalizeTerm(b);
    if (!usable(x) || !usable(y) || x === y) return;
    const key = [x, y].sort().join('\u0000');
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ a: x, b: y, source: 'parent' });
  };

  for (const [re, ai, bi] of PATTERNS) {
    const m = re.exec(t);
    if (!m) continue;
    if (bi === -1) {
      // "we call it X" — only meaningful when we know what "it" is.
      if (subject) push(m[ai] ?? '', subject);
      continue;
    }
    push(m[ai] ?? '', m[bi] ?? '');
  }
  return out;
}

/** Order aliases so the parent's own words always come first. */
export function rankAliases(pairs: AliasPair[]): AliasPair[] {
  return [...pairs].sort((p, q) => (p.source === q.source ? 0 : p.source === 'parent' ? -1 : 1));
}

/**
 * Expand a search query through the alias set: if the query mentions one name for a thing,
 * search for its other names too. Returns the query first, then at most a few alternatives,
 * so a single recall never turns into an unbounded search.
 */
export function expandQuery(query: string, pairs: AliasPair[], max = 4): string[] {
  const q = normalizeTerm(query);
  if (!q) return [];
  const terms = [q];
  for (const p of rankAliases(pairs)) {
    if (terms.length >= max) break;
    const hitA = q.includes(p.a) || p.a.includes(q);
    const hitB = q.includes(p.b) || p.b.includes(q);
    const add = hitA ? p.b : hitB ? p.a : undefined;
    if (add && !terms.includes(add) && terms.length < max) terms.push(add);
  }
  return terms;
}

/** Does a message match any of the expanded terms? */
export function matchesTerms(content: string, terms: string[]): boolean {
  const c = content.toLowerCase();
  return terms.some((t) => t.length > 0 && c.includes(t));
}
