# Pathways: the forms, the programs, and the agent built around them

**Status: architecture agreed with Mitch on 2026-10-16 (decisions in §6); being built.** Read `VISION.md`,
`AGENT-PLAN.md` and `SPRINT-PLAN.md` first. This document does three things:

1. Takes stock of what the repo already knows about forms and public programs. It is more than it
   looks, but it sits in three places that don't talk to each other.
2. Sorts the forms parents face into a few kinds, because the kind decides how the agent does
   the job.
3. Proposes the architecture (pathway definition, family record, turn pipeline, lanes, test bench
   and scoreboard) so that every later change can be measured.

Everything below cites where it comes from. "Not verified" marks claims nobody has checked yet.

---

## 1. What we already have

### 1.1 Three islands

| Island | What it is | Depth | Talks to the agent? |
|---|---|---|---|
| **Rules archive** (`archive/`, Python) | Eligibility as tested code, plus procedure, forms, deadlines, documents and cross-program links, with sources | Deep: 7 programs × CA/NY/IL, **497 synthetic household test cases**, PolicyEngine cross-checks (`archive/README.md:16-26`, `archive/crosscheck/adapters/`) | **No.** Self-contained (`archive/README.md:87-89`). Only the MSP numbers reach the website. |
| **Agent** (`src/`, TypeScript) | The conversation, the tools, the hands (email, call, browser, Skyvern, PDF) | Broad but shallow on programs: regex entitlements, statute citations, scripted flows (McKinney-Vento, attendance), demo stubs (meals) | It is the agent |
| **Form bench** (`bench/`, `scripts/test-form-benchmark.ts`, `src/testworld/`) | Real forms probed by type, a quirk taxonomy, a fake district | One real field map (Capitola PDF, 30 fields). **One** end-to-end submission ever, to a test Google Form (`scripts/submit-gform.ts`). No real school or agency form submitted, on purpose. | Partly: the hands it tests are the agent's |

The family record (`src/domain/types.ts:90-125`) has children, school, address, guardians and
needs, but **no household size, income or benefit receipt**. So even if the agent called the
archive, it has nothing to feed it.

### 1.2 Programs, and how deep each goes

