"""Export the numbers the website calculators use, straight from the archive.

    python -m tools.export_site_data            # write tools/site/msp-ny.json
    python -m tools.export_site_data --check    # exit 1 if that file is stale

The site's fund and member calculators (tools/site/build.mjs, public/msp-calc.js)
must use the same New York Medicare Savings Program numbers as the rules
archive. This writes them, with the parameter IDs, effective dates and source
IDs they came from, so the website can never quietly drift from the archive.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from rulesarchive import ARCHIVE_ROOT, params  # noqa: E402

OUT = ARCHIVE_ROOT.parent / "tools" / "site" / "msp-ny.json"

FIELDS = {
    "part_b_premium_monthly": "federal.cms.part_b_standard_premium",
    "part_b_deductible_yearly": "federal.cms.part_b_deductible",
    "income_disregard_monthly": "ny.msp.income_disregard_monthly",
    "earned_exclusion_monthly": "federal.ssi.earned_income_exclusion_monthly",
    "qmb_standard_monthly": "ny.msp.qmb_income_limit_monthly",
    "qi_standard_monthly": "ny.msp.qi_income_limit_monthly",
}

RULES = ["MSP-NY-QMB-INCOME", "MSP-NY-QI-INCOME", "MSP-NY-NO-RESOURCE-TEST", "MSP-NY-DISREGARD",
         "MSP-NY-COUPLE", "MSP-NY-PART-A", "MSP-NY-QI-NOT-MEDICAID", "MSP-FED-EXTRA-HELP-DEEMED"]


RESEARCH = ARCHIVE_ROOT / "research" / "msp_ny_eligibility"


def estimates() -> dict:
    """Eligibility by pension size (ACS PUMS) and the outreach assumptions, for the fund estimate."""
    import yaml

    est = json.loads((RESEARCH / "estimates.json").read_text())
    ass = yaml.safe_load((RESEARCH / "assumptions.yaml").read_text())
    g = est["groups"]
    bands = ["with_pension", "under_500", "500_999", "1000_1499", "1500_1999", "2000_plus"]
    out = {
        "eligible_share_by_pension": {b: {"share": g[b]["share_under_line"], "moe90": g[b]["moe90"]} for b in bands},
        "eligible_source": est["source"],
    }
    for key in ("take_up_among_eligible", "enroll_after_outreach", "months_until_savings", "retained_per_year"):
        out[key] = {k: ass[key][k] for k in ("low", "middle", "high")}
    return out


def build(as_of: date) -> dict:
    out: dict = {"state": "ny", "as_of": as_of.isoformat(), "rules": RULES, "values": {}, "provenance": {},
                 "estimates": estimates()}
    for key, pid in FIELDS.items():
        pv = params.get(pid, as_of)
        value = pv.value
        if isinstance(value, dict):
            value = {str(k): v for k, v in value.items()}
        out["values"][key] = value
        out["provenance"][key] = {"parameter": pid, "effective_from": pv.effective_from.isoformat(),
                                  "confidence": pv.confidence, "sources": list(pv.sources)}
    return out


def render(data: dict) -> str:
    return json.dumps(data, indent=2, ensure_ascii=False) + "\n"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--as-of", help="date the numbers must be in effect (default: today)")
    args = ap.parse_args(argv)
    if args.check:
        if not OUT.exists():
            print(f"{OUT} missing; run python -m tools.export_site_data")
            return 1
        current = json.loads(OUT.read_text())
        expected = render(build(date.fromisoformat(current["as_of"])))
        if OUT.read_text() != expected:
            print(f"{OUT} does not match the archive; run python -m tools.export_site_data")
            return 1
        print("ok: site calculator numbers match the archive")
        return 0
    as_of = date.fromisoformat(args.as_of) if args.as_of else date.today()
    OUT.write_text(render(build(as_of)))
    print(f"wrote {OUT} (as of {as_of})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
