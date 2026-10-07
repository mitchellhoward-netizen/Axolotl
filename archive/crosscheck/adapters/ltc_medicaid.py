"""PolicyEngine adapter for the long-term care Medicaid playbook.

PolicyEngine US models only one piece of long-term care Medicaid: the home
equity limit of 42 U.S.C. 1396p(f) (variable
``is_medicaid_long_term_care_home_equity_eligible``, Person, YEAR), with one
national limit (the federal maximum, $1,130,000 in 2026) and the spouse /
child-in-the-home exception. It does not model the look-back or transfer
penalties, spousal impoverishment (CSRA, MMMNA), the personal needs allowance,
patient liability, or any state's nursing-home resource limit.

So this adapter compares only the home equity test: "eligible" means the home
equity test is passed (or does not apply), "ineligible" means it is failed.
Our side is read from the Determination's home-equity reason.
"""

from __future__ import annotations

from datetime import date

PE_VARIABLES = ["is_medicaid_long_term_care_home_equity_eligible"]


def _home_equity(hh) -> float:
    a = hh.applicant
    if "home_equity" in a.facts:
        return float(a.facts["home_equity"])
    return sum(x.value for x in hh.assets if x.kind == "home" and x.owner == a.id)


def pe_inputs(hh, as_of: date) -> dict:
    a = hh.applicant
    in_facility = a.facts.get("care_setting", "nursing_facility") == "nursing_facility" and bool(a.facts.get("institutionalized"))
    return {"extra_person": {a.id: {
        "is_in_medicaid_facility": in_facility,
        "home_equity": _home_equity(hh),
        "home_is_on_agricultural_land": bool(a.facts.get("home_on_agricultural_land", False)),
    }}}


def read(sim, hh, as_of: date) -> dict:
    idx = [m.id for m in hh.members].index(hh.applicant.id)
    ok = bool(sim.calculate("is_medicaid_long_term_care_home_equity_eligible", str(as_of.year))[idx])
    return {"status": "eligible" if ok else "ineligible", "tier": "home_equity_test"}


def ours(det) -> dict:
    """Our home equity test result, from the Determination."""
    if any(r.rule.endswith("-HOME-EQUITY") and r.passed is False for r in det.reasons):
        status = "ineligible"
    elif "LTC-CA-OQ-01" in det.open_questions:
        status = "undetermined"
    else:
        status = "eligible"
    return {"status": status, "tier": "home_equity_test"}


def same(o: dict, p: dict) -> bool:
    return o["status"] == p["status"]


def federal_minimum(hh, as_of: date) -> dict:
    """Our federal logic with the federal maximum limit (the national figure PolicyEngine uses)."""
    from playbooks.ltc_medicaid.federal import rules as fed
    from rulesarchive import params
    from rulesarchive.determination import Determination

    det = Determination("ltc_medicaid", hh.state, as_of)
    if hh.applicant.facts.get("care_setting", "nursing_facility") != "nursing_facility":
        return {"status": "eligible", "tier": "home_equity_test"}
    limit = params.get("federal.ltc.home_equity_maximum", as_of).value
    ok = fed.home_equity_test(hh, as_of, det, limit, "LTC-FED-HOME-EQUITY")
    return {"status": "eligible" if ok else "ineligible", "tier": "home_equity_test"}
