import type { ActionIntent } from '../domain/intents.js';
import type { CollectedSlots, SlotValue } from '../domain/slots.js';
import type { Student, Teacher } from '../domain/types.js';
import { parseDateHint } from '../lib/dates.js';

export type SlotKind = 'student' | 'teacher' | 'date' | 'text' | 'choice';

export interface SlotSpec {
  key: string;
  question: string;
  required: boolean;
  kind: SlotKind;
  choices?: string[];
}

/** Per-intent slot schema. Student/teacher choices are resolved dynamically. */
export const SLOT_SPECS: Record<ActionIntent, SlotSpec[]> = {
  schedule_conference: [
    { key: 'studentIds', question: 'Which child is this for?', required: true, kind: 'student' },
    { key: 'teacherId', question: 'Which teacher would you like to meet?', required: false, kind: 'teacher' },
    { key: 'when', question: 'What day works for you? (e.g. Tuesday, Sep 8, or "next week")', required: true, kind: 'date' },
    { key: 'topic', question: 'What would you like to discuss?', required: false, kind: 'text' },
  ],
  report_absence: [
    { key: 'studentIds', question: 'Which child will be absent?', required: true, kind: 'student' },
    { key: 'date', question: 'On which day? (e.g. tomorrow, or Tue Sep 8)', required: true, kind: 'date' },
    { key: 'reason', question: "What is the reason? (e.g. sick, doctor's appointment)", required: true, kind: 'text' },
    { key: 'fullDay', question: 'Full day or half day?', required: false, kind: 'choice', choices: ['Full day', 'Half day'] },
  ],
  request_meal_voucher: [
    { key: 'studentIds', question: 'Which child is this for?', required: true, kind: 'student' },
    { key: 'program', question: 'What do you need?', required: true, kind: 'choice', choices: ['Free & reduced meal application', 'Meal voucher'] },
  ],
};

export interface Roster {
  students: Student[];
  teachers: Teacher[];
}

export function isEmpty(v: SlotValue): boolean {
  return v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}

export function missingRequired(intent: ActionIntent, collected: CollectedSlots): SlotSpec[] {
  return SLOT_SPECS[intent].filter((s) => s.required && isEmpty(collected[s.key]));
}

/** Pull as many slots as possible out of a free-text message. */
export function extractSlots(
  intent: ActionIntent,
  text: string,
  roster: Roster,
  now: Date = new Date(),
): CollectedSlots {
  switch (intent) {
    case 'schedule_conference':
      return extractSchedule(text, roster);
    case 'report_absence':
      return extractAbsence(text, roster, now);
    case 'request_meal_voucher':
      return extractMeal(text, roster);
  }
}

function extractSchedule(text: string, roster: Roster): CollectedSlots {
  const slots: CollectedSlots = {};
  const kids = matchStudents(text, roster.students);
  if (kids.length) slots.studentIds = kids.map((s) => s.id);

  const teacher = matchTeacher(text, roster.teachers);
  if (teacher) slots.teacherId = teacher.id;

  const when = extractWhen(text);
  if (when) slots.when = when;

  const topic = text.match(/\b(?:about|regarding|to discuss|discuss)\s+(.+)/i);
  if (topic) slots.topic = topic[1]!.trim();
  return slots;
}

function extractAbsence(text: string, roster: Roster, now: Date): CollectedSlots {
  const slots: CollectedSlots = {};
  const kids = matchStudents(text, roster.students);
  if (kids.length) slots.studentIds = kids.map((s) => s.id);

  const date = parseDateHint(text, now);
  if (date) slots.date = date;

  const reason = extractReason(text);
  if (reason) slots.reason = reason;

  if (/\bhalf[- ]day\b/i.test(text)) slots.fullDay = false;
  else if (/\bfull[- ]day\b/i.test(text)) slots.fullDay = true;

  return slots;
}

function extractMeal(text: string, roster: Roster): CollectedSlots {
  const slots: CollectedSlots = {};
  const kids = matchStudents(text, roster.students);
  if (kids.length) slots.studentIds = kids.map((s) => s.id);

  if (/\bvoucher\b/i.test(text)) slots.program = 'meal_voucher';
  else if (/\b(free|reduced|application|lunch|meal benefit|breakfast)\b/i.test(text)) {
    slots.program = 'free_reduced_application';
  }
  return slots;
}

function extractReason(text: string): string {
  const because = text.match(/\b(?:because|due to|reason[:\s])\s+(.+)/i);
  if (because) return because[1]!.trim().replace(/[.!?]+$/, '');

  const t = text.toLowerCase();
  if (/sick|ill|fever|flu|cold/.test(t)) return 'Sick';
  if (/doctor|appointment|dentist|checkup|check-up/.test(t)) return "Doctor's appointment";
  if (/travel|trip|vacation|away/.test(t)) return 'Family travel';
  if (/family|emergency|bereavement/.test(t)) return 'Family emergency';
  return '';
}

function matchStudents(text: string, students: Student[]): Student[] {
  const t = text.trim().toLowerCase();
  // "both" / "all" — select every child on the account (anywhere in the phrase).
  if (/\bboth\b|\beveryone\b|\beverybody\b|\ball (the )?(kids|children|students|of them)\b/.test(t)) {
    return [...students];
  }

  // Split on "and", ",", "/" to support multiple names, e.g. "Emma and Liam".
  const tokens = t.split(/\s+(?:and|&)\s+|,\s*|\/\s*/).map((p) => p.trim()).filter(Boolean);
  const out: Student[] = [];
  for (const token of tokens) {
    if (/^\d{1,2}$/.test(token)) {
      const idx = Number(token) - 1;
      if (idx >= 0 && idx < students.length) pushUnique(out, students[idx]!);
      continue;
    }
    const s = students.find(
      (st) =>
        token.includes(st.firstName.toLowerCase()) ||
        token.includes(st.lastName.toLowerCase()) ||
        st.firstName.toLowerCase().startsWith(token) ||
        st.lastName.toLowerCase().startsWith(token),
    );
    if (s) pushUnique(out, s);
  }
  return out;
}

function pushUnique(list: Student[], s: Student): void {
  if (!list.includes(s)) list.push(s);
}

function matchTeacher(text: string, teachers: Teacher[]): Teacher | undefined {
  const t = text.toLowerCase();
  return teachers.find((te) => t.includes(te.lastName.toLowerCase()));
}

/** Pull just the temporal phrase out of a scheduling request. */
function extractWhen(text: string): string | undefined {
  const t = text.toLowerCase();
  const patterns = [
    /\b(today|tomorrow)\b/,
    /\bnext week\b/,
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/,
    /\b\d{4}-\d{2}-\d{2}\b/,
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m) return m[0].toLowerCase();
  }
  return undefined;
}
