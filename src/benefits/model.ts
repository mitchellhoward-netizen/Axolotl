/** Shared workflow contracts. This lab only accepts fictional, built-in scenarios. */
export type Workflow = 'fsa' | 'reimbursement' | 'appointment' | 'dependent' | 'refill';
export type Status = 'opportunity' | 'needs_information' | 'ineligible' | 'awaiting_approval' |
  'queued' | 'executing' | 'reconciling' | 'pending' | 'blocked' | 'ready' |
  'completed' | 'denied' | 'cancelled' | 'expired';
export type Fault = 'none' | 'timeout_after_submit' | 'unavailable' | 'denial' | 'missing_document' | 'slot_lost' | 'expired_connection';

export interface Evidence {
  id: string;
  title: string;
  detail: string;
  source: 'fictional_plan' | 'fictional_receipt' | 'fictional_portal' | 'simulated_provider' | 'participant';
  observedAt: string;
}

export interface Facts {
  covered: boolean | null;
  enrolled: boolean;
  authorizedDependent: boolean;
  documentsComplete: boolean;
  serviceAt: string;
  coverageStart: string;
  coverageEnd: string;
  deadline: string;
  balanceCents: number;
  amountCents: number;
  expenseId?: string;
  alreadyReimbursed: boolean;
  appointmentAt?: string;
  slotAvailable: boolean;
  refillsRemaining: number;
  existingRequest: boolean;
  connectionActive: boolean;
}

export interface Proposal {
  revision: number;
  hash: string;
  contextHash: string;
  operation: 'submit_claim' | 'book_appointment' | 'enroll_dependent' | 'request_refill' | 'request_renewal';
  destination: string;
  subject: string;
  amountCents: number;
  disclosures: string[];
  deadline: string;
  appointmentAt?: string;
  expiresAt: string;
  summary: string;
}

export interface Event {
  at: string;
  type: string;
  text: string;
}

export interface BenefitCase {
  id: string;
  scenarioId: string;
  workflow: Workflow;
  title: string;
  need: string;
  person: string;
  status: Status;
  revision: number;
  facts: Facts;
  evidence: Evidence[];
  fault: Fault;
  proposal?: Proposal;
  authorization?: { revision: number; hash: string; at: string };
  nextAction: string;
  owner: 'Benny' | 'You' | 'Provider' | 'Operator' | 'None';
  nextRunAt?: string;
  leaseUntil?: string;
  leaseToken?: string;
  actionKey?: string;
  providerReference?: string;
  attempts: number;
  outcome?: string;
  realizedCents: number;
  events: Event[];
  createdAt: string;
}

export interface Scenario {
  id: string;
  workflow: Workflow;
  title: string;
  description: string;
  expected: string;
  need: string;
  person: string;
  facts: Facts;
  fault: Fault;
  evidence: Evidence[];
}

export interface LabState {
  mode: 'simulation';
  now: string;
  timezone: string;
  scenarios: Array<Pick<Scenario, 'id' | 'workflow' | 'title' | 'description' | 'expected'>>;
  cases: BenefitCase[];
  metrics: { cases: number; completed: number; realizedCents: number; providerSubmissions: number; approvals: number };
}

export const TERMINAL: Status[] = ['ineligible', 'completed', 'denied', 'cancelled', 'expired'];
export const LAB_START = '2026-09-14T16:00:00.000Z';
