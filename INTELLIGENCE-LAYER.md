# Axolotl Intelligence Layer

The layer that turns a fuzzy parent message into the **right** program / form / deadline / contact —
with the confidence to ask, the honesty to not guess, and the guardrail to never act without consent.

## The mechanism (one sentence)

> Treat intent as a **belief state over a hypothesis space**, and choose *ask* / *research* / *commit*
> / *handoff* by **information gain** (which action splits the plausible answers most evenly),
> committing only when a hypothesis is both **strongly believed** and **grounded by attested evidence**.

## Where the code lives

| Piece | File |
|---|---|
| Belief state, info-gain scoring, ask/research/commit policy | `src/agent/intention.ts` |
| LLM solution-generation | `LlmClient.generateIntentHypotheses` (`src/agent/llm.ts`) |
| Consent-gated execution wiring | `Agent.resolveFuzzyIntent` / `stepsForCommittedIntention` (`src/agent/agent.ts`) |
| Tests (58 cases) | `scripts/test-intention.ts` → `npm run test:intention` |

## Status

Implemented and green (`npm run test:intention` → 58/58, `npx tsc --noEmit` clean). It resolves and
grounds, maps to a consent-gated step, and **never executes a consequential action without an
explicit parent `YES`**. The browser hand's fill/submit still depends on the form being
machine-fillable (see `bench/form-quirks.json`).

**Review round (Claude) — fixed:**
- **Grounding is not hollow** — each sub-claim is attested **only** from evidence that genuinely
  supports it (`extractGrounding`: a real URL for `formUrl`, a real date for `deadline`, a real
  email/phone for `contact`, an explicit eligibility signal for `eligibility`). A single node can no
  longer "attest" all four, so evidence-confidence reflects real grounding and the system
  **under-commits rather than guess** (a generic node → 1/4 → stays `concentrated`).
- **Consent is bound to the turn** — `pendingSteps` is resolved at the top of `handle()` with a strict
  whole-message YES/NO; anything else **expires** the proposal, so a stray "ok thanks" can never fire
  stale steps. The second, loose `pendingSteps`+`parseYesNo` gate in `advance()` was **removed** so the
  strict top gate is the single source of truth, and the top block now clears the **live**
  `state.pendingSteps` (not just writes a new object via `save()`), closing a state-aliasing hole.
- **`browser_act` no longer submits** — the LLM-facing tool blocks submit-like instructions and routes
  them to the gated `submit_form` (the internal `browserSubmit` still works via the executor). This
  closes the last consent-bypass path on the tool loop.
- **Informed consent prompt** — the "reply submit it" message now shows the concrete target + data
  (form URL + fields, or the email recipient/subject), not just a generic describe line.
- **Consent regression test** — `scripts/test-consent.ts` drives `handle()` with a seeded consent-gated
  step and asserts "ok thanks" does **not** execute while "submit it"/"go"/"yes please" do (6 tests).
  (`setStateForTest`/`getStateForTest` expose the store just for this.)
- **Sensitive-dimension carve-out** — residency/housing **and** `docsOnHand` (proof-of-residency
  request) are marked `sensitive`; for a displaced family they are excluded from ask candidates and
  the fallback (hand off rather than interrogate housing/documents).
- **Identity verification ON by default** — `requireVerification` now defaults to `true` unless
  explicitly disabled via env or option; local `demo`/`chat` disable it.
- **Commit is evidence-driven, not belief-driven (calibration)** — `committedHypothesis` selects the
  best-**evidenced** hypothesis (no miscalibrated-LLM-belief gate on pursuit); high belief + weak
  evidence stays `concentrated` (not committed).

## Provenance

Every claim below is annotated **[VERIFIED]** (finding I read in full), **[SYNTHESIS]** (my
cross-paper reconciliation — well-supported but not stated by any single source), or
**[UNVERIFIED]** (full method inaccessible). The point: this layer is built on what the deep-research
/ intent-disambiguation literature actually establishes, not on my priors.

## In this document

- **§0.5 Recency audit** — honest check that my source set isn't the 2026 frontier.
- **§1–§6** — the verified findings (deep research ≠ report-writing; Bayesian Experimental Design;
  info-gain-gated asking; HiL-Bench failure patterns; ClueUp/S1-DeepResearch honest unverified).
- **§8.5a–d** — the 2026 frontier that *is* the mechanism (HypoSearch, DualStake, Severance,
  Knowing-but-Not-Showing).
- **§9–§10** — the reconciled design mapping to code, and implementation status.

---

## 0.5 RECENCY AUDIT — honest state of the literature (added after a sweep)

My original draft was **anchored on a curated set**, not chosen for recency. The environment date is
**late 2026**, and a recency sweep surfaced work that is (a) *more recent* and (b) *more directly on
this thesis* than my original sources. This section is the honest correction.

