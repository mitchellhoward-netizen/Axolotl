/**
 * Benny demo — the fictional institutions (the "life/coverage world" the agent acts on).
 *
 * Two institutions served from one process, so the demo harness and connectors have
 * real HTTP endpoints to hit while everything stays deterministic and offline:
 *
 *   /school/*     — "Soquel Elementary": the parent inbox (a week of school messages,
 *                   exactly one of which needs a parent to act) + the form it is waiting on.
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
  /** What this visit costs the member AFTER the plan's in-network rate (0 = fully covered). */
  estimateCents?: number;
}
const PROVIDERS: Provider[] = [
  { id: 'pr-reyes', name: 'Dr. Camila Reyes', specialty: 'Pediatrics', address: '221 Ocean St, Soquel, CA', zip: '95073', inNetwork: true, networkId: 'bright-net', nextSlots: ['Thu 3:40 PM', 'Fri 9:00 AM'], estimateCents: 0 },
  { id: 'pr-chen', name: 'Dr. Marcus Chen', specialty: 'Pediatrics', address: '18 Bay Ave, Capitola, CA', zip: '95010', inNetwork: true, networkId: 'bright-net', nextSlots: ['Fri 1:20 PM', 'Mon 8:30 AM'], estimateCents: 0 },
  { id: 'pr-okafor', name: 'Dr. Aisha Okafor', specialty: 'Pediatrics', address: '77 Ridge Rd, Aptos, CA', zip: '95003', inNetwork: false, networkId: 'other-net', nextSlots: ['Wed 11:00 AM'] },
  // A school form needs a dentist's signature — the exam isn't a covered preventive, so
  // there's a real out-of-pocket cost. That's the money the plan (via the FSA) then handles.
  { id: 'pr-sato', name: 'Dr. Elena Sato, DDS', specialty: 'Dentistry', address: '412 Capitola Rd, Santa Cruz, CA', zip: '95062', inNetwork: true, networkId: 'bright-net', nextSlots: ['Fri 1:20 PM', 'Tue 4:10 PM'], estimateCents: 8_500 },
  { id: 'pr-nunez', name: 'Dr. Paul Nunez, DDS', specialty: 'Dentistry', address: '9 Soquel Dr, Santa Cruz, CA', zip: '95062', inNetwork: false, networkId: 'other-net', nextSlots: ['Mon 10:00 AM'] },
];

interface Claim { reference: string; memberId: string; category: string; amountCents: number; description: string; status: 'submitted' | 'paid'; createdAt: number }
interface Appointment { confirmationId: string; providerId: string; providerName: string; dependentId: string; when: string; status: 'confirmed' | 'reminded'; createdAt: number }

// ── Bookstore + Ramp (the merchant purchase and the employer's spend platform) ──
export interface Book { id: string; title: string; author: string; priceCents: number; format: string }
const BOOKS: Book[] = [
  { id: 'bk-cholera', title: 'Love in the Time of Cholera', author: 'Gabriel García Márquez', priceCents: 1799, format: 'Paperback' },
  { id: 'bk-solitude', title: 'One Hundred Years of Solitude', author: 'Gabriel García Márquez', priceCents: 1899, format: 'Paperback' },
  { id: 'bk-chronicle', title: 'Chronicle of a Death Foretold', author: 'Gabriel García Márquez', priceCents: 1599, format: 'Paperback' },
  { id: 'bk-design', title: 'The Design of Everyday Things', author: 'Don Norman', priceCents: 2199, format: 'Paperback' },
  { id: 'bk-thinking', title: 'Thinking, Fast and Slow', author: 'Daniel Kahneman', priceCents: 1999, format: 'Paperback' },
];
interface BookOrder { orderId: string; bookId: string; title: string; author: string; priceCents: number; status: 'ordered'; eta: string; createdAt: number }
interface RampExpense { reference: string; merchant: string; amountCents: number; category: string; description: string; status: 'submitted' | 'reimbursed'; createdAt: number }

