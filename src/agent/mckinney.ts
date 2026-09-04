import type { Student } from '../domain/types.js';
import { busProcessSummary, LIAISON } from '../knowledge/suesd.js';

export type MckinneyStep = 'student' | 'school_of_origin';

export interface MckinneyState {
  step: MckinneyStep;
  studentIds: string[];
}

export interface MckinneyTurn {
  text: string;
  state: MckinneyState;
  /** When true, the flow is finished and the caller should clear this substate. */
  done: boolean;
}

/**
 * Guided, empathetic conversation for a parent/guardian whose family is
 * homeless or displaced and needs school transportation (McKinney-Vento).
 *
 * Handles one OR more children ("Emma", "2", "both", "Emma and Liam").
 * Principles: one question at a time, no probing of the living situation,
 * confidentiality, and — for v1 — it explains exactly how the request works
 * WITHOUT submitting anything.
 */
export function openMckinney(): MckinneyTurn {
  return {
    text: [
      'I can help with getting your child to school.',
      '',
      'If your living situation has changed — staying with family, in a shelter, a motel, a car, or without a fixed address — there are protections (a federal law called McKinney-Vento) that can help your child keep going to school and get a ride.',
      '',
      'Which child is this about? (You can say "both", or name them.)',
    ].join('\n'),
    state: { step: 'student', studentIds: [] },
    done: false,
  };
}

export function advanceMckinney(state: MckinneyState, text: string, students: Student[]): MckinneyTurn {
  const t = text.trim();

  if (/^(stop|cancel|never ?mind|nvm|quit|not right now)\b/i.test(t)) {
    return {
      text: `Of course. I'll leave it here — and if you ever want to pick this back up, just say so. You can also call the district's homeless liaison, ${LIAISON.name}, at ${LIAISON.phone}.`,
      state,
      done: true,
    };
  }

  if (state.step === 'student') {
    const matched = matchStudents(t, students);
    if (matched.length === 0) {
      const list = students.map((s, i) => `${i + 1}) ${s.firstName}`).join('\n');
      return {
        text: `I want to make sure I have the right children. Here's who I have on your account:\n${list}\n\nReply with a name or number (e.g. "Emma", "2", or "both").`,
        state,
        done: false,
      };
    }
    const ids = matched.map((s) => s.id);
    const names = matched.map((s) => s.firstName).join(' and ');
    const schoolQuestion =
      matched.length === 1
        ? `Which school is ${names} enrolled at, or were they last enrolled at? If you want them to stay at that school, that's the one the district can provide transportation to.`
        : `Which school do ${names} go to, or were they last enrolled at? If you want them to stay there, that's the one the district can provide transportation to.`;
    return {
      text: `Got it — ${names}. ${schoolQuestion}`,
      state: { step: 'school_of_origin', studentIds: ids },
      done: false,
    };
  }

  // step === 'school_of_origin'. Only carry the school name forward if it looks
  // like a school (not a description of the living situation).
  const school = /school|elementary|middle/i.test(t) ? t : undefined;
  const names = state.studentIds
    .map((id) => students.find((s) => s.id === id)?.firstName)
    .filter((n): n is string => Boolean(n))
    .join(' and ');
  return {
    text: busProcessSummary(school, names || undefined),
    state,
    done: true,
  };
}

function matchStudents(text: string, students: Student[]): Student[] {
  const t = text.trim().toLowerCase();
  if (/^(both|all|everyone|everybody|both of them|all of them)\b/.test(t)) return [...students];

  const tokens = t.split(/\s+(?:and|&)\s+|,\s*|\/\s*/).map((p) => p.trim()).filter(Boolean);
  const out: Student[] = [];
  for (const token of tokens) {
    if (/^\d{1,2}$/.test(token)) {
      const idx = Number(token) - 1;
      if (idx >= 0 && idx < students.length) push(out, students[idx]!);
      continue;
    }
    const s = students.find(
      (st) =>
        token.includes(st.firstName.toLowerCase()) ||
        token.includes(st.lastName.toLowerCase()) ||
        st.firstName.toLowerCase().startsWith(token) ||
        st.lastName.toLowerCase().startsWith(token),
    );
    if (s) push(out, s);
  }
  return out;
}

function push(list: Student[], s: Student): void {
  if (!list.includes(s)) list.push(s);
}
