import { AgentError } from '../domain/errors.js';
import { getString } from '../domain/slots.js';
import type { CollectedSlots } from '../domain/slots.js';
import { fullName } from '../domain/types.js';
import { dateWindow, formatDateTime } from '../lib/dates.js';
import type { ToolContext, ToolResult } from './types.js';

/**
 * Book a parent-teacher conference. Resolves the teacher (explicit or the
 * student's homeroom teacher), searches availability, and books the first slot.
 */
export async function scheduleConference(ctx: ToolContext, slots: CollectedSlots): Promise<ToolResult> {
  const studentId = getString(slots, 'studentId');
  const student = ctx.students.find((s) => s.id === studentId);
  if (!student) {
    throw new AgentError('I could not find that student on your account.', 'STUDENT_NOT_FOUND');
  }

  const teacherId = getString(slots, 'teacherId');
  const teacher =
    (teacherId && ctx.teachers.find((t) => t.id === teacherId)) ||
    ctx.teachers.find((t) => t.id === student.homeroomTeacherId);
  if (!teacher) {
    throw new AgentError('I could not find that teacher.', 'STUDENT_NOT_FOUND');
  }

  const when = getString(slots, 'when') ?? 'next week';
  const { from, to } = dateWindow(when, ctx.now);
  const available = await ctx.calendar.findAvailable(teacher.id, from, to);
  if (available.length === 0) {
    throw new AgentError('No available times found in that window.', 'NO_AVAILABILITY');
  }

  const booked = await ctx.calendar.book(available[0]!, student.id);
  const topic = getString(slots, 'topic');

  return {
    ok: true,
    summary: `Booked a parent-teacher conference for ${student.firstName} with ${fullName(teacher)} on ${formatDateTime(booked.start)}${topic ? ` (topic: ${topic})` : ''}.`,
    referenceId: booked.eventId,
    nextSteps: 'In this demo, no calendar invite was actually sent.',
    details: { teacherId: teacher.id, studentId: student.id, start: booked.start },
  };
}
