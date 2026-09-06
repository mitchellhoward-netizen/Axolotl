import 'dotenv/config';
import { getSupabase } from '../integrations/db.js';
import type { Skill, SkillStep, SkillStatus } from '../domain/skill.js';
import { makeSkillKey, parameterize } from '../domain/skill.js';
import type { ResourceNode } from '../domain/graph.js';
import type { FamilyProfile } from '../domain/types.js';
import type { Step } from './steps/types.js';

/**
 * Procedural memory. A skill is a verified, parameterized, re-runnable workflow
 * (the Webwright "Skill Factory" idea): distill a solved case into a skill, store
 * it keyed by intent+jurisdiction, and on reuse re-verify only the leaf artifacts
 * (form/deadline) instead of re-deriving the whole chain.
 */
export class SkillStore {
  private cache = new Map<string, Skill[]>();

  async list(): Promise<Skill[]> {
    let skills = this.cache.get('all');
    if (!skills) {
      skills = await this.loadFromDb();
      this.cache.set('all', skills);
    }
    return skills;
  }

  async save(skill: Skill): Promise<void> {
    const all = await this.list();
    const next = [...all.filter((s) => s.id !== skill.id), skill];
    this.cache.set('all', next);
    await this.persist(skill);
  }

  async findByKeyPrefix(prefix: string): Promise<Skill[]> {
    const all = await this.list();
    return all.filter((s) => s.key.startsWith(prefix));
  }

  private async loadFromDb(): Promise<Skill[]> {
    const c = getSupabase();
    if (!c) return [];
    const { data, error } = await c.from('skill').select('*');
    if (error || !data) return [];
    return (data as Array<Record<string, unknown>>).map(rowFromSkill);
  }

  private async persist(skill: Skill): Promise<void> {
    const c = getSupabase();
    if (!c) return;
    try {
      const { error } = await c.from('skill').upsert(
        {
          id: skill.id,
          name: skill.name,
          key: skill.key,
          description: skill.description,
          when_to_use: skill.whenToUse,
          steps: skill.steps,
          evidence_deps: skill.evidenceDeps,
          status: skill.status,
          approved: skill.approved,
          version: skill.version,
          last_verified_at: skill.lastVerifiedAt ?? null,
          updated_at: skill.updatedAt,
        },
        { onConflict: 'id' },
      );
      if (error) throw new Error(error.message);
    } catch (e) {
      console.error('[skills] persist failed (in-memory only):', (e as Error)?.message ?? e);
    }
  }
}

function rowFromSkill(row: Record<string, unknown>): Skill {
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    key: String(row.key ?? ''),
    description: String(row.description ?? ''),
    whenToUse: String(row.when_to_use ?? ''),
    steps: Array.isArray(row.steps) ? (row.steps as SkillStep[]) : [],
    evidenceDeps: Array.isArray(row.evidence_deps) ? (row.evidence_deps as string[]) : [],
    status: String(row.status ?? 'active') as SkillStatus,
    approved: Boolean(row.approved),
    version: Number(row.version ?? 1),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
    lastVerifiedAt: row.last_verified_at ? String(row.last_verified_at) : undefined,
  };
}

const defaultStore = new SkillStore();

export async function listSkills(): Promise<Skill[]> {
  return defaultStore.list();
}

export async function saveSkill(skill: Skill): Promise<void> {
  await defaultStore.save(skill);
}

/** Find an active skill for an intent + jurisdiction (the reuse path). */
export async function findSkillFor(intent: string, jurisdiction: string): Promise<Skill | null> {
  const key = makeSkillKey(intent, jurisdiction);
  const all = await defaultStore.list();
  return all.find((s) => s.key === key && s.status !== 'deprecated') ?? null;
}

/** Is a skill past its own reverify TTL? (pure) */
export function isSkillStale(skill: Skill, now: Date = new Date(), ttlDays = 30): boolean {
  if (skill.status === 'stale' || skill.status === 'deprecated') return true;
  if (!skill.lastVerifiedAt) return true;
  const ageDays = (now.getTime() - new Date(skill.lastVerifiedAt).getTime()) / 86_400_000;
  return ageDays > ttlDays;
}

/** Re-verify a skill's leaf artifacts against the resource graph. (pure) */
export function verifySkillLeaves(
  skill: Skill,
  nodes: ResourceNode[],
  now: Date = new Date(),
  ttlDays = 14,
): { ok: boolean; staleLeaves: string[] } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const staleLeaves: string[] = [];
  for (const dep of skill.evidenceDeps) {
    const node = byId.get(dep);
    if (!node?.lastVerifiedAt) {
      staleLeaves.push(dep);
      continue;
    }
    const ageDays = (now.getTime() - new Date(node.lastVerifiedAt).getTime()) / 86_400_000;
    if (ageDays > ttlDays) staleLeaves.push(dep);
  }
  return { ok: staleLeaves.length === 0, staleLeaves };
}

/** Replace literal family values with {child}/{parent}/{school} placeholders. */
function generalize(text: string, child: string, school: string, parentName: string): string {
  let out = text;
  if (child && child !== '{child}') out = out.split(child).join('{child}');
  if (parentName && parentName !== '{parent}') out = out.split(parentName).join('{parent}');
  if (school && school !== '{school}') out = out.split(school).join('{school}');
  return out;
}

/** Distill a solved workflow into a parameterized skill (Skill Factory). */
export function distillSkill(input: {
  intent: string;
  jurisdiction: string;
  description: string;
  whenToUse?: string;
  steps: Step[];
  evidenceDeps?: string[];
  family?: FamilyProfile;
}): Skill {
  const now = new Date().toISOString();
  const child = input.family?.children?.[0]?.name ?? '{child}';
  const school = input.family?.school ?? '{school}';
  const parentName = input.family?.parentName ?? '{parent}';

  const steps: SkillStep[] = input.steps.map((s, i) => {
    let args: Record<string, string> = {};
    switch (s.payload.channel) {
      case 'email':
        args = { to: s.counterparty.email ?? '', subject: s.payload.subject, body: s.payload.body };
        break;
      case 'call':
        args = { objective: s.payload.objective.goal };
        break;
      case 'form':
        args = { formId: s.payload.formId, ...s.payload.fields };
        break;
      case 'text':
        args = { body: s.payload.body };
        break;
    }
    args = Object.fromEntries(
      Object.entries(args).map(([k, v]) => [k, generalize(v, child, school, parentName)]),
    );
    const tool =
      s.channel === 'call' ? 'call_school' : s.channel === 'email' ? 'send_email' : s.channel === 'form' ? 'browser_fill' : 'message_parent';
    return { order: i + 1, tool, args, note: s.successCondition.describe };
  });

  return {
    id: 'skill-' + makeSkillKey(input.intent, input.jurisdiction),
    name: input.description,
    key: makeSkillKey(input.intent, input.jurisdiction),
    description: input.description,
    whenToUse: input.whenToUse ?? '',
    steps,
    evidenceDeps: input.evidenceDeps ?? [],
    status: 'active',
    approved: false, // parent approval flips this before it is trusted for reuse
    version: 1,
    createdAt: now,
    updatedAt: now,
    lastVerifiedAt: now,
  };
}

/** Flatten a skill into a compact, human/LLM-readable summary. */
export function skillSummary(skill: Skill): string {
  const steps = skill.steps
    .map((s, i) => `${i + 1}. ${s.tool} ${s.note ? `— ${s.note}` : ''}`.trim())
    .join('\n');
  return `${skill.name} [${skill.status}${skill.approved ? ', approved' : ', pending-approval'}] — ${skill.description}\n${steps}`;
}
