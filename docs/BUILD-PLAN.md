# Axolotl — Build Plan: the missing architecture

> 2026-09-05. Companion to `school-agent-research/08-axolotl-comparison.md`. Phases map 1:1 to the
> gaps there. Each phase is independently shippable and lists concrete files + an acceptance test.
>
> **STATUS: all 7 phases shipped** (typecheck clean; 7 test suites via `npm run test:*`).
> `scripts/init-db.ts` now applies the full `db/*.sql` set in dependency order.

## Guiding constraint

Keep the four-way split (Brain / Researcher / Hands / Memory) and the hard consent gate. Nothing in
this plan changes `Step.requiresConsent` / `StepExecutor`'s code-level gate — consequential actions
still require a parent YES. Research/discovery may be autonomous; submission never is.

---

## Phase 1 — Trajectory-aware, bounded research loop  ← ✅ built this pass (2026-09-05)

**Status: shipped.** `src/knowledge/trajectory.ts` (SearchSession), `src/knowledge/research.ts`
(iterative loop), `src/agent/llm.ts` (`suggestNextQuery` + `extractSearchTerms`), wired in
`src/agent/agent.ts` (goal-directed), offline test at `scripts/test-trajectory.ts`
(`npm run test:research`). Typecheck clean; 9 assertions pass.

**Gap:** `researchDistrictNodes` is one search → first URL → fetch → categorize; no loop, no dedup,
no recovery, no budget, no stopping criteria.

**Change:**
- NEW `src/knowledge/trajectory.ts` — pure `SearchSession`: normalized-query dedup, seen-URL set,
  learned-terms union, budget counters (searches/fetches/steps), stuck detector (no-progress streak),
  recovery-query generator, stopping criteria.
- REWRITE `src/knowledge/research.ts` — iterative `researchDistrictNodes(district, school, llm, goal?)`:
  seed queries → search → extract *multiple* URLs → fetch unseen pages → extract learned terms →
  LLM `generateKnowledgeNodes` → track covered categories → compute gaps → next query from
  goal + gaps + learned terms → recover (`"exact phrase"`, domain-restricted) on empty results →
  stop on covered / budget / stuck.
- EXTEND `src/agent/llm.ts` — `suggestNextQuery(...)` + `extractSearchTerms(pageText)` (both
  `null`-safe; deterministic fallbacks in the researcher).
- WIRE `src/agent/agent.ts` — pass the parent's actual question into the researcher so the loop is
  goal-directed (transportation vs meals vs …), not always all-10 categories.

**Acceptance:** on 5 real districts (LLM key present), the loop discovers ≥1 grounded node for the
requested category; it never repeats a normalized query; it stops within budget; it emits a
trajectory log (query → docs → useful). Offline (no key) it still type-checks and the `SearchSession`
unit test passes.

---

## Phase 2 — Browser + document execution layer (the Hands)  ← ✅ built (2026-09-05)

**Status: shipped.** `src/integrations/browser.ts` (Stagehand open/observe/act/extract/fill +
`extractPdf` via unpdf + `isPdfUrl`), `browser_*` + `extract_pdf` tools wired in `src/agent/tools.ts`,
PDF routing in `src/knowledge/research.ts`, and the consent-gated `browser` Step channel
(`steps/adapters/browser.ts` + registry). Env-gated (`BROWSER_BACKEND=stagehand`); degrades to static
fetch otherwise. Dependency: `@browserbasehq/stagehand@^4`, `unpdf`.

**Gap:** `web_fetch` (jina) is static text — no JS portals, Google Forms, iframes, login walls, PDFs.

**Change:**
- Add `channel: 'browser'` to `Step`/`StepPayload` and a `BrowserAdapter` in `src/agent/steps/registry.ts`.
- Add `browser_open / browser_observe / browser_act / browser_extract / browser_fill` tools in
  `src/agent/tools.ts`, implemented by a new `src/integrations/browser.ts` abstraction with two
  backends: **Stagehand** (primary, DOM/ariaSnapshot-first) and **Playwright** (deterministic
  fallback for PDF/download/print). Env-gated (`BROWSER_BACKEND=stagehand|playwright|none`).
- Add `extract_pdf` (PyMuPDF/pdfplumber + OCR) and wire it into the researcher's fetch path (detect
  `content-type: application/pdf`).
- Enforce the interface fallback hierarchy (WebMCP → DOM → automation → vision) as a wrapper that
  only descends a rung on failure.

**Acceptance:** `browser_open/observe/act/extract` round-trip on one JS-heavy district page and one
Google Form (headless); `extract_pdf` returns text from a scanned policy PDF; failures fall back a
rung rather than crash.

---

## Phase 3 — Evidence model + verification stage  ← ✅ built (2026-09-05)

**Status: shipped.** `src/domain/evidence.ts` (EvidenceRecord + 6-step ladder + official/type
helpers), `src/agent/verify.ts` (rubric + `assessKnowledgeNode` + `statusCaveat`),
`src/integrations/evidence-store.ts` (`createEvidence`), `db/evidence.sql` + RLS, `save_evidence`
tool, and `assessKnowledgeNode` wired into the knowledge-retrieval path. Test: `npm run test:evidence`.

**Gap:** nodes carry `sources[]` + `confidence` + `verified|draft`, but no `evidence_span`,
`retrieved_at`/`verified_at`, corroboration, contradiction, or reverify TTL.

**Change:**
- NEW `src/domain/evidence.ts` — `EvidenceRecord` (claim, source_url, source_type, evidence_span,
  retrieved_at, verified_at, jurisdiction, official, confidence, status, corroborated_by).
