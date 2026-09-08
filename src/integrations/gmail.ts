import 'dotenv/config';
import type { EmailMessage, EmailProvider, EmailReceipt } from './email.js';
import { getSupabase } from './db.js';

/**
 * Gmail (Google Workspace / personal Gmail) email integration for sending FROM
 * the parent's own address. The parent connects their Google account (OAuth,
 * `gmail.send` scope) — the "gate" — and the agent drafts the message and sends
 * it as them, still gated behind the parent's explicit consent upstream.
 *
 * Reads config from env:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI.
 * Per-parent tokens are persisted in Supabase (`gmail_token`) keyed by guardian id.
 */

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly', // inbound ingest (school replies)
];

function cfg(): { clientId: string; clientSecret: string; redirectUri: string } {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI ?? '',
  };
}

/** A stored token record for a connected parent. */
export interface GmailToken {
  guardianId: string;
  email?: string;
  refreshToken: string;
  accessToken: string;
  expiresAt?: number;
}

/** The URL a parent visits to connect their Google account (send-as + read). */
export function buildGmailAuthUrl(state?: string, redirectUri?: string): string {
  const c = cfg();
  const params = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: redirectUri ?? c.redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
  });
  if (state) params.set('state', state);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/** The tap-able connect link to hand a parent (state = their guardian id). */
export function gmailConnectUrl(guardianId: string): string {
  const host =
    process.env.RAILWAY_PUBLIC_DOMAIN ||
    process.env.GOOGLE_REDIRECT_URI?.replace(/\/oauth\/gmail\/callback$/, '') ||
    'http://localhost:3000';
  return `${host}/oauth/gmail?state=${encodeURIComponent(guardianId)}`;
}

/** Exchange an authorization code for access + refresh tokens. */
export async function exchangeGmailCode(code: string, redirectUri?: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  email?: string;
}> {
  const c = cfg();
  const body = new URLSearchParams({
    code,
    client_id: c.clientId,
    client_secret: c.clientSecret,
    redirect_uri: redirectUri ?? c.redirectUri,
    grant_type: 'authorization_code',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Google token exchange ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!j.access_token) throw new Error('Google token exchange returned no access_token');
  return { accessToken: j.access_token, refreshToken: j.refresh_token ?? '', expiresIn: j.expires_in ?? 3600 };
}

/** Get a fresh access token from a refresh token. */
export async function refreshGmailAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
  const c = cfg();
  const body = new URLSearchParams({
    client_id: c.clientId,
    client_secret: c.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Google token refresh ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) throw new Error('Google token refresh returned no access_token');
  return { accessToken: j.access_token, expiresIn: j.expires_in ?? 3600 };
}

/** The authenticated user's Gmail address (for the From header / display). */
export async function fetchGmailAddress(accessToken: string): Promise<string> {
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return '';
  const j = (await res.json()) as { emailAddress?: string };
  return j.emailAddress ?? '';
}

function rfc2822Message(msg: EmailMessage): string {
  const headers: string[] = [
    msg.from ? `From: ${msg.from}` : 'From: me',
    `To: ${msg.to}`,
    `Subject: ${msg.subject.replace(/[\r\n]/g, ' ')}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
  ];
  return headers.join('\r\n') + msg.body;
}

/** Send a message FROM the connected parent's account via the Gmail API. */
export class GmailEmailProvider implements EmailProvider {
  constructor(
    private readonly getAccessToken: () => Promise<string>,
    private readonly from?: string,
  ) {}

  async send(msg: EmailMessage): Promise<EmailReceipt> {
    const token = await this.getAccessToken();
    const raw = Buffer.from(rfc2822Message({ ...msg, from: this.from || msg.from }), 'utf8').toString('base64url');
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Gmail send ${res.status}: ${text.slice(0, 200)}`);
    const j = (JSON.parse(text) as { id?: string }) ?? {};
    return { sent: true, id: j.id };
  }
}

// ── Per-parent token persistence (Supabase `gmail_token`) ────────────────────

export async function saveGmailToken(guardianId: string, tok: GmailToken): Promise<void> {
  const c = getSupabase();
  if (!c) return;
  await c.from('gmail_token').upsert(
    {
      guardian_id: guardianId,
      email: tok.email ?? null,
      refresh_token: tok.refreshToken,
      access_token: tok.accessToken,
      expires_at: tok.expiresAt ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'guardian_id' },
  );
}

export async function getGmailToken(guardianId: string): Promise<GmailToken | undefined> {
  const c = getSupabase();
  if (!c) return undefined;
  const { data, error } = await c
    .from('gmail_token')
    .select('guardian_id, email, refresh_token, access_token, expires_at')
    .eq('guardian_id', guardianId)
    .maybeSingle();
  if (error || !data) return undefined;
  return {
    guardianId: data.guardian_id,
    email: data.email ?? undefined,
    refreshToken: data.refresh_token ?? '',
    accessToken: data.access_token ?? '',
    expiresAt: data.expires_at ? new Date(data.expires_at).getTime() : undefined,
  };
}

/** Build a Gmail provider for a connected parent, or null if they haven't connected. */
export async function gmailProviderFor(guardianId: string): Promise<GmailEmailProvider | null> {
  const tok = await getGmailToken(guardianId);
  if (!tok?.refreshToken && !tok?.accessToken) return null;
  const getAccessToken = async (): Promise<string> => {
    // Refresh if we have a refresh token (always the durable path).
    if (tok.refreshToken) {
      try {
        const { accessToken } = await refreshGmailAccessToken(tok.refreshToken);
        tok.accessToken = accessToken;
        return accessToken;
      } catch (e) {
        throw new Error(`Gmail auth expired (${(e as Error)?.message ?? ''})`);
      }
    }
    if (tok.accessToken) return tok.accessToken;
    throw new Error('No Gmail token available to send.');
  };
  return new GmailEmailProvider(getAccessToken, tok.email);
}
