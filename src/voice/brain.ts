import { getVoiceLlm } from './llm.js';
import { researchQuestion } from '../knowledge/research.js';
import { LLM_TOOLS, runTool, type ToolDeps } from '../agent/tools.js';
import { KnowledgeGraph } from '../knowledge/graph.js';
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
  /** True when the agent is done (goodbye / task complete) — hang up the call. */
  endCall?: boolean;
}

/** Voice-safe tools: instant, in-memory only. Everything slow is deferred. */
const VOICE_TOOL_NAMES = new Set([
  'get_knowledge', // cached-only (see §D) — instant
  'send_email',    // proposeSteps → staged instantly, consent-gated
  'call_school',   // proposeSteps → staged instantly, consent-gated
  'log_case',
  'now',
]);
const VOICE_TOOLS = [
  ...LLM_TOOLS.filter((t) => VOICE_TOOL_NAMES.has((t as { function?: { name?: string } }).function?.name ?? '')),
  {
    type: 'function',
    function: {
      name: 'end_call',
      description: 'The call is over — the parent said goodbye, or the task is done. End the call politely.',
      parameters: { type: 'object', properties: {} },
    },
  },
];

/** A spoken, natural-language system prompt. No markdown, no bullets, short. */
function voiceSystemPrompt(vars: Record<string, unknown>, context: string): string {
  const parent = String(vars.parent_name ?? 'the parent');
  const student = String(vars.student ?? 'their child');
  const grade = vars.grade ? ` (grade ${String(vars.grade)})` : '';
  const school = vars.school ? String(vars.school) : 'their school';
  const district = vars.district ? String(vars.district) : '';
  const issue = vars.issue ? String(vars.issue) : '';

  return [
    'You are Axolotl, a warm, plain-spoken assistant helping a parent with their child\u2019s school. You are speaking to them ON A LIVE PHONE CALL.',
    'HOW YOU SOUND (the most important part — sound like a warm, real person, not a robot):',
    '- Talk like you\u2019re mid-conversation, not reading a script. Say the things a real person says.',
    '- Use everyday spoken fillers and connectors naturally: "um," "so," "yeah," "okay," "like," "you know," "hmm," "you know what."',
    '- Start often with "So," "Yeah," "Okay," "And," or "But" \u2014 the way people actually start talking. Vary how you begin; don\u2019t repeat the same opener every turn.',
    '- Say the things real helpers say: "Let me just check that for you," "One second here," "Hmm, let me look," "Okay so here\u2019s what I\u2019m thinking," "Alright, that makes sense."',
    '- Keep the tone calm, warm, and relaxed \u2014 like a helpful friend over coffee, not a corporate rep. A little casual is good; never stiff or formal.',
    '- Never lecture or read a list. One or two short sentences, then hand the ball back or offer the next step.',
    '- No markdown, no bullets, no headings, no emoji.',
    'Rules:',
    '- Speak in short, natural sentences (1-3 per turn). Never use markdown, bullet points, headings, or emoji.',
    '- Never announce you are an AI or a demo.',
    '- NEVER quote statute numbers or section codes \u2014 say what they have a right to in plain words.',
    '- Never claim you already submitted a form, scheduled a meeting, or talked to the school \u2014 offer to help and explain next steps instead.',
    '- DEFAULT TO ENGLISH. Speak English unless the caller clearly starts in Spanish \u2014 if they do, switch to Spanish and stay there. NEVER mix languages. Only start in Spanish if the call variables say locale \'es\'.',
    '',
    `FAMILY CONTEXT (use it, don't re-ask): parent ${parent}, child ${student}${grade}, school ${school}${district ? ` (${district})` : ''}. They mentioned: ${issue || 'nothing specific yet'}.`,
    '',
    'WHAT WE KNOW about this school and family (answer from this first; don\u2019t re-ask):',
    context || '(nothing pre-researched for this school yet)',
    '',
    'TOOLS — you are ON A LIVE CALL, so speed matters more than completeness:',
    '- Answer from WHAT WE KNOW plus plain, uncontroversial school basics. That is the job most of the time.',
    '- You do NOT browse or search on the call. If they ask for a specific fact you don\u2019t have (a policy, form, deadline, phone number, program list), say you\u2019ll get the exact answer and text it in a minute \u2014 then reply with EXACTLY the single word DEFER. We research it properly and text them; you keep the conversation going.',
    '- If get_knowledge returns NOT_CACHED, treat it as "I don\u2019t have that yet" \u2192 offer to look it up and DEFER. Never stall.',
    '- When they ask you to DO something (email, call, sign-up), call send_email or call_school. These stage the action instantly and the system asks them for a YES \u2014 so just call the tool and move on; never wait on it, never ask for consent yourself.',
    '- Be warm and proactive: after you answer, offer the next step and ask a quick yes/no ("I can call the office about the bus \u2014 want me to?"). But proactive means OFFER and hand off to text \u2014 never "let me look that up" while they wait.',
    '- Never claim you already sent, called, submitted, or scheduled anything. Offer, then let their YES trigger it.',
    '- When the parent says goodbye ("bye", "thanks, that\u2019s all", "goodbye") or the task is done, call end_call to hang up. Don\u2019t keep the call open or repeat the offer.',
    '',
    'IMPORTANT \u2014 never invent a specific policy, process, form, deadline, or phone number. If it\u2019s not in WHAT WE KNOW, DEFER rather than guess.',
  ].join('\n');
}

