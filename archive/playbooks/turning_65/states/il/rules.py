"""Turning 65 — Illinois.

Federal Medicare rules apply unchanged. Illinois adds the Medigap "Birthday
Law": a person aged 65 to 75 who has a Medicare supplement policy may, for 45
days starting on their birthday each year, buy a policy with equal or lesser
benefits from the same issuer (or, per the 2026 state guide, an affiliate)
without underwriting. Unlike California, the switch is limited to the same
company group and to ages 65-75. The Benefit Access Program (transit and
license-plate benefits) is flagged as a link.
"""

from __future__ import annotations

from datetime import date

from rulesarchive import params
from rulesarchive.determination import Determination
from rulesarchive.household import Household

from playbooks.turning_65.federal import rules as fed

STATE = "il"


def evaluate(hh: Household, as_of: date) -> Determination:
    det = Determination(fed.PROGRAM, STATE, as_of)
    fed.evaluate_core(hh, as_of, det)
    p = hh.applicant
    gi = fed.medigap_federal(hh, as_of, det)
    m = p.facts.get("medigap") or {}
    birth = fed._d(p.facts.get("birth_date"))
    if m.get("has_policy") and birth is not None:
        days = int(params.use("il.idoi.medigap_birthday_window_days", as_of, det).value)
        ages = params.use("il.idoi.medigap_birthday_rule_ages", as_of, det)
        if not (ages["min"] <= p.age <= ages["max"]):
            det.note("T65-IL-MEDIGAP-BIRTHDAY", f"age {p.age} is outside the 65-75 range for the Illinois birthday rule", False)
        elif fed.birthday_window(birth, as_of, days):
            gi = True
            det.note("T65-IL-MEDIGAP-BIRTHDAY",
                     f"Illinois birthday rule: within {days} days from the birthday, may buy an equal-or-lesser Medigap "
                     "policy from the same issuer (or an affiliate) without underwriting", True)
        else:
            det.note("T65-IL-MEDIGAP-BIRTHDAY", f"outside the {days}-day Illinois birthday window", False)
    det.amounts["medigap_guaranteed_issue_now"] = 1.0 if gi else 0.0
    if hh.incomes and (p.age >= 65 or p.disabled):
        size = min(3, 2 if hh.spouse is not None else 1)
        owners = {p.id} | ({hh.spouse.id} if hh.spouse else set())
        annual = 12 * sum(i.monthly for i in hh.incomes if i.owner in owners)
        limit = params.use("il.aging.benefit_access_income_limit", as_of, det)[size]
        if annual < limit:
            det.links.append("il_benefit_access:may_qualify")
            det.note("T65-IL-BENEFIT-ACCESS", f"income about ${annual:,.0f}/yr is under ${limit:,}: check the Benefit Access Program", None)
    det.note("T65-IL-SHIP", "free Medicare counseling: Illinois SHIP 1-800-252-8966", None)
    return det
