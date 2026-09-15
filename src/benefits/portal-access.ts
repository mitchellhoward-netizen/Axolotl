import { randomBytes, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { enqueue, type Account } from './runtime.js';
import { BennyStore } from './runtime-store.js';
import { SkyvernRequestError, portalAccessPolicySchema, type PortalAccessPolicy, type PortalSnapshot, type SkyvernBrowser } from './skyvern-browser.js';

export interface PortalState {
  phase: 'ticket' | 'open' | 'creating' | 'inspect' | 'login' | 'close_login' | 'save_login' |
    'restore' | 'restoring' | 'read' | 'close_read' | 'save_read' | 'idle';
  mode: 'connect' | 'check'; operation: string; policyRevision: string;
  session?: string; profile?: string; profileName?: string; snapshot?: PortalSnapshot;
  lease?: { token: string; until: number }; failures?: number; nextAt?: number;
}
interface PortalLink { kind: 'portal-ticket' | 'portal-view'; provider: string; generation: string }
const token = () => randomBytes(32).toString('base64url');

/** Browser access is not an action connector: it cannot prepare or submit a claim.
 * Connection ownership, grants, read results and durable work live in the SAME
 * encrypted account aggregate as the rest of the person's context. */
export class PortalAccess {
  readonly policies: Map<string, PortalAccessPolicy>;
  constructor(readonly store: BennyStore, readonly browser: SkyvernBrowser, policies: PortalAccessPolicy[],
    readonly origin: string, readonly allowed: (a: Account) => boolean, readonly now = Date.now) {
    const u = new URL(origin);
    if (u.protocol !== 'https:' || u.origin !== origin) throw new Error('Portal origin must be an HTTPS origin');
    this.policies = new Map();
    for (const raw of policies) {
      const p = portalAccessPolicySchema.parse(raw);
      if (this.policies.has(p.id)) throw new Error('Duplicate portal policy');
      this.policies.set(p.id, p);
    }
  }
  get readPortalIds(): string[] { return [...this.policies.values()].filter(p => !('mode' in p)).map(p => p.id); }
  private async link(tx: PoolClient, owner: string, value: string, data: PortalLink, expires: number) {
    const hash = this.store.vault.hash(`link:${value}`);
    await tx.query('INSERT INTO links(token_hash,owner,expires_at,sealed) VALUES($1,$2,$3,$4)',
      [hash, owner, expires, this.store.vault.seal(data, `link:${hash}`)]);
  }
  async begin(a: Account, tx: PoolClient, provider: string): Promise<void> {
    const policy = this.policies.get(provider)!;
    const generation = randomUUID(); const expiresAt = this.now() + 10 * 60_000;
    a.connections[provider] = { generation, status: 'awaiting_login', expiresAt,
      browser: { phase: 'ticket', mode: 'connect', operation: randomUUID(), policyRevision: policy.revision } };
    const ticket = token();
    await this.link(tx, this.store.vault.hash(`imessage:${a.sender}`), ticket, { kind: 'portal-ticket', provider, generation }, expiresAt);
    const next = 'mode' in policy
      ? 'This is sign-in-only setup. Finish sign-in saves the browser session for up to 24 hours, but does not verify your account or enable automated reads, refills or claims. DISCONNECT removes saved access.'
      : 'After sign-in, I’ll close it, restore the saved login and check the account. You must confirm here before further reads. Automated portal writes are not enabled.';
    enqueue(a, `Connect ${provider} with Skyvern using this private 10-minute link:\n${this.origin}/benny/portal#${ticket}\nYou control the remote browser for sign-in and MFA. Do not text credentials. Skyvern hosts this browser and may record page content; this pilot is not HIPAA-validated. ${next}`, this.now(), false,
      { provider, generation, connectionStatus: 'awaiting_login' });
  }
  requestCheck(a: Account, provider: string): void {
    if (!this.readPortalIds.includes(provider)) {
      enqueue(a, 'This portal supports sign-in-only setup. Account verification and automated reads are not configured yet. No read was started.', this.now()); return;
    }
    const c = a.connections[provider]; const b = c?.browser;
    if (a.paused || !c || c.status !== 'active' || !b || b.phase !== 'idle' || this.now() >= c.expiresAt) {
      enqueue(a, 'Read unavailable: connect and confirm this portal first, and START if paused. Another read may still be running.', this.now()); return;
    }
    Object.assign(b, { phase: 'restore', mode: 'check', operation: randomUUID(), failures: 0, nextAt: this.now() });
    delete b.snapshot; delete b.profileName;
    enqueue(a, `Queued a read of the configured ${provider} fields. I will verify the saved account first. No automated form changes or submissions.`, this.now());
  }
  async open(ticket: string): Promise<string | undefined> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(ticket)) return;
    const link = await this.store.consumeLink<PortalLink>(ticket, this.now());
    if (!link || link.data.kind !== 'portal-ticket') return;
    return this.store.change(link.owner, undefined, async (a, tx) => {
      const c = a.connections[link.data.provider];
      if (!this.allowed(a) || a.paused || !c || c.generation !== link.data.generation ||
        this.now() >= c.expiresAt || c.browser?.phase !== 'ticket') return;
      const view = token();
      await this.link(tx, link.owner, view, { ...link.data, kind: 'portal-view' }, c.expiresAt);
      c.browser.phase = 'open'; c.browser.nextAt = this.now();
      return view;
    });
  }
  async view(view: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(view)) return;
    const link = await this.store.readLink<PortalLink>(view, this.now());
    if (!link || link.data.kind !== 'portal-view') return;
    const a = await this.store.read(link.owner); const c = a?.connections[link.data.provider];
    if (!a || !this.allowed(a) || a.paused || !c || c.generation !== link.data.generation || this.now() >= c.expiresAt) return;
    return { owner: link.owner, provider: link.data.provider, connection: c };
  }
  async done(view: string): Promise<boolean> {
    const grant = await this.view(view);
    if (!grant) return false;
    return this.store.change(grant.owner, undefined, a => {
      const c = a.connections[grant.provider];
      if (!this.allowed(a) || a.paused || c?.generation !== grant.connection.generation || c.browser?.phase !== 'login') return false;
      c.browser.phase = 'close_login'; c.browser.nextAt = this.now(); return true;
    });
  }
  cleanup(a: Account, provider: string, b: Partial<PortalState>): void {
    if (!b.session && !b.profile && !b.profileName) return;
    a.revocations.push({ id: randomUUID(), provider, browser: true,
      credential: JSON.stringify({ session: b.session, profile: b.profile, profileName: b.profileName }), nextRunAt: this.now() });
  }
  async revoke(owner: string, credential: string): Promise<void> {
    const b: Partial<PortalState> = JSON.parse(credential);
    const a = await this.store.read(owner);
    const live = Object.values(a?.connections ?? {}).map(c => c.browser).filter(Boolean);
    // A slow former worker must not delete a profile adopted by its replacement.
    if (b.session && !live.some(c => c!.session === b.session)) await this.browser.close(b.session);
    const profile = b.profileName ? await this.browser.findProfile(b.profileName) : undefined;
    for (const id of new Set([b.profile, profile].filter((s): s is string => !!s))) {
      if (!live.some(c => c!.profile === id || (b.profileName && c!.profileName === b.profileName))) await this.browser.remove(id);
    }
  }
  async tick(owner: string): Promise<void> {
    const account = await this.store.read(owner);
    for (const provider of Object.keys(account?.connections ?? {})) await this.work(owner, provider);
  }
  private async work(owner: string, provider: string): Promise<void> {
    const job = await this.store.change(owner, undefined, a => {
      const c = a.connections[provider]; const b = c?.browser;
      if (!c || !b || !this.allowed(a) || a.paused || this.now() >= c.expiresAt ||
        ['ticket', 'login', 'idle'].includes(b.phase) || (b.nextAt ?? 0) > this.now() || (b.lease && b.lease.until > this.now())) return;
      const policy = this.policies.get(provider);
      if (!policy || policy.revision !== b.policyRevision || ['creating', 'restoring'].includes(b.phase)) {
        // Create has no idempotency key: a crash/lost response may leave an orphan
        // browser. Never repeat it blindly; Skyvern's ten-minute timeout bounds it.
        this.fail(a, provider); return;
      }
      const original = structuredClone(b);
      b.lease = { token: randomUUID(), until: this.now() + 60_000 };
      if (b.phase === 'open') b.phase = 'creating';
      if (b.phase === 'restore') b.phase = 'restoring';
      return { generation: c.generation, lease: b.lease.token, browser: original, policy, accountId: c.accountId };
    });
    if (!job) return;
    const b = job.browser; const phase = b.phase;
    try {
      switch (b.phase) {
        case 'open': b.session = (await this.browser.create(job.policy.loginUrl)).id; b.phase = 'inspect'; break;
        case 'inspect':
          if (!await this.browser.viewable(b.session!)) throw new Error('Unsupported live-view transport');
          b.phase = 'login'; break;
        case 'close_login':
          await this.browser.close(b.session!); b.profileName = `benny-${b.operation}-login`; b.phase = 'save_login'; break;
        case 'save_login': {
          const profile = await this.browser.save(b.session!, b.profileName!);
          if (!profile) throw new Error('Archive not ready');
          b.profile = profile; delete b.session; delete b.profileName;
          b.phase = 'mode' in job.policy ? 'idle' : 'restore'; break;
        }
        case 'restore':
          if ('mode' in job.policy) throw new Error('Read not configured');
          b.session = (await this.browser.create(job.policy.readUrl, b.profile)).id; b.phase = 'read'; break;
        case 'read': {
          if ('mode' in job.policy) throw new Error('Read not configured');
          const snapshot = await this.browser.snapshot(b.session!, b.mode === 'connect' ? { ...job.policy, fields: [] } : job.policy, job.accountId);
          if (job.accountId && snapshot.accountId !== job.accountId) throw new Error('Account changed');
          b.snapshot = snapshot; b.phase = 'close_read'; break;
        }
        case 'close_read':
          await this.browser.close(b.session!); b.profileName = `benny-${b.operation}-read`; b.phase = 'save_read'; break;
        case 'save_read': {
          const profile = await this.browser.save(b.session!, b.profileName!);
          if (!profile) throw new Error('Archive not ready');
          b.profile = profile; delete b.session; delete b.profileName; b.phase = 'idle'; break;
        }
        default: return;
      }
      await this.store.change(owner, undefined, a => {
        const c = a.connections[provider]; const current = c?.browser;
        if (!c || !current || c.generation !== job.generation || current.lease?.token !== job.lease) {
          // A replacement lease on the SAME operation owns its shared resources.
          if (c?.generation === job.generation && current?.operation === b.operation) return;
          this.cleanup(a, provider, b); return;
        }
        if (!this.allowed(a) || a.paused || this.now() >= c.expiresAt) {
          this.cleanup(a, provider, b); this.fail(a, provider); return;
        }
        if (current.profile && current.profile !== b.profile) this.cleanup(a, provider, { profile: current.profile });
        c.browser = { ...b, nextAt: this.now(), failures: 0 }; delete c.browser.lease;
        if (b.phase === 'idle') {
          if ('mode' in job.policy) {
            c.status = 'awaiting_verification'; c.expiresAt = this.now() + 86_400_000;
            delete c.code; delete c.confirmBy; delete c.accountId; delete c.accountLabel;
            enqueue(a, `${provider} browser session saved for setup, not verified. Automated reads and actions remain unavailable. Saved access expires within 24 hours; DISCONNECT ${provider} removes it sooner. This does not delete vendor recordings.`, this.now(), false,
              { provider, generation: c.generation, connectionStatus: 'awaiting_verification' });
            return;
          }
          const result = b.snapshot!;
          if (b.mode === 'connect') {
            c.accountId = result.accountId; c.accountLabel = result.accountLabel;
            c.status = 'awaiting_confirmation'; c.code = randomBytes(4).toString('hex').toUpperCase();
            c.confirmBy = this.now() + 10 * 60_000; c.expiresAt = this.now() + 30 * 86_400_000;
            enqueue(a, `Saved and restored ${provider} sign-in. Account: ${result.accountLabel}.\nReply CONNECT ${c.code} within 10 minutes only if this is your intended account. This grants up to 30 days of requested, configured reads, with an account check each time—not submissions. DISCONNECT ${provider} removes Benny’s saved access.`, this.now(), false,
              { provider, generation: c.generation, connectionStatus: 'awaiting_confirmation' });
          } else {
            enqueue(a, `${provider} — observed ${result.observedAt}\n${result.fields.map(f => `${f.label}: ${f.value}`).join('\n')}\nSource: ${result.source}\nThese are the portal’s displayed fields, not independent eligibility or completion verification. No automated changes submitted.`, this.now(), true,
              { provider, generation: c.generation, connectionStatus: 'active' });
          }
        }
      });
    } catch (error) {
      if (['open', 'restore'].includes(phase) && error instanceof SkyvernRequestError && error.session) {
        b.session = error.session;
      }
      await this.store.change(owner, undefined, a => {
        const c = a.connections[provider]; const current = c?.browser;
        if (!c || !current || c.generation !== job.generation || current.lease?.token !== job.lease) {
          if (c?.generation === job.generation && current?.operation === b.operation) return;
          this.cleanup(a, provider, b); return;
        }
        // Only repeat safe close/read/named-profile operations. A failed account
        // check never keeps an apparently active connection or exposes partial data.
        if (['save_login', 'save_read', 'close_login', 'close_read', 'inspect', 'read'].includes(phase) && (current.failures ?? 0) < 5) {
          current.failures = (current.failures ?? 0) + 1;
          current.nextAt = this.now() + 2000 * 2 ** current.failures; delete current.lease;
        } else { this.cleanup(a, provider, b); this.fail(a, provider); }
      });
    }
  }
  private fail(a: Account, provider: string): void {
    const c = a.connections[provider]!;
    this.cleanup(a, provider, c.browser!); delete c.browser; delete c.code; delete c.confirmBy;
    c.status = 'expired'; c.expiresAt = this.now();
    enqueue(a, `${provider} connection/read could not be verified. No automated submission was attempted. Send CONNECT ${provider} for a fresh sign-in. Any untracked browser will expire within its ten-minute session limit.`, this.now());
  }
}
