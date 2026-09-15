# Benny demo — two maps, four beats

A self-contained, offline demo of Benny's core loop: **hold both maps → notice → act
(with approval) → follow through**. It runs two ways:

- **Live iMessage** (the demo) — text the line `demo` and Benny plays all four beats as
  real bubbles, pausing at each `YES <code>` / `SEND` for your reply (and auto-advancing
  if you don't). Fictional, offline, deterministic; works on the deployed agent.
- **Console transcript** — `npm run demo:benny` prints the same conversation.
  `npm run test:demo` and `npm run test:demo-director` run the trigger-engine and
  director tests.

## The four beats

1. **The physical** *(life → coverage → book)* — a school email says the kid needs a
   physical; Benny checks the plan (preventive = $0 in-network), finds an in-network
   pediatrician, books it with an exact `YES <code>`.
2. **FSA use-it-or-lose-it** *(money, for you)* — balance expiring, an unreimbursed
   receipt found; Benny files the claim, which flips to *paid* on screen.
3. **Books** *(delight, for you)* — the monthly wellness stipend is unused; Benny offers
   "your two books," expenses them, paid.
4. **Absence → tell the school** *(pure life, no benefit)* — shows Benny does the boring
   institutional coordination too, not just benefit-funded actions.

## What's real vs. fictional

**Real code, fictional targets:** the trigger engine (`src/demo/triggers.ts`), the
coverage catalog (`src/demo/catalog.ts`), and the connectors (`src/demo/connectors.ts`)
are real `BennyConnector` implementations doing the prepare → validate → lookup →
submit loop over HTTP — exactly the adapter boundary the production product needs per
provider (CVS / HealthEquity / UHC / …). They just point at two in-memory demo servers
(`src/demo/server.ts`) instead of live portals or APIs.

**The production runtime already accepts these connectors** — `src/benefits/messaging.ts`
registers them when `BENNY_DEMO_CONNECTORS=true` (default is still `[]`, i.e. nothing
real is connected). The full durable runtime (Postgres, AES-256-GCM vault, outbox,
reconciliation) is unchanged and drives the same interface; the demo harness drives the
connectors directly so it runs with zero setup.

## Why this is the product

Coverage is one map; life is the other. Every beat above is the *same* loop — notice a
gap, match it to the right map, act with approval, follow through — which is what lets
Benny coordinate across schools, doctors, insurers, and beyond the benefits package.
