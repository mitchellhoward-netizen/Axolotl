"""Medicaid — Illinois.

MAGI: ACA Adults and FamilyCare (parents/caretaker relatives) at 138% FPL,
Moms & Babies at 213%. AABD Medical for people 65+, blind or disabled: income
after the $25 disregard (SSI excluded) against 100% FPL and nonexempt assets
against $17,500. A community case over either is not denied: it is enrolled
in spenddown (the excess income each month, plus any excess assets).
Illinois is a 209(b) state, so SSI does not by itself confer Medicaid.
"""

from __future__ import annotations

from datetime import date

from rulesarchive import params
from rulesarchive.determination import ELIGIBLE, INELIGIBLE, UNDETERMINED, Determination
from rulesarchive.household import EARNED_KINDS, Household

from playbooks.medicaid.federal import rules as fed

STATE = "il"

MAGI_LIMITS = {
    "pregnant": "il.medicaid.moms_babies_income_limit_monthly",
    "parent": "il.medicaid.aca_adult_income_limit_monthly",
    "adult": "il.medicaid.aca_adult_income_limit_monthly",
}
MAGI_RULES = {"pregnant": "MCD-IL-MOMS-BABIES", "parent": "MCD-IL-FAMILYCARE", "adult": "MCD-IL-ACA-ADULT"}


def immigration(hh: Household, as_of: date, det: Determination) -> bool:
    a = hh.applicant
    status = fed.immigration_status(a)
    if status == "citizen":
        return True
    ffp = fed.ffp_immigration(a, as_of, det)
    if ffp:
        return True
    if status == "undocumented" and a.age >= 65:
        det.status = INELIGIBLE
        det.links.append("il_immigrant_seniors:refer")
        det.note("MCD-IL-HBIS", "65+ without an eligible immigration status: not Medicaid; Illinois's Coverage for "
                 "Immigrant Seniors program may apply", False)
        return False
    det.status = UNDETERMINED
    det.unresolved("MCD-IL-OQ-04")
    det.note("MCD-IL-IMMIGRANT-2026", f"{status}: Illinois coverage for this status was not established in an "
             "Illinois source", None)
    return False


