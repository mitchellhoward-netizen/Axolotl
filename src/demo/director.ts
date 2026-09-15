/**
 * Benny demo — the live iMessage director.
 *
 * Runs the scripted four-beat conversation as real iMessage bubbles: it sends each
 * Benny turn through the provided `send` callback, pauses on every approval point
 * (`YES <code>` / `SEND`) for the person's actual reply, and — if they don't reply —
 * auto-advances so the demo never stalls. Follow-through polls the ledger so the claims
 * visibly flip to "paid".
 *
 * Triggered from `src/index.ts` by texting `demo`. Fictional, offline, deterministic.
 */
import { startDemoServer, type DemoServer } from './server.js';
import { buildDemoScript, resolveFollowThrough, type DemoScript } from './script.js';
import type { ConnectorContext } from '../benefits/connectors.js';

export type DemoSender = (text: string) => Promise<void>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class BennyDemo {
  private server?: DemoServer;
  private script?: DemoScript;
  private playing = false;
  private waiting = false;
  private resolveWait?: () => void;
  private timer?: NodeJS.Timeout;
  private stopped = false;

  constructor(
    private readonly send: DemoSender,
    private readonly autoAdvanceMs = 20000,
    private readonly bubbleDelayMs = 1300,
  ) {}

  get active(): boolean { return this.playing; }

  private ctx(): ConnectorContext {
    return { owner: 'member-maya', credential: 'demo-credential', signal: new AbortController().signal };
  }

  async start(): Promise<void> {
    if (this.playing) return;
    this.stopped = false;
    if (!this.server) this.server = await startDemoServer();
    this.server.reset();
    this.script = await buildDemoScript(this.ctx());
    void this.run();
  }

  private async run(): Promise<void> {
    if (!this.script) return;
    this.playing = true;
    try {
      for (const turn of this.script.turns) {
        if (this.stopped) break;
        for (const line of turn.benny) {
          if (this.stopped) break;
          await this.send(line);
          await sleep(this.bubbleDelayMs);
        }
        if (turn.reply && !this.stopped) await this.waitForReply();
      }
      if (!this.stopped) {
        await this.send(this.script.introFollowThrough);
        const lines = await resolveFollowThrough(this.script.followThrough, this.ctx());
        for (const line of lines) {
          if (this.stopped) break;
          await this.send(line);
          await sleep(700);
        }
        await this.send(this.script.summary);
      }
    } catch (e) {
      console.error('[demo] run error:', (e as Error)?.message ?? e);
    } finally {
      this.playing = false;
      this.waiting = false;
    }
  }

  private waitForReply(): Promise<void> {
    this.waiting = true;
    return new Promise((resolve) => {
      this.resolveWait = resolve;
      this.timer = setTimeout(() => {
        this.timer = undefined;
        this.release();
      }, this.autoAdvanceMs);
    });
  }

  /** Called on every inbound text while the demo is active. Any reply advances a gate. */
  onMessage(text: string): void {
    if (!this.playing) return;
    if (/^\s*(stop|end demo|demo stop|cancel)\s*$/i.test(text)) {
      this.stopped = true;
      this.release();
      return;
    }
    if (this.waiting) this.release();
  }

  private release(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    this.waiting = false;
    this.resolveWait?.();
    this.resolveWait = undefined;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.release();
  }
}
