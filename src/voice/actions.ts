import type { Step } from '../agent/steps/types.js';

/**
 * The voice→action bridge. When the parent approves an action on the call ("yes,
 * send the email"), the voice server calls `executeVoiceSteps`, which runs the
 * steps through the agent's executor (email/call) and texts the parent the
 * result — so the voice agent both ACTS and follows up by text.
 */

type ActionHandler = (conversationId: string, steps: Step[]) => Promise<string>;

let handler: ActionHandler | null = null;

/** Register the process-wide handler (wired in index.ts, which owns the agent). */
export function setVoiceActionHandler(fn: ActionHandler): void {
  handler = fn;
}

/** Execute the parent-approved steps; return the spoken confirmation. */
export async function executeVoiceSteps(conversationId: string, steps: Step[]): Promise<string> {
  if (!handler) {
    return "I'll take care of that and follow up by text.";
  }
  try {
    return await handler(conversationId, steps);
  } catch (e) {
    console.error('[voice-action] handler error:', (e as Error)?.message ?? e);
    return "I hit a snag — let me text you and we'll sort it out.";
  }
}
