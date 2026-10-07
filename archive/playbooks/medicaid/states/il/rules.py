"""Medicaid — Illinois.

MAGI: ACA Adults and FamilyCare (parents/caretaker relatives) at 138% FPL,
Moms & Babies at 213%. AABD Medical for people 65+, blind or disabled: income
after the $25 disregard (SSI excluded), the earned income exemption ($20 + 1/2
of the next $60 for aged/disabled; $85 + 1/2 of the rest for blind) and
recognized employment expenses (89 Ill. Adm. Code 120.335, 120.362, 120.370;
PM 08-02-03) against 100% FPL, and nonexempt assets against $17,500. A community case over either is not denied: it is enrolled
in spenddown (the excess income each month, plus any excess assets).
Illinois is a 209(b) state, so SSI does not by itself confer Medicaid.

Person.facts read here (in addition to the federal list):
  aabd_work_expenses_monthly  recognized employment expenses actually paid (withheld
                              income taxes, Social Security tax, transportation,
                              lunch allowance, required tools/uniforms/dues/premiums,
                              day care, disability work expenses); PM 08-02-03-b/-c/-d
  applying                    a spouse in the standard who is also applying (second $25)
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
    size = 2 if len(owners) == 2 else 1
    if size == 2:
        det.note("MCD-IL-SPOUSE-STANDARD", "living with a spouse: the 2-person standard and both incomes", None)
    standard = params.use("il.medicaid.aabd_income_limit_monthly", as_of, det)[size]
    counted = [i for i in hh.incomes if i.owner in owners and i.kind not in fed.NON_MAGI_NOT_COUNTED]
    gross = sum(i.monthly for i in counted)
    disregard = float(params.use("il.medicaid.aabd_income_disregard_monthly", as_of, det).value) if gross > 0 else 0.0
    applying = [p for p in hh.members if p.id in owners and (p is a or p.facts.get("applying"))]
    with_income = [p for p in applying if any(i.owner == p.id for i in counted)]
    n_disregards = max(1, len(with_income)) if gross > 0 else 0
    earners = sorted({i.owner for i in counted if i.kind in EARNED_KINDS})
    if not earners:
        countable = round(max(0.0, gross - disregard * n_disregards), 2)
        det.note("MCD-IL-AABD-DISREGARD", f"countable ${countable:,.2f} = ${gross:,.2f} (SSI not counted) - "
                 f"{n_disregards} x ${disregard:.0f}", None)
    else:
        countable = _countable_with_earnings(hh, a, owners, counted, earners, disregard, standard, as_of, det)
        if countable is None:
            return det
    det.amounts["countable_income_monthly"] = countable
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


def _earned_exemption(person, earned: float, as_of: date, det: Determination) -> float:
    """89 Ill. Adm. Code 120.362(b) / PM 08-02-03-a: aged or disabled $20 + 1/2 of the next $60; blind $85 + 1/2."""
    if earned <= 0:
        return 0.0
    if person.blind:
        flat = float(params.use("il.medicaid.aabd_earned_disregard_blind", as_of, det)["flat"])
        return min(earned, flat) + max(0.0, earned - flat) / 2
    p = params.use("il.medicaid.aabd_earned_disregard_aged_disabled", as_of, det)
    flat, nxt = float(p["flat"]), float(p["half_of_next"])
    return min(earned, flat) + min(max(0.0, earned - flat), nxt) / 2


def _countable_with_earnings(hh, a, owners, counted, earners, disregard, standard, as_of, det):
    """Countable income for an AABD case with earnings.

    Order (PM 08-02-03): the $25 disregard and self-employment expenses first, then the earned income
    exemption, then recognized employment expenses. Neither the rule nor the manual says whether the $25
    comes off unearned or earned income first; both orders are computed and the case is undetermined only
    when the order changes the outcome (MCD-IL-OQ-03).
    """
    det.note("MCD-IL-AABD-EARNED", "earned income: $25 disregard, then the earned income exemption, then "
             "employment expenses (PM 08-02-03)", None)
    for pid in earners:
        if pid not in {p.id for p in hh.members if p is a or p.facts.get("applying")}:
            det.status = UNDETERMINED
            det.unresolved("MCD-IL-OQ-03")
            det.note("MCD-IL-AABD-EARNED", "a spouse who is not applying has earnings: how the earned income "
                     "exemption treats a responsible relative's wages was not established", None)
            return None
    unearned = sum(i.monthly for i in counted if i.kind not in EARNED_KINDS)
    results = []
    for order in ("unearned_first", "earned_first"):
        left = disregard
        u = unearned
        if order == "unearned_first":
            take = min(u, left); u -= take; left -= take
        total = u
        for pid in earners:
            person = hh.person(pid)
            e = sum(i.monthly for i in counted if i.owner == pid and i.kind in EARNED_KINDS)
            take = min(e, left); e -= take; left -= take
            e -= _earned_exemption(person, e, as_of, det)
            e -= float(person.facts.get("aabd_work_expenses_monthly") or 0)
            total += max(0.0, e)
        if order == "earned_first" and left > 0:
            total = max(0.0, total - left)
        results.append(round(max(0.0, total), 2))
    lo, hi = min(results), max(results)
    # A second $25 for a spouse who is also applying with income (not covered by the order question).
    spouses_with_income = [p for p in hh.members if p.id in owners and p is not a and p.facts.get("applying")
                           and any(i.owner == p.id for i in counted)]
    extra = disregard * len(spouses_with_income)
    lo, hi = round(max(0.0, lo - extra), 2), round(max(0.0, hi - extra), 2)
    det.note("MCD-IL-AABD-DISREGARD", f"countable ${hi:,.2f} after the $25 disregard(s), earned income exemption "
             f"and employment expenses" + (f" (${lo:,.2f} if the $25 is taken from earnings first)" if lo != hi else ""),
             None)
    missing_expenses = [pid for pid in earners if hh.person(pid).facts.get("aabd_work_expenses_monthly") is None]
    if hi > standard and missing_expenses:
        det.status = UNDETERMINED
        det.note("MCD-IL-AABD-EARNED", f"countable ${hi:,.2f} is over ${standard:,} before employment expenses, "
                 "which are not given (withheld taxes, Social Security tax, transportation and others are "
                 "deducted, PM 08-02-03-b)", None)
        return None
    if lo != hi and hi > standard:
        det.status = UNDETERMINED
        det.unresolved("MCD-IL-OQ-03")
        det.note("MCD-IL-AABD-EARNED", "whether the $25 disregard comes off unearned or earned income first "
                 "changes the result", None)
        return None
    return hi


def _resources(hh: Household, owners: set[str], as_of: date, det: Determination) -> float | None:
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
                if not needed:
                    vehicle_cap = float(params.use("il.medicaid.vehicle_exempt_value", as_of, det).value)
                    total += max(0.0, x.value - vehicle_cap)
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
             "exempt if needed, otherwise up to the exempt value in PM 07-02-05)", None)
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
