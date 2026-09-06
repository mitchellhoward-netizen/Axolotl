import { getVoiceLlm } from './llm.js';
import { buildPreCallBrief } from '../knowledge/precall.js';
import { LLM_TOOLS, runTool, type ToolDeps } from '../agent/tools.js';
import { KnowledgeGraph } from '../knowledge/graph.js';
import { searchSchoolGraph, chainSummary } from '../knowledge/resource-graph.js';
import { resolveAnyDistrict } from '../knowledge/discovery.js';
import type { Step, CallBrief } from '../agent/steps/types.js';
import type { FamilyProfile } from '../domain/types.js';

/**
 * The parent-facing voice brain. Fast model + a SMALL, voice-safe tool set:
 * answer from context instantly, do a quick lookup (knowledge/resource graph)
 * when needed, do LIVE research (web_search/web_fetch) with narration when the
 * parent needs current specifics, and PROPOSE actions (email/call) that the
 * parent can approve on the call — then the system executes them and follows up
 * by text. Anything too deep still DEFERS to async research + text.
 */

export interface VoiceTurn {
  transcript: Array<{ role: string; content: string }>;
  variables?: Record<string, unknown>;
  /** True for a `reminder_required` event (caller went quiet). */
  reminder?: boolean;
  /** Narrate what the agent is doing (spoken via agent_interrupt) during slow work. */
  onProgress?: (message: string) => void;
}

/** The spoken reply + any actions the parent can approve + whether to defer to text. */
export interface VoiceReply {
  text: string;
  /** True when the question needs deep research (hand off to async research + text). */
  deferred?: boolean;
  /** Actions proposed this turn (email/call) awaiting the parent's spoken YES. */
  proposedSteps?: Step[];
}

/** Voice-safe tools: instant lookups + live research + the two action tools. */
const VOICE_TOOL_NAMES = new Set([
  'get_school_info',
  'get_knowledge',
  'search_school_graph',
  'web_search',
  'web_fetch',
  'send_email',
  'call_school',
  'log_case',
  'now',
]);
const VOICE_TOOLS = LLM_TOOLS.filter(
  (t) => VOICE_TOOL_NAMES.has((t as { function?: { name?: string } }).function?.name ?? ''),
);

const SLOW_TOOLS = new Set(['web_search', 'web_fetch']);

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
    '- Match the caller\u2019s language exactly: an English caller gets English, a Spanish caller gets Spanish. NEVER mix languages. If unsure, default to English.',
    '',
    `FAMILY CONTEXT (use it, don't re-ask): parent ${parent}, child ${student}${grade}, school ${school}${district ? ` (${district})` : ''}. They mentioned: ${issue || 'nothing specific yet'}.`,
    '',
    'WHAT WE KNOW about this school and family (answer from this first; don\u2019t re-ask):',
    context || '(nothing pre-researched for this school yet)',
    '',
    'TOOLS — use them to help, never just to talk:',
    '- Answer from WHAT WE KNOW plus plain, uncontroversial school basics. Don\u2019t call tools for something already answered above.',
    '- For a specific fact you don\u2019t have (a policy, process, form, deadline, or phone number), use get_knowledge / search_school_graph first (fast), then web_search / web_fetch if still missing.',
    '- BE PROACTIVE AS THE DEFAULT: turn every answer into an action and offer to DO it. NEVER end by just informing or handing off ("you should contact them") — instead say "I can do that for you" and ask a quick yes/no.',
    '- You CAN act: send emails, place calls, fill forms. NEVER say you can\u2019t do something, can\u2019t help, or can\u2019t access it — you drive it for the parent. If a step is needed, say you\u2019ll do it and handle it.',
    '- When the parent asks you to DO something (sign up, enroll, request, reach out), CALL send_email or call_school RIGHT AWAY — do not just describe it. Do NOT research every detail first; act, then offer.',
    '- If you don\u2019t have a verified email for the recipient, use call_school (call the school office) instead of inventing an email. Use the contacts in WHAT WE KNOW.',
    '- Do NOT over-research: after at most one or two lookups, either answer or propose the action.',
    '- If, even after looking it up, you still can\u2019t answer a question that needs deep research, reply with EXACTLY the single word DEFER and nothing else — we will research it and text the parent.',
    '',
    'IMPORTANT — never invent a specific policy, process, form, deadline, or phone number. If it\u2019s not in WHAT WE KNOW and you can\u2019t find it with tools, DEFER rather than guess.',
  ].join('\n');
}

