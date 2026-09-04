import type { ChannelAdapter } from '../adapter.js';
import type { Step, StepResult, ExecutionContext } from '../types.js';

/** Sends a short text to the school contact's line. SMS-to-school isn't wired to a
 *  real provider yet, so it logs and returns done — the shape is identical to email. */
export class TextAdapter implements ChannelAdapter {
  channel = 'text' as const;

  constructor(private readonly sendSms: (to: string, body: string) => Promise<{ id?: string }> = mockSms) {}

  async execute(step: Step, ctx: ExecutionContext): Promise<StepResult> {
    const p = step.payload;
    if (p.channel !== 'text') throw new Error('TextAdapter received a non-text step');
    const to = step.counterparty.phone;
    if (!to) {
      return {
        status: 'escalated',
        note: 'No phone number for this contact.',
        parentSummary: "I don't have a number for this contact — flagging it for a person.",
        action: { channel: 'SMS', direction: 'outbound', content: p.body, status: 'escalated' },
      };
    }
    try {
      const rec = await this.sendSms(to, p.body);
      const chase = step.followUp?.chaseAfterMs;
      return {
        status: 'done',
        referenceId: rec.id,
        parentSummary: `Texted ${step.counterparty.name ?? 'the school'} about this.`,
        action: { channel: 'SMS', direction: 'outbound', content: p.body, status: 'sent' },
        followUpAt: chase ? new Date(Date.now() + (ctx.mode === 'demo' ? chase / ctx.demoClockScale : chase)) : undefined,
      };
    } catch (e) {
      return {
        status: 'failed',
        note: String((e as Error)?.message ?? e),
        parentSummary: 'The text failed to send.',
        action: { channel: 'SMS', direction: 'outbound', content: p.body, status: 'failed' },
      };
    }
  }
}

async function mockSms(to: string, body: string): Promise<{ id?: string }> {
  console.log(`[text][mock] → ${to}\n${body}`);
  return { id: `sms-${Date.now().toString(36)}` };
}
