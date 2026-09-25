/**
 * Model routing — cheap vs frontier, as DATA not code. Three tiers:
 *   frontier      — planning, hypothesis, verification, explanation (the Brain)
 *   small         — query reformulation, extraction, classification, routine browser act
 *   deterministic — pure code (no model: dedup, budgets, TTL, stuck, graph traversal)
 *
 * The routing table lives here so it can be updated as the frontier moves without
 * touching call sites.
 */

export type ModelTier = 'frontier' | 'small' | 'deterministic';

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ModelSpec {
  model: string;
  apiKey?: string;
  baseUrl: string;
  /** Thinking depth on current Claude models; ignored by other providers and by Haiku. */
  effort?: Effort;
}

const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];
function effortFrom(v: string | undefined, fallback: Effort): Effort {
  return EFFORTS.includes(v as Effort) ? (v as Effort) : fallback;
}

/**
 * The Claude model that drives the agent when nothing is configured. It decides which tool
 * to call (research, fill a form, draft an email) and writes the values the browser types,
 * so it is the model whose mistakes the parent actually sees. Haiku was the old default and
 * was the weak link in tool selection; override with FRONTIER_MODEL / CHAT_MODEL.
 */
export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5';
/** The cheap tier: research query reformulation, extraction, classification. */
export const DEFAULT_CLAUDE_SMALL_MODEL = 'claude-haiku-4-5';

/** Tool-name → tier. Unlisted tools default to `frontier`. */
export const MODEL_ROUTING: Record<string, ModelTier> = {
  // pure code — these run in `runTool` with no model call
  web_search: 'deterministic',
  web_fetch: 'deterministic',
  extract_pdf: 'deterministic',
  now: 'deterministic',
  list_open_cases: 'deterministic',
  list_skills: 'deterministic',
  get_school_info: 'deterministic',
  get_law: 'deterministic',
  diagnose_barrier: 'deterministic',
  get_remedy: 'deterministic',
  search_school_graph: 'deterministic',
  // actuation — a small specialized model is enough, never the frontier brain
  browser_open: 'small',
  browser_observe: 'small',
  browser_act: 'small',
  browser_extract: 'small',
  browser_fill: 'small',
};

export function routeTool(tool: string): ModelTier {
  return MODEL_ROUTING[tool] ?? 'frontier';
}

/**
 * Whether conversations may be routed to a non-Anthropic provider when the Anthropic key
 * is missing. OFF by default, and must be opted into explicitly.
 *
 * Why this is a switch and not a fallback: silently rerouting parent messages to a
 * different provider changes where a family's data is processed, under different retention
 * terms, in a different jurisdiction — with no code change, no deploy, and until now no log
 * line. A missing key must degrade to the deterministic flows, not to a quiet data export.
 */
export function foreignModelFallbackAllowed(): boolean {
  return process.env.ALLOW_FOREIGN_MODEL_FALLBACK === 'true';
}

/** A spec with no key, so LlmClient reports `enabled === false` and the agent falls back
 * to its deterministic flows instead of sending anything to another provider. */
const DISABLED: ModelSpec = { model: 'disabled', apiKey: undefined, baseUrl: '' };

export function frontierModel(): ModelSpec {
  const isAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  if (isAnthropic) {
    // A CONSISTENT Anthropic provider — never mix the Anthropic key with a stale
    // DeepSeek model/base (LLM_MODEL=deepseek-v4-pro etc. cause 401s and silently
    // break research -> 'district type unknown').
    return {
      model: process.env.FRONTIER_MODEL ?? DEFAULT_CLAUDE_MODEL,
      apiKey: process.env.ANTHROPIC_API_KEY,
      baseUrl: process.env.FRONTIER_BASE_URL ?? 'https://api.anthropic.com/v1',
      effort: effortFrom(process.env.FRONTIER_EFFORT, 'high'),
    };
  }
  if (!foreignModelFallbackAllowed()) {
    console.warn(
      '[models] ANTHROPIC_API_KEY is not set — running WITHOUT a language model. Parent messages ' +
        'will NOT be sent to another provider. Set ALLOW_FOREIGN_MODEL_FALLBACK=true only if that is a decision you have made.',
    );
    return DISABLED;
  }
  console.warn('[models] ANTHROPIC_API_KEY missing and ALLOW_FOREIGN_MODEL_FALLBACK=true — using the foreign provider');
  const key = process.env.DEEPSEEK_API_KEY ?? process.env.OPENAI_API_KEY;
  return {
    model: process.env.FRONTIER_MODEL ?? process.env.LLM_MODEL ?? process.env.OPENAI_MODEL ?? 'deepseek-chat',
    apiKey: key,
    baseUrl: process.env.LLM_BASE_URL ?? process.env.OPENAI_BASE_URL ?? 'https://api.deepseek.com',
  };
}

/**
 * The parent-facing tier — the model the parent waits on, and the one that drives the tool
 * loop. Defaults to the same Claude model as the frontier at medium effort: a wrong tool
 * choice (researching when the parent asked for a form to be filled) costs the parent far
 * more than a few seconds of latency. CHAT_EFFORT=low trades depth for speed.
 * If no Anthropic key is present it falls back to DeepSeek/OpenAI so the current
 * behavior is preserved and the app still boots without a key.
 */
export function chatModel(): ModelSpec {
  const isAnthropic = Boolean(process.env.CHAT_API_KEY ?? process.env.ANTHROPIC_API_KEY);
  if (isAnthropic) {
    return {
      model: process.env.CHAT_MODEL ?? DEFAULT_CLAUDE_MODEL,
      apiKey: process.env.CHAT_API_KEY ?? process.env.ANTHROPIC_API_KEY,
      baseUrl: process.env.CHAT_BASE_URL ?? 'https://api.anthropic.com/v1',
      effort: effortFrom(process.env.CHAT_EFFORT, 'medium'),
    };
  }
  // No Anthropic key -> behave exactly like the legacy parent path (DeepSeek/OpenAI via LLM_*).
  return frontierModel();
}

export function smallModel(): ModelSpec {
  const frontier = frontierModel();
  const onClaude = Boolean(process.env.ANTHROPIC_API_KEY) && !process.env.SMALL_BASE_URL;
  return {
    model: process.env.SMALL_MODEL ?? (onClaude ? DEFAULT_CLAUDE_SMALL_MODEL : frontier.model),
    apiKey: process.env.SMALL_API_KEY ?? frontier.apiKey,
    baseUrl: process.env.SMALL_BASE_URL ?? frontier.baseUrl,
    effort: effortFrom(process.env.SMALL_EFFORT, 'low'),
  };
}

/** The model spec a given tool should run against. */
export function modelFor(tool: string): ModelSpec {
  return routeTool(tool) === 'small' ? smallModel() : frontierModel();
}
