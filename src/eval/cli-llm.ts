import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { toAnthropicMessages } from '../agent/anthropic-native.js';
import type { Effort } from '../agent/anthropic-native.js';
import { LlmClient, type CompletionOptions, type LlmTransport, type ToolCall, type ToolsResult } from '../agent/llm.js';

/**
 * TEST-ONLY. An `LlmTransport` that serves the agent's two model calls (`chatWithTools`,
 * `complete`) through the `claude` CLI in print mode, for eval runs in a container that has the
 * CLI's credentials but no API key. Production never uses this.
 *
 * How a call is made: one `claude -p` process per model call, with
 *   --system-prompt-file   the agent's own system prompt, with a tool section put first (below)
 *   --tools ""             the CLI's built-in tools off; --strict-mcp-config, no MCP servers
 *   --setting-sources ""   no user/project settings, CLAUDE.md, hooks or skills
 *   --model / --effort     the production model and effort for that client
 *   --output-format json   one result object: the text, and the call's cost
 * run in an empty scratch directory, the prompt on stdin.
 *
 * What is NOT the production path (src/agent/anthropic-native.ts), and so how far the numbers
 * carry:
 * - Tools are not native tool_use. The tool schemas (the same JSON the API gets) are written into
 *   the system prompt, and the model answers in a JSON envelope `{"text", "tool_calls"}` that
 *   this file parses back into `ToolCall`s. A malformed envelope is read as plain text.
 * - History is a text transcript, not message blocks: earlier tool calls and results are
 *   rendered as tagged JSON inside one user turn. Thinking blocks are not carried across tool
 *   calls (production echoes them back via `_anthropic_content`).
 * - The CLI adds its own preamble (about 1K tokens: "a Claude agent" line, its working directory,
 *   the model name, today's date) and decides prompt caching itself. The session identity a CLI
 *   would inherit is stripped first (see childEnv).
 * - `max_tokens` is the CLI's, not production's 16000; streaming is not used.
 * The model, the effort, the system prompt, the tool list, the tool loop, the tools' own code and
 * every guard around them are production's.
 */

/** One call's accounting (no content). */
export interface CallInfo {
  model: string;
  ms: number;
  kind: 'tools' | 'complete';
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
}

export interface CliLlmOptions {
  model: string;
  effort?: Effort;
  /** Per-call timeout. Default 240 s. */
  timeoutMs?: number;
  /** Where each call's cost (USD, as the CLI reports it) goes. */
  onCost?: (usd: number, info: CallInfo) => void;
  /** Called with every tool call the model makes (the harness watches what the agent tries). */
  onToolCall?: (call: ToolCall) => void;
  bin?: string;
}

interface CliResult {
  usage?: { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
  result?: string;
  is_error?: boolean;
  total_cost_usd?: number;
  subtype?: string;
}

let scratch: string | undefined;
function workDir(): string {
  if (!scratch) {
    const base = process.env.CLI_LLM_TMP ?? tmpdir();
    mkdirSync(base, { recursive: true });
    scratch = mkdtempSync(path.join(base, 'cli-llm-'));
    mkdirSync(path.join(scratch, 'home'), { recursive: true });
  }
  return scratch;
}

/**
 * The child CLI's environment. A CLI launched from inside a Claude Code session inherits that
 * session's identity (the account's email, session ids, attribution lines) and would put it in
 * the model's context, where the agent then treats it as the parent's (seen in a smoke run: it
 * saved the operator's email to the family profile). So: no session/identity variables, and an
 * empty HOME (no ~/.claude.json account profile, no user CLAUDE.md or settings). Auth still
 * comes from the container's proxy settings. Nothing here is ever printed.
 */
function childEnv(home: string): NodeJS.ProcessEnv {
  // Production's cache_control is the default 5-minute ephemeral cache; the CLI's default is 1 h
  // (writes at 2x instead of 1.25x). Match production.
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, FORCE_PROMPT_CACHING_5M: '1' };
  for (const k of Object.keys(env)) {
    if (/EMAIL|SESSION_ID|ACCOUNT_UUID|ORGANIZATION_UUID|MESSAGING|TEE_SDK|DIAGNOSTICS|^CLAUDECODE$|CHILD_SESSION|SESSION_ATTENDED/.test(k)) delete env[k];
  }
  return env;
}