/**
 * Build the context the model answers from. `what_we_know` usually already
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

/** Build a lightweight profile from the call vars so action tools get real context. */
function buildProfile(vars: Record<string, unknown>): FamilyProfile | undefined {
  const student = String(vars.student ?? '').trim();
  const school = String(vars.school ?? '').trim();
  const district = String(vars.district ?? '').trim();
  if (!student && !school && !district) return undefined;
  return {
    parentName: String(vars.parent_name ?? 'the parent'),
    children: student ? [{ name: student, grade: vars.grade ? String(vars.grade) : undefined }] : [],
    school: school || undefined,
    district: district || undefined,
    needs: [],
    challenges: [],
    notes: String(vars.issue ?? ''),
  };
}

/** Grounded knowledge lookup for the get_knowledge tool (same as the text brain's). */
function makeKnowledgeDep(vars: Record<string, unknown>) {
  return async (category?: string, query?: string): Promise<string> => {
    const districtName = String(vars.district ?? vars.school ?? '');
    const district = resolveAnyDistrict(districtName);
    const g = new KnowledgeGraph();
    let nodes = await g.get(district.id);
    const cat = (category ?? '').trim().toUpperCase().replace(/\s+/g, '_');
    if (cat && cat !== 'LAW') {
      const filtered = nodes.filter((n) => n.category === cat);
      if (filtered.length) nodes = filtered;
    }
    const chain = await searchSchoolGraph(district.id, cat && cat !== 'LAW' ? cat : undefined);
    const parts = nodes.map((n) => `- ${n.title}: ${n.summary}${n.law ? ` (${n.law})` : ''}`);
    if (chain && chain.nodes.length) parts.push(`Forms/contacts: ${chainSummary(chain)}`);
    return parts.join('\n') || 'No researched info yet — use web_search to look it up.';
  };
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

// ── Proactivity: a reliable action-proposal step (the fast model often won't
// call send_email/call_school on its own, so we ask it directly and structurally). ──

const ACTION_KEYWORDS = /\b(sign|signup|sign up|enroll|enrollment|register|registration|apply|application|request|send|email|call|reach out|contact|form|schedule|book|set up)\b/i;

interface ProposedAction {
  kind: 'email' | 'call';
  summary: string;
  to?: string;
  subject?: string;
  body?: string;
}

function extractJson(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}

async function proposeAction(
  question: string,
  answer: string,
  context: string,
  model: ReturnType<typeof getVoiceLlm>,
): Promise<ProposedAction | null> {
  if (!model) return null;
  const system = [
    'You decide whether the assistant should offer to DO a concrete action for the parent (send an email or place a call).',
    'Return ONLY valid JSON, exactly one of:',
    '{"action": null}',
    '{"action": {"kind":"email","summary":"short phrase","to":"recipient email","subject":"...","body":"..."}}',
    '{"action": {"kind":"call","summary":"short phrase"}}',
    'Rules:',
    '- Propose ONLY if the parent asked to sign up, enroll, register, apply, request, send, call, reach out, or schedule something.',
    '- `summary` is the thing to do as a short phrase WITHOUT a leading verb, e.g. "add Patrick to the afterschool waitlist" or "request a bus pass".',
    '- Aim the action at the SCHOOL OFFICE or the district homeless liaison — those are the contacts you have. Do NOT propose contacting a third-party provider.',
    '- For email, use a recipient from the context (school office or district homeless liaison). NEVER invent an email. If none is available, propose "call" instead.',
    '- If the parent only asked for information, return {"action": null}.',
  ].join('\n');
  const user = `Parent question: ${question}\nAssistant answer: ${answer}\nFamily/school context: ${context}`;
  const res = await model.chatWithTools(system, [{ role: 'user', content: user }], [], 'none');
  const raw = res?.text?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(extractJson(raw)) as { action?: ProposedAction | null };
    const a = parsed.action;
    if (a && (a.kind === 'email' || a.kind === 'call') && a.summary) return a;
    return null;
  } catch {
    return null;
  }
}