| **Paper** | **arXiv** | **Pub** | **Status vs my draft** |
|---|---|---|---|
| **Explore Before Committing (HypoSearch)** | 2609.01294 | 2026-09-01 | ✅ *My core mechanism — already established & verified.* |
| **DualStake: Dual-Path Confidence Calibration** | 2609.00935 | 2026-09-01 | ✅ *My over-confidence guard — already established & verified.* |
| **The Severance Problem** | 2607.14250 | 2026-07-15 | ⚠️ *Raises a danger in Axolotl's profile-memory design (memory blind spot).* |
| **Knowing but Not Showing** | 2605.25284 | 2026-05-24 | ✅ *My "ask vs answer" gap — already established & verified.* |
| Active Inference as Context Acquisition | 2608.19202 | 2026-06-08 | ✅ *Ask-vs-retrieve cost tradeoff (read at abstract level).* |
| Active Task Disambiguation (Kobalczyk) | 2502.04485 | Feb 2025 | ⚠️ *Foundational but **not** the frontier.* |
| Characterizing Deep Research (LiveDRBench) | 2508.04183 | Aug 2025 | ⚠️ *Foundational but **~1 yr old**.* |

**Honest conclusion:** the strong *rejected* framing and the *hypothesis-space* mechanism I derived
are **not novel** — they are already the state of the art (HypoSearch) and directly verified. My
draft's `[SYNTHESIS]` labels where a 2026 paper now confirms the same thing are **downgraded to
`[VERIFIED]`** below. Where a 2026 paper *contradicts or risks* my design (Severance's memory blind
spot), it is flagged.

The single most important correction: **HypoSearch shows ~78% of deep-research failures are
"exploration failures"** — the agent picks the wrong search direction *early*, before it has
comparative evidence. For Axolotl this is precisely the fuzzy-parent-message risk: choosing the
*wrong program/form direction* on the first move. The hypothesis-space mechanism is the fix, not a
nice-to-have.

---

## 1. [VERIFIED] Deep research is *fan-out over hypotheses*, not report-writing

**Source: "Characterizing Deep Research: A Benchmark and Formal Definition" (arXiv:2508.04183),
read in full.**

- **[VERIFIED]** The defining feature of deep research is *not* a long report — it is "high fan-out
  over concepts required during the search process, i.e., broad and reasoning-intensive
  exploration."
- **[VERIFIED]** Formal Definition 1: a query is a *deep research* query iff it has **search
  intensity** (processes a large number of information units) **and** **reasoning intensity** (at
  least one of — finding, processing, or combining those units — requires non-trivial reasoning).
- **[VERIFIED]** Concrete thresholds (the authors' operating definition): reasoning-intensive if an
  ideal human expert needs **> 10 minutes**; search intensity ≈ **> 20 information units** through
  **≥ 10 search queries**.
- **[VERIFIED]** DR is a tuple `⟨query q, answer list A, corpus C⟩` where `A` is a list of
  **independent claims**, and each claim may **recursively contain sub-claims**. A "claim" is any
  piece of information relevant to answering `q`; an "information unit" ≈ a paragraph / retrieval
  chunk.
- **[VERIFIED]** **The grounding rule that matters for Axolotl**: in evaluation, a claim scores
  **zero** if the claim is wrong **OR if all its sub-claims are wrong**. This is explicitly to stop
  a system from getting high precision by "simply memorizing the answer" or by asserting a claim
  whose derivation is unsupported.

### Why this is the correct frame for "which program is this family entitled to?"

**[SYNTHESIS]** A typical Axolotl intent is a genuine DR task by the paper's own definition: it
requires combining eligibility rules, form pages, deadline pages, and contact info from multiple
authoritative district pages — i.e., `> 10 min` of ideal-human work and many search queries. So the
framing "understand the fuzzy intent" should inherit deep-research machinery, not a text-classifier.

**[VERIFIED]** **The failure the DR benchmark exposes is exactly Axolotl's risk**: "models often
correctly extract either the paper title or the material name, but not both." So a DR system (and
by extension a school-bureaucracy assistant) can get the *right program* but the *wrong form URL*,
or the *right URL* but the *wrong deadline*. The intelligence layer must return a **structured
claim-set with per-sub-claim attestation**, and must treat "claim is right but grounding is wrong"
as a failure — exactly like the DR metric does.

**[SYNTHESIS]** This gives Axolotl's existing "no-hallucinate" rule a formal rationale and a
defined success surface: an intent is *solved* only when every claim's sub-claims are attested.

---

## 2. [VERIFIED] Approach the hypothesis space via *Bayesian Experimental Design*

