import { AgentError } from '../domain/errors.js';
import { getBool, getString } from '../domain/slots.js';
import type { CollectedSlots } from '../domain/slots.js';
import { formatDate } from '../lib/dates.js';
import type { ToolContext, ToolResult } from './types.js';

/** Report a student absent. Sends the excuse to the SIS. */
export async function reportAbsence(ctx: ToolContext, slots: CollectedSlots): Promise<ToolResult> {
  const studentId = getString(slots, 'studentId');
  const student = ctx.students.find((s) => s.id === studentId);
  if (!student) {
    throw new AgentError('I could not find that student on your account.', 'STUDENT_NOT_FOUND');
  }

  const date = getString(slots, 'date');
  const reason = getString(slots, 'reason') ?? 'Not specified';
  if (!date) {
    throw new AgentError('I need a date to report the absence.', 'PROVIDER_ERROR');
  }

  const fullDay = getBool(slots, 'fullDay') ?? true;
  const receipt = await ctx.sis.submitAbsence({
    studentId: student.id,
    date,
    reason,
    fullDay,
    planned: !/sick|ill|fever/.test(reason.toLowerCase()),
  });

  return {
    ok: true,
    summary: `Marked ${student.firstName} absent on ${formatDate(date)} (${fullDay ? 'full day' : 'half day'}) — reason: ${reason}.`,
    referenceId: receipt.referenceId,
    nextSteps: 'In this demo, no notification was actually sent.',
    details: { date, fullDay, reason },
  };
}
