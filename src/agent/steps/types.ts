/**
 * The Step spine: a channel-agnostic atom of work. A `Step` describes WHAT to do
 * and WHICH hand does it (`channel`); the executor dispatches to the matching
 * adapter. "Call the school" is structurally identical to "email the liaison."
 */

export type Channel = 'form' | 'email' | 'text' | 'call';

export type Mode = 'demo' | 'live';

/** Who a step acts toward (a school/district contact). */
export interface Counterparty {
  role:
    | 'PRINCIPAL'
    | 'ATTENDANCE'
    | 'HOMELESS_LIAISON'
    | 'BUS_PASSES'
    | 'COUNSELOR'
    | 'SPED_COORDINATOR'
    | 'NURSE'
    | 'DISTRICT'
    | 'OTHER';
  name?: string;
  email?: string;
  phone?: string;
}

/** Channel-specific content, discriminated on `channel`. */
export type StepPayload =
  | { channel: 'email'; subject: string; body: string }
  | { channel: 'text'; body: string }
  | { channel: 'form'; formId: string; fields: Record<string, string> }
  | { channel: 'call'; objective: CallBrief };

/** The brief handed to the voice adapter. */
export interface CallBrief {
  parentName: string;
  student: string;
  grade: string;
  school: string;
  district: string;
  /** One-sentence purpose, e.g. "Request McKinney-Vento transport to the school of origin." */
  goal: string;
  /** Facts the agent may state, already parent-authorized. */
  whatWeKnow: string;
  /** Things the agent MUST NOT commit to without checking back with the parent. */
  cannotCommit: string[];
}

/** How we know the step is resolved. */
export interface SuccessCondition {
  /** Plain description for logging/parent messaging. */
  describe: string;
  /** Optional machine check the scheduler can run against inbound Actions. */
  kind: 'reference_received' | 'reply_received' | 'confirmation_parsed' | 'manual';
}

/** When/how to chase + verify after execution. */
export interface FollowUpSpec {
  /** Delay before chasing if still AWAITING. LIVE = real; DEMO = divided by demoClockScale. */
  chaseAfterMs: number;
  /** Delay before the verify question ("did the bus come?"). */
  verifyAfterMs?: number;
  /** The verify question to text the parent. */
  verifyPrompt?: string;
}

export type StepStatus =
  | 'planned'
  | 'awaiting_consent'
  | 'executing'
  | 'awaiting_reply'
  | 'done'
  | 'failed'
  | 'escalated';

export interface Step {
  id: string;
  caseId: string;
  /** Stable, machine vocabulary, e.g. 'request_mckinney_transport'. */
  intent: string;
  channel: Channel;
  counterparty: Counterparty;
  payload: StepPayload;
  successCondition: SuccessCondition;
  /** Consequential steps (send/call/submit) require an explicit parent YES. */
  requiresConsent: boolean;
  followUp?: FollowUpSpec;
  status: StepStatus;
}

/** The uniform result of running ANY channel. */
export interface StepResult {
  status: 'done' | 'awaiting_reply' | 'failed' | 'escalated';
  /** Reference id when the channel produced one (email id, call id, form receipt). */
  referenceId?: string;
  /** Plain-language, PARENT-FACING summary. No statutes. */
  parentSummary: string;
  /** What to persist as an Action row. */
  action: {
    channel: 'EMAIL' | 'PHONE' | 'SMS' | 'WEB' | 'IN_PERSON';
    direction: 'outbound' | 'inbound';
    content: string;
    status?: string;
  };
  /** If set, scheduler creates a FOLLOW_UP Task at this time. */
  followUpAt?: Date;
  /** Human-readable reason when status is 'escalated' or 'failed'. */
  note?: string;
}

export interface ExecutionContext {
  mode: Mode;
  /** e.g. 1440 → "3 school days" collapses to ~3 min in demo. */
  demoClockScale: number;
  /** The parent's line — the demo voice call rings THIS number so the parent can hear it. */
  parentPhone?: string;
  /** Resolve the real vs sandbox counterparty for the given role. */
  resolveCounterparty: (role: Counterparty['role'], mode: Mode) => Counterparty;
  /** Persist an Action; returns its id. */
  logAction: (caseId: string, a: StepResult['action']) => Promise<string>;
  /** Schedule a follow-up Task. */
  scheduleFollowUp: (caseId: string, at: Date, verify: boolean, prompt?: string) => Promise<void>;
  /** Send a message to the parent over the messaging line (Spectrum). */
  messageParent: (text: string) => Promise<void>;
}
