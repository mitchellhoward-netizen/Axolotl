/**
 * Review links: our own URL for a vendor screenshot — and one that survives a deploy.
 *
 * When Skyvern finishes a fill it hands back a signed artifact URL
 * (`https://api.skyvern.com/v1/artifacts/...`). Texting that to a parent is wrong three ways:
 * it exposes a vendor URL in their thread, it carries a signature we do not control, and it
 * expires on the vendor's clock (~24h) with no explanation when it dies.
 *
 * So we text `${base}/review/<token>` and the route in src/integrations/web.ts resolves the
 * token and fetches the artifact SERVER-SIDE with our Skyvern key, so neither the key nor the
 * signed URL reaches the parent.
 *
 * WHY THE MAPPING LIVES IN THE TOKEN, NOT IN A TABLE
 * --------------------------------------------------
 * The route resolves tokens SYNCHRONOUSLY (`const artifactUrl = resolveReviewToken(token)`), and
 * it belongs to another workstream, so it has to keep working unchanged. A database read cannot
 * be synchronous, and resolving from a cache that is filled after boot leaves a window right
 * after every deploy where a VALID link reports "expired" — which is the exact bug this file
 * exists to fix.
 *
 * So the token carries its own mapping as sealed ciphertext (AES-256-GCM, purpose-bound; see
 * src/lib/secret-box.ts). Consequences, all of them wanted:
 *   - a redeploy cannot break a live link, because nothing has to be re-read;
 *   - we never STORE the vendor's signed artifact URL, so no bearer credential sits in a
 *     database, a backup, or a replica;
 *   - resolution stays synchronous and allocation-cheap, so the route is untouched;
 *   - the expiry travels inside the token, so the honest 410 still happens on time.
 *
 * The trade-off is length: the sealed payload contains the signed URL, so a review URL is ~300
 * characters instead of ~45. It renders fine in iMessage and it is worth it.
 *
 * With no SECRETS_ENC_KEY configured we fall back to the previous in-memory mapping so the
 * feature degrades to its old behaviour rather than losing the screenshot entirely. Neither the
 * mapping nor the vendor URL is ever logged: the token is the only thing the parent sees.
 */
import { randomBytes } from 'node:crypto';
import { secretBox } from '../lib/secret-box.js';

/** Artifact signed URLs expire after ~24h; our link should not outlive the thing it points at. */
const TTL_MS = Number(process.env.REVIEW_LINK_TTL_MS ?? 24 * 60 * 60 * 1000);
/** Bound the payload we will attempt to open, so a hostile token cannot make us do work. */
const MAX_TOKEN_CHARS = 2048;
const PURPOSE = 'review-link';

interface SealedReview { u: string; e: number }

/** In-process index: dedupe (same artifact → same link) and the no-key fallback. */
const cache = new Map<string, { token: string; expiresAt: number }>();
/** Populated only when there is no sealing key, i.e. the old memory-only behaviour. */
const memoryOnly = new Map<string, { artifactUrl: string; expiresAt: number }>();
let warnedNoKey = false;

/** The public origin our links are served from. */
export function reviewBaseUrl(): string {
  if (process.env.CONNECT_BASE_URL) return process.env.CONNECT_BASE_URL.replace(/\/$/, '');
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return `http://localhost:${process.env.WEB_PORT || 3000}`;
}

function sweep(now: number): void {
  for (const [key, link] of cache) if (link.expiresAt <= now) cache.delete(key);
  for (const [token, link] of memoryOnly) if (link.expiresAt <= now) memoryOnly.delete(token);
}

/** SecretBox prefixes sealed values with `v1:`; a URL token must not contain `+`, `/` or `=`. */
function sealedToToken(sealed: string): string {
  return Buffer.from(sealed.slice('v1:'.length), 'base64').toString('base64url');
}
function tokenToSealed(token: string): string {
  return 'v1:' + Buffer.from(token, 'base64url').toString('base64');
}

function openToken(token: string): SealedReview | undefined {
  const box = secretBox();
  if (!box || !token || token.length > MAX_TOKEN_CHARS) return undefined;
  const opened = box.open(tokenToSealed(token), PURPOSE);
  if (opened === undefined) return undefined;
  try {
    const parsed = JSON.parse(opened) as Partial<SealedReview>;
    if (typeof parsed.u !== 'string' || typeof parsed.e !== 'number') return undefined;
    return { u: parsed.u, e: parsed.e };
  } catch {
    return undefined;
  }
}

/**
 * Our URL for a vendor artifact, or undefined when there is nothing to show. The same artifact
 * reuses its link while this process lives, so a retry does not mint a second one.
 */
export function reviewUrlFor(artifactUrl: string | undefined, now = Date.now()): string | undefined {
  if (!artifactUrl) return undefined;
  // Only vendor artifact URLs need proxying; anything already ours passes through.
  if (artifactUrl.startsWith(reviewBaseUrl())) return artifactUrl;
  sweep(now);

  const cached = cache.get(artifactUrl);
  if (cached && cached.expiresAt > now) return `${reviewBaseUrl()}/review/${cached.token}`;

  const expiresAt = now + TTL_MS;
  const box = secretBox();
  if (!box) {
    if (!warnedNoKey) {
      warnedNoKey = true;
      console.warn('[review-links] SECRETS_ENC_KEY is not set — review links are memory-only and a deploy will break them');
    }
    const token = randomBytes(18).toString('base64url');
    memoryOnly.set(token, { artifactUrl, expiresAt });
    cache.set(artifactUrl, { token, expiresAt });
    return `${reviewBaseUrl()}/review/${token}`;
  }

  const payload: SealedReview = { u: artifactUrl, e: expiresAt };
  const token = sealedToToken(box.seal(JSON.stringify(payload), PURPOSE));
  cache.set(artifactUrl, { token, expiresAt });
  return `${reviewBaseUrl()}/review/${token}`;
}

/** The artifact URL behind a token, or undefined when unknown, tampered with, or expired. */
export function resolveReviewToken(token: string, now = Date.now()): string | undefined {
  // Fallback path first — only ever populated when there is no sealing key.
  const legacy = memoryOnly.get(token);
  if (legacy) {
    if (legacy.expiresAt <= now) {
      memoryOnly.delete(token);
      return undefined;
    }
    return legacy.artifactUrl;
  }
  const sealed = openToken(token);
  if (!sealed) return undefined;
  if (sealed.e <= now) return undefined; // honest expiry, carried by the token itself
  return sealed.u;
}

/** Test seam: drop every in-memory mapping, simulating a restart. Sealed tokens still resolve. */
export function resetReviewLinksForTest(): void {
  cache.clear();
  memoryOnly.clear();
}

/**
 * Test seam: how many live links this process is holding (never exposes the mapping).
 *
 * Counted by TOKEN, not by map entry. Without a sealing key the same link is recorded in both
 * the by-artifact cache and the memory-only map, so summing the maps reported one link as two
 * (and made a correct implementation look like it was sprawling).
 */
export function reviewLinkCount(): number {
  const tokens = new Set<string>();
  for (const v of cache.values()) tokens.add(v.token);
  for (const token of memoryOnly.keys()) tokens.add(token);
  return tokens.size;
}

/** Exposed so a test can reason about the window it is asserting against. */
export const REVIEW_LINK_TTL_MS = TTL_MS;
