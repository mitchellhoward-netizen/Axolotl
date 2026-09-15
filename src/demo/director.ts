/**
 * Benny demo — the interactive director.
 *
 * One proactive beat (the triage), then the person drives: every message is routed
 * (LLM-first) to a deterministic scene, an approval, or an in-world improv reply. It
 * remembers what actually happened (state), nudges on silence instead of auto-acting
 * (a product selling "nothing happens without your approval" can't book things while
 * you're not looking), and reports claims as they get paid.
 */
import { startDemoServer, type DemoServer } from './server.js';
import { SCENES, refreshClaims, type Pending, type SceneCtx, type SceneId, type SceneResult } from './scenes.js';
import { initialState, dollars, type DemoState } from './state.js';
import { keywordRouter, MENU_TEXT, type RouteResult, type Router } from './router.js';
import type { ConnectorContext } from '../benefits/connectors.js';

export type DemoSender = (text: string) => Promise<void>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface DemoOptions {
  /** ms of silence at an approval gate before a gentle nudge (0 = never). */
  nudgeMs?: number;
  /** ms after a claim is filed before reporting it paid. */
  followUpMs?: number;
  /** ms between bubbles. */
  bubbleDelayMs?: number;
  /** end the session after this much silence (0 = never). */
  idleEndMs?: number;
}

export class BennyDemo {
  private server?: DemoServer;
  private state: DemoState = initialState();
  private pending?: Pending;
  private readonly router: Router;
  private busy = false;
  private ended = false;
  /** Refs already announced as reimbursed (so we never repeat). */
  private readonly reported = new Set<string>();
  private nudgeTimer?: NodeJS.Timeout;
  private idleTimer?: NodeJS.Timeout;
  private readonly opts: Required<DemoOptions>;

  constructor(
    private readonly send: DemoSender,
    router?: Router,
    opts: DemoOptions = {},
  ) {
    this.router = router ?? keywordRouter();
    this.opts = {
      nudgeMs: opts.nudgeMs ?? 30_000,
      // No auto-ping by default: reimbursements are reported on demand ("any update?")
      // so they never interrupt — real money doesn't land in 3 seconds.
      followUpMs: opts.followUpMs ?? 0,
      bubbleDelayMs: opts.bubbleDelayMs ?? 900,
      idleEndMs: opts.idleEndMs ?? 45 * 60_000,
    };
  }

  /** Active until `stop` (or a long idle timeout). */
  get active(): boolean { return !this.ended; }

  private ctx(): ConnectorContext {
    return { owner: 'member-maya', credential: 'demo-credential', signal: new AbortController().signal };
  }

  /** Paced send for scene bubbles, so a scene's lines arrive one at a time. */
  private async sceneSend(text: string): Promise<void> {
    await this.send(text);
    await sleep(this.opts.bubbleDelayMs);
  }

  /** Start the session with the one proactive beat. */
  async start(): Promise<void> {
    if (this.server) { this.server.reset(); }
    else { this.server = await startDemoServer(); }
    this.state = initialState();
    this.pending = undefined;
    this.ended = false;
    await this.runScene('triage');
    this.armIdle();
  }

  async onMessage(text: string): Promise<void> {
    if (this.ended) return;
    this.armIdle();
    if (this.busy) return; // a scene is mid-send; ignore overlap
    this.clearNudge();
    const route = await this.router({ text, state: this.state, pending: this.pending?.label });
    await this.handle(route);
  }

  private async handle(route: RouteResult): Promise<void> {
    switch (route.kind) {
      case 'approve': return this.approve();
      case 'decline': return this.decline();
      case 'address':
        this.state.shippingAddress = route.value;
        await this.send(`Got it — shipping to ${route.value}.` + (this.pending ? ` Reply YES and I'll place it.` : ''));
        return;
      case 'menu': await this.send(MENU_TEXT); return;
      case 'stop': return this.stop();
      case 'scene': return this.runScene(route.scene, route.arg);
      case 'say': await this.send(route.text); return;
    }
  }

