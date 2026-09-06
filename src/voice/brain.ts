import 'dotenv/config';
import { LlmClient } from '../agent/llm.js';
import { LLM_TOOLS, runTool, type ToolDeps } from '../agent/tools.js';
import { KnowledgeGraph } from '../knowledge/graph.js';
import { searchSchoolGraph, chainSummary } from '../knowledge/resource-graph.js';
import { resolveAnyDistrict } from '../knowledge/discovery.js';
import { assessKnowledgeNode } from '../agent/verify.js';

/**
 * The voice brain. Turns a live phone-call transcript + family context into the
 * assistant's next spoken reply — using the SAME DeepSeek model and the SAME
 * knowledge graph / resource graph / live web search as the text agent. This is
 * what makes the phone call "the assistant" rather than a canned script.
 */

let llm: LlmClient | null | undefined;
let graph: KnowledgeGraph | undefined;

function getLlm(): LlmClient | null {
  if (llm !== undefined) return llm;
  const key = process.env.VOICE_API_KEY ?? process.env.DEEPSEEK_API_KEY ?? process.env.OPENAI_API_KEY;
  llm = key
    ? new LlmClient({
        apiKey: key,
        baseUrl: process.env.VOICE_BASE_URL ?? process.env.LLM_BASE_URL ?? process.env.OPENAI_BASE_URL ?? 'https://api.deepseek.com',
        // Voice uses the main (reasoning) model by default for answer quality.
        // Set VOICE_MODEL to a faster model to trade quality for latency.
        model: process.env.VOICE_MODEL ?? process.env.LLM_MODEL ?? 'deepseek-chat',
      })
    : null;
  return llm;
}

function getGraph(): KnowledgeGraph {
  if (!graph) graph = new KnowledgeGraph();
  return graph;
}

export interface VoiceTurn {
  transcript: Array<{ role: string; content: string }>;
  variables?: Record<string, unknown>;
  /** True for a `reminder_required` event (caller went quiet). */
  reminder?: boolean;
  /** Narrate what the agent is doing (with a time hint) so the caller is never left in silence. */
  onProgress?: (message: string) => void;
}

/** A spoken, natural-language system prompt. No markdown, no bullets, short. */
function voiceSystemPrompt(vars: Record<string, unknown>): string {
  const parent = String(vars.parent_name ?? 'the parent');
  const student = String(vars.student ?? 'their child');
  const grade = vars.grade ? ` (grade ${String(vars.grade)})` : '';
  const school = vars.school ? String(vars.school) : 'their school';
  const district = vars.district ? String(vars.district) : '';
  const issue = vars.issue ? String(vars.issue) : '';
  const whatWeKnow = vars.what_we_know ? String(vars.what_we_know) : '';

  return [
    'You are Axolotl, a warm, plain-spoken assistant helping a parent with their child\u2019s school. ' +
      'You are speaking to them ON A LIVE PHONE CALL.',
    'Rules:',
    '- Speak naturally in short sentences, 1-3 sentences per turn. Never use markdown, bullet points, headings, or emoji.',
    '- Never announce you are an AI or a demo.',
    '- NEVER quote statute numbers or section codes to the parent — say what they have a right to in plain words.',
    '- Before answering a school question, use web_search or get_knowledge to ground it. Never invent phone numbers, policies, or facts.',
    '- Never claim you already submitted a form, scheduled a meeting, or talked to the school — you can offer to help and explain next steps.',
    '- If you don\u2019t know something, say so and offer to look into it.',
    '- Be warm and proactive: turn answers into a next step and offer to do it.',
    '',
    `FAMILY CONTEXT (use it, don't re-ask): parent ${parent}, child ${student}${grade}, school ${school}${district ? ` (${district})` : ''}. They mentioned: ${issue || 'nothing specific yet'}. What we know: ${whatWeKnow || 'not much yet'}.`,
  ].join('\n');
}

const FALLBACK = "I'm here — what would you like help with?";

export async function generateVoiceReply(turn: VoiceTurn): Promise<string> {
  const model = getLlm();
  if (!model) return FALLBACK;

  const vars = turn.variables ?? {};
  const messages: unknown[] = turn.transcript
    .filter((u) => u.content && u.content.trim())
    .map((u) => ({ role: u.role === 'user' ? 'user' : 'assistant', content: u.content }));

  if (turn.reminder) {
    messages.push({ role: 'user', content: '(The caller has gone quiet. Gently check they\u2019re still there or ask if they need anything.)' });
  }
  if (messages.length === 0) return FALLBACK;

  const deps: ToolDeps = {
    profile: undefined,
    getCases: () => [],
    appendCase: () => {},
    // Voice is live: there is no consent gate to queue steps through, so proposed
    // actions become "offer to do it next" text rather than executing.
    proposeSteps: () => {},
    knowledge: async (category, query) => {
      const districtName = String(vars.district ?? vars.school ?? '');
      const district = resolveAnyDistrict(districtName);
      const g = getGraph();
      let nodes = await g.get(district.id);
      const cat = (category ?? '').trim().toUpperCase().replace(/\s+/g, '_');
      if (cat && cat !== 'LAW') {
        const filtered = nodes.filter((n) => n.category === cat);
        if (filtered.length) nodes = filtered;
      }
      const chain = await searchSchoolGraph(district.id, cat && cat !== 'LAW' ? cat : undefined);
      const parts = nodes.map(
        (n) => `- [${assessKnowledgeNode(n)}] ${n.title}: ${n.summary}${n.law ? ` (${n.law})` : ''}`,
      );
      if (chain && chain.nodes.length) parts.push(`Forms/contacts: ${chainSummary(chain)}`);
      return parts.join('\n') || 'No researched info yet — use web_search to look it up.';
    },
    memory: undefined,
    studentName: String(vars.student ?? ''),
  };

  let working: unknown[] = [...messages];
  let guard = 0;
  let toolRound = 0;
  while (guard < 6) {
    const res = await model.chatWithTools(voiceSystemPrompt(vars), working, LLM_TOOLS, 'auto');
    if (!res) break;
    if (res.calls?.length) {
      // Narrate the research — first a time estimate, then a brief "almost done".
      if (toolRound === 0) {
        turn.onProgress?.('Let me look into that for you — give me about twenty seconds.');
      } else {
        turn.onProgress?.('Still on it — just another moment.');
      }
      toolRound++;
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
    if (res.text) return res.text;
    break;
  }
  return FALLBACK;
}
