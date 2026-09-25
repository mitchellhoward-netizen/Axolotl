import 'dotenv/config';
import { getSupabase } from './db.js';

/**
 * The people a family relies on for school logistics — grandma, the sitter, a partner, the
 * parents they trade pickups with — and the relays that carry their replies back.
 *
 * Axolotl texts one of these people only after the parent has approved the exact message
 * with a strict YES (the step executor's consent gate). A contact is someone the PARENT
 * added, so a number that appeared in an email or on a web page can never become a
 * recipient: `text_family_contact` resolves only against this list or a number the parent
 * typed themselves.
 *
 * When we text a contact we open a relay keyed by their phone, so their answer ("yes, I've
 * got them") is passed to the parent's conversation instead of being treated as a stranger
 * starting their own. Durable in Supabase when configured (db/family-contacts.sql), in
 * memory otherwise.
 */

export interface FamilyContact {
  familyId: string;
  /** E.164, e.g. +15555550142. */
  phone: string;
  /** What the parent calls them: "Grandma", "Dana". */
  name: string;
  /** grandparent, sitter, partner, parent friend, ... */
  relation?: string;
  /** Backup order: 1 is the first person to ask. */
  rank?: number;
}

export interface ContactRelay {
  contactPhone: string;
  familyId: string;
  /** The parent's conversation (iMessage space id) the reply goes to. */
  conversationId: string;
  /** The Axolotl line the text went out on, for multi-line setups. */
  linePhone?: string;
  contactName: string;
  expiresAt: Date;
}

/** How long a contact's reply is still routed to the parent after we text them. */
export const RELAY_TTL_MS = 72 * 60 * 60 * 1000;

const contactsMem = new Map<string, FamilyContact[]>();
const relaysMem = new Map<string, ContactRelay>();

/** Test seam: forget everything held in memory. */
export function resetFamilyContactsMemory(): void {
  contactsMem.clear();
  relaysMem.clear();
}

/**
 * A US-first phone normaliser: ten digits (or eleven starting with 1) become +1…, and an
 * explicit +country number is kept. Anything else is not a phone we will text.
 */
export function normalizeContactPhone(input: string): string | undefined {
  const raw = String(input ?? '').trim();
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : undefined;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return undefined;
}

function sortByRank(list: FamilyContact[]): FamilyContact[] {
  return [...list].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || a.name.localeCompare(b.name));
}

/** Add or update a contact (keyed by family + phone). */
export async function saveFamilyContact(contact: FamilyContact): Promise<FamilyContact> {
  const list = (contactsMem.get(contact.familyId) ?? []).filter((c) => c.phone !== contact.phone);
  list.push(contact);
  contactsMem.set(contact.familyId, sortByRank(list));
  const c = getSupabase();
  if (c) {
    try {
      const { error } = await c.from('family_contact').upsert(
        {
          family_id: contact.familyId,
          phone: contact.phone,
          name: contact.name,
          relation: contact.relation ?? null,
          rank: contact.rank ?? null,
        },
        { onConflict: 'family_id,phone' },
      );
      if (error) throw new Error(error.message);
    } catch (e) {
      console.error('[contacts] save to Supabase failed (memory only) — apply db/family-contacts.sql:', (e as Error)?.message ?? e);
    }
  }
  return contact;
}

/** The family's contacts, backup order first. */
export async function listFamilyContacts(familyId: string): Promise<FamilyContact[]> {
  if (!familyId) return [];
  const c = getSupabase();
  if (c) {
    try {
      const { data, error } = await c
        .from('family_contact')
        .select('family_id, phone, name, relation, rank')
        .eq('family_id', familyId);
      if (error) throw new Error(error.message);
      if (data) {
        const rows = (data as Array<{ family_id: string; phone: string; name: string; relation: string | null; rank: number | null }>).map(
          (r) => ({
            familyId: r.family_id,
            phone: r.phone,
            name: r.name,
            relation: r.relation ?? undefined,
            rank: r.rank ?? undefined,
          }),
        );
        if (rows.length) return sortByRank(rows);
      }
    } catch (e) {
      console.error('[contacts] list from Supabase failed (memory only):', (e as Error)?.message ?? e);
    }
  }
  return contactsMem.get(familyId) ?? [];
}

/**
 * Find a contact by what the parent or the agent called them: a name ("Dana"), a relation
 * ("grandma", "the sitter"), a phone number, or "first"/"backup" for the top of the list.
 */
