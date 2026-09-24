import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Website signups: the family pilot, a parent circle, and school pilot requests.
 *
 * All three land in one `waitlist` table with a `kind` column, so the three
 * audiences stay separable with a query (and one endpoint stays the contract the
 * site already posts to) instead of three tables with three drifting validators.
 * See db/signups.sql for the columns.
 *
 * This module is shared by the Vercel function (api/waitlist.ts) and the
 * long-lived host (src/integrations/web.ts), which is the point: the rules about
 * what a valid signup is live in exactly one place.
 */

export type SignupKind = 'family' | 'circle' | 'school';

export interface SignupRow {
  kind: SignupKind;
  phone?: string;
  email?: string;
  name?: string;
  role?: string;
  school?: string;
  families?: string;
  message?: string;
}

/** Must match the options rendered by the circle form (tools/site/strings.*.mjs). */
export const FAMILY_SIZES = ['2 to 3', '4 to 6', '7 or more'];

export type ParseResult =
  | { ok: true; row: SignupRow }
  | { ok: false; error: string };

const str = (value: unknown, max: number): string => {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
};

/** US numbers only, which is what the copy promises: 10 digits, or 11 with a 1. */
export function isUsPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate a posted signup. Unknown kinds are rejected rather than defaulted, so
 * a typo cannot silently file a school request as a family.
 */
export function parseSignup(input: unknown): ParseResult {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Invalid signup' };
  const body = input as Record<string, unknown>;
  const kind = body.kind === undefined ? 'family' : str(body.kind, 16);
  if (kind !== 'family' && kind !== 'circle' && kind !== 'school') {
    return { ok: false, error: 'Invalid signup type' };
  }

  if (kind === 'school') {
    const name = str(body.name, 120);
    const role = str(body.role, 120);
    const school = str(body.school, 160);
    const email = str(body.email, 254);
    if (!name || !role || !school || !EMAIL.test(email)) {
      return { ok: false, error: 'Name, role, school and a valid email are required' };
    }
    return { ok: true, row: { kind, name, role, school, email, message: str(body.message, 2000) } };
  }

  const phone = str(body.phone, 32);
  if (!isUsPhone(phone)) return { ok: false, error: 'A 10-digit US phone number is required' };

  if (kind === 'circle') {
    const families = str(body.families, 20);
    if (!FAMILY_SIZES.includes(families)) return { ok: false, error: 'How many families is required' };
    return { ok: true, row: { kind, phone, families, school: str(body.school, 160) } };
  }

  return { ok: true, row: { kind, phone } };
}

/** The text a family or circle signup gets back. School requests are answered by email. */
export function confirmationText(row: SignupRow): string | null {
  if (row.kind === 'family') {
    return "Hey — you're on the list. We'll text you when it's your turn to use Axolotl.";
  }
  if (row.kind === 'circle') {
    return "Hey — you're on the list. We'll text you when circles open.";
  }
  return null;
}

let sb: SupabaseClient | null = null;
function getSb(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  // The service role key only: db/signups.sql revokes the table from anon and
  // grants it to service_role, so an anon key here would fail at insert time.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!sb) sb = createClient(url, key, { auth: { persistSession: false } });
  return sb;
}

/** Store a signup. Returns an error message, or null on success. */
export async function addSignup(row: SignupRow): Promise<string | null> {
  const c = getSb();
  if (!c) return 'Supabase not configured (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).';
  const { error } = await c.from('waitlist').insert(row);
  if (error) return error.message;
  return null;
}
