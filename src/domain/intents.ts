/**
 * Intents the agent understands. The three "action" intents change state in a
 * school system (schedule, mark absence, meal assistance) and therefore go
 * through the confirmation gate before execution.
 */
export type IntentName =
  | 'onboarding'
  | 'attendance_issue'
  | 'call_me'
  | 'call_school'
  | 'schedule_conference'
  | 'report_absence'
  | 'request_meal_voucher'
  | 'mckinney_vento_bus'
  | 'school_info'
  | 'demo_status'
  | 'case_status'
  | 'list_students'
  | 'help'
  | 'unknown';

export const ACTION_INTENTS = [
  'schedule_conference',
  'report_absence',
  'request_meal_voucher',
] as const;

export type ActionIntent = (typeof ACTION_INTENTS)[number];

export interface IntentResult {
  name: IntentName;
  /** 0..1, best-effort signal from the classifier. */
  confidence: number;
}

export function isActionIntent(name: IntentName): name is ActionIntent {
  return (ACTION_INTENTS as readonly string[]).includes(name);
}
