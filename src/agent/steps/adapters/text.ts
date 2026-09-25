import type { ChannelAdapter } from '../adapter.js';
import type { Step, StepResult, ExecutionContext } from '../types.js';

/**
 * Sends a short text.
 *
 * - `text_family_contact` steps (grandma, the sitter — people the parent put on their backup
 *   list) go out for real over the messaging line through `ctx.textPerson`, after the parent's
 *   YES. When no line is connected they are never reported as sent: demo mode says it only
 *   logged the text, live mode says it failed.
 * - Any other text step (a school contact's line) is not wired to a real provider yet, so it
 *   logs and returns done, exactly as before.
 */
export class TextAdapter implements ChannelAdapter {
  channel = 'text' as const;

  constructor(private readonly sendSms: (to: string, body: string) => Promise<{ id?: string }> = mockSms) {}

  async execute(step: Step, ctx: ExecutionContext): Promise<StepResult> {
    const p = step.payload;
    if (p.channel !== 'text') throw new Error('TextAdapter received a non-text step');
    const to = step.counterparty.phone;
    const who = step.counterparty.name ?? 'the school';
    if (!to) {
      return {
        status: 'escalated',
        note: 'No phone number for this contact.',
        parentSummary: "I don't have a number for this contact — flagging it for a person.",
        action: { channel: 'SMS', direction: 'outbound', content: p.body, status: 'escalated' },
      };
    }

    const familyContact = step.intent === 'text_family_contact';
    if (familyContact && !ctx.textPerson) {
      if (ctx.mode === 'demo') {
        console.log(`[text][demo] → ${to} (${who})\n${p.body}`);
        return {
          status: 'done',
          parentSummary: `Demo mode: I logged the text to ${who} instead of sending it.`,
          action: { channel: 'SMS', direction: 'outbound', content: p.body, status: 'demo' },
        };
      }
      return {
        status: 'failed',
        note: 'No messaging line connected for texting contacts.',
        parentSummary: `I couldn't text ${who}: texting isn't connected on this line yet, so nothing was sent.`,
        action: { channel: 'SMS', direction: 'outbound', content: p.body, status: 'failed' },
      };
    }

    try {
      const rec = familyContact
        ? await ctx.textPerson!({ phone: to, name: step.counterparty.name }, p.body)
        : await this.sendSms(to, p.body);
      const chase = step.followUp?.chaseAfterMs;
      return {
        status: familyContact ? 'awaiting_reply' : 'done',
        referenceId: rec.id,
        parentSummary: familyContact ? `Sent to ${who}. I'll tell you as soon as they answer.` : `Texted ${who} about this.`,
        action: { channel: 'SMS', direction: 'outbound', content: p.body, status: 'sent' },
        followUpAt: chase ? new Date(Date.now() + (ctx.mode === 'demo' ? chase / ctx.demoClockScale : chase)) : undefined,
      };
    } catch (e) {
      return {
        status: 'failed',
        note: String((e as Error)?.message ?? e),
        parentSummary: familyContact ? `The text to ${who} didn't go through, so nothing was sent. Want me to try again?` : 'The text failed to send.',
        action: { channel: 'SMS', direction: 'outbound', content: p.body, status: 'failed' },
      };
    }
  }
}

async function mockSms(to: string, body: string): Promise<{ id?: string }> {
  console.log(`[text][mock] → ${to}\n${body}`);
  return { id: `sms-${Date.now().toString(36)}` };
}
