import 'dotenv/config';
import { getSupabase } from './db.js';

/**
 * Consent audit log (Block 0). Every consequential consent the parent gives is
 * recorded here — onboarding, email monitoring, portal connection, and each
 * consent-gated action (submit/send/call/account). Best-effort: a logging failure
 * must never block the action the parent already approved.
 *
 * NEVER pass secrets or raw PII into `detail` — scope + target only (e.g. the URL
 * being submitted, or the portal type being connected).
 */
export type ConsentKind =
  | 'onboarding'
  | 'email_monitoring'
  | 'connection:parent_portal'
  | 'revoke'
  | `action:${string}`;

export async function logConsent(
  familyId: string,
  kind: ConsentKind,
  detail?: Record<string, unknown>,
): Promise<void> {
  if (!familyId) return;
  const c = getSupabase();
  if (!c) {
    console.log(`[consent] ${familyId} ${kind} ${detail ? JSON.stringify(detail) : ''}`.trim());
    return;
  }
  try {
    const { error } = await c.from('consent_event').insert({
      family_id: familyId,
      kind,
      detail: detail ?? null,
    });
    if (error) console.warn('[consent] insert failed:', error.message);
  } catch (e) {
    console.warn('[consent] insert error:', (e as Error)?.message ?? e);
  }
}

/** List a family's consent history, newest first (for a /connections-style page or audit). */
export async function listConsent(familyId: string, limit = 50): Promise<Array<{ kind: string; detail: unknown; createdAt: string }>> {
  const c = getSupabase();
  if (!c) return [];
  const { data, error } = await c
    .from('consent_event')
    .select('kind, detail, created_at')
    .eq('family_id', familyId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map((r) => ({ kind: r.kind as string, detail: r.detail, createdAt: String(r.created_at ?? '') }));
}
