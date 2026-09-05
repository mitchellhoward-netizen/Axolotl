import 'dotenv/config';
import { getSupabase } from './db.js';
import { createSmsSender, normalizeE164 } from './sms.js';

/**
 * Phone + one-time SMS-code identity verification.
 *
 * Phone (E.164) is the identity key. For a first contact from a number we don't
 * yet trust, we text a 6-digit code (via the SMS sender) and the parent replies
 * with it (over iMessage). Proving possession of the number gates onboarding.
 * In-memory authoritative; Supabase (`verification`) persisted for durability.
 */

const CODE_TTL_MS = 5 * 60 * 1000; // 5 min
const MAX_ATTEMPTS = 5;
const THROTTLE_MS = 30 * 1000; // don't resend more often than 30s per number

interface Record {
  code: string;
  expiresAt: number;
  attempts: number;
  createdAt: number;
}

const codes = new Map<string, Record>();
const verified = new Set<string>();

export type StartResult = { ok: true; code: string } | { ok: false; reason: 'too_soon' };
export type VerifyResult = { ok: true } | { ok: false; reason: 'invalid' | 'expired' | 'locked' };

const now = () => Date.now();

async function persistCode(p: string, rec: Record): Promise<void> {
  const c = getSupabase();
  if (!c) return;
  try {
    const row = {
      phone: p,
      code: rec.code,
      expires_at: rec.expiresAt,
      attempts: rec.attempts,
      created_at: new Date(rec.createdAt).toISOString(),
    };
    const { error } = await c.from('verification').upsert(row, { onConflict: 'phone' });
    if (error) throw new Error(error.message);
  } catch (e) {
    console.error('[verify] persist failed (memory only):', (e as Error)?.message ?? e);
  }
}

async function persistVerified(p: string): Promise<void> {
  const c = getSupabase();
  if (!c) return;
  try {
    const { error } = await c
      .from('verification')
      .update({ verified_at: new Date().toISOString() })
      .eq('phone', p);
    if (error) throw new Error(error.message);
  } catch (e) {
    console.error('[verify] persistVerified failed (memory only):', (e as Error)?.message ?? e);
  }
}

/** Start a verification for a phone. Returns the code (caller sends it as SMS). */
export async function startVerification(phone: string): Promise<StartResult> {
  const p = normalizeE164(phone);
  if (!p) return { ok: false, reason: 'too_soon' };
  const existing = codes.get(p);
  if (existing && now() - existing.createdAt < THROTTLE_MS) return { ok: false, reason: 'too_soon' };
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const rec: Record = { code, expiresAt: now() + CODE_TTL_MS, attempts: 0, createdAt: now() };
  codes.set(p, rec);
  await persistCode(p, rec);
  return { ok: true, code };
}

/** Verify a submitted code. */
export async function verifyCode(phone: string, submitted: string): Promise<VerifyResult> {
  const p = normalizeE164(phone);
  const rec = codes.get(p);
  if (!rec) return { ok: false, reason: 'expired' };
  if (now() > rec.expiresAt) {
    codes.delete(p);
    return { ok: false, reason: 'expired' };
  }
  if (rec.attempts >= MAX_ATTEMPTS) {
    codes.delete(p);
    return { ok: false, reason: 'locked' };
  }
  if (rec.code !== submitted.trim()) {
    rec.attempts++;
    codes.set(p, rec);
    if (rec.attempts >= MAX_ATTEMPTS) codes.delete(p);
    else await persistCode(p, rec);
    return { ok: false, reason: 'invalid' };
  }
  codes.delete(p);
  verified.add(p);
  await persistVerified(p);
  return { ok: true };
}

/** Has this phone already been verified this session? */
export async function isVerified(phone: string): Promise<boolean> {
  const p = normalizeE164(phone);
  if (!p) return false;
  if (verified.has(p)) return true;
  const c = getSupabase();
  if (c) {
    try {
      const { data, error } = await c.from('verification').select('verified_at').eq('phone', p).maybeSingle();
      if (!error && data?.verified_at) {
        verified.add(p);
        return true;
      }
    } catch {
      /* fall through */
    }
  }
  return false;
}

/** Send a verification code by SMS (returns the sender result). */
export async function sendVerificationCode(phone: string, code: string): Promise<{ ok: boolean; error?: string }> {
  const sms = createSmsSender();
  if (!sms) return { ok: false, error: 'No SMS provider configured.' };
  const message = `Your Axolotl confirmation code is ${code}. It expires in 5 minutes.`;
  const r = await sms.send(normalizeE164(phone), message);
  return { ok: r.ok, error: r.error };
}
