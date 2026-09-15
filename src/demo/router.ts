/**
 * Benny demo — the router.
 *
 * The whole "fluid" requirement lives here: an LLM decides what the person *means*
 * (a scene to run, an approval, or free-form chat), so natural questions like
 * "am I using my benefits correctly?" work without keywords. Scenes stay deterministic,
 * so anything consequential is never improvised.
 *
 * Falls back to a keyword router if the model is unavailable, so the demo never dies.
 */
import type { LlmClient } from '../agent/llm.js';
import { stateSummary, unused, type DemoState } from './state.js';
import type { SceneId } from './scenes.js';

export type RouteResult =
  | { kind: 'scene'; scene: SceneId; arg?: string }
  | { kind: 'approve' }
  | { kind: 'decline' }
  | { kind: 'address'; value: string }
  | { kind: 'menu' }
  | { kind: 'stop' }
  | { kind: 'say'; text: string };

export type Router = (input: { text: string; state: DemoState; pending?: string }) => Promise<RouteResult>;

const SCENE_IDS: SceneId[] = ['triage', 'audit', 'physical', 'fsa', 'books', 'eap', 'absence', 'status'];

function systemPrompt(state: DemoState, pending?: string): string {
  const plan = [
    `Employer: ${'Demo Robotics, Inc.'}; plan: Demo Choice PPO; network: Bright Network`,
    `FSA balance ${(state.fsaRemainingCents / 100).toFixed(2)} (deadline 2026-12-31)`,
    `wellness books stipend 2/month`,
    `EAP 8 free sessions`,
    `preventive annual physical $0 in-network`,
    `family: Maya, and her 5-year-old Leo`,
  ].join('; ');
  return [
    `You are Benny, a benefits copilot that texts a parent. You hold two maps: their employer benefits, and their life (family, school, providers). Warm, brief, concrete. Never robotic.`,
    ``,
    `Return ONLY a JSON object. Choose exactly one:`,
    `- {"do":"triage"}  — what came in today (school inbox)`,
    `- {"do":"audit"}   — "am I using my benefits correctly / what haven't I used / what am I missing"`,
    `- {"do":"physical"}— book the child's physical / a doctor's appointment`,
    `- {"do":"fsa"}     — the FSA / a reimbursement / use-it-or-lose-it / a receipt`,
    `- {"do":"books"}   — the monthly books stipend / wellness; if they named a book, add {"title":"<book title>"}`,
    `- {"do":"eap"}     — therapy / mental health / EAP`,
    `- {"do":"absence"} — tell the school the child will be absent`,
    `- {"do":"status"}  — what's left / any update / did it get paid / what's outstanding / a recap`,
    `- {"do":"approve"} — they are agreeing to the pending proposal (yes/sure/do it/book it/file it/send)`,
    `- {"do":"decline"} — they are saying no / not now`,
    `- {"do":"address","value":"<the address>"} — they are giving a shipping address for a pending order`,
    `- {"do":"menu"}    — they ask what you can do / for help`,
    `- {"do":"stop"}    — they want to end`,
    `- {"say":"..."}    — anything else: a question, chit-chat, or a request you can't fully do`,
    ``,
    `RULES for {"say"}:`,
    `- 1-2 short sentences, as Benny. Plain text.`,
    `- Only reference this plan: ${plan}.`,
    `- NEVER claim you booked, filed, sent, paid, or checked anything unless the state below proves it.`,
    `- If they ask for something you cannot do yet (e.g. call the dentist, a benefit we don't hold), say plainly what you cannot do and offer the closest thing you CAN.`,
    `- Never just chat past a real offer: if the message implies a need that maps to an action above, pick that action instead of "say".`,
    ``,
    `Current state: ${stateSummary(state)}`,
    `Unused right now: ${unused(state).map((u) => u.label).join(', ') || 'nothing'}`,
    `Pending proposal awaiting their yes/no: ${pending ?? 'none'}`,
  ].join('\n');
}

/** Strip the command words so we echo the ADDRESS, not "ship it to 456 Oak Ave". */
export function cleanAddress(text: string): string {
  return text
    .trim()
    .replace(/^(please\s+)?(ship|send|deliver|mail|address)\b.*?\bto\s+/i, '')
    .replace(/^(my\s+)?address\s*(is)?\s*:?\s*/i, '')
    .replace(/^to\s+/i, '')
    .trim()
    .slice(0, 200);
}

function coerce(raw: unknown): RouteResult | null {  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.do === 'string') {
    const d = o.do;
    if (d === 'approve' || d === 'decline' || d === 'menu' || d === 'stop') return { kind: d };
    if (d === 'address') {
      const value = typeof o.value === 'string' ? cleanAddress(o.value) : '';
      return value ? { kind: 'address', value } : null;
    }
    if (d === 'books') {
      const title = typeof o.title === 'string' && o.title.trim() ? o.title.trim().slice(0, 200) : undefined;
      return { kind: 'scene', scene: 'books', arg: title };
    }
    if ((SCENE_IDS as string[]).includes(d)) return { kind: 'scene', scene: d as SceneId };
  }
  if (typeof o.say === 'string' && o.say.trim()) return { kind: 'say', text: o.say.trim().slice(0, 600) };
  return null;
}

