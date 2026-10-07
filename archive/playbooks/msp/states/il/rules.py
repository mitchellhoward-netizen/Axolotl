"""Medicare Savings Program — Illinois (HFS medical programs, IDHS casework).

Illinois offers QMB (<= 100% FPL), SLIB (Illinois's name for SLMB) and QI-1,
plus QDWI, with the federal MSP resource limit ($9,950 / $14,910 in 2026).
Income is counted the AABD Community way, not the SSI way: a $25 income
exemption (instead of $20), then the AABD earned income disregard ($20 plus
one-half of the next $60) and employment expenses; the result is rounded
down to the dollar and compared with the bands IDHS publishes in WAG
25-03-02(2). The January COLA is not counted in January through March.

Facts read (all optional):
- ``Person.facts.applying`` (bool): the spouse is applying for or receiving
  AABD Medical / MSP; defaults to whether the spouse has Medicare Part A.
- ``Person.facts.work_expenses_monthly`` (float): allowable employment
  expenses (withheld taxes, FICA, transportation, union dues ...).
- ``Person.facts.spenddown_status`` ("met" | "unmet"): Medicaid spenddown.
- ``Person.facts.ss_cola_increase_monthly`` (float): the January COLA.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date

from rulesarchive import params
from rulesarchive.determination import ELIGIBLE, INELIGIBLE, UNDETERMINED, Determination
from rulesarchive.household import EARNED_KINDS, Household

from playbooks.msp.federal import rules as fed

STATE = "il"
EXCLUDED_ASSETS = {"home", "vehicle", "burial_space"}
TIER_NAMES = {"QMB": "QMB", "SLMB": "SLIB", "QI": "QI-1"}


@dataclass
class ILIncome:
    unearned: float
    earned: float
    exemptions: float
    earned_disregard: float
    work_expenses: float
    countable: int
    size: int


def _applying(p) -> bool:
    return bool(p.facts.get("applying", p.medicare_part_a))


def il_countable_income(hh: Household, as_of: date, det: Determination) -> ILIncome:
    """AABD Community countable income (PM 15-05-03) as used for QMB/SLIB/QI-1."""
    owners = fed.budget_unit(hh)
    last = int(params.use("il.msp.cola_disregard_last_month", as_of, det).value)
    cola = fed.cola_amount(hh, owners) if as_of.month <= last else 0.0
    if cola:
        det.note("MSP-IL-COLA", f"{as_of:%B}: the January COLA (${cola:,.2f}) is not counted (January-March)", None)

    def own(pid: str, earned: bool) -> float:
        return sum(i.monthly for i in hh.incomes if i.owner == pid
                   and (i.kind in EARNED_KINDS) == earned and i.kind not in fed.NOT_COUNTED)

    ex25 = float(params.use("il.msp.income_exemption_monthly", as_of, det).value)
    flat = float(params.use("il.aabd.earned_income_disregard_flat_monthly", as_of, det).value)
    band = float(params.use("il.aabd.earned_income_disregard_half_band_monthly", as_of, det).value)

    # Number of $25 exemptions (PM 15-04-03-a): one per person applying who has
    # non-SSI income; at least one if anyone in the standard has such income.
    has_income = {pid: own(pid, True) + own(pid, False) > 0 for pid in owners}
    n_ex = sum(1 for pid in owners if has_income[pid] and _applying(hh.person(pid)))
    if n_ex == 0 and any(has_income.values()):
        n_ex = 1

    unearned_total = sum(own(pid, False) for pid in owners) - cola
    earned_total = sum(own(pid, True) for pid in owners)
    exemptions = n_ex * ex25
    unearned_after = max(0.0, unearned_total - exemptions)
    left = max(0.0, exemptions - unearned_total)

    earned_after = 0.0
    disregard_total = 0.0
    work_total = 0.0
    for pid in sorted(owners):
        e = own(pid, True)
        if not e:
            continue
        take = min(e, left)
        e -= take
        left -= take
        d = min(e, flat) + max(0.0, min(e - flat, band)) / 2.0
        work = float(hh.person(pid).facts.get("work_expenses_monthly", 0))
        disregard_total += d
        work_total += work
        earned_after += max(0.0, e - d - work)
    countable = int(math.floor(unearned_after + earned_after + 1e-9))
    size = 2 if len(owners) == 2 else 1
    det.note("MSP-IL-INCOME-METHOD",
             f"countable ${countable:,} (rounded down) = unearned ${unearned_total:,.2f} + earned ${earned_total:,.2f} "
             f"- {n_ex} x ${ex25:.0f} exemption - earned disregard ${disregard_total:,.2f} - work expenses ${work_total:,.2f}; "
             f"household size {size}", None)
    return ILIncome(unearned_total, earned_total, exemptions, disregard_total, work_total, countable, size)


def _tier(countable: float, size: int, as_of: date, det: Determination) -> str | None | bool:
    """Tier from the WAG bands; returns False for the disputed dollar above QI-1."""
    q = params.use("il.msp.qmb_income_limit_monthly", as_of, det)[size]
    s = params.use("il.msp.slib_income_limit_monthly", as_of, det)[size]
    i = params.use("il.msp.qi_income_limit_monthly", as_of, det)[size]
    i_pm = params.use("il.msp.qi_income_limit_pm_text_monthly", as_of, det)[size]
    if countable <= q:
        return "QMB"
    if countable <= s:
        return "SLMB"
    if countable <= i:
        return "QI"
    if countable <= i_pm:
        return False
    return None


def _qdwi(hh: Household, as_of: date, det: Determination) -> bool:
    a = hh.applicant
    if not (a.age < 65 and a.disabled and a.facts.get("lost_part_a_due_to_work")):
        return False
    det.unresolved("MSP-IL-OQ-06")
    return fed.qdwi_test(hh, as_of, det, "il.msp.qdwi_income_limit_monthly", "il.msp.qdwi_resource_limit",
                         "MSP-IL-QDWI", limit_includes_disregards=False)


def evaluate(hh: Household, as_of: date) -> Determination:
    det = Determination(fed.PROGRAM, STATE, as_of)
    det.note("MSP-IL-TIERS", "Illinois tiers: QMB, SLIB (SLMB), QI-1, QDWI", None)

    if any(m.relationship == "child" for m in hh.members):
        det.status = UNDETERMINED
        det.note("MSP-IL-COUPLE", "dependent children in the home change the Illinois income standard size; not modelled", None)
        det.unresolved("MSP-IL-OQ-04")
        return det

    if _qdwi(hh, as_of, det):
        fed.extra_help_link(det)
        return det

    a = hh.applicant
    if not fed.has_part_a(hh):
        det.status = INELIGIBLE
        det.note("MSP-IL-PART-A", "applicant is not a current Medicare Part A beneficiary (conditional Part A enrollment "
                 "at SSA is needed first)", False)
        return det
    det.note("MSP-IL-PART-A", "applicant is a current Medicare Part A beneficiary", True)

    inc = il_countable_income(hh, as_of, det)
    if inc.size == 2:
        det.note("MSP-IL-COUPLE", "living with a spouse: the 2-person standard and resource limit apply", None)

    limit = params.use("il.msp.resource_limit", as_of, det)[inc.size]
    resources = hh.assets_of(fed.budget_unit(hh), exclude_kinds=EXCLUDED_ASSETS)
    if resources > limit:
        det.status = INELIGIBLE
        det.note("MSP-IL-RESOURCES", f"nonexempt resources ${resources:,.0f} exceed ${limit:,}", False)
        return det
    if resources == limit:
        det.status = UNDETERMINED
        det.note("MSP-IL-RESOURCES", f"resources exactly ${limit:,}: PM 06-12-01 requires less than the standard, "
                 "PM 06-12-01-a bars only resources higher than it", None)
        det.unresolved("MSP-IL-OQ-01")
        return det
    det.note("MSP-IL-RESOURCES", f"nonexempt resources ${resources:,.0f} below ${limit:,}", True)

    tier = _tier(inc.countable, inc.size, as_of, det)

    # Federal floor: MSP income may not be counted more restrictively than SSI
    # methodology (MSP-IL-EARNED-INCOME-FLOOR). Compare with the SSI method.
    if inc.earned:
        ssi = fed.countable_income_of(hh, fed.budget_unit(hh), as_of, det,
                                      rule_id="MSP-IL-EARNED-INCOME-FLOOR")
        ssi_tier = _tier(math.floor(ssi.countable), inc.size, as_of, det)
        rank = lambda t: fed.TIER_RANK[t] if t is not False else 0  # noqa: E731
        if rank(ssi_tier) > rank(tier):
            det.status = UNDETERMINED
            det.note("MSP-IL-EARNED-INCOME-FLOOR",
                     f"Illinois's AABD earned income rules give ${inc.countable:,} but SSI-style counting gives "
                     f"${ssi.countable:,.2f}, a better tier; which governs is unresolved", None)
            det.unresolved("MSP-IL-OQ-02")
            return det

    if tier is False:
        det.status = UNDETERMINED
        det.note("MSP-IL-QI-INCOME", f"countable ${inc.countable:,} is $1 above the WAG QI-1 band but within "
                 "'equal to or less than 135% FPL' in PM 06-14-01-b", None)
        det.unresolved("MSP-IL-OQ-03")
        return det
    if tier is None:
        det.status = INELIGIBLE
        det.note("MSP-IL-QI-INCOME", f"countable ${inc.countable:,} is above the QI-1 band", False)
    elif tier == "QI" and (a.receives("medicaid") and a.facts.get("spenddown_status") != "unmet"):
        det.status = INELIGIBLE
        det.note("MSP-IL-QI-NOT-MEDICAID", "income is in the QI-1 band but the person is approved for Medicaid "
                 "(or in met spenddown); QI-1 is not allowed", False)
    else:
        det.status, det.tier = ELIGIBLE, tier
        rid = {"QMB": "MSP-IL-QMB-INCOME", "SLMB": "MSP-IL-SLIB-INCOME", "QI": "MSP-IL-QI-INCOME"}[tier]
        det.note(rid, f"countable ${inc.countable:,} qualifies for {TIER_NAMES[tier]}", True)
        if tier == "QI" and a.facts.get("spenddown_status") == "unmet":
            det.note("MSP-IL-QI-NOT-MEDICAID", "unmet spenddown is not receiving Medicaid; QI-1 allowed", True)

    fed.extra_help_link(det)
    fed.part_b_amount(det, as_of)
    return det