**Source: "Active Task Disambiguation with LLMs" (Kobalczyk, Astorga, Liu, van der Schaar; ICLR
2025 — arXiv:2502.04485), read in full.**

- **[VERIFIED]** They introduce a **formal definition of task ambiguity** through the *objective
  indicator* `1{h ⊨ R}` (does solution `h` satisfy requirements `R`?), which is **independent of
  the LLM** — explicitly separating **task ambiguity** from **model uncertainty**. High model
  uncertainty does not imply the task is ambiguous.
- **[VERIFIED]** They frame disambiguation as **Bayesian Experimental Design (BED)**:
  - `IG(q,a) = H[p*(h|S)] − H[p*(h|S ∪ (q,a))]` (entropy reduction over the solution `h`).
  - `EIG(q) = E_{p*(a|q,S)}[IG(q,a)]` (expected over possible answers-a).
- **[VERIFIED]** **Corollary 1 (the practical, implementable rule)**: if `p*` is uniform over `H`
  (the set of `R`-compatible solutions), then **EIG is maximized by the question whose possible
  answers partition `H` into **equally sized subsets**. For binary questions, that is the question
  that splits `H` into two equal halves. (Formally, `EIG(q) ∝ log(|H| / |H after split|)`.)
- **[VERIFIED]** **Uniformity assumption**: because `p*` is unknown and the LLM's `pφh` may be
  biased, they approximate `p*` as **uniform over the set of `R`-compatible solutions** — making
  the strategy agnostic to *both* biases.
- **[VERIFIED]** **The method (their Algorithm 1)** per iteration:
  1. Sample `N` candidate solutions `{hᵢ} ~ pφh(·|Sₜ)`.
  2. Sample `M` candidate questions `{qⱼ} ~ pφq(·|Sₜ)`.
  3. Get pseudo-answers `aᵢⱼ` for each question `qⱼ` about each solution `hᵢ`.
  4. Estimate `U(q) = EIG(q) − c(q)` for each candidate question, where `c(q)` is the **cost** of
     getting the oracle answer.
  5. Return `q* = argmax_q U(q)`; ask it; extend `Sₜ₊₁ = Sₜ ∪ (q*, a*)`.
- **[VERIFIED]** **The load-shifting insight** (their strongest contribution): "Question selection
  via direct maximization of the EIG bootstraps the question-generating skills of LLMs using their
  potentially stronger solution-generating skill." The agent is **better at solving** than at
  *deciding what to ask*, so we **shift the load from implicit reasoning in the space of questions
  to explicit reasoning in the space of solutions**.
