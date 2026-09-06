import 'dotenv/config';

/**
 * DeepSeek backend for Stagehand's custom-LLM `generate` hook. Stagehand's
 * `model.generate` contract is Anthropic-Messages-API shaped; DeepSeek is
 * OpenAI-compatible, so this adapts the request (system prompt, messages, tools,
 * JSON-schema response format) to DeepSeek's `/chat/completions` and maps the
 * reply back to the `{ role, content }` message shape.
 *
 * DeepSeek `deepseek-chat` is text-only: image blocks are forwarded as
 * `image_url` parts so a vision-capable model (if configured) works, but a
 * screenshot sent to the text-only model will fail — surfaced as a clear error.
 */

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; toolUseId: string; content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>; isError?: boolean };

interface StagehandMessage {
  role: 'user' | 'assistant';
  content: ContentBlock | ContentBlock[];
}

interface StagehandTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

interface StagehandGenerateRequest {
  messages: StagehandMessage[];
  systemPrompt?: string;
  temperature?: number;
  stopSequences?: string[];
  tools?: StagehandTool[];
  toolChoice?: { mode?: 'required' | 'auto' | 'none' };
  responseFormat?: { type: 'text' } | { type: 'json_schema'; name: string; description?: string; schema: unknown };
}

interface StagehandGenerateResponse {
  role: 'assistant';
  content: ContentBlock | ContentBlock[];
  stopReason?: string;
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number; reasoningTokens?: number; cachedInputTokens?: number };
  outputFormat: 'text' | 'json_schema';
  structuredContent?: unknown;
}

type OpenAIUserPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
type OpenAIUserContent = string | OpenAIUserPart[];

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null | OpenAIUserContent;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

export function createDeepseekGenerate() {
  return async function generate(req: StagehandGenerateRequest): Promise<StagehandGenerateResponse> {
    const baseUrl = (process.env.STAGEHAND_DEEPSEEK_BASE_URL ?? process.env.LLM_BASE_URL ?? 'https://api.deepseek.com').replace(/\/$/, '');
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');
    const model = process.env.STAGEHAND_MODEL ?? process.env.LLM_MODEL ?? 'deepseek-chat';

    const messages: OpenAIMessage[] = [];
    if (req.systemPrompt) {
      const schemaHint =
        req.responseFormat?.type === 'json_schema'
          ? `\n\nRespond with a JSON object that matches this schema exactly:\n${JSON.stringify(req.responseFormat.schema)}`
          : '';
      messages.push({ role: 'system', content: req.systemPrompt + schemaHint });
    }

    for (const m of req.messages) {
      const contentBlocks: ContentBlock[] = Array.isArray(m.content) ? m.content : [m.content];
      const textParts: OpenAIUserPart[] = [];
      const toolCalls: OpenAIMessage['tool_calls'] = [];
      const toolResults: Array<{ id: string; text: string }> = [];
      for (const b of contentBlocks) {
        if (b.type === 'text') textParts.push({ type: 'text', text: b.text });
        else if (b.type === 'image') textParts.push({ type: 'image_url', image_url: { url: `data:${b.mimeType};base64,${b.data}` } });
        else if (b.type === 'tool_use') toolCalls.push({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input) } });
        else {
          const t = b.content.find((c) => c.type === 'text');
          toolResults.push({ id: b.toolUseId, text: t && t.type === 'text' ? t.text : '' });
        }
      }

      if (m.role === 'assistant' && toolCalls.length) {
        messages.push({ role: 'assistant', content: textParts.length ? textParts.map((p) => (p.type === 'text' ? p.text : '')).join('') : null, tool_calls: toolCalls });
      } else if (toolResults.length) {
        for (const tr of toolResults) messages.push({ role: 'tool', tool_call_id: tr.id, content: tr.text });
        if (textParts.length) messages.push({ role: m.role, content: textParts });
      } else {
        messages.push({ role: m.role, content: textParts });
      }
    }

    const tools = req.tools?.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description ?? '', parameters: t.inputSchema ?? { type: 'object', properties: {} } },
    }));

    const body: Record<string, unknown> = {
      model,
      messages,
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(req.stopSequences?.length ? { stop: req.stopSequences } : {}),
    };
    if (tools?.length) {
      body.tools = tools;
      body.tool_choice = req.toolChoice?.mode ?? 'auto';
    }
    if (req.responseFormat?.type === 'json_schema') {
      body.response_format = { type: 'json_object' };
    }

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${(await res.text()).slice(0, 300)}`);

    const data = (await res.json()) as {
      choices?: Array<{
        finish_reason?: string | null;
        message?: { content?: string | null; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }> };
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    const choice = data.choices?.[0];
    const msg = choice?.message;
    const blocks: ContentBlock[] = [];
    if (msg?.content) blocks.push({ type: 'text', text: msg.content });
    for (const tc of msg?.tool_calls ?? []) {
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(tc.function?.arguments ?? '{}') as Record<string, unknown>;
      } catch {
        /* ignore malformed args */
      }
      blocks.push({ type: 'tool_use', id: tc.id ?? '', name: tc.function?.name ?? '', input });
    }
    if (blocks.length === 0) blocks.push({ type: 'text', text: '' });

    const content = blocks.length === 1 ? blocks[0]! : blocks;
    const stopReason = choice?.finish_reason ?? undefined;
    const usage = data.usage
      ? { inputTokens: data.usage.prompt_tokens ?? 0, outputTokens: data.usage.completion_tokens ?? 0, totalTokens: data.usage.total_tokens ?? 0 }
      : undefined;

    if (req.responseFormat?.type === 'json_schema') {
      let structuredContent: unknown = {};
      const raw = blocks
        .filter((b) => b.type === 'text')
        .map((b) => (b as { type: 'text'; text: string }).text)
        .join('');
      try {
        structuredContent = JSON.parse(raw);
      } catch {
        /* leave {} */
      }
      return { role: 'assistant', content, stopReason, usage, outputFormat: 'json_schema', structuredContent };
    }

    return { role: 'assistant', content, stopReason, usage, outputFormat: 'text' };
  };
}
