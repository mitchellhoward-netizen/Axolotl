import type { FamilyContext } from '../domain/types.js';
import type { CalendarProvider } from '../integrations/calendar.js';
import type { MealsProvider } from '../integrations/meals.js';
import type { Sis } from '../integrations/sis.js';

/** Everything a tool needs to do its job. */
export interface ToolContext extends FamilyContext {
  sis: Sis;
  calendar: CalendarProvider;
  meals: MealsProvider;
  now: Date;
}

export interface ToolResult {
  ok: boolean;
  /** Human-readable confirmation to send back to the parent. */
  summary: string;
  referenceId?: string;
  nextSteps?: string;
  details?: Record<string, unknown>;
}