export async function findFamilyContact(familyId: string, query: string): Promise<FamilyContact | undefined> {
  const list = await listFamilyContacts(familyId);
  if (!list.length) return undefined;
  const q = String(query ?? '').trim().toLowerCase().replace(/^(my|our|the)\s+/, '');
  if (!q) return undefined;
  const phone = normalizeContactPhone(q);
  if (phone) return list.find((c) => c.phone === phone);
  if (/^(first|backup|first backup|backup list|whoever is first)$/.test(q)) return list[0];
  return (
    list.find((c) => c.name.toLowerCase() === q) ??
    list.find((c) => (c.relation ?? '').toLowerCase() === q) ??
    list.find((c) => c.name.toLowerCase().includes(q) || q.includes(c.name.toLowerCase())) ??
    list.find((c) => (c.relation ?? '').toLowerCase().includes(q))
  );
}

/** Open (or replace) the relay for a contact we just texted. */
export async function recordContactRelay(relay: Omit<ContactRelay, 'expiresAt'> & { expiresAt?: Date }): Promise<ContactRelay> {
  const full: ContactRelay = { ...relay, expiresAt: relay.expiresAt ?? new Date(Date.now() + RELAY_TTL_MS) };
  relaysMem.set(full.contactPhone, full);
  const c = getSupabase();
  if (c) {
    try {
      const { error } = await c.from('contact_relay').upsert(
        {
          contact_phone: full.contactPhone,
          family_id: full.familyId,
          conversation_id: full.conversationId,
          line_phone: full.linePhone ?? null,
          contact_name: full.contactName,
          expires_at: full.expiresAt.toISOString(),
        },
        { onConflict: 'contact_phone' },
      );
      if (error) throw new Error(error.message);
    } catch (e) {
      console.error('[contacts] relay to Supabase failed (memory only) — apply db/family-contacts.sql:', (e as Error)?.message ?? e);
    }
  }
  return full;
}

/** The live relay for a phone that just texted us, if we recently texted them for a family. */
export async function activeContactRelay(phone: string, now: Date = new Date()): Promise<ContactRelay | undefined> {
  const contactPhone = normalizeContactPhone(phone);
  if (!contactPhone) return undefined;
  const c = getSupabase();
  if (c) {
    try {
      const { data, error } = await c
        .from('contact_relay')
        .select('contact_phone, family_id, conversation_id, line_phone, contact_name, expires_at')
        .eq('contact_phone', contactPhone)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (data) {
        const r = data as {
          contact_phone: string;
          family_id: string;
          conversation_id: string;
          line_phone: string | null;
          contact_name: string;
          expires_at: string;
        };
        const relay: ContactRelay = {
          contactPhone: r.contact_phone,
          familyId: r.family_id,
          conversationId: r.conversation_id,
          linePhone: r.line_phone ?? undefined,
          contactName: r.contact_name,
          expiresAt: new Date(r.expires_at),
        };
        return relay.expiresAt > now ? relay : undefined;
      }
    } catch (e) {
      console.error('[contacts] relay lookup in Supabase failed (memory only):', (e as Error)?.message ?? e);
    }
  }
  const relay = relaysMem.get(contactPhone);
  return relay && relay.expiresAt > now ? relay : undefined;
}

/**
 * The exact text a contact receives. It says who it is from and that a reply reaches the
 * parent, so nobody is left wondering why an unknown number is asking about pickup.
 */
export function composeContactText(input: { message: string; parentName?: string; lang?: 'en' | 'es' }): string {
  const who = input.parentName?.trim();
  const sign =
    input.lang === 'es'
      ? `— Axolotl, de parte de ${who || 'la familia'}. Responde aquí y se lo paso.`
      : `— Axolotl, texting for ${who || 'the family'}. Reply here and I'll pass it on.`;
  return `${input.message.trim()}\n\n${sign}`;
}

/** What the parent sees when a contact answers. */
export function relayToParentText(contactName: string, reply: string): string {
  return `${contactName} replied: "${reply.trim()}"`;
}

/** The one-line thank-you the contact gets after their reply is passed on. */
export function relayAckText(parentName?: string): string {
  return parentName?.trim() ? `Thanks, I've passed that on to ${parentName.trim()}.` : `Thanks, I've passed that on.`;
}