def evaluate(hh: Household, as_of: date) -> Determination:
    det = Determination(fed.PROGRAM, STATE, as_of)
    a = hh.applicant
    if fed.ltc_handoff(hh, det):
        return det
    if not immigration(hh, as_of, det):
        return det
    if a.receives("ssi"):
        det.note("MCD-IL-209B", "Illinois is a 209(b) state: SSI does not by itself give Medicaid; the person "
                 "applies for AABD Medical, with SSI not counted as income", None)
        det.links.append("disability:ssi_medicaid")

    tier = fed.magi_test(hh, as_of, det, MAGI_LIMITS, MAGI_RULES)
    if tier:
        if tier == "adult_expansion" and not fed.community_engagement(hh, as_of, det):
            det.status = INELIGIBLE
            det.note("MCD-IL-WORK-REQUIREMENT", "ACA Adult: community engagement not shown for the month", False)
            return det
        det.status, det.tier = ELIGIBLE, tier
        return finish(hh, det)

    if not fed.aged_blind_disabled(a):
        det.status = INELIGIBLE
        det.note("MCD-IL-ACA-ADULT", "over the MAGI standard and not aged, blind or disabled", False)
        return det

    # ------------------------------------------------------------ AABD Medical
    det.note("MCD-FED-NONMAGI-GROUPS", "65 or older, blind or disabled: AABD Medical", None)
    owners = fed.budget_unit(hh)
    if any(i.owner in owners and i.kind in EARNED_KINDS for i in hh.incomes):
        det.status = UNDETERMINED
        det.unresolved("MCD-IL-OQ-03")
        det.note("MCD-IL-AABD-INCOME", "earned income: the AABD earned income exemptions (PM 08-02-02/03) are not "
                 "in this archive", None)
        return det
    size = 2 if len(owners) == 2 else 1
    if size == 2:
        det.note("MCD-IL-SPOUSE-STANDARD", "living with a spouse: the 2-person standard and both incomes", None)
    gross = sum(i.monthly for i in hh.incomes if i.owner in owners and i.kind not in fed.NON_MAGI_NOT_COUNTED)
    disregard = float(params.use("il.medicaid.aabd_income_disregard_monthly", as_of, det).value)
    applying = [p for p in hh.members if p.id in owners and (p is a or p.facts.get("applying"))]
    with_income = [p for p in applying
                   if any(i.owner == p.id and i.kind not in fed.NON_MAGI_NOT_COUNTED for i in hh.incomes)]
    n_disregards = max(1, len(with_income)) if gross > 0 else 0
    countable = round(max(0.0, gross - disregard * n_disregards), 2)
    det.note("MCD-IL-AABD-DISREGARD", f"countable ${countable:,.2f} = ${gross:,.2f} (SSI not counted) - "
             f"{n_disregards} x ${disregard:.0f}", None)
    det.amounts["countable_income_monthly"] = countable
    standard = params.use("il.medicaid.aabd_income_limit_monthly", as_of, det)[size]
    asset_limit = float(params.use("il.medicaid.aabd_asset_limit", as_of, det).value)
    resources = _resources(hh, owners, as_of, det)
    if resources is None:
        return det
    excess_income = round(max(0.0, countable - standard), 2)
    excess_assets = round(max(0.0, resources - asset_limit), 2)
    det.note("MCD-IL-AABD-INCOME", f"${countable:,.2f} vs 100% FPL standard ${standard:,}", excess_income == 0)
    det.note("MCD-IL-AABD-ASSET", f"nonexempt assets ${resources:,.0f} vs ${asset_limit:,.0f}", excess_assets == 0)
    det.status = ELIGIBLE
    if excess_income == 0 and excess_assets == 0:
        det.tier = "aabd"
    else:
        det.tier = "aabd_spenddown"
        if excess_income:
            det.amounts["spenddown_monthly"] = excess_income
        if excess_assets:
            det.amounts["excess_resources"] = excess_assets
        det.note("MCD-IL-SPENDDOWN", f"community spenddown: excess income ${excess_income:,.2f}/mo"
                 f" and excess assets ${excess_assets:,.0f} (added to countable income to meet with medical bills, "
                 "or paid in through Pay-In Spenddown)", None)
    return finish(hh, det)


def _resources(hh: Household, owners: set[str], as_of: date, det: Determination) -> float | None:
    vehicle_cap = float(params.use("il.medicaid.vehicle_exempt_value", as_of, det).value)
    total = 0.0
    vehicles = 0
    for x in hh.assets:
        if x.owner not in owners:
            continue
        if x.kind in {"home", "burial_space"}:
            continue
        if x.kind == "vehicle":
            vehicles += 1
            if vehicles == 1:
                needed = hh.person(x.owner).facts.get("vehicle_needed", False) if x.owner else False
                total += 0.0 if needed else max(0.0, x.value - vehicle_cap)
                continue
        if x.kind == "retirement":
            if hh.person(x.owner).facts.get("retirement_in_payout"):
                continue
            if hh.person(x.owner).facts.get("retirement_withdrawal_penalty") is None:
                det.status = UNDETERMINED
                det.unresolved("MCD-IL-OQ-05")
                det.note("MCD-IL-ASSETS-EXEMPT", "retirement account not in payout: countable minus any early-"
                         "withdrawal penalty; the penalty is not given", None)
                return None
            total += max(0.0, x.value - float(hh.person(x.owner).facts["retirement_withdrawal_penalty"]))
            continue
        total += x.value
    det.note("MCD-IL-ASSETS-EXEMPT", f"nonexempt assets ${total:,.0f} (homestead, burial spaces exempt; one vehicle "
             f"exempt if needed, otherwise up to ${vehicle_cap:,.0f})", None)
    det.amounts["countable_resources"] = total
    return total


def finish(hh: Household, det: Determination) -> Determination:
    app = fed.application_date(hh)
    if app is not None and app >= date(2027, 1, 1) and det.status == ELIGIBLE:
        det.note("MCD-IL-BACKDATE", "Illinois policy manual still says 3 months of backdating; federal law limits "
                 "applications from January 1, 2027 (see MCD-IL-CONFLICT-02)", None)
    elif app is not None and det.status == ELIGIBLE:
        det.note("MCD-IL-BACKDATE", "backdating up to 3 months before the application month", None)
    return fed.finish(hh, det)
