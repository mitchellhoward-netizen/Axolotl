# Benny demo — one proactive beat, then you drive

A self-contained, offline demo of Benny's core loop: **hold both maps → notice → act
(with approval) → follow through**. It runs two ways:

- **Live iMessage** (the demo) — text the line `demo`. Benny opens with one proactive
  beat (the inbox triage), then **you steer it** by talking naturally. Fictional,
  offline, deterministic; runs on the deployed agent.
- **Console transcript** — `npm run demo:benny` prints the same conversation.
  `npm run test:demo` (trigger engine), `npm run test:demo-director` (the interactive flow).

## How it behaves

- **One proactive beat**: the triage digest ("3 school emails — one needs you"). Nothing
  else happens unless you ask.
- **You steer, in your own words.** An LLM router maps what you mean to a deterministic
  scene, so natural questions work: *"am I using my benefits correctly?"*, *"what about my
  FSA?"*, *"books"*, *"tell the school Leo's out Tuesday"*, *"what's left?"*. Anything
  else gets an in-world improv reply constrained to the demo's plan — it will say plainly
  what it *can't* do rather than invent it.
- **Approvals, always.** Anything consequential waits for `YES` / `SEND`. On silence it
  **nudges** ("just say yes when you want me to…") — it never auto-acts, because a product
  selling "nothing happens without your approval" can't book things while you're not looking.
- **It remembers.** The audit and `status` read live session state, so after filing, the
  check-up says *"$1,655.65 left — you filed $184.35."*
- **It follows through: ~25s after a claim is filed, Benny pings you that it was paid** —
  unprompted, mid-conversation.

## The scenes

| Ask | Scene |
|---|---|
| `demo` / *what did I miss?* | **triage** — the inbox digest (proactive opening) |
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
provider (CVS / HealthEquity / UHC / …). They point at two in-memory demo institutions
(`server.ts`) instead of live portals.

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

