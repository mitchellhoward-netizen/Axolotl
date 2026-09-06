import { getVoiceLlm } from './llm.js';
import { buildPreCallBrief } from '../knowledge/precall.js';

/**
 * The parent-facing voice brain. This is deliberately NOT the text brain with a
 * voice bolted on: it uses the FAST model, calls NO tools in the hot path, and
 * answers from the context we already fetched. Anything it doesn't know it
 * DEFERS — the parent hears "let me text you the full answer" instead of sitting
 * through a live 20-60s research loop on the phone.
 */

export interface VoiceTurn {
  transcript: Array<{ role: string; content: string }>;
  variables?: Record<string, unknown>;
  /** True for a `reminder_required` event (caller went quiet). */
  reminder?: boolean;
  /** Narrate what the agent is doing (reserved for opt-in live research). */
  onProgress?: (message: string) => void;
  /** Stream the answer's tokens as they're generated (reserved). */
  onToken?: (token: string) => void;
}

/** The spoken reply, plus whether the question should be researched async + texted. */
export interface VoiceReply {
  text: string;
  /** True when the parent's question needs deep research (hand off to text). */
  deferred?: boolean;
}

/** A spoken, natural-language system prompt. No markdown, no bullets, short. */
function voiceSystemPrompt(vars: Record<string, unknown>, context: string): string {
  const parent = String(vars.parent_name ?? 'the parent');
  const student = String(vars.student ?? 'their child');
  const grade = vars.grade ? ` (grade ${String(vars.grade)})` : '';
  const school = vars.school ? String(vars.school) : 'their school';
  const district = vars.district ? String(vars.district) : '';
  const issue = vars.issue ? String(vars.issue) : '';

  return [
    'You are Axolotl, a warm, plain-spoken assistant helping a parent with their child\u2019s school. ' +
      'You are speaking to them ON A LIVE PHONE CALL.',
    'Rules:',
    '- Speak naturally in short sentences, 1-3 sentences per turn. Never use markdown, bullet points, headings, or emoji.',
    '- Never announce you are an AI or a demo.',
    '- NEVER quote statute numbers or section codes — say what they have a right to in plain words.',
    '- Never claim you already submitted a form, scheduled a meeting, or talked to the school — offer to help and explain next steps instead.',
    '- Be warm and proactive: turn answers into a next step and offer to do it.',
    '- Match the caller\u2019s language exactly: an English caller gets English, a Spanish caller gets Spanish. NEVER mix languages or switch mid-sentence. If unsure, default to English.',
    '',
    `FAMILY CONTEXT (use it, don't re-ask): parent ${parent}, child ${student}${grade}, school ${school}${district ? ` (${district})` : ''}. They mentioned: ${issue || 'nothing specific yet'}.`,
    '',
    'WHAT WE KNOW about this school and family (answer from this — do NOT look anything up on the call):',
    context || '(nothing pre-researched for this school yet)',
    '',
    'IMPORTANT — answer ONLY from WHAT WE KNOW plus plain, uncontroversial school basics. If the caller asks for any specific policy, process, form, deadline, appeal step, or phone number that is NOT already in WHAT WE KNOW, reply with EXACTLY the single word DEFER and nothing else. Do NOT answer those from general knowledge — such specifics vary by district and state, and guessing could mislead this family. When you reply DEFER, we research the exact answer and text it to the parent.',
  ].join('\n');
}

/**
 * Build the context the fast model answers from. `what_we_know` usually already
 * carries the pre-call research (the agent enriches it before dialing); if not
 * (e.g. a direct Retell call), fetch it now — it's deterministic and cached.
 */
async function buildContext(vars: Record<string, unknown>): Promise<string> {
  const whatWeKnow = String(vars.what_we_know ?? '').trim();
  if (/researched about this school/i.test(whatWeKnow)) return whatWeKnow;

  const parts: string[] = [];
  if (whatWeKnow) parts.push(whatWeKnow);

  const district = String(vars.district ?? '').trim();
  const school = String(vars.school ?? '').trim();
  if (district || school) {
    try {
      const brief = await buildPreCallBrief(district, school);
      if (brief) parts.push(`Researched about this school before the call:\n${brief}`);
    } catch {
      /* ignore — the model answers from what it has */
    }
  }
  return parts.join('\n\n');
}

const FALLBACK = 'Sorry — I lost the thread there. Could you say that again?';
const REMINDER_FALLBACK = 'Still here — anything else I can help you with?';
const DEFER_REPLY =
  "That's a great question — let me look it up properly and text you the full answer in a few minutes, so I don't keep you on the phone.";

function fallbackFor(reminder?: boolean): string {
  return reminder ? REMINDER_FALLBACK : FALLBACK;
}

/** Does the reply hand the question off to async research + text? */
function looksLikeDefer(text: string): boolean {
  return /look into it and text|text you (the|an|my) (answer|details|full)|research (it|this) and (text|send)|text you the details|send you (the|an) answer/i.test(text);
}

export async function generateVoiceReply(turn: VoiceTurn): Promise<VoiceReply> {
  const model = getVoiceLlm();
  if (!model) {
    console.error('[voice] no LLM configured');
    return { text: fallbackFor(turn.reminder) };
  }

  const vars = turn.variables ?? {};
  const messages: unknown[] = turn.transcript
    .filter((u) => u.content && u.content.trim())
    .map((u) => ({ role: u.role === 'user' ? 'user' : 'assistant', content: u.content }));

  if (turn.reminder) {
    messages.push({ role: 'user', content: '(The caller has gone quiet. Gently check they\u2019re still there or ask if they need anything.)' });
  }
  if (messages.length === 0) return { text: fallbackFor(turn.reminder) };

  const context = await buildContext(vars);

  const startedAt = Date.now();
  // One fast call, NO tools. The model answers from context or replies DEFER.
  const res = await model.chatWithTools(voiceSystemPrompt(vars, context), messages, [], 'none');
  console.log(`[voice] turn ${Date.now() - startedAt}ms`);

  if (res?.text) {
    const text = res.text.trim();
    if (/^DEFER\b/i.test(text)) {
      // Literal signal — the model chose to hand off entirely.
      console.log('[voice] deferred research → text');
      return { text: DEFER_REPLY, deferred: true };
    }
    if (looksLikeDefer(text)) {
      // Natural handoff ("let me look into it and text you the details").
      console.log('[voice] natural defer → text handoff');
      return { text, deferred: true };
    }
    return { text };
  }

  console.error(`[voice] fallback fired after ${Date.now() - startedAt}ms`);
  return { text: fallbackFor(turn.reminder) };
}
