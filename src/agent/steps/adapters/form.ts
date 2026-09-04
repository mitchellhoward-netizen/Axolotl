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

    try {
      let referenceId: string | undefined;
      if (this.formEndpoint) {
        const res = await fetch(this.formEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: content,
        });
        if (!res.ok) throw new Error(`Form POST ${res.status}`);
        referenceId = `form-${Date.now().toString(36)}`;
      } else if (step.counterparty.email) {
        const rec = await this.email.send({
          to: step.counterparty.email,
          subject: `Form submission: ${p.formId}`,
          body: `Form ${p.formId} fields:\n${Object.entries(p.fields)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\n')}`,
        });
        referenceId = rec.id;
      }

      const chase = step.followUp?.chaseAfterMs;
      return {
        status: 'done',
        referenceId,
        parentSummary: `Submitted the form to ${step.counterparty.name ?? 'the school'}.`,
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
