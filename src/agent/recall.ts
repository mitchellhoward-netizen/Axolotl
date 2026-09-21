import type { ChatMessage, MessageSearch } from '../integrations/conversation-store.js';
import { expandQuery, matchesTerms, type AliasPair } from './aliases.js';

/**
 * Recall — finding something a family already told us.
 *
 * Three things were wrong with the old `recall_history`, and they are the reason this is a
 * module with its own tests rather than four lines inside the tool binding:
 *
 *  1. It searched only what was in RAM. Once the history stopped being loaded in full, that
 *     silently became "the last N messages" — a search that quietly covers less than the
 *     parent believes it does. Now the bounded window is searched AND the persisted history
 *     is searched in Postgres, and the answer says which of those actually happened.
 *  2. It matched substrings only, so the family's own vocabulary broke it: they say "the
 *     noodles place" once and "pasta" later and get nothing. Aliases fix that, and because a
 *     wrong alias would surface the wrong memory about a child, the expansion is disclosed —
 *     the parent can see the extra terms and correct us.
 *  3. It reported the same way whether it found nothing in one message or nothing in the
 *     whole thread. `recall` never says "nothing" when it means "not there" unless it
 *     actually looked everywhere it could reach.
 *
 * Pure except for one injected search function: no database, no model, no clock. Recall only
 * ever READS — it can never stage or trigger an action.
 */

export interface RecallDeps {
  /** The bounded in-memory window (newest last). */
  window: ChatMessage[];
  /** Messages that fell off the front of the window: persisted, but not in RAM. */
  trimmed: number;
  /** Aliases harvested from the family's own words. */
  aliases: AliasPair[];
  /** Search the persisted history. Absent when there is no database. */
  searchPersisted?: (needle: string) => Promise<MessageSearch>;
  /** How many hits to return. */
  limit?: number;
}

/** Per-message character budget. A recall answer is a pointer, not a transcript dump. */
const PER_HIT_CHARS = 260;

function key(m: ChatMessage): string {
  return `${m.role}\u0000${m.content}`;
}

function line(m: ChatMessage): string {
  const who = m.role === 'user' ? 'Parent' : 'Axolotl';
  const body = m.content.length > PER_HIT_CHARS ? `${m.content.slice(0, PER_HIT_CHARS)}…` : m.content;
  return `${who}: ${body}`;
}

/**
 * Merge search results without duplicates and without dropping the newest ones.
 *
 * The window and the persisted history overlap almost completely (the window IS the newest
 * slice of the persisted history), so a naive concatenation would double every recent hit.
 * Both inputs are oldest-first, so the merged result is too.
 */
function mergeHits(lists: ChatMessage[][], limit: number): ChatMessage[] {
  const seen = new Set<string>();
  const all: ChatMessage[] = [];
  for (const list of lists) {
    for (const m of list) {
      const k = key(m);
      if (seen.has(k)) continue;
      seen.add(k);
      all.push(m);
    }
  }
  return all.slice(-limit);
}

export async function recallHistory(query: string, deps: RecallDeps): Promise<string> {
  const raw = String(query ?? '').trim();
  if (!raw) return 'Give me a word or two to search the conversation for.';

  const limit = Math.max(1, deps.limit ?? 6);
  const terms = expandQuery(raw, deps.aliases);
  const expanded = terms.slice(1);
  const windowSize = deps.window.length;

  const windowHits = deps.window.filter((m) => matchesTerms(m.content, terms));

  // Search every expanded term separately rather than one big OR: it keeps the cap meaning
  // "newest N matches" per term, and it means one unusual term cannot crowd out the others.
  let persisted: MessageSearch | null = null;
  let searchFailed = false;
  if (deps.searchPersisted) {
    try {
      const results: MessageSearch[] = [];
      for (const t of terms) results.push(await deps.searchPersisted(t));
      persisted = {
        hits: results.flatMap((r) => r.hits),
        // Deliberately not summed: messages matching two terms would be counted twice, and a
        // fabricated total is worse than no total. `truncated` is all the caller needs.
        totalMatches: null,
        truncated: results.some((r) => r.truncated),
      };
    } catch {
      searchFailed = true;
    }
  }

  const hits = mergeHits(persisted ? [windowHits, persisted.hits] : [windowHits], limit);

  const notes: string[] = [];
  if (expanded.length) notes.push(`Also searched: ${expanded.map((t) => `"${t}"`).join(', ')}.`);
  if (persisted?.truncated) notes.push(`There are more matches than the ${hits.length} shown here.`);
  if (!persisted) {
    // No database search happened. Say exactly how much was looked at, and why the rest was
    // not — "I found nothing" must never stand in for "I did not look".
    if (searchFailed) {
      notes.push(`I couldn't reach the older history just now, so I only searched the last ${windowSize} messages.`);
    } else if (deps.trimmed > 0) {
      notes.push(`I only searched the last ${windowSize} messages; ${deps.trimmed} older ones are not loaded here.`);
    }
  }

  if (!hits.length) {
    const where = persisted ? 'the whole conversation' : `the last ${windowSize} messages`;
    return [`Nothing in ${where} matches "${raw}".`, ...notes].join('\n');
  }

  const header = hits.length === 1 ? 'One match' : `${hits.length} matches`;
  return [header, ...hits.map(line), ...notes].join('\n');
}
