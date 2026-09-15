import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Attachment, Message, Space } from 'spectrum-ts';
import { imessage } from '@spectrum-ts/imessage';
import { BennyRuntime, type Inbound } from './runtime.js';
import { BennyStore, BennyVault } from './runtime-store.js';
import { z } from 'zod';
import { PortalAccess } from './portal-access.js';
import { SkyvernBrowserClient, portalPolicySchema } from './skyvern-browser.js';
import { handlePortalHttp } from './portal-http.js';
import { personalModelContext, type LifeTools } from '../agent/personal.js';

/** No provider credentials, fake providers, or auto-migrations are wired here. */
export async function createBennyMessaging(env = process.env): Promise<BennyMessaging | undefined> {
  if (env.BENNY_IMESSAGE_ENABLED !== 'true') return;
  const { BENNY_DATABASE_URL: url, BENNY_ENCRYPTION_KEY: key, BENNY_PUBLIC_ORIGIN: origin } = env;
  const senders = (env.BENNY_PILOT_SENDERS ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!url || !key || !origin || !senders.length) throw new Error('Benny requires an explicit database, encryption key, HTTPS origin and pilot sender allowlist');
  const allowlist = new Set(senders);
  const store = new BennyStore(url, new BennyVault(key));
  try {
    await store.check();
    const runtime = new BennyRuntime(store, [], origin, Date.now, sender => allowlist.has(sender));
    runtime.requireEnrollment = true;
    if (env.BENNY_SKYVERN_ENABLED === 'true') {
      if (!env.SKYVERN_API_KEY || !env.BENNY_SKYVERN_POLICIES) throw new Error('Skyvern access requires an API key and reviewed portal policies');
      let policies;
      try { policies = z.array(portalPolicySchema).min(1).max(20).parse(JSON.parse(env.BENNY_SKYVERN_POLICIES)); }
      catch { throw new Error('Invalid reviewed Skyvern portal policies'); }
      runtime.portalAccess = new PortalAccess(store, new SkyvernBrowserClient(env.SKYVERN_API_KEY), policies, new URL(origin).origin,
        a => runtime.enrolled(a) && allowlist.has(a.sender));
    }
    return new BennyMessaging(runtime, allowlist, env.BENNY_ATTACHMENTS_ENABLED === 'true');
  } catch (e) { await store.close(); throw e; }
}

/** The SDK owns attachment retrieval; never fetch a user-supplied URL. Bounded
 * streaming avoids trusting advertised size and avoids buffering arbitrary files. */
export async function readBennyAttachment(file: Pick<Attachment, 'mimeType' | 'size' | 'stream'>): Promise<Buffer> {
  const max = 5 * 1024 * 1024;
  if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimeType) || (file.size !== undefined && file.size > max)) throw new Error('Unsupported attachment');
  let reader: ReadableStreamDefaultReader<unknown> | undefined;
  let expired = false;
  const chunks: Buffer[] = [];
  let total = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { expired = true; reject(new Error('Attachment timed out')); void reader?.cancel().catch(() => {}); }, 15_000);
  });
  try {
    reader = await Promise.race([file.stream().then(stream => {
      const opened = stream.getReader();
      if (expired) void opened.cancel().catch(() => {});
      return opened;
    }), timeout]);
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (expired) throw new Error('Attachment timed out');
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new Error('Invalid attachment stream');
      total += value.byteLength;
      if (total > max) throw new Error('Attachment too large');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  } finally {
    clearTimeout(timer);
    void reader?.cancel().catch(() => {});
  }
}

export class BennyMessaging {
  constructor(readonly runtime: BennyRuntime, readonly senders: Set<string>, readonly attachmentsEnabled = false) {}
  allowed(sender: string): boolean { return this.senders.has(sender.toLowerCase()); }

  /** One existing agent brain; the channel, never the model, supplies identity. */
  tools(space: Space, message: Message): LifeTools | undefined {
    if (!imessage.is(space) || space.type !== 'dm' || !imessage.is(message) || message.direction === 'outbound') return;
    const sender = message.sender?.id?.toLowerCase();
    if (!sender || !this.allowed(sender) || message.content.type !== 'text') return;
    const input: Inbound = { id: message.id, sender, space: space.id, line: space.phone, text: message.content.text };
    return {
      context: async () => {
        const a = await this.runtime.store.read(this.runtime.owner(sender));
        if (!this.runtime.enrolled(a) || !a) return { enrolled: false, instruction: 'Ask the person to text JOIN PILOT to read the disclosure. No account was created by this tool.' };
        return { enrolled: true, ...personalModelContext(a, this.runtime.now(), input.text), availableConnectors: this.runtime.connectorIds, availableReadPortals: [...(this.runtime.portalAccess?.policies.keys() ?? [])] };
      },
      plan: async raw => await this.runtime.plan(input, raw)
        ? 'Saved one plan for this message. Exact updates are queued in this iMessage conversation; do not repeat or paraphrase approval codes. Nothing was submitted. Read current context for generated IDs.'
        : 'A plan for this message was already saved. Read current context; do not create it again.',
    };
  }

