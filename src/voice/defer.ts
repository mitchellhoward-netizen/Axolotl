import { resolveAnyDistrict, resolveAnySchool } from '../knowledge/discovery.js';
import { researchQuestion } from '../knowledge/research.js';
import type { LlmClient } from '../agent/llm.js';

/**
 * The voice→text handoff. When the parent voice can't answer from context it
 * DEFERS; this module researches the question asynchronously and texts the
 * parent the answer over iMessage, instead of making them wait on the call.
 */

export interface DeferredQuestion {
  /** The parent's question (the last user utterance). */
  question: string;
  /** The iMessage space id to text (Retell `metadata.conversationId`). */
  conversationId: string;
  /** The call's dynamic variables (parent, student, school, district, …). */
  vars: Record<string, unknown>;
}

type DeferHandler = (q: DeferredQuestion) => Promise<void>;

let handler: DeferHandler | null = null;

/** Register the process-wide handler (wired in index.ts, which owns the agent + iMessage sender). */
export function setDeferHandler(fn: DeferHandler): void {
  handler = fn;
}

/** Fire-and-forget entry point from the voice server. */
export function deferQuestion(q: DeferredQuestion): void {
  if (!handler) {
    console.warn('[defer] no handler registered — question dropped:', q.question.slice(0, 80));
    return;
  }
  void handler(q).catch((e) => console.error('[defer] handler error:', (e as Error)?.message ?? e));
}

/**
 * Research the deferred question and write a plain-language, parent-facing
 * answer: focused web search + fetch the top pages, then synthesize with the
 * text LLM (honest about what still needs confirming with the school).
 */
export async function answerDeferredQuestion(q: DeferredQuestion, llm: LlmClient): Promise<string> {
  const vars = q.vars;
  const districtName = String(vars.district ?? vars.school ?? '').trim();
  const schoolName = String(vars.school ?? '').trim();
  const district = resolveAnyDistrict(districtName);
  const school = resolveAnySchool(schoolName || districtName);

  const parent = String(vars.parent_name ?? 'you');
  const student = String(vars.student ?? 'your child');

  // Focused, grounded research for this specific question (search + fetch top
  // pages). Bounded so a slow reader never leaves the handoff hanging.
  let pages = '';
  try {
    pages = await withTimeout(researchQuestion(q.question, district.name, school.name, 2), 30000, '');
  } catch (e) {
    console.error('[defer] research failed:', (e as Error)?.message ?? e);
  }

  // Synthesize a warm, plain-language answer grounded in the fetched pages.
  const system =
    'You are Axolotl, a warm school-bureaucracy assistant. Write a short TEXT-message answer for the parent ' +
    `(parent ${parent}, child ${student}) that answers their question. Plain language, no statute numbers, ` +
    'one short paragraph plus at most a few bullet points. Answer from the web pages below. Be honest about what ' +
    'still needs confirming with the school or district. If the pages don\u2019t contain the answer, say so plainly ' +
    'and give a concrete next step (who to call) — do NOT invent facts.';
  const user = `Question: ${q.question}\n\nRelevant web pages:\n${pages || '(none fetched)'}\n\nWrite the answer.`;

  const res = await withTimeout(llm.chatWithTools(system, [{ role: 'user', content: user }], [], 'none'), 30000, null);
  if (res?.text?.trim()) return res.text.trim();

  return 'I\u2019m still looking into that. I\u2019ll text you the moment I have a solid answer — and I can also call the school for you if that\u2019s faster.';
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}
