import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import {
  skyvernEnabled,
  skyvernApi,
  skyvernPollRun,
  deleteBrowserProfile,
  closeSession,
} from '../skyvern.js';
import { register, type Connector, type Connection, type ReadResult } from './index.js';
import { insertConnection, getConnectionById, updateConnection, markRevoked, type ConnectionRow } from './store.js';
import { logConsent } from '../consent.js';

/**
 * Parent-portal connector (Block 3c). A parent taps a takeover link, signs into their
 * OWN school portal (Aeries/PowerSchool/…) inside a Skyvern browser session, and taps
 * Done. We then save that session as a Skyvern browser PROFILE — the only thing we keep
 * is the `bp_...` handle. We never see or store the password, and we never store portal
 * HTML; reads return only the extracted schema.
 *
 * Skyvern REST used (verified against the Skyvern source, base /v1, x-api-key):
 *   POST /v1/browser_sessions   { timeout(min), generate_browser_profile, needs_live_view, url, browser_profile_id }
 *   POST /v1/run/tasks          { browser_session_id, url, prompt, max_steps, data_extraction_schema }
 *   POST /v1/browser_profiles   { name, browser_session_id } -> { browser_profile_id }
 *   DELETE /v1/browser_profiles/{bp}
 *   WS   /v1/stream/vnc/browser_session/{id}?apikey=&client_id=   (raw RFB — proxied by web.ts)
 */

interface PortalSeed {
  label: string;
  login_url: string;
  read_url?: string;
  extract_schema: Record<string, unknown>;
}

/** A generic read: whatever the portal exposes about the child's services. */
const DEFAULT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    meal_status: { type: 'string' },
    attendance: { type: 'string' },
    programs: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
};

/**
 * Seed configs. Start with one you can actually test; add districts as you go. A caller
 * may also pass explicit login_url/read_url/extract_schema to override the seed.
 */
const SEEDS: Record<string, PortalSeed> = {
  aeries: {
    label: 'Aeries parent portal',
    login_url: 'https://www.aeries.net/parent/',
    read_url: '',
    extract_schema: DEFAULT_SCHEMA,
  },
  powerschool: {
    label: 'PowerSchool parent portal',
    login_url: 'https://powerschool.com/parents/',
    read_url: '',
    extract_schema: DEFAULT_SCHEMA,
  },
};

function connectBaseUrl(): string {
  if (process.env.CONNECT_BASE_URL) return process.env.CONNECT_BASE_URL.replace(/\/$/, '');
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return `http://localhost:${process.env.WEB_PORT || 3000}`;
}

/** Pull a readable text blob out of a Skyvern run's `output`. */
function outputText(output: unknown): string {
  if (!output) return '';
  if (typeof output === 'string') return output;
  try {
    return JSON.stringify(output);
  } catch {
    return '';
  }
}

function isSignedIn(output: unknown): boolean {
  const t = outputText(output).toLowerCase();
  // "yes" without a "no" preceding it; also accept an explicit signed-in marker.
  return /\byes\b/.test(t) && !/\bno\b/.test(t.slice(0, 40));
}

