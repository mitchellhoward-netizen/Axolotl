import type { CallBrief, Mode } from '../agent/steps/types.js';
import { createRetellClient, type RetellClient } from './phones.js';

export interface CallOutcome {
  disposition: 'resolved' | 'awaiting' | 'needs_parent' | 'failed';
  referenceId?: string;
  transcriptSummary: string;
  nextStep?: string;
}

export interface VoiceProvider {
  placeCall(input: {
    toPhone: string;
    brief: CallBrief;
    disclosure: string;
    mode: Mode;
  }): Promise<CallOutcome>;
}

/** Test/CI provider: returns a scripted, sensible outcome for any brief. */
export class MockVoiceProvider implements VoiceProvider {
  async placeCall(input: { toPhone: string; brief: CallBrief; disclosure: string; mode: Mode }): Promise<CallOutcome> {
    const b = input.brief;
    return {
      disposition: 'resolved',
      referenceId: 'mock-call-' + Date.now().toString(36),
      transcriptSummary: `Called ${b.school} for ${b.parentName}. Stated the goal (${b.goal}); the office confirmed they'll handle it.`,
      nextStep: `${b.school} will follow up with next steps.`,
    };
  }
}

/** Realtime voice agent (Retell) behind the same interface. */
export class RealtimeVoiceProvider implements VoiceProvider {
  constructor(private readonly client: RetellClient) {}

  async placeCall(input: { toPhone: string; brief: CallBrief; disclosure: string; mode: Mode }): Promise<CallOutcome> {
    const b = input.brief;
    const vars: Record<string, unknown> = {
      parent_name: b.parentName,
      student: b.student,
      grade: b.grade,
      school: b.school,
      district: b.district,
      issue: b.goal,
      goal: b.goal,
      what_we_know: b.whatWeKnow,
      disclosure: input.disclosure,
      cannot_commit: (b.cannotCommit ?? []).join('; '),
    };
    try {
      const { call_id } = await this.client.createCall(input.toPhone, 'step-call', vars);
      if (!call_id) return { disposition: 'failed', transcriptSummary: 'Could not place the call.' };
      return {
        disposition: 'awaiting',
        referenceId: call_id,
        transcriptSummary: 'Placed the call; the voice agent is pursuing the goal.',
        nextStep: 'Await the call transcript to confirm the outcome.',
      };
    } catch (e) {
      return {
        disposition: 'failed',
        transcriptSummary: 'The call failed to connect.',
        nextStep: 'Try again or email the school instead.',
      };
    }
  }
}

/** Choose the voice provider from env, exactly like createEmailProvider. */
export function createVoiceProvider(env: NodeJS.ProcessEnv = process.env): VoiceProvider {
  const retell = createRetellClient(env);
  if (retell) return new RealtimeVoiceProvider(retell);
  return new MockVoiceProvider();
}
