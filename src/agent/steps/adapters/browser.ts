import type { ChannelAdapter } from '../adapter.js';
import type { Step, StepResult, ExecutionContext } from '../types.js';
import { browserOpen, browserFill, browserSubmit } from '../../../integrations/browser.js';
import { chaseAt, sentUnconfirmed, unconfirmedSummary } from './outcome.js';

/**
 * The browser "hand": drive a real web form via Stagehand. Fills by
 * natural-language label; only submits when `payload.submit` is true. Submission
 * is consent-gated upstream by `StepExecutor` (`requiresConsent` + the
 * `ConsentRequiredError` check), so this adapter never runs a submit the parent
 * hasn't approved.
 *
 * Honesty rules: it never submits when read-back shows a value in the wrong place, and it
 * reports "submitted" only when the site's confirmation was observed (`sub.data.confirmed`).
 * A click without a confirmation is "sent, not confirmed" (see ./outcome.ts).
 */
export class BrowserAdapter implements ChannelAdapter {
  channel = 'browser' as const;

  async execute(step: Step, ctx: ExecutionContext): Promise<StepResult> {
    const p = step.payload;
    if (p.channel !== 'browser') throw new Error('BrowserAdapter received a non-browser step');

    try {
      const opened = await browserOpen(p.url);
      if (!opened.ok) {
        return {
          status: 'failed',
          note: opened.reason,
          parentSummary: 'I could not open that form in a browser.',
          action: { channel: 'WEB', direction: 'outbound', content: p.url, status: 'failed' },
        };
      }

      const filled = await browserFill(p.fields);
      if (!filled.ok) {
        return {
          status: 'failed',
          note: filled.reason,
          parentSummary: 'I could not fill the form.',
          action: { channel: 'WEB', direction: 'outbound', content: p.url, status: 'failed' },
        };
      }

      // Read-back found values that are not in their own fields: submitting now would send
      // something the parent did not approve. Stop and say which ones.
      const misses = filled.data.mismatches ?? [];
      const missLabels = misses.map((m) => m.label).join(', ');
      if (p.submit && misses.length) {
        return {
          status: 'failed',
          note: `read-back mismatch: ${missLabels}`,
          parentSummary:
            `I filled the form, but ${misses.length === 1 ? 'one field doesn’t' : `${misses.length} fields don’t`} ` +
            `show what you approved (${missLabels}), so I didn’t submit it. You can finish it here: ${p.url}`,
          action: { channel: 'WEB', direction: 'outbound', content: JSON.stringify({ url: p.url, mismatches: misses }), status: 'failed' },
        };
      }

      if (!p.submit) {
        return {
          status: 'done',
          parentSummary: misses.length
            ? `Filled the form (not submitted). These didn’t take: ${missLabels}.`
            : 'Filled the form (not submitted).',
          action: { channel: 'WEB', direction: 'outbound', content: JSON.stringify({ url: p.url, fields: p.fields }), status: 'drafted' },
          followUpAt: chaseAt(step, ctx),
        };
      }

      const sub = await browserSubmit();
      if (!sub.ok) {
        return {
          status: 'failed',
          note: sub.reason,
          parentSummary: 'I filled the form but could not submit it.',
          action: { channel: 'WEB', direction: 'outbound', content: p.url, status: 'failed' },
        };
      }
      const { responseLink, confirmed, reference, confirmationText } = sub.data;
      const content = JSON.stringify({ url: p.url, fields: p.fields, responseLink, confirmed, reference, confirmationText });
      // Done means confirmed: only the page's own confirmation (or a printed reference) counts.
      if (!confirmed) {
        return sentUnconfirmed(step, ctx, {
          channel: 'WEB',
          content,
          parentSummary: unconfirmedSummary(
            'I filled the form and clicked submit',
            `You can check here: ${responseLink || p.url}, or watch for a confirmation email from the school.`,
          ),
        });
      }
      return {
        status: 'done',
        // A reference only when the page printed one; never a made-up id.
        referenceId: reference,
        parentSummary:
          `Submitted, and the site confirmed it${reference ? ` (reference ${reference})` : ''}.` +
          (responseLink ? `\nHere's your response: ${responseLink}` : ''),
        action: { channel: 'WEB', direction: 'outbound', content, status: 'submitted' },
        followUpAt: chaseAt(step, ctx),
      };
    } catch (e) {
      return {
        status: 'failed',
        note: String((e as Error)?.message ?? e),
        parentSummary: 'The browser action failed.',
        action: { channel: 'WEB', direction: 'outbound', content: p.url, status: 'failed' },
      };
    }
  }
}
