# Adaptive math textbook (OpenStax: prealgebra and algebra up to Calculus Vol. 1, Chapter 2)

A personal textbook that adapts to you. The canonical text is OpenStax
*Calculus Volume 1*, Chapter 2 (Limits), printed verbatim. What changes from
packet to packet is only which boxes are selected, the practice problems, and
short transitions. You work on paper, photograph the page, and the system
grades each step, asks typed questions about your work, and updates a model
of what you know.

```
OpenStax CNXML ──► skills.json + misconceptions.json ──► templates (SymPy-verified)
                                                              │
         learner.db (SQLite) ◄── once per problem ──┐         ▼
              │                                     │   diagnostic rounds / lesson packets
              ▼                                     │         │  Typst ─► two-color PDF
   next round chosen by information gain            │         ▼
                                                    │     you, on paper
  ./inbox photo ─► Claude vision ─► SymPy step check ─► Jev typed evidence (no learner data)
```

## Setup

```sh
cd calculus
pip install -r requirements.txt
export TYPESAFE_API_KEY=...        # Jev (TypeSafe)
export ANTHROPIC_API_KEY=...       # Claude vision transcription (or `ant auth login`)
python -m adaptcalc extract        # fetch Chapter 2, write skills.json + misconceptions.json
python -m pytest -q tests          # 42 tests
```

Fonts (Fira Sans, SIL OFL), the OpenStax source and its figures are downloaded
on first use into the gitignored `.cache/`. Learner state lives in
`state/learner.db`; packets are written to `out/`.

## In the browser

```sh
python -m adaptcalc serve              # http://127.0.0.1:8000
python -m adaptcalc serve --host 0.0.0.0   # reachable from your phone on the same Wi-Fi
```

One page with four parts:

* **Next step**: open the current packet, or make the next diagnostic round or lesson.
* **Photograph your work**: on a phone this opens the camera; drag-and-drop on a computer.
* **Feedback**: your transcribed lines, the step SymPy rejected, the misconception, and how the model changed.
* **What you know**: mastery per skill, grouped by section.

Set `ADAPTCALC_PASSWORD` to require a password (HTTP basic auth, any user name) before exposing it beyond your machine. With `ANTHROPIC_API_KEY` set, photos are read by Claude vision. Without it, an upload waits in `inbox/` for a manual `*.transcript.json`, and the header shows which mode is active.

## Deploy on Railway

The app ships as its own Railway service (the repo's root `railway.json` is the Axolotl agent's).
In the Railway project:

1. **New → GitHub Repo →** this repository (branch with `calculus/`).
2. Service **Settings**: set **Root Directory** to `/calculus` and **Config-as-code file** to `/calculus/railway.json`.
3. **Variables**: set `ADAPTCALC_PASSWORD` and `TYPESAFE_API_KEY`, and set `ANTHROPIC_API_KEY`.
   If the key already lives in the project, reference it rather than copying it:
   `${{shared.ANTHROPIC_API_KEY}}` for a shared variable, or `${{<other-service>.ANTHROPIC_API_KEY}}`.
4. **Volume**: attach one to the service, mounted at `/data` (the image sets `ADAPTCALC_DATA=/data`).
   This is where your progress, packets and photos live.
5. **Networking → Generate Domain**, then open it and sign in with any user name and the password.

The image downloads the book, figures, fonts and Typst packages at build time (`python -m adaptcalc warm`).
It will not serve on a public address without `ADAPTCALC_PASSWORD`.

## Commands

| Command | What it does |
| --- | --- |
| `python -m adaptcalc extract` | Fetch Chapter 2 from OpenStax's source repo, resolve the skill graph and misconception library, write the JSON files |
| `python -m adaptcalc verify-templates` | Generate every template at many seeds; SymPy recomputes each answer, and each key must grade itself as correct |
| `python -m adaptcalc diagnostic` | Choose and print the next diagnostic round (or report that the diagnostic is finished) |
| `python -m adaptcalc watch` | Watch `./inbox` for photos of your work and process them |
| `python -m adaptcalc process PHOTO` | Process one photo |
| `python -m adaptcalc lesson` | Build the next lesson packet for your frontier skills |
| `python -m adaptcalc status` | Mastery per skill, remaining diagnostic uncertainty, frontier, reviews due |
| `python -m adaptcalc grade D1 "1:c 2:x 3:s"` | Grade without a photo (correct / wrong / skipped) |
| `python -m adaptcalc serve` | The browser app |

## How each part works

