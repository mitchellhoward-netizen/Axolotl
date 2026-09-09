import 'dotenv/config';
import { getSupabase } from './db.js';

/**
 * Durable message dedupe. Records an inbound message id; returns true the FIRST time
 * we see it, false if it was already processed (a duplicate delivery / stray second
 * instance). Best-effort: if the DB is unavailable it does not block the message.
 */
export async function recordProcessedMessage(id: string): Promise<boolean> {
  const c = getSupabase();
  if (!c) return true;
  try {
    const { error } = await c.from('processed_message').insert({ id });
    if (!error) return true;
    // 23505 = unique_violation -> already processed.
    if (String(error.code) === '23505') return false;
    // Any other error: don't block (best-effort dedupe).
    return true;
  } catch {
    return true;
  }
}
