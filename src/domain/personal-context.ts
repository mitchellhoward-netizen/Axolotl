import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { CaseRecord, FamilyProfile } from './types.js';

const text = z.string().trim().min(1).max(1500);
export const factInput = z.object({
  subject: text,
  category: z.enum(['family', 'school', 'health', 'employment', 'coverage', 'preference']),
  statement: text,
  supersedes: z.uuid().optional(),
  validUntil: z.iso.datetime().optional(),
}).strict();
export const caseInput = z.object({
  subject: text, goal: text,
  steps: z.array(z.object({
    domain: z.enum(['school', 'healthcare', 'benefits', 'life']),
    goal: text,
    // Earlier step indexes only: a case cannot contain a dependency cycle.
    dependsOn: z.array(z.number().int().nonnegative()).max(15),
  }).strict()).min(1).max(15),
}).strict();

export interface PersonalFact extends z.infer<typeof factInput> {
  id: string;
  source: { kind: 'person_report' | 'school_profile'; messageId: string; observedAt: string };
}
export interface PersonalCase {
  id: string; subject: string; goal: string; createdAt: string; messageId: string;
  steps: Array<{
    id: string; domain: 'school' | 'healthcare' | 'benefits' | 'life'; goal: string; dependsOn: string[];
    // A report is useful context but never provider-verified completion.
    report?: { text: string; messageId: string; at: string };
  }>;
}
export interface PersonalContext {
  facts: PersonalFact[];
  cases: PersonalCase[];
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}
export const emptyPersonalContext = (): PersonalContext => ({ facts: [], cases: [], history: [] });

/** One-time import into the personal source of truth. No transcript, credential,
 * consent grant or old 'resolved' flag is promoted to verified provider evidence. */
export function importSchoolContext(snapshot: { profile?: FamilyProfile; cases: CaseRecord[] }, sourceId: string, now: number): PersonalContext {
  const context = emptyPersonalContext();
  const p = snapshot.profile;
  const add = (subject: string, category: PersonalFact['category'], statement: string | undefined) => {
    if (!statement) return;
    const fact = rememberFact(context, { subject, category, statement: statement.slice(0, 1500) }, sourceId, now);
    fact.source.kind = 'school_profile';
  };
  if (p) {
    add('self', 'family', p.parentName ? `Name: ${p.parentName}` : undefined);
    add('household', 'school', [p.school, p.district, p.location].filter(Boolean).join(', '));
    for (const child of p.children ?? []) add(child.name, 'family', `Child: ${child.name}${child.grade ? `; grade: ${child.grade}` : ''}`);
    for (const need of p.needs ?? []) add('household', 'family', `Need: ${need}`);
    for (const challenge of p.challenges ?? []) add('household', 'family', `Context: ${challenge}`);
    add('household', 'family', p.notes);
    add('self', 'preference', p.locale ? `Preferred language: ${p.locale}` : undefined);
  }
  for (const legacy of snapshot.cases) {
    const c = openPersonalCase(context, { subject: legacy.child ?? 'household', goal: legacy.summary.slice(0, 1500),
      steps: [{ domain: 'school', goal: legacy.kind.slice(0, 1500), dependsOn: [] }] }, `school-case:${legacy.id}`, now);
    if (legacy.status === 'resolved') c.steps[0]!.report = {
      text: 'Legacy school case was marked resolved; outcome not independently verified.',
      messageId: `school-case:${legacy.id}`, at: legacy.createdAt,
    };
  }
  return context;
}

/** All model-written facts are attributed to the original human turn. A model
 * cannot promote its own inference, an uploaded report, or a remembered plan
 * into verified eligibility. Corrections preserve the old source for audit. */