const TOOL_PROTOCOL = (tools: unknown[], choice: 'auto' | 'required' | 'none') =>
  `# Tools\n\n` +
  (choice === 'none' || !tools.length
    ? 'No tools are available on this turn. Answer in text.\n\n'
    : `You can call these tools (OpenAI function-calling schemas):\n\n${JSON.stringify(tools)}\n\n`) +
  `# Response format\n\nReply with ONE JSON object and nothing else (no prose before or after, no code fence):\n` +
  `{"text": "<your message to the parent, or empty when you only call tools>", "tool_calls": [{"name": "<tool name>", "arguments": {<arguments matching its schema>}}]}\n` +
  `Omit "tool_calls" (or leave it empty) when you call no tool. When you call tools, their results come back in the next turn as <tool_result> blocks; you then continue. ` +
  `Earlier turns of this conversation are given as a transcript: <tool_call> blocks are calls you made, <tool_result> blocks are what they returned.\n\n` +
  `# Instructions\n\n`;

type Block = { type: string; text?: string; id?: string; name?: string; input?: unknown; tool_use_id?: string; content?: unknown };

function blockText(b: Block): string {
  if (b.type === 'text') return b.text ?? '';
  if (b.type === 'tool_use') return `<tool_call>${JSON.stringify({ id: b.id, name: b.name, arguments: b.input ?? {} })}</tool_call>`;
  if (b.type === 'tool_result') {
    const c = typeof b.content === 'string' ? b.content : JSON.stringify(b.content);
    return `<tool_result id="${b.tool_use_id}">${c}</tool_result>`;
  }
  return '';
}

/** The agent's OpenAI-shaped history as one transcript, through production's own translation. */
export function renderTranscript(messages: unknown[]): string {
  const turns = toAnthropicMessages(messages);
  const out: string[] = [];
  for (const t of turns) {
    const body = typeof t.content === 'string' ? t.content : (t.content as Block[]).map(blockText).filter(Boolean).join('\n');
    out.push(`<${t.role}>\n${body}\n</${t.role}>`);
  }
  return `${out.join('\n\n')}\n\nNow write the assistant's next turn, as the JSON object described in the system prompt.`;
}

/** Escape raw control characters inside JSON strings (models often put real newlines there). */
function escapeControlsInStrings(s: string): string {
  let out = '';
  let inStr = false;
  let esc = false;
  for (const ch of s) {
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      else if (ch === '\n') {
        out += '\\n';
        continue;
      } else if (ch === '\r') {
        out += '\\r';
        continue;
      } else if (ch === '\t') {
        out += '\\t';
        continue;
      }
    } else if (ch === '"') inStr = true;
    out += ch;
  }
  return out;
}

type Envelope = { text?: unknown; tool_calls?: Array<{ name?: unknown; arguments?: unknown }> };

/** The first JSON object in `s` that parses, trying each closing brace from the end. */
function firstObject(s: string): Envelope | undefined {
  const start = s.indexOf('{');
  if (start < 0) return undefined;
  const body = escapeControlsInStrings(s.slice(start));
  for (let end = body.lastIndexOf('}'); end > 0; end = body.lastIndexOf('}', end - 1)) {
    try {
      const v = JSON.parse(body.slice(0, end + 1)) as unknown;
      if (v && typeof v === 'object' && !Array.isArray(v)) return v as Envelope;
    } catch {
      /* try a shorter span */
    }
  }
  return undefined;
}

/**
 * Pull the JSON envelope out of the model's reply. A reply with no envelope is plain text. A
 * reply that starts an envelope but can't be read returns null (the brain retries once, as it
 * does for an API error), so raw JSON never reaches the parent.
 */
