"""Medicare Savings Program — California (Medi-Cal).

California offers the four federal tiers (QMB <= 100% FPL, SLMB < 120%,
QI < 135%, QDWI <= 200%) with DHCS's rounded-up monthly FPL figures, counts
income with the $20 any income deduction and $65-plus-one-half on earnings,
and from January 1, 2026 again applies a property limit of $130,000 (one
person) / $195,000 (two). From 2024 through 2025 there was no property test.

Facts read (all optional):
- ``Household.facts.application_date`` (ISO date): when the MSP/Medi-Cal
  application was filed; before 2026-01-01 the property test waits for the
  first renewal on or after 2026-01-01.
- ``Household.facts.renewed_since_asset_reinstatement`` (bool): that renewal
  (or an ex parte change redetermination with assets verified) has happened.
- ``Person.facts.share_of_cost`` (bool): the person's Medi-Cal has a share
  of cost (medically needy), not zero-share full scope.
- ``Person.facts.applying`` (bool): a spouse is (or is not) an MSP applicant;
  defaults to whether the spouse has Medicare Part A.
- ``Person.facts.part_a_buy_in`` (bool): Part A obtained through the state
  buy-in (treated as having Part A).
"""

from __future__ import annotations

from datetime import date

from rulesarchive import params
from rulesarchive.determination import ELIGIBLE, INELIGIBLE, UNDETERMINED, Determination
from rulesarchive.household import Household

from playbooks.msp.federal import rules as fed

STATE = "ca"
EXCLUDED_ASSETS = {"home", "vehicle", "burial_space"}


def _as_date(v) -> date | None:
    if v is None or isinstance(v, date):
        return v
    return date.fromisoformat(str(v))


def _standards_date(hh: Household, owners: set[str], as_of: date, det: Determination) -> date:
    """Which year's FPL figures apply (MSP-CA-FPL-EFFECTIVE)."""
    rsdi = any(i.kind == "social_security" and i.owner in owners for i in hh.incomes)
    month = int(params.use("ca.msp.new_fpl_month_rsdi", as_of, det).value)
    if rsdi and as_of.month < month:
        det.note("MSP-CA-FPL-EFFECTIVE",
                 f"household has Social Security (RSDI) income and {as_of:%B %Y} is before the March 1 switch: "
                 f"{as_of.year - 1} FPL figures apply", None)
        return date(as_of.year - 1, 12, 31)
    det.note("MSP-CA-FPL-EFFECTIVE", f"{as_of.year} FPL figures apply"
             + (" (no RSDI income: from January 1)" if not rsdi else " (RSDI income: from March 1)"), None)
    return as_of


def _tier(countable: float, size: int, std_date: date, det: Determination) -> str | None:
    q = params.use("ca.msp.qmb_income_limit_monthly", std_date, det)[size]
    s = params.use("ca.msp.slmb_income_limit_monthly", std_date, det)[size]
    i = params.use("ca.msp.qi_income_limit_monthly", std_date, det)[size]
    if countable <= q:
        return "QMB"
    if countable < s:
        return "SLMB"
    if countable < i:
        return "QI"
    return None


def _asset_test(hh: Household, as_of: date, det: Determination, size: int) -> bool | None:
    """True = passes, False = fails, None = no property test applies."""
    if not params.use("ca.msp.asset_test_applies", as_of, det).value:
        det.note("MSP-CA-NO-ASSET-TEST-2024-2025", "no property limit for the MSPs from Jan 1, 2024 to Dec 31, 2025", True)
        return None
    start = _as_date(params.use("ca.msp.asset_test_start_application_date", as_of, det).value)
    applied = _as_date(hh.facts.get("application_date"))
    if applied is not None and applied < start and not hh.facts.get("renewed_since_asset_reinstatement"):
        det.note("MSP-CA-ASSET-TRANSITION",
                 f"application dated {applied} (before {start}); property is not considered until the first renewal "
                 "on or after January 1, 2026", True)
        return None
    limit = params.use("ca.msp.asset_limit", as_of, det)[size]
    resources = hh.assets_of(fed.budget_unit(hh), exclude_kinds=EXCLUDED_ASSETS)
    ok = resources <= limit
    det.note("MSP-CA-ASSET-LIMIT", f"property ${resources:,.0f} {'within' if ok else 'exceeds'} ${limit:,}", ok)
    return ok


def _qdwi(hh: Household, as_of: date, det: Determination) -> bool:
    a = hh.applicant
    if not (a.age < 65 and a.disabled and a.facts.get("lost_part_a_due_to_work")):
        return False
    if a.receives("medicaid"):
        det.note("MSP-CA-QDWI", "QDWI requires not also receiving Medi-Cal", False)
        return False
    owners = fed.budget_unit(hh)
    inc = fed.countable_income_of(hh, owners, as_of, det, "ca.msp.income_disregard_monthly", "MSP-CA-INCOME-METHOD")
    limit = params.use("ca.msp.qdwi_income_limit_monthly", as_of, det)[inc.size]
    if inc.earned:
        det.unresolved("MSP-CA-OQ-07")
    assets = _asset_test(hh, as_of, det, inc.size)
    ok = inc.countable <= limit and assets is not False
    det.note("MSP-CA-QDWI", f"QDWI: countable ${inc.countable:,.2f} vs ${limit:,} (200% FPL)", ok)
    if ok:
        det.status, det.tier = ELIGIBLE, "QDWI"
    return ok


