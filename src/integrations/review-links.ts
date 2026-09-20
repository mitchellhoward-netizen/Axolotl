/**
 * Review links: our own URL for a vendor screenshot.
 *
 * When Skyvern finishes a fill it hands back a signed artifact URL
 * (`https://api.skyvern.com/v1/artifacts/...`). Texting that to a parent is wrong three ways:
 * it exposes a vendor URL in their thread, it carries a signature we do not control, and it
 * expires on the vendor's clock (~24h) with no explanation when it dies.
 *
 * So we keep an opaque token to artifact-URL mapping in memory and text `${base}/review/<token>`.
 * The route in src/integrations/web.ts resolves the token and fetches the artifact SERVER-SIDE
 * with our Skyvern key, so the key and the signed URL never reach the parent.
 *
 * The mapping is deliberately never logged: the token is the only thing the parent sees, and the
 * signed URL is a bearer credential for that artifact.
 */
import { randomBytes } from 'node:crypto';

/** Artifact signed URLs expire after ~24h; our link should not outlive the thing it points at. */
const TTL_MS = Number(process.env.REVIEW_LINK_TTL_MS ?? 24 * 60 * 60 * 1000);

interface ReviewLink {
  /** The vendor artifact URL (never logged, never sent to the parent). */
  artifactUrl: string;
  expiresAt: number;
}

const links = new Map<string, ReviewLink>();

/** The public origin our links are served from. */
export function reviewBaseUrl(): string {
  if (process.env.CONNECT_BASE_URL) return process.env.CONNECT_BASE_URL.replace(/\/$/, '');
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return `http://localhost:${process.env.WEB_PORT || 3000}`;
}

function sweep(now: number): void {
  for (const [token, link] of links) {
    if (link.expiresAt <= now) links.delete(token);
  }
}

/**
 * Our URL for a vendor artifact, or undefined when there is nothing to show. Reuses the token
 * for the same artifact so a retry does not mint a second link.
 */
export function reviewUrlFor(artifactUrl: string | undefined, now = Date.now()): string | undefined {
  if (!artifactUrl) return undefined;
  // Only vendor artifact URLs need proxying; anything already ours passes through.
  if (artifactUrl.startsWith(reviewBaseUrl())) return artifactUrl;
  sweep(now);
  for (const [token, link] of links) {
    if (link.artifactUrl === artifactUrl && link.expiresAt > now) return `${reviewBaseUrl()}/review/${token}`;
  }
  const token = randomBytes(18).toString('base64url');
  links.set(token, { artifactUrl, expiresAt: now + TTL_MS });
  return `${reviewBaseUrl()}/review/${token}`;
}

/** The artifact URL behind a token, or undefined when unknown/expired. */
export function resolveReviewToken(token: string, now = Date.now()): string | undefined {
  const link = links.get(token);
  if (!link) return undefined;
  if (link.expiresAt <= now) {
    links.delete(token);
    return undefined;
  }
  return link.artifactUrl;
}

/** Test seam. */
export function resetReviewLinksForTest(): void {
  links.clear();
}

/** Test seam: how many live links we are holding (never exposes the mapping). */
export function reviewLinkCount(): number {
  return links.size;
}
