"""Medi-Cal — California.

MAGI Medi-Cal: adults 19-64 at 138% FPL, parents/caretaker relatives at 109%
(114% for parents with Medicare), pregnant people at 213%. Non-MAGI for people
65+ or disabled: the Aged & Disabled FPL program (zero share of cost, 138% FPL
after the $20 deduction and the Medicare Part B premium disregard); above it,
Medically Needy with a share of cost (income above the $600 / $934 maintenance
need). From January 1, 2026 Non-MAGI programs again have a property limit
($130,000 + $65,000 per additional person); over it, the person is not
eligible until assets are reduced (no property spenddown outside LTC).
Adults 19+ without satisfactory immigration status applying on or after
January 1, 2026 get restricted-scope (emergency and pregnancy) Medi-Cal only.
"""

from __future__ import annotations

from datetime import date

from rulesarchive import params
from rulesarchive.determination import ELIGIBLE, INELIGIBLE, UNDETERMINED, Determination
from rulesarchive.household import Household

from playbooks.medicaid.federal import rules as fed

STATE = "ca"

MAGI_LIMITS = {
    "pregnant": "ca.medi_cal.magi_pregnant_income_limit_monthly",
    "parent": "ca.medi_cal.magi_parent_income_limit_monthly",
    "parent_medicare": "ca.medi_cal.magi_parent_medicare_income_limit_monthly",
    "adult": "ca.medi_cal.magi_adult_income_limit_monthly",
}
MAGI_RULES = {"pregnant": "MCD-CA-MAGI-PREGNANT", "parent": "MCD-CA-MAGI-PARENT",
              "parent_medicare": "MCD-CA-MAGI-PARENT", "adult": "MCD-CA-MAGI-ADULT"}


def immigration(hh: Household, as_of: date, det: Determination) -> str | None:
    """Return 'full', 'restricted', or None when the determination is final."""
    a = hh.applicant
    status = fed.immigration_status(a)
    if status == "citizen":
        return "full"
    ffp = fed.ffp_immigration(a, as_of, det)
    if ffp:
        return "full"
    if status == "undocumented":
        app = fed.application_date(hh) or as_of
        if a.age < 19:
            det.note("MCD-CA-EXPANSION-FREEZE", "under 19: full-scope Medi-Cal regardless of immigration status", None)
            return "full"
        if a.facts.get("full_scope_before_2026"):
            det.note("MCD-CA-EXPANSION-GRACE", "enrolled in full scope before January 1, 2026: keeps full scope"
                     + (" (no dental from July 1, 2026)" if as_of >= date(2026, 7, 1) else ""), None)
            return "full"
        if app >= date(2026, 1, 1):
            det.note("MCD-CA-EXPANSION-FREEZE", "19 or older without satisfactory immigration status applying on or "
                     "after January 1, 2026: restricted-scope Medi-Cal only (emergency and pregnancy services)", None)
            return "restricted"
        return "full"
    det.status = UNDETERMINED
    det.unresolved("MCD-CA-OQ-05")
    det.note("MCD-CA-IMMIGRANT-2026", f"{status}: California's response to the October 2026 federal funding limit "
             "was not found in a California source", None)
    return None


