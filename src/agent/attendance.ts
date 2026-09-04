import type { Barrier } from '../knowledge/barriers.js';
import { detectBarriers } from '../knowledge/barriers.js';

export type AttendanceStep = 'barrier' | 'consent';

export interface AttendanceState {
  step: AttendanceStep;
  child?: string;
  chosen?: Barrier;
}

export interface AttendanceTurn {
  text: string;
  state: AttendanceState;
  done: boolean;
}

/**
 * The absenteeism-resolution operating loop (INTAKE → PLAN → ACT → REPORT → REMEMBER).
 * The parent says attendance is a problem; we diagnose the root blocker, map it to
 * the right law + person, draft the parent-authorized outreach, get consent, and
 * (in TEST_MODE) log the case + remind to follow up. Nothing is sent for real.
 */
export function openAttendance(child?: string): AttendanceTurn {
  const who = child ?? 'your child';
  return {
    text: [
      `I'm sorry ${who} is having trouble getting to school — let's fix that.`,
      '',
      "What do you think is getting in the way? For example: getting there, meals, being bullied, feeling sick, or you're not sure.",
    ].join('\n'),
    state: { step: 'barrier', child },
    done: false,
  };
}

export function advanceAttendance(state: AttendanceState, text: string): AttendanceTurn {
  const t = text.trim();

  if (state.step === 'barrier') {
    const chosen = detectBarriers(t)[0]!;
    const draft = chosen.draft.replaceAll('{child}', state.child ?? 'your child');
    return {
      text: [
        `${chosen.title} — ${chosen.explain}`,
        '',
        `Who to reach: ${chosen.contact}`,
        '',
        `Here's a message I can send for you:`,
        `“${draft}”`,
        '',
        'Reply YES and I’ll log it (this demo won’t actually send it), or tell me more and I’ll adjust.',
      ].join('\n'),
      state: { step: 'consent', child: state.child, chosen },
      done: false,
    };
  }

  // consent
  if (/^(y|yes|send|ok|go ahead|do it)\b/i.test(t)) {
    const chosen = state.chosen!;
    return {
      text: [
        'Got it — case logged. ✔',
        '',
        chosen.reminder,
        '',
        "(Live version: I'd email that message to the contact above and track the response. This demo keeps everything local — nothing was sent.)",
      ].join('\n'),
      state: { step: 'consent', child: state.child, chosen },
      done: true,
    };
  }

  // "no" or more detail → re-diagnose
  return {
    text: 'No problem. What do you think is getting in the way? (Getting there, meals, bullying, health, or not sure.)',
    state: { step: 'barrier', child: state.child },
    done: false,
  };
}
