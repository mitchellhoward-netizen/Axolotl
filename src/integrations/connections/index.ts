import { getConnection, getAwaitingConnection } from './store.js';

/**
 * Connector architecture (Block 3). A *connector* teaches the agent how to read one
 * kind of external source for a family (a school parent portal, later email/OAuth/MCP).
 * The agent only ever calls `readForFamily(familyId, kind, query)` — it never touches a
 * credential. Connectors store a handle (e.g. a Skyvern `bp_...` browser profile id),
 * never a password.
 *
 * READ-ONLY: connectors read. Any consequential action on portal data goes through the
 * existing consent-gated Step path (strict parent YES), never a connector.
 */

export interface ReadResult {
  ok: boolean;
  data?: unknown;
  detail?: string;
  /** The parent's login has lapsed — the caller should prompt them to reconnect. */
  expired?: boolean;
}

export interface Connection {
  id: string;
  kind: string;
  method: string;
  label: string;
  read(query: string): Promise<ReadResult>;
}

export interface Connector {
  kind: string;
  beginConnect(
    familyId: string,
    cfg: Record<string, unknown>,
  ): Promise<{ connectionId: string; takeoverUrl: string; detail?: string }>;
  finalizeConnect(connectionId: string): Promise<{ ok: boolean; detail?: string }>;
  load(connectionId: string): Promise<Connection | null>;
  /** Delete any remote handle (browser profile) and mark the row revoked. */
  revoke(connectionId: string): Promise<{ ok: boolean; detail?: string }>;
}

const registry = new Map<string, Connector>();

export function register(c: Connector): void {
  registry.set(c.kind, c);
}

export function connectorFor(kind: string): Connector | undefined {
  return registry.get(kind);
}

export function registeredKinds(): string[] {
  return [...registry.keys()];
}

/**
 * Read from a family's connection of `kind`. Returns `{ ok:false, detail:'not connected' }`
 * when there is no live connection (the caller then offers `connect_portal`).
 */
export async function readForFamily(familyId: string, kind: string, query: string): Promise<ReadResult> {
  const row = await getConnection(familyId, kind); // family-scoped
  if (!row) return { ok: false, detail: 'not connected' };
  if (row.status === 'awaiting_login') return { ok: false, detail: 'waiting for you to finish signing in' };
  if (row.status !== 'connected') return { ok: false, detail: `connection is ${row.status}` };
  const conn = connectorFor(kind);
  if (!conn) return { ok: false, detail: `no connector for ${kind}` };
  const loaded = await conn.load(row.id);
  if (!loaded) return { ok: false, detail: 'load failed' };
  return loaded.read(query);
}

/**
 * The parent texted "DONE" after signing in (the iMessage-friendly path — the takeover
 * page's Done button does the same thing). Finalize the family's awaiting connection.
 * Returns null when there is nothing waiting (so the caller falls through normally).
 */
export async function finalizePendingForFamily(
  familyId: string,
): Promise<{ ok: boolean; detail?: string; label?: string } | null> {
  const row = await getAwaitingConnection(familyId);
  if (!row) return null;
  const conn = connectorFor(row.kind);
  if (!conn) return { ok: false, detail: `no connector for ${row.kind}`, label: row.label ?? undefined };
  const res = await conn.finalizeConnect(row.id);
  return { ...res, label: row.label ?? row.portal_type ?? undefined };
}
