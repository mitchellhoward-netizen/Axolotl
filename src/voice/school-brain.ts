import { getVoiceLlm } from './llm.js';
import { buildPreCallBrief } from '../knowledge/precall.js';

/**
 * The school-facing voice brain. When the agent calls a school office, it is a
 * professional advocate for the parent — clear about who it's calling for and
 * why, honest about what it can and cannot commit to, and able to handle a
 * staffer's pushback and escalate. It uses the same fast model + pre-fetched
 * context, but a completely different persona from the warm parent voice.
 */

export interface SchoolTurn {
  transcript: Array<{ role: string; content: string }>;
  variables?: Record<string, unknown>;
  /** True for a `reminder_required` event. */
  reminder?: boolean;
  onToken?: (token: string) => void;
}

function schoolSystemPrompt(vars: Record<string, unknown>, context: string): string {
  const parent = String(vars.parent_name ?? 'a parent');
  const student = String(vars.student ?? 'their child');
  const grade = vars.grade ? `, grade ${String(vars.grade)}` : '';
  const school = vars.school ? String(vars.school) : 'the school';
  const goal = String(vars.goal ?? vars.issue ?? 'resolve a school matter for the student');
  const whatWeKnow = String(vars.what_we_know ?? '').trim();
  const cannotCommit = String(vars.cannot_commit ?? 'fees, payments, routes, schedules, enrollment changes, or any decision only the parent can make');
  const disclosure = String(vars.disclosure ?? "I'm an automated assistant calling on behalf of a parent. This call is transcribed for the parent's records.");

  return [
    'You are calling a school office ON BEHALF of a parent. You are a calm, professional, competent advocate. You are courteous but clear: you are there to get something specific done for this child, and you know what you can and cannot decide.',
    '',
    `CALL FACTS:`,
    `- Parent you represent: ${parent}`,
    `- Student: ${student}${grade}`,
    `- School you are calling: ${school}`,
    `- Your goal on this call: ${goal}`,
    '',
    'WHAT WE KNOW (state facts from here; never invent more):',
    whatWeKnow || '(nothing else — confirm details rather than guess)',
    '',
    'RESEARCHED ABOUT THIS SCHOOL (use it; don\u2019t re-research):',
    context || '(nothing pre-researched for this school yet)',
    '',
    `YOU CANNOT COMMIT TO OR DECIDE: ${cannotCommit}. If the staffer asks you to agree to any of these, say you\u2019ll confirm with the parent and follow up.`,
    '',
    'RULES:',
    '- Identify yourself ONCE, early (your first spoken turn): you are an assistant calling on behalf of a parent about their child, and the call is transcribed for the parent\u2019s records. Do not repeat the disclosure every turn.',
    '- Be precise and concise — school staff are busy. 1-3 sentences per turn, plain professional English, no markdown, no emoji.',
    '- Answer the staffer\u2019s questions honestly from WHAT WE KNOW. If asked something you don\u2019t know, say you\u2019ll confirm with the parent and follow up — never guess, never invent.',
    '- Never agree on the parent\u2019s behalf, and never commit to anything the parent must decide.',
    '- If the staffer says no or pushes back: stay courteous, ask what would help, request the specific form/process/contact/deadline, and offer to have the parent follow up.',
    '- If you hit a dead end, ask who to escalate to (the district homeless liaison, the principal, or the right department) and note it.',
    '- NEVER quote statute numbers or section codes. Say what the child may be entitled to in plain words, and frame it as a request, not a demand.',
    '- At the end, briefly summarize what was agreed and the next step.',
  ].join('\n');
}

async function buildContext(vars: Record<string, unknown>): Promise<string> {
  const whatWeKnow = String(vars.what_we_know ?? '').trim();
  if (/researched about this school/i.test(whatWeKnow)) return '';

  const district = String(vars.district ?? '').trim();
  const school = String(vars.school ?? '').trim();
  if (!district && !school) return '';
  try {
    return await buildPreCallBrief(district, school);
  } catch {
    return '';
  }
}

const FALLBACK = 'I\u2019ll need to confirm that with the parent and call you back. Is there a good number or extension to reach you at?';
const REMINDER_FALLBACK = 'Just to confirm — are you still there? I can follow up if this is a busy time.';

function fallbackFor(reminder?: boolean): string {
  return reminder ? REMINDER_FALLBACK : FALLBACK;
}

export async function generateSchoolReply(turn: SchoolTurn): Promise<string> {
  const model = getVoiceLlm();
  if (!model) {
    console.error('[voice:school] no LLM configured');
    return fallbackFor(turn.reminder);
  }

  const vars = turn.variables ?? {};
  const messages: unknown[] = turn.transcript
    .filter((u) => u.content && u.content.trim())
    .map((u) => ({ role: u.role === 'user' ? 'user' : 'assistant', content: u.content }));

  if (turn.reminder) {
    messages.push({ role: 'user', content: '(The other party has gone quiet. Politely confirm they\u2019re still there, or offer to follow up.)' });
  }
  if (messages.length === 0) return fallbackFor(turn.reminder);

  const context = await buildContext(vars);
  const startedAt = Date.now();
  const res = await model.chatWithTools(schoolSystemPrompt(vars, context), messages, [], 'none');
  console.log(`[voice:school] turn ${Date.now() - startedAt}ms`);

  if (res?.text) return res.text.trim() || fallbackFor(turn.reminder);
  return fallbackFor(turn.reminder);
}