- **[VERIFIED]** **Results**: `EIG-uniform` beats both `implicit` (single self-generated question)
  and `implicit-ToT` (sample M, then pick best) **by a significant margin** on the 20 Questions
  game. Notably, `EIG-logprobs` (using the LLM's own log-probabilities) **underperforms**
  `EIG-uniform` — the paper's proof that the LLM's generative distribution `pφh` is **inadequately
  biased**. The gap narrows for a stronger model (GPT-4o-mini vs GPT-3.5-turbo).
- **[VERIFIED]** **Diversity tricks to approach uniformity**: higher sampling temperature, and
  instructing the model to generate a "diverse and representative" set — both improve coverage of
  `H` (validated in their Study 2).
- **[VERIFIED]** **Noise mitigation**: a **self-critic filtering step** to ensure each sampled
  solution actually satisfies `R`; this becomes "crucial" as requirements accumulate (Study 3).
- **[VERIFIED]** In the code-generation experiment, questions are unit tests and answers come from
  executing code — giving a **near-noiseless EIG estimate**. **Open** questions (many possible
  answers) can be more informative than yes/no questions, but cost the human more effort.

### Why this reframes Axolotl's intent layer

**[SYNTHESIS]** Axolotl's "which program/form/deadline is this family entitled to?" maps onto this
directly. The **solution space `H`** is the set of *plausible answers* (possible programs, forms,
deadlines, contacts) consistent with the parent's words + the family profile. The agent:

- **generates** a diverse set of candidate hypotheses (its *solution-generation ability*) — this is
  what the model is actually good at, and it is what TAD says to lean on;
- **chooses an action** (ask a question OR run a research query) by **expected information gain over
  `H`**, i.e., *"which action splits the remaining hypothesis space most evenly?"* — not by
  *"what's a plausible clarifying question?"*;
- **weights by cost** `c(q)` — asking the parent costs a text round-trip + friction; running a
  research query costs tokens/minutes. This is the *same* `U = EIG − cost` tradeoff;
- **abstains/commits** based on whether `H` is concentrated enough.

**[SYNTHESIS — my key inference, not stated by TAD]** TAD is about *asking the user*. It does **not**
cover the *research* branch. My design extends the *identical* mechanism to research queries: a
research query is just an "experiment" whose "outcome" is new evidence (retrieved sub-claims), and
its EIG is also "how evenly does this evidence split `H`?" The papers separately establish (a) the
EIG selection rule for questions (VoI/TAD) and (b) the claim-synthesis machinery for research (DR
characterization). **Reconciling them into one IG-gated ask-vs-research policy across a shared `H`
is my synthesis** — it is well-supported but is not, itself, a finding in any of the papers.

---

## 3. [VERIFIED] Asking should be *information-gain-gated* and should *abstain* when belief is concentrated

**Source: "Uncertainty-Aware Clarification in LLM Agents with Information Gain" (VoI; ICML 2026 —
arXiv:2606.03135), read in full (prior).**

- **[VERIFIED]** The model maintains a **belief over the latent goal** `G`. When it asks a question
  `Q` and gets an answer `A`, **Information Gain = the shift in length-normalized, teacher-forced
  log-likelihood of the ground-truth goal**: `log P(G*|x,Q,A) − log P(G*|x)` — i.e., essentially the
  **pointwise mutual information** between the goal and the answer given the question.
- **[VERIFIED]** Trained via RL (DAPO) with a **Strict User Simulator**; results: retailer
  16.5%→18.3%, airline 13.3%→17.3%, clarifier invocations 4.2→1.3, +3.7% success, +0.3 steps.
- **[VERIFIED]** **The abstain rule** (critical): when the belief is **already concentrated** on the
  correct goal, asking a further question yields **negative** reward vs. doing nothing. So the
  question-asker should **not ask** when there is no remaining uncertainty to remove.
- **[VERIFIED]** Key practical note: "any sufficiently capable LLM could estimate these likelihood
  terms" — meaning IG can be **computed at inference time** (no RL) for a model that's already
  capable.

**[SYNTHESIS]** VoI gives the *objective* (IG = PMI, and the abstain-when-concentrated rule). TAD
gives the *practical computation* (uniform prior, N-sample even-partition estimate, cost term) at
inference. Together: **the asker selects the question with the largest expected IG, and refuses to
ask when IG is ≤ 0** (belief already concentrated). This is exactly the anti-over-asking behavior
Axolotl needs — we should not ask the parent "which school district?" if the profile already
determines it.

---

## 4. [VERIFIED] Measure the ask layer with *Ask-F1*, and guard against three failure patterns

**Source: HiL-Bench (arXiv:2604.09408), read in full (prior).**

- **[VERIFIED]** **Ask-F1** = harmonic mean of **question-precision** (are the questions it asks
  relevant/necessary?) and **blocker-recall** (does it surface the true blocker?), explicitly
  designed to be **anti-spam** — a model that asks many trivial questions is penalized.
- **[VERIFIED]** **Three canonical failure patterns**:
  1. **Overconfident wrong belief / no gap detection** — the model is confident in a *wrong* belief
     and therefore no longer detects that a gap exists.
  2. **High uncertainty yet persistent errors** — the model stays uncertain but keeps producing the
     same wrong output instead of resolving the uncertainty.
  3. **Broad, imprecise escalation without self-correction** — it escalates vaguely rather than
     narrowing to a concrete blocker, and doesn't correct course.
- **[VERIFIED]** The judgment of "is this a good question" is itself **trainable**; and the paper's
  framing is "**detect unresolvable uncertainty and act on it**."

**[SYNTHESIS]** Pattern 1 is Axolotl's own historical bug (the Spanish-locale lock, and the
"it really did submit... but not submitted" false-positive) — the model was *confident and wrong*.
So the intelligence layer must **re-verify even when the belief is concentrated**, and must use the
DR grounding rule to challenge a concentrated-but-ungrounded claim. Pattern 2 → a **bounded research
budget**: if uncertainty is high after a fixed set of queries, stop researching and hand off, rather
than looping. Pattern 3 → **every escalation must name a concrete blocker** (SSO wall, CAPTCHA,
missing authoritative page) and must be coupled to a self-correction step.

---

## 5. [UNVERIFIED] ClueUp — full method inaccessible; be transparent

**Source: "ClueUp: Resolving Intent Ambiguity in Personalized Web Agents with Profile-Driven
Clarification" (ICASSP 2026, DOI 10.1109/icassp55912.2026.11464552).**

- **[UNVERIFIED]** I could not read the full text. It is IEEE-paywalled (Semantic Scholar reports
  **no open-access PDF**; unpaywall reports `is_oa: None`; the DOI redirect returns empty). I only
  have the **title + venue** (verified via Semantic Scholar) and, from my earlier abstract read, the
  core idea: **resolving intent ambiguity in personalized web agents via profile-driven clarification**
  — i.e., the agent's *stored knowledge of the user* should reduce how many clarifying questions it
  needs to ask over time.