**1. Source and skill graph** (`source.py`, `cnxml.py`, `mathml.py`, `extract.py`, `ontology.yaml`).
Three OpenStax books are used: *Calculus Volume 1* Chapter 2 (the course),
*Algebra and Trigonometry 2e* and *Prealgebra 2e* (the foundations underneath
it); see `source.BOOKS`. The chapter comes from `github.com/openstax/osbooks-calculus-bundle`: the
collection file lists the six modules of "Limits"; each is CNXML with MathML.
The parser keeps every character of text and converts all 1,601 formulas in the
chapter to Typst. The skill graph is a curated ontology (45 skills: 28 chapter
skills, 12 algebra/trig foundations directly underneath them, and 5 deeper
prealgebra/algebra basics: order of operations, fractions, exponents,
multiplying polynomials, linear equations) whose every claim is
resolved against the parsed source: learning objectives (verbatim), example
and box titles (to element ids and "Example 2.13" labels), glossary terms, and,
for the foundations, detectors that find where the chapter exercises them.
Extraction fails if an anchor does not resolve, a prerequisite is unknown, or
the graph has a cycle. Each foundation skill is tied to the exact subsections
of *Algebra and Trigonometry 2e* or *Prealgebra 2e* that teach it, with their
worked examples and Try Its. `misconceptions.json` holds 110 misconceptions, each with
the root skill it points to; five are tied to the chapter's own True/False
exercises that address them.

**2. Problem templates** (`templates.py`, `answers.py`). There are 47 templates,
covering every skill. Each builds a problem constructively, then SymPy
recomputes the answer independently (`limit`, `solve`, `trigsimp`,
`continuous_domain`, inequality solving, and an exact supremum for δ–ε); a
problem is emitted only when the two agree. Answers are graded by kind: limit
(value, ±∞, DNE), value, factored/rationalized expression, set, interval, choice,
and δ, where any δ small enough is accepted.

**3. Learner model** (`learner.py`). SQLite holds per-skill mastery
probability, stability and next-review date, every printed problem with its
key, and one `attempts` row per problem (primary key), so the model is updated
exactly once per problem. Outside the diagnostic, an update is an exact
Bayesian update over the problem's required skills plus the misconception's
root skill (a DINA response model with fractional credit). This is followed
by a learning step and review scheduling, where intervals grow on clean
successes and reset on failure.

**4. Diagnostic** (`diagnostic.py`). The belief is a weighted set of particles
over the 40-skill mastery vector. The prior respects the graph: a skill is
unlikely to be mastered if its prerequisites are not. Since you answer on
paper, questions go out in printed rounds (sizes 10, 10, 5, 5, …; 25–40 total).
Each round is chosen greedily to maximise the exact mutual information between
the round's answers and your skill state, computed by enumerating all 2^k answer
patterns. The key sheet prints each question's expected information in bits.
The diagnostic stops at 40 questions, or after 25 once every skill is certain
to within 0.5 bits.

**5. Packets** (`render.py`, `packets.py`, `textgen.py`, `notation.py`, `typst/textbook.typ`).
Typst with one spot color (teal) plus black: learning objectives, definition,
theorem and strategy boxes, example bands, checkpoints, and a running head.
Figures are re-inked in two colors (curves in the spot color, everything else
in black). Canonical text is emitted as Typst string literals, so no character
is read as markup. After compiling, a verbatim audit extracts the PDF text and
checks that every canonical text run is present (`out/L*.gate.json`). Every
generated snippet (transition or template problem) must pass three checks:

1. **SymPy**: its math is carried as SymPy claims and verified; a problem's
   key must re-grade as correct.
2. **Notation**: its math uses only notation the book has introduced by that
   point. A registry records where each notation (limit, one-sided limit, ∞,
   ε, δ, and so on) first appears. Derivatives and integrals, which the chapter never uses, are always blocked.
3. **Jev**: one noul per snippet asks whether it introduces an idea absent from
   the canonical passages around it. Anything above the threshold is rejected.

A rejected transition is replaced by the skill's learning objective (verbatim).
A rejected problem is replaced by a canonical checkpoint for that skill, which
is graded when the book's answer is numeric. With no Jev available,
nothing generated is printed.

**6. Photo pipeline** (`pipeline.py`, `transcribe.py`, `stepcheck.py`, `evidence.py`).
Claude vision (`claude-opus-5-5`, JSON-schema structured output) transcribes
each line as text plus SymPy. It records crossed-out, boxed, and
continues-the-previous-line flags. SymPy checks every step: equality chains,
limits (limitands must agree near the point), and equations (same solution set).
It then grades the boxed answer. Jev then answers typed questions per problem:

