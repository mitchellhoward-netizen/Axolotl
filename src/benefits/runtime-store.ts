import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import type { Account } from './runtime.js';

/** Encrypt health context, routing handles, consent, documents, tokens and outbox
 * at rest; bind ciphertext to its owner and purpose to prevent row swapping. */
export class BennyVault {
  private readonly key: Buffer;
  constructor(encodedKey: string) {
    this.key = Buffer.from(encodedKey, 'base64');
    if (this.key.length !== 32 || this.key.toString('base64') !== encodedKey) {
      throw new Error('BENNY_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
    }
  }
  hash(value: string): string { return createHmac('sha256', this.key).update(value).digest('hex'); }
  seal(value: unknown, purpose: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(purpose));
    const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
  }
  open<T>(sealed: string, purpose: string): T {
    const bytes = Buffer.from(sealed, 'base64');
    const cipher = createDecipheriv('aes-256-gcm', this.key, bytes.subarray(0, 12));
    cipher.setAAD(Buffer.from(purpose));
    cipher.setAuthTag(bytes.subarray(12, 28));
    return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8')) as T;
  }
}

export class BennyStore {
  readonly pool: Pool;
  constructor(url: string, readonly vault: BennyVault, readonly schema = 'benny') {
    if (!/^benny(?:_test_[a-f0-9]+)?$/.test(schema)) throw new Error('Invalid Benny schema');
    this.pool = new Pool({ connectionString: url, max: 10, connectionTimeoutMillis: 5000,
      options: `-c search_path=${schema} -c statement_timeout=15000` });
  }
  /** Schema must already exist. Never migrate a shared database at startup. */
  async check(): Promise<void> {
    await this.pool.query('SELECT owner,sealed FROM accounts LIMIT 0');
    await this.pool.query('SELECT owner,message_hash FROM inbox LIMIT 0');
    await this.pool.query('SELECT token_hash,sealed FROM links LIMIT 0');
    await this.pool.query('SELECT id,sealed FROM documents LIMIT 0');
  }
  async owners(): Promise<string[]> {
    return (await this.pool.query('SELECT owner FROM accounts')).rows.map(r => r.owner);
  }
  async read(owner: string): Promise<Account | undefined> {
    const r = await this.pool.query('SELECT sealed FROM accounts WHERE owner=$1', [owner]);
    return r.rows[0] && this.vault.open<Account>(r.rows[0].sealed, `account:${owner}`);
  }
  async seen(owner: string, messageId: string): Promise<boolean> {
    const r = await this.pool.query('SELECT 1 FROM inbox WHERE owner=$1 AND message_hash=$2',
      [owner, this.vault.hash(`message:${messageId}`)]);
    return r.rows.length > 0;
  }
  async change<T>(owner: string, initial: Account | undefined,
    fn: (account: Account, tx: PoolClient) => Promise<T> | T): Promise<T> {
    const tx = await this.pool.connect();
    try {
      await tx.query('BEGIN');
      if (initial) await tx.query('INSERT INTO accounts(owner,sealed) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [owner, this.vault.seal(initial, `account:${owner}`)]);
      const r = await tx.query('SELECT sealed FROM accounts WHERE owner=$1 FOR UPDATE', [owner]);
      if (!r.rows[0]) throw new Error('Account unavailable');
      const account = this.vault.open<Account>(r.rows[0].sealed, `account:${owner}`);
      const result = await fn(account, tx);
      await tx.query('UPDATE accounts SET sealed=$2 WHERE owner=$1', [owner, this.vault.seal(account, `account:${owner}`)]);
      await tx.query('COMMIT');
      return result;
    } catch (e) { await tx.query('ROLLBACK'); throw e; } finally { tx.release(); }
  }
  async consumeLink<T>(token: string, now: number): Promise<{ owner: string; data: T } | undefined> {
    // DELETE RETURNING is atomic: duplicate callbacks cannot exchange twice.
    const hash = this.vault.hash(`link:${token}`);
    const r = await this.pool.query('DELETE FROM links WHERE token_hash=$1 RETURNING owner,sealed,expires_at', [hash]);
    const row = r.rows[0];
    if (!row || now >= Number(row.expires_at)) return;
    return { owner: row.owner, data: this.vault.open<T>(row.sealed, `link:${hash}`) };
  }
  async readLink<T>(token: string, now: number): Promise<{ owner: string; data: T } | undefined> {
    const hash = this.vault.hash(`link:${token}`);
    const row = (await this.pool.query('SELECT owner,sealed FROM links WHERE token_hash=$1 AND expires_at>$2', [hash, now])).rows[0];
    if (row) return { owner: row.owner, data: this.vault.open<T>(row.sealed, `link:${hash}`) };
  }
  async documents(owner: string, ids: string[]): Promise<Array<{ id: string; mimeType: string; bytes: Buffer }>> {
    const r = await this.pool.query('SELECT id,sealed FROM documents WHERE owner=$1 AND id=ANY($2::uuid[])', [owner, ids]);
    if (r.rows.length !== ids.length) throw new Error('Document unavailable');
    return r.rows.map(row => {
      const d = this.vault.open<{ mimeType: string; base64: string }>(row.sealed, `document:${owner}:${row.id}`);
      return { id: row.id, mimeType: d.mimeType, bytes: Buffer.from(d.base64, 'base64') };
    });
  }
  async close(): Promise<void> { await this.pool.end(); }
}