export function rememberFact(context: PersonalContext, raw: unknown, messageId: string, now: number): PersonalFact {
  const input = factInput.parse(raw);
  if (context.facts.length >= 500) throw new Error('Personal context limit reached');
  if (input.supersedes) {
    const previous = context.facts.find(f => f.id === input.supersedes);
    if (!previous || previous.subject !== input.subject || previous.category !== input.category ||
      context.facts.some(f => f.supersedes === previous.id)) throw new Error('Invalid fact correction');
  }
  const fact: PersonalFact = { ...input, id: randomUUID(),
    source: { kind: 'person_report', messageId, observedAt: new Date(now).toISOString() } };
  context.facts.push(fact);
  return fact;
}

export function openPersonalCase(context: PersonalContext, raw: unknown, messageId: string, now: number): PersonalCase {
  const input = caseInput.parse(raw);
  if (context.cases.length >= 100) throw new Error('Case limit reached');
  for (const [i, step] of input.steps.entries()) {
    if (step.dependsOn.some(index => index >= i) || new Set(step.dependsOn).size !== step.dependsOn.length) throw new Error('Invalid dependency');
  }
  const ids = input.steps.map(() => randomUUID());
  const c: PersonalCase = { id: randomUUID(), subject: input.subject, goal: input.goal,
    createdAt: new Date(now).toISOString(), messageId,
    steps: input.steps.map((s, i) => ({ ...s, id: ids[i]!, dependsOn: s.dependsOn.map(index => ids[index]!) })) };
  context.cases.push(c);
  return c;
}

export function extendPersonalCase(context: PersonalContext, caseId: string, raw: unknown): PersonalCase {
  const c = context.cases.find(c => c.id === caseId);
  const steps = caseInput.shape.steps.parse(raw);
  if (!c || c.steps.length + steps.length > 15) throw new Error('Case unavailable or full');
  const ids = [...c.steps.map(s => s.id), ...steps.map(() => randomUUID())];
  const offset = c.steps.length;
  for (const [i, step] of steps.entries()) {
    if (step.dependsOn.some(index => index >= offset + i) || new Set(step.dependsOn).size !== step.dependsOn.length) throw new Error('Invalid dependency');
  }
  c.steps.push(...steps.map((s, i) => ({ ...s, id: ids[offset + i]!, dependsOn: s.dependsOn.map(index => ids[index]!) })));
  return c;
}

export interface LinkedTask {
  id: string; caseId?: string; stepId?: string; status: string;
  outcome?: { state: string; reference: string; evidence: string; observedAt: string };
}

/** Case progress is derived from actual task outcomes, not copied into a second
 * state machine. Completing one provider task cannot close unrelated school work. */
export function caseProgress(c: PersonalCase, tasks: LinkedTask[]) {
  const completed = new Set(c.steps.filter(step => tasks.some(t => t.caseId === c.id && t.stepId === step.id &&
    t.status === 'completed' && t.outcome?.state === 'completed' && t.outcome.reference && t.outcome.evidence)).map(s => s.id));
  const steps = c.steps.map(step => {
    const task = tasks.find(t => t.caseId === c.id && t.stepId === step.id);
    return { ...step, taskId: task?.id,
      status: completed.has(step.id) ? 'completed' :
        step.dependsOn.some(id => !completed.has(id)) ? 'blocked' :
          task ? task.status : step.report ? 'reported_done' : 'planned' };
  });
  return { id: c.id, subject: c.subject, goal: c.goal,
    status: completed.size === c.steps.length ? 'completed' : 'open', steps };
}

export function personalView(context: PersonalContext, tasks: LinkedTask[], now: number) {
  const superseded = new Set(context.facts.map(f => f.supersedes).filter(Boolean));
  return {
    facts: context.facts.filter(f => !superseded.has(f.id) &&
      (!f.validUntil || Date.parse(f.validUntil) > now)),
    cases: context.cases.map(c => caseProgress(c, tasks)),
  };
}

export function requireReadyStep(context: PersonalContext | undefined, tasks: LinkedTask[], caseId: string, stepId: string): void {
  const c = context?.cases.find(c => c.id === caseId);
  const step = c && caseProgress(c, tasks).steps.find(s => s.id === stepId);
  if (!step || step.status === 'blocked' || step.status === 'completed') throw new Error('Case step is not ready');
}
