import { getVoiceLlm } from './llm.js';
import { buildPreCallBrief } from '../knowledge/precall.js';
import { researchQuestion } from '../knowledge/research.js';
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

// Tools that can take a moment (or trigger background research) — narrate before
// them so the caller is never left in silence. get_knowledge can auto-research
// an un-researched school (slow), so it counts even though the cached lookup is fast.
const RESEARCH_TOOLS = new Set(['get_knowledge', 'search_school_graph', 'get_school_info', 'web_search', 'web_fetch']);

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
    'TOOLS — use them to help, never just to talk:',
    '- Answer from WHAT WE KNOW plus plain, uncontroversial school basics. Don\u2019t call tools for something already answered above.',
    '- For a specific fact you don\u2019t have (a policy, process, form, deadline, or phone number), use get_knowledge / search_school_graph first (fast), then web_search / web_fetch if still missing.',
    '- DISAMBIGUATE SCHOOLS: if the school isn\u2019t one you have on file, or it\u2019s a common name (Lakeside, Lincoln, Washington, etc.), ASK which city and state it\u2019s in before researching, and include the city/state in any web search. Never research a different school with the same name.',
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
    location: String(vars.location ?? '').trim() || undefined,
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
function isSchoolTarget(target: string, vars: Record<string, unknown>): boolean {
  const t = target.toLowerCase();
  if (!t) return true;
  if (/school|district|office|liaison|principal|elementary|union/.test(t)) return true;
  const school = String(vars.school ?? '').toLowerCase();
  const district = String(vars.district ?? '').toLowerCase();
  return Boolean((school && (school.includes(t) || t.includes(school))) || (district && (district.includes(t) || t.includes(district))));
}

/** Find a third-party provider's email/phone via a focused web search. */
async function resolveContact(target: string, districtName: string): Promise<{ email?: string; phone?: string }> {
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

    // Third-party provider → resolve its real contact so we reach it directly.
    if (!isSchoolTarget(action.target, vars)) {
      const contact = await resolveContact(action.target, String(vars.district ?? vars.school ?? ''));
      action.phone = action.phone || contact.phone;
      action.to = action.to || contact.email;
      // No email for an email-intent → prefer calling if we found a number.
      if (action.kind === 'email' && !action.to && action.phone) action.kind = 'call';
    }
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
      // Narrate before any research so the caller is never left in silence.
      if (res.calls.some((c) => RESEARCH_TOOLS.has(c.name))) {
        turn.onProgress?.(slowNarrated ? 'Still on it — almost there.' : 'Let me look into that for you — hang tight, be right back.');
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
