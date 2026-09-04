import type { ChannelAdapter } from '../adapter.js';
import type { EmailProvider } from '../../../integrations/email.js';
import type { Step, StepResult, ExecutionContext } from '../types.js';

export class EmailAdapter implements ChannelAdapter {
  channel = 'email' as const;

  constructor(private readonly email: EmailProvider) {}

  async execute(step: Step, ctx: ExecutionContext): Promise<StepResult> {
    const p = step.payload;
    if (p.channel !== 'email') throw new Error('EmailAdapter received a non-email step');
    const to = step.counterparty.email;
    if (!to) {
      return {
        status: 'escalated',
        note: 'No verified email address for this contact.',
        parentSummary: "I don't have an email for this contact yet — flagging it for a person to handle.",
        action: { channel: 'EMAIL', direction: 'outbound', content: p.body, status: 'escalated' },
      };
    }
    try {
      const rec = await this.email.send({ to, subject: p.subject, body: p.body });
      return {
        status: 'done',
        referenceId: rec.id,
        parentSummary: `Sent the request to ${step.counterparty.name ?? 'the school'}.`,
        action: { channel: 'EMAIL', direction: 'outbound', content: p.body, status: 'sent' },
        followUpAt: scaledFollowUp(step, ctx),
      };
    } catch (e) {
      return {
        status: 'failed',
        note: String((e as Error)?.message ?? e),
        parentSummary: 'The email failed to send — I\u2019ll try another way.',
        action: { channel: 'EMAIL', direction: 'outbound', content: p.body, status: 'failed' },
      };
    }
  }
}

function scaledFollowUp(step: Step, ctx: ExecutionContext): Date | undefined {
  const chase = step.followUp?.chaseAfterMs;
  if (!chase) return undefined;
  const scaled = ctx.mode === 'demo' ? chase / ctx.demoClockScale : chase;
  return new Date(Date.now() + scaled);
}
