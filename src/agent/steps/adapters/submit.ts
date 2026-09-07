import type { ChannelAdapter } from '../adapter.js';
import type { Step, StepResult, ExecutionContext } from '../types.js';
import { browserSubmit } from '../../../integrations/browser.js';

/**
 * The "submit the form I already filled" hand. Unlike BrowserAdapter (open →
 * fill → submit), this ONLY submits the current page — the fill happened earlier
 * via the browser tools, in the same session. Consent-gated upstream.
 */
export class SubmitAdapter implements ChannelAdapter {
  channel = 'submit' as const;

  async execute(step: Step, _ctx: ExecutionContext): Promise<StepResult> {
    const p = step.payload;
    if (p.channel !== 'submit') throw new Error('SubmitAdapter received a non-submit step');
    const sub = await browserSubmit();
    if (!sub.ok) {
      return {
        status: 'failed',
        note: sub.reason,
        parentSummary: "I filled the form but couldn't submit it.",
        action: { channel: 'WEB', direction: 'outbound', content: p.url, status: 'failed' },
      };
    }
    const link = sub.data.responseLink;
    const confirmed = sub.data.confirmed;
    return {
      status: 'done',
      referenceId: 'submit-' + Date.now().toString(36),
      parentSummary: confirmed
        ? `✅ Done — your response was submitted and saved. Here's the link to it (it shows the answers you submitted): ${link}`
        : `I submitted it. Here's the link it gave back: ${link}`,
      action: {
        channel: 'WEB',
        direction: 'outbound',
        content: JSON.stringify({ url: p.url, responseLink: link, confirmed }),
        status: 'submitted',
      },
    };
  }
}
