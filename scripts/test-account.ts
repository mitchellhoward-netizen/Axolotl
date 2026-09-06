import assert from 'node:assert/strict';
import { AccountAdapter } from '../src/agent/steps/adapters/account.js';
import { StepExecutor, ConsentRequiredError } from '../src/agent/steps/executor.js';
import type { AuthDriver, AuthState } from '../src/integrations/auth.js';
import type { ChannelAdapter } from '../src/agent/steps/adapter.js';
import type { Step, StepResult, ExecutionContext, Channel } from '../src/agent/steps/types.js';

/**
 * Phase 1 of Tier 3 — the account hand's state machine, tested offline against a
 * mock auth flow (no browser). Proves: signup → awaiting OTP → verify → done,
 * login → awaiting OTP → verify → done, and the hard consent gate.
 */

const URL = 'mock://carewait/gki';

/** A faithful in-memory simulation of the signup/login/verify screens. */
class MockAuthDriver implements AuthDriver {
  private screen: 'landing' | 'signup' | 'login' | 'code' | 'welcome' = 'landing';
  private enteredCode = '';
  private readonly expectedCode = '123456';
  private url = URL;

  async open(url: string): Promise<void> {
    this.url = url;
    this.screen = 'landing';
  }
  async clickByText(text: string): Promise<void> {
    const t = text.trim().toLowerCase();
    if (t === 'apply' || t === 'sign up') return void (this.screen = 'signup');
    if (t === 'returning families') return void (this.screen = 'login');
    if ((t === 'create account' || t === 'register') && this.screen === 'signup') return void (this.screen = 'code');
    if ((t === 'log in' || t === 'sign in') && this.screen === 'login') return void (this.screen = 'code');
    if ((t === 'verify' || t === 'confirm' || t === 'submit') && this.screen === 'code') {
      if (this.enteredCode === this.expectedCode) this.screen = 'welcome';
      return;
    }
    throw new Error(`no such button "${text}"`);
  }
  async fill(fields: Array<{ label: string; value: string }>): Promise<void> {
    for (const f of fields) if (/code/i.test(f.label)) this.enteredCode = f.value;
  }
  async wait(_ms: number): Promise<void> {}
  async state(): Promise<AuthState> {
    const text: Record<string, string> = {
      landing: 'Welcome to the waitlist self-service tool',
      signup: 'Create your account',
      login: 'Log In',
      code: 'Enter the verification code we sent',
      welcome: 'Welcome back, Jane',
    };
    return { url: this.url, hasCodePrompt: this.screen === 'code', isLoggedIn: this.screen === 'welcome', text: text[this.screen] ?? this.screen };
  }
}

function ctx(): ExecutionContext {
  return {
    mode: 'demo',
    demoClockScale: 1440,
    resolveCounterparty: (r) => ({ role: r }),
    logAction: async () => 'a1',
    scheduleFollowUp: async () => {},
    messageParent: async () => {},
  };
}

function accountStep(phase: Step['payload'] extends infer P ? (P extends { channel: 'account' } ? P['phase'] : never) : never, extra: Partial<Step> = {}): Step {
  const base: Step = {
    id: 'acct-1',
    caseId: 'c1',
    intent: 'account_' + phase,
    channel: 'account',
    counterparty: { role: 'OTHER' },
    payload: { channel: 'account', url: URL, phase } as Step['payload'],
    successCondition: { describe: 'account step', kind: 'manual' },
    requiresConsent: phase !== 'verify',
    status: 'awaiting_consent',
    ...extra,
  };
  return base;
}

async function main(): Promise<void> {
  const adapter = new AccountAdapter(new MockAuthDriver());
  const executor = new StepExecutor({ account: adapter } as unknown as Record<Channel, ChannelAdapter>);
  const c = ctx();

  // 1. Consent gate: consequential step before consent must throw.
  const signup = accountStep('signup', {
    payload: {
      channel: 'account',
      url: URL,
      phase: 'signup',
      fields: [
        { label: 'Full Name', value: 'Jane Parent' },
        { label: 'Email', value: 'jane@example.com' },
        { label: 'Cell', value: '8315551234' },
        { label: 'Password', value: 'secret' },
      ],
    } as Step['payload'],
  });
  await assert.rejects(() => executor.run(signup, c), ConsentRequiredError);
  console.log('✓ consent gate: signup throws before parent YES');

  // 2. Signup → awaiting OTP → verify (wrong then right) → done.
  let r: StepResult = await executor.run({ ...signup, status: 'executing' }, c);
  assert.strictEqual(r.status, 'awaiting_reply', `expected awaiting_reply, got ${r.status}`);
  assert.ok(/code/i.test(r.parentSummary), `parentSummary should ask for code: ${r.parentSummary}`);
  console.log('✓ signup → awaiting_reply ("text me the code")');

  const verify = accountStep('verify', { payload: { channel: 'account', url: URL, phase: 'verify', code: '000000' } as Step['payload'] });
  r = await executor.run({ ...verify, status: 'executing' }, c);
  assert.strictEqual(r.status, 'awaiting_reply', 'wrong code should stay awaiting');
  console.log('✓ verify (wrong code) → awaiting_reply');

  const verifyOk = accountStep('verify', { payload: { channel: 'account', url: URL, phase: 'verify', code: '123456' } as Step['payload'] });
  r = await executor.run({ ...verifyOk, status: 'executing' }, c);
  assert.strictEqual(r.status, 'done', `expected done, got ${r.status}`);
  console.log('✓ verify (right code) → done (logged in)');

  // 3. Returning-families login path.
  const login = accountStep('login', {
    payload: { channel: 'account', url: URL, phase: 'login', identifier: 'jane@example.com', password: 'secret' } as Step['payload'],
  });
  r = await executor.run({ ...login, status: 'executing' }, c);
  assert.strictEqual(r.status, 'awaiting_reply');
  const verify2 = accountStep('verify', { payload: { channel: 'account', url: URL, phase: 'verify', code: '123456' } as Step['payload'] });
  r = await executor.run({ ...verify2, status: 'executing' }, c);
  assert.strictEqual(r.status, 'done');
  console.log('✓ login → awaiting OTP → verify → done');

  console.log('\nAccount hand (Tier 3 Phase 1): PASS');
}

main().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
