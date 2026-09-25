import Anthropic from '@anthropic-ai/sdk';

/**
 * Anthropic Messages API transport for LlmClient.
 *
 * The agent speaks OpenAI chat-completions shapes internally (messages with `tool_calls`,
 * `role: 'tool'` results). Anthropic's OpenAI-compatible endpoint accepts those shapes, but
 * it cannot carry what the current Claude models need: thinking blocks between tool calls,
 * prompt caching, effort, and no sampling parameters (`temperature` is a 400 on the newer
 * models). This file translates at the boundary so every call site keeps its shapes.
 */

type OpenAiToolCall = { id?: string; type?: string; function?: { name?: string; arguments?: string } };
type OpenAiMessage = {
  role: string;
  content?: unknown;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
  /** The assistant turn's raw Anthropic content (thinking + tool_use), carried back verbatim. */
  _anthropic_content?: Anthropic.ContentBlockParam[];
};
type OpenAiTool = { type?: string; function?: { name?: string; description?: string; parameters?: unknown } };

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface NativeOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens?: number;
  effort?: Effort;
}

export interface NativeToolsResult {
  text?: string;
  calls?: Array<{ id: string; name: string; arguments: string }>;
  /** Raw assistant content, to be echoed back on the next request (see `_anthropic_content`). */
  raw?: Anthropic.ContentBlockParam[];
}

/** True for a base URL on Anthropic's own API (not a local mock or another provider). */
export function isAnthropicApi(baseUrl: string): boolean {
  try {
    return /(^|\.)anthropic\.com$/i.test(new URL(baseUrl).hostname);
  } catch {
    return false;
  }
}

/** Haiku 4.5 predates adaptive thinking and effort; it keeps the plain request shape. */
function isLegacyModel(model: string): boolean {
  return /haiku/i.test(model);
}

const clients = new Map<string, Anthropic>();
function clientFor(opts: NativeOptions): Anthropic {
  // The SDK appends /v1/messages itself, so drop a trailing /v1 from the configured base.
  const baseURL = opts.baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '');
  const key = `${baseURL}|${opts.apiKey}`;
  let c = clients.get(key);
  if (!c) {
    c = new Anthropic({ apiKey: opts.apiKey, baseURL });
    clients.set(key, c);
  }
  return c;
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (p && typeof p === 'object' && 'text' in p ? String((p as { text: unknown }).text ?? '') : ''))
      .join('');
  }
  return content == null ? '' : String(content);
}

function parseArgs(raw: string | undefined): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** OpenAI-shaped history -> Anthropic messages. Adjacent same-role turns are merged so tool
 * results always sit in the user turn directly after the assistant's tool_use. */