| Program | Archive (rules as code) | Agent today | Forms the archive names (CA) |
|---|---|---|---|
| School meals, incl. **CA LCFF Alternative Income Form (AIF)** | ✅ CA/NY/IL, 53 cases. AIF rule, **Oct 31 deadline** + Census Day, minimum content (pupil identity, enough income to show eligibility, an adult's certification), no documents, file with the school or district, 3-year base year (`school_meals/states/ca/playbook.yaml:106-138,242-300`) | Demo stub: "nothing was actually submitted" (`src/tools/meals.ts`) | District F/RP application; CDE AIF templates 1–5 or the LEA's own; Universal Benefit Application |
| CalFresh / SNAP | ✅ 76 cases | Not modeled | BenefitsCal; CF 285 |
| Medi-Cal / Medicaid | ✅ 94 cases | Not modeled (a Medi-Cal renewal is the scenario in `scripts/compare-ux/`) | BenefitsCal / Covered CA; SAWS 2 PLUS; MC 210A |
| Medicare Savings Program | ✅ 91 cases (feeds the /funds calculators) | Not modeled | MC 14A (PDF, mail) |
| Disability (SSI/SSP/SSDI), long-term care Medicaid, turning 65 | ✅ 61 / 47 / 75 cases | Not modeled | SSA and CMS forms |
| McKinney-Vento (transport, immediate enrollment) | ✗ | Scripted 2-step flow that **submits nothing** (`src/agent/mckinney.ts:24-26`); rights cited (`src/knowledge/rights.ts:35-50`) | District liaison (form or email; varies) |
| Attendance barriers / bus pass | ✗ | Barrier diagnosis + drafted message, demo (`src/agent/attendance.ts`); district `busPasses` contact | District transportation request (varies) |
| Special ed (IEP/504), English learners, after-school, summer meals | ✗ | Entitlement or rights text only (`src/knowledge/entitlements.ts`) | Assessment request letter; assessment-plan consent signature |
| **SUN Bucks / Summer EBT** | ✗. Mentioned only as "the meal form unlocks it" (`school_meals/states/ca/playbook.yaml:18,42,297`), which is **wrong for the AIF** (§1.3) | ✗ | Universal Benefits Application or meal application, through the school |
| WIC, LIHEAP, Head Start, CHIP, child-care subsidy, Lifeline, EITC/CTC, FAFSA/CADAA, enrollment/re-registration, immunization | ✗ (some appear as words in `archive/rulesarchive/household.py:57-62`) | ✗ (child-care waitlist probed in the bench) | — |

**Cross-program links already in the archive** (`links:` blocks): CalFresh → free meals by
categorical eligibility and direct certification; Medi-Cal → direct certification (CA: free and
reduced, via CALPADS, `ca/playbook.yaml:332-346`); MSP → Extra Help; disability → Medicaid, MSP,
SNAP. This is the "what it opens next" the sprint plan asks for, already written and sourced.

### 1.3 SUN Bucks: the AIF does not count (checked 2026-10-16)

- **An Alternative Income Form does not qualify a child for SUN Bucks.** CDE: "SUN Bucks
  eligibility determinations cannot be made using the Alternative Income Form (AIF)"
  (cde.ca.gov/ls/nu/sunbucks.asp, reviewed 2026-09-29); "Alternative Income Forms may no longer
  be used for SUN Bucks" (cde.ca.gov/fg/aa/pa/altincomeforms.asp). California's 2024 waiver was
  not renewed for 2025.
- **What does count:** a Universal Benefits Application (UBA) or a meal application, returned to
  the school (never to CDE or CDSS). At a CEP school, a family that isn't directly certified
  needs a UBA every year. Berkeley USD's cover sheet: "The Household Income Form does NOT
  qualify for SUN Bucks"; "some households will complete both."
- **Automatic:** CalFresh, CalWORKs, Medi-Cal at or under 185% FPL, and children directly
  certified, foster, homeless or migrant in CALPADS at an NSLP school.
- $120 per child, once, on a mailed EBT card, to be spent within 122 days. The summer 2026
  deadline (Aug 31, 2026) has passed, so filing now is for summer 2027. **Not verified:** the
  2027 rules and deadline aren't published yet.
- **For the pathway:** where a district accepts the UBA for the LCFF count (the archive lists
  it next to the AIF templates, `ca/playbook.yaml:242-252`), **the UBA is the better form**:
  one form counts the child for the district and gets the family SUN Bucks. Where only the AIF
  is offered, the helper says what the AIF does and doesn't do, and offers the UBA too. It
  never says "the income form also gets you SUN Bucks" about an AIF.
- Sources: cde.ca.gov/ls/nu/sunbucks.asp; cde.ca.gov/fg/aa/pa/altincomeforms.asp;
  cdss.ca.gov/sun-bucks/how-to-get-sun-bucks; cdss.ca.gov/sun-bucks/who-is-eligible;
  fns.usda.gov SEBT 01-2025; berkeleyschools.net UBA (March 2026).

### 1.4 Forms and portals probed

| Form | Kind | How far we got |
|---|---|---|
| Test Google Form | Public web form | **Submitted end to end** (response link returned) |
| CKC Soquel after-school application | Google Form, bilingual | Filled and verified, not submitted |
| Capitola youth scholarship (Spanish) | Fillable PDF, broken encoding | 30-field map; filled and reloaded; never sent to the city |
| Go Kids CareWait (subsidized child care) | Account + OTP, form.io wizard | Account created, logged in, step 1 reached |
| SCCOE child-care referral | Multi-step web form | Language step only |
| BenefitsCal (CalFresh, Medi-Cal, CalWORKs) | Account-gated wizard | Reached, language step only |
| GoCPS, NYC Schools Account, SFUSD, Aeries enrollment, ACCESS NYC | Account / SSO / SIS-linked | Identified and described (`bench/form-quirks.json:14-39`) |
| Facebook Forms embeds (two Santa Cruz orgs) | Controlled inputs, reCAPTCHA or bot detection | 4 of 5 fields stick; handled as "guide the parent" |
| Testworld `/apply`, wizard, iframe, error, injection | Fake district | Every POST is accepted and nothing is graded (`src/testworld/world.ts:107`) |

The quirk taxonomy in `bench/form-quirks.json` (account-gated, benefits portal, SIS-integrated
enrollment, embedded form builder, fillable PDF, Facebook embed, CAPTCHA, file upload,
bilingual) is good and is kept below.

### 1.5 Harness and scoreboard

None of the scoreboard metrics are measured today: no wrong-field count (nothing grades a field),
no guessed-fact count (no value carries a source), no attestation check, no pass^k, no cost per
task, no turns to done. What exists to build on: `src/eval/benchmark.ts` (research-trace scoring,
judge stubbed), `scripts/eval-reliability.ts` (real Skyvern against testworld; cold/warm counts),
`scripts/compare-ux/` (10 scripted personas, 9 English and 1 Spanish, one Medi-Cal letter;
outcome, sent-without-a-yes, latency, cost, repeat agreement), and `scripts/calibrate-yes.ts`.

**Provenance:** no family value carries a source. The model's values override the profile's in
the Skyvern fill (`src/agent/tools.ts:970-978`), which is exactly where a guessed value can reach
a form. Partial provenance exists elsewhere (research `EvidenceRecord`, memory provenance,
recipient authorization) but not on fields.

---

## 2. The kinds of forms (and what each means for the agent)

A form has two sides: **how it is delivered** (which decides the lane) and **what it asks for**
(which decides the conversation). Classify every form on both.

### 2.1 How it is delivered → the lane

| Kind | Examples | Lane | Can we confirm "done"? |
|---|---|---|---|
| **A. Structured submission**: we know the fields and can post them | Google Forms, JotForm, a district's own simple form, an API | Lane 1, direct: post the mapped values, read the response | Yes: response page, receipt, reference |
| **B. Public web form**, unknown or changing layout | District transportation request, after-school sign-ups | Lane 2, replay a recorded script with a check on each page; lane 3, browser agent repairs a broken step | Yes, if the confirmation is read, never assumed |
| **C. Fillable or flat PDF** | AIF templates, MC 14A, ISBE 68-06, scholarship forms | Fill from the form map → the parent reviews the filled PDF → send it on the approved channel (email to the office, upload, or print) | Only with a receipt (a reply email, an upload confirmation). Otherwise it is "sent, not confirmed" |
| **D. Account-gated portal, no identity proofing** | CareWait, GoCPS, Aeries enrollment | Lanes 1–3 inside a session; the parent relays one-time codes; we never store their password (Phase 7 rule) | Yes, from the portal's own status |
| **E. Identity-proofed or SSO** (Login.gov, ID.me, state SSO) | Some benefits portals | **Prepare and hand off.** Never automated (AGENT-PLAN rules). We fill everything we can outside and walk the parent through | From the parent: a screenshot or the notice |
| **F. Paper, phone or in person** | SSP-22 in person, a school office that takes the form on paper | Prepare the packet, give exact instructions, and remind | From the parent or the institution's notice |
| **G. Signature or attestation** | AIF certification, special-ed assessment consent, "under penalty of perjury" | **The parent checks it, never the agent.** Their yes covers our filling; the legal act stays theirs | n/a (it is a step inside one of the above) |

CAPTCHA, MFA and identity checks are hard stops in every lane: hand the step to the parent.

### 2.2 What it asks for → the conversation

| Demand | Where the value comes from | Rule |
|---|---|---|
| Identity facts (child's name, DOB, school, grade) | The family record (district data or the parent's words) | Must carry a source |
| Household facts (size, income, benefits received) | The parent's answers, documents | Must carry a source; ask, never infer |
| Derived values ("income bracket", "categorically eligible: yes") | The rules archive, from sourced facts | Derived values carry the facts they came from |
| Documents (proof of residence, income, immunization) | The parent's uploads | A step of its own; no upload primitive yet (`bench/form-quirks.json:76`) |
| Attestations and signatures | The parent | Never filled by the agent |
| Choices only the parent can make (which school, opt-outs) | The parent | Asked, never defaulted |

---

## 3. The architecture

### 3.1 The pathway: one typed definition per job

A pathway is data plus a few functions, in `src/pathways/<id>.ts`:

```ts
interface Pathway {
  id: 'ca.lcff_aif' | 'ca.calfresh_apply' | 'ca.medi_cal_renew' | 'mv.transport' | ...;
  program: string;              // archive playbook id, when there is one
  jurisdiction: { state: 'ca'; lea?: string };
  facts: FactSpec[];            // what it needs: key, type, required, sensitive, who may supply it
  eligibility?: (hh: Household) => Promise<Determination>;  // the archive, never re-implemented
  form: FormMap;                // per form version: field → fact key | derived value | attestation
  consent: ConsentPoint;        // what the parent approves, shown value by value
  lanes: Lane[];                // in order of preference (A→F above)
  confirmation: ConfirmationSpec;  // what counts as done: reference pattern, page text, receipt
  opensNext: string[];          // from the archive's links (CalFresh, SUN Bucks...)
}
```

The agent never improvises *what* a job needs or *how* it is confirmed: the pathway says. The
model decides only what the pathway can't (how to phrase a question, a step the replay script
can't get past).

### 3.2 The family record, with provenance

Every value becomes `{ value, source: 'district' | 'document' | 'parent' | 'derived', ref, at }`:
the district's record, a document id, the turn the parent said it in, or the rule and facts it
was derived from. **No source, no submit**, enforced in code at the step builder, not in the
prompt. The model's values never override sourced ones (today they do,
`src/agent/tools.ts:970-978`).

