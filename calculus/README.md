# Marginalia: a textbook that reads your work

A math textbook for families. A child works on paper; a parent photographs the page; every
step is checked, the book finds what is missing underneath, and the next packet is set for
them in the textbook's own words. Four courses live in `courses/`:

| Course | Source (exact version in `LICENSES.md`) | Skills | Offered to |
| --- | --- | --- | --- |
| `elementary` Elementary Mathematics, K–5 | *Marginalia Elementary Mathematics* (`books/mk5/`), **written for this project** | 60 | every family |
| `prealgebra` Pre-Algebra, grades 6–8 | *Prealgebra 2e*, OpenStax, **CC BY 4.0** (pinned) | 58 | every family |
| `algebra1` Algebra 1 | *Elementary Algebra 2e*, OpenStax, **CC BY 4.0** (pinned to the last CC BY release) | 75 | every family |
| `calc_limits` Calculus: Limits | *Calculus Volume 1*, Ch. 2, OpenStax, CC BY-NC-SA 4.0 | 45 | the owner only (personal study) |

```
OpenStax CNXML (pinned commit, license verified) ──► courses/<id>/skills.json + misconceptions.json
                                                        │        templates (SymPy-verified, worked solutions)
   learner.db per child ◄── one update per problem ─┐   ▼
        │                                           │  diagnostic rounds (information gain) / lessons / refreshes
        ▼                                           │   │  Typst ─► two-color PDF, the book's text verbatim
  next packet: refresh shaky foundations, else      │   ▼
  one new skill; mixed review; faded first problem  │  paper
                                                    │
  photo ─► Claude vision ─► SymPy step check ─► Jev typed evidence (never sees the learner model)
```

## Run it

```sh
cd calculus
pip install -r requirements.txt
export TYPESAFE_API_KEY=...        # Jev (TypeSafe)
export ANTHROPIC_API_KEY=...       # Claude: reading photos, margin notes
export ADAPTCALC_ACCESS_CODES=PILOT-1234   # sign-up codes (comma-separated)
python -m adaptcalc warm           # books, figures, fonts, KaTeX into .cache/ (about 2 minutes)
python -m adaptcalc serve          # http://127.0.0.1:8000
python -m pytest -q tests          # 57 tests
```

Pages: `/` front matter · `/signup`, `/signin` · `/home` a family's learners (add a child with a
course and a starting point; download or delete data) · `/learn/<id>` a child's book (next page,
send in work, feedback with margin notes, contents, what is learned) · `/learn/<id>/progress` a
printable report · `/privacy`, `/terms`.

Building a packet and checking a photo run as background jobs; the page shows what each job is
doing. Everything a learner sees is scoped to the signed-in family (tests cover isolation).

## Operating the pilot

