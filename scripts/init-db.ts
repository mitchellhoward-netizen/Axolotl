import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

/**
 * Apply the full schema to Postgres (Supabase). Requires DATABASE_URL in .env.
 * Run: npm run db:init
 *
 * Applies the SQL files in dependency order. Note: `schema.sql` uses `create
 * type ... enum` (not idempotent), so this is a run-once bootstrap — same as before.
 */
const FILES = [
  'schema.sql',          // core tables + enums + vector extension
  'knowledge_node.sql',  // knowledge graph (RAG corpus)
  'family_memory.sql',   // family memory graph
  'followups.sql',       // proactive follow-up queue
  'verification.sql',    // OTP identity
  'waitlist.sql',        // waitlist
  'pending_greeting.sql',// held SMS → iMessage fallback
  'embedding.sql',       // match_knowledge RPC (pgvector)
  'evidence.sql',        // evidence store (Phase 3)
  'resource_graph.sql',  // typed resource graph (Phase 4)
  'skills.sql',          // procedural memory (Phase 5)
  'rls.sql',             // row-level security (last, references all tables)
];

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    for (const file of FILES) {
      const sql = readFileSync(new URL(`../db/${file}`, import.meta.url), 'utf8');
      await client.query(sql);
      console.log(`  ✓ ${file}`);
    }
    console.log(`✅ Applied ${FILES.length} SQL files to Postgres.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('✖ Failed to apply schema:', err);
  process.exit(1);
});
