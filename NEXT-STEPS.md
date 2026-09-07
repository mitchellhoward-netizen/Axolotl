# Axolotl — Next Steps (session handoff)

## Status (committed; working tree clean)
The core agent is solid and district-agnostic in its **runtime logic**. It is **NOT** yet a
production "any parent, any school" product — it's still **demo/data-bound to Soquel** in its
data layer.

Pushed commits (latest first): `349f5f8` … `cb3050e`, plus the whole intelligence-layer series.

## Product goal (non-negotiable)
Work for **ANY parent in ANY school** — not a single district. A parent texts a need; the agent
finds the right program/form/deadline/contact for **that** family's school/district, fills + submits
with consent, or guides/hands off where it hits a hard limit.

## What's done (and correct)
- **Intelligence layer** (`src/agent/intention.ts`): belief state over a hypothesis space, info-gain
  gating (ask/research/commit/handoff), evidence-grounded commit (DualStake), sensitive-dimension
  carve-out, Ask-F1. Tests: `npm run test:intention` (58), `npm run test:consent` (11).
- **Consent** bound to the turn (strict whole-message YES/NO, no stale firing), single-instance guard,
  message-id dedupe, reply sent once via `space.send`.
- **Grounding** is per-kind (not hollow); credentials redacted from logs.
- **Live code path is now district-agnostic**: systemPrompt uses the family's school/district (or asks
  for it); `resolveCounterparty` builds contacts from the actual school/district; no hardcoded Soquel
  in agent/tools/mckinney/onboarding paths.
- **Research layer** (`knowledge/`) researches **any** district over the web; federal entitlements are
  generic.

## What's left (the real rework)
The bot is **data-bound to Soquel** in three places. To be truly any-school/any-student, make
**researched-per-district data the single source of truth**, and wire real identity/SIS:

1. **`knowledge/suesd.ts`** — the Soquel knowledge base (principal/liaison/bus-pass/`answerSchoolInfo`).
   School-info lookups still fall back to this. Replace with researched `DistrictProfile` data, or
   remove the Soquel fallback and research on demand.
2. **`seed.ts`** — rest-mocked **SIS** seeds **Soquel** teachers/school. For any student, wire a **real
   SIS per district** (or rely on the parent-supplied `profile.children`, which the profile carries).
   Remove Soquel from the default path.
3. **`knowledge/`** discovery/barriers/resource-graph/districts/graph — seeded for `district-suesd`.
   Make it key on the parent's resolved district, researched on demand.

Also: `resolveCounterparty` contact detail (email/phone) should come from the **researched** district,
not env fallbacks.

## Key files
`src/agent/intention.ts`, `src/agent/agent.ts`, `src/agent/tools.ts` (systemPrompt),
`src/knowledge/*` (research + sutsd seed), `src/seed.ts`, `src/integrations/*`.

## Operational note (was the root of the double-reply bug)
Only **one** agent instance may be connected to a Spectrum line. A Railway deploy
(`get-axolotl-agent-production`) + local `npm run start` = two replies. Keep exactly one. The repo is
deployed (railway.json / Dockerfile / vercel.json).
