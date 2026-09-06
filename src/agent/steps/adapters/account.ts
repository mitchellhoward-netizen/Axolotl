import type { ChannelAdapter } from '../adapter.js';
import type { AuthDriver } from '../../../integrations/auth.js';
import type { Step, StepResult, ExecutionContext } from '../types.js';

type AccountPayload = Extract<Step['payload'], { channel: 'account' }>;

/**
 * The account hand: drive create-account / log-in / verify-code against an
 * auth-gated portal (e.g. Go Kids Inc.'s CareWait). Each step drives ONE phase;
 * the OTP "pause" is expressed as an `awaiting_reply` result — the parent texts
 * us the code and a later `verify` step (same browser session) resumes.
 *
 * Consent: signup/login are `requiresConsent: true` upstream. `verify` is not —
 * the code the parent just sent IS the authorization.
 */
export class AccountAdapter implements ChannelAdapter {
  channel = 'account' as const;

  constructor(private readonly auth: AuthDriver) {}

  async execute(step: Step, ctx: ExecutionContext): Promise<StepResult> {
    const p = step.payload;
    if (p.channel !== 'account') throw new Error('AccountAdapter received a non-account step');
    switch (p.phase) {
      case 'signup':
        return this.signup(p, ctx);
      case 'login':
        return this.login(p, ctx);
      case 'verify':
        return this.verify(p, ctx);
      default:
        return this.result('failed', "I couldn't run that account action.", 'unknown account phase');
    }
  }

  private async signup(p: AccountPayload, ctx: ExecutionContext): Promise<StepResult> {
    try {
      await this.auth.open(p.url);
      await this.auth.clickByText('Apply');
      // Some portals open a login modal and require an extra "Sign Up" tap; the
      // mock (and portals that go straight to the form) may not have it.
      await this.tryClick('Sign Up');
      await this.auth.fill(p.fields ?? []);
      await this.submit(['Create Account', 'Register', 'Sign Up']);
      return this.afterSubmit(ctx, 'creating your account');
    } catch (e) {
      return this.fail(e);
    }
  }

  private async login(p: AccountPayload, ctx: ExecutionContext): Promise<StepResult> {
    try {
      await this.auth.open(p.url);
      await this.auth.clickByText('Returning Families');
      await this.auth.fill([
        { label: 'Email', value: p.identifier ?? '' },
        { label: 'Password', value: p.password ?? '' },
      ]);
      await this.submit(['Log In', 'Sign In', 'Continue']);
      return this.afterSubmit(ctx, 'logging you in');
    } catch (e) {
      return this.fail(e);
    }
  }

  private async verify(p: AccountPayload, ctx: ExecutionContext): Promise<StepResult> {
    try {
      const before = await this.auth.state();
      if (before.isLoggedIn) return this.result('done', 'You are signed in.');
      if (!before.hasCodePrompt) {
        throw new Error(`expected a verification-code prompt, but the page is: ${before.text.slice(0, 120)}`);
      }
      await this.auth.fill([{ label: 'Code', value: p.code ?? '' }]);
      await this.submit(['Verify', 'Confirm', 'Submit']);
      await this.auth.wait(1000);
      const after = await this.auth.state();
      if (after.isLoggedIn) return this.result('done', 'You are signed in.');
      return this.result(
        'awaiting_reply',
        "That code didn't work — can you double-check it and send the right one?",
        'verification code rejected',
      );
    } catch (e) {
      return this.fail(e);
    }
  }

  private async afterSubmit(ctx: ExecutionContext, what: string): Promise<StepResult> {
    await this.auth.wait(1000);
    const s = await this.auth.state();
    if (s.isLoggedIn) return this.result('done', 'You are signed in.');
    if (s.hasCodePrompt) {
      return this.result(
        'awaiting_reply',
        `I'm ${what}. They just sent a verification code to your email or phone — text me that code and I'll finish up.`,
        'awaiting one-time code',
      );
    }
    return this.result('escalated', "Something unexpected happened on the sign-up page — flagging it for a person.", `unexpected page after ${what}: ${s.text.slice(0, 120)}`);
  }

  private async submit(labels: string[]): Promise<void> {
    for (const label of labels) {
      try {
        await this.auth.clickByText(label);
        return;
      } catch {
        /* try next label */
      }
    }
    throw new Error(`no submit button matched: ${labels.join(', ')}`);
  }

  private async tryClick(text: string): Promise<void> {
    try {
      await this.auth.clickByText(text);
    } catch {
      /* optional step */
    }
  }

  private fail(e: unknown): StepResult {
    return this.result('failed', "I hit a snag on that account step — let me try again.", String((e as Error)?.message ?? e));
  }

  private result(status: StepResult['status'], parentSummary: string, note?: string): StepResult {
    return {
      status,
      parentSummary,
      note,
      action: { channel: 'WEB', direction: 'outbound', content: '', status },
    };
  }
}