The record projects into the archive's `Household` (members, incomes, benefits, facts;
`archive/rulesarchive/household.py:95-129`), so eligibility comes from the archive's tested code
and not from the model's reading of the rules.

### 3.3 The bridge to the archive

The archive stays the single source of truth for rules. The agent calls it through a small
JSON-in/JSON-out command (`python -m rulesarchive.cli evaluate --program school_meals --state ca`),
not a port to TypeScript. Two new things on the archive side:

- `fill_values(program, state, form_id, household)` → the values a correct form would carry
  (AGENT-PLAN-CHECKS 24: the archive gives a determination today, not field values).
- An export of each playbook's `links` and `procedure` so pathways read them instead of copying.

*Decision needed:* a CLI call per evaluation (simple; a Python start per call, not yet measured; needs Python in production) or a
small service. Recommendation: the CLI now, a service only if latency shows up on the scoreboard.

### 3.4 The turn pipeline (from SPRINT-PLAN, unchanged in spirit)

1. **Gates in parallel** (Jev, about 200 ms): crisis, a yes to the pending proposal (built
   today), a new need, off the edge (hand off), a question, distress, injected instructions.
2. **Fact extraction** by a cheap model into the family record, each value with its source.
3. **Next question by information gain** over the pathway's *missing facts* (`intention.ts`
   already does information gain, but over intent hypotheses, not pathway facts).