export function makeLlmRouter(llm: LlmClient): Router {
  return async ({ text, state, pending }) => {
    if (llm.enabled) {
      const raw = await llm.completeJson(systemPrompt(state, pending), `Person's message: "${text}"`).catch(() => null);
      if (raw) {
        try {
          const start = raw.indexOf('{');
          const end = raw.lastIndexOf('}');
          const parsed = coerce(JSON.parse(raw.slice(start, end + 1)));
          if (parsed) {
            // Guard: don't approve/decline when nothing is pending.
            if ((parsed.kind === 'approve' || parsed.kind === 'decline') && !pending) {
              return { kind: 'say', text: "Happy to — tell me which one: the check-up, your FSA, your books, or something at school?" };
            }
            return parsed;
          }
        } catch {
          /* fall through to keyword router */
        }
      }
    }
    return keywordRouter()({ text, state, pending });
  };
}

/** Deterministic fallback (also used by tests) — no model required. */
export function keywordRouter(): Router {
  return async ({ text, pending }) => {
    // iOS smart punctuation sends curly apostrophes ("what’s left"); normalize so the
    // patterns match what people actually type.
    const t = text.trim().toLowerCase().replace(/[\u2018\u2019\u02bc]/g, "'");
    if (/\b(stop|end demo|end the demo|exit|quit)\b/.test(t)) return { kind: 'stop' };
    if (/^(yes|yeah|yep|yup|y|ok|okay|sure|do it|go|go ahead|please|book it|file it|send it|send|confirm|yes please)\b/.test(t)) {
      return pending ? { kind: 'approve' } : { kind: 'scene', scene: 'audit' };
    }
    if (/^(no|nope|not now|not yet|later|cancel|skip|don'?t)\b/.test(t)) return { kind: 'decline' };
    // A street address ("… St/Ave/Rd/Ct…" or a ZIP with a comma) — for a pending order.
    if (/\b\d+\s+\S+.*\b(st|street|ave|avenue|rd|road|dr|drive|blvd|ln|lane|way|ct|court|pl|place|ter|terrace)\b/i.test(text.trim()) ||
        (/\b\d{5}(-\d{4})?\b/.test(text) && /,/.test(text))) {
      return pending ? { kind: 'address', value: cleanAddress(text) } : { kind: 'say', text: 'Got it — I\'ll use that address when something needs shipping.' };
    }
    if (/\b(menu|help|what can you|what do you do|options)\b/.test(t)) return { kind: 'menu' };
    // "Any update / did it get paid / what's left" must win over "claim"/"reimburse" —
    // an update question is not a request to file again.
    if (/\b(any update|update|did .*paid|paid yet|paid|reimbursed|money back|status|what'?s left|whats left|outstanding|recap|summary|all set)\b/.test(t)) return { kind: 'scene', scene: 'status' };
    if (/\b(using my benefits|benefits correctly|haven'?t used|have not used|unused|missing out|leaving .*(money|on the table)|check.?up|audit)\b/.test(t)) return { kind: 'scene', scene: 'audit' };
    if (/\b(fsa|reimburse|reimbursement|claim|receipt)\b/.test(t)) return { kind: 'scene', scene: 'fsa' };
    if (/\b(eap|therapy|therapist|mental health|counsel)\b/.test(t)) return { kind: 'scene', scene: 'eap' };
    // A book request (but not "book the physical/appointment", which is the physical).
    if (/\b(book|books|novel|read|reading|buy)\b/.test(t) && !/\b(physical|appointment|doctor|pediatric|check.?up|dentist)\b/.test(t)) {
      return { kind: 'scene', scene: 'books', arg: text };
    }
    if (/\b(absent|absence|out (on )?(tuesday|monday|wednesday|thursday|friday|tomorrow)|school note|tell the school)\b/.test(t)) return { kind: 'scene', scene: 'absence' };
    if (/\b(what came in|what did i miss|inbox|emails?|missed)\b/.test(t)) return { kind: 'scene', scene: 'triage' };
    if (/\b(physical|appointment|doctor|pediatric|checkup|check-up)\b/.test(t)) return { kind: 'scene', scene: 'physical' };
    return { kind: 'say', text: `I can help with your plan. Want the check-up on what you haven't used, your FSA, your books, or something at school?` };
  };
}

export const MENU_TEXT =
  `Here's what I can do right now:\n• check what you haven't used (FSA, books, EAP, preventive)\n• file an FSA reimbursement\n• book an in-network appointment\n• send your two books\n• tell the school about an absence\n\nJust ask in your own words — or say "what haven't I used?" to start.`;
