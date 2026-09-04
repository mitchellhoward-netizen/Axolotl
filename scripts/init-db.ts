import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

/**
 * Apply db/schema.sql to Postgres (Supabase). Requires DATABASE_URL in .env.
 * Run: npm run db:init
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const sql = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(sql);
    console.log('✅ Schema applied to Postgres.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('✖ Failed to apply schema:', err);
  process.exit(1);
});