export function parseEnvelope(raw: string, tools: unknown[]): ToolsResult | null {
  const known = new Set((tools as Array<{ function?: { name?: string } }>).map((t) => t?.function?.name).filter(Boolean) as string[]);
  const s = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const looksLikeEnvelope = /^\s*\{\s*"(text|tool_calls)"/.test(s) || /"tool_calls"\s*:/.test(s);
  if (s.includes('{')) {
    const v = firstObject(s);
    if (v && ('text' in v || 'tool_calls' in v)) {
      const calls: ToolCall[] = (Array.isArray(v.tool_calls) ? v.tool_calls : [])
        .filter((c) => typeof c?.name === 'string' && known.has(c.name))
        .map((c, i) => ({
          id: `cli_${Date.now().toString(36)}_${i}`,
          name: String(c.name),
          arguments: typeof c.arguments === 'string' ? c.arguments : JSON.stringify(c.arguments ?? {}),
        }));
      const text = typeof v.text === 'string' && v.text.trim() ? v.text : undefined;
      return { text: calls.length ? undefined : text, calls: calls.length ? calls : undefined };
    }
  }
  if (looksLikeEnvelope) return null;
  return { text: raw.trim() || undefined };
}

export class CliTransport implements LlmTransport {
  costUsd = 0;
  calls = 0;
  failures = 0;
  constructor(private readonly o: CliLlmOptions) {}

  private run(system: string, prompt: string, kind: 'tools' | 'complete', signal?: AbortSignal): Promise<string | null> {
    const dir = workDir();
    const sysFile = path.join(dir, `sys-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.txt`);
    writeFileSync(sysFile, system);
    const args = [
      '-p',
      '--model', this.o.model,
      ...(this.o.effort ? ['--effort', this.o.effort] : []),
      '--system-prompt-file', sysFile,
      '--tools', '',
      '--strict-mcp-config',
      '--setting-sources', '',
      '--disable-slash-commands',
      '--no-session-persistence',
      '--output-format', 'json',
    ];
    const t0 = Date.now();
    return new Promise((resolve) => {
      // Never log the environment: the CLI's credentials live there.
      const child = spawn(this.o.bin ?? 'claude', args, { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'], env: childEnv(path.join(dir, 'home')) });
      let out = '';
      let done = false;
      const finish = (v: string | null) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(v);
      };
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        this.failures++;
        finish(null);
      }, this.o.timeoutMs ?? 240_000);
      signal?.addEventListener('abort', () => {
        child.kill('SIGKILL');
        finish(null);
      });
      child.stdout.on('data', (d) => (out += d));
      child.stderr.on('data', () => {});
      child.on('error', () => {
        this.failures++;
        finish(null);
      });
      child.on('close', () => {
        this.calls++;
        let r: CliResult;
        try {
          r = JSON.parse(out) as CliResult;
        } catch {
          this.failures++;
          return finish(null);
        }
        const usd = Number(r.total_cost_usd ?? 0);
        this.costUsd += usd;
        const u = r.usage ?? {};
        this.o.onCost?.(usd, { model: this.o.model, ms: Date.now() - t0, kind, input: u.input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, output: u.output_tokens ?? 0 });
        if (r.is_error || typeof r.result !== 'string') {
          this.failures++;
          return finish(null);
        }
        finish(r.result);
      });
      child.stdin.end(prompt);
    });
  }

  async chatWithTools(system: string, messages: unknown[], tools: unknown[], toolChoice: 'auto' | 'required' | 'none'): Promise<ToolsResult | null> {
    const raw = await this.run(TOOL_PROTOCOL(tools, toolChoice) + system, renderTranscript(messages), 'tools');
    if (raw == null) return null;
    const res = parseEnvelope(raw, toolChoice === 'none' ? [] : tools);
    if (!res) {
      this.failures++;
      return null;
    }
    for (const c of res.calls ?? []) this.o.onToolCall?.(c);
    return res;
  }

  async complete(system: string, user: string, _json: boolean, options: CompletionOptions): Promise<string | null> {
    return this.run(system, user, 'complete', options.signal);
  }
}

/** An LlmClient whose calls go through the CLI. */
export function cliLlmClient(o: CliLlmOptions): { client: LlmClient; transport: CliTransport } {
  const transport = new CliTransport(o);
  return { client: new LlmClient({ baseUrl: 'cli://claude', model: o.model, effort: o.effort, transport }), transport };
}
