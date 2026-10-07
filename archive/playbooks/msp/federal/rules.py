"""Medicare Savings Program — federal base logic.

Shared building blocks (SSI-style income counting, the COLA transition-month
rule, the Extra Help link) plus ``federal_tiers``, the federal-minimum
QMB/SLMB/QI/QDWI test that a state part can call with its own parameters.

Every decision is recorded on the Determination with the rule ID that made
it, so a result can be traced back to rule statements and sources.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from rulesarchive import params
from rulesarchive.determination import ELIGIBLE, INELIGIBLE, Determination
from rulesarchive.household import EARNED_KINDS, Household

PROGRAM = "msp"

# Income that SSI methodology does not count as income to the MSP applicant.
# SSI and state supplement payments are needs-based assistance; see
# MSP-FED-OQ-05 (no MSP-specific primary text found yet).
NOT_COUNTED = {"ssi", "ssp", "tanf"}


@dataclass
class IncomeBreakdown:
    unearned: float
    earned: float
    cola_excluded: float
    general_disregard: float
    earned_disregard: float
    countable: float
    size: int


def budget_unit(hh: Household) -> set[str]:
    """Applicant plus a living-with spouse (MSP-FED-COUPLE-INCOME)."""
    ids = {hh.applicant.id}
    if hh.spouse is not None:
        ids.add(hh.spouse.id)
    return ids


def cola_excluded(hh: Household, owners: set[str], as_of: date, det: Determination | None = None) -> float:
    """COLA amount not counted in a transition month (MSP-FED-COLA-TRANSITION).

    A transition month is any month of the year through the month after the
    month the poverty guidelines were published. Test households state the
    January COLA increase per person in ``facts.ss_cola_increase_monthly``.
    """
    published = params.use("federal.hhs.poverty_guideline_published", as_of, det).value
    if isinstance(published, str):
        published = date.fromisoformat(published)
    last_month = published.month + 1
    if as_of.year != published.year or as_of.month > last_month:
        return 0.0
    total = sum(float(hh.person(pid).facts.get("ss_cola_increase_monthly", 0)) for pid in owners)
    if det is not None and total:
        det.note("MSP-FED-COLA-TRANSITION",
                 f"{as_of:%B %Y} is a transition month (guidelines published {published}); "
                 f"${total:,.2f} January COLA not counted", None)
    return total


def countable_income(hh: Household, as_of: date, det: Determination,
                     general_disregard_pid: str = "federal.ssi.general_income_exclusion_monthly",
                     rule_id: str = "MSP-FED-INCOME-SSI-METHOD") -> IncomeBreakdown:
    """SSI-method countable monthly income for the applicant (and spouse).

    One $20 general disregard per couple, applied to unearned income first and
    any remainder to earned income; then $65 and one-half of the remaining
    earned income are excluded.
    """
    owners = budget_unit(hh)
    unearned = sum(i.monthly for i in hh.incomes
                   if i.owner in owners and i.kind not in EARNED_KINDS and i.kind not in NOT_COUNTED)
    earned = sum(i.monthly for i in hh.incomes if i.owner in owners and i.kind in EARNED_KINDS)
    cola = cola_excluded(hh, owners, as_of, det)
    unearned = max(0.0, unearned - cola)

    gd = float(params.use(general_disregard_pid, as_of, det).value)
    ed = float(params.use("federal.ssi.earned_income_exclusion_monthly", as_of, det).value)
    unearned_after = max(0.0, unearned - gd)
    gd_left = max(0.0, gd - unearned)
    earned_after = max(0.0, earned - gd_left - ed) / 2.0
    countable = round(unearned_after + earned_after, 2)
    size = 2 if len(owners) == 2 else 1
    det.note(rule_id,
             f"countable income ${countable:,.2f}/mo = unearned ${unearned:,.2f} - ${gd:.0f} disregard"
             + (f" + (earned ${earned:,.2f} - ${gd_left:.0f} - ${ed:.0f}) / 2" if earned else "")
             + f"; household size {size}", None)
    return IncomeBreakdown(unearned, earned, cola, gd, ed, countable, size)


def cola_amount(hh: Household, owners: set[str]) -> float:
    """January Social Security COLA increase of ``owners`` (``facts.ss_cola_increase_monthly``).

    For states whose COLA disregard runs longer than the federal transition
    months (Illinois: through March); the caller decides the months.
    """
    return sum(float(hh.person(pid).facts.get("ss_cola_increase_monthly", 0)) for pid in owners)


def countable_income_of(hh: Household, owners: set[str], as_of: date, det: Determination,
                        general_disregard_pid: str = "federal.ssi.general_income_exclusion_monthly",
                        rule_id: str = "MSP-FED-INCOME-SSI-METHOD") -> IncomeBreakdown:
    """``countable_income`` for an explicit set of people (for example the
    applicant alone, when a state measures an applicant without an
    ineligible spouse's income). Same SSI-method arithmetic."""
    unearned = sum(i.monthly for i in hh.incomes
                   if i.owner in owners and i.kind not in EARNED_KINDS and i.kind not in NOT_COUNTED)
    earned = sum(i.monthly for i in hh.incomes if i.owner in owners and i.kind in EARNED_KINDS)
    cola = cola_excluded(hh, owners, as_of, det)
    unearned = max(0.0, unearned - cola)
    gd = float(params.use(general_disregard_pid, as_of, det).value)
    ed = float(params.use("federal.ssi.earned_income_exclusion_monthly", as_of, det).value)
    unearned_after = max(0.0, unearned - gd)
    gd_left = max(0.0, gd - unearned)
    earned_after = max(0.0, earned - gd_left - ed) / 2.0
    countable = round(unearned_after + earned_after, 2)
    size = 2 if len(owners) == 2 else 1
    det.note(rule_id,
             f"countable income ${countable:,.2f}/mo (people: {', '.join(sorted(owners))}) = unearned ${unearned:,.2f} - ${gd:.0f}"
             + (f" + (earned ${earned:,.2f} - ${gd_left:.0f} - ${ed:.0f}) / 2" if earned else "")
             + f"; household size {size}", None)
    return IncomeBreakdown(unearned, earned, cola, gd, ed, countable, size)


TIER_RANK = {"QMB": 3, "SLMB": 2, "QI": 1, None: 0}


def has_part_a(hh: Household) -> bool:
    a = hh.applicant
    return a.medicare_part_a or bool(a.facts.get("part_a_buy_in"))


def extra_help_link(det: Determination) -> None:
    """QMB/SLMB/QI deem Extra Help; QDWI does not (MSP-FED-EXTRA-HELP-DEEMED)."""
    if det.status == ELIGIBLE and det.tier in {"QMB", "SLMB", "QI"}:
        det.links.append("extra_help:deemed")
        det.note("MSP-FED-EXTRA-HELP-DEEMED", f"{det.tier} enrollment deems Extra Help (Part D LIS)", True)
    elif det.status == ELIGIBLE and det.tier == "QDWI":
        det.note("MSP-FED-EXTRA-HELP-DEEMED", "QDWI does not deem Extra Help", None)


def part_b_amount(det: Determination, as_of: date) -> None:
    if det.status == ELIGIBLE and det.tier in {"QMB", "SLMB", "QI"}:
        det.amounts["part_b_premium_paid_monthly"] = float(
            params.use("federal.cms.part_b_standard_premium", as_of, det).value)


def qdwi_test(hh: Household, as_of: date, det: Determination, income_pid: str, resource_pid: str,
              rule_id: str, limit_includes_disregards: bool) -> bool:
    """QDWI: under 65, disabled, lost premium-free Part A by working, not otherwise Medicaid-eligible."""
    a = hh.applicant
    if not (a.age < 65 and a.disabled and a.facts.get("lost_part_a_due_to_work")):
        return False
    if a.receives("medicaid"):
        det.note(rule_id, "QDWI requires not being otherwise eligible for Medicaid", False)
        return False
    inc = countable_income(hh, as_of, det)
    limit = params.use(income_pid, as_of, det)[inc.size]
    # Federal QDWI figures already fold in the disregards; compare gross for those.
    measured = inc.unearned + inc.earned if limit_includes_disregards else inc.countable
    res_limit = params.use(resource_pid, as_of, det)[inc.size]
    resources = hh.assets_of(budget_unit(hh), exclude_kinds={"home", "vehicle", "burial_space"})
    ok = measured <= limit and resources <= res_limit
    det.note(rule_id, f"QDWI income ${measured:,.2f} vs ${limit:,} and resources ${resources:,.0f} vs ${res_limit:,}", ok)
    if ok:
        det.status, det.tier = ELIGIBLE, "QDWI"
    return ok


def federal_tiers(hh: Household, as_of: date, det: Determination, *, resource_test: bool = True) -> Determination:
    """Federal-minimum QMB / SLMB / QI test (for states that use the federal limits).

    Uses the federal tables, which already include the $20 disregard, so the
    comparison is on income after earned-income disregards but before the $20.
    """
    if not has_part_a(hh):
        det.note("MSP-FED-QMB-GROUP", "applicant is not entitled to Medicare Part A", False)
        det.status = INELIGIBLE
        return det
    inc = countable_income(hh, as_of, det)
    gross_equiv = inc.countable + inc.general_disregard   # federal tables include the $20
    if resource_test:
        limit = params.use("federal.msp.resource_limit", as_of, det)[inc.size]
        resources = hh.assets_of(budget_unit(hh), exclude_kinds={"home", "vehicle", "burial_space"})
        if resources > limit:
            det.note("MSP-FED-RESOURCES", f"resources ${resources:,.0f} exceed ${limit:,}", False)
            det.status = INELIGIBLE
            return det
        det.note("MSP-FED-RESOURCES", f"resources ${resources:,.0f} within ${limit:,}", True)
    q = params.use("federal.msp.qmb_income_limit_monthly", as_of, det)[inc.size]
    s = params.use("federal.msp.slmb_income_limit_monthly", as_of, det)[inc.size]
    i = params.use("federal.msp.qi_income_limit_monthly", as_of, det)[inc.size]
    if gross_equiv <= q:
        det.status, det.tier = ELIGIBLE, "QMB"
        det.note("MSP-FED-QMB-INCOME-FLOOR", f"${gross_equiv:,.2f} <= QMB limit ${q:,}", True)
    elif gross_equiv <= s:
        det.status, det.tier = ELIGIBLE, "SLMB"
        det.note("MSP-FED-SLMB-INCOME", f"${gross_equiv:,.2f} <= SLMB limit ${s:,}", True)
    elif gross_equiv <= i:
        if hh.applicant.receives("medicaid"):
            det.status = INELIGIBLE
            det.note("MSP-FED-QI-NOT-MEDICAID", "income is in the QI range but the person has Medicaid", False)
        else:
            det.status, det.tier = ELIGIBLE, "QI"
            det.note("MSP-FED-QI-INCOME", f"${gross_equiv:,.2f} <= QI limit ${i:,}", True)
    else:
        det.status = INELIGIBLE
        det.note("MSP-FED-QI-INCOME", f"${gross_equiv:,.2f} exceeds QI limit ${i:,}", False)
    return det


def extra_help_by_application(hh: Household, as_of: date) -> Determination:
    """Extra Help for someone NOT deemed: income < 150% FPL and resources within the LIS limit."""
    det = Determination("extra_help", hh.state, as_of)
    a = hh.applicant
    if not (a.medicare_part_a or a.medicare_part_b):
        det.status = INELIGIBLE
        det.note("MSP-FED-EXTRA-HELP-ELIGIBILITY", "no Medicare Part A or B", False)
        return det
    if a.receives("medicaid") or a.receives("ssi") or a.benefits & {"qmb", "slmb", "qi"}:
        det.status, det.tier = ELIGIBLE, "deemed"
        det.note("MSP-FED-EXTRA-HELP-DEEMED", "already deemed through Medicaid, SSI or an MSP", True)
        return det
    inc = countable_income(hh, as_of, det, rule_id="MSP-FED-EXTRA-HELP-ELIGIBILITY")
    fpl = params.use("federal.hhs.poverty_guideline_annual", as_of, det)[inc.size] / 12.0
    pct = params.use("federal.lis.income_limit_fpl_percent", as_of, det).value
    limit = fpl * pct / 100.0
    res_limit = params.use("federal.lis.resource_limit", as_of, det)[inc.size]
    resources = hh.assets_of(budget_unit(hh), exclude_kinds={"home", "vehicle", "burial_space", "life_insurance_cash_value"})
    if inc.countable >= limit:
        det.status = INELIGIBLE
        det.note("MSP-FED-EXTRA-HELP-ELIGIBILITY", f"income ${inc.countable:,.2f} not below {pct}% FPL ${limit:,.2f}", False)
    elif resources > res_limit:
        det.status = INELIGIBLE
        det.note("MSP-FED-EXTRA-HELP-ELIGIBILITY", f"resources ${resources:,.0f} exceed ${res_limit:,}", False)
    else:
        det.status, det.tier = ELIGIBLE, "full_subsidy"
        det.note("MSP-FED-EXTRA-HELP-ELIGIBILITY", f"income ${inc.countable:,.2f} < ${limit:,.2f}; resources ${resources:,.0f} <= ${res_limit:,}", True)
    return det


def evaluate(hh: Household, state: str, as_of: date) -> Determination:
    """Entry point: evaluate the Medicare Savings Program for ``state``."""
    from rulesarchive.dispatch import evaluate_state

    return evaluate_state(PROGRAM, hh, state, as_of)
