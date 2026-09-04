import type { Step, StepResult, ExecutionContext } from './types.js';

/** One hand of the agent. Every channel implements this identically. */
export interface ChannelAdapter {
  channel: Step['channel'];
  execute(step: Step, ctx: ExecutionContext): Promise<StepResult>;
}
