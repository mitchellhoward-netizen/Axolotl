import { getSupabase } from '../src/integrations/db.js';

/**
 * Reset the agent's persistent conversation memory so the next message starts fresh.
 *
 * - Clears the Supabase-persisted family identity (family_profile, case_record, guardian) so a
 *   family is NOT rehydrated as "returning" on the next bot start. In-memory conversation state
 *   (history/phase/pendingSteps) is per-process and clears automatically on restart.
 * - Usage: `npm run reset:conversations` (clear ALL, dev full reset) or
 *   `npm run reset:conversations -- <guardianId>` (one family, e.g. parent-15555550100).
 *
 * After running, RESTART the bot (`npm run start`) so the in-memory store also clears.
 */
async function main(): Promise<void> {
  const c = getSupabase();
  if (!c) {
    console.log(
      'Supabase is NOT configured (no SUPABASE_URL/key). Conversation state is in-memory only — ' +
        'just restart the bot (`npm run start`) to start fresh.',
    );
    return;
  }

  const guardianId = process.argv[2];
  const mode = guardianId ? `guardian_id = ${guardianId}` : 'ALL families (full dev reset)';
  console.log(`Clearing persisted conversation identity for: ${mode}`);
  try {
    if (guardianId) {
      await c.from('family_profile').delete().eq('guardian_id', guardianId);
      await c.from('case_record').delete().eq('guardian_id', guardianId);
      await c.from('guardian').delete().eq('id', guardianId);
    } else {
      await c.from('family_profile').delete().neq('guardian_id', '');
      await c.from('case_record').delete().neq('guardian_id', '');
      await c.from('guardian').delete().neq('id', '');
    }
    console.log('Cleared. RESTART the bot (`npm run start`) so the in-memory store also clears — ' +
      'the next message will onboard the family fresh.');
  } catch (e) {
    console.error('Could not clear Supabase rows:', (e as Error)?.message ?? e);
    process.exit(1);
  }
}

void main();
