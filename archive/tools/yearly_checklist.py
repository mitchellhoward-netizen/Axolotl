"""Generate YEARLY-CHECKLIST.md from the parameter files.

    python -m tools.yearly_checklist          # rewrite YEARLY-CHECKLIST.md
    python -m tools.yearly_checklist --check  # exit 1 if the file is stale

Every parameter says in `updates:` when its number usually changes. This
tool lists every yearly number with its current value, the date that value
took effect, its sources and that cadence, grouped by state and month, so
the checklist cannot fall out of step with the archive. The calendar at the
top is written by hand in CALENDAR below; the tables are generated.
"""

from __future__ import annotations

import argparse
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from rulesarchive import ARCHIVE_ROOT  # noqa: E402
from rulesarchive.params import parameter_files  # noqa: E402

OUT = ARCHIVE_ROOT / "YEARLY-CHECKLIST.md"

CALENDAR = """\
# Yearly checklist

Numbers in the archive that change on a schedule, and when to re-check them.
The tables below are generated from the `updates:` field of every parameter
(`python -m tools.yearly_checklist`). The calendar is a planning aid that
describes the usual publication pattern. It is not a rule, nothing in the
archive depends on it, and each date should be confirmed against the source
the parameter cites.

| When | What changes | Where it is published | Archive parameters |
|---|---|---|---|
| Early-mid October | Social Security and SSI COLA for next January; SSI federal benefit rate | SSA COLA announcement; POMS SI 02001.020 | `federal.ssa.ssi_federal_benefit_rate_monthly`, state SSI supplements (disability) |
| October 1 | SNAP federal fiscal year: income limits, maximum allotments, standard deductions, shelter cap, resource limits; state utility allowances | USDA FNS COLA memo (published in August); state SNAP agencies (OTDA, CDSS, IDHS) | `federal.usda.snap_*`, `<st>.snap.*` |
| October-November | Medicare Part B premium and deductible, Part A premium and deductibles, IRMAA brackets, Part D base premium (late July/August) | CMS fact sheets; SSA POMS HI 01101.020 | `federal.cms.part_b_standard_premium`, turning_65 parameters |
| Fall / January | Extra Help and MSP resource limits; Medicaid spousal impoverishment standards (CSRA, MMMNA maximum, home equity limit) | SSA POMS HI 03030.025, HI 00815.023; CMS "SSI and Spousal Impoverishment Standards" | `federal.lis.resource_limit`, `federal.msp.resource_limit`, ltc_medicaid parameters |
| Mid-January | HHS poverty guidelines (Federal Register) | Federal Register; ASPE | `federal.hhs.poverty_guideline_annual`, `federal.hhs.poverty_guideline_published` |
| January-April | Each state's Medicaid and MSP levels move to the new poverty guidelines; states do not all use the same date. New York applies them from January 1 by GIS message (published January-February) | NY DOH GIS; CA DHCS ACWDL/MEDIL; IL HFS/IDHS manual releases | `<st>.msp.*`, `<st>.medicaid.*` |
| January | State SSI supplement amounts (CA SSP, NY SSP); NY spousal impoverishment amounts | CDSS; OTDA; NY DOH GIS | disability and ltc_medicaid state parameters |
| February-March | School meal income eligibility guidelines for the school year starting July 1 | USDA FNS notice in the Federal Register | `federal.usda.school_meals_*` |
| July 1 | School meal guidelines take effect; state universal-meal rules for the school year | FNS; CDE, NYSED, ISBE | school_meals parameters |
| Ad hoc | Statutory changes (for example Public Law 119-21: Medicaid retroactive coverage from January 2027, six-month renewals and work requirements for expansion adults, SNAP work rules) | Public law text; CMS and FNS implementation guidance | rules with `effective_from` in the future |

After updating a number, add a **new value** with its own `effective_from`
(never overwrite the old one), re-snapshot its source, run
`python -m tools.validate` and the tests, and re-run the PolicyEngine
cross-check for that program.
"""


def _latest(p: dict) -> dict:
    return max(p["values"], key=lambda v: str(v["effective_from"]))


def _fmt(v) -> str:
    if isinstance(v, dict):
        return ", ".join(f"{k}: {x:,}" if isinstance(x, (int, float)) else f"{k}: {x}" for k, x in v.items())
    if isinstance(v, (int, float)):
        return f"{v:,}"
    return str(v)


def render() -> str:
    rows: dict[str, list[tuple]] = defaultdict(list)
    fixed = 0
    for f in parameter_files():
        rel = str(f.relative_to(ARCHIVE_ROOT))
        for p in (yaml.safe_load(f.read_text()) or {}).get("parameters", []):
            upd = (p.get("updates") or "").strip()
            if any(w in upd.lower() for w in ("statutory", "fixed", "rarely", "state law", "does not change")):
                fixed += 1
                continue
            scope = p["id"].split(".")[0]
            v = _latest(p)
            srcs = ", ".join(c["source"] for c in v.get("sources", []) or [])
            rows[scope].append((p["id"], _fmt(v.get("value")), str(v["effective_from"]),
                                upd or "**cadence not recorded**", srcs, rel))
    out = [CALENDAR, "## Every yearly number in the archive", "",
           f"Generated {date.today().isoformat()}. {fixed} statutory or fixed numbers are not listed.", ""]
    names = {"federal": "Federal (every state)", "ny": "New York", "ca": "California", "il": "Illinois"}
    for scope in ["federal", "ny", "ca", "il"]:
        if not rows.get(scope):
            continue
        out += [f"### {names[scope]}", "", "| Parameter | Current value | In effect from | Usually changes | Source | File |",
                "|---|---|---|---|---|---|"]
        for r in sorted(rows[scope]):
            out.append("| `{}` | {} | {} | {} | {} | {} |".format(*[str(x).replace("|", "/") for x in r]))
        out.append("")
    return "\n".join(out)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args(argv)
    text = render()
    if args.check:
        current = OUT.read_text() if OUT.exists() else ""
        strip = lambda s: "\n".join(ln for ln in s.splitlines() if not ln.startswith("Generated "))
        if strip(current) != strip(text):
            print("YEARLY-CHECKLIST.md is stale; run python -m tools.yearly_checklist")
            return 1
        return 0
    OUT.write_text(text)
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
