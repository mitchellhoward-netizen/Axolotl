// ─────────────────────────────────────────────────────────────────────────────
// Generalized school/district discovery resolution.
//
// Given ANY school or district name, resolve it to a canonical record. There is
// NO hardcoded district here: ids are derived stably from the name (+ location),
// and the contact/school facts come from the researched-district registry in
// `districts.ts` (produced by research for whatever district a parent names).
// Anything not researched returns a `resolved:false` record so the research
// pipeline can fill it in. This is what lets Axolotl work for ANY school, not
// just the one we seeded.
// ─────────────────────────────────────────────────────────────────────────────

import {
  districtIdFromName,
  schoolIdFromName,
  getResearchedDistrict,
  type DistrictProfile,
} from './districts.js';

export interface SchoolRef {
  id: string;
  name: string;
  districtId: string;
  districtName: string;
  state: string;
  principal?: string;
  phone?: string;
  address?: string;
  /** true = we have a researched/known profile; false = still to be researched. */
  resolved: boolean;
}

export interface DistrictRef {
  id: string;
  name: string;
  short?: string;
  state: string;
  city?: string;
  schools: SchoolRef[];
  liaison?: { name: string; role: string; phone: string; email: string };
  busPasses?: { name: string; phone: string };
  resolved: boolean;
}

function norm(s: unknown): string {
  return String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.,]/g, '');
}

/** Split a researched `schools` string (e.g. "• Soquel Elementary — Name, (831)…") into refs. */
function parseSchools(schools: string, districtId: string, districtName: string, state: string): SchoolRef[] {
  const refs: SchoolRef[] = [];
  for (const line of schools.split('\n')) {
    const m = line.match(/^\s*(?:•|[-*])\s*(.+?)(?:\s*[—-]\s*(.*))?$/i);
    if (!m) continue;
    const name = m[1]?.trim() ?? '';
    if (!name) continue;
    const rest = m[2]?.trim() ?? '';
    const principal = rest.match(/([A-Z][a-z]+(?: [A-Z][a-z]+)+)/)?.[1];
    const phone = rest.match(/\(?[\d]{3}\)?[\s.-]*[\d]{3}-?[\d]{4}/)?.[0];
    refs.push({
      id: schoolIdFromName(`${name} ${districtName}`),
      name,
      districtId,
      districtName,
      state,
      principal,
      phone,
      resolved: true,
    });
  }
  return refs;
}

function districtRefFromProfile(p: DistrictProfile): DistrictRef {
  const schools = p.schools
    ? parseSchools(p.schools, p.id, p.name, p.state ?? 'CA')
    : [];
  if (!schools.length && (p.elementary || p.name)) {
    schools.push({
      id: schoolIdFromName(`${p.elementary ?? p.name}`),
      name: p.elementary ?? p.name,
      districtId: p.id,
      districtName: p.name,
      state: p.state ?? 'CA',
      resolved: p.known,
    });
  }
  return {
    id: p.id,
    name: p.name,
    short: p.short,
    state: p.state ?? 'CA',
    city: p.city,
    schools,
    liaison: p.liaison,
    busPasses: p.busPasses,
    resolved: p.known,
  };
}

/** Resolve to a definite district: known/researched when possible, else provisional. */
export function resolveAnyDistrict(input: string): DistrictRef {
  const profile = getResearchedDistrict(input);
  if (profile) return districtRefFromProfile(profile);
  return districtRefFromProfile({ id: districtIdFromName(input), name: (input ?? '').trim() || 'their district', known: false, type: 'unknown' });
}

/** Resolve to a definite school: known/researched when possible, else provisional. */
export function resolveAnySchool(input: string): SchoolRef {
  const district = resolveAnyDistrict(input);
  return district.schools[0] ?? {
    id: schoolIdFromName(input),
    name: (input ?? '').trim() || 'their school',
    districtId: district.id,
    districtName: district.name,
    state: district.state,
    resolved: false,
  };
}
