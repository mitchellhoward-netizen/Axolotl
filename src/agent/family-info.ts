/**
 * The family info store: what enrollment and sign-up forms ask for, gathered once and reused.
 *
 * Forms ask for the same things every time — date of birth, address, a guardian's phone, an
 * emergency contact, allergies. Before this the profile held a child's name and grade, so every
 * fill either left those fields empty or made the parent answer the same questions again. Now
 * whatever the parent tells us is saved (save_profile) and every later fill starts from it.
 *
 * Two rules:
 *  - merging never loses what we had. Children and contacts merge by name; a partial update of
 *    one child never wipes another child, or another field of the same child.
 *  - nothing here is invented. A value reaches a form only because the parent said it.
 */
import type { ChildProfile, FamilyContact, FamilyProfile, HomeAddress } from '../domain/types.js';

const clean = (v: unknown): string | undefined => {
  const s = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
  return s || undefined;
};
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Keep only the defined, non-empty fields of a patch object. */
function defined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '')) as Partial<T>;
}

function mergeByName<T extends { name: string }>(prev: T[] | undefined, next: T[] | undefined): T[] | undefined {
  if (!next?.length) return prev;
  const out = [...(prev ?? [])];
  for (const n of next) {
    const i = out.findIndex((p) => sameName(p.name, n.name));
    // Keep the stored spelling of the name: "patrick" in a later message is still Patrick.
    if (i >= 0) out[i] = { ...out[i]!, ...defined(n), name: out[i]!.name };
    else out.push(n);
  }
  return out;
}

/** Merge a save_profile patch into the stored profile without losing anything already known. */
export function mergeProfile(prev: FamilyProfile | undefined, patch: Partial<FamilyProfile>): FamilyProfile {
  const base: FamilyProfile = prev ?? { children: [], needs: [], challenges: [] };
  const { children, guardians, emergencyContacts, authorizedPickups, address, ...rest } = patch;
  return {
    ...base,
    ...defined(rest),
    children: mergeByName(base.children, children) ?? [],
    guardians: mergeByName(base.guardians, guardians),
    emergencyContacts: mergeByName(base.emergencyContacts, emergencyContacts),
    authorizedPickups: mergeByName(base.authorizedPickups, authorizedPickups),
    address: address ? { ...(base.address ?? {}), ...defined(address) } : base.address,
  };
}

// ── Parsing the tool's arguments ────────────────────────────────────────────

function parseChild(x: unknown): ChildProfile | undefined {
  const o = (x ?? {}) as Record<string, unknown>;
  const name = clean(o.name);
  if (!name) return undefined;
  return {
    name,
    ...defined({
      grade: clean(o.grade),
      lastName: clean(o.last_name ?? o.lastName),
      dateOfBirth: clean(o.date_of_birth ?? o.dateOfBirth),
      gender: clean(o.gender),
      previousSchool: clean(o.previous_school ?? o.previousSchool),
      allergies: clean(o.allergies),
      medicalNotes: clean(o.medical_notes ?? o.medicalNotes),
    }),
  };
}

function parseContacts(x: unknown): FamilyContact[] | undefined {
  if (!Array.isArray(x)) return undefined;
  const list = x
    .map((c) => {
      const o = (c ?? {}) as Record<string, unknown>;
      const name = clean(o.name);
      return name ? ({ name, ...defined({ relationship: clean(o.relationship), phone: clean(o.phone), email: clean(o.email) }) } as FamilyContact) : undefined;
    })
    .filter((c): c is FamilyContact => Boolean(c));
  return list.length ? list : undefined;
}

function parseAddress(x: unknown): HomeAddress | undefined {
  if (!x || typeof x !== 'object') return undefined;
  const o = x as Record<string, unknown>;
  const a = defined({ street: clean(o.street), city: clean(o.city), state: clean(o.state), zip: clean(o.zip) });
  return Object.keys(a).length ? a : undefined;
}

/** The family-info part of a save_profile call, as a profile patch. */
export function familyInfoPatch(args: Record<string, unknown>): Partial<FamilyProfile> {
  const children = Array.isArray(args.children)
    ? (args.children as unknown[]).map(parseChild).filter((c): c is ChildProfile => Boolean(c))
    : undefined;
  return defined({
    children: children?.length ? children : undefined,
    parentName: clean(args.parent_name),
    parentLastName: clean(args.parent_last_name),
    phone: clean(args.phone),
    homeLanguage: clean(args.home_language),
    address: parseAddress(args.address),
    guardians: parseContacts(args.guardians),
    emergencyContacts: parseContacts(args.emergency_contacts),
    authorizedPickups: parseContacts(args.authorized_pickups),
  }) as Partial<FamilyProfile>;
}

