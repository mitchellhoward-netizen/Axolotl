# Authoring guide

How to add or change a playbook. The New York Medicare Savings Program part
(`playbooks/msp/federal` + `playbooks/msp/states/ny`) is the reference example
and follows every rule below. Read it before starting.

## Commands (run from `archive/`)

```sh
python -m tools.sources show URL [--grep REGEX]     # read a source as normalized text
python -m tools.sources snapshot --part PROG        # snapshot every new source in sources.yaml
python -m tools.sources import --id ID --file PATH --via "how"   # for sites that block scripts
python -m tools.validate --only PROG                # schema + cross-reference checks
python -m pytest playbooks/PROG                     # synthetic households
$PE_PYTHON -m crosscheck.run --program PROG         # PolicyEngine cross-check (see crosscheck/README.md)
```

## Layout of one playbook

```
playbooks/<program>/
  __init__.py                 evaluate(household, state, as_of) via rulesarchive.dispatch.evaluate_state
  federal/
    playbook.yaml             summary, rules, procedure, life events, outcome proof, links, open questions
    rules.py                  shared logic (building blocks + helpers states call)
    parameters/*.yaml         federal yearly numbers
    sources.yaml
  states/<ny|ca|il>/
    playbook.yaml             ONLY what the state adds or changes; `overrides:` names replaced federal rules
    rules.py                  evaluate(household, as_of) -> Determination
    parameters/*.yaml
    sources.yaml
    REVIEW.md
  snapshots/<source-id>/      written by tools.sources; never edit by hand
  tests/households_<st>.yaml  synthetic households + expected results
  tests/test_<program>.py     3 lines; see playbooks/msp/tests/test_msp.py
```

Every directory with Python needs an `__init__.py`.

## IDs (global across the archive)

- **Rule:** `<PROG>-<FED|NY|CA|IL>-<NAME>`, for example `MSP-NY-QMB-INCOME`. Program
  prefixes: MSP, T65, DIS, MCD, LTC, SNAP, SCH.
- **Open question:** `<PROG>-<SCOPE>-OQ-NN`.
- **Parameter:** `<federal|ny|ca|il>.<program-or-agency>.<name>`, for example
  `ca.medi_cal.asset_limit`. Use `federal.ssa.*`, `federal.usda.*` and so on for
  agency-wide numbers.
- **Source:** lowercase, dashes, for example `ssa-poms-si-00810-420`,
  `ca-dhcs-acwdl-26-07`.
- **Test case:** `<PROG>-<ST>-T01`; cross-playbook cases `<PROG>-X-01`.

`shared/` holds numbers several playbooks use (poverty guidelines, Part B
premium, SSI income exclusions). Don't edit `shared/` while parallel work is
running. Put new numbers in your own playbook's `federal/parameters`, and note
in REVIEW.md if they belong in `shared/`.

## Research rules (from the brief; the validator enforces most of them)

1. **Primary sources outrank secondary ones.** Primary means statute, regulation,
   the agency's manual (POMS, state eligibility manuals), official directives
   (GIS, ACWDL, all-county letters, policy memos), agency pages and forms.
   Secondary means advocacy, legal aid, law firms, calculators and news. Use
   secondary sources to find things and to cross-check.
2. **Never fill in a number from memory.** If you cannot find it, set the
   parameter value to `null` with an `open_question`, or mark the rule
   `confidence: unresolved` with an `open_question`, and keep going.
3. **Never carry a rule from one state to another.** Each state part cites its
   own state's sources (`jurisdiction: <st>`) or federal ones. The validator
   rejects cross-state citations.
4. **When sources conflict**, add a `conflicts:` entry with both claims and say
   what the archive does meanwhile. Don't resolve it silently.
5. **Every rule has `effective_from`.** Yearly numbers are separate parameter
   values with their own `effective_from`, taken from the source; states change
   on different dates.
6. **Confidence:** `confirmed` needs a primary source that says it. `secondary`
   means only a secondary source supports it. `unresolved` needs an
   `open_question`. If a rule is your inference from primary text, say so in its
   `note` and keep it `confirmed` only if the inference is direct.
7. **Synthetic data only.** No real names, SSNs, case numbers or addresses.
8. **Quote locators.** Every citation has a `locator` (section, table or
   paragraph) and, for numbers, preferably a short `quote`.
9. **Snapshot everything.** Add the source to `sources.yaml`, run
   `tools.sources snapshot`, and check that the saved `.txt` actually contains
   the text you relied on. Some sites (aging.ny.gov, some dhcs.ca.gov pages)
   refuse scripts: fetch them another way, save the file, and use
   `tools.sources import` with `--via` saying how.
    Routes that worked in the first build: WebFetch (saves PDFs to a file
    path); a headless Chromium via Playwright with
    `executable_path=/opt/pw-browsers/chromium-1194/chrome-linux/chrome` for
    sites behind a bot wall (dhcs.ca.gov); a text reader proxy for pages
    that block everything else (record it in `--via`; it counts as a copy of
    the official page, not a secondary source). For sites that serve an
    incomplete TLS chain (nysed.gov, ilga.gov), add the missing public
    intermediate to a scratch CA bundle; never turn verification off.
10. **Check the "earlier research" claims** from the brief that touch your
    playbook, under `claims_checked:` with a verdict.

## Rule statements

A separate model will compare agent messages against these, so each one must
stand alone. Name the program, the state (or "in every state"), the group, the
test and the number. Write "In California in 2026, ...", not "The limit is
...". Keep it to one or two sentences, with no pronouns that point at other
rules.

## Logic

- `states/<st>/rules.py: evaluate(hh, as_of)` returns a
  `rulesarchive.determination.Determination` with status `eligible`,
  `ineligible` or `undetermined`, an optional `tier`, and a `det.note(rule_id,
  text, passed)` for every test applied. Use `params.use(pid, as_of, det)` for
  every number.
- If an unresolved rule decides the case, return `undetermined` and call
  `det.unresolved("<OQ id>")`. Don't guess.
- Put shared logic in `federal/rules.py`. A state's `rules.py` calls it with
  that state's parameters.
- Reuse `playbooks/msp/federal/rules.py: countable_income` for SSI-style
  counting if it fits. If it doesn't, write your own and say why.
- Program-specific inputs go in `Person.facts` / `Household.facts`; list the
  keys you use at the top of your `federal/rules.py`.

## Tests

For each state: synthetic households covering each threshold (at, $1 over),
single and married, other benefits, and county or timing edges. Each playbook
needs at least one household tagged `cross_state` with `compare_states:` giving
the expected result in the other two states (and different results between
states). Each `links:` entry needs a cross-playbook case (`also:`).

Mark `crosscheck: {policyengine: true}` on households PolicyEngine can model
(at least ten per state where PolicyEngine covers the program), then run the
cross-check and explain every difference in `crosscheck/explanations/<program>.yaml`.

## REVIEW.md (per state)

Use the same headings as `playbooks/msp/states/ny/REVIEW.md`: what is solid,
assumptions made, weakest parts, questions for a benefits expert in that state,
cross-checks.
