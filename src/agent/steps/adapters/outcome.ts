import type { Step, StepResult, ExecutionContext } from '../types.js';

/**
 * "Done means confirmed" (docs/VISION.md §8). An adapter reports `status: 'done'` with action
 * status `submitted` ONLY when it observed the institution's confirmation: a reference number,
 * the confirmation page's own words, or a receipt. Anything less — a click, a bare 2xx, an email
 * the provider accepted — is "sent, not confirmed": StepResult status `awaiting_reply` (we are
 * waiting on the other side) and action status `sent_unconfirmed`, with a chase scheduled.
 */
export const SENT_UNCONFIRMED = 'sent_unconfirmed';

/** One day; the chase for an unconfirmed send when the step did not set its own. */
const DEFAULT_CHASE_MS = 24 * 60 * 60 * 1000;

/** When to chase: the step's own follow-up, else a day; scaled in demo mode. */
export function chaseAt(step: Step, ctx: ExecutionContext, fallbackMs?: number): Date | undefined {
  const ms = step.followUp?.chaseAfterMs ?? fallbackMs;
  if (!ms) return undefined;
  return new Date(Date.now() + (ctx.mode === 'demo' ? ms / ctx.demoClockScale : ms));
}

/**
 * The parent's wording for a send we could not confirm. Says what happened, that we have no
 * confirmation, and exactly how they can check — never "submitted" or "done".
 */
export function unconfirmedSummary(what: string, howToCheck: string): string {
  return `${what}, but I didn't get a confirmation yet, so I can't say it went through. I'll check back on it. ${howToCheck}`;
}

/** The uniform "sent, not confirmed" result. */
export function sentUnconfirmed(
  step: Step,
  ctx: ExecutionContext,
  input: {
    channel: StepResult['action']['channel'];
    content: string;
    parentSummary: string;
    referenceId?: string;
    note?: string;
  },
): StepResult {
  return {
    status: 'awaiting_reply',
    referenceId: input.referenceId,
    parentSummary: input.parentSummary,
    note: input.note ?? 'sent, no confirmation observed',
    action: { channel: input.channel, direction: 'outbound', content: input.content, status: SENT_UNCONFIRMED },
    followUpAt: chaseAt(step, ctx, DEFAULT_CHASE_MS),
  };
}