// ── EAP therapists (the plan's network directory) ───────────────────────────
export interface Therapist { id: string; name: string; credentials: string; focus: string; inNetwork: boolean; networkId: string; nextSlots: string[]; telehealth: boolean }
const THERAPISTS: Therapist[] = [
  { id: 'th-whitfield', name: 'Dana Whitfield', credentials: 'LCSW', focus: 'anxiety, parenting stress', inNetwork: true, networkId: 'bright-net', nextSlots: ['Tue 6:00 PM', 'Thu 7:30 PM'], telehealth: true },
  { id: 'th-raman', name: 'Priya Raman', credentials: 'LMFT', focus: 'family + kids', inNetwork: true, networkId: 'bright-net', nextSlots: ['Wed 5:30 PM', 'Sat 9:00 AM'], telehealth: true },
  { id: 'th-adeyemi', name: 'Samuel Adeyemi', credentials: 'PhD', focus: 'adolescents', inNetwork: false, networkId: 'other-net', nextSlots: ['Mon 4:00 PM'], telehealth: false },
];
interface TherapistRequest { reference: string; therapistId: string; therapistName: string; when: string; status: 'requested' | 'accepted'; createdAt: number }

// ── The school (the DEMAND side: where the need actually shows up) ───────────
// A week of real-shaped school communication. Seven of these are genuinely FYI and one
// needs a parent to act — which is the whole point: the inbox is loud, the signal is thin,
// and the signal happens to be the one thing an employer benefit can pay for.
export interface SchoolMessage {
  id: string;
  from: string;
  receivedAt: string;
  subject: string;
  body: string;
  needsAction: boolean;
  /** Machine-readable class of the ask (only meaningful when needsAction). */
  actionType?: string;
  /** Set only on the actionable one — the form the school is waiting for. */
  formId?: string;
  due?: string;
  dependentId?: string;
}
export interface SchoolInbox {
  id: string; name: string; child: string; messages: SchoolMessage[];
}
export interface SchoolFormReceipt {
  confirmationId: string; formId: string; status: 'received'; submittedAt: string;
  attachments: string[];
}

const SCHOOL = { id: 'soquel-elementary', name: 'Soquel Elementary', child: 'Leo' };

const SCHOOL_MESSAGES: SchoolMessage[] = [
  {
    id: 'msg-health', from: 'Soquel Elementary — Office', receivedAt: 'Mon 7:42 AM',
    subject: 'Kindergarten health requirements — due Oct 15',
    body:
      'Every incoming kindergartener must have a physical exam and an oral health assessment on file ' +
      'before Oct 15. Both forms must be signed by your provider. Leo is missing both.',
    needsAction: true, actionType: 'health_requirement',
    formId: 'form-health-2026', due: 'Oct 15', dependentId: 'dep-leo',
  },
  { id: 'msg-pictures', from: 'Soquel Elementary — Office', receivedAt: 'Mon 9:10 AM', subject: 'Picture day is Thursday', body: 'Class photos Thursday morning. Order forms went home in backpacks.', needsAction: false },
  { id: 'msg-bookfair', from: 'Soquel PTA', receivedAt: 'Mon 11:03 AM', subject: 'Book fair Oct 6–10 — volunteers needed', body: 'The fall book fair runs all next week in the library.', needsAction: false },
  { id: 'msg-early', from: 'Soquel Elementary — Office', receivedAt: 'Tue 6:55 AM', subject: 'Early dismissal Wed 1:15 PM (parent conferences)', body: 'Wednesday is a minimum day for conferences. Pick-up is 1:15 PM.', needsAction: false },
  { id: 'msg-volunteer', from: 'Ms. Alvarez (Room 4)', receivedAt: 'Tue 2:20 PM', subject: 'Classroom volunteers — sign-up open', body: 'We need two helpers for Thursday centers.', needsAction: false },
  { id: 'msg-fundraiser', from: 'Soquel PTA', receivedAt: 'Wed 8:00 AM', subject: 'Fall fundraiser: cookie dough through Oct 20', body: 'Order forms due Oct 20. Proceeds go to the playground fund.', needsAction: false },
  { id: 'msg-holiday', from: 'Soquel Elementary — Office', receivedAt: 'Wed 4:15 PM', subject: 'No school Nov 11 (Veterans Day)', body: 'School is closed Tuesday, Nov 11. After-school care is also closed.', needsAction: false },
  { id: 'msg-newsletter', from: "Principal Okafor", receivedAt: 'Fri 3:30 PM', subject: "Principal's newsletter — October", body: 'Attendance, the new drop-off loop, and conference week.', needsAction: false },
];

