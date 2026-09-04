import type { ChannelAdapter } from './adapter.js';
import type { Channel, Step, StepResult, ExecutionContext } from './types.js';

export class ConsentRequiredError extends Error {
  constructor(public readonly stepId: string) {
    super(`Step ${stepId} requires explicit parent consent before execution.`);
    this.name = 'ConsentRequiredError';
  }
}

/**
 * The ONLY place consent is enforced and the ONLY place channels are dispatched.
 * Adding a channel later = a new ChannelAdapter in the registry; nothing else changes.
 */
export class StepExecutor {
  constructor(private readonly adapters: Record<Channel, ChannelAdapter>) {}

  async run(step: Step, ctx: ExecutionContext): Promise<StepResult> {
    // 1. HARD consent gate — code-level, not a prompt instruction.
    if (step.requiresConsent && step.status !== 'executing') {
      throw new ConsentRequiredError(step.id);
    }

    // 2. Dispatch to the adapter for this channel. The rest of the system
    //    does not know or care which channel ran.
    const adapter = this.adapters[step.channel];
    if (!adapter) throw new Error(`No adapter registered for channel "${step.channel}"`);
    const result = await adapter.execute(step, ctx);

    // 3. Persist the Action.
    await ctx.logAction(step.caseId, result.action);

    // 4. Schedule follow-up / verify if the channel asked for it.
    if (result.followUpAt) {
      await ctx.scheduleFollowUp(step.caseId, result.followUpAt, false);
    }
    if (step.followUp?.verifyAfterMs && result.status === 'done') {
      const at = new Date(
        Date.now() + (ctx.mode === 'demo' ? step.followUp.verifyAfterMs / ctx.demoClockScale : step.followUp.verifyAfterMs),
      );
      await ctx.scheduleFollowUp(step.caseId, at, true, step.followUp.verifyPrompt);
    }

    return result;
  }
}