export function toAnthropicMessages(messages: unknown[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  const push = (role: 'user' | 'assistant', blocks: Anthropic.ContentBlockParam[]) => {
    if (!blocks.length) return;
    const last = out[out.length - 1];
    if (last && last.role === role) {
      const prev = typeof last.content === 'string' ? [{ type: 'text' as const, text: last.content }] : last.content;
      last.content = role === 'user' ? orderToolResultsFirst([...prev, ...blocks]) : [...prev, ...blocks];
    } else {
      out.push({ role, content: blocks });
    }
  };
  for (const m of messages as OpenAiMessage[]) {
    if (!m || typeof m !== 'object') continue;
    if (m.role === 'tool') {
      push('user', [{ type: 'tool_result', tool_use_id: m.tool_call_id ?? '', content: textOf(m.content) || '(empty)' }]);
    } else if (m.role === 'assistant') {
      if (m._anthropic_content?.length) {
        push('assistant', m._anthropic_content);
        continue;
      }
      const blocks: Anthropic.ContentBlockParam[] = [];
      const t = textOf(m.content);
      if (t.trim()) blocks.push({ type: 'text', text: t });
      for (const c of m.tool_calls ?? []) {
        if (!c.function?.name) continue;
        blocks.push({ type: 'tool_use', id: c.id ?? '', name: c.function.name, input: parseArgs(c.function.arguments) });
      }
      push('assistant', blocks);
    } else if (m.role === 'user' || m.role === 'system') {
      // A mid-loop 'system' nudge is sent as user text: that works on every model.
      const t = textOf(m.content);
      if (t.trim()) push('user', [{ type: 'text', text: t }]);
    }
  }
  // The API requires the conversation to open with a user turn.
  if (out[0]?.role === 'assistant') out.unshift({ role: 'user', content: '(conversation continues)' });
  return out;
}

function orderToolResultsFirst(blocks: Anthropic.ContentBlockParam[]): Anthropic.ContentBlockParam[] {
  return [...blocks.filter((b) => b.type === 'tool_result'), ...blocks.filter((b) => b.type !== 'tool_result')];
}

function toAnthropicTools(tools: unknown[]): Anthropic.Tool[] {
  return (tools as OpenAiTool[])
    .filter((t) => t?.function?.name)
    .map((t) => ({
      name: t.function!.name!,
      description: t.function!.description ?? '',
      input_schema: (t.function!.parameters ?? { type: 'object', properties: {} }) as Anthropic.Tool.InputSchema,
    }));
}

function requestShape(opts: NativeOptions, system: string, temperature: number) {
  const legacy = isLegacyModel(opts.model);
  return {
    model: opts.model,
    // Thinking tokens count against max_tokens, so the current models get real room.
    max_tokens: opts.maxTokens ?? (legacy ? 2048 : 16000),
    // The system prompt is large and stable: cache it (tools render before it, and are stable too).
    system: [{ type: 'text' as const, text: system, cache_control: { type: 'ephemeral' as const } }],
    ...(legacy
      ? { temperature }
      : { thinking: { type: 'adaptive' as const }, output_config: { effort: opts.effort ?? 'medium' } }),
  };
}

function readResponse(msg: Anthropic.Message): NativeToolsResult {
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  const calls = msg.content
    .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    .map((b) => ({ id: b.id, name: b.name, arguments: JSON.stringify(b.input ?? {}) }));
  return {
    text: text || undefined,
    calls: calls.length ? calls : undefined,
    raw: msg.content as unknown as Anthropic.ContentBlockParam[],
  };
}

export async function nativeChatWithTools(
  opts: NativeOptions,
  system: string,
  messages: unknown[],
  tools: unknown[],
  toolChoice: 'auto' | 'required' | 'none',
  onToken?: (token: string) => void,
): Promise<NativeToolsResult | null> {
  const client = clientFor(opts);
  const anthropicTools = toAnthropicTools(tools);
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    ...requestShape(opts, system, 0.2),
    messages: toAnthropicMessages(messages),
    ...(anthropicTools.length
      ? {
          tools: anthropicTools,
          // 'required' maps to `any`, which some models reject; `auto` plus the prompt is the
          // portable form, and no current caller relies on forcing.
          tool_choice: toolChoice === 'none' ? { type: 'none' as const } : { type: 'auto' as const },
        }
      : {}),
  };
  try {
    let msg: Anthropic.Message;
    if (onToken) {
      const stream = client.messages.stream(params);
      stream.on('text', (t) => onToken(t));
      msg = await stream.finalMessage();
    } else {
      msg = await client.messages.create(params);
    }
    if (msg.stop_reason === 'refusal') {
      console.warn(`[llm] ${opts.model} refused the turn`);
      return null;
    }
    return readResponse(msg);
  } catch (e) {
    logError(opts.model, e);
    return null;
  }
}

export async function nativeComplete(
  opts: NativeOptions,
  system: string,
  user: string,
  options: { signal?: AbortSignal; private?: boolean } = {},
): Promise<string | null> {
  const client = clientFor(opts);
  try {
    const msg = await client.messages.create(
      { ...requestShape(opts, system, 0), messages: [{ role: 'user', content: user }] },
      { signal: options.signal },
    );
    if (msg.stop_reason === 'refusal') return null;
    return readResponse(msg).text ?? null;
  } catch (e) {
    if (options.private) console.warn('[llm] private completion unavailable');
    else logError(opts.model, e);
    return null;
  }
}

function logError(model: string, e: unknown): void {
  if (e instanceof Anthropic.APIError) {
    console.warn(`[llm] ${model} non-OK ${e.status ?? '-'}: ${String(e.message).slice(0, 200)}`);
  } else {
    console.warn(`[llm] ${model} error: ${(e as Error)?.message ?? e}`);
  }
}