export const parentPortalConnector: Connector = {
  kind: 'parent_portal',

  async beginConnect(familyId, cfg) {
    if (!skyvernEnabled()) return { connectionId: '', takeoverUrl: '', detail: 'Skyvern is not configured' };
    const portalType = String(cfg.portal_type ?? '').trim().toLowerCase();
    const seed = SEEDS[portalType];
    const loginUrl = String(cfg.login_url ?? seed?.login_url ?? '').trim();
    const readUrl = String(cfg.read_url ?? seed?.read_url ?? '').trim();
    const extractSchema = (cfg.extract_schema as Record<string, unknown> | undefined) ?? seed?.extract_schema ?? DEFAULT_SCHEMA;
    if (!/^https?:\/\//i.test(loginUrl)) {
      return { connectionId: '', takeoverUrl: '', detail: 'I need the portal login link (https://…).' };
    }

    // 1. Open a session that SAVES its profile when it ends (so the sign-in becomes
    //    reusable) and supports a live view (so the parent can drive it).
    const session = await skyvernApi('/v1/browser_sessions', {
      timeout: 30,
      generate_browser_profile: true,
      needs_live_view: true,
      url: loginUrl,
    });
    const browserSessionId = String(session?.browser_session_id ?? '');
    if (!browserSessionId) return { connectionId: '', takeoverUrl: '', detail: 'could not open a browser session' };

    // 2. Record the connection + a random takeover token.
    const connectToken = randomBytes(24).toString('hex');
    const row = await insertConnection({
      family_id: familyId,
      kind: 'parent_portal',
      method: 'browser',
      label: String(cfg.label ?? seed?.label ?? 'school portal'),
      portal_type: portalType || null,
      login_url: loginUrl,
      read_url: readUrl || loginUrl,
      extract_schema: extractSchema,
      skyvern_session_id: browserSessionId,
      status: 'awaiting_login',
      connect_token: connectToken,
    });
    if (!row) {
      await closeSession(browserSessionId);
      return { connectionId: '', takeoverUrl: '', detail: 'could not save the connection' };
    }

    return {
      connectionId: row.id,
      takeoverUrl: `${connectBaseUrl()}/connect/${connectToken}`,
      detail: 'awaiting_login',
    };
  },

  async finalizeConnect(connectionId) {
    const row = await getConnectionById(connectionId);
    if (!row) return { ok: false, detail: 'connection not found' };
    if (row.status === 'connected') return { ok: true };
    const sessionId = row.skyvern_session_id ?? '';
    if (!sessionId) return { ok: false, detail: 'no live session to finish' };

    // Verify a signed-in dashboard is actually visible (or a specific marker page).
    const check = await skyvernApi('/v1/run/tasks', {
      browser_session_id: sessionId,
      prompt:
        'Look at the current page. Is a signed-in user dashboard or account page visible (not a login form)? ' +
        'Reply with exactly "yes" or "no".',
      max_steps: 3,
    });
    const runId = String(check?.run_id ?? '');
    if (!runId) return { ok: false, detail: 'could not verify the sign-in' };
    const terminal = await skyvernPollRun(runId, 90000);
    if (!isSignedIn(terminal.output)) {
      return { ok: false, detail: 'still on the login page — finish signing in, then tap Done again' };
    }

    // Save the session's profile: this handle IS the credential we keep.
    const profile = await skyvernApi('/v1/browser_profiles', {
      name: `portal-${connectionId}`,
      browser_session_id: sessionId,
    });
    const bp = String(profile?.browser_profile_id ?? '');
    if (!bp) return { ok: false, detail: 'could not save the sign-in' };

    await updateConnection(connectionId, {
      skyvern_browser_profile_id: bp,
      skyvern_session_id: null,
      status: 'connected',
      consented_at: new Date().toISOString(),
      last_verified: new Date().toISOString(),
    });
    await closeSession(sessionId);
    await logConsent(row.family_id, 'connection:parent_portal', { portal_type: row.portal_type, portal: row.label });
    return { ok: true };
  },

  async load(connectionId) {
    const row = await getConnectionById(connectionId);
    if (!row || row.status !== 'connected' || !row.skyvern_browser_profile_id) return null;
    return makeConnection(row);
  },

  async revoke(connectionId) {
    const row = await getConnectionById(connectionId);
    if (!row) return { ok: false, detail: 'connection not found' };
    if (row.skyvern_browser_profile_id) await deleteBrowserProfile(row.skyvern_browser_profile_id);
    if (row.skyvern_session_id) await closeSession(row.skyvern_session_id);
    await markRevoked(connectionId);
    await logConsent(row.family_id, 'revoke', { kind: row.kind, portal: row.label });
    return { ok: true };
  },
};

/** A live, read-only view onto a connected portal. */
function makeConnection(row: ConnectionRow): Connection {
  const bp = row.skyvern_browser_profile_id!;
  return {
    id: row.id,
    kind: row.kind,
    method: row.method,
    label: row.label ?? 'school portal',
    async read(query: string): Promise<ReadResult> {
      // Restore the saved login into a fresh session.
      const session = await skyvernApi('/v1/browser_sessions', { timeout: 10, browser_profile_id: bp });
      const sid = String(session?.browser_session_id ?? '');
      if (!sid) return { ok: false, detail: 'could not open a portal session' };
      try {
        const run = await skyvernApi('/v1/run/tasks', {
          browser_session_id: sid,
          url: row.read_url || row.login_url,
          prompt:
            `You are reading a parent's own school portal on their behalf. Find and return the student's information for: ${query}. ` +
            `If a login form is shown instead of a signed-in page, STOP and reply exactly "NOT_LOGGED_IN". ` +
            `Return only the requested facts — do not click submit, pay, or change anything.`,
          max_steps: 8,
          ...(row.extract_schema ? { data_extraction_schema: row.extract_schema } : {}),
        });
        const runId = String(run?.run_id ?? '');
        if (!runId) return { ok: false, detail: 'could not read the portal' };
        const terminal = await skyvernPollRun(runId, 120000);
        const text = outputText(terminal.output);
        if (/NOT_LOGGED_IN/i.test(text)) {
          await updateConnection(row.id, { status: 'expired' });
          return { ok: false, expired: true, detail: 'your portal sign-in has expired' };
        }
        if (terminal.status !== 'completed') return { ok: false, detail: `portal read ${terminal.status}` };
        await updateConnection(row.id, { last_verified: new Date().toISOString() });
        return { ok: true, data: terminal.output };
      } finally {
        await closeSession(sid);
      }
    },
  };
}

register(parentPortalConnector);