const schoolSubmissions = new Map<string, SchoolFormReceipt>();

function schoolInbox(): SchoolInbox {
  return {
    id: SCHOOL.id, name: SCHOOL.name, child: SCHOOL.child,
    messages: SCHOOL_MESSAGES.map((m) => {
      const done = m.formId ? schoolSubmissions.get(m.formId) : undefined;
      return done ? { ...m, needsAction: false } : { ...m };
    }),
  };
}

const claims = new Map<string, Claim>();
const claimByKey = new Map<string, string>();
const appointments = new Map<string, Appointment>();
const bookOrders = new Map<string, BookOrder>();
const bookOrderByKey = new Map<string, string>();
const rampExpenses = new Map<string, RampExpense>();
const rampByKey = new Map<string, string>();
const therapistRequests = new Map<string, TherapistRequest>();
const therapistByKey = new Map<string, string>();

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
  // Real claims don't settle instantly. Slow enough that "did it get paid?" has a real
  // answer ("not yet"), then flips — so the follow-through is earned, not instant.
  setTimeout(() => {
    const c = claims.get(ref);
    if (c && c.status === 'submitted') claims.set(ref, { ...c, status: 'paid' });
  }, 25_000);
}

/** Ramp reimburses on its own clock — slower still, on purpose. */
function scheduleRampReimbursement(ref: string): void {
  setTimeout(() => {
    const e = rampExpenses.get(ref);
    if (e && e.status === 'submitted') rampExpenses.set(ref, { ...e, status: 'reimbursed' });
  }, 45_000);
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

function schoolPage(): string {
  const rows = schoolInbox().messages
    .map((m) => `<li style="margin:10px 0"><b>${m.subject}</b>${m.needsAction ? ' <span class="badge">needs you</span>' : ''}<br><span class="muted">${m.from} · ${m.receivedAt}</span><br>${m.body}</li>`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${SCHOOL.name} — parent inbox</title><style>body{font-family:system-ui;max-width:680px;margin:40px auto;color:#0f172a} h1{font-size:20px} .muted{color:#64748b} .badge{background:#fef3c7;color:#92400e;border-radius:999px;padding:2px 10px;font-size:12px} ul{list-style:none;padding:0}</style></head><body>
<h1>${SCHOOL.name} <span class="badge">Demo — fictional</span></h1>
<p class="muted">Parent inbox for ${SCHOOL.child} · one message needs action; the rest are FYI</p>
<ul>${rows}</ul>
</body></html>`;
}

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

      // ── Bookstore: search + buy ─────────────────────────────────────────────
      if (req.method === 'GET' && path === '/books/search') {
        const q = (u.searchParams.get('q') ?? '').toLowerCase();
        const words = q.split(/\s+/).filter((w) => w.length > 2);
        const hits = q ? BOOKS.filter((b) => words.some((w) => `${b.title} ${b.author}`.toLowerCase().includes(w))) : BOOKS;
        // A REAL, tappable listing link (Bookshop.org search) so the person can open the
        // actual book on their phone. The order itself is the demo's fictional step.
        const withUrl = (list: Book[]) =>
          list.map((b) => ({ ...b, url: `https://bookshop.org/search?keywords=${encodeURIComponent(`${b.title} ${b.author}`)}` }));
        return json(res, 200, withUrl(hits.length ? hits : BOOKS));
      }
      if (req.method === 'POST' && path === '/books/order') {
        const b = await readBody(req);
        const key = String(b.idempotencyKey ?? '');
        const existing = key ? bookOrderByKey.get(key) : undefined;
        if (existing) return json(res, 200, bookOrders.get(existing));
        const book = BOOKS.find((x) => x.id === String(b.bookId ?? ''));
        if (!book) return json(res, 400, { error: 'book not found' });
        const orderId = `ORD-${randomUUID().slice(0, 8).toUpperCase()}`;
        const order: BookOrder = {
          orderId, bookId: book.id, title: book.title, author: book.author,
          priceCents: book.priceCents, status: 'ordered', eta: 'in 2 days', createdAt: Date.now(),
        };
        bookOrders.set(orderId, order);
        if (key) bookOrderByKey.set(key, orderId);
        return json(res, 201, order);
      }

      // ── Ramp: expense reimbursement (the employer's spend platform) ─────────
      if (req.method === 'POST' && path === '/ramp/expenses') {
        const b = await readBody(req);
        const key = String(b.idempotencyKey ?? '');
        const existing = key ? rampByKey.get(key) : undefined;
        if (existing) return json(res, 200, rampExpenses.get(existing));
        const reference = `EXP-${randomUUID().slice(0, 8).toUpperCase()}`;
        const exp: RampExpense = {
          reference, merchant: String(b.merchant ?? ''), amountCents: Number(b.amountCents ?? 0),
          category: String(b.category ?? ''), description: String(b.description ?? ''),
          status: 'submitted', createdAt: Date.now(),
        };
        rampExpenses.set(reference, exp);
        if (key) rampByKey.set(key, reference);
        scheduleRampReimbursement(reference);
        return json(res, 201, exp);
      }
      if (req.method === 'GET' && path.startsWith('/ramp/expenses/')) {
        const e = rampExpenses.get(path.slice('/ramp/expenses/'.length));
        return e ? json(res, 200, e) : json(res, 404, { error: 'not found' });
      }

      // ── EAP: the plan's therapist directory + appointment requests ──────────
      if (req.method === 'GET' && path === '/bright/therapists') {
        const network = u.searchParams.get('network') ?? '';
        const hits = THERAPISTS.filter((t) => (!network || t.networkId === network));
        return json(res, 200, hits);
      }
      if (req.method === 'POST' && path === '/bright/therapist-requests') {
        const b = await readBody(req);
        const key = String(b.idempotencyKey ?? '');
        const existing = key ? therapistByKey.get(key) : undefined;
        if (existing) return json(res, 200, therapistRequests.get(existing));
        const t = THERAPISTS.find((x) => x.id === String(b.therapistId ?? '') && x.inNetwork);
        if (!t) return json(res, 400, { error: 'therapist not in-network or not found' });
        const reference = `EAP-${randomUUID().slice(0, 8).toUpperCase()}`;
        const reqRow: TherapistRequest = {
          reference, therapistId: t.id, therapistName: `${t.name}, ${t.credentials}`,
          when: String(b.when ?? t.nextSlots[0]), status: 'requested', createdAt: Date.now(),
        };
        therapistRequests.set(reference, reqRow);
        if (key) therapistByKey.set(key, reference);
        return json(res, 201, reqRow);
      }
      if (req.method === 'GET' && path.startsWith('/bright/therapist-requests/')) {
        const r = therapistRequests.get(path.slice('/bright/therapist-requests/'.length));
        return r ? json(res, 200, r) : json(res, 404, { error: 'not found' });
      }

      // ── Soquel Elementary: the parent inbox + the form the school is waiting on ──
      if (req.method === 'GET' && path === '/school/inbox') {
        return json(res, 200, schoolInbox());
      }
      if (req.method === 'POST' && path === '/school/forms/submit') {
        const b = await readBody(req);
        const formId = String(b.formId ?? '');
        if (!SCHOOL_MESSAGES.some((m) => m.formId === formId)) return json(res, 400, { error: 'unknown form' });
        const existing = schoolSubmissions.get(formId);
        if (existing) return json(res, 200, existing);
        const receipt: SchoolFormReceipt = {
          confirmationId: `SCH-${randomUUID().slice(0, 8).toUpperCase()}`,
          formId, status: 'received', submittedAt: new Date().toISOString(),
          attachments: Array.isArray(b.attachments) ? (b.attachments as string[]).map(String) : [],
        };
        schoolSubmissions.set(formId, receipt);
        return json(res, 201, receipt);
      }

      // ── Human-viewable landing pages ────────────────────────────────────────
      if (req.method === 'GET' && path === '/school/') return html(res, 200, schoolPage());
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
      reset: () => {
        claims.clear(); claimByKey.clear(); appointments.clear();
        bookOrders.clear(); bookOrderByKey.clear(); rampExpenses.clear(); rampByKey.clear();
        therapistRequests.clear(); therapistByKey.clear();
        schoolSubmissions.clear();
      },
    }));
  });
}