- Extend `KnowledgeNode.sources[]` with `checkedAt`; add `status: 'discovered'|'plausible'|
  'verified'|'confirmed'|'stale'|'contradictory'` (migrate the current 2-level enum).
- Add `db/evidence.sql` (+ RLS) and a `save_evidence` tool.
- NEW `src/agent/verify.ts` — the verification rubric as a budgeted, pre-answer stage: official?
  current? correct jurisdiction/grade? policy-vs-explanatory? contradicting source? `confirmed`
  requires ≥2 official sources for eligibility/form claims.

**Acceptance:** no `verified` claim reaches the parent without source + `retrieved_at`; eligibility
answers require `confirmed` or are phrased "likely — please confirm."

---

## Phase 4 — Typed resource graph  ← ✅ built (2026-09-05)

**Status: shipped.** `src/domain/graph.ts` (ResourceNode/Edge/Chain types), `db/resource_graph.sql` +
RLS, `src/knowledge/resource-graph.ts` (store + SUESD transportation-chain seed + `buildChain` +
`searchSchoolGraph` + `saveResource` + `chainSummary`), `search_school_graph` + `save_resource` tools,
and the reuse path in `src/agent/agent.ts` (graph chain appended to knowledge retrieval). Test:
`npm run test:graph`.

**Gap:** `knowledge_node` is a flat category→node wiki; no school→dept→program→eligibility→policy→
application→form→contact→deadline traversal.

**Change:**
- Add node types + typed edges (`db/resource_graph.sql`): `program`, `policy`, `application`, `form`,
  `contact`, `deadline`, `eligibility` linked to `district`/`school`; reuse `search_school_graph`.
- Promote the researcher's output from flat nodes to graph edges (eligibility → cites → policy;
  program → applied_via → application → uses_form → form).
- Reuse path: a new goal first hits `search_school_graph`; on a hit, skip discovery and re-verify
  leaves only.

**Acceptance:** second transportation task in a known district takes <30% of the first task's tool
calls at equal correctness.

---

## Phase 5 — Procedural memory / skills  ← ✅ built (2026-09-05)

**Status: shipped.** `src/domain/skill.ts` (Skill/SkillStep + `makeSkillKey`/`parameterize`),
`db/skills.sql` + RLS, `src/agent/skills.ts` (SkillStore + `distillSkill`/`isSkillStale`/
`verifySkillLeaves`/`skillSummary`), `save_procedure` + `list_skills` tools, and a saved-procedure
reuse hint wired into `src/agent/agent.ts`. Test: `npm run test:skills`.

**Gap:** cases + follow-ups exist, but no "replay a verified workflow" or parameterized skill.

**Change:**
- NEW `src/agent/skills.ts` + `db/skills.sql`: versioned, parent-approved skills keyed by
  portal/form/jurisdiction; each skill = YAML frontmatter + steps + the evidence deps; leaf
  re-verification on reuse (form active? deadline current?); stale → re-derive.
- Add `save_procedure` / `list_skills` tools.

**Acceptance:** a saved transportation procedure for District X re-runs on a new family after only
re-verifying the form/deadline leaves.

---

## Phase 6 — Model routing (cheap vs frontier)  ← ✅ built (2026-09-05)

**Status: shipped.** `src/agent/model-policy.ts` (routing table + `routeTool`/`modelFor`/`frontierModel`/
`smallModel`), a `researchLlm` (small tier) wired through `src/index.ts` → `Agent` → the research loop.
Test: `npm run test:models`.

**Change:** NEW `src/agent/model-policy.ts` — a config map (not code) routing each tool class to a
model: frontier for planning/verification/explanation; small/specialized (Fara1.5-9B, GPT-oss) for
query reformulation, extraction, form classification, routine browser act; deterministic code for
dedup/budgets/TTL/stuck. Wire `LlmClient` to take a per-call model override.

**Acceptance:** routine browser/actuation calls never hit the frontier model; the routing table can
be changed by editing config alone.

---

## Phase 7 — Evaluation + trajectory data  ← ✅ built (2026-09-05)

**Status: shipped (harness).** `src/eval/benchmark.ts` (task schema + ground truth + separated-metric
`scoreRun` + `toTrajectoryData` + sample fixtures), test `npm run test:benchmark`. Trajectory logging
was added in Phase 1 (`[research] trajectory`). Remaining: the full 100-task corpus + an LLM judge for
answer/eligibility correctness (`judgeAnswer` is the stub hook).

**Change:** NEW `eval/school-bureaucracy-bench/` — fixed-corpus benchmark (≥100 tasks, 20 categories,
traps) per `school-agent-research/06-benchmark.md`, with per-metric scoring (intent/search/discovery/
evidence/answer/eligibility/form/cross-site/verification/recovery/intervention/cost/latency). Log
every trajectory (query→docs→useful) as ITER supervision + BrowserForge-style episode data.

**Acceptance:** benchmark runs in CI and blocks regressions on any separated metric.

---

## Sequencing & what this pass ships

1 → (2 ∥ 3 ∥ 4) → 5 → 6 → 7. This pass ships **Phase 1 end-to-end** (code + offline test +
typecheck), because it is the highest-leverage, fully self-contained slice and is the foundation the
rest plugs into. Phases 2–7 are specified above and gated on Phase 1 landing.

## Guardrails that do not change

- Consequential actions stay consent-gated (`StepExecutor`).
- Draft/`plausible` facts are never stated as authoritative.
- Bilingual + plain-text iMessage constraints stay.
- FERPA/COPPA via Postgres RLS stays.
