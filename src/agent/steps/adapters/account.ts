import type { ChannelAdapter } from '../adapter.js';
import type { AuthDriver } from '../../../integrations/auth.js';
import type { Step, StepResult, ExecutionContext } from '../types.js';

type AccountPayload = Extract<Step['payload'], { channel: 'account' }>;

/**
 * The account hand: drive create-account / log-in / verify-code against an
 * auth-gated portal (Go Kids Inc.'s CareWait). Each step drives ONE phase.
 *
 * Real flow (verified): Apply → Sign Up → fill Email/Cell (+ Password/Confirm)
 * → "Send Verification Code" → the code lands with the PARENT → parent relays it
 * → verify phase fills code + password and ticks the Terms-of-Use checkbox →
 * "Sign Up" → logged in. The code is SESSION-BOUND: signup and verify must run in
 * the same browser session, which is why verify does NOT re-open the page.
 *
 * Parent stays in the loop the whole way: signup/login are consent-gated
 * upstream (`requiresConsent`), and the OTP relay is a parent check-in by design.
 * `verify` is not consent-gated — the code the parent just sent IS authorization.
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
      const identifier = this.identifier(p);
      await this.auth.open(p.url);
      await this.auth.clickByText('Apply');
      await this.tryClick('Sign Up');
      await this.auth.fill([
        { label: 'Email / Cell', value: identifier },
        { label: 'Password', value: p.password ?? '' },
        { label: 'Confirm Password', value: p.password ?? '' },
      ]);
      await this.auth.clickByText('Send Verification Code');
      await this.auth.wait(4000);
      const s = await this.auth.state();
      if (s.hasCodePrompt || /resend|seconds until|verification code/i.test(s.text)) {
        return this.result(
          'awaiting_reply',
          "I'm creating the account. They just sent a verification code to your email or phone — text me that code and I'll finish up.",
          'awaiting one-time code',
        );
      }
      if (s.isLoggedIn) return this.result('done', 'You are signed in.');
      return this.result('escalated', "Something unexpected happened on the sign-up page — flagging it for a person.", `unexpected after send code: ${s.text.slice(0, 120)}`);
    } catch (e) {
      return this.fail(e);
    }
  }

  private async login(p: AccountPayload, ctx: ExecutionContext): Promise<StepResult> {
    try {
      await this.auth.open(p.url);
      await this.auth.clickByText('Returning Families');
      await this.auth.fill([
        { label: 'Email / Cell', value: this.identifier(p) },
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
      // Same session: the signup form is still up. Fill the code + credentials.
      await this.auth.fill([
        { label: 'Email / Cell', value: this.identifier(p) },
        { label: 'Verification Code', value: p.code ?? '' },
        { label: 'Password', value: p.password ?? '' },
        { label: 'Confirm Password', value: p.password ?? '' },
      ]);
      await this.tryClickBySelector('input[type="checkbox"]'); // terms of use (optional on some portals)
      await this.auth.wait(1200);
      await this.auth.clickByText('Sign Up');
      await this.auth.wait(8000);
      const after = await this.auth.state();
      if (after.isLoggedIn) return this.result('done', 'You are signed in.');
      return this.result(
        'awaiting_reply',
        "That code didn't go through — it may have expired. Say \"resend\" and I'll send a fresh one.",
        'verification code rejected',
      );
    } catch (e) {
      return this.fail(e);
    }
  }

  /** The login identifier: explicit field, or the Email/Cell-ish entry in `fields`. */
  private identifier(p: AccountPayload): string {
    if (p.identifier?.trim()) return p.identifier.trim();
    return p.fields?.find((f) => /email|cell|phone|logon|user/i.test(f.label))?.value ?? '';
  }

  private async afterSubmit(ctx: ExecutionContext, what: string): Promise<StepResult> {
    await this.auth.wait(1500);
    const s = await this.auth.state();
    if (s.isLoggedIn) return this.result('done', 'You are signed in.');
    if (s.hasCodePrompt || /resend|seconds until|verification code/i.test(s.text)) {
      return this.result(
        'awaiting_reply',
        `I'm ${what}. They just sent a verification code to your email or phone — text me that code and I'll finish up.`,
        'awaiting one-time code',
      );
    }
    return this.result('escalated', "Something unexpected happened on the login page — flagging it for a person.", `unexpected after ${what}: ${s.text.slice(0, 120)}`);
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

  private async tryClickBySelector(selector: string): Promise<void> {
    try {
      await this.auth.clickBySelector(selector);
    } catch {
      /* optional step */
    }
  }

  private fail(e: unknown): StepResult {
    return this.result('failed', 'I hit a snag on that account step — let me try again.', String((e as Error)?.message ?? e));
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
