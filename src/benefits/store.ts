import { createHash, randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { LAB_START, type BenefitCase } from './model.js';

export class LabError extends Error {
  constructor(message: string, public readonly status = 409) { super(message); }
}

/** Deliberately isolated from DATABASE_URL, Supabase, dotenv, and live agent stores. */
export class BenefitStore {
  readonly pool: Pool;
  constructor(readonly schema = 'benefits_lab', url = process.env.BENEFITS_LAB_DATABASE_URL ??
    'postgresql://benny_lab@127.0.0.1:55432/benny_benefits_lab', readonly wallClock = Date.now) {
    if (!/^benefits_(lab|test_[a-z0-9]+)$/.test(schema)) throw new Error('Invalid lab schema');
    const parsed = new URL(url);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || parsed.search || parsed.hash ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || parsed.pathname !== '/benny_benefits_lab') {
      throw new Error('Benefits lab requires a loopback-only benny_benefits_lab database; shared databases are refused.');
    }
    this.pool = new Pool({ connectionString: url, max: 10, options: `-c search_path=${schema}`, connectionTimeoutMillis: 5000 });
  }

  async init(): Promise<void> {
    await this.pool.query(`CREATE SCHEMA IF NOT EXISTS ${this.schema}`);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id uuid PRIMARY KEY, token_hash text UNIQUE NOT NULL, wall_start bigint NOT NULL,
        advance_ms bigint NOT NULL DEFAULT 0
      );
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS discovery_enabled boolean NOT NULL DEFAULT false;
      CREATE TABLE IF NOT EXISTS cases (
        id uuid PRIMARY KEY, owner uuid NOT NULL REFERENCES workspaces(id),
        scenario_id text NOT NULL, data jsonb NOT NULL, UNIQUE(owner, scenario_id)
      );
      CREATE TABLE IF NOT EXISTS approvals (
        id uuid PRIMARY KEY, owner uuid NOT NULL REFERENCES workspaces(id),
        case_id uuid NOT NULL REFERENCES cases(id), revision integer NOT NULL,
        proposal_hash text NOT NULL, payload jsonb NOT NULL, approved_at text NOT NULL,
        UNIQUE(case_id, revision)
      );
      CREATE TABLE IF NOT EXISTS provider_orders (
        id text PRIMARY KEY, owner uuid NOT NULL REFERENCES workspaces(id), case_id uuid NOT NULL,
        expense_id text, data jsonb NOT NULL, UNIQUE(owner, expense_id)
      );
      CREATE TABLE IF NOT EXISTS provider_actions (
        action_key text PRIMARY KEY, owner uuid NOT NULL REFERENCES workspaces(id),
        reference text NOT NULL REFERENCES provider_orders(id)
      );
      CREATE INDEX IF NOT EXISTS cases_owner_idx ON cases(owner);
    `);
  }

  async createWorkspace(token: string): Promise<string> {
    const id = randomUUID();
    await this.pool.query('INSERT INTO workspaces(id,token_hash,wall_start) VALUES($1,$2,$3)',
      [id, createHash('sha256').update(token).digest('hex'), this.wallClock()]);
    return id;
  }

  async ownerFor(token: string): Promise<string | undefined> {
    const r = await this.pool.query('SELECT id FROM workspaces WHERE token_hash=$1', [createHash('sha256').update(token).digest('hex')]);
    return r.rows[0]?.id;
  }

  async now(owner: string): Promise<number> {
    const r = await this.pool.query('SELECT wall_start,advance_ms FROM workspaces WHERE id=$1', [owner]);
    const row = r.rows[0];
    if (!row) throw new LabError('Workspace not found', 404);
    return Date.parse(LAB_START) + this.wallClock() - Number(row.wall_start) + Number(row.advance_ms);
  }

  async advance(owner: string, minutes: number): Promise<void> {
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10080) throw new LabError('Invalid time advance', 400);
    await this.pool.query('UPDATE workspaces SET advance_ms=advance_ms+$2 WHERE id=$1', [owner, minutes * 60000]);
  }

  async list(owner: string): Promise<BenefitCase[]> {
    const r = await this.pool.query('SELECT data FROM cases WHERE owner=$1 ORDER BY data->>\'createdAt\', id', [owner]);
    return r.rows.map(r => r.data as BenefitCase);
  }

  async get(owner: string, id: string): Promise<BenefitCase> {
    const r = await this.pool.query('SELECT data FROM cases WHERE owner=$1 AND id=$2', [owner, id]);
    if (!r.rows[0]) throw new LabError('Case not found', 404);
    return r.rows[0].data;
  }

  async insert(owner: string, c: BenefitCase): Promise<BenefitCase> {
    const r = await this.pool.query(`INSERT INTO cases(id,owner,scenario_id,data) VALUES($1,$2,$3,$4)
      ON CONFLICT(owner,scenario_id) DO UPDATE SET scenario_id=EXCLUDED.scenario_id RETURNING data`, [c.id, owner, c.scenarioId, c]);
    return r.rows[0].data;
  }

  /** Every command checks ownership and serializes against other commands/workers. */
  async change<T>(owner: string, id: string, fn: (c: BenefitCase, tx: PoolClient) => Promise<T> | T): Promise<T> {
    const tx = await this.pool.connect();
    try {
      await tx.query('BEGIN');
      const r = await tx.query('SELECT data FROM cases WHERE owner=$1 AND id=$2 FOR UPDATE', [owner, id]);
      if (!r.rows[0]) throw new LabError('Case not found', 404);
      const c: BenefitCase = r.rows[0].data;
      const result = await fn(c, tx);
      await tx.query('UPDATE cases SET data=$3 WHERE owner=$1 AND id=$2', [owner, id, c]);
      await tx.query('COMMIT');
      return result;
    } catch (e) {
      await tx.query('ROLLBACK');
      throw e;
    } finally { tx.release(); }
  }

  async owners(): Promise<string[]> {
    return (await this.pool.query('SELECT id FROM workspaces')).rows.map(r => r.id);
  }

  async discoveryEnabled(owner: string): Promise<boolean> {
    return (await this.pool.query('SELECT discovery_enabled FROM workspaces WHERE id=$1', [owner])).rows[0]?.discovery_enabled === true;
  }

  async setDiscovery(owner: string, enabled: boolean): Promise<void> {
    await this.pool.query('UPDATE workspaces SET discovery_enabled=$2 WHERE id=$1', [owner, enabled]);
  }

  async metrics(owner: string) {
    const cases = await this.list(owner);
    const submissions = await this.pool.query('SELECT count(*) FROM provider_orders WHERE owner=$1 AND (data->>\'existing\')::boolean=false', [owner]);
    const approvals = await this.pool.query('SELECT count(*) FROM approvals WHERE owner=$1', [owner]);
    return { cases: cases.length, completed: cases.filter(c => c.status === 'completed').length,
      realizedCents: cases.reduce((sum, c) => sum + c.realizedCents, 0),
      providerSubmissions: Number(submissions.rows[0].count), approvals: Number(approvals.rows[0].count) };
  }

  async close(): Promise<void> { await this.pool.end(); }
}