4. **The reply:** templates in the family's language for known steps; Opus only for turns that
   need it.

Pathway turns go through this pipeline. Everything else keeps today's agent until a pathway
covers it.

### 3.5 Verification and "done"

Every lane reads each field back from the page or PDF and matches it to its own expected value.
The review the parent approves shows the read-back values, not the values we meant to send.
"Done" requires the pathway's confirmation. Everything else is "sent, not confirmed", and the
parent is told so.

---

## 4. The test bench and the scoreboard

### 4.1 Replicas

A replica is a stateful copy of a real form that **grades every field** against the expected
values and logs every event (which pages, which fields, what was submitted, whether the
attestation was checked by a person). Each one implements the quirks that real versions have:
a wizard, validation errors, a required attestation checkbox, a session timeout, Spanish,
a file-upload step. Replica 1 is a California district's AIF (AGENT-PLAN Phase 3).

### 4.2 Synthetic families from the archive's households

The archive's household cases are already ground truth: members, incomes, benefits and the
expected determination (e.g. `school_meals/tests/households_ca.yaml`, 16 CA cases). Turn each
into a synthetic family: the true facts, the expected determination, and (with `fill_values`)
the expected form. That is the 20 families the sprint needs, without inventing them.

*Not circular:* the grader and the agent share the mapping from facts to fields, but not the
facts. The agent has to get the facts from the simulated parent. The mapping itself is checked
separately, against a few forms filled by hand.

