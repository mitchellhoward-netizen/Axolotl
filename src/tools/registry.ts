import type { ActionIntent } from '../domain/intents.js';
import type { CollectedSlots } from '../domain/slots.js';
import { reportAbsence } from './attendance.js';
import { requestMealAssistance } from './meals.js';
import { scheduleConference } from './schedule.js';
import type { ToolContext, ToolResult } from './types.js';

export type Tool = (ctx: ToolContext, slots: CollectedSlots) => Promise<ToolResult>;

/** Maps an action intent to the tool that executes it. */
export const toolFor: Record<ActionIntent, Tool> = {
  schedule_conference: scheduleConference,
  report_absence: reportAbsence,
  request_meal_voucher: requestMealAssistance,
};

export async function executeTool(
  intent: ActionIntent,
  ctx: ToolContext,
  slots: CollectedSlots,
): Promise<ToolResult> {
  return toolFor[intent](ctx, slots);
}