def evaluate(hh: Household, as_of: date) -> Determination:
    det = Determination(fed.PROGRAM, STATE, as_of)
    det.note("MSP-CA-TIERS", "California tiers: QMB, SLMB, QI, QDWI (federal tiers)", None)

    if any(m.relationship == "child" for m in hh.members):
        det.status = UNDETERMINED
        det.note("MSP-CA-FAMILY-SIZE", "a child lives in the home; California's MFBU family size for MSP is not modelled", None)
        det.unresolved("MSP-CA-OQ-03")
        return det

    if _qdwi(hh, as_of, det):
        fed.extra_help_link(det)
        return det

    a = hh.applicant
    if not fed.has_part_a(hh):
        if a.medicare_part_b:
            det.status = UNDETERMINED
            det.note("MSP-CA-PART-A-BUY-IN",
                     "has Part B but no Part A: California is a Part A buy-in state for QMB members, but whether the state "
                     "buys in Part A for an MSP-only applicant was not established", None)
            det.unresolved("MSP-CA-OQ-02")
        else:
            det.status = INELIGIBLE
            det.note("MSP-CA-PART-A", "applicant has no Medicare Part A", False)
        return det
    det.note("MSP-CA-PART-A", "applicant has Medicare Part A"
             + (" (state Part A buy-in)" if a.facts.get("part_a_buy_in") else ""), True)

    owners = fed.budget_unit(hh)
    std_date = _standards_date(hh, owners, as_of, det)
    inc = fed.countable_income_of(hh, owners, as_of, det, "ca.msp.income_disregard_monthly", "MSP-CA-INCOME-METHOD")
    tier = _tier(inc.countable, inc.size, std_date, det)
    used_size = inc.size

    # SSI income methodology with an ineligible spouse (MSP-CA-INELIGIBLE-SPOUSE).
    sp = hh.spouse
    if sp is not None:
        det.note("MSP-CA-COUPLE", "spouse lives in the home: Medi-Cal methodology uses the couple's income and the FPL for two", None)
        spouse_applying = sp.facts.get("applying", sp.medicare_part_a)
        if not spouse_applying:
            alone = fed.countable_income_of(hh, {a.id}, as_of, det, "ca.msp.income_disregard_monthly", "MSP-CA-INCOME-METHOD")
            alone_tier = _tier(alone.countable, 1, std_date, det)
            if fed.TIER_RANK[alone_tier] > fed.TIER_RANK[tier]:
                spouse_income = sum(i.monthly for i in hh.incomes if i.owner == sp.id and i.kind not in fed.NOT_COUNTED)
                allocation = params.use("ca.msp.standard_ssi_allocation_monthly", as_of, det).value
                if spouse_income <= float(allocation):
                    tier, used_size = alone_tier, 1
                    det.note("MSP-CA-INELIGIBLE-SPOUSE",
                             f"ineligible spouse's income ${spouse_income:,.2f} <= standard SSI allocation ${allocation}: exempt; "
                             "applicant measured alone against the FPL for one", True)

    resources_ok = _asset_test(hh, as_of, det, used_size)
    if resources_ok is False:
        det.status = INELIGIBLE
        return det

    if tier is None:
        det.status = INELIGIBLE
        det.note("MSP-CA-QI-INCOME", f"countable ${inc.countable:,.2f} is not below the QI standard", False)
    elif tier == "QI" and a.receives("medicaid"):
        if a.facts.get("share_of_cost"):
            det.status = UNDETERMINED
            det.note("MSP-CA-QI-NOT-MEDI-CAL",
                     "income is in the QI range and the person has share-of-cost Medi-Cal; whether that bars QI in "
                     "California was not established", None)
            det.unresolved("MSP-CA-OQ-01")
        else:
            det.status = INELIGIBLE
            det.note("MSP-CA-QI-NOT-MEDI-CAL", "income is in the QI range but the person has Medi-Cal; QI cannot be held with Medi-Cal", False)
    else:
        det.status, det.tier = ELIGIBLE, tier
        rid = {"QMB": "MSP-CA-QMB-INCOME", "SLMB": "MSP-CA-SLMB-INCOME", "QI": "MSP-CA-QI-INCOME"}[tier]
        det.note(rid, f"countable income qualifies for {tier} (household size {used_size})", True)

    fed.extra_help_link(det)
    fed.part_b_amount(det, as_of)
    return det
