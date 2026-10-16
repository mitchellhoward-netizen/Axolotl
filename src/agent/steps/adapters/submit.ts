import type { ChannelAdapter } from '../adapter.js';
import type { Step, StepResult, ExecutionContext } from '../types.js';
import { browserSubmit } from '../../../integrations/browser.js';
import { submitFilledForm, closeSession, skyvernEnabled } from '../../../integrations/skyvern.js';
import { sentUnconfirmed, unconfirmedSummary } from './outcome.js';

/**
 * The "submit the form I already filled" hand. Unlike BrowserAdapter (open →
 * fill → submit), this ONLY submits the current page — the fill happened earlier
 * via the browser tools (or Skyvern), in the same session. Consent-gated upstream.
 *
 * If the fill used Skyvern (payload.skyvernSessionId), Phase B submits via Skyvern
 * in the SAME session; otherwise the existing browserSubmit path. submitFilledForm
 * is ONLY ever reached here (the post-YES executor path) — never from the prompt.
 *
 * Done means confirmed: `done`/`submitted` only with the site's own confirmation. A submit
 * we could not confirm is "sent, not confirmed" (`awaiting_reply`, see ./outcome.ts).
 */
export class SubmitAdapter implements ChannelAdapter {
  channel = 'submit' as const;

  async execute(step: Step, ctx: ExecutionContext): Promise<StepResult> {
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
        if (sub.status === 'unconfirmed') {
          // It may have gone through; we did not see the site say so.
          return sentUnconfirmed(step, ctx, {
            channel: 'WEB',
            content: p.url,
            note: `unconfirmed: ${why}`,
            parentSummary: unconfirmedSummary(
              'I filled the form and tried to submit it',
              `Please check here before trying again, so it isn't sent twice: ${p.url}${sub.confirmationScreenshotUrl ? `\nWhat the page showed: ${sub.confirmationScreenshotUrl}` : ''}`,
            ),
          });
        }
        const summary =
          sub.status === 'blocked'
            ? `I filled the form but couldn't submit it — ${why}\nHere's the link to finish it yourself: ${p.url}`
            : `I filled the form, but I could NOT submit it (${why}). Check it here: ${p.url}`;
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
        // The site's own confirmation text, never an id we made up.
        referenceId: sub.confirmation,
        parentSummary,
        action: {
          channel: 'WEB',
          direction: 'outbound',
          content: JSON.stringify({ url: p.url, confirmation: sub.confirmation, proof: sub.confirmationScreenshotUrl }),
          status: 'submitted',
        },
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
    const { responseLink: link, confirmed, reference, confirmationText } = sub.data;
    const content = JSON.stringify({ url: p.url, responseLink: link, confirmed, reference, confirmationText });
    if (!confirmed) {
      return sentUnconfirmed(step, ctx, {
        channel: 'WEB',
        content,
        parentSummary: unconfirmedSummary(
          'I clicked submit',
          `You can check here: ${link || p.url}, or watch for a confirmation email from the school.`,
        ),
      });
    }
    return {
      status: 'done',
      referenceId: reference,
      parentSummary:
        `✅ Done — the site confirmed your response was submitted${reference ? ` (reference ${reference})` : ''}.` +
        (link ? ` Here's the link to it (it shows the answers you submitted): ${link}` : ''),
      action: { channel: 'WEB', direction: 'outbound', content, status: 'submitted' },
    };
  }
}
