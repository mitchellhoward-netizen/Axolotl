import type { ChannelAdapter } from '../adapter.js';
import type { VoiceProvider } from '../../../integrations/voice.js';
import type { Step, StepResult, ExecutionContext } from '../types.js';

/** REQUIRED spoken disclosure at call start (all-party-consent + BIPA floor). */
export const CALL_DISCLOSURE =
  "I'm an automated assistant calling on behalf of a parent. This call is transcribed for the parent's records.";

export class CallAdapter implements ChannelAdapter {
  channel = 'call' as const;

  constructor(private readonly real: VoiceProvider) {}

  async execute(step: Step, ctx: ExecutionContext): Promise<StepResult> {
    const p = step.payload;
    if (p.channel !== 'call') throw new Error('CallAdapter received a non-call step');
    const to = step.counterparty.phone;
    const who = step.counterparty.name ?? 'the school';
    if (!to) {
      return {
        status: 'escalated',
        note: 'No phone number for this contact.',
        parentSummary: "I don't have a number for this contact — flagging it for a person.",
        action: { channel: 'PHONE', direction: 'outbound', content: '', status: 'escalated' },
      };
    }

    // Demo rings the PARENT's line (so they can hear the voice agent); live calls the school contact.
    const toPhone = ctx.mode === 'demo' ? (ctx.parentPhone ?? to) : to;
    const outcome = await this.real.placeCall({
      toPhone,
      brief: p.objective,
      disclosure: CALL_DISCLOSURE,
      mode: ctx.mode,
    });

    const chase = step.followUp?.chaseAfterMs
      ? new Date(Date.now() + (ctx.mode === 'demo' ? step.followUp.chaseAfterMs / ctx.demoClockScale : step.followUp.chaseAfterMs))
      : undefined;

    switch (outcome.disposition) {
      case 'resolved':
        return {
          status: 'done',
          referenceId: outcome.referenceId,
          parentSummary: `I called ${who} and it's handled. ${outcome.transcriptSummary}${outcome.nextStep ? ` Next step: ${outcome.nextStep}` : ''}`,
          action: { channel: 'PHONE', direction: 'outbound', content: outcome.transcriptSummary, status: 'resolved' },
          followUpAt: chase,
        };
      case 'awaiting':
        return {
          status: 'awaiting_reply',
          referenceId: outcome.referenceId,
          parentSummary: `I called ${who}; they'll get back to us. ${outcome.nextStep ?? ''}`.trim(),
          action: { channel: 'PHONE', direction: 'outbound', content: outcome.transcriptSummary, status: 'awaiting' },
          followUpAt: chase,
        };
      case 'needs_parent':
        return {
          status: 'escalated',
          note: 'The school needs something only the parent can answer or authorize.',
          parentSummary: `The school asked something only you can answer/authorize. ${outcome.nextStep ?? "I'll walk you through it."}`,
          action: { channel: 'PHONE', direction: 'outbound', content: outcome.transcriptSummary, status: 'needs_parent' },
        };
      case 'failed':
      default:
        return {
          status: 'escalated',
          note: outcome.nextStep ?? 'Could not reach anyone.',
          parentSummary: `I couldn't reach ${who} — flagging this for a person to handle.`,
          action: { channel: 'PHONE', direction: 'outbound', content: outcome.transcriptSummary, status: 'failed' },
        };
    }
  }
}
