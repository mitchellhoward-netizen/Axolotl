# Benny demo — the school trigger, carried all the way into the plan

A self-contained, offline demo of Benny's core loop: **hold both maps → notice → act
(with approval) → follow through**. The spine is one continuous story — a school
requirement arrives, and Benny carries it into the employer's plan and back again:

1. **Reads Leo's school inbox** — 8 messages this week, shown as they land.
2. **Triages 8 → 1** — seven are FYI; one has a deadline (kindergarten health
   requirements: a physical exam + an oral health assessment, due Oct 15).
3. **Matches it to the coverage map** — prices both visits against the real network:
   the physical at $0 in-network, the dental exam at $85 after the plan's rate.
4. **Books both** in-network, around school hours (on `YES`).
5. **Files the out-of-pocket with the plan** — the $85 goes to the FSA as a real claim
   (on `YES`) — and **returns the completed forms to the school** with both visit
   confirmations attached.

It runs two ways:

- **Live iMessage** (the demo) — text the line `demo`. Benny opens with the inbox read and
  the proposal, then **you steer it** by talking naturally. Fictional, offline,
  deterministic; runs on the deployed agent.
- **Console transcript** — `npm run demo:benny` prints the same conversation.
  `npm run test:demo` (trigger engine), `npm run test:demo-director` (the interactive flow).

## How it behaves

- **One proactive beat, then it's yours**: the triage — and the concrete, priced proposal
  it leads to. Nothing consequential happens unless you say so.
- **You steer, in your own words.** An LLM router maps what you mean to a deterministic
  scene, so natural questions work: *"am I using my benefits correctly?"*, *"what about my
  FSA?"*, *"books"*, *"tell the school Leo's out Tuesday"*, *"what's left?"*. Anything
  else gets an in-world improv reply constrained to the demo's plan — it will say plainly
  what it *can't* do rather than invent it.
- **Approvals, always.** Anything consequential waits for `YES` / `SEND`. On silence it
  **nudges** ("just say yes when you want me to…") — it never auto-acts, because a product
  selling "nothing happens without your approval" can't book things while you're not looking.
- **It remembers.** The audit and `status` read live session state, so after the chain and
  a filing, the check-up says *"$1,570.65 left"* and the status lists the school form as
  returned.
- **It buys the thing and files the expense.** Name a book — *"buy Love in the Time of
  Cholera"* — and Benny finds it, orders it, **then files the reimbursement in Ramp** (the
  employer's spend platform). The purchase is real (a merchant order), the reimbursement
  is real (an expense), and neither happens without `YES`.
- **Reimbursements are earned, not instant.** A claim settles ~25s later and a Ramp
  expense ~45s later, so *"did my claim get paid?"* has a truthful answer first
  ("submitted") and then flips — no auto-ping interrupting the conversation.

## The scenes

| Ask | Scene |
|---|---|
| `demo` / *what did I miss?* / *anything from school?* | **triage** — the inbox read → the requirement → book + file + return the forms |
| *am I using my benefits correctly?* | **audit** — what's unused/expiring, prioritized |
| *the physical* / *book it* | **physical** — in-network provider, then book |
| *my FSA* / *the receipt* | **fsa** — file the reimbursement |
| *books* / *wellness* | **books** — the monthly stipend |
| *therapy* / *EAP* | **eap** — free confidential sessions |
| *tell the school Leo's out* | **absence** — pure life, no benefit attached |
| *what's left?* | **status** — everything in flight, plainly |
| `yes` / `no` / `menu` / `stop` | approvals, help, end |

## What's real vs. fictional

**Real code, fictional targets:** the trigger engine (`triggers.ts`), coverage catalog
(`catalog.ts`), session state (`state.ts`), scenes (`scenes.ts`), router (`router.ts`),
and the connectors (`connectors.ts`) are real code doing the prepare → validate → lookup
→ submit loop over HTTP — exactly the adapter boundary the production product needs per
provider (CVS / HealthEquity / UHC / …). They point at three in-memory demo institutions
(`server.ts`) instead of live portals: Soquel Elementary (the inbox + the form it is
waiting on), Northstar Benefits (coverage + the claims ledger), and Bright Network (the
in-network directory the visits are booked from).

**The production runtime accepts these connectors** — `src/benefits/messaging.ts`
registers them when `BENNY_DEMO_CONNECTORS=true` (default is still `[]`, i.e. nothing real
is connected). The durable runtime (Postgres, AES-256-GCM vault, outbox, reconciliation)
is unchanged and drives the same interface.

## Why this is the product

Coverage is one map; life is the other. Every scene is the *same* loop — notice a gap,
match it to the right map, act with approval, follow through — which is what lets Benny
coordinate across schools, doctors, insurers, and **beyond the benefits package**. That's
the new class: not an app for your FSA, but an agent that brokers your whole relationship
with the institutions in your life.

