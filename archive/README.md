# Mycelium rules archive

Structured, tested, dated rules for the public benefits the Mycelium member
agent helps people get. For each program the archive records who qualifies,
what has to be filed and where, and how to tell that it worked. Every rule
traces back to a saved copy of its source.

This build covers **layer 1 (eligibility)** and **layer 2 (procedure)** for
**New York, California and Illinois**. Layer 3 (each institution's plan
documents) and layer 4 (outcomes from real cases) need customer documents and
real cases, so they are not here yet.

Reviewers start with **[REVIEW.md](REVIEW.md)**. People adding or changing
rules read **[AUTHORING.md](AUTHORING.md)**.

## Playbooks

| Playbook | Directory | What it covers |
|---|---|---|
| Medicare Savings Program | `playbooks/msp` | QMB, SLMB, QI, QDWI; the link to Extra Help (Part D LIS) |
| Turning 65 | `playbooks/turning_65` | Medicare enrollment windows, late penalties, coordination with retiree plans, state Medigap rules |
| Disability | `playbooks/disability` | SSI financial rules and state supplements; the SSDI process |
| Medicaid | `playbooks/medicaid` | Enrollment and renewal on the income-based (MAGI) and age/blind/disabled routes |
| Long-term care Medicaid | `playbooks/ltc_medicaid` | Look-back and transfer penalties, spousal rules, asset limits |
| SNAP | `playbooks/snap` | Enrollment and renewal (CalFresh in California) |
| School meals | `playbooks/school_meals` | Free and reduced-price meals, household income forms, California's alternative income form |

Each playbook has a **federal base**, written once, and a **state part** for
each state that holds only what the state adds or changes. A state rule that
replaces a federal one names it in `overrides:`.

## What is in a playbook part

- `playbook.yaml` has the program summary and local names. It also holds the
  **rule statements** (stable IDs, plain sentences, effective dates,
  confidence, citations) and the procedure: forms, documents, filing,
  timelines, approval notice, renewal and county variation. Then life events,
  outcome proof, links to other playbooks, open questions, conflicts between
  sources, and checks of the claims from the earlier research.
- `rules.py` is the eligibility logic. `evaluate(household, state, as_of)`
  returns eligible, ineligible or **undetermined**, the tier, and the rule IDs
  and parameter values that decided it.
- `parameters/*.yaml` holds the yearly numbers, keyed by effective date, each
  with sources and confidence.
- `sources.yaml` lists every source with URL, publisher, title, section,
  effective date, date retrieved, primary/secondary, and jurisdiction. Copies
  are saved in `snapshots/`.
- `REVIEW.md` (state parts) has notes for a reviewer who knows that state.
- `tests/` has synthetic households with expected results.

## Running it

```sh
cd archive
pip install -r requirements.txt          # PyYAML, jsonschema, requests, bs4, lxml, pypdf, pytest
python -m tools.validate --stats         # schema + cross-reference checks
python -m pytest                         # every playbook's households + tool tests
python -m tools.check_changes            # re-fetch sources, report what needs re-checking
python -m tools.yearly_checklist         # regenerate YEARLY-CHECKLIST.md
```

Using a playbook from Python:

```python
from datetime import date
from rulesarchive.household import Household
import playbooks.msp as msp

hh = Household.from_dict({"state": "ny", "members": [{"id": "a", "age": 70, "medicare_part_a": True}],
                          "incomes": [{"kind": "social_security", "monthly": 1500, "owner": "a"}]})
print(msp.evaluate(hh, "ny", date(2026, 3, 1)).explain())
```

## Keeping it current

- **Change detection:** `tools/check_changes.py` runs every Monday through
  `.github/workflows/rules-archive-sources.yml`. It re-fetches each source and
  compares it with the snapshot. When a source has changed, it lists every rule
  and parameter that cites it, grouped by state, and opens an issue.
- **Yearly numbers:** [YEARLY-CHECKLIST.md](YEARLY-CHECKLIST.md) lists every
  number that updates on a schedule and when it usually changes.
- **CI:** `.github/workflows/rules-archive.yml` validates the archive and runs
  the tests on every change under `archive/`.

## Design choices

- **Python, YAML, pytest.** These are what the brief asked for. The archive is
  self-contained and does not touch the TypeScript app. The agent can call it
  as a library, or read the YAML directly.
- **Three-valued results.** If a number or rule the decision needs is
  unresolved, the result is `undetermined` and names the open question. It is
  never a guess.
- **Confidence labels are enforced.** `confirmed` needs a primary source;
  `secondary` means only secondary sources support it; `unresolved` must name
  an open question. A state part cannot cite another state's sources.
- **PolicyEngine US and the Atlanta Fed Policy Rules Database** are
  comparison tools only (AGPL-3.0 and GPL-3.0). Their code is not copied here.
  See [crosscheck/README.md](crosscheck/README.md).
