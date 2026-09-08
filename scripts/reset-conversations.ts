import { clearFamilyIdentity } from '../src/integrations/identity.js';
import { getSupabase } from '../src/integrations/db.js';

/**
 * Reset the agent's persistent conversation memory so the next message starts fresh.
 *
 * - Clears the Supabase-persisted family identity (guardian, profile, cases,
 *   students, child_links, family_memory) so a family is NOT rehydrated as
 *   "returning". In-memory conversation state (history/phase/pendingSteps) is
 *   per-process and clears automatically on restart — OR text `/reset` to the bot
 *   to clear the in-memory + persisted identity on the live instance, no restart.
 * - Usage: `npm run reset:conversations` (clear ALL) or
 *   `npm run reset:conversations -- <guardianId>` (one family).
 */
async function main(): Promise<void> {
  const c = getSupabase();
  if (!c) {
    console.log(
      'Supabase is NOT configured. Conversation state is in-memory only — ' +
        'restart the bot (`npm run start`) to start fresh.',
    );
    return;
  }

  const guardianId = process.argv[2];
  const mode = guardianId ? `guardian_id = ${guardianId}` : 'ALL families (full dev reset)';
  console.log(`Clearing persisted conversation identity for: ${mode}`);
  try {
    if (guardianId) {
      await clearFamilyIdentity(guardianId);
    } else {
      await c.from('family_profile').delete().neq('guardian_id', '');
      await c.from('case_record').delete().neq('guardian_id', '');
      await c.from('family_memory').delete().neq('guardian_id', '');
      const links = (await c.from('child_link').select('student_id')).data ?? [];
      const ids = links.map((r) => r.student_id as string);
      await c.from('child_link').delete().neq('guardian_id', '');
      if (ids.length) await c.from('student').delete().in('id', ids);
      await c.from('guardian').delete().neq('id', '');
    }
    console.log('Cleared. On the live bot, text `/reset` to also clear in-memory (no restart needed); ' +
      'locally, restart (`npm run start`) — the next message will onboard the family fresh.');
  } catch (e) {
    console.error('Could not clear Supabase rows:', (e as Error)?.message ?? e);
    process.exit(1);
  }
}

void main();