  private async runScene(id: SceneId, arg?: string): Promise<void> {
    this.busy = true;
    try {
      const run = SCENES[id] as unknown as (sc: SceneCtx, arg?: string) => Promise<SceneResult>;
      const result = await run({ send: (t) => this.sceneSend(t), state: this.state, ctx: this.ctx() }, arg);
      this.pending = result.pending;
      if (result.followUp) this.scheduleFollowUp(result.followUp);
      if (this.pending) this.armNudge();
    } catch (e) {
      console.error('[demo] scene error:', (e as Error)?.message ?? e);
      await this.send(`Sorry — I hit a snag there. Want to try something else?`);
    } finally {
      this.busy = false;
    }
  }

  private async approve(): Promise<void> {
    const p = this.pending;
    this.pending = undefined;
    this.clearNudge();
    if (!p) { await this.send(`Nothing's waiting on you right now.`); return; }
    this.busy = true;
    try {
      const result = await p.onApprove();
      this.pending = result.pending;
      if (result.followUp) this.scheduleFollowUp(result.followUp);
      if (this.pending) this.armNudge();
    } catch (e) {
      console.error('[demo] approve error:', (e as Error)?.message ?? e);
    } finally {
      this.busy = false;
    }
  }

  private async decline(): Promise<void> {
    const p = this.pending;
    this.pending = undefined;
    this.clearNudge();
    if (!p) { await this.send(`Okay.`); return; }
    if (p.onDecline) await p.onDecline();
  }

  // ── Follow-through: report reimbursements as they actually land ─────────────
  private scheduleFollowUp(items: Array<{ via: 'northstar' | 'bright' | 'ramp'; ref: string }>): void {
    if (!this.opts.followUpMs) return; // on-demand by default
    setTimeout(() => { void this.reportPaid(items); }, this.opts.followUpMs);
  }

  /** Poll the ledger for these refs and announce anything that has now cleared. */
  private async reportPaid(items: Array<{ via: 'northstar' | 'bright' | 'ramp'; ref: string }>): Promise<void> {
    if (this.ended) return;
    await refreshClaims({ send: this.send, state: this.state, ctx: this.ctx() }).catch(() => {});
    const lines: string[] = [];
    for (const item of items) {
      if (item.via === 'bright') continue;
      const claim = this.state.filed.find((f) => f.ref === item.ref);
      if (claim && claim.status === 'paid' && !this.reported.has(item.ref)) {
        this.reported.add(item.ref);
        const verb = item.via === 'ramp' ? 'reimbursed' : 'paid';
        lines.push(`Update — ${claim.description} just got ${verb}: ${dollars(claim.amountCents)}.`);
      }
    }
    if (lines.length) await this.send(lines.join('\n'));
  }

  // ── Nudge on silence (never auto-act) ───────────────────────────────────────
  private armNudge(): void {
    this.clearNudge();
    if (!this.opts.nudgeMs || !this.pending) return;
    const label = this.pending.label;
    this.nudgeTimer = setTimeout(() => {
      this.nudgeTimer = undefined;
      if (this.ended || this.busy || !this.pending) return;
      void this.send(`No rush — just say yes when you want me to handle ${label}.`);
    }, this.opts.nudgeMs);
  }
  private clearNudge(): void {
    if (this.nudgeTimer) { clearTimeout(this.nudgeTimer); this.nudgeTimer = undefined; }
  }

  private armIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (!this.opts.idleEndMs) return;
    this.idleTimer = setTimeout(() => { void this.stop(); }, this.opts.idleEndMs);
  }

  async stop(): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    this.clearNudge();
    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = undefined; }
    await this.send(`Ending the demo — nothing here was real, and nothing was sent anywhere. Text "demo" anytime to run it again.`).catch(() => {});
  }
}
