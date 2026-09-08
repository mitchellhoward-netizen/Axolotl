import type { LlmClient } from '../agent/llm.js';

/**
 * A per-district profile. This is the SINGLE authoritative source for a school /
 * district's contact facts (homeless liaison, bus-pass contact, school name) and
 * its type (public/private/charter — which gates the federal entitlements that
 * apply). Profiles are produced by research (`researchDistrictProfile`) for ANY
 * district, not hardcoded to one. When a district hasn't been researched yet we
 * return an honest `known:false` placeholder — never invented contacts.
 */
export interface DistrictProfile {
  /** Stable id (e.g. `district-soquel-union-elementary`); the knowledge-graph key. */
  id: string;
  name: string;
  short?: string;
  city?: string;
  state?: string;
  /** The district's (or school's) primary office name, if known. */
  elementary?: string;
  liaison?: { name: string; role: string; phone: string; email: string };
  busPasses?: { name: string; phone: string };
  /** Plain-language list of schools (best-effort), or undefined when unknown. */
  schools?: string;
  /** True when we have a researched profile; false = still to be researched. */
  known: boolean;
  /** public | private | charter | unknown — gates which federal entitlements apply. */
  type?: 'public' | 'private' | 'charter' | 'unknown';
}

function slug(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Drop a contact object that has no real fields (the LLM sometimes returns an
 * empty/blank contact, which is truthy but produces "liaison , , ." in output). */
function cleanContact<T extends Record<string, unknown>>(obj: T | undefined): T | undefined {
  if (!obj) return undefined;
  return Object.values(obj).some((v) => v && String(v).trim()) ? obj : undefined;
}

/** Stable district id derived from a district/school name (+ location, if present). */
export function districtIdFromName(name: string): string {
  return 'district-' + slug(name) || 'district-unknown';
}

/** Stable school id derived from a school name (+ location, if present). */
export function schoolIdFromName(name: string): string {
  return 'school-' + slug(name) || 'school-unknown';
}

/**
 * In-memory registry of districts we've already researched, keyed by stable id,
 * so repeated resolution of the same district reuses the researched profile.
 * (A real deployment would back this with the knowledge graph / district table.)
 */
const researched = new Map<string, DistrictProfile>();

function normName(s: string): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Find a registered profile by matching its name (or elementary/short) to input. */
function lookupByName(input: string): DistrictProfile | undefined {
  const n = normName(input);
  if (!n) return undefined;
  // Exact name / elementary / short match first.
  for (const p of researched.values()) {
    const candidates = [p.name, p.short, p.elementary].filter((x): x is string => Boolean(x)).map(normName);
    if (candidates.includes(n)) return p;
  }
  // Prefix / containment match: "Lincoln Elementary" → "Lincoln Elementary School
  // District"; or the input contains a registered school name.
  for (const p of researched.values()) {
    const pn = normName(p.name);
    const el = p.elementary ? normName(p.elementary) : '';
    if (pn.startsWith(n) && n.length >= 6) return p;
    if (n.startsWith(pn)) return p;
    if (el && (n.includes(el) || el.startsWith(n))) return p;
  }
  return undefined;
}

/** Register a researched profile (call after a successful research/web lookup). */
export function registerDistrict(p: DistrictProfile): DistrictProfile {
  const id = p.id || districtIdFromName(p.name);
  const profile: DistrictProfile = { ...p, id, known: true, liaison: cleanContact(p.liaison), busPasses: cleanContact(p.busPasses) };
  researched.set(id, profile);
  return profile;
}

/** The researched profile for a district name, if we already have one. */
export function getResearchedDistrict(input: string): DistrictProfile | undefined {
  return researched.get(districtIdFromName(input)) ?? lookupByName(input);
}

/** The researched profile by its stable id, if we already have one. */
export function getResearchedDistrictById(id: string): DistrictProfile | undefined {
  return researched.get(id);
}

/**
 * Resolve a district to a profile WITHOUT researching. Returns the researched
 * profile if one is registered (by id or name match); otherwise an honest
 * `known:false` placeholder with a stable id (so the knowledge graph can be keyed
 * + researched on demand).
 */
export function resolveDistrict(input: string): DistrictProfile {
  const id = districtIdFromName(input);
  const k = researched.get(id) ?? lookupByName(input);
  if (k) return k;
  const name = (input ?? '').trim();
  return { id, name: name || 'your school district', short: '', known: false, type: 'unknown' };
}

/**
 * Research a district and return its authoritative profile.
 *
 * Source of truth = the LLM's structured research for the district (which returns
 * liaison / bus-pass / schools / type). When the LLM is disabled or can't identify
 * the district, we return an honest `known:false` placeholder — never an invented
 * contact. The result is cached so subsequent turns reuse it.
 */
export async function researchDistrictProfile(input: string, llm?: LlmClient): Promise<DistrictProfile> {
  const id = districtIdFromName(input);
  const existing = researched.get(id) ?? lookupByName(input);
  if (existing) return existing;
  const name = (input ?? '').trim() || 'your school district';
  if (!llm?.enabled) {
    return { id, name, known: false, type: 'unknown' };
  }
  const r = await llm.researchDistrict(name).catch(() => null);
  if (!r?.name) {
    return { id, name, known: false, type: 'unknown' };
  }
  const profile: DistrictProfile = {
    id,
    name: r.name,
    short: r.short ?? '',
    city: r.city,
    state: r.state,
    elementary: r.elementary,
    liaison: cleanContact(r.liaison),
    busPasses: cleanContact(r.busPasses),
    schools: r.schools,
    known: r.known === true || Boolean(r.liaison || r.schools || r.elementary || (r.type && r.type !== 'unknown')),
    type: r.type ?? 'unknown',
  };
  if (profile.known) registerDistrict(profile);
  return profile;
}