- **[HONEST CONCLUSION]** The abstract-level idea aligns with Axolotl's "intent-as-state, learn once
  → reuse forever" notion, and I treat it as corroborating evidence — **not** as a verified method.
  I do **not** claim its mechanism, because I have not read it.

---

## 6. [UNVERIFIED] S1-DeepResearch — abstract only

**Source: "S1-DeepResearch: Beyond Search, Toward Real-World Long-Horizon Research Agents"
(arXiv:2606.15367).**

- **[UNVERIFIED]** The full body fetch failed (I could only read the title + abstract). Abstract
  (verified): advocates a **unified trajectory-construction paradigm combining closed-ended QA and
  open-ended exploration**; a framework of **graph-grounded task formulation, agentic trajectory
  rollout, and multi-dimensional trajectory verification**; and a 32B model that is SOTA among
  open-source of comparable scale across 20 benchmarks / 5 capability dimensions (complex reasoning,
  instruction following, report generation, file understanding, skills usage).
- **[HONEST CONCLUSION]** This is a *training-data / trajectory-synthesis* paper, not a design
  mechanism for the intent layer. I treat it as background ("deep research needs joint modeling of
  information acquisition, planning, and synthesis") but do not extract a mechanism from it.

---

## 7. The reconciled mechanism: `Intention` as belief-over-goal, driven by information gain

**[SYNTHESIS — this whole section is my design, grounded in the verified findings above.]**

### 7.1 Belief state

```
Intention {
  message: string                     // the parent's raw text
  profile: FamilyProfile             // residency, grades, income, language, existing ties
  hypotheses: Hypothesis[]           // "H" — the solution space
  budgetUsed: number                 // research/ask budget consumed (efficiency guardrail)
  status: 'exploring' | 'concentrated' | 'unresolvable' | 'committed'
}

Hypothesis {
  claim: string                      // e.g. "Family entitled to free/reduced lunch via BenefitsCal"
  subClaims: SubClaim[]              // the grounded pieces — form URL, deadline, eligibility match, contact
  confidence: number                 // concentration of belief on this hypothesis
  sources: string[]                  // authoritative URLs used to attest each subClaim
}

SubClaim { kind, value, source, attested: boolean }
```

**[VERIFIED]** The `subClaims`-attested structure is exactly the DR `claim → recursive subclaims`
representation (2508.04183), and the "score zero if claim wrong OR all sub-claims wrong" rule tells
us `attested` must be mandatory before `commit`.

### 7.2 Information-Gain scorer

```
EIG(raw action a) = Σ_{partition of H induced by a's evidence} p(partition) * H_entropy_reduction
IG-choose(a) = EIG(a) − cost(a)      // cost = friction of asking parent OR token/minutes of research
```

**[VERIFIED]** Selection = **argmax over actions of `EIG − cost`** (TAD's `U(q)`), with the **even
partitioning** heuristic (TAD Corollary 1) as the EIG estimate under a **uniform prior** over `H`
(TAD's uniformity assumption). **[VERIFIED]** Abstain from asking when `EIG ≤ 0` (VoI's
negative-reward-when-concentrated). **[SYNTHESIS]** The **same scorer runs over a research query** as
an action — its "outcome" is retrieved sub-claims, and its EIG is "how evenly does this new evidence
split `H`?"

### 7.3 Ask-vs-research policy

```
loop until status in {committed, unresolvable} or budget exhausted:
  bestAsk      = argmax over candidate questions  of EIG − askCost
  bestResearch = argmax over candidate queries    of EIG − researchCost
  if EIG(bestAsk) <= 0 and EIG(bestResearch) <= 0:
      if isConcentrated(H): status = committed
      else:                 status = unresolvable      // hand off gracefully
  elif bestResearch dominates (higher EIG−cost):
      runResearch(bestResearch)   // fetch → attest subClaims → refute/confirm → re-concentrate H
  else:
      askParent(bestAsk)          // one text round-trip
      update(H, answer)
```

**[VERIFIED]** The load-shifting principle (TAD) says: when in doubt, **generate more hypotheses and
re-score research** rather than trusting a single "what should I ask?" — generation is the model's
strength. **[VERIFIED]** Trigger deep research only when the task meets the DR definition (search +
reasoning intensity, `>10 min`, `≥10 searches` — 2508.04183); otherwise do a single lookup and
commit. **[SYNTHESIS]** This is the **efficiency guardrail**: branch (parallel hypotheses) and
backtrack (revise on contradicting evidence) help, but cost — so gate them by IG rather than
exploring exhaustively.

### 7.4 Grounded commit + honest handoff

- `commit` is only permitted when the chosen hypothesis's **sub-claims are attested** (form URL +
  source + deadline + eligibility match each from an authoritative page). **[SYNTHESIS]** This
  converts the DR "claim must be grounded" rule into an actionable precondition.
- Handoff is mandatory when `status = unresolvable` (SSO / CAPTCHA / no authoritative source) and
  must (a) state the concrete blocker, (b) give the parent a manual next step, (c) not fabricate a
  URL or deadline. **[SYNTHESIS]** This applies HiL-Bench's pattern-3 guard.

---

## 8. [SYNTHESIS] Why this is *not* "classify intent, then run deep research"

The strongest rejected framing was: *classify the intent into a category, then hand off to a
deep-research tool for that category.* The papers reject it on three grounds:

1. **[VERIFIED]** Intent is a *distribution over solutions* (`H`), not a single label — the whole
   point of TAD's `1{h ⊨ R}` and VoI's belief-over-`G` is that ambiguity is *which* hypothesis, not
   *which category*. Classifying steps away the uncertainty the layer exists to resolve.
2. **[VERIFIED]** The ask and the research are **the same mechanism** (uncertainty reduction over
   `H`), so splitting "classify" from "research" breaks the IG gating that decides *between* them.
3. **[VERIFIED]** The DR benchmark's core failure — *claim but not grounding, or grounding but not
   claim* — is precisely what a classification-first pipeline cannot detect, because it discards the
   claim→subclaim attestation structure.

---

## 8.5 [VERIFIED] The 2026 frontier: hypothesis-space exploration and *structured ignorance*

The four 2026 papers directly upgrade the design. **[VERIFIED]** means I read the mechanism; the
paper citations are the most-recent literature as of a recency sweep.

### 8.5a Explore Before Committing — Hypothesis-Guided Search (HypoSearch, arXiv:2609.01294, 2026-09-01)

**[VERIFIED]** This is essentially the `Intention`-as-hypothesis-space mechanism, established and
verified. Key findings:

- **The failure (directly Axolotl's problem)**: "agents often search along a single evolving
  trajectory... may encounter an early search state with several plausible directions, but follow
  one direction before collecting enough comparative evidence. Once this happens, subsequent tool
  calls tend to reinforce the same path." On **BrowseComp, ≈78% of failed trajectories are
  Exploration Failures** — the agent commits to a wrong direction *before* it has comparative
  evidence.
- **The two success behaviors** (measured as **CIR** = candidate-targeted investment rate and
  **SSR** = search-direction switch rate): the best success comes from **candidate grounding AND
  controlled direction movement together** — "high CIR with low SSR reaches only 25% (premature
  lock-in); low CIR with high SSR reaches only 26% (direction changes without concrete targets)."
- **The mechanism** — a divergent-state detector (`s_t = (x, m_t)`): if the state is *direct*, do
  single-path search; if *divergent*, expand into **K lightweight hypotheses** (each a *non-binding
  search direction*, not a claim to prove) → **bounded independent branches** (each collects support,
  contradiction, verified constraints, unresolved issues → structured summary) → **comparative
  aggregation** (compare *evidence*, not vote; return answer + evidence + reasons for rejecting
  weaker alternatives, or refine hypotheses for another round).
- **Results**: Qwen3.5-122B 46.7→60.0 on BC-small (beats majority-vote 56.7 and best-of-N 58.3)
  using **fewer tool calls** than 5 independent trajectories; DeepSeek-V3.2 44.7→53.9 on FutureX.

**[VERIFIED → replaces several of my `[SYNTHESIS]` claims]** My §2 "enumerate diverse hypotheses,
choose action by how it splits H, commit only when concentrated" is exactly this. The Axolotl
takeaway is concrete: **detect "divergent states" in a parent's message and explicitly branch over
candidate program/form hypotheses (each a soft direction), collect bounded evidence per branch,
then compare evidence — rather than picking one direction and committing.** The CIR/SSR result is
the guardrail: always ground a hypothesis in a concrete candidate *and* be willing to switch it.

### 8.5b DualStake — calibrate confidence on *evidence*, not the answer (arXiv:2609.00935, 2026-09-01)

**[VERIFIED]** Deep Research agents "suffer from severe overconfidence, making their expressed
confidence unreliable for user trust and downstream abstention." The fix and its payoff:

- **Evidence Confidence (E-Conf, elicited after the final retrieval step) is a *stronger*
  uncertainty signal than Answer Confidence (A-Conf, elicited after answer generation)** — better
  calibration (ECE) and more correctness-discriminative internal representations (logits + hidden
  states). A-Conf is "largely shaped by E-Conf, rather than independently reflecting answer
  correctness."
- **DualStake** applies margin-clipped, confidence-dependent **stake rewards** to jointly align
  E-Conf and A-Conf with correctness while limiting extreme confidence optimization. Improves
  calibration without sacrificing accuracy on Qwen2.5-7B/-Instruct, Qwen3-4B across 8 benchmarks.

**[SYNTHESIS → application to Axolotl]** The commit gate must use **evidence-confidence** — "how
confident am I in the *retrieved grounding* for this program/form/deadline?" — not answer-confidence
("how confident does my prose sound?"). This is the direct, concrete fix for Axolotl's
overconfident-wrong bugs (the Spanish-locale lock, the "submitted but not submitted"
false-positive): a glib self-assured answer must not be trusted if the *evidence* behind it is thin.

### 8.5c The Severance Problem — the memory blind spot (arXiv:2607.14250, 2026-07-15) ⚠️ RISK

**[VERIFIED]** *This is the biggest caution for Axolotl's profile-driven design.* LLMs lack "an
explicit representation of the person beyond the context they are given." The finding that matters:

- **Memory's blind spot**: "personalized AI assistants with memory identify **fewer** missing
  person-context factors than the no-context baseline across every model, while **elevating
  hallucination rates from 1% to 3.7–11.7%**." More memory → the model "behaves as if it knows the
  person well enough, becoming less likely to ask about what remains unknown and more likely to
  overconfidently extrapolate."
- **The fix — structured ignorance (Severance Schema)**: an explicit inventory of *categories* of
  person-context the model may still be missing (physicality, temporality, consequences, continuity,
  multiplicity, interiority), each either filled or marked `[unknown]`. This is **not** more facts —
  it is a *representation of the knowledge boundary*. With the schema, models "**ask clarifying
  questions** when information about the user is missing, rather than confidently extrapolating,"
  roughly **doubling** identified relevant missing context and cutting harmful advice + sycophancy
  by more than half on open-weight models. Cost: usefulness is slightly lower because it asks more.
- **Decision-flip claims**: the subset of missing info whose absence could *change the recommendation
  or its safety* — these must be surfaced before committing.

**[SYNTHESIS → application to Axolotl]** Axolotl stores a `FamilyProfile`. Per this paper, that
memory can *suppress* clarification and *raise* hallucination. The fix is to give the `Intention`
state a **structured-ignorance schema** — an explicit `[unknown]`-marked inventory of family
dimensions we haven't confirmed (residency, grade, income-eligibility, language preference,
IEP/504 status, existing enrollment, which district). The agent must ask on `[unknown]` fields that
are **decision-flip** (their absence could change the program the family is entitled to), rather than
extrapolating from partial profile. This is the structural guard against both the HiL-Bench
overconfident-wrong pattern *and* the memory blind spot.

