"""The website's MSP calculator must agree with the archive.

public/msp-calc.js (run with Node) and the archive's New York evaluator are
given the same New York test households; the tier must match. Also checks that
tools/site/msp-ny.json is the archive's current export.
"""

import json
import shutil
import subprocess
from datetime import date
from pathlib import Path

import pytest

from rulesarchive.testing import evaluate_case, load_cases
from tools import export_site_data

REPO = Path(__file__).resolve().parents[2]
NODE = shutil.which("node")


def test_site_numbers_match_archive():
    current = json.loads(export_site_data.OUT.read_text())
    expected = export_site_data.build(date.fromisoformat(current["as_of"]))
    assert current == json.loads(export_site_data.render(expected))


def _comparable(case):
    hh = case["household"]
    a = hh["members"][0]
    return (hh["state"] == "ny" and str(case["as_of"]) >= "2026-03-01"
            and not a.get("facts", {}).get("lost_part_a_due_to_work")
            and not a.get("facts", {}).get("chooses_qi_over_medicaid")
            and not a.get("facts", {}).get("part_a_buy_in")
            and all(i["kind"] != "ssi" for i in hh.get("incomes", []))
            # The site has an input for health insurance premiums (MSP-NY-HEALTH-PREMIUMS)
            # but not for support paid (MSP-NY-SUPPORT-PAID, unresolved).
            and not any(m.get("facts", {}).get("support_paid_monthly") for m in hh["members"]))


@pytest.mark.skipif(NODE is None, reason="node not installed")
def test_calculator_matches_archive_on_ny_households():
    cases = [c for c in load_cases("msp") if _comparable(c)]
    inputs = []
    for c in cases:
        hh = c["household"]
        earned = sum(i["monthly"] for i in hh["incomes"] if i["kind"] in ("earned", "self_employment"))
        unearned = sum(i["monthly"] for i in hh["incomes"] if i["kind"] not in ("earned", "self_employment"))
        a = hh["members"][0]
        premiums = sum(float(m.get("facts", {}).get("health_insurance_premiums_monthly", 0) or 0) for m in hh["members"])
        inputs.append({"couple": len(hh["members"]) == 2, "onMedicare": 1, "unearned": unearned, "earned": earned,
                       "premiums": premiums,
                       "partA": a.get("medicare_part_a", False), "medicaid": "medicaid" in a.get("benefits", []),
                       "reimbursed": 0})
    script = (
        "import vm from 'node:vm'; import fs from 'node:fs';"
        "const sb = {}; vm.createContext(sb);"
        f"vm.runInContext(fs.readFileSync({json.dumps(str(REPO / 'public/msp-calc.js'))}, 'utf8'), sb);"
        f"const rules = JSON.parse(fs.readFileSync({json.dumps(str(export_site_data.OUT))}, 'utf8'));"
        f"const inputs = {json.dumps(inputs)};"
        "console.log(JSON.stringify(inputs.map((i) => { const r = sb.MSPCalc.member(rules, i);"
        " return r.medicaidChoice ? 'ineligible' : r.tier; })));"
    )
    out = subprocess.run([NODE, "--input-type=module", "-e", script], capture_output=True, text=True, check=True)
    site = json.loads(out.stdout)
    assert len(cases) >= 15
    for case, tier in zip(cases, site):
        det = evaluate_case("msp", case)
        archive = det.tier if det.status == "eligible" else "ineligible"
        site_tier = {"over": "ineligible", "needs_part_a": "ineligible"}.get(tier, tier)
        assert site_tier == archive, f"{case['id']}: site {tier}, archive {det.status}/{det.tier}"


@pytest.mark.skipif(NODE is None, reason="node not installed")
def test_fund_estimate_uses_research_numbers():
    """The fund estimate's middle case follows the documented formula and research inputs."""
    rules = json.loads(export_site_data.OUT.read_text())
    script = (
        "import vm from 'node:vm'; import fs from 'node:fs';"
        "const sb = {}; vm.createContext(sb);"
        f"vm.runInContext(fs.readFileSync({json.dumps(str(REPO / 'public/msp-calc.js'))}, 'utf8'), sb);"
        f"const rules = JSON.parse(fs.readFileSync({json.dumps(str(export_site_data.OUT))}, 'utf8'));"
        "console.log(JSON.stringify(sb.MSPCalc.fund(rules, {retirees: 10000, reimbursed: 0.5, pension: '500_999', fee: 0.2})));"
    )
    r = json.loads(subprocess.run([NODE, "--input-type=module", "-e", script], capture_output=True, text=True, check=True).stdout)
    est = rules["estimates"]
    e = est["eligible_share_by_pension"]["500_999"]["share"]
    a = est["take_up_among_eligible"]["middle"]
    share = e * (1 - a) / (1 - e * a)
    pool = round(10000 * share)
    enrolled = round(pool * est["enroll_after_outreach"]["middle"])
    assert r["pool"]["middle"] == pool
    assert r["enrolled"]["middle"] == enrolled
    assert r["saved"]["middle"] == round(enrolled * rules["values"]["part_b_premium_monthly"] * 12 * 0.5)
    assert r["pool"]["low"] <= r["pool"]["middle"] <= r["pool"]["high"]
    assert r["saved"]["low"] <= r["saved"]["middle"] <= r["saved"]["high"]
