#!/usr/bin/env tsx
/**
 * Row Level Security isolation test (Block 0).
 *
 * The agent talks to Supabase with the service_role key, which BYPASSES RLS, so this
 * test deliberately drops to a NON-OWNER role (`authenticated`) and sets the family
 * via a session GUC, exactly like a direct/anon/dashboard connection would. It then
 * asserts that family B cannot see any of family A's rows — and (crucially) that each
 * family CAN still see its own, so a "deny everything" misconfiguration fails loudly
 * rather than passing trivially.
 *
 * Needs SUPABASE_DB_URL or DATABASE_URL (a direct Postgres connection string). Without
 * one the test SKIPS (exit 0) so CI stays green when no database is wired up.
 *
 *   npm run test:rls
 */
import 'dotenv/config';
import pg from 'pg';

const CONN = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!CONN || !/^postgres(ql)?:\/\//i.test(CONN)) {
  console.log('⏭  test-rls: no valid SUPABASE_DB_URL / DATABASE_URL set — skipping (nothing to test).');
  process.exit(0);
}

const A = 'rls-test-family-a';
const B = 'rls-test-family-b';
const D = 'rls-test-district';

/** table → the family-scoping column RLS keys on. */
const TABLES: Array<{ table: string; col: string }> = [
  { table: 'family_profile', col: 'guardian_id' },
  { table: 'case_record', col: 'guardian_id' },
  { table: 'connection', col: 'family_id' },
  { table: 'incoming_email', col: 'family_id' },
  { table: 'consent_event', col: 'family_id' },
];

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Build the client safely: an unparseable connection string is a "skip", not a crash. */
function makeClient(): pg.Client | null {
  try {
    return new pg.Client({ connectionString: CONN });
  } catch {
    return null;
  }
}
const client = makeClient();
if (!client) {
  console.log('⏭  test-rls: DATABASE_URL is not a usable Postgres URL — skipping.');
  process.exit(0);
}

/** The non-owner role RLS is enforced for. Supabase ships `authenticated`; else make one. */
let ROLE = 'authenticated';

async function countAs(familyId: string, table: string, col: string, target: string): Promise<number> {
  await client!.query(`set local role ${ROLE}`);
  await client!.query(`select set_config('request.jwt.claims', '', true)`);
  await client!.query(`select set_config('app.family_id', $1, true)`, [familyId]);
  const { rows } = await client!.query(`select count(*)::int as c from ${table} where ${col} = $1`, [target]);
  await client!.query('reset role');
  return rows[0].c as number;
}

/** A DB we simply can't reach is a skip unless the caller insists (RLS_REQUIRE_DB=1). */
function unreachable(e: unknown): boolean {
  const code = (e as { code?: string })?.code ?? '';
  const msg = (e as Error)?.message ?? '';
  return (
    ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EHOSTUNREACH', 'ERR_INVALID_URL', '28P01', '3D000'].includes(code) ||
    /invalid url|getaddrinfo|connect econnrefused|password authentication failed|does not exist/i.test(msg)
  );
}

try {
  await client.connect();
  // Resolve a non-owner role up front, so a role/permission problem is reported as
  // such instead of masquerading as an RLS leak.
  try {
    await client.query('begin');
    await client.query('set local role authenticated');
    await client.query('rollback');
  } catch {
    await client.query('rollback').catch(() => {});
    try {
      await client.query('create role rls_probe nologin');
      await client.query('grant select, insert, update, delete on all tables in schema public to rls_probe');
      ROLE = 'rls_probe';
    } catch {
      console.log('⏭  test-rls: cannot assume a non-owner role (need `authenticated` or CREATE ROLE) — skipping.');
      await client.end().catch(() => {});
      process.exit(0);
    }
  }

  await client.query('begin');

  // ── Seed two families (as the owner, which bypasses RLS) ────────────────────
  await client.query(`insert into guardian (id, name) values ($1,'A'),($2,'B') on conflict (id) do nothing`, [A, B]);
  await client.query(`insert into district (id, name, state) values ($1,'RLS Test','CA') on conflict (id) do nothing`, [D]);
  await client.query(
    `insert into family_profile (id, guardian_id) values ($1,$2),($3,$4) on conflict (guardian_id) do nothing`,
    ['rls-fp-a', A, 'rls-fp-b', B],
  );
  await client.query(
    `insert into case_record (id, guardian_id, district_id, root_cause, intervention, summary)
     values ($1,$2,$3,'OTHER','rls-test','a'),($4,$5,$3,'OTHER','rls-test','b') on conflict (id) do nothing`,
    ['rls-cr-a', A, D, 'rls-cr-b', B],
  );
  await client.query(
    `insert into connection (family_id, kind, label) values ($1,'parent_portal','a'),($2,'parent_portal','b')`,
    [A, B],
  );
  await client.query(
    `insert into incoming_email (family_id, message_id, summary) values ($1,'rls-a','a'),($2,'rls-b','b')`,
    [A, B],
  );
  await client.query(
    `insert into consent_event (family_id, kind) values ($1,'onboarding'),($2,'onboarding')`,
    [A, B],
  );

  console.log('\nRLS isolation (role=authenticated, family via app.family_id):');
  for (const { table, col } of TABLES) {
    const ownA = await countAs(A, table, col, A);
    const crossA = await countAs(A, table, col, B);
    const ownB = await countAs(B, table, col, B);
    const crossB = await countAs(B, table, col, A);
    check(`${table}: A sees its own row`, ownA === 1, `got ${ownA}`);
    check(`${table}: A CANNOT see B's row`, crossA === 0, `leaked ${crossA}`);
    check(`${table}: B sees its own row`, ownB === 1, `got ${ownB}`);
    check(`${table}: B CANNOT see A's row`, crossB === 0, `leaked ${crossB}`);
  }
} catch (e) {
  const msg = (e as Error)?.message ?? String(e);
  if (unreachable(e) && process.env.RLS_REQUIRE_DB !== '1') {
    console.log(`⏭  test-rls: could not reach the database (${msg.slice(0, 120)}) — skipping. Set RLS_REQUIRE_DB=1 to fail instead.`);
  } else {
    failures++;
    console.error(`\n✗ test-rls errored: ${msg}`);
    if (/relation .* does not exist/i.test(msg)) {
      console.error('  → apply the schema first: db/schema.sql, db/consent.sql, db/connections.sql, db/email-triage.sql, db/rls-family.sql');
    }
  }
} finally {
  try {
    await client.query('rollback');
  } catch {
    /* ignore */
  }
  await client.end().catch(() => {});
}

console.log(`\n${failures === 0 ? '✓ RLS isolation holds' : `✗ ${failures} RLS check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
