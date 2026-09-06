import type { ChannelAdapter } from '../adapter.js';
import type { Step, StepResult, ExecutionContext } from '../types.js';
import { browserOpen, browserFill, browserAct } from '../../../integrations/browser.js';

/**
 * The browser "hand": drive a real web form via Stagehand. Fills by
 * natural-language label; only submits when `payload.submit` is true. Submission
 * is consent-gated upstream by `StepExecutor` (`requiresConsent` + the
 * `ConsentRequiredError` check), so this adapter never runs a submit the parent
 * hasn't approved.
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

      let referenceId: string | undefined;
      if (p.submit) {
        const sub = await browserAct('click the submit button');
        if (!sub.ok) {
          return {
            status: 'failed',
            note: sub.reason,
            parentSummary: 'I filled the form but could not submit it.',
            action: { channel: 'WEB', direction: 'outbound', content: p.url, status: 'failed' },
          };
        }
        referenceId = `browser-${Date.now().toString(36)}`;
      }

      const chase = step.followUp?.chaseAfterMs;
      return {
        status: 'done',
        referenceId,
        parentSummary: p.submit ? 'Filled and submitted the form.' : 'Filled the form (not submitted).',
        action: {
          channel: 'WEB',
          direction: 'outbound',
          content: JSON.stringify({ url: p.url, fields: p.fields }),
          status: p.submit ? 'submitted' : 'drafted',
        },
        followUpAt: chase ? new Date(Date.now() + (ctx.mode === 'demo' ? chase / ctx.demoClockScale : chase)) : undefined,
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
