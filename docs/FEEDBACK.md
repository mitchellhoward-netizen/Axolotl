# Axolotl — cofounder feedback guide

The point of a feedback session is not "does it feel cool" — it's *where does it break*.
Run through the scenarios below and, for each, note three things: **what it got right,
what it got wrong, and where it got stuck or asked twice.**

## How to run it

**Option A — terminal (zero setup beyond the repo):**

```sh
npm install
npm run chat
```

Type like you're texting. First message triggers onboarding.

**Option B — the real thing (iMessage):** deploy the agent to a long-lived host (Railway/Fly)
with the env vars set, then text the Spectrum line from your phone.

## Scenarios (start broad, then narrow)

| # | Say | What it should do |
|---|---|---|
| 1 | `my kid needs a bus` | infer transportation; ask which kid/school; surface McKinney-Vento + the right contact/form |
| 2 | `we need help with food` | infer meals; offer free/reduced application; homeless → automatic eligibility |
| 3 | `she's struggling with math` | *not* know, but offer a path (tutoring/teacher conference) rather than guess |
| 4 | `he can't focus in class` | ask clarifying questions; surface 504/evaluation as a *possibility to confirm*, not a diagnosis |
| 5 | `I think the school is supposed to provide something` | probe: what do you think they should provide / what's going on |
| 6 | `how do I get transportation?` | same as #1 but phrased as a question — should not re-ask what it already knows |
| 7 | `can you find the form?` | find + surface the actual form/link (or say it can't find it) |
| 8 | `what are we eligible for?` | enumerate entitlements *grounded in the family profile*, never invented |
| 9 | (mid-flow) `never mind, about lunch` | pivot cleanly to the new topic without dragging the old flow along |
| 10 | `did you actually send that?` | honest: demo = no, and explain the consent gate |

Then a **stress test**: give it a school/district that isn't Soquel (e.g. "Pajaro Valley Unified",
"Los Angeles Unified") and watch what it does when it doesn't know the district.

## Feedback form (paste back)

For each scenario, one line each:

- **Scenario:** `#N`
- **Got right:**
- **Got wrong:** (facts, tone, overconfidence, wrong contact)
- **Got stuck / repeated:**
- **Would you trust this for a real parent? (yes/no/why)**

And three top-level answers:

1. What's the #1 thing it does that would embarrass us with a real parent?
2. What's the #1 missing capability you expected but didn't get?
3. If you were a busy parent, would you text this instead of calling the office? Why?

## What *not* to spend time on

- Visual polish / emoji / tone. We know that's rough.
- Anything about "the model" — we care about behavior, not which model.
- Legal precision of the statutes — flag it if it's *wrong*, but we already know the citations
  are a first pass.