  async receive(space: Space, message: Message): Promise<void> {
    if (message.direction === 'outbound' || !imessage.is(space) || !imessage.is(message)) return;
    // Never disclose private tasks/links into groups, even if a participant is allowed.
    if (space.type !== 'dm') return;
    const sender = message.sender?.id?.toLowerCase();
    if (!sender || !this.allowed(sender)) {
      await space.send('Benny is in a private pilot. This account is not enabled.'); return;
    }
    const input: Inbound = { id: message.id, sender, space: space.id, line: space.phone };
    if (await this.runtime.store.seen(this.runtime.owner(sender), message.id)) return;
    if (message.content.type === 'text') input.text = message.content.text;
    else if (message.content.type === 'attachment') {
      if (!this.attachmentsEnabled) input.notice = 'Document intake is not enabled for this pilot. Nothing was downloaded or stored.';
      else {
        const account = await this.runtime.store.read(this.runtime.owner(sender));
        const selected = account?.tasks.find(t => t.id === account.attachTo && !t.attempts && !['executing', 'cancelled', 'completed', 'denied'].includes(t.status));
        if (!this.runtime.enrolled(account)) input.notice = 'Join the pilot before sending documents. Nothing was downloaded or stored.';
        else if (!selected) input.notice = 'Send ATTACH task before uploading a document. Nothing was downloaded or stored.';
        else {
          try { input.attachment = { task: selected.id, revision: selected.revision,
            mimeType: message.content.mimeType, bytes: await readBennyAttachment(message.content) }; }
          catch { input.notice = 'Could not receive that document. Send a JPEG, PNG or PDF up to 5 MiB again. Nothing was stored.'; }
        }
      }
    } else return; // reactions/typing/read receipts cannot become requests or approvals
    await this.runtime.receive(input);
  }

  /** Plain response, no portal UI or account data, no reflected callback values.
   * State is single use; the connection still needs an iMessage confirmation. */
  async http(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    if (this.runtime.portalAccess && await handlePortalHttp(this.runtime.portalAccess, req, res)) return true;
    const url = new URL(req.url ?? '/', 'https://benny.invalid');
    if (url.pathname !== '/benny/callback') return false;
    const headers = { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", 'x-amp-review-widget': 'off' };
    if (req.method !== 'GET') { res.writeHead(405, { ...headers, Allow: 'GET' }); res.end('Method not allowed.'); return true; }
    try {
      const ok = !url.searchParams.has('error') && await this.runtime.callback(url.searchParams.get('state') ?? '', url.searchParams.get('code') ?? '');
      res.writeHead(ok ? 200 : 400, headers);
      res.end(ok ? 'Return to your private iMessage conversation with Benny to confirm the account. Nothing has been submitted.' : 'Sign-in could not be completed. Ask Benny for a fresh connection link in iMessage.');
    } catch {
      res.writeHead(503, headers); res.end('Sign-in is temporarily unavailable. Return to iMessage for a fresh link.');
    }
    return true;
  }

  start(send: Parameters<BennyRuntime['deliver']>[0]): () => void {
    // Browser/OCR/provider work must not hold every person's reply behind it.
    // Each loop remains non-overlapping; persisted leases arbitrate shared state.
    const schedule = (work: () => Promise<void>) => {
      let working = false;
      const run = async () => {
        if (working) return;
        working = true;
        try { await work(); }
        catch { console.error('[benny] background work unavailable; durable work retained'); }
        finally { working = false; }
      };
      const timer = setInterval(() => { void run(); }, 2000);
      timer.unref(); void run();
      return timer;
    };
    const work = schedule(() => this.runtime.tick());
    const delivery = schedule(() => this.runtime.deliver(async (route, text) => {
      if (!this.allowed(route.sender)) throw new Error('Recipient no longer allowed');
      await send(route, text);
    }));
    return () => { clearInterval(work); clearInterval(delivery); };
  }
}
