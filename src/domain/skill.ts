/**
 * Procedural memory — the "Skill Factory" pattern (Webwright/Hermes). A skill is
 * a verified, parameterized, re-runnable workflow keyed by portal/form/
 * jurisdiction. On reuse the agent re-verifies only its leaf artifacts (form
 * still active? deadline current?) rather than re-deriving the whole chain.
 */

export type SkillStatus = 'active' | 'stale' | 'deprecated';

export interface SkillStep {
  order: number;
  /** Tool name (web_search, browser_open, send_email, call_school, …). */
  tool: string;
  /** Parameterized args — {child}, {parent}, {school}, {district} are substituted at run time. */
  args: Record<string, string>;
  note?: string;
}

export interface Skill {
  id: string;
  name: string;
  /** Canonical lookup key, e.g. `transportation::district-lincoln-elementary`. */
  key: string;
  description: string;
  whenToUse: string;
  steps: SkillStep[];
  /** Resource-graph node ids this skill depends on (re-verified on reuse). */
  evidenceDeps: string[];
  status: SkillStatus;
  /** Parent-approved before the skill becomes `active` (Webwright/Hermes guardrail). */
  approved: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  lastVerifiedAt?: string;
}

/** Canonical key for intent + jurisdiction, e.g. `transportation::district-lincoln-elementary`. */
export function makeSkillKey(intent: string, jurisdiction: string): string {
  const i = intent.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const j = jurisdiction.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `${i}::${j}`;
}

/** Substitute {child} / {parent} / {school} / {district} placeholders in a template. */
export function parameterize(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(child|parent|school|district|name)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);
}

/** A step rendered for a concrete family (placeholders substituted). */
export function renderStep(step: SkillStep, vars: Record<string, string>): SkillStep {
  return {
    ...step,
    args: Object.fromEntries(Object.entries(step.args).map(([k, v]) => [k, parameterize(v, vars)])),
    note: step.note ? parameterize(step.note, vars) : undefined,
  };
}
