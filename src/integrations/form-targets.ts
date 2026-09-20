/**
 * Form targets — stop rediscovering the same form every time.
 *
 * Every fill used to start from scratch: we handed the browser vendor a URL and a free-form
 * prompt and hoped. For a form a family uses every year — and for a school's form, which is the
 * SAME form for every family — that is wasted work and avoidable failure. Two losses:
 *
 *   1. the exact form URL gets rediscovered, or guessed. Guessing is how we once handed the
 *      vendor a program landing page with no form on it and burned a session to find out;
 *   2. the field mapping is re-derived by a model, when it is the same fields in the same order.
 *
 * This module holds #1: `(host, program)` → the URL that actually worked, when, and how often.
 * Recipes (the field mapping) live next door in `form-recipes.ts`.
 *
 * THE RULE THAT MATTERS: a target is recorded ONLY from a verified outcome — a fill the vendor
 * reported complete, or better, a submit the SITE confirmed with a reference. Never from a
 * guess, never from a failure, never from an unconfirmed run. A learned target outranks both
 * the model's choice and our own records, so recording a bad URL would make it permanent — the
 * one failure mode that would make this feature worse than not having it.
 *
 * Persistence follows the established contract in `form-recipes.ts`: an in-process map in front
 * of Supabase, so a redeploy is not a cold start and a missing database is not a crash.
 */
import { getSupabase } from './db.js';

export interface FormTarget {
  /** `host|program` — see `targetKey()`. */
  key: string;
  url: string;
  host: string;
  program: string;
  /** Which school, when the caller knows. Free text; the host is what keys the row. */
  school?: string;
  /** `learned` = recorded from a verified run. `configured` = an operator seeded it. */
  source: 'learned' | 'configured';
  /** ISO timestamp of the verified outcome that earned this target. */
  verifiedAt: string;
  successCount: number;
  failCount: number;
  /** Set when a stored target stopped working; the next attempt goes to discovery. */
  unhealthyAt?: string;
  unhealthyReason?: string;
}

/** How long a verified target stays trustworthy without being re-confirmed. */
const STALE_DAYS = Number(process.env.FORM_TARGET_STALE_DAYS ?? 180);

const mem = new Map<string, FormTarget>();

/** The host of a URL, lowercased, without `www.` (so www and apex share a target). */
export function hostOf(url: string): string {
  try {
    return new URL(url).host.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * A stable program slug from a URL path: the last meaningful segment.
 *
 * Deliberately conservative. Form URLs in the wild end in `/apply`, `/enrollment`, `/form`,
 * `/application/new`; they do NOT end in a file extension or a query string (which is dropped
 * here). This is the fallback when the caller does not know the program name, and it is why an
 * explicit `program` should always be preferred — see `targetKey()`.
 */
export function programSlugFrom(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, '');
    const segs = path.split('/').filter(Boolean);
    // Strip a file extension rather than discarding the segment: "/forms/apply.php" is the
    // "apply" program, not the "forms" one. A bare "index" is not a program name, so step back.
    let last = (segs[segs.length - 1] ?? '').replace(/\.(html?|php|aspx?|jsp)$/i, '');
    if (/^index$/i.test(last) && segs.length > 1) last = segs[segs.length - 2]!.replace(/\.(html?|php|aspx?|jsp)$/i, '');
    return last.toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 60) || 'form';
  } catch {
    return 'form';
  }
}

/**
 * The key: the host (which is the school's domain) plus the program. An explicit program always
 * wins over one derived from the path, because a path slug can differ between two URLs that are
 * the same program ("/apply" this year, "/enrollment/new" next).
 */
export function targetKey(input: { url?: string; program?: string; school?: string }): string {
  const host = input.url ? hostOf(input.url) : '';
  const program = (input.program ?? '').trim().toLowerCase() || (input.url ? programSlugFrom(input.url) : 'form');
  return `${host}|${program}`;
}

/** Pure: is this target too old to trust without re-confirming? */
export function isStale(t: FormTarget, now = Date.now()): boolean {
  const at = Date.parse(t.verifiedAt);
  if (!Number.isFinite(at)) return true;
  return now - at > STALE_DAYS * 86_400_000;
}

/** Pure: a target that failed pre-flight or a run is not reused until it is re-verified. */
export function isHealthy(t: FormTarget): boolean {
  return !t.unhealthyAt;
}

/** Pure: the whole reuse decision, in one place, so callers cannot disagree about it. */
export function canReuse(t: FormTarget, now = Date.now()): boolean {
  return isHealthy(t) && !isStale(t, now);
}

// ── Persistence (in-process cache in front of Supabase, like form-recipes) ───

export async function getFormTarget(key: string): Promise<FormTarget | undefined> {
  const cached = mem.get(key);
  if (cached) return cached;
  const c = getSupabase();
  if (!c) return undefined;
  const { data, error } = await c.from('form_target').select('target').eq('key', key).maybeSingle();
  if (error) {
    // Say so rather than silently behaving as if nothing was ever learned.
    console.warn('[form-targets] read failed:', error.message);
    return undefined;
  }
  const t = (data?.target ?? undefined) as FormTarget | undefined;
  if (t) mem.set(key, t);
  return t;
}