| Task | How |
| --- | --- |
| Give a family access | Share a code from `ADAPTCALC_ACCESS_CODES` (Railway variable), or add counted codes: `python -m adaptcalc codes --add NAME --uses 10` |
| Owner account | `ADAPTCALC_OWNER_EMAIL` + `ADAPTCALC_OWNER_PASSWORD` (or the old `ADAPTCALC_PASSWORD`). On first start the single-learner data is moved into it as the learner "Me". Or: `python -m adaptcalc owner EMAIL` |
| Daily limits per child | `config.yaml` → `limits` (photos, questions, packets) |
| Starting points | `config.yaml` → `starting_points` (shift the diagnostic's prior) |
| Rebuild a course's skill graph | `python -m adaptcalc --course algebra1 extract` |
| Check every template | `python -m adaptcalc --course algebra1 verify-templates --seeds 40` |

## Deploy on Railway

Service `calculus` in the project, root directory `/calculus`, config `calculus/railway.json`, a
volume at `/data`. Variables: `TYPESAFE_API_KEY` and `ANTHROPIC_API_KEY` (references to the
project's keys, never copies), `ADAPTCALC_ACCESS_CODES`, `ADAPTCALC_OWNER_EMAIL`, and
`ADAPTCALC_PASSWORD` (the owner's password). Deploy with `railway up --service calculus` from
`calculus/`. The image runs `warm` at build time.

## Commands

| Command | What it does |
| --- | --- |
| `python -m adaptcalc [--course ID] extract` | Resolve a course's skill graph and misconception library against the pinned source |
| `python -m adaptcalc [--course ID] verify-templates` | Generate every template at many seeds; each key, written as a learner would, must grade as correct |
| `python -m adaptcalc diagnostic` / `lesson` / `status` / `process PHOTO` / `watch` / `grade` | The single-learner command line (state under `ADAPTCALC_DATA`) |
| `python -m adaptcalc codes` / `owner EMAIL` | Pilot access codes; the owner account |
| `python -m adaptcalc serve` | The web app |

## What the lessons are built on

* **Start from what the student knows**: a diagnostic over the skill graph, chosen by information gain, shaped by the parent's starting point.
* **Step-level feedback**: every written line is checked (equations by solution set, inequalities by solution set, expressions by equivalence).
* **Worked examples, then faded practice**: the book's examples verbatim; a new skill's first problem has its first steps given (from a SymPy-checked worked solution) and the learner finishes it.
* **Self-explanation**: a fixed "pause and explain" prompt after the first worked example, and an ungraded "in your own words" prompt.
* **Interleaved, spaced review**: about a third of practice is review of earlier skills (due ones first), mixed in.
* **Mastery before moving on**: one new skill per lesson; a skill counts as learned after three checked problems or diagnostic placement.
* **Guardrailed AI**: margin notes are checked with SymPy, the notation registry and Jev (no answer give-aways unless asked, no ideas the book hasn't taught); otherwise the book's worked example is shown.

## What a family does (`adaptcalc/flow.py`)

Print, and scan. Nothing else is asked of anyone:

1. Sign up with the child's first name and grade (`flow.GRADES` maps the grade to a course and
   starting point). The first pages are written at once and emailed with the PDF attached.
2. The child works right on the printed pages. The first page carries a QR code for grown-ups:
   it opens `/s/<learner>/<pages>/<signature>` on any phone, without signing in (an HMAC-signed
   link that can only send in photos of those pages and see how they went).
3. Each photo is read and checked; only the problems printed on that sheet count
   (`pipeline.problem_positions`). The reader also says where each problem sits in the photo.
4. The child's book (`/learn/<id>`) gets the page back: the photo, marked beside each problem in
   a teacher's hand, with the notes facing it.
5. When every problem in the set is checked, the next pages are made by themselves (more
   getting-to-know-you pages until the diagnostic settles, then lessons) and emailed.

The learner page is the child's own book, opening at today's page, with one note above it
saying the single thing to do now; the course textbook is behind it in a second tab.

**A route through the textbook** (`adaptcalc/route.py`). The textbook is the content; what is made
for each learner is the route through it. Lessons print the book's own sections, and practice is the
book's own end-of-section exercises, by the book's own numbers ("Exercise 211 · 3.4"), chosen for the
learner and never repeated. The numbering is checked against the book's answer key (answers fall on
the odd numbers: 4,917 of 4,920 in Elementary Algebra 2e). An exercise is used for checked practice
only when the book's answer becomes a safe key: the form the instruction asks for is enforced,
copying the question never counts, SymPy must agree where it can solve the problem, and answers
with units, translations or flattened exponents stay in the book. Generated problems are used only
for a skill with nothing checkable in the book. The textbook's contents show the route: sections
known and skipped, learned, now, next.

What comes along without being asked for:

- **A note for the grown-up** with every set of pages (`flow.teaching_note`): what the pages are
  about, about how long they take, the book's own "For the grown-up" advice, and what to watch
  for. A mistake the child actually made before is listed first ("Maya did this last time").
- **Where the child is starting** (`flow.save_placement`): when the first lesson is made, a page
  in the book records what the getting-to-know-you pages found and where lessons begin.
- **Chapters finished** (`flow.milestones`): a page in the book the day every skill in a chapter
  has been learned through the lessons, with a printable certificate
  (`/l/<id>/certificate/<n>.pdf`). Skills already known at the start never earn one.
- **Homeschool records that keep themselves** (`adaptcalc/records.py`, `/learn/<id>/records`):
  days of mathematics, estimated time (per problem by grade plus reading time), problems and
  accuracy, skills learned with dates (kept apart from skills known at the start), progress by
  chapter, the pace and when the current chapter should be done, and samples of marked work.
  The daily log downloads as CSV, and the whole record prints as a portfolio PDF with a line to
  sign. The weekly email carries the same numbers and a link to it.
- **A story the child is in** (`adaptcalc/story.py`): each set of pages opens with the next part
  of a serialized story built from what the child loves (asked at sign-up, changeable in the
  book). It frames the math and never carries it: a part with any numeral, number word or
  operation is rejected and rewritten, so the problems stay the verified ones. Length and sentence
  length follow the grade; the youngest are read to. On by default for K-7, off for Algebra 1.
- **Work from the family's own book** (`adaptcalc/outside.py`): photograph any page the child
  did in another curriculum. The page is read, each problem is solved from its statement alone
  (never seeing the child's answer), and an answer is used only when SymPy computes the same
  value or two independent solves agree; anything uncertain is left unmarked and uncounted. The
  child's answers are step-checked and graded with the same checker as our pages, mapped to the
  course's skills, and counted in the model and the records. When that book is the main book,
  our pages become short refreshers on what its pages show is shaky. Nothing from the family's
  book is copied into our pages.
- **Spoken check-ins** (`adaptcalc/checkin.py`): after a set of lesson pages is checked, the
  child explains one problem out loud (the one the model is least sure about). The phone's own
  speech recognition turns it into words; no audio reaches the server. What was said is judged
  as light evidence: understanding nudges a skill up but never carries it over the mastery line
  alone, a misunderstanding brings a skill back for review but never takes a mastered skill
  away, a sound explanation of a wrong answer reads as a slip, and "I don't know" changes nothing.

## The bound book (`adaptcalc/volume.py`, `typst/volume.typ`)

Each course is also one whole textbook: cover, contents, chapters that follow the source book's
own chapters and section numbers, each section's lessons (verbatim), Exercises (verified
templates) and, at the back, the answers to every Try It and exercise. It is typeset with the
same styles as the packets, checked with the verbatim audit, and cut into page images.

* On the learner's page it opens as a book: two facing pages (or one larger page), turned with
  the arrows, the keyboard, a click on a page or a swipe. The contents drawer marks what is
  learned and the child's place; a ribbon hangs at the section their open lesson is about.
  "Print the book" gives the whole PDF.
* Printings live on the data volume (`$ADAPTCALC_DATA/volumes/<course>`), keyed by a hash of
  everything that shapes them, so a redeploy that changes no content reuses them. The server
  binds missing ones in the background at startup (`ADAPTCALC_BIND_BOOKS=0` turns that off);
  readers see "being bound" meanwhile. Elementary takes about 40 seconds, Algebra 1 about 2½ minutes
  (700 pages).

## The elementary book (`books/mk5/`)

There is no CC BY textbook for kindergarten to grade 5 in a form we can typeset, so the
elementary course has its own: one YAML file per grade, one section per skill, loaded by
`adaptcalc/authored.py` into the same block structure the OpenStax parser produces. Lessons,
the verbatim audit, Try It answers in the key and the Jev gate therefore work unchanged.

* Write a section as `opening` + `sections`, with `p`, `draw`, `example` (with `step`/`work`
  rows), `try`, `howto`, `def`, `table` and `grownup` blocks (the format is documented at the top
  of `authored.py`). Inline `$...$` is Typst math; `{{tenframe(7) | words}}` draws a figure.
* Figures (ten frames, base-ten blocks, clocks, number lines, fraction bars, arrays, coins,
  graphs, the coordinate plane, prisms, angles, rulers) are Typst functions in `typst/figures.typ`.
* K–2 sections open with a note "For the grown-up", since a parent reads them aloud.
* `grade:` on each skill drives the starting points (`config.yaml`); the elementary diagnostic
  is shorter, in rounds of six (`course_overrides`).
* `tests/test_typeset.py` compiles the whole book and checks every word reaches the PDF.

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
