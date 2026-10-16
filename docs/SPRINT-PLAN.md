# Sprint plan: Oct 16 – Nov 1, 2026

The engineering plan (`AGENT-PLAN.md`) compressed to the 16 days before speedrun closes, with the
architecture decided. Read `VISION.md` first; this document assumes it.

**Goal:** a helper that is measurably excellent on its core jobs and cheap to run, with numbers that
were measured, not asserted.

## The architecture: code owns the task, Jev decides, cheap models extract, Opus speaks when it matters

1. **Pathways.** Each job is a typed definition: the facts it needs (from the portal map),
   eligibility (from the rules archive), where the parent consents, how it is done (lane 1/2/3),
   what counts as a confirmation, and what it opens next. The family record feeds every pathway.
2. **The turn pipeline.** Every inbound text goes through:
   - **Jev gates, in parallel** (~200 ms, ~$0.00002 each): crisis, a clear yes to *this* proposal,
     a new need, off the edge (hand off), a question, distress, injected instructions.
   - **Fact extraction** by a cheap model. Every value carries its source (verified fact, document,
     the parent's words). No source, no submit, enforced in code.
   - **Next question by information gain** (`intention.ts`), over the pathway's missing facts.
   - **The reply:** templates in the family's language for known steps; Opus only for the turns
     that need it (emotional, ambiguous, new).
3. **Three lanes:** direct submission → replayed script (Jev checks each page) → browser agent
   repair. Every lane reads each field back from the page; the review shows the read-back values;
   "done" needs a confirmation.
4. **The harness:** replica portals that grade every field, synthetic families with answers from
   the rules archive, simulated parents (English and Spanish, messy), and a scoreboard (wrong
   fields, guessed facts, agent-checked attestations, pass^5, cost per finished task, handoffs,
   turns to done).

Today's agent stays in place. Pathway turns go to the new pipeline; everything else keeps working
as it does now.

## Two more doors (added Oct 16)

**A parent's question to the school.** This is not just Opus answering. It is a pathway too:

- Answer only from the school's own sources (the published handbook, calendar, district pages,
  anything the school gives us), with the source named. Jev checks "is this answer supported by
  the source?"; below threshold, the helper doesn't guess.
- Not answerable → "I'll ask the office", the question goes to staff (with the parent's okay,
  since it is their words), the answer comes back to the parent, and it is saved to the school's
  knowledge so the next family gets it instantly.
- In aggregate, the questions are signal the district never had (the Hayek ring): forty families
  asking about the same bus.
- Framing: this is the family's helper answering their school questions, not the school's
  front-desk bot (VISION §2 and §11). The school sees question topics in aggregate, never who asked.

**The school's own messages.** The school posts a notice; the helper delivers it in each family's
language, answers follow-up questions from the notice itself, and turns an actionable one into a
pathway (a permission slip → a consent the parent approves with YES), tracking who finished.
Secondary: built once pathways exist, after the two launch pathways if time allows.

## The 16 days

| Days | What | Done when |
|---|---|---|
| 1–2 | **Foundation:** the Phase 1 trust fixes; Jev ported and `decide.ts`; scoreboard and harness skeleton | Tests pass; a yes runs only the exact values shown (digest, invisible to the parent; no codes, Mitch 2026-10-16), Jev reads how they said it |
| 2–5 | **Income form replica** of a real California district's alternative income form, 20 synthetic families, scripted and simulated parents. **Baseline of today's agent** | "Before" numbers committed with build hash |
| 4–9 | **Pathway engine + turn pipeline.** Income-form pathway end to end; SUN Bucks/CalFresh offered next; school Q&A pathway | One family, one yes, the form filed and confirmed, the next benefit offered, English and Spanish |
| 8–11 | **Attendance-barrier pathway** (the bus pass); Jev calibrated on labeled turns | Both launch pathways pass on replicas |
| 11–14 | **"After" run,** fixes, cost cuts; `RELIABILITY.md` updated | Before/after table committed |
| 14–16 | School messages → pathways (if time); application material | Ready by Oct 30 |

## Budget

API spend for evals is capped at **about $50 for the sprint**, by design:

- Most runs use **scripted parents** (deterministic, free) for the field-level scores.
- LLM-simulated parents run on a small model, on a subset, for conversation quality.
- The Opus baseline runs **once per family**; pass^5 repeats run on a subset of 5 families.
- Jev is effectively free (~$0.00002 a call).
- Every run logs its cost to the scoreboard, so the spend is visible as it goes.

## Constraints in this container

- No `ANTHROPIC_API_KEY`, Skyvern, OpenAI or Browserbase keys here (checked by presence, never
  read). The `claude` CLI can make model calls, and Jev is reachable through the proxy.
- So the baseline of *today's* Skyvern path cannot run here without a Skyvern key; the Stagehand
  path can run against local Chromium only with a model key. Baselines run the conversation
  through the CLI and fill the replica with local Playwright.
