import { BUS_PASSES, DISTRICT, LIAISON, SCHOOLS_LIST, SOQUEL_ELEMENTARY } from './suesd.js';

export interface DistrictProfile {
  name: string;
  short: string;
  elementary?: string;
  liaison?: { name: string; role: string; phone: string; email: string };
  busPasses?: { name: string; phone: string };
  schools?: string;
  /** True when we have a researched profile; false = still to be researched. */
  known: boolean;
}

/**
 * Resolve a district from whatever the parent typed. Today we have a fully
 * researched profile for SUESD/Soquel; a real deployment would look up any
 * district live (its site, McKinney-Vento liaison, enrollment/transport pages).
 */
export function resolveDistrict(input: string): DistrictProfile {
  const t = input.toLowerCase();
  if (/soquel|suesd|union elementary/.test(t)) {
    return {
      name: DISTRICT.name,
      short: DISTRICT.shortName,
      elementary: SOQUEL_ELEMENTARY.name,
      liaison: LIAISON,
      busPasses: BUS_PASSES,
      schools: SCHOOLS_LIST,
      known: true,
    };
  }
  return {
    name: input.trim() || 'your school district',
    short: '',
    known: false,
  };
}
