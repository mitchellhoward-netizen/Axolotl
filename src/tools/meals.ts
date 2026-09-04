import { AgentError } from '../domain/errors.js';
import { getString } from '../domain/slots.js';
import type { CollectedSlots } from '../domain/slots.js';
import type { MealProgram } from '../integrations/meals.js';
import type { ToolContext, ToolResult } from './types.js';

/** Meal assistance: free/reduced application or a meal voucher. */
export async function requestMealAssistance(ctx: ToolContext, slots: CollectedSlots): Promise<ToolResult> {
  const studentId = getString(slots, 'studentId');
  const student = ctx.students.find((s) => s.id === studentId);
  if (!student) {
    throw new AgentError('I could not find that student on your account.', 'STUDENT_NOT_FOUND');
  }

  const program = (getString(slots, 'program') ?? 'meal_voucher') as MealProgram;
  const receipt =
    program === 'free_reduced_application'
      ? await ctx.meals.submitFreeReducedApplication([student.id])
      : await ctx.meals.issueVoucher([student.id]);

  const what = program === 'free_reduced_application' ? 'a free & reduced meal application' : 'a meal voucher';
  return {
    ok: true,
    summary: `Demo only — this would request ${what} for ${student.firstName}, but nothing was actually submitted in this build.`,
    referenceId: receipt.referenceId,
    nextSteps: '',
    details: { program },
  };
}
