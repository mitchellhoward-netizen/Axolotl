/**
 * Sealed secrets at rest — AES-256-GCM with the ciphertext bound to its owner.
 *
 * The Gmail refresh token is a long-lived key to a parent's entire mailbox, so it must
 * never sit in Postgres as plain text. RLS is not encryption: the service role bypasses
 * RLS, and every backup, replica and support session would carry the plaintext.
 *
 * Design notes that matter:
 * - **Purpose binding (AAD).** The ciphertext is bound to a purpose string that includes
 *   the owner id (`gmail-token:<guardianId>`). A row copied to another guardian's record
 *   fails to open instead of handing over someone else's mailbox.
 * - **Version prefix.** Sealed values carry `v1:`, so legacy plaintext rows are
 *   recognisable and can be migrated lazily on read — no destructive migration, no
 *   downtime, no flag day.
 * - **Fail loud, never fall back to plaintext.** If the key is missing we refuse to
 *   store a secret rather than silently writing it in the clear. A broken OAuth
 *   connect is recoverable; an unencrypted refresh token in a database is not.
 * - **No key material in logs.** Errors name the env var, never the value.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const PREFIX = 'v1:';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class SecretBox {
  private constructor(private readonly key: Buffer, /** env var the key came from */ readonly source: string) {}

  /**
   * Load a 32-byte base64 key from the environment. Returns null when unset, so callers
   * can decide what to do (we refuse to store secrets, and read legacy rows as plaintext).
   */
  static fromEnv(name = 'SECRETS_ENC_KEY'): SecretBox | null {
    const raw = process.env[name];
    if (!raw) return null;
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32 || key.toString('base64').replace(/=+$/, '') !== raw.replace(/=+$/, '')) {
      throw new Error(`${name} must be a base64-encoded 32-byte key`);
    }
    return new SecretBox(key, name);
  }

  get enabled(): boolean {
    return true;
  }

  /** Seal a value for a purpose. Throws only on catastrophic misuse (empty purpose). */
  seal(value: string, purpose: string): string {
    if (!purpose) throw new Error('seal() requires a purpose');
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(purpose));
    const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
  }

  /** True when this string looks like a value we sealed (vs. legacy plaintext). */
  static isSealed(value: string | null | undefined): boolean {
    return typeof value === 'string' && value.startsWith(PREFIX);
  }

  /**
   * Open a sealed value. Returns undefined when the value is not sealed, was sealed for a
   * different purpose/owner, or has been tampered with — callers must treat undefined as
   * "no usable secret", never as "empty secret".
   */
  open(sealed: string, purpose: string): string | undefined {
    if (!SecretBox.isSealed(sealed)) return undefined;
    try {
      const bytes = Buffer.from(sealed.slice(PREFIX.length), 'base64');
      if (bytes.length <= IV_BYTES + TAG_BYTES) return undefined;
      const decipher = createDecipheriv('aes-256-gcm', this.key, bytes.subarray(0, IV_BYTES));
      decipher.setAAD(Buffer.from(purpose));
      decipher.setAuthTag(bytes.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
      return Buffer.concat([decipher.update(bytes.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8');
    } catch {
      // Wrong key, wrong purpose, or tampered ciphertext. Never throw a value back.
      return undefined;
    }
  }
}

/** The process-wide box (lazily loaded so tests can set the env first). */
let cached: SecretBox | null | undefined;
export function secretBox(): SecretBox | null {
  if (cached === undefined) {
    try {
      cached = SecretBox.fromEnv();
    } catch (e) {
      console.error('[secrets]', (e as Error).message);
      cached = null;
    }
  }
  return cached;
}

/** Reset the memoised box (tests only). */
export function resetSecretBoxForTest(): void {
  cached = undefined;
}