export async function saveFormTarget(t: FormTarget): Promise<void> {
  mem.set(t.key, t);
  const c = getSupabase();
  if (!c) return;
  const { error } = await c
    .from('form_target')
    .upsert({ key: t.key, url: t.url, host: t.host, program: t.program, target: t, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  // Previously the recipe store swallowed this error, so a missing table looked like success
  // and every "learned" recipe was lost on redeploy. Do not repeat that here.
  if (error) console.warn('[form-targets] save failed:', error.message);
}

/**
 * Record a target from a VERIFIED outcome only.
 *
 * `evidence` is required and deliberately narrow: `confirmed-submit` (the site gave a reference)
 * is the strongest, `completed-fill` (the vendor reported the fill complete with no blocker) is
 * the weaker one we accept for a fill-only run. There is no code path here for a guess.
 */
export async function recordFormTargetSuccess(input: {
  url: string;
  evidence: 'completed-fill' | 'confirmed-submit';
  program?: string;
  school?: string;
  runId?: string;
}): Promise<FormTarget> {
  const key = targetKey({ url: input.url, program: input.program, school: input.school });
  const existing = await getFormTarget(key);
  const now = new Date().toISOString();
  const target: FormTarget = {
    key,
    url: input.url,
    host: hostOf(input.url),
    program: (input.program ?? '').trim().toLowerCase() || programSlugFrom(input.url),
    school: input.school ?? existing?.school,
    // An operator-seeded target stays `configured` so we never misrepresent its provenance.
    source: existing?.source === 'configured' ? 'configured' : 'learned',
    verifiedAt: now,
    successCount: (existing?.successCount ?? 0) + 1,
    failCount: existing?.failCount ?? 0,
  };
  await saveFormTarget(target);
  console.log(
    `[form-targets] learned ${key} -> ${input.url} (${input.evidence}, success #${target.successCount}${input.runId ? `, run ${input.runId}` : ''})`,
  );
  return target;
}

/**
 * A stored target stopped working. We keep the row (the history is useful) but mark it so the
 * next attempt skips straight to discovery instead of spending a session on a dead URL.
 */
export async function markFormTargetUnhealthy(key: string, reason: string): Promise<void> {
  const existing = await getFormTarget(key);
  if (!existing) return;
  const target: FormTarget = {
    ...existing,
    unhealthyAt: new Date().toISOString(),
    unhealthyReason: reason.slice(0, 200),
    failCount: existing.failCount + 1,
  };
  await saveFormTarget(target);
  console.warn(`[form-targets] marked unhealthy ${key}: ${reason}`);
}

// ── Resolution: stored target first, the caller's URL as the fallback ────────

export interface ResolveResult {
  /** The URL to actually use. Empty only when we have neither a stored target nor a given URL. */
  url: string;
  /** `stored` — reused a verified target. `given` — used the caller's URL (a discovery result). */
  via: 'stored' | 'given';
  target?: FormTarget;
  /** Set when a stored target existed but was not reused, and why. */
  fellBack?: 'stale' | 'unhealthy' | 'no-form' | 'none';
}

export interface ResolveDeps {
  get?: (key: string) => Promise<FormTarget | undefined>;
  hasForm?: (url: string) => Promise<boolean | undefined>;
  markUnhealthy?: (key: string, reason: string) => Promise<void>;
}

/**
 * Pick the URL to fill.
 *
 * Order of authority: a stored target that is healthy and not stale, CONFIRMED by a cheap
 * pre-flight, beats the URL the caller supplied — because the stored one is the one that
 * demonstrably worked and the supplied one is usually a fresh guess or a fresh discovery.
 * The pre-flight is what stops us spending a browser session on a stored URL that has since
 * become an information page, and a stored URL that fails pre-flight is marked unhealthy so
 * the next attempt goes straight to discovery.
 *
 * `hasForm` returning `undefined` means "cannot tell" (a client-rendered app has no inputs in
 * the HTML). That is NOT a failure: we trust the stored target rather than throwing away a
 * verified URL on a false negative.
 */
export async function resolveFormTarget(
  input: { givenUrl?: string; program?: string; school?: string; now?: number },
  deps: ResolveDeps = {},
): Promise<ResolveResult> {
  const get = deps.get ?? getFormTarget;
  const markUnhealthy = deps.markUnhealthy ?? markFormTargetUnhealthy;
  const now = input.now ?? Date.now();
  const key = targetKey({ url: input.givenUrl, program: input.program, school: input.school });

  const stored = await get(key).catch(() => undefined);
  if (stored) {
    if (!isHealthy(stored)) {
      // Already known bad: do not pre-flight it again, go straight to the caller's URL.
      return input.givenUrl ? { url: input.givenUrl, via: 'given', target: stored, fellBack: 'unhealthy' } : { url: '', via: 'given', target: stored, fellBack: 'unhealthy' };
    }
    if (isStale(stored, now)) {
      // Old enough that we want a fresh confirmation, but the URL is still the best guess we
      // have — so use the caller's URL if they brought one, else re-verify the stored one.
      if (input.givenUrl && input.givenUrl !== stored.url) {
        return { url: input.givenUrl, via: 'given', target: stored, fellBack: 'stale' };
      }
    } else if (deps.hasForm) {
      const hasForm = await deps.hasForm(stored.url).catch(() => undefined);
      if (hasForm === false) {
        await markUnhealthy(key, 'pre-flight found no form at the stored URL');
        if (input.givenUrl && input.givenUrl !== stored.url) {
          return { url: input.givenUrl, via: 'given', target: stored, fellBack: 'no-form' };
        }
        // Nothing else to try; let the caller rediscover rather than reuse a dead URL.
        return { url: '', via: 'given', target: stored, fellBack: 'no-form' };
      }
      // true (a form is there) or undefined (cannot tell) -> the verified target stands.
    }
    return { url: stored.url, via: 'stored', target: stored };
  }

  return { url: input.givenUrl ?? '', via: 'given', fellBack: 'none' };
}

/** Test seam. */
export function resetFormTargetsForTest(): void {
  mem.clear();
}
