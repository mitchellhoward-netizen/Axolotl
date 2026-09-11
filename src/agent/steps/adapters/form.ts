import type { ChannelAdapter } from '../adapter.js';
import type { EmailProvider } from '../../../integrations/email.js';
import type { Step, StepResult, ExecutionContext } from '../types.js';

/**
 * Submits a form's fields. No real form endpoint is wired for the demo, so it
 * either POSTs to a configured URL or falls back to emailing the fields to the
 * counterparty — it always acts, and the result shape is identical to email.
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
      let referenceId: string | undefined;
      let parentSummary: string;
      // Be exact about what actually happened — never report "submitted" when we only
      // emailed the fields, or when nothing was wired up at all.
      if (this.formEndpoint) {
        const res = await fetch(this.formEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: content,
        });
        if (!res.ok) throw new Error(`Form POST ${res.status}`);
        referenceId = `form-${Date.now().toString(36)}`;
        parentSummary = `Submitted the form to ${target}.`;
      } else if (step.counterparty.email) {
        const email = (await ctx.resolveSender?.()) ?? this.email;
        const rec = await email.send({
          to: step.counterparty.email,
          subject: `Form submission: ${p.formId}`,
          body: `Form ${p.formId} fields:\n${Object.entries(p.fields)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\n')}`,
        });
        referenceId = rec.id;
        parentSummary = `There's no online form wired for this one, so I emailed the details to ${target} instead. Want me to chase them for a confirmation?`;
      } else {
        // Nothing actually happened — say so honestly instead of claiming success.
        return {
          status: 'failed',
          note: 'no form endpoint configured and no contact email on file',
          parentSummary: `I couldn't submit that form — there's no online form for it and no email on file for ${target}. Send me the form link or a contact and I'll take it from there.`,
          action: { channel: 'WEB', direction: 'outbound', content, status: 'failed' },
        };
      }

      const chase = step.followUp?.chaseAfterMs;
      return {
        status: 'done',
        referenceId,
        parentSummary,
        action: { channel: 'WEB', direction: 'outbound', content, status: 'submitted' },
        followUpAt: chase ? new Date(Date.now() + (ctx.mode === 'demo' ? chase / ctx.demoClockScale : chase)) : undefined,
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