### 8.5d Knowing but Not Showing — the ask/answer gap (arXiv:2605.25284, 2026-05-24)

**[VERIFIED]** Models "can often recognize that a query is ambiguous" when explicitly asked to judge
it, "yet in the QA setting they overwhelmingly default to direct answers" — a **recognition-behavior
gap**. And critically: **"retrieved context... makes models even less likely to ask clarifying
questions"** even when the question is ambiguous.

**[VERIFIED]** Root cause: "current training pipelines incentivize LLMs to reveal whatever yields high
reward... When expressing ambiguity awareness is not aligned with high reward, models learn to hide
that awareness." → We need **objectives that reward expressing uncertainty / asking**, not just answer
accuracy. The paper also gives an **ambiguity taxonomy** (Temporal, Scope, Locale, ...) usable for
Axolotl's intent categories.

**[SYNTHESIS → application to Axolotl]** The *act of retrieving context and appearing competent
suppresses clarification* — so Axolotl must not be structured as "retrieve → if confident, answer."
It must be structured as "is this ambiguous, and do I already know the decision-flip facts?" and it
needs to *ask* (not just answer) in the asking-appropriate branch. This is why **Info-Gain gating has
to be an explicit policy step**, not something the model does implicitly.

---

## 9. What this changes in Axolotl's codebase (proposed next steps)

