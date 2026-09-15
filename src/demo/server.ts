/**
 * Benny demo — the fictional institutions (the "life/coverage world" the agent acts on).
 *
 * Two institutions served from one process, so the demo harness and connectors have
 * real HTTP endpoints to hit while everything stays deterministic and offline:
 *
 *   /northstar/*  — "Northstar Benefits": the employer coverage portal (plan, dependents,
 *                   FSA balance, wellness/books stipend) + the claims ledger.
 *   /bright/*     — "Bright Pediatrics": the in-network provider directory (search + book).
 *
 * All data is seeded and in-memory; claims auto-advance "submitted → paid" so the
 * follow-through beat is observable. FICTION ONLY — nothing here touches a real account.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { demoCatalog } from './catalog.js';

// ── In-network providers (one deliberately out-of-network to show filtering) ──
export interface Provider {
  id: string;
  name: string;
  specialty: string;
  address: string;
  zip: string;
  inNetwork: boolean;
  networkId: string;
  nextSlots: string[];
}
const PROVIDERS: Provider[] = [
  { id: 'pr-reyes', name: 'Dr. Camila Reyes', specialty: 'Pediatrics', address: '221 Ocean St, Soquel, CA', zip: '95073', inNetwork: true, networkId: 'bright-net', nextSlots: ['Thu 3:40 PM', 'Fri 9:00 AM'] },
  { id: 'pr-chen', name: 'Dr. Marcus Chen', specialty: 'Pediatrics', address: '18 Bay Ave, Capitola, CA', zip: '95010', inNetwork: true, networkId: 'bright-net', nextSlots: ['Fri 1:20 PM', 'Mon 8:30 AM'] },
  { id: 'pr-okafor', name: 'Dr. Aisha Okafor', specialty: 'Pediatrics', address: '77 Ridge Rd, Aptos, CA', zip: '95003', inNetwork: false, networkId: 'other-net', nextSlots: ['Wed 11:00 AM'] },
];

interface Claim { reference: string; memberId: string; category: string; amountCents: number; description: string; status: 'submitted' | 'paid'; createdAt: number }
interface Appointment { confirmationId: string; providerId: string; providerName: string; dependentId: string; when: string; status: 'confirmed' | 'reminded'; createdAt: number }

const claims = new Map<string, Claim>();
const claimByKey = new Map<string, string>();
const appointments = new Map<string, Appointment>();

function json(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
function html(res: ServerResponse, code: number, body: string): void {
  res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c)));
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>; }
  catch { return {}; }
}

function scheduleAdvance(ref: string): void {
  // The "follow-through" beat: a claim flips to paid a moment after acceptance, so the
  // demo can poll and watch the money land (like the lab's $0 → realized transition).
  setTimeout(() => {
    const c = claims.get(ref);
    if (c && c.status === 'submitted') claims.set(ref, { ...c, status: 'paid' });
  }, 2500);
}

const NORTHSTAR_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Northstar Benefits</title><style>body{font-family:system-ui;max-width:640px;margin:40px auto;color:#0f172a} h1{font-size:20px} .muted{color:#64748b} .card{border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:12px 0} .badge{background:#eef2ff;color:#4338ca;border-radius:999px;padding:2px 10px;font-size:12px}</style></head><body>
<h1>Northstar Benefits <span class="badge">Demo — fictional</span></h1>
<p class="muted">Plan: ${demoCatalog.planName} · Network: ${demoCatalog.network.name}</p>
<div class="card"><b>Member:</b> ${demoCatalog.member.name}<br><b>Dependents:</b> ${demoCatalog.dependents.map(d => d.name).join(', ')}</div>
<div class="card"><b>Annual physical:</b> ${demoCatalog.benefits.preventive.costShare}<br><b>FSA balance:</b> $${(demoCatalog.benefits.fsa.balanceCents / 100).toFixed(2)} (ends ${demoCatalog.benefits.fsa.deadline})<br><b>Books stipend:</b> ${demoCatalog.benefits.wellness.unitsPerMonth}/month</div>
</body></html>`;

const BRIGHT_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Bright Pediatrics — find in-network care</title><style>body{font-family:system-ui;max-width:640px;margin:40px auto;color:#0f172a} h1{font-size:20px} .muted{color:#64748b} .badge{background:#eef2ff;color:#4338ca;border-radius:999px;padding:2px 10px;font-size:12px}</style></head><body>
<h1>Bright Pediatrics <span class="badge">Demo — fictional</span></h1>
<p class="muted">In-network providers for ${demoCatalog.network.name} · search &amp; book</p>
<form id="f"><input name="q" placeholder="pediatrics near 95073" value="pediatrics near 95073"><button>Search</button></form>
<ul id="r" style="list-style:none;padding:0"></ul>
<script type="module">
const d=await(await fetch('/bright/providers?specialty=pediatrics&zip=95073&network=bright-net')).json();
document.getElementById('r').innerHTML=d.map(p=>\`<li style="margin:8px 0"><b>${'${p.name}'}</b> — ${'${p.specialty}'} · ${'${p.address}'} · ${'${p.inNetwork ? "In-network" : "Out-of-network"}'} · ${'${p.nextSlots.join(", ")}'}</li>\`).join('');
</script></body></html>`;

export interface DemoServer { url: string; close: () => Promise<void>; reset: () => void }

export function startDemoServer(port = Number(process.env.DEMO_PORT) || 4310): Promise<DemoServer> {
  const server = createServer(async (req, res) => {
    try {
      const u = new URL(req.url ?? '/', 'http://demo.invalid');
      const path = u.pathname;

      // ── Northstar: coverage map ─────────────────────────────────────────────
      if (req.method === 'GET' && path === '/northstar/coverage/member-maya') {
        return json(res, 200, {
          employer: demoCatalog.employer, planName: demoCatalog.planName,
          member: demoCatalog.member, dependents: demoCatalog.dependents,
          network: demoCatalog.network, benefits: demoCatalog.benefits,
        });
      }

      // ── Northstar: claims ledger (FSA + wellness/books reimbursement) ───────
      if (req.method === 'POST' && path === '/northstar/claims') {
        const b = await readBody(req);
        const idempotencyKey = String(b.idempotencyKey ?? '');
        const existing = idempotencyKey ? claimByKey.get(idempotencyKey) : undefined;
        if (existing) return json(res, 200, claims.get(existing));
        const reference = `CLM-${randomUUID().slice(0, 8).toUpperCase()}`;
        const claim: Claim = {
          reference, memberId: String(b.memberId ?? ''), category: String(b.category ?? ''),
          amountCents: Number(b.amountCents ?? 0), description: String(b.description ?? ''),
          status: 'submitted', createdAt: Date.now(),
        };
        claims.set(reference, claim);
        if (idempotencyKey) claimByKey.set(idempotencyKey, reference);
        scheduleAdvance(reference);
        return json(res, 201, claim);
      }
      if (req.method === 'GET' && path.startsWith('/northstar/claims/')) {
        const claim = claims.get(path.slice('/northstar/claims/'.length));
        return claim ? json(res, 200, claim) : json(res, 404, { error: 'not found' });
      }

      // ── Bright: in-network directory + booking ──────────────────────────────
      if (req.method === 'GET' && path === '/bright/providers') {
        const network = u.searchParams.get('network') ?? '';
        const specialty = u.searchParams.get('specialty') ?? '';
        const zip = u.searchParams.get('zip') ?? '';
        const hits = PROVIDERS.filter(p =>
          (!specialty || p.specialty.toLowerCase() === specialty.toLowerCase()) &&
          (!zip || p.zip === zip) && (!network || p.networkId === network));
        return json(res, 200, hits);
      }
      if (req.method === 'POST' && path === '/bright/book') {
        const b = await readBody(req);
        const providerId = String(b.providerId ?? '');
        const provider = PROVIDERS.find(p => p.id === providerId && p.inNetwork);
        if (!provider) return json(res, 400, { error: 'provider not in-network or not found' });
        const confirmationId = `APT-${randomUUID().slice(0, 8).toUpperCase()}`;
        const appt: Appointment = {
          confirmationId, providerId, providerName: provider.name,
          dependentId: String(b.dependentId ?? ''), when: String(b.when ?? provider.nextSlots[0]),
          status: 'confirmed', createdAt: Date.now(),
        };
        appointments.set(confirmationId, appt);
        return json(res, 201, appt);
      }
      if (req.method === 'GET' && path.startsWith('/bright/appointments/')) {
        const appt = appointments.get(path.slice('/bright/appointments/'.length));
        return appt ? json(res, 200, appt) : json(res, 404, { error: 'not found' });
      }

      // ── Human-viewable landing pages ────────────────────────────────────────
      if (req.method === 'GET' && path === '/northstar/') return html(res, 200, NORTHSTAR_HTML);
      if (req.method === 'GET' && path === '/bright/') return html(res, 200, BRIGHT_HTML);
      if (req.method === 'GET' && path === '/health') return json(res, 200, { ok: true });

      return json(res, 404, { error: 'not found' });
    } catch (e) {
      console.error('[demo] server error:', (e as Error)?.message ?? e);
      json(res, 500, { error: 'internal' });
    }
  });

  return new Promise<DemoServer>((resolve) => {
    server.listen(port, () => resolve({
      url: `http://localhost:${port}`,
      close: () => new Promise((r) => server.close(() => r())),
      reset: () => { claims.clear(); claimByKey.clear(); appointments.clear(); },
    }));
  });
}
