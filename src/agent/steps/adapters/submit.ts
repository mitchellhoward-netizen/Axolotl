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

    // Skyvern Phase B: navigate + re-fill + submit in ONE post-YES task (only reached
    // from the consent-gated executor path). Close the session if present.
    if (skyvernEnabled() && p.values) {
      const sub = await submitFilledForm({ url: p.url, values: p.values, browserSessionId: p.skyvernSessionId });
      if (p.skyvernSessionId) await closeSession(p.skyvernSessionId, 'submit finished');
      // M12: a run that reported "completed" is NOT a submission. Only the site's own
      // confirmation counts. Never tell a parent their child is enrolled on anything less.
      if (!sub.ok) {
        const why = sub.blocker ?? 'I could not confirm it went through';
        const summary =
          sub.status === 'blocked'
            ? `I filled the form but couldn't submit it — ${why}\nHere's the link to finish it yourself: ${p.url}`
            : `I filled the form and clicked submit, but I could NOT confirm it went through (${why}). ` +
              `I won't tell you it's submitted when I can't see a confirmation. Check it here: ${p.url}`;
        return {
          status: 'failed',
          note: sub.status,
          parentSummary: summary,
          action: { channel: 'WEB', direction: 'outbound', content: p.url, status: 'failed' },
        };
      }
      const parentSummary = sub.confirmation
        ? `✅ Submitted — the site confirmed it. Reference: ${sub.confirmation}${sub.confirmationScreenshotUrl ? `\nProof: ${sub.confirmationScreenshotUrl}` : ''}`
        : `✅ Submitted — I saw the site's confirmation page.${sub.confirmationScreenshotUrl ? ` Here's the proof: ${sub.confirmationScreenshotUrl}` : ''}`;
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
