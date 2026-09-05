// ─────────────────────────────────────────────────────────────────────────────
// Generalized school/discovery resolution.
//
// Given any school or district name, resolve it to a canonical record. Today we
// ship a small, hand-verified nomenclator (SUESD/Soquel); any input that doesn't
// match returns a `provisional` record flagged `resolved:false` so the research
// pipeline can fill it in. This is what lets Axolotl work for ANY school, not
// just the one we seeded.
// ─────────────────────────────────────────────────────────────────────────────

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

const SUESD: DistrictRef = {
  id: 'district-suesd',
  name: 'Soquel Union Elementary School District',
  short: 'SUESD',
  state: 'CA',
  city: 'Capitola, CA',
  resolved: true,
  liaison: {
    name: 'Carissa Lemos',
    role: 'Director of Student Services / District Homeless Liaison',
    phone: '(831) 464-5631',
    email: 'clemos@suesd.org',
  },
  busPasses: { name: 'Erika Cortes', phone: '(831) 466-5666' },
  schools: [
    {
      id: 'school-soquel',
      name: 'Soquel Elementary School',
      districtId: 'district-suesd',
      districtName: 'Soquel Union Elementary School District',
      state: 'CA',
      principal: 'Brittany Birchall',
      phone: '(831) 464-5655',
      address: '2700 Porter St, Soquel, CA 95073',
      resolved: true,
    },
    {
      id: 'school-main-street',
      name: 'Main Street Elementary School',
      districtId: 'district-suesd',
      districtName: 'Soquel Union Elementary School District',
      state: 'CA',
      principal: 'Heather Herbst',
      phone: '(831) 464-5650',
      resolved: true,
    },
    {
      id: 'school-sc-gardens',
      name: 'Santa Cruz Gardens Elementary School',
      districtId: 'district-suesd',
      districtName: 'Soquel Union Elementary School District',
      state: 'CA',
      principal: 'Carlo Albano',
      phone: '(831) 464-5670',
      resolved: true,
    },
    {
      id: 'school-opal-cliffs',
      name: 'Opal Cliffs School',
      districtId: 'district-suesd',
      districtName: 'Soquel Union Elementary School District',
      state: 'CA',
      resolved: true,
    },
    {
      id: 'school-new-brighton',
      name: 'New Brighton Middle School',
      districtId: 'district-suesd',
      districtName: 'Soquel Union Elementary School District',
      state: 'CA',
      principal: 'Christina Hadreas',
      phone: '(831) 464-5660',
      resolved: true,
    },
  ],
};

/** The growing, hand-verified nomenclator. New districts get appended as they're onboarded. */
const KNOWN_DISTRICTS: DistrictRef[] = [SUESD];

/** Casual aliases → known district id. */
const ALIASES: Record<string, string> = {
  soquel: 'district-suesd',
  suesd: 'district-suesd',
  'soquel union': 'district-suesd',
  'soquel elementary': 'district-suesd',
  'union elementary': 'district-suesd',
};

function norm(s: unknown): string {
  return String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.,]/g, '');
}

export function discoverDistrict(input: string): DistrictRef | undefined {
  const n = norm(input);
  if (!n) return undefined;
  // Direct name/short match.
  for (const d of KNOWN_DISTRICTS) {
    if (norm(d.name) === n || norm(d.short) === n) return d;
  }
  // Alias prefix match (so "soquel union elementary" matches).
  const aliasId = ALIASES[n] ?? ALIASES[n.split(' ')[0] ?? ''];
  if (aliasId) return KNOWN_DISTRICTS.find((d) => d.id === aliasId);
  // Prefix match on any known district name.
  const byPrefix = KNOWN_DISTRICTS.find((d) => n.startsWith(norm(d.name).slice(0, 6)) || norm(d.name).startsWith(n));
  return byPrefix;
}

export function discoverSchool(input: string): SchoolRef | undefined {
  const n = norm(input);
  if (!n) return undefined;
  for (const d of KNOWN_DISTRICTS) {
    for (const s of d.schools) {
      if (norm(s.name) === n) return s;
      if (n.includes(norm(s.name).slice(0, 8)) || norm(s.name).startsWith(n)) return s;
    }
  }
  // Fall back to a district-level match (e.g. they typed the district name).
  const d = discoverDistrict(input);
  if (d) return d.schools.find((s) => s.id === 'school-soquel') ?? d.schools[0];
  return undefined;
}

/** A placeholder record for a district we haven't researched yet. */
export function provisionalSchool(input: string): SchoolRef {
  const id = 'school-' + Math.random().toString(36).slice(2, 9);
  return {
    id,
    name: String(input ?? '').trim() || 'Their school',
    districtId: 'district-' + Math.random().toString(36).slice(2, 9),
    districtName: String(input ?? '').trim() || 'Their district',
    state: 'CA',
    resolved: false,
  };
}

export function provisionalDistrict(input: string): DistrictRef {
  const s = provisionalSchool(input);
  return {
    id: s.districtId,
    name: s.districtName,
    state: 'CA',
    schools: [s],
    resolved: false,
  };
}

/** Resolve to a definite district: known when possible, else provisional. */
export function resolveAnyDistrict(input: string): DistrictRef {
  return discoverDistrict(input) ?? provisionalDistrict(input);
}

/** Resolve to a definite school: known when possible, else provisional. */
export function resolveAnySchool(input: string): SchoolRef {
  return discoverSchool(input) ?? provisionalSchool(input);
}