export const CONTACT_SCHEMA = {
  type: 'object',
  properties: { name: { type: 'string' }, relationship: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string' } },
  required: ['name'],
} as const;

/** JSON-schema properties for save_profile's family-info fields. */
export const FAMILY_INFO_TOOL_PROPERTIES = {
  parent_name: { type: 'string', description: "The texting parent's first name." },
  parent_last_name: { type: 'string' },
  phone: { type: 'string', description: "The parent's phone as they want it on forms." },
  home_language: { type: 'string', description: 'Language spoken at home (forms ask this).' },
  address: {
    type: 'object',
    properties: { street: { type: 'string' }, city: { type: 'string' }, state: { type: 'string' }, zip: { type: 'string' } },
  },
  guardians: { type: 'array', items: CONTACT_SCHEMA, description: 'Other parents/guardians.' },
  emergency_contacts: { type: 'array', items: CONTACT_SCHEMA },
  authorized_pickups: { type: 'array', items: CONTACT_SCHEMA, description: 'Adults allowed to pick the kids up.' },
} as const;

export const CHILD_TOOL_PROPERTIES = {
  name: { type: 'string', description: 'First name (the key children are merged by).' },
  grade: { type: 'string' },
  last_name: { type: 'string' },
  date_of_birth: { type: 'string' },
  gender: { type: 'string' },
  previous_school: { type: 'string' },
  allergies: { type: 'string', description: '"none" is a valid answer.' },
  medical_notes: { type: 'string', description: 'Only what the parent volunteers for forms.' },
} as const;

// ── From the store to a form ────────────────────────────────────────────────

/** Which child a fill is for: the named one, or the only one. */
export function childFor(profile: FamilyProfile | undefined, name?: string): ChildProfile | undefined {
  const kids = profile?.children ?? [];
  if (name) return kids.find((c) => sameName(c.name, name) || sameName(`${c.name} ${c.lastName ?? ''}`, name));
  return kids.length === 1 ? kids[0] : undefined;
}

/**
 * Everything on file for one child's form, keyed by the labels forms use. The browser agent
 * maps labels to fields, so a readable label ("Student date of birth") is the contract, not a
 * field id.
 */
export function formValuesFor(profile: FamilyProfile | undefined, childName?: string): Record<string, string> {
  if (!profile) return {};
  const child = childFor(profile, childName);
  const familyLast = profile.parentLastName;
  const out: Record<string, string | undefined> = {};
  if (child) {
    out['Student first name'] = child.name;
    out['Student last name'] = child.lastName ?? familyLast;
    out['Grade'] = child.grade;
    out['Student date of birth'] = child.dateOfBirth;
    out['Student gender'] = child.gender;
    out['Previous school'] = child.previousSchool;
    out['Allergies'] = child.allergies;
    out['Medical conditions / notes'] = child.medicalNotes;
  }
  out['School'] = profile.school;
  out['Parent/guardian first name'] = profile.parentName;
  out['Parent/guardian last name'] = familyLast;
  out['Parent/guardian phone'] = profile.phone;
  out['Parent/guardian email'] = profile.email;
  const a = profile.address;
  if (a) {
    out['Home street address'] = a.street;
    out['City'] = a.city;
    out['State'] = a.state;
    out['ZIP code'] = a.zip;
  }
  out['Language spoken at home'] = profile.homeLanguage;
  profile.guardians?.slice(0, 2).forEach((g, i) => {
    const n = i + 2;
    out[`Parent/guardian ${n} name`] = g.name;
    out[`Parent/guardian ${n} relationship`] = g.relationship;
    out[`Parent/guardian ${n} phone`] = g.phone;
    out[`Parent/guardian ${n} email`] = g.email;
  });
  profile.emergencyContacts?.slice(0, 3).forEach((c, i) => {
    const n = i + 1;
    out[`Emergency contact ${n} name`] = c.name;
    out[`Emergency contact ${n} relationship`] = c.relationship;
    out[`Emergency contact ${n} phone`] = c.phone;
  });
  if (profile.authorizedPickups?.length) {
    out['Authorized pickup'] = profile.authorizedPickups.map((c) => `${c.name}${c.relationship ? ` (${c.relationship})` : ''}${c.phone ? ` ${c.phone}` : ''}`).join('; ');
  }
  return Object.fromEntries(Object.entries(out).filter((e): e is [string, string] => Boolean(e[1])));
}

/** What most enrollment and program forms require, that we do not have yet. */
export function missingBasics(profile: FamilyProfile | undefined, childName?: string): string[] {
  const child = childFor(profile, childName);
  const missing: string[] = [];
  if (!child?.lastName && !profile?.parentLastName) missing.push("child's last name");
  if (!child?.dateOfBirth) missing.push("child's date of birth");
  if (!profile?.phone) missing.push('your phone number for the form');
  if (!profile?.address?.street) missing.push('home address');
  if (!profile?.emergencyContacts?.length) missing.push('an emergency contact (name, relationship, phone)');
  if (child && !child.allergies) missing.push('allergies (or "none")');
  return missing;
}

/**
 * The prompt's view of the store: which fields are on file and which are missing, without the
 * values themselves (the fill tool reads those directly). Keeps a child's date of birth and
 * medical notes out of every turn's prompt.
 */
export function familyInfoLine(profile: FamilyProfile | undefined): string {
  if (!profile?.children?.length) return '';
  const lines = profile.children.map((c) => {
    const have = ['grade', 'lastName', 'dateOfBirth', 'gender', 'previousSchool', 'allergies', 'medicalNotes']
      .filter((k) => (c as unknown as Record<string, unknown>)[k])
      .join(', ');
    const missing = missingBasics(profile, c.name);
    return `- ${c.name}: on file ${have || 'name only'}${missing.length ? `; missing ${missing.join(', ')}` : ''}`;
  });
  const fam = [
    profile.address?.street ? 'address' : '',
    profile.phone ? 'phone' : '',
    profile.guardians?.length ? `${profile.guardians.length} other guardian(s)` : '',
    profile.emergencyContacts?.length ? `${profile.emergencyContacts.length} emergency contact(s)` : '',
    profile.authorizedPickups?.length ? `${profile.authorizedPickups.length} authorized pickup(s)` : '',
    profile.homeLanguage ? 'home language' : '',
  ].filter(Boolean);
  return (
    `FAMILY INFO ON FILE (for forms; skyvern_fill_form adds these values automatically — never ask for something on file):\n` +
    `${lines.join('\n')}\n- family: ${fam.length ? fam.join(', ') : 'nothing beyond names yet'}\n` +
    `Whenever the parent gives you any of these details, call save_profile right away so they are never asked twice.`
  );
}
