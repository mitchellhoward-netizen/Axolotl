/**
 * Emoji reactions, done sparingly.
 *
 * A previous version reacted to EVERY inbound message with a random pick from a 15-emoji
 * list — which is why it was removed. Random is the whole problem: a tapback is a small
 * signal of attention, and if it fires on everything it says nothing and reads as noise.
 *
 * The rules here are deliberately narrow:
 *   - react only when the emoji adds something the reply text does not (gratitude, good
 *     news, "I've registered what you asked for");
 *   - never react to a bare approval or decline (the read receipt already covers it);
 *   - NEVER react to a hard message. School mail touches IEPs, illness, housing and money;
 *     a cheerful apple on a message about a child's evaluation is worse than no reaction
 *     at all. The sensitivity guard wins over every other rule;
 *   - at most one reaction per cooldown window, never the same one twice in a row.
 *
 * Pure and testable: the picker and the limiter take their inputs, so no clock or network.
 */

/** The whole vocabulary. Small on purpose — a large set is what makes it feel random. */
export type ReactionEmoji = '❤️' | '🎉' | '🎒' | '🚌' | '🍎' | '🧾' | '📚' | '✅';

/**
 * If any of these appear, we send no reaction. This list is intentionally broad: a missing
 * emoji is invisible, an inappropriate one is not.
 */
const SENSITIVE = /\b(iep|504|special ?(?:ed|education)|disab|autis|adhd|dyslex|speech therapy|therap|diagnos|medicat|asthma|allerg|seizure|hospital|sick|ill|fever|cancer|died|death|passed away|grief|homeless|shelter|motel|transitional|food insecure|hungry|free lunch|low income|custody|court|restraining|abuse|neglect|bull(?:y|ied|ies|ying)|depress|anxi|suicid|evacuat|lockdown|shooting|threat)/i;

/**
 * A refusal, however it is dressed up. Checked before anything else, because "no thanks"
 * contains "thanks" and would otherwise be read as gratitude — the wrong emoji on a decline
 * is worse than none.
 */
const DECLINE = /^(?:no|nope|nah|not now|not yet|later|cancel|skip|don'?t|do not|stop|hold off|never ?mind)\b/i;

/** A bare approval/decline — the receipt is the acknowledgement, an emoji would be clutter. */
const BARE_APPROVAL = /^(?:y|yes|yeah|yep|yup|sure|ok(?:ay)?|k|confirm|go ahead|go|do it|submit(?: it)?|send it|sounds good|perfect|thanks|thank you|ty|thx|no|nope|not now|later|cancel|stop)\b[\s!.,]*$/i;

interface Rule { re: RegExp; emoji: ReactionEmoji }

/**
 * Order matters. Gratitude and good news are about the PARENT's state and beat everything;
 * topic emojis come last.
 */
const RULES: Rule[] = [
  // Gratitude or relief from the parent.
  { re: /\b(thank(?:s| you)?|thx|ty|appreciate it|you'?re the best|life ?saver)\b/i, emoji: '❤️' },
  // Something worked out.
  { re: /\b(we got (?:it|in)|it worked|they (?:approved|accepted)|got the spot|confirmed|all set|signed up|enrolled|we'?re in|resolved|taken care of)\b/i, emoji: '🎉' },
  // The parent reports they did their bit.
  { re: /\b(i (?:signed|sent|paid|submitted|filled|returned|dropped (?:it )?off))\b/i, emoji: '✅' },
  // Specific topics BEFORE the generic school rule, or "is there a bus" answers 🎒.
  { re: /\b(bus|transport|ride|pickup|pick-up|drop-?off|route)\b/i, emoji: '🚌' },
  { re: /\b(lunch|meal|breakfast|snack|cafeteria|food)\b/i, emoji: '🍎' },
  { re: /\b(form|paperwork|permission slip|application|deadline|due date)\b/i, emoji: '🧾' },
  { re: /\b(book|library|reading log)\b/i, emoji: '📚' },
  // Asking US to DO something with the school. Requires an action verb, not just the word
  // "school": a plain "what time does school start?" is a question we answer, not a tapback.
  { re: /\b(?:email|e-mail|call|contact|message|ask|tell|write|chase|remind|talk to)\b[^.]{0,40}\b(?:school|teacher|office|principal|pta|district)\b|\b(?:school|teacher|office|principal|pta|district)\b[^.]{0,40}\b(?:email|call|contact|form|enroll|register|sign)\b/i, emoji: '🎒' },
];

export interface ReactionInput {
  /** What the parent actually sent. */
  text: string;
  /** True when this turn staged a consequential proposal — the gate should stand alone. */
  stagedConsent?: boolean;
}

/** The emoji for this message, or null for "say nothing". */
export function pickReaction(input: ReactionInput): ReactionEmoji | null {
  const text = (input.text ?? '').trim();
  if (!text) return null;
  // A gate is the wrong place for decoration: it asks for one clear yes/no.
  if (input.stagedConsent) return null;
  if (DECLINE.test(text)) return null;
  if (BARE_APPROVAL.test(text)) return null;
  if (SENSITIVE.test(text)) return null;
  for (const r of RULES) if (r.re.test(text)) return r.emoji;
  // No rule matched: NO reaction. The old code picked at random here, which is exactly why
  // it felt like noise. Silence is the correct default.
  return null;
}

// ── Limiter: sparing means at most one per window, never twice the same ──────
const COOLDOWN_MS = Number(process.env.REACTION_COOLDOWN_MINUTES ?? 20) * 60_000;
const last = new Map<string, { at: number; emoji: ReactionEmoji }>();

/** Should we react now? Enforces the cooldown and the "never the same twice in a row" rule. */
export function allowReaction(conversationId: string, emoji: ReactionEmoji, now = Date.now()): boolean {
  const prev = last.get(conversationId);
  if (prev) {
    if (now - prev.at < COOLDOWN_MS) return false;
    if (prev.emoji === emoji) return false;
  }
  last.set(conversationId, { at: now, emoji });
  return true;
}

/** Test seam. */
export function resetReactionsForTest(): void {
  last.clear();
}

/** One call that decides and records, so callers cannot forget the limiter. */
export function reactionFor(conversationId: string, input: ReactionInput, now = Date.now()): ReactionEmoji | null {
  const emoji = pickReaction(input);
  if (!emoji) return null;
  return allowReaction(conversationId, emoji, now) ? emoji : null;
}
