import type { ChannelAdapter } from '../adapter.js';
import type { Step, StepResult, ExecutionContext } from '../types.js';
import { browserSubmit } from '../../../integrations/browser.js';
import { submitFilledForm, closeSession, skyvernEnabled } from '../../../integrations/skyvern.js';

/**
 * The "submit the form I already filled" hand. Unlike BrowserAdapter (open →
 * fill → submit), this ONLY submits the current page — the fill happened earlier
 * via the browser tools (or Skyvern), in the same session. Consent-gated upstream.
 *
 * If the fill used Skyvern (payload.skyvernSessionId), Phase B submits via Skyvern
 * in the SAME session; otherwise the existing browserSubmit path. submitFilledForm
 * is ONLY ever reached here (the post-YES executor path) — never from the prompt.
 */
export class SubmitAdapter implements ChannelAdapter {
  channel = 'submit' as const;

  async execute(step: Step, _ctx: ExecutionContext): Promise<StepResult> {
    const p = step.payload;
    if (p.channel !== 'submit') throw new Error('SubmitAdapter received a non-submit step');

    // Skyvern Phase B: only here (the consent-gated executor path). Close the session.
    if (skyvernEnabled() && p.skyvernSessionId) {
      const sub = await submitFilledForm(p.skyvernSessionId);
      await closeSession(p.skyvernSessionId);
      if (!sub.ok) {
        return {
          status: 'failed',
          note: sub.status,
          parentSummary: `I filled the form but couldn't submit it (${sub.status}). Here's the link to finish: ${p.url}`,
          action: { channel: 'WEB', direction: 'outbound', content: p.url, status: 'failed' },
        };
      }
      const parentSummary = sub.confirmationScreenshotUrl
        ? `✅ Submitted — here's the confirmation: ${sub.confirmationScreenshotUrl}`
        : '✅ Submitted. Here\u2019s the link to the form: ' + p.url;
      return {
        status: 'done',
        referenceId: 'skyvern-submit-' + Date.now().toString(36),
        parentSummary,
        action: { channel: 'WEB', direction: 'outbound', content: p.url, status: 'submitted' },
      };
    }

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