### 4.3 Simulated parents

Scripted parents answer from the family's true facts, with the messiness turned up or down:
answers out of order, a wrong number corrected later, "I don't know" for income, Spanish,
a side question, "hold on". Deterministic, free, used for the field-level scores. An
LLM-simulated parent on a small model runs on a subset for conversation quality. The 10
personas in `scripts/compare-ux/personas.json` are the starting set for behaviors.

### 4.4 The runner and the scoreboard

The runner drives the real `Agent.handle`, with its adapters pointed at the replica and a mock
email. Each run writes one row to `eval/results/<date>-<build>.jsonl`, and the scoreboard extends
`src/eval/benchmark.ts`:

| Metric | Definition | Target |
|---|---|---|
| Wrong fields | Submitted value ≠ expected | 0 |
| Guessed facts | A submitted value with no source | 0 |
| Agent-checked attestations | An attestation checked without the parent | 0 |
| Sent without a clear yes | Anything sent that the parent didn't approve as shown | 0 |
| pass^5 | The same family succeeds in 5 of 5 runs | ↑ |
| Done and confirmed | Reached the replica's confirmation | ↑ |
| Turns to done, parent effort | Parent messages; questions asked twice | ↓ |
| Cost per finished task | Model and vendor spend | ↓ |
| Handoffs | When, and whether the handoff was right | Right ones only |

The first run is the **baseline of today's agent** (before), committed with its build hash.

---

## 5. Build order

| Days | What | Done when |
|---|---|---|
| Now | Honesty fixes: "done" needs a confirmation in every adapter (no fabricated `browser-<timestamp>` reference); per-field read-back; per-form data minimization | Tests pass; truth table M5 updated |
| 2–3 | Family record with provenance + household projection; archive CLI with `evaluate` and `fill_values` for CA school meals | A synthetic family's facts → archive → expected AIF values, in a test |
| 2–4 | AIF replica (grading, attestation, Spanish, one wizard step) + 20 families from `households_ca.yaml` + scripted parents + runner + scoreboard | Baseline of today's agent committed |
| 4–9 | Pathway engine + pipeline; `ca.lcff_aif` end to end; offer CalFresh / SUN Bucks next from the archive's links | One family, one yes, the form filed and confirmed on the replica, the next benefit offered, in English and Spanish |
| 8–11 | Second pathway: the attendance barrier (bus pass / McKinney-Vento transport) | Both pass on replicas |

## 6. Decisions (Mitch, 2026-10-16)

1. **Replica districts:** Pajaro Valley Unified, plus two more chosen as good ICP (see
   `docs/REPLICA-DISTRICTS.md` once it lands).
2. **California only** for the launch pathways.
3. **The archive bridge:** "whatever is best." Built as a long-lived Python worker inside the
   agent's container (`archive/rulesarchive/serve.py` ↔ `src/archive/client.ts`): a cold start is
   about 0.6 s, a warm call well under 50 ms, nothing extra to deploy.
4. **SUN Bucks:** checked (§1.3). It changes which form to file.
5. **Recording real portals** for lane 2 scripts: still open (AGENT-PLAN question 2); blocks
   Phase 5, not the AIF.

Separately: a real test-account password was committed in `scripts/test-form-benchmark.ts`
(2026-09-24). It now reads from the environment, but it is still in git history and **must be
rotated**.