1. **`Intention` belief state** (`src/agent/intention.ts`): `Hypothesis[]` with per-`subClaim`
   attestation, **evidence-confidence** (E-Conf), and a **structured-ignorance schema** — an explicit
   `[unknown]`-marked inventory of family dimensions not yet confirmed. So far intent was implicit (a
   text-bubble + ephemeral turn context); this makes it a persistent belief object that research and
   the profile update.
2. **Divergent-state detector + hypothesis branching** (HypoSearch): detect when a parent's message
   admits several plausible program/form directions; branch over candidate hypotheses as *soft,
   bounded* directions; collect per-branch evidence (support/contradiction/verified-constraints/
   unresolved); then **comparatively aggregate** (evidence-compare, not vote) before committing.
3. **IG scorer** (`scoreInformationGain`): even-partition EIG estimate (uniform prior) with a cost
   term; the "likelihood terms" (VoI) can be computed at inference. Selection = `argmax(EIG − cost)`.
4. **Ask-vs-research policy** wired into the loop, replacing ad-hoc clarify-vs-act branching. Apply
   the **cost term explicitly** (ask = friction of a text round-trip; research = tokens/minutes), per
   "Active Inference as Context Acquisition."
5. **Structure the ask around the decision-flip `[unknown]`s**, not a generic "can you clarify?" —
   this is what turns a clarifying question into an Info-Gain-maximizing one.
