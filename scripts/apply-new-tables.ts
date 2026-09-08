import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

/** Read a var straight from `.env` — the sandbox mangles `process.env` values with special chars. */
function readEnv(name: string): string | undefined {
  const txt = readFileSync('.env', 'utf8');
  for (const line of txt.split('\n')) {
    const m = line.match(new RegExp(`^${name}=(.*)$`));
    if (m) return (m[1] ?? '').trim();
  }
  return undefined;
}

/** Apply ONLY the new tables added this session (idempotent) + their RLS. */
const FILES = ['evidence.sql', 'resource_graph.sql', 'skills.sql', 'gmail-token.sql', 'conversation.sql'];
const RLS = `
alter table evidence enable row level security;
drop policy if exists evidence_read on evidence;
create policy evidence_read on evidence for select using (true);
drop policy if exists evidence_write on evidence;
create policy evidence_write on evidence for insert with check (auth.role() = 'service_role');
alter table resource enable row level security;
alter table resource_edge enable row level security;
drop policy if exists resource_read on resource;
create policy resource_read on resource for select using (true);
drop policy if exists resource_write on resource;
create policy resource_write on resource for insert with check (auth.role() = 'service_role');
drop policy if exists resource_edge_read on resource_edge;
create policy resource_edge_read on resource_edge for select using (true);
drop policy if exists resource_edge_write on resource_edge;
create policy resource_edge_write on resource_edge for insert with check (auth.role() = 'service_role');
alter table skill enable row level security;
drop policy if exists skill_read on skill;
create policy skill_read on skill for select using (true);
drop policy if exists skill_write on skill;
create policy skill_write on skill for insert with check (auth.role() = 'service_role');
`;

async function main(): Promise<void> {
  const url = readEnv('DATABASE_URL');
  if (!url) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }
  // Parse manually — Supabase passwords can contain chars that break `new URL()`.
  const noScheme = url.replace(/^postgres(?:ql)?:\/\//, '');
  const at = noScheme.lastIndexOf('@');
  const userinfo = noScheme.slice(0, at);
  const hostPortDb = noScheme.slice(at + 1);
  const colon = userinfo.indexOf(':');
  const user = userinfo.slice(0, colon);
  const password = userinfo.slice(colon + 1);
  const [hostPort, db = 'postgres'] = hostPortDb.split('/');
  const [host, port = '5432'] = hostPort.split(':');

  const client = new Client({
    host,
    port: Number(port),
    user,
    password,
    database: db,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    for (const f of FILES) {
      const sql = readFileSync(new URL(`../db/${f}`, import.meta.url), 'utf8');
      await client.query(sql);
      console.log(`  ✓ ${f}`);
    }
    await client.query(RLS);
    console.log('  ✓ RLS policies');
    console.log('Done.');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error('FAILED:', (e as Error)?.message ?? e);
  process.exit(1);
});
