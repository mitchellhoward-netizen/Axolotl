import type { ActionIntent } from '../domain/intents.js';
import type { CollectedSlots } from '../domain/slots.js';
import type { CaseRecord, FamilyProfile } from '../domain/types.js';
import type { FamilyMemory } from '../domain/memory.js';
import type { Step } from './steps/types.js';
import type { MckinneyState } from './mckinney.js';
import type { OnboardingState } from './onboarding.js';
import type { AttendanceState } from './attendance.js';

export type AgentPhase = 'idle' | 'clarifying' | 'confirming' | 'done';

/** A fully-specified, human-readable action awaiting the parent's YES/NO. */
export interface Plan {
  intent: ActionIntent;
  slots: CollectedSlots;
  summary: string;
}

export interface ConversationState {
  phase: AgentPhase;
  intent?: ActionIntent;
  collected: CollectedSlots;
  pendingPlan?: Plan;
  /** Active McKinney-Vento guided flow (school-bus help for homeless/displaced). */
  mckinney?: MckinneyState;
  /** Active onboarding flow. */
  onboarding?: OnboardingState;
  /** Active absenteeism / barrier-resolution flow. */
  attendance?: AttendanceState;
  /** Family profile gathered during onboarding. */
  profile?: FamilyProfile;
  /** Persistent case record (the "remember" layer). */
  cases?: CaseRecord[];
  /** The family's continuing memory graph (needs/getting/initiatives/issues). */
  memory?: FamilyMemory;
  /** We're awaiting an OTP code to prove the parent owns this number. */
  verify?: { phone: string };
  /** Set by the brain's call tool: the channel should place a phone call. */
  pendingCall?: boolean;
  /** We're waiting for the parent to clarify what the call is about before dialing. */
  awaitingCallClarify?: boolean;
  /** What the family is actively working toward right now (refreshed each turn). */
  activeGoal?: string;
  /** The most recent action we took for the family (call/email/reminder…). */
  lastAction?: string;
  /** Steps the brain has planned but not yet executed — awaiting parent consent. */
  pendingSteps?: Step[];
}

export function initialState(): ConversationState {
  return { phase: 'idle', collected: {} };
}