* misconception: a choice over the skill's library plus none, other, unsure
* attempt count: one noul per crossed-out run ("abandoned approach or local
  fix?"), counted in code
* written-out sub-computations: one noul per expected sub-step
* strategy: a choice over the template's strategies

These combine into one credit and one update. **Jev evidence calls never see
the learner model.** The state is built from an allow-list of fields
(problem, key, transcribed work, SymPy check, misconception library), and any
learner-model field raises. Tests check that `evidence.py` cannot import the
learner model, diagnostic, packets or pipeline modules, even indirectly.

All Jev questions and thresholds are in `jev_questions.yaml`. Non-Jev policy
(prior, slip, credit rules, round sizes) is in `config.yaml`.

**7. Refresh-then-test** (`packets.build_refresh`). Most adults who return to
math are rusty rather than new to it. When a foundation skill is on your
frontier, the next packet is a *refresh*: only the book subsections that teach
that skill (verbatim, with their worked examples, How To boxes and Try Its),
then practice. Foundation skills use a faster learning rate
(`learner.learn_foundation`) because relearning is quicker than learning.
Chapter lessons start once the basics hold. When Jev rejects a generated
problem, the book's own Try It is printed instead; it is graded when the book's
answer is a single value or expression that SymPy can re-grade.

**8. Ask about this** (`tutor.py`). Every graded problem has an *Ask about this*
box. Claude answers from three things only: your transcribed work, what SymPy
found in it, and the book's passages for the skill (and for the root skill of
the misconception). Before a reply is shown:
* every equation in it is re-checked by SymPy;
* its math may only use notation the book has introduced;
* Jev checks that it doesn't give away the final answer (unless you asked for
  it) and doesn't bring in ideas the passages lack.

A failing reply is regenerated once. If it fails again, you get the book's
worked example instead.

**9. Progress** (`/progress`). A page you or a parent can read at a glance:
* skills mastered;
* problems checked per day;
* the mistakes that keep coming up, each with its underlying skill;
* what's next and what's due for review.

It prints cleanly. Packets you don't want to finish can be set aside from the
main page.

## The sample run in `samples/`

These files come from one run from an empty state:

* `D1.pdf`, `D1-key.pdf`: the first diagnostic round. It expected 5.58 bits of
  information against 27.87 bits of initial uncertainty.
* `d1-page1.jpg`, `d1-page2.jpg`: photos of handwritten work on D1, with a
  crossed-out false start, boxed answers, a skipped problem, a conjugate error
  and a left-endpoint error. See the note below on how they were made.
* `*.transcript.json`: the transcriptions. `report-*.json`: per-problem SymPy
  checks, Jev answers, credit and mastery changes. Some results:
  * #2 was marked wrong at line 2 by SymPy; Jev chose
    `alg_conjugate.conjugate_product_wrong`, and alg_conjugate dropped to 0.11.
  * #3 was correct after a restart: Jev judged the crossed-out run as an
    abandoned approach (attempts = 2) with `invert_wrong_part`.
  * #9 had Jev choose `area_rectangles.wrong_endpoints`.
* `D2.pdf`: the second round, re-targeted by the evidence (rational
  simplification, absolute value, early limit skills).
* `L1.pdf`, `L1.gate.json`: a Section 2.1 lesson for the weakest frontier
  skill. Jev rejected the template's "right-endpoint rectangles" wording: that
  idea is only in a figure of Section 2.1, not its text. The packet therefore
  printed canonical Checkpoint 2.3 instead, which is graded against the book's
  answer (17).

## Honest notes

* **Sample photos are synthetic.** `tools/make_sample_photo.py` renders work in a
  handwriting font on ruled paper, then applies perspective, lighting, noise and
  JPEG compression. Replace them with photos of your own pages.
* **The Claude API transcriber was not exercised live.** The build environment
  had no Anthropic credentials. The pipeline therefore used its sidecar
  backend: Claude, in the build session, read each photo and wrote the
  transcript by following the same instructions and schema. With
  `ANTHROPIC_API_KEY` set, `transcribe.ClaudeTranscriber` is used automatically.
* The Jev calls in the sample run are real (`jev-1.13.0`), logged in the
  `jev_log` table.
* The sample run below predates the foundations layer; today's first diagnostic
  round starts lower (exponents, linear equations) because the skill map now goes deeper.
* The tutor is tested with fake Claude and Jev clients locally; live, it runs on
  Railway where the Anthropic key lives.
* Graph-reading problems are drawn from their formula with cetz. The OpenStax
  graph exercises themselves are printed only as canonical content.
* Chapter-wide numbering ("Example 2.13", "Figure 2.24") is recomputed from the
  source the way the web book numbers it.

Canonical text: OpenStax *Calculus Volume 1*, Chapter 2 (CC BY-NC-SA 4.0),
*Algebra and Trigonometry 2e* (CC BY 4.0) and *Prealgebra 2e* (CC BY 4.0), https://openstax.org.
