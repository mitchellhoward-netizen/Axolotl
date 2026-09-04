import type { FamilyProfile } from '../../domain/types.js';
import { barrierByCategory } from '../../knowledge/barriers.js';
import type { Step, Counterparty, Channel, CallBrief } from './types.js';

const SCHOOL_DAY_MS = 24 * 60 * 60 * 1000;

/** Given a diagnosed need + family context, produce the concrete steps to resolve it. */
export function planSteps(input: {
  intent: string;
  family: FamilyProfile;
  student: string;
  counterparty: Counterparty;
  preferredChannel?: Channel;
  /** Extra slot data (dates, reasons, program, topic) for form/system intents. */
  details?: Record<string, unknown>;
}): Step[] {
  switch (input.intent) {
    case 'request_mckinney_transport':
    case 'mckinney_vento_bus':
      return mckinneyTransportSteps(input);
    case 'report_absence':
      return [formStep(input, 'absence', 'Report an absence', {
        student: input.student,
        date: String(input.details?.date ?? ''),
        reason: String(input.details?.reason ?? 'Not specified'),
        fullDay: input.details?.fullDay === false ? 'no' : 'yes',
      })];
    case 'request_meal_voucher':
      return [formStep(input, 'meal', 'Meal assistance', {
        student: input.student,
        program: String(input.details?.program ?? 'meal_voucher'),
      })];
    case 'schedule_conference':
      return [formStep(input, 'conference', 'Schedule a conference', {
        student: input.student,
        topic: String(input.details?.topic ?? ''),
        when: String(input.details?.when ?? 'next week'),
      })];
    default:
      return genericOutreachSteps(input);
  }
}

/** A form/system step (submits fields to a formId) — the "submit" hand. */
function formStep(input: { family: FamilyProfile; student: string; counterparty: Counterparty; details?: Record<string, unknown> }, formId: string, title: string, fields: Record<string, string>): Step {
  const student = input.student || 'your child';
  return {
    id: `${formId}-form`,
    caseId: formId,
    intent: formId,
    channel: 'form',
    counterparty: input.counterparty,
    payload: { channel: 'form', formId, fields },
    successCondition: { describe: title, kind: 'confirmation_parsed' },
    requiresConsent: true,
    followUp: { chaseAfterMs: 2 * SCHOOL_DAY_MS, verifyAfterMs: 4 * SCHOOL_DAY_MS, verifyPrompt: `Is ${student}'s ${title.toLowerCase()} sorted?` },
    status: 'planned',
  };
}

/** The reference intent: call to request + email to leave a paper trail — same shape. */
function mckinneyTransportSteps(input: {
  family: FamilyProfile;
  student: string;
  counterparty: Counterparty;
}): Step[] {
  const b = barrierByCategory('transportation')!;
  const student = input.student || 'your child';
  const grade = input.family.children?.[0]?.grade ?? '';
  const emailBody = b.draft.replaceAll('{child}', student);

  const brief: CallBrief = {
    parentName: input.family.parentName ?? 'the parent',
    student,
    grade,
    school: input.family.school ?? 'the school',
    district: input.family.district ?? '',
    goal: 'Request transportation to the school of origin so the student can get to school reliably.',
    whatWeKnow: [
      input.family.challenges?.length ? `challenges: ${input.family.challenges.join(', ')}` : '',
      input.family.notes ?? '',
    ]
      .filter(Boolean)
      .join(' '),
    cannotCommit: ['transportation routes or schedules', 'any fees or payments'],
  };

  const followUp = {
    chaseAfterMs: 3 * SCHOOL_DAY_MS,
    verifyAfterMs: 5 * SCHOOL_DAY_MS,
    verifyPrompt: `Did the bus come for ${student}?`,
  };

  return [
    {
      id: 'request_mckinney_transport-call',
      caseId: 'mckinney_transport',
      intent: 'request_mckinney_transport',
      channel: 'call',
      counterparty: input.counterparty,
      payload: { channel: 'call', objective: brief },
      successCondition: { describe: 'Transportation requested by phone', kind: 'manual' },
      requiresConsent: true,
      followUp,
      status: 'planned',
    },
    {
      id: 'request_mckinney_transport-email',
      caseId: 'mckinney_transport',
      intent: 'request_mckinney_transport',
      channel: 'email',
      counterparty: input.counterparty,
      payload: { channel: 'email', subject: `Transportation request for ${student}`, body: emailBody },
      successCondition: { describe: 'Transportation requested by email', kind: 'reference_received' },
      requiresConsent: true,
      followUp,
      status: 'planned',
    },
  ];
}

/** Fallback: a single email outreach from the barrier for the given category. */
function genericOutreachSteps(input: {
  intent: string;
  family: FamilyProfile;
  student: string;
  counterparty: Counterparty;
}): Step[] {
  const b = barrierByCategory(input.intent) ?? barrierByCategory('attendance')!;
  const student = input.student || 'your child';
  return [
    {
      id: `${input.intent}-email`,
      caseId: input.intent,
      intent: input.intent,
      channel: 'email',
      counterparty: input.counterparty,
      payload: { channel: 'email', subject: b.title, body: b.draft.replaceAll('{child}', student) },
      successCondition: { describe: b.title, kind: 'reference_received' },
      requiresConsent: true,
      followUp: { chaseAfterMs: 3 * SCHOOL_DAY_MS, verifyAfterMs: 5 * SCHOOL_DAY_MS, verifyPrompt: `Is ${student}'s ${b.category} sorted?` },
      status: 'planned',
    },
  ];
}
