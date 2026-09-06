import type { KnowledgeSource } from './knowledge.js';

/**
 * Typed school resource graph — the durable moat. Where `KnowledgeNode` is a flat
 * category→fact wiki, this is the relational chain that answers "which form, for
 * which program, in which district, by which deadline":
 *
 *   school → district → department → program → eligibility → policy
 *                                             └→ application → form
 *                                                └→ contact / deadline
 */

export type ResourceType =
  | 'district'
  | 'school'
  | 'department'
  | 'program'
  | 'eligibility'
  | 'policy'
  | 'application'
  | 'form'
  | 'contact'
  | 'deadline';

export type EdgeType =
  | 'belongs_to' // school → district
  | 'has_department' // district → department
  | 'runs' // department → program
  | 'has_eligibility' // program → eligibility
  | 'cites' // eligibility/program → policy
  | 'applied_via' // program → application
  | 'uses_form' // application → form
  | 'has_contact' // program/application → contact
  | 'has_deadline'; // application → deadline

export interface ResourceNode {
  id: string;
  type: ResourceType;
  districtId?: string;
  schoolId?: string;
  /** Knowledge category (TRANSPORTATION|MEALS|…) for goal→program matching. */
  category?: string;
  title: string;
  summary: string;
  canonicalUrl: string;
  sources: KnowledgeSource[];
  status: 'verified' | 'draft';
  confidence: number;
  language?: string;
  discoveredAt: string;
  lastVerifiedAt?: string;
}

export interface ResourceEdge {
  from: string;
  to: string;
  type: EdgeType;
}

/** The reachable subgraph from a program, with leaf artifacts pulled out. */
export interface ResourceChain {
  startId: string;
  nodes: ResourceNode[];
  edges: ResourceEdge[];
  forms: ResourceNode[];
  applications: ResourceNode[];
  contacts: ResourceNode[];
  deadlines: ResourceNode[];
  eligibility: ResourceNode[];
  policies: ResourceNode[];
}

export function emptyChain(startId: string): ResourceChain {
  return {
    startId,
    nodes: [],
    edges: [],
    forms: [],
    applications: [],
    contacts: [],
    deadlines: [],
    eligibility: [],
    policies: [],
  };
}
