# Axolotl — Next Steps (session handoff)

## Status
The agent is now **research-driven, district-agnostic, and matches the reference
(Instinct) on response quality** — links, breadth, thoroughness, the one unlock
question, and action offers. Production runs the latest code (Railway is
connected to `main` and auto-deploys on push).

## Shipped & stable
- **Any-school / any-student.** No hardcoded district or Soquel seed. Students
  come from parent-provided children (or a real SIS via `createSis`); district
  + school keyed stably; researched district data is authoritative for
  contacts/school-info. Test: `npm run test:school-info` (13+).
- **Consent hard gate.** Strict whole-message YES/NO; browse submit is real and
  gated, never auto-submit; credentials redacted; single-instance guard;
  message-id dedupe + `space.send`.
- **Intelligence layer** (belief-state intent, info-gain, evidence-grounded
  commit, sensitive-dimension carve-out). Tests: `test:intention` (58),
  `test:consent` (11).
- **Reminders** — `set_reminder` LLM tool (parse "in 2 hours" / "tomorrow at
  3pm" / "friday" / "tonight"; schedules a durable follow-up that messages the
  parent; logged as an open case).
- **Quality parity with Instinct** — every program/benefit carries a tappable
  link; research breadth covers school/district AND around-town community
  resources (library, museum, rec, swim, meal sites, EBT); 5–8+ programs with
  detail; asks the ONE unlock question (free/reduced-lunch eligibility) AFTER
  delivering; never settles for thin research (thin-answer detector forces
  deeper digging).
- **Conversation continuity** — "try again"/"again"/"repeat"/"go on" and typo
  corrections ("flop"/"elop" → ELO-P) are read as continuations; `NOW`/`LAST
  ACTION` refresh every turn so a short follow-up never drifts to an old topic
  or restarts mid-signup.
- **Fun school-themed reaction emojis** (👋🚌📅🤒🍎🏫📓📞✉️⭐ + supply fallbacks);
  axolotl 🦎 tapback on wins.

## Product next steps (captured ideas — not yet built)

### A. Gate the product on connecting the parent's school email / calendar / SIS
Inspired by Town (20VC): the product only becomes real once it's attached to
what the parent already has. For a parent↔school agent, that's the **school
systems they already log into** — and it's more central than for Town, because
the WHOLE mission (the delta) requires knowing what the student is actually
receiving, which only lives in the school's email/portal/SIS. The agent can
*research* the "entitled" side; a connection is how it *knows* the "received"
side. This is the difference between an agent that researches and one that knows.

**Do it as a ladder (easiest → deepest), one tap, never a form:**
- **Tier 1 — school email + calendar (the Town gate, start here).** Connect the
  parent's school Google account (Google Workspace for Education is common) and
  ingest school email/calendar: confirmations, deadlines, district notices, PTC
  invites. Universal-ish, clean OAuth, low friction, immediately useful, least
  intrusive.
- **Tier 2 — the parent's existing SSO (Clever / ClassLink / OneRoster).** One
  tap "Log in with Clever" where the district supports it. This is what pulls the
  child's actual records (meal status, attendance, IEP/504, enrollment, whether
  already signed up for ELO-P) so the delta is computed, not guessed.
- **Tier 3 — per-district SIS adapters** (PowerSchool / Infinite Campus /
  Aeries), only for districts you prioritize, all behind the same consent.

**Safety (non-negotiable for a real child's records):** parent authorizes a
*scoped* connection; the agent reads what it needs; and it never exposes
something sensitive OR acts on the record (send/call/submit) without the parent's
explicit OK. Treat authorization + scoping as a first-class feature, not an
afterthought.

**Fit to existing code:** the `Sis` interface + `createSis` seam (sis.ts) and the
delta engine (`knowledge/entitlements.ts`, `agent/gaps.ts`) are already the right
shape — a connection would feed the "received" side into `auditEntitlements` /
`detectGaps` so the agent computes and acts on a real gap instead of guessing.

**When:** validation/pilot (with your dad) first; the connection is the follow-on
that turns a strong demo into an assistant-that-knows. Don't build until the
base research/consent path is solid in real use.

### B. Inbound email handling (related, lighter)
When the school *replies* (confirmations, requests for more info, waitlist
notices), the agent should ingest the reply, update the case + reminder, and
DRAFT the response for the parent to approve. Lighter option: a small IMAP poller
on the parent's school email feeding the existing case/reminder engine, rather
than adopting a full AgentMail agent-inbox framework. Never send to the school
without the parent's explicit YES.

## Operational note (was the root of the double-reply bug)
Only **one** agent instance may be connected to a Spectrum line. A Railway deploy
(`get-axolotl-agent-production`) + local `npm run start` = two replies. Keep exactly
one. The repo is deployed (railway.json / Dockerfile / vercel.json) and Railway is
wired to auto-deploy `main`.

## Key files
`src/knowledge/districts.ts`, `src/knowledge/discovery.ts`,
`src/knowledge/school-info.ts` (replaces `suesd.ts`), `src/knowledge/barriers.ts`,
`src/knowledge/graph.ts`, `src/knowledge/resource-graph.ts`, `src/seed.ts`,
`src/integrations/sis.ts` (`createSis`), `src/agent/agent.ts`
(`resolveCounterparty`, `buildToolContext`, `resolveDistrictAsync`, reminder +
continuity wiring), `src/agent/tools.ts` (`get_school_info`, barriers,
`set_reminder`, systemPrompt), `src/lib/dates.ts` (`parseReminderWhen`),
`src/index.ts` (school-emoji reactions).