/**
 * Build the context the model answers from — INSTANT, no network. The pre-call
 * brief is front-loaded into vars.what_we_know before dialing (see index.ts §F).
 * If it's missing, the model answers from vars and DEFERS specifics (see §C).
 */
function buildContext(vars: Record<string, unknown>): string {
  return String(vars.what_we_know ?? '').trim();
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
    location: String(vars.location ?? '').trim() || undefined,
    district: district || undefined,
    needs: [],
    challenges: [],
    notes: String(vars.issue ?? ''),
  };
}

/** Cached-only knowledge lookup — in-memory graph only, never the network. */
function makeKnowledgeDep(vars: Record<string, unknown>) {
  return async (category?: string): Promise<string> => {
    const district = resolveAnyDistrict(String(vars.district ?? vars.school ?? ''));
    // KnowledgeGraph.get is an in-memory cache (fast); timeout is belt-and-suspenders.
    const nodes = await withTimeout(new KnowledgeGraph().get(district.id), 300, [] as Awaited<ReturnType<KnowledgeGraph['get']>>);
    if (!nodes.length) return 'NOT_CACHED'; // prompt reads this as "defer"
    const cat = (category ?? '').trim().toUpperCase().replace(/\s+/g, '_');
    const picked = cat && cat !== 'LAW' ? nodes.filter((n) => n.category === cat) : nodes;
    return (picked.length ? picked : nodes)
      .map((n) => `- ${n.title}: ${n.summary}${n.law ? ` (${n.law})` : ''}`)
      .join('\n');
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
  /** WHO the assistant contacts: the school office, the liaison, or a third-party provider. */
  target: string;
  to?: string;
  phone?: string;
  subject?: string;
  body?: string;
}

function extractJson(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

/** Is `target` the school/district (whose contact we already have on file)? */
/** Find a third-party provider's email/phone via a focused web search (runs at
 * execution, off the call — after the parent's YES). */
export async function resolveContact(target: string, districtName: string): Promise<{ email?: string; phone?: string }> {
  try {
    const pages = await withTimeout(researchQuestion(`${target} contact email phone`, districtName, undefined, 2), 20000, '');
    if (!pages) return {};
    const email = pages.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0];
    // Require a separator or parentheses so we don't grab a bare digit run (IDs etc).
    const phone = pages.match(/(?:\+?1[\s.-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.-])\d{3}[\s.-]\d{4}/)?.[0];
    return { email, phone };
  } catch {
    return {};
  }
}

async function proposeAction(
  question: string,
  answer: string,
  context: string,
  vars: Record<string, unknown>,
  model: ReturnType<typeof getVoiceLlm>,
): Promise<ProposedAction | null> {
  if (!model) return null;
  const system = [
    'You decide whether the assistant should offer to DO a concrete action for the parent (send an email or place a call) and WHO to do it to.',
    'Return ONLY valid JSON, exactly one of:',
    '{"action": null}',
    '{"action": {"kind":"email","summary":"...","target":"...","to":"recipient email","subject":"...","body":"..."}}',
    '{"action": {"kind":"call","summary":"...","target":"..."}}',
    'Rules:',
    '- Propose ONLY if the parent asked to sign up, enroll, register, apply, request, send, call, reach out, or schedule something.',
    '- `target` is WHO the assistant contacts, as a natural name: "the school office", "the district homeless liaison", or the provider\'s name (e.g. "Campus Kids Connection").',
    '- `summary` is the thing to do WITHOUT a leading verb, e.g. "add Patrick to the afterschool waitlist" or "request a bus pass".',
    '- For email, include a subject and body. Only include `to` if you are SURE of the recipient email — otherwise leave `to` empty (we will find it).',
    '- NEVER invent an email or phone number. If unsure, leave them empty.',
    '- If the parent only asked for information, return {"action": null}.',
  ].join('\n');
  const user = `Parent question: ${question}\nAssistant answer: ${answer}\nFamily/school context: ${context}`;
  const res = await model.chatWithTools(system, [{ role: 'user', content: user }], [], 'none');
  const raw = res?.text?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(extractJson(raw)) as { action?: Partial<ProposedAction> | null };
    const a = parsed.action;
    if (!a || !a.summary || (a.kind !== 'email' && a.kind !== 'call')) return null;
    const action = { kind: a.kind, summary: a.summary, target: (a.target ?? 'the school office').trim(), to: a.to, phone: a.phone, subject: a.subject, body: a.body } as ProposedAction;

    // Contact is resolved at EXECUTION (after the parent's YES), off the call —
    // never look it up in the turn. The offer only needs the plain target name.
    return action;
  } catch {
    return null;
  }
}

