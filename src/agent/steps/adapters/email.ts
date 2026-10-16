import type { ChannelAdapter } from '../adapter.js';
import type { EmailAttachment, EmailProvider } from '../../../integrations/email.js';
import type { Step, StepResult, ExecutionContext, EmailStepAttachment } from '../types.js';
import { sentUnconfirmed } from './outcome.js';

/** The step's approved attachments, in the provider's shape. */
export function toProviderAttachments(list: EmailStepAttachment[] | undefined): EmailAttachment[] | undefined {
  if (!list?.length) return undefined;
  return list.map((a) => ({
    filename: a.filename,
    contentType: a.contentType,
    ...(a.contentBase64 ? { contentBase64: a.contentBase64 } : { path: a.path }),
  }));
}

/**
 * Sends an approved email. A plain message is done once the provider accepts it ("Sent the
 * request" is what happened). An email that CARRIES A FORM (attachments) is a submission by
 * email, and the school has not confirmed it, so it is "sent, not confirmed" (see ./outcome.ts).
 */
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
    const attachments = toProviderAttachments(p.attachments);
    const names = (p.attachments ?? []).map((a) => a.filename);
    const content = names.length ? `${p.body}\n[attachments: ${names.join(', ')}]` : p.body;
    const who = step.counterparty.name ?? 'the school';
    try {
      // Prefer the parent's connected email provider (e.g. Gmail send-as-parent);
      // fall back to the default (Resend / mock).
      const email = (await ctx.resolveSender?.()) ?? this.email;
      const rec = await email.send({ to, subject: p.subject, body: p.body, ...(attachments ? { attachments } : {}) });
      if (rec.sent === false) throw new Error('email provider did not send');
      if (names.length) {
        return sentUnconfirmed(step, ctx, {
          channel: 'EMAIL',
          content,
          referenceId: rec.id,
          parentSummary:
            `I emailed ${names.join(', ')} to ${who}, but I don't have a confirmation from them yet, so I can't say it's been received. ` +
            `I'll check back on it. If you want, ask ${who} to reply confirming they have it.`,
        });
      }
      return {
        status: 'done',
        referenceId: rec.id,
        parentSummary: `Sent the request to ${who}.`,
        action: { channel: 'EMAIL', direction: 'outbound', content, status: 'sent' },
        followUpAt: scaledFollowUp(step, ctx),
      };
    } catch (e) {
      return {
        status: 'failed',
        note: String((e as Error)?.message ?? e),
        parentSummary: 'The email failed to send — I’ll try another way.',
        action: { channel: 'EMAIL', direction: 'outbound', content, status: 'failed' },
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
