/**
 * Read-only probe: does the live database have `memory_alias`?
 *
 * Two agents disagreed about this. A `head: true` count request hides the PostgREST
 * schema-cache error and reports rows=0 for a table that does not exist, so this uses a
 * non-head select and prints the raw error code. Writes nothing. Not part of the app.
 */
import { getSupabase } from '../src/integrations/db.js';

const c = getSupabase();
if (!c) {
  console.log('NO_CLIENT: supabase env not configured in this shell');
  process.exit(0);
}

const { data, error } = await c.from('memory_alias').select('family_id').limit(1);
console.log('non-head select -> error.code =', error?.code ?? 'none');
console.log('                   message    =', error?.message ?? 'none');
console.log('                   rows       =', Array.isArray(data) ? data.length : String(data));

const head = await c.from('memory_alias').select('*', { count: 'exact', head: true });
console.log('head count       -> error.code =', head.error?.code ?? 'none', ' count =', head.count);
