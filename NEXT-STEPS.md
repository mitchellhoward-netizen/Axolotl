# Axolotl — Next Steps (session handoff)

## Status
The rework is committed: the agent is now **research-driven and district-agnostic
in its DATA layer too**, not just its runtime logic. There is no hardcoded
district, no Soquel knowledge-base fallback, and no seeded Soquel school/student.

## What changed in this pass (any-school, any-student)
- **Researched district data is the single source of truth for school-info &
  contacts.** New `knowledge/districts.ts` provides a stable district id +
  `researchDistrictProfile()` (LLM-researched profile: liaison, bus-pass contact,
  schools, type). `knowledge/school-info.ts` answers school-info + the
  McKinney-Vento bus process **from the researched profile**. The Soquel knowledge
  base (`knowledge/suesd.ts`) was **deleted**; `get_school_info`, `answerSchoolInfo`
  and the bus flow no longer fall back to it and never invent a contact.
- **`resolveCounterparty` contacts come from the researched district**, not env
  fallbacks. An unresearched district yields a name-only counterparty (no
  invented email/phone), so an email/call step fails safe until researched.
- **No Soquel seed in the default path.** `seed.ts` starts empty; a family's
  students come from **parent-provided children** (`provisionFamily` →
  `profile.children`) resolved to a stable school record for their district.
  `createSeedDb` ships no school/teacher. `buildToolContext` no longer falls back
  to `db.schools[0]`. `graph.ts` (no `seedDistrictGraph`), `resource-graph.ts`
  (no `seedSuesdResourceGraph`), `discovery.ts` (no SUESD nomenclator), and
  `db.ts::ensureSeedDistrict` (no Soquel row) are all district-agnostic.
- **Any district, keyed stably.** District + school ids derive from the normalized
  name (+ city/state), so knowledge-graph/RAG and the district registry resolve
  the same district for any family.
- **Real-SIS seam.** `integrations/sis.ts::createSis(db)` is the drop-in point to
  return a real OneRoster / Edlink / PowerSchool client; the default returns the
  parent-provided-children-backed `MockSis`. `SIS_PROVIDER` env documented.
- New regression test: `npm run test:school-info` (13 checks) + updated
  `test:graph` / `test:skills` to be district-agnostic.

## Done and stable
- Intelligence layer (belief-state intent, info-gain gating, evidence-grounded
  commit, sensitive-dimension carve-out). Tests: `test:intention` (58),
  `test:consent` (11).
- Consent bound to the turn (strict whole-message YES/NO), single-instance guard,
  message-id dedupe, reply sent once via `space.send`.
- Grounding per-kind (not hollow); credentials redacted from logs.

## What's left (production, not rework)
1. **Wire a real SIS** (OneRoster / Edlink / PowerSchool) and return it from
   `integrations/sis.ts::createSis`, so students/schools come from the district's
   SIS rather than parent-provided records (the parent-provided path works now).
   Verify the sender against SIS contact records before go-live.
2. Wire **real action** for the McKinney-Vento flow (submit an intake to the
   liaison / SIS) once the process is confirmed with a district.
3. `src/eval/benchmark.ts` still uses Soquel as benchmark *scenario data* (public
   URLs); make it district-parameterized so the eval is also any-school.
4. Reverse the `logCase`/follow-up and the voice pre-call research to the new
   researched district key; all already key on the stable district id.

## Operational note (was the root of the double-reply bug)
Only **one** agent instance may be connected to a Spectrum line. A Railway deploy
(`get-axolotl-agent-production`) + local `npm run start` = two replies. Keep exactly
one. The repo is deployed (railway.json / Dockerfile / vercel.json).

## Key files
`src/knowledge/districts.ts`, `src/knowledge/discovery.ts`,
`src/knowledge/school-info.ts` (replaces `suesd.ts`), `src/knowledge/barriers.ts`,
`src/knowledge/graph.ts`, `src/knowledge/resource-graph.ts`, `src/seed.ts`,
`src/integrations/sis.ts` (`createSis`), `src/agent/agent.ts`
(`resolveCounterparty`, `buildToolContext`, `resolveDistrictAsync`),
`src/agent/tools.ts` (`get_school_info`, `get_remedy`, `draft_outreach`).
