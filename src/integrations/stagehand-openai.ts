import 'dotenv/config';

/**
 * OpenAI **Responses API** backend for Stagehand's custom-LLM `generate` hook.
 * Stagehand's built-in OpenAI provider only knows an older model enum (gpt-5.x),
 * but gpt-6-astra is a Responses-API-only model — so we adapt Stagehand's
 * Anthropic-Messages-shaped `generate` contract to POST /v1/responses.
 *
 * Vision: image content blocks are forwarded as `input_image` parts, so a
 * vision-capable model (gpt-6-astra) can read screenshots.
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

export function createOpenAIResponsesGenerate() {
  return async function generate(req: StagehandGenerateRequest): Promise<StagehandGenerateResponse> {
    const baseUrl = (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com').replace(/\/$/, '');
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not set');
    const model = (process.env.STAGEHAND_MODEL ?? 'openai/gpt-6-astra').replace(/^openai\//, '');

    // Map Stagehand's messages to Responses API `input` items.
    const input: unknown[] = [];
    for (const m of req.messages) {
      const blocks: ContentBlock[] = Array.isArray(m.content) ? m.content : [m.content];
      for (const b of blocks) {
        if (b.type === 'text') {
          input.push({ role: m.role, content: [{ type: m.role === 'assistant' ? 'output_text' : 'input_text', text: b.text }] });
        } else if (b.type === 'image') {
          input.push({ role: 'user', content: [{ type: 'input_image', image_url: `data:${b.mimeType};base64,${b.data}` }] });
        } else if (b.type === 'tool_use') {
          input.push({ type: 'function_call', call_id: b.id, name: b.name, arguments: JSON.stringify(b.input ?? {}) });
        } else {
          // tool_result → function_call_output
          const text = b.content.find((c) => c.type === 'text');
          const out = text && text.type === 'text' ? text.text : '';
          input.push({ type: 'function_call_output', call_id: b.toolUseId, output: out });
        }
      }
    }

    const body: Record<string, unknown> = {
      model,
      ...(req.systemPrompt ? { instructions: req.systemPrompt } : {}),
      input,
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    };

    if (req.tools?.length) {
      body.tools = req.tools.map((t) => ({
        type: 'function',
        name: t.name,
        description: t.description ?? '',
        parameters: t.inputSchema ?? { type: 'object', properties: {} },
      }));
      body.tool_choice = req.toolChoice?.mode ?? 'auto';
    }

    if (req.responseFormat?.type === 'json_schema') {
      body.text = {
        format: { type: 'json_schema', name: req.responseFormat.name, schema: req.responseFormat.schema, strict: true },
      };
    }

    const res = await fetch(`${baseUrl}/v1/responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`OpenAI Responses ${res.status}: ${(await res.text()).slice(0, 300)}`);

    const data = (await res.json()) as {
      output?: Array<{
        type?: string;
        content?: Array<{ type?: string; text?: string }>;
        call_id?: string;
        name?: string;
        arguments?: string;
      }>;
      status?: string;
      usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
    };

    const blocks: ContentBlock[] = [];
    for (const item of data.output ?? []) {
      if (item.type === 'message') {
        for (const c of item.content ?? []) {
          if (c.text) blocks.push({ type: 'text', text: c.text });
        }
      } else if (item.type === 'function_call') {
        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(item.arguments ?? '{}') as Record<string, unknown>;
        } catch {
          /* ignore malformed args */
        }
        blocks.push({ type: 'tool_use', id: item.call_id ?? '', name: item.name ?? '', input: parsed });
      }
    }
    if (blocks.length === 0) blocks.push({ type: 'text', text: '' });

    const content: ContentBlock | ContentBlock[] = blocks.length === 1 ? blocks[0]! : blocks;
    const usage = data.usage
      ? { inputTokens: data.usage.input_tokens ?? 0, outputTokens: data.usage.output_tokens ?? 0, totalTokens: data.usage.total_tokens ?? 0 }
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
      return { role: 'assistant', content, usage, outputFormat: 'json_schema', structuredContent };
    }

    return { role: 'assistant', content, usage, outputFormat: 'text' };
  };
}

/** Ask a vision-capable model (gpt-6-astra) to read a screenshot and reply in text. */
export async function askVision(imageBase64: string, mimeType: string, instruction: string): Promise<string> {
  const baseUrl = (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com').replace(/\/$/, '');
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');
  const model = (process.env.STAGEHAND_MODEL ?? 'openai/gpt-6-astra').replace(/^openai\//, '');
  const res = await fetch(`${baseUrl}/v1/responses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: instruction },
            { type: 'input_image', image_url: `data:${mimeType};base64,${imageBase64}` },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`vision ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }> };
  const text = (data.output ?? [])
    .filter((o) => o.type === 'message')
    .flatMap((o) => (o.content ?? []).map((c) => c.text ?? ''))
    .join('');
  return text || '(no text)';
}
