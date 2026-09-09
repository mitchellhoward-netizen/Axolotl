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

export interface ModelSpec {
  model: string;
  apiKey?: string;
  baseUrl: string;
}

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

export function frontierModel(): ModelSpec {
  const key = process.env.ANTHROPIC_API_KEY ?? process.env.DEEPSEEK_API_KEY ?? process.env.OPENAI_API_KEY;
  const isAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  return {
    model: process.env.FRONTIER_MODEL ?? process.env.LLM_MODEL ?? process.env.OPENAI_MODEL ?? (isAnthropic ? 'claude-haiku-4-5' : 'deepseek-chat'),
    apiKey: key,
    baseUrl: process.env.LLM_BASE_URL ?? process.env.OPENAI_BASE_URL ?? (isAnthropic ? 'https://api.anthropic.com/v1' : 'https://api.deepseek.com'),
  };
}

/**
 * The parent-facing "fast" tier — the model the parent waits on. Defaults to
 * Anthropic Haiku (lowest initial latency, strong bilingual, drives the tool loop).
 * If no Anthropic key is present it falls back to DeepSeek/OpenAI so the current
 * behavior is preserved and the app still boots without a key.
 */
export function chatModel(): ModelSpec {
  const key = process.env.CHAT_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? process.env.DEEPSEEK_API_KEY ?? process.env.OPENAI_API_KEY;
  const isAnthropic = Boolean(process.env.CHAT_API_KEY ?? process.env.ANTHROPIC_API_KEY);
  return {
    model: process.env.CHAT_MODEL ?? (isAnthropic ? 'claude-haiku-4-5' : 'deepseek-chat'),
    apiKey: key,
    baseUrl:
      process.env.CHAT_BASE_URL ??
      (isAnthropic ? 'https://api.anthropic.com/v1' : 'https://api.deepseek.com'),
  };
}

export function smallModel(): ModelSpec {
  const frontier = frontierModel();
  return {
    model: process.env.SMALL_MODEL ?? frontier.model,
    apiKey: process.env.SMALL_API_KEY ?? frontier.apiKey,
    baseUrl: process.env.SMALL_BASE_URL ?? frontier.baseUrl,
  };
}

/** The model spec a given tool should run against. */
export function modelFor(tool: string): ModelSpec {
  return routeTool(tool) === 'small' ? smallModel() : frontierModel();
}
