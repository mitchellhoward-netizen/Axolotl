import assert from 'node:assert/strict';
import { AccountAdapter } from '../src/agent/steps/adapters/account.js';
import { StepExecutor, ConsentRequiredError } from '../src/agent/steps/executor.js';
import type { AuthDriver, AuthState } from '../src/integrations/auth.js';
import type { ChannelAdapter } from '../src/agent/steps/adapter.js';
import type { Step, StepResult, ExecutionContext, Channel } from '../src/agent/steps/types.js';

/**
 * Phase 1/2 of Tier 3 — the account hand's state machine, tested offline against
 * a mock of the REAL Go Kids flow: Apply → Sign Up → Send Verification Code →
 * (parent relays code) → enter code + terms checkbox → Sign Up → logged in.
 * The mock is SESSIONFUL (like the real portal), so signup and verify must share
 * the same driver instance.
 */

const URL = 'mock://carewait/gki';

class MockAuthDriver implements AuthDriver {
  private screen: 'landing' | 'modal' | 'signup' | 'login' | 'code' | 'welcome' = 'landing';
  private codeSent = false;
  private termsChecked = false;
  private enteredCode = '';
  private readonly expectedCode = '123456';
  private url = URL;

  async open(url: string): Promise<void> {
    this.url = url;
    this.screen = 'landing';
    this.codeSent = false;
    this.termsChecked = false;
    this.enteredCode = '';
  }
  async clickByText(text: string): Promise<void> {
    const t = text.trim().toLowerCase();
    if (t === 'apply' && this.screen === 'landing') return void (this.screen = 'modal');
    if (t === 'sign up' && this.screen === 'modal') return void (this.screen = 'signup');
    if (t === 'returning families' && this.screen === 'landing') return void (this.screen = 'login');
    if (t === 'send verification code' && this.screen === 'signup') {
      this.codeSent = true;
      this.screen = 'code';
      return;
    }
    if ((t === 'log in' || t === 'sign in' || t === 'continue') && this.screen === 'login') {
      this.codeSent = true;
      this.screen = 'code';
      return;
    }
    if (t === 'sign up' && this.screen === 'code') {
      if (this.codeSent && this.enteredCode === this.expectedCode && this.termsChecked) this.screen = 'welcome';
      return;
    }
    throw new Error(`no such button "${text}"`);
  }
  async clickBySelector(selector: string): Promise<void> {
    if (/checkbox/i.test(selector)) this.termsChecked = true;
  }
  async fill(fields: Array<{ label: string; value: string }>): Promise<void> {
    for (const f of fields) if (/code/i.test(f.label)) this.enteredCode = f.value;
  }
  async wait(_ms: number): Promise<void> {}
  async state(): Promise<AuthState> {
    const text: Record<string, string> = {
      landing: 'Welcome to the waitlist self-service tool',
      modal: 'Log In / Sign Up',
      signup: 'Create your account',
      login: 'Log In',
      code: 'Enter the verification code we sent',
      welcome: 'Welcome back',
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

function accountStep(
  phase: 'signup' | 'login' | 'verify',
  extra: { payload?: Partial<Extract<Step['payload'], { channel: 'account' }>>; status?: Step['status'] } = {},
): Step {
  return {
    id: 'acct-' + phase,
    caseId: 'c1',
    intent: 'account_' + phase,
    channel: 'account',
    counterparty: { role: 'OTHER' },
    payload: { channel: 'account', url: URL, phase, ...(extra.payload ?? {}) } as Step['payload'],
    successCondition: { describe: 'account step', kind: 'manual' },
    requiresConsent: phase !== 'verify',
    status: extra.status ?? 'awaiting_consent',
  };
}

async function main(): Promise<void> {
  const adapter = new AccountAdapter(new MockAuthDriver());
  const executor = new StepExecutor({ account: adapter } as unknown as Record<Channel, ChannelAdapter>);
  const c = ctx();

  // 1. Consent gate: consequential signup before YES must throw.
  const signup = accountStep('signup', {
    payload: { identifier: 'jane@example.com', password: 'secret123' },
  });
  await assert.rejects(() => executor.run(signup, c), ConsentRequiredError);
  console.log('✓ consent gate: signup throws before parent YES');

  // 2. Signup → Send Verification Code → awaiting code.
  let r: StepResult = await executor.run({ ...signup, status: 'executing' }, c);
  assert.strictEqual(r.status, 'awaiting_reply', `expected awaiting_reply, got ${r.status}`);
  assert.ok(/code/i.test(r.parentSummary), `parentSummary should ask for the code: ${r.parentSummary}`);
  console.log('✓ signup → awaiting_reply ("text me the code")');

  // 3. Verify wrong code → stays awaiting.
  const verifyWrong = accountStep('verify', { payload: { identifier: 'jane@example.com', password: 'secret123', code: '000000' } });
  r = await executor.run({ ...verifyWrong, status: 'executing' }, c);
  assert.strictEqual(r.status, 'awaiting_reply', 'wrong code should stay awaiting');
  console.log('✓ verify (wrong code) → awaiting_reply');

  // 4. Verify right code → done.
  const verifyOk = accountStep('verify', { payload: { identifier: 'jane@example.com', password: 'secret123', code: '123456' } });
  r = await executor.run({ ...verifyOk, status: 'executing' }, c);
  assert.strictEqual(r.status, 'done', `expected done, got ${r.status}`);
  console.log('✓ verify (right code + terms) → done (logged in)');

  // 5. Login path (returning families).
  const login = accountStep('login', { payload: { identifier: 'jane@example.com', password: 'secret123' } });
  r = await executor.run({ ...login, status: 'executing' }, c);
  assert.strictEqual(r.status, 'awaiting_reply');
  const verify2 = accountStep('verify', { payload: { identifier: 'jane@example.com', password: 'secret123', code: '123456' } });
  r = await executor.run({ ...verify2, status: 'executing' }, c);
  assert.strictEqual(r.status, 'done');
  console.log('✓ login → awaiting OTP → verify → done');

  console.log('\nAccount hand (Tier 3, real-flow): PASS');
}

main().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