function buildActionStep(action: ProposedAction, vars: Record<string, unknown>): Step | null {
  const now = Date.now().toString(36);
  if (action.kind === 'email' && action.to && action.subject && action.body) {
    return {
      id: 'email-' + now,
      caseId: 'email',
      intent: 'send_email',
      channel: 'email',
      counterparty: { role: 'OTHER', email: action.to },
      payload: { channel: 'email', subject: action.subject, body: action.body },
      successCondition: { describe: 'Email sent', kind: 'reference_received' },
      requiresConsent: true,
      status: 'awaiting_consent',
    };
  }
  if (action.kind === 'call') {
    const goal = action.summary.replace(/^(call|email|contact|reach out to|get in touch with)\s+/i, '').trim() || action.summary;
    const brief: CallBrief = {
      parentName: String(vars.parent_name ?? 'the parent'),
      student: String(vars.student ?? 'your child'),
      grade: vars.grade ? String(vars.grade) : '',
      school: String(vars.school ?? 'the school'),
      district: String(vars.district ?? ''),
      goal,
      whatWeKnow: String(vars.what_we_know ?? vars.issue ?? ''),
      cannotCommit: ['fees or payments', 'routes or schedules'],
    };
    return {
      id: 'call-' + now,
      caseId: 'call',
      intent: 'call_school',
      channel: 'call',
      counterparty: { role: 'OTHER' },
      payload: { channel: 'call', objective: brief },
      successCondition: { describe: 'Called the school', kind: 'manual' },
      requiresConsent: true,
      status: 'awaiting_consent',
    };
  }
  return null;
}

function offerText(action: ProposedAction): string {
  if (action.kind === 'email') return 'I can send that email for you — want me to?';
  return 'I can make that call for you — want me to?';
}

function lastUserQuestion(transcript: Array<{ role: string; content: string }>): string {
  for (let i = transcript.length - 1; i >= 0; i--) {
    const t = transcript[i];
    if (t && t.role === 'user') return t.content;
  }
  return '';
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
  const proposed: Step[] = [];

  const deps: ToolDeps = {
    profile: buildProfile(vars),
    getCases: () => [],
    appendCase: () => {},
    // Collect proposed actions; the server holds them until the parent says YES.
    proposeSteps: (steps) => proposed.push(...steps),
    knowledge: makeKnowledgeDep(vars),
    memory: undefined,
    studentName: String(vars.student ?? ''),
  };

  const startedAt = Date.now();
  const question = lastUserQuestion(turn.transcript);
  let working: unknown[] = [...messages];
  let guard = 0;
  let slowNarrated = false;

  while (guard < 8) {
    const callStart = Date.now();
    const res = await model.chatWithTools(voiceSystemPrompt(vars, context), working, VOICE_TOOLS, 'auto');
    console.log(`[voice] llm#${guard} ${Date.now() - callStart}ms ${res?.calls?.length ? `(tools: ${res.calls.map((c) => c.name).join(',')})` : '(answer)'}`);
    if (!res) break;

    if (res.calls?.length) {
      // Narrate only before SLOW work (web research); instant lookups need no silence-filler.
      if (res.calls.some((c) => SLOW_TOOLS.has(c.name))) {
        turn.onProgress?.(slowNarrated ? 'Still on it — just another moment.' : 'Let me look into that for you — give me about thirty seconds.');
        slowNarrated = true;
      }

      const assistantMsg = {
        role: 'assistant',
        content: null,
        tool_calls: res.calls.map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: c.arguments },
        })),
      };
      const results: unknown[] = [];
      for (const c of res.calls) {
        let out = 'tool error';
        try {
          out = await runTool(c.name, JSON.parse(c.arguments || '{}') as Record<string, unknown>, deps);
        } catch {
          /* keep 'tool error' */
        }
        results.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify({ result: out }) });
      }
      working.push(assistantMsg, ...results);
      guard++;
      continue;
    }

    if (res.text) {
      const text = res.text.trim();
      if (/^DEFER\b/i.test(text)) {
        console.log('[voice] deferred research → text');
        return { text: DEFER_REPLY, deferred: true, proposedSteps: proposed.length ? proposed : undefined };
      }
      if (looksLikeDefer(text)) {
        console.log('[voice] natural defer → text handoff');
        return { text, deferred: true, proposedSteps: proposed.length ? proposed : undefined };
      }
      console.log(`[voice] turn ${Date.now() - startedAt}ms`);

      // Proactivity fallback: if the parent asked for an action and the model
      // didn't propose one itself, propose one reliably (and capture the step).
      if (!proposed.length && question && ACTION_KEYWORDS.test(question)) {
        const action = await proposeAction(question, text, context, model);
        if (action) {
          const step = buildActionStep(action, vars);
          if (step) {
            console.log(`[voice] proposed action: ${action.kind} → ${action.summary}`);
            return { text: `${text} ${offerText(action)}`, proposedSteps: [step] };
          }
        }
      }
      return { text, proposedSteps: proposed.length ? proposed : undefined };
    }
    break;
  }

  console.error(`[voice] fallback fired after ${Date.now() - startedAt}ms`);
  if (proposed.length) {
    // The model proposed an action but never concluded — surface the offer.
    return { text: 'I can take care of that for you — want me to go ahead?', proposedSteps: proposed };
  }
  return { text: fallbackFor(turn.reminder) };
}
