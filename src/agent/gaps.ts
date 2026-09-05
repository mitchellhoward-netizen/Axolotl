import type { FamilyProfile, CaseRecord } from '../domain/types.js';
import { auditEntitlements } from '../knowledge/entitlements.js';
import type { KnowledgeNode } from '../domain/knowledge.js';

export interface Gap {
  /** Stable id (entitlement id) so we don't re-raise the same gap repeatedly. */
  id: string;
  category: string;
  title: string;
  /** Parent-facing (English base; localize at the surface when the locale is es). */
  message: string;
  priority: 'high' | 'medium';
}

/**
 * The always-on advocate's "noticed a gap" engine. Given the family's profile,
 * open cases, and what they've already secured, surface the entitlements they
 * LIKELY qualify for but have NOT yet gotten and we're not already chasing.
 * Grounded (reuses auditEntitlements) and safety-compliant: phrased as a
 * possibility to pursue, never a diagnosis or an assertion of entitlement.
 */
export function detectGaps(
  profile: FamilyProfile | undefined,
  cases: CaseRecord[] = [],
  getting: string[] = [],
): Gap[] {
  if (!profile) return [];
  const openKinds = new Set(cases.filter((c) => c.status !== 'resolved').map((c) => c.kind));
  // Map an entitlement's domain to the case kinds we actually open for it, so an
  // in-progress chase suppresses the corresponding gap.
  const kindFor: Record<string, string> = {
    transport: 'transportation',
    meals: 'meals',
    support: 'special_ed',
    language: 'language',
    attendance: 'attendance',
  };
  const audit = auditEntitlements(profile, getting);
  const gaps: Gap[] = [];

  for (const item of audit) {
    if (item.status === 'accessed') continue; // already secured
    const kind = kindFor[item.entitlement.domain] ?? item.entitlement.domain;
    if (openKinds.has(kind) || openKinds.has(item.entitlement.domain)) continue; // already chasing
    gaps.push({
      id: item.entitlement.id,
      category: item.entitlement.domain,
      title: item.entitlement.title,
      message:
        `I noticed ${item.entitlement.title.toLowerCase()} may apply for your child. ` +
        `${item.entitlement.action}. Want me to start on it?`,
      priority:
        item.entitlement.id === 'iep-504' || item.entitlement.id === 'mckinney-vento-transport'
          ? 'high'
          : 'medium',
    });
  }

  return gaps
    .sort((a, b) => (a.priority === b.priority ? 0 : a.priority === 'high' ? -1 : 1))
    .slice(0, 3);
}

export interface StaleNode {
  node: KnowledgeNode;
  ageDays: number;
}

/** Nodes whose `lastVerifiedAt` is older than the threshold — candidates for re-verify. */
export function staleKnowledgeNodes(nodes: KnowledgeNode[], maxAgeDays = 30): StaleNode[] {
  const now = Date.now();
  const out: StaleNode[] = [];
  for (const n of nodes) {
    if (!n.lastVerifiedAt) continue; // never verified → leave to research pipeline
    const ageDays = (now - new Date(n.lastVerifiedAt).getTime()) / 86_400_000;
    if (ageDays > maxAgeDays) out.push({ node: n, ageDays });
  }
  return out;
}
