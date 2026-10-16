/**
 * Small helpers every replica uses: a loopback HTTP server on a random port, an event log, a
 * submissions store, and the parsing a plain HTML form needs (urlencoded bodies, cookies).
 *
 * Replicas are test benches (docs/PATHWAYS.md §4.1). They bind 127.0.0.1 only, like the test
 * world (src/testworld/world.ts), so a fake district form never ends up on a public host.
 */
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { ReplicaEvent, Submission } from '../pathways/types.js';

export interface ReplicaRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  /** The urlencoded body (empty for GET). Repeated names keep every value. */
  form: URLSearchParams;
  cookies: Record<string, string>;
  headers: IncomingMessage['headers'];
}

export interface ReplicaResponse {
  status: number;
  html?: string;
  headers?: Record<string, string | string[]>;
}

export type ReplicaHandler = (req: ReplicaRequest) => ReplicaResponse | Promise<ReplicaResponse>;

/** Bodies above this are refused: a form post is a few KB. */
const MAX_BODY = 256 * 1024;

export async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const b = chunk as Buffer;
    size += b.length;
    if (size > MAX_BODY) throw new Error('body too large');
    chunks.push(b);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** Start a handler on 127.0.0.1 at a random free port. */
export async function startHttp(handler: ReplicaHandler): Promise<{ url: string; close: () => Promise<void> }> {
  const server: Server = createServer((req, res) => {
    void (async () => {
      try {
        const u = new URL(req.url ?? '/', 'http://127.0.0.1');
        const ctype = String(req.headers['content-type'] ?? '');
        const body = req.method === 'POST' ? await readBody(req) : '';
        const form = ctype.includes('application/x-www-form-urlencoded') || (body && !ctype) ? new URLSearchParams(body) : new URLSearchParams();
        const out = await handler({
          method: req.method ?? 'GET',
          path: u.pathname,
          query: u.searchParams,
          form,
          cookies: parseCookies(req.headers.cookie),
          headers: req.headers,
        });
        res.writeHead(out.status, { 'content-type': 'text/html; charset=utf-8', ...(out.headers ?? {}) });
        res.end(out.html ?? '');
      } catch (e) {
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(`replica error: ${(e as Error).message}`);
      }
    })();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('replica: no port');
  return {
    url: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise<void>((r) => {
        server.closeAllConnections?.();
        server.close(() => r());
      }),
  };
}

/** Every event, in order. `scope` ties an event to a session so a submission carries its own. */
export class EventLog {
  private events: Array<ReplicaEvent & { scope: string }> = [];

  constructor(private readonly now: () => string = () => new Date().toISOString()) {}

  push(scope: string, kind: ReplicaEvent['kind'], detail: string, by: ReplicaEvent['by'] = 'agent'): ReplicaEvent {
    const e = { at: this.now(), kind, detail, by, scope };
    this.events.push(e);
    return { at: e.at, kind, detail, by };
  }

  all(): ReplicaEvent[] {
    return this.events.map(({ scope: _s, ...e }) => e);
  }

  forScope(scope: string): ReplicaEvent[] {
    return this.events.filter((e) => e.scope === scope).map(({ scope: _s, ...e }) => e);
  }

  clear(): void {
    this.events = [];
  }
}

/** Submissions by id, in the order they were first stored. Reads return copies. */
export class SubmissionStore {
  private items = new Map<string, Submission>();

  put(id: string, s: Submission): void {
    this.items.set(id, s);
  }

  get(id: string): Submission | undefined {
    return this.items.get(id);
  }

  all(): Submission[] {
    return [...this.items.values()].map((s) => structuredClone(s));
  }

  entries(): Array<[string, Submission]> {
    return [...this.items.entries()].map(([id, s]) => [id, structuredClone(s)]);
  }

  clear(): void {
    this.items.clear();
  }
}

export const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function htmlPage(lang: string, title: string, body: string): string {
  return `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title></head><body>${body}</body></html>`;
}