function buildActionStep(action: ProposedAction, vars: Record<string, unknown>): Step | null {
  const now = Date.now().toString(36);
  const target = action.target || 'the school office';

  if (action.kind === 'email' && action.to) {
    return {
      id: 'email-' + now,
      caseId: 'email',
      intent: 'send_email',
      channel: 'email',
      counterparty: { role: 'OTHER', name: target, email: action.to },
      payload: {
        channel: 'email',
        subject: action.subject || `Inquiry: ${action.summary}`,
        body: action.body || `Hello,\n\nI'm writing on behalf of a parent to ${action.summary}. Could you share the next steps? Thank you.`,
        target: action.target,
        district: String(vars.district ?? vars.school ?? ''),
      },
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
      // A third-party phone reaches them directly; otherwise the school office.
      counterparty: action.phone ? { role: 'OTHER', name: target, phone: action.phone } : { role: 'OTHER', name: target },
      payload: { channel: 'call', objective: brief },
      successCondition: { describe: `Called ${target}`, kind: 'manual' },
      requiresConsent: true,
      status: 'awaiting_consent',
    };
  }
  return null;
}

function offerText(action: ProposedAction): string {
  if (action.kind === 'email') return `I can email them to ${action.summary} — want me to send it?`;
  return `I can call them to ${action.summary} — want me to do that?`;
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

  const context = buildContext(vars);
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

  while (guard < 4) {
    const callStart = Date.now();
    const res = await model.chatWithTools(voiceSystemPrompt(vars, context), working, VOICE_TOOLS, 'auto');
    console.log(`[voice] llm#${guard} ${Date.now() - callStart}ms ${res?.calls?.length ? `(tools: ${res.calls.map((c) => c.name).join(',')})` : '(answer)'}`);
    if (!res) break;

    if (res.calls?.length) {
      // The model signaled the call is over → hang up after a warm goodbye.
      if (res.calls.some((c) => c.name === 'end_call')) {
        return { text: 'Alright — I\u2019ll follow up by text if anything comes up. Take care!', endCall: true, proposedSteps: proposed.length ? proposed : undefined };
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
        const toolStart = Date.now();
        try {
          out = await runTool(c.name, JSON.parse(c.arguments || '{}') as Record<string, unknown>, deps);
        } catch {
          /* keep 'tool error' */
        }
        console.log(`[voice] tool ${c.name} ${Date.now() - toolStart}ms`);
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
        const action = await proposeAction(question, text, context, vars, model);
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
