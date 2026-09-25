import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signed, expiring values for links we hand out — here, the OAuth `state` that says which
 * family a Google account is being connected to.
 *
 * The state used to be the bare guardian id. Once the connection can READ mail, that is an
 * account-linking hole: anyone who knows (or guesses) a family's id can send another parent a
 * connect link carrying it, and that parent's inbox lands in the wrong family. Signing binds
 * the id to a link we issued, and the expiry keeps an old link from working forever.
 *
 * Keyed by SECRETS_ENC_KEY, the key the Gmail tokens are already sealed with, so a deployment
 * that can store a token can also verify the link that produced it.
 */
const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url');

function key(): string | undefined {
  return process.env.OAUTH_STATE_KEY || process.env.SECRETS_ENC_KEY || undefined;
}

export function signState(value: string, ttlMs = 60 * 60 * 1000, now = Date.now()): string | undefined {
  const k = key();
  if (!k) return undefined;
  const body = b64(JSON.stringify({ v: value, exp: now + ttlMs }));
  const sig = createHmac('sha256', k).update(body).digest('base64url');
  return `${body}.${sig}`;
}

/** The signed value, or undefined when the signature is wrong, the link expired, or no key is set. */
export function verifyState(state: string, now = Date.now()): string | undefined {
  const k = key();
  if (!k || !state) return undefined;
  const [body, sig] = state.split('.');
  if (!body || !sig) return undefined;
  const expected = createHmac('sha256', k).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return undefined;
  try {
    const { v, exp } = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { v?: string; exp?: number };
    if (typeof v !== 'string' || typeof exp !== 'number' || exp < now) return undefined;
    return v;
  } catch {
    return undefined;
  }
}