6. **Ask-F1 instrumentation** (question-precision + blocker-recall) to measure whether our questions
   are necessary and whether we surface true blockers.
7. **HiL-Bench guards + DualStake calibration**: re-verify even when concentrated; use **evidence
   confidence** (not answer confidence) for the commit gate; bounded research budget then handoff;
   concrete-blocker escalation.

## 10. Implementation status

**Built and verified** (`npm run test:intention` → 43/43 passing):

- **`src/agent/intention.ts`** — the belief/policy core:
  - `structuredIgnorance(profile)` — Severance-style structured ignorance for 9 family dimensions,
    with `decisionFlip` flags and per-dimension `askPrompt`.
  - `beliefEntropy` / `concentrated` / `divergence` — divergence detection (HypoSearch): divergent /
    concentrated / committed / unresolvable. **Committed requires the winning hypothesis' grounding to
    be attested** (≥0.6 evidence-confidence), not just a high belief (DualStake).
  - `eigForPartition` — the BED even-partition rule (TAD Corollary 1): a question is maximally
    informative when its answers split the hypothesis space evenly.
  - `buildAskCandidates` — candidate asks from unconfirmed **decision-flip** unknowns, scored by how
    well each discriminates the hypothesis space; prunes non-discriminating questions (anti-spam).
  - `decide` — the value-of-information (ACI) policy over the shared hypothesis space:
    - **committed** → commit;
    - **concentrated** (dominant belief, weak evidence) → **research to ground** the winning
      hypothesis' sub-claims (evidence-confidence must reach the threshold);
    - **divergent** → ask the most informative family-private decision-flip, else discriminating
      research, else ask a decision-flip;
    - budget exhausted / nothing clears the threshold / unresolvable → **handoff** (never fabricate a
      URL or deadline).
  - `AskF1Tracker` — HiL-Bench Ask-F1 (question-precision + blocker-recall) instrumentation.
  - `hypothesize` / `resolveFuzzyMessage` — a deterministic hypothesis generator STAND-IN for the
    LLM (per TAD's load-shifting insight: solution-generation is the model's strength). Production
    swaps this for an LLM call.
  - `hypothesesFromLLM` / `LlmClient.generateIntentHypotheses` — LLM solution-generation (the
    `hypothesize` stub's production counterpart).
  - `groundIntention` — research-injected grounding that attests the leading hypothesis' sub-claims
    and only lets it reach `committed` once the evidence is real (DualStake).
- **`src/agent/agent.ts`** — wired the `unknown`-intent fallback to `resolveFuzzyIntent`, which (1)
  generates the hypothesis space (LLM first, stub fallback), (2) grounds the leading hypothesis via
  `groundClaim` (runs `researchDistrictNodes`), and (3) acts — surfacing the most informative
  clarifying question, a grounded answer, or an honest handoff.
- **`scripts/test-intention.ts`** — 58 checks incl. the even-partition rule, divergence detection,
  grounding-vs-discrimination, Ask-F1, LLM mapping, and grounding-before-commit, plus the end-to-end
  seam on real fuzzy parent messages.

**Representative output** (from the seam test):

| Parent message | Decision | Resolved question |
|---|---|---|
| "my kid needs speech services, what do I do?" | ask | "Does your child have an IEP or a 504 plan?…" |
| "we moved, how do I enroll?" | ask | "Is your child in a public, private, or charter school?…" |
| "is my daughter eligible for free lunch?" | ask | "Do you receive SNAP/CalFresh or…?" |

**Wired** (this slice): the **execution** step. When an intention reaches `committed` with grounded
evidence, `Agent.stepsForCommittedIntention` maps it to a **consent-gated** Step set — a `browser`
fill-and-submit at the grounded form URL (falling back to an email to the grounded contact). It sets
`state.pendingSteps` and returns a `confirming` turn ("Reply 'submit it' and I'll go"), and the
parent's affirmative runs the steps through the `StepExecutor`. A consent gate (the
`pendingSteps` + `isAffirmative` check) now runs in **both** LLM-enabled and LLM-disabled modes, so
the intelligence layer never executes a consequential action without an explicit parent YES — exactly
the design's "never act without consent" rule. (The intelligence layer still only *informs* when it
can't ground a concrete, con-consent action.)
