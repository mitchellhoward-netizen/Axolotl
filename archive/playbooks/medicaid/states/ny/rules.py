"""Medicaid — New York.

New York covers MAGI adults, parents/caretaker relatives (of any age, even
with Medicare) at 138% FPL and pregnant people at 223% FPL, through NY State of
Health. People 65+, blind or disabled ("SSI-related") are budgeted with SSI
rules against the Medicaid income level (138% FPL) and resource level; above
either, they can still get Medicaid through the Excess Income ("spenddown")
program, so an over-level case is reported as eligible with tier
``spenddown`` and the amounts to spend down. SSI recipients get Medicaid from
the SSI award (New York is a 1634 state).
"""

from __future__ import annotations

from datetime import date

from rulesarchive import params
from rulesarchive.determination import ELIGIBLE, INELIGIBLE, UNDETERMINED, Determination
from rulesarchive.household import Household

from playbooks.medicaid.federal import rules as fed

STATE = "ny"

MAGI_LIMITS = {
    "pregnant": "ny.medicaid.magi_pregnant_income_limit_monthly",
    "parent": "ny.medicaid.magi_parent_income_limit_monthly",
    "parent_medicare": "ny.medicaid.magi_parent_income_limit_monthly",
    "adult": "ny.medicaid.magi_adult_income_limit_monthly",
}
MAGI_RULES = {"pregnant": "MCD-NY-MAGI-PREGNANT", "parent": "MCD-NY-MAGI-PARENT",
              "parent_medicare": "MCD-NY-MAGI-PARENT", "adult": "MCD-NY-MAGI-ADULT"}


def immigration(hh: Household, as_of: date, det: Determination) -> bool:
    """Return True to continue evaluating; False when the determination is final."""
    a = hh.applicant
    status = fed.immigration_status(a)
    if status == "citizen":
        return True
    ffp = fed.ffp_immigration(a, as_of, det)
    if ffp:
        return True
    if ffp is None:
        det.status = UNDETERMINED
        det.unresolved("MCD-NY-OQ-04")
        return False
    if a.pregnant:
        det.note("MCD-NY-UNDOCUMENTED", "pregnant: New York Medicaid is available regardless of immigration status", None)
        return True
    if status == "undocumented" and a.age < 21:
        det.status = UNDETERMINED
        det.unresolved("MCD-NY-OQ-04")
        det.note("MCD-NY-UNDOCUMENTED", "child or young adult without status: coverage route not modelled", None)
        return False
    if status != "undocumented" and a.age < 21:
        det.note("MCD-NY-IMMIGRANT-2026", "under 21: New York keeps federally funded Medicaid for lawfully residing "
                 "children (CHIPRA 214)", None)
        return True
    if status == "undocumented":
        det.status = INELIGIBLE
        det.links.append("emergency_medicaid")
        det.note("MCD-NY-UNDOCUMENTED", "no satisfactory immigration status: Medicaid only for treatment of an "
                 "emergency medical condition (or pregnancy)", False)
        return False
    if as_of >= date(2026, 10, 1) and a.age < 65:
        det.status = INELIGIBLE
        det.links.append("essential_plan:refer")
        det.note("MCD-NY-IMMIGRANT-2026", f"{status}, age {a.age}: from October 1, 2026 no federal Medicaid funding; "
                 "New York moves people 21-64 to the Essential Plan if eligible (state-only Medicaid only for those "
                 "who cannot get the Essential Plan, e.g. needing long-term care)", False)
        return False
    det.note("MCD-NY-IMMIGRANT-2026", f"{status}, age {a.age}: Medicaid continues with State-only funding", None)
    det.links.append("state_only_funding")
    return True


def evaluate(hh: Household, as_of: date) -> Determination:
    det = Determination(fed.PROGRAM, STATE, as_of)
    a = hh.applicant
    if fed.ltc_handoff(hh, det):
        return det
    if not immigration(hh, as_of, det):
        return det
    if fed.ssi_recipient_1634(hh, det, "MCD-NY-SSI-AUTO"):
        return fed.finish(hh, det)

    # ------------------------------------------------------------- MAGI
    tier = fed.magi_test(hh, as_of, det, MAGI_LIMITS, MAGI_RULES)
    if tier:
        if tier == "adult_expansion" and not fed.community_engagement(hh, as_of, det):
            det.status = INELIGIBLE
            det.note("MCD-NY-WORK-REQUIREMENT", "adult group: community engagement not shown for the month", False)
            return det
        det.status, det.tier = ELIGIBLE, tier
        det.note("MCD-NY-WHERE-TO-APPLY", "MAGI group: apply and renew through NY State of Health", None)
        return fed.finish(hh, det)

    if not fed.aged_blind_disabled(a):
        det.status = INELIGIBLE
        if fed.is_parent_caretaker(hh) or a.pregnant:
            det.note("MCD-NY-EXCESS-INCOME", "over the MAGI level; a parent or pregnant person may still choose to "
                     "spend down to the Medicaid income level (not modelled), or apply for the Essential Plan", None)
        else:
            det.note("MCD-NY-SCC-NO-SPENDDOWN", "single/childless adult over 138% FPL: cannot spend down; "
                     "may apply for the Essential Plan or a premium tax credit", False)
        det.links.append("essential_plan:refer")
        return det

    # ------------------------------------------- SSI-related (non-MAGI)
    det.note("MCD-FED-NONMAGI-GROUPS", "65 or older, blind or disabled: SSI-related (non-MAGI) budgeting", None)
    b = fed.ssi_style_countable(hh, as_of, det, "ny.medicaid.ssi_related_unearned_disregard_monthly",
                                "MCD-NY-SSI-RELATED-BUDGET")
    inc_limit = params.use("ny.medicaid.ssi_related_income_limit_monthly", as_of, det)[b.size]
    res_limit = params.use("ny.medicaid.ssi_related_resource_limit", as_of, det)[b.size]
    resources = fed.countable_resources(hh, b.owners, det, "MCD-NY-RESOURCES-COUNTED")
    excess_income = round(max(0.0, b.countable - inc_limit), 2)
    excess_res = round(max(0.0, resources - res_limit), 2)
    det.note("MCD-NY-SSI-RELATED-INCOME", f"countable ${b.countable:,.2f} vs Medicaid income level ${inc_limit:,}",
             excess_income == 0)
    det.note("MCD-NY-RESOURCE-LEVEL", f"resources ${resources:,.0f} vs resource level ${res_limit:,}", excess_res == 0)
    det.status = ELIGIBLE
    if excess_income == 0 and excess_res == 0:
        det.tier = "ssi_related"
    else:
        det.tier = "spenddown"
        if excess_income:
            det.amounts["spenddown_monthly"] = excess_income
            det.note("MCD-NY-EXCESS-INCOME", f"Excess Income program: Medicaid each month once medical bills (or a "
                     f"pay-in) reach ${excess_income:,.2f}", None)
        if excess_res:
            det.amounts["excess_resources"] = excess_res
            det.note("MCD-NY-EXCESS-RESOURCES", f"resources ${excess_res:,.0f} over the level: Medicaid in a month "
                     "when medical bills equal or exceed the excess (or reduce resources)", None)
    det.note("MCD-NY-WHERE-TO-APPLY", "non-MAGI: DOH-4220 with the LDSS/HRA, or NY State of Health for people 65+ "
             "not seeking long-term care", None)
    return fed.finish(hh, det)
