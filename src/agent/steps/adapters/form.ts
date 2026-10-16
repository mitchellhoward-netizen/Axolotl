import type { ChannelAdapter } from '../adapter.js';
import type { EmailProvider } from '../../../integrations/email.js';
import type { Step, StepResult, ExecutionContext } from '../types.js';
import { chaseAt, sentUnconfirmed, unconfirmedSummary } from './outcome.js';

/**
 * The reference a form endpoint returned, if its response carries one. A bare 2xx proves the
 * request arrived, not that the school accepted the form, so without a reference we do not
 * call it submitted.
 */
export function referenceFromResponse(body: string): string | undefined {
  let j: unknown;
  try {
    j = JSON.parse(body);
  } catch {
    return undefined;
  }
  if (!j || typeof j !== 'object') return undefined;
  const o = j as Record<string, unknown>;
  for (const k of ['confirmationNumber', 'confirmation_number', 'confirmation', 'reference', 'referenceNumber', 'receipt', 'receiptId']) {
    const v = o[k];
    if ((typeof v === 'string' && v.trim()) || typeof v === 'number') return String(v).trim();
  }
  return undefined;
}

/**
 * Submits a form's fields. No real form endpoint is wired for the demo, so it either POSTs to a
 * configured URL or falls back to emailing the fields to the counterparty.
 *
 * Truth table M5: it reports "submitted" (status `done`) ONLY when the endpoint returned a
 * confirmation/reference. A bare 2xx, or the email fallback, is "sent, not confirmed"
 * (`awaiting_reply`, action status `sent_unconfirmed`), and the parent is told so.
 */
export class FormAdapter implements ChannelAdapter {
  channel = 'form' as const;

  constructor(
    private readonly formEndpoint: string | undefined,
    private readonly email: EmailProvider,
  ) {}

  async execute(step: Step, ctx: ExecutionContext): Promise<StepResult> {
    const p = step.payload;
    if (p.channel !== 'form') throw new Error('FormAdapter received a non-form step');
    const content = JSON.stringify({ formId: p.formId, fields: p.fields });
    const target = step.counterparty.name ?? 'the school';

    try {
      if (this.formEndpoint) {
        const res = await fetch(this.formEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: content,
        });
        if (!res.ok) throw new Error(`Form POST ${res.status}`);
        const reference = referenceFromResponse(await res.text().catch(() => ''));
        if (!reference) {
          return sentUnconfirmed(step, ctx, {
            channel: 'WEB',
            content,
            note: `form endpoint returned ${res.status} with no confirmation`,
            parentSummary: unconfirmedSummary(
              `I sent the form to ${target}`,
              `If you don't hear from ${target} in a day or two, ask them to confirm they have it.`,
            ),
          });
        }
        return {
          status: 'done',
          referenceId: reference,
          parentSummary: `Submitted the form to ${target}. Confirmation: ${reference}.`,
          action: { channel: 'WEB', direction: 'outbound', content, status: 'submitted' },
          followUpAt: chaseAt(step, ctx),
        };
      }

      if (step.counterparty.email) {
        const email = (await ctx.resolveSender?.()) ?? this.email;
        const rec = await email.send({
          to: step.counterparty.email,
          subject: `Form submission: ${p.formId}`,
          body: `Form ${p.formId} fields:\n${Object.entries(p.fields)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\n')}`,
        });
        if (rec.sent === false) throw new Error('email provider did not send');
        // Emailing the details is not an official submission; never call it one.
        return sentUnconfirmed(step, ctx, {
          channel: 'EMAIL',
          content,
          referenceId: rec.id,
          parentSummary:
            `There's no online form wired for this one, so I emailed the details to ${target} instead. ` +
            `That isn't an official submission, and I don't have a confirmation from them yet. I'll check back on it. ` +
            `Watch for a reply from ${target}; if they want their own form, I can fill it.`,
        });
      }

      // Nothing actually happened — say so honestly instead of claiming success.
      return {
        status: 'failed',
        note: 'no form endpoint configured and no contact email on file',
        parentSummary: `I couldn't submit that form — there's no online form for it and no email on file for ${target}. Send me the form link or a contact and I'll take it from there.`,
        action: { channel: 'WEB', direction: 'outbound', content, status: 'failed' },
      };
    } catch (e) {
      return {
        status: 'failed',
        note: String((e as Error)?.message ?? e),
        parentSummary: 'The form submission failed.',
        action: { channel: 'WEB', direction: 'outbound', content, status: 'failed' },
      };
    }
  }
}