def evaluate(hh: Household, as_of: date) -> Determination:
    det = Determination(fed.PROGRAM, STATE, as_of)
    a = hh.applicant
    if fed.ltc_handoff(hh, det):
        return det
    scope = immigration(hh, as_of, det)
    if scope is None:
        return det
    if fed.ssi_recipient_1634(hh, det, "MCD-CA-SSI-AUTO"):
        return fed.finish(hh, det)

    tier = fed.magi_test(hh, as_of, det, MAGI_LIMITS, MAGI_RULES)
    if tier:
        if tier == "adult_expansion" and not fed.community_engagement(hh, as_of, det):
            det.status = INELIGIBLE
            det.note("MCD-CA-WCER", "new adult group: Work and Community Engagement Requirement not met", False)
            return det
        det.status, det.tier = ELIGIBLE, tier
        return _scope(fed.finish(hh, det), scope)

    if not fed.aged_blind_disabled(a):
        det.status = INELIGIBLE
        det.note("MCD-CA-MAGI-ADULT", "over the MAGI limit and not aged, blind or disabled", False)
        return det

    # -------------------------------------------------------------- non-MAGI
    det.note("MCD-FED-NONMAGI-GROUPS", "65 or older, blind or disabled: Non-MAGI Medi-Cal", None)
    spouse = hh.spouse
    spouse_abd = spouse is not None and fed.aged_blind_disabled(spouse)
    owners = fed.budget_unit(hh)
    b = fed.ssi_style_countable(hh, as_of, det, "ca.medi_cal.non_magi_income_deduction_monthly",
                                "MCD-CA-NONMAGI-BUDGET", owners=owners)
    mfbu = 2 if spouse is not None else 1

    if params.use("ca.medi_cal.non_magi_asset_test_applies", as_of, det).value:
        limit = params.use("ca.medi_cal.non_magi_asset_limit", as_of, det)[mfbu]
        resources = fed.countable_resources(hh, owners, det, "MCD-CA-PROPERTY-EXEMPT")
        ok = resources <= limit
        det.note("MCD-CA-ASSET-LIMIT", f"property ${resources:,.0f} vs limit ${limit:,} for {mfbu}", ok)
        if not ok:
            det.status = INELIGIBLE
            det.amounts["excess_resources"] = round(resources - limit, 2)
            return det
    else:
        det.note("MCD-CA-ASSET-ELIMINATION-2024", "no Non-MAGI asset test from January 1, 2024 to December 31, 2025", True)

    # A&D FPL: Part B premium disregard for each budget member who pays it.
    part_b = float(params.use("federal.cms.part_b_standard_premium", as_of, det).value)
    payers = [p for p in hh.members if p.id in owners and _pays_part_b(hh, p)]
    part_b_total = part_b * len(payers)
    mn = params.use("ca.medi_cal.maintenance_need_monthly", as_of, det)
    if spouse is not None and not spouse_abd:
        ad_size, ineligible_spouse_mn = 1, float(mn[1])
        det.note("MCD-CA-AD-FPL-COUPLE", f"spouse not aged/disabled: both incomes counted, ${ineligible_spouse_mn:,.0f} "
                 "maintenance need deducted for the spouse, 138% FPL for one", None)
    else:
        ad_size, ineligible_spouse_mn = mfbu, 0.0
    ad_income = round(max(0.0, b.countable - part_b_total - ineligible_spouse_mn), 2)
    ad_limit = params.use("ca.medi_cal.ad_fpl_income_limit_monthly", as_of, det)[ad_size]
    if ad_income <= ad_limit:
        det.note("MCD-CA-AD-FPL", f"A&D FPL: ${ad_income:,.2f} (after Part B disregard ${part_b_total:,.2f}) "
                 f"<= ${ad_limit:,}", True)
        det.status, det.tier = ELIGIBLE, "aged_disabled_fpl"
        return _scope(fed.finish(hh, det), scope)
    det.note("MCD-CA-AD-FPL", f"A&D FPL: ${ad_income:,.2f} > ${ad_limit:,}", False)

    # Medically Needy: share of cost above the maintenance need level.
    premiums = part_b_total + float(hh.facts.get("health_insurance_premiums_monthly", 0))
    level = float(mn[mfbu])
    soc = round(max(0.0, b.countable - premiums - level), 2)
    det.note("MCD-CA-SHARE-OF-COST", f"Medically Needy: ${b.countable:,.2f} - premiums ${premiums:,.2f} - "
             f"maintenance need ${level:,.0f} = share of cost ${soc:,.2f}/mo", None)
    det.status, det.tier = ELIGIBLE, "share_of_cost"
    det.amounts["share_of_cost_monthly"] = soc
    return _scope(fed.finish(hh, det), scope)


def _pays_part_b(hh: Household, p) -> bool:
    if "pays_part_b_premium" in hh.facts and p is hh.applicant:
        return bool(hh.facts["pays_part_b_premium"])
    return bool(p.medicare_part_b) and not (p.benefits & {"qmb", "slmb", "qi"})


def _scope(det: Determination, scope: str) -> Determination:
    if det.status == ELIGIBLE and scope == "restricted":
        det.tier = "restricted_scope"
        det.links.append("restricted_scope:emergency_pregnancy_only")
    return det
