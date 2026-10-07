"""Long-term care (nursing-facility) Medicaid — federal building blocks.

Federal law (42 U.S.C. 1396p, 1396r-5) sets the frame every state uses:
a look-back for uncompensated transfers and a penalty period computed by
dividing the uncompensated value by a state divisor, the spousal
impoverishment allowances, the home equity limit, and the personal needs
allowance. Each state part chooses its own numbers and options and calls the
helpers here with them.

Program-specific inputs (synthetic households only):

Person.facts (applicant, unless noted)
    care_setting               "nursing_facility" (default) | "home_care" (community-based LTC / HCBS waiver)
    institutionalized          bool; in a medical institution or nursing facility and likely to stay 30+ days
    level_of_care_met          bool, default True; meets the state's nursing-facility level of care
    ltc_application_date       ISO date the person applied for LTC Medicaid (default: as_of); the "baseline date"
    transfers                  list of {date, amount, recipient, exempt, resources_at_transfer}
                               amount = uncompensated value (fair market value minus what was received)
                               recipient: spouse | blind_disabled_child | other (default other)
                               exempt: True when the state found an allowable/exempt transfer (e.g. a caregiver child)
                               resources_at_transfer: countable resources just before the transfer (California test)
    home_equity                equity interest in the home (default: value of 'home' assets owned by the applicant)
    home_on_agricultural_land  bool (relevant only from 2028)
    home_occupied_by           spouse | child_under_21 | blind_disabled_child (a relative lawfully living in the home)
    health_insurance_premiums_monthly  premiums the person pays (deducted in post-eligibility budgeting)
    (spouse) institutionalized  bool; True if the spouse is also in a facility (then no community spouse)
    (spouse) health_insurance_premiums_monthly
Household.facts
    nursing_facility_monthly_cost  monthly private cost of the person's facility (income test)
    facility_private_rate_monthly  Illinois: the facility's monthly (30-day) private rate, the penalty divisor
    ny_region                  New York regional-rate region of the facility (e.g. new_york_city)
    snapshot_resources         couple's countable resources at the start of the first continuous period of
                               institutionalization (default: current combined countable resources)
    family_members             list of {monthly_income} dependants living with the community spouse
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, timedelta

from rulesarchive import params
from rulesarchive.determination import Determination
from rulesarchive.household import Household

PROGRAM = "ltc_medicaid"

NOT_COUNTED_RESOURCES = {"home", "vehicle", "burial_space"}
EXEMPT_RECIPIENTS = {"spouse", "blind_disabled_child"}
HOME_EXCEPTION_OCCUPANTS = {"spouse", "child_under_21", "blind_disabled_child"}


@dataclass
class Transfer:
    when: date
    amount: float
    recipient: str = "other"
    exempt: bool = False
    resources_at_transfer: float | None = None


# ------------------------------------------------------------------ dates
def _d(v) -> date:
    return v if isinstance(v, date) else date.fromisoformat(str(v))


def first_of_month(d: date) -> date:
    return d.replace(day=1)


def add_months(d: date, n: int) -> date:
    y, m = divmod(d.month - 1 + n, 12)
    return date(d.year + y, m + 1, 1) if d.day == 1 else date(d.year + y, m + 1, min(d.day, 28))


def months_before(d: date, n: int) -> date:
    """The same day-of-month n months earlier (clamped to the 28th for safety)."""
    return add_months(d, -n) if d.day == 1 else add_months(d.replace(day=1), -n).replace(day=min(d.day, 28))


def penalty_end(start: date, months: float) -> date:
    """End (exclusive) of a penalty that starts on ``start``: whole months, then the fraction as 30-day days."""
    whole = int(math.floor(months))
    frac = months - whole
    return add_months(start, whole) + timedelta(days=round(frac * 30))


# --------------------------------------------------------------- people
def is_ltc_applicant(hh: Household) -> str:
    return hh.applicant.facts.get("care_setting", "nursing_facility")


def baseline_date(hh: Household, as_of: date) -> date:
    """Date the transfer look-back counts back from (42 U.S.C. 1396p(c)(1)(B)(ii)): for an institutionalized
    person, the first date on which they are both institutionalized and have applied."""
    v = hh.applicant.facts.get("ltc_application_date")
    return _d(v) if v else as_of


def community_spouse(hh: Household):
    """The applicant's spouse if one lives in the community (LTC-FED-SPOUSAL-DEFINITIONS)."""
    sp = hh.spouse
    if sp is None or sp.facts.get("institutionalized"):
        return None
    return sp


def categorical_ok(hh: Household) -> bool:
    a = hh.applicant
    return a.age >= 65 or a.disabled or a.blind


def transfers(hh: Household) -> list[Transfer]:
    out = []
    for t in hh.applicant.facts.get("transfers", []) or []:
        out.append(Transfer(_d(t["date"]), float(t["amount"]), t.get("recipient", "other"), bool(t.get("exempt", False)),
                            None if t.get("resources_at_transfer") is None else float(t["resources_at_transfer"])))
    return out


def exempt_transfer(t: Transfer) -> bool:
    """LTC-FED-EXEMPT-TRANSFERS: transfers to a spouse or a blind/disabled child (and others a state finds allowable)."""
    return t.exempt or t.recipient in EXEMPT_RECIPIENTS


def in_window(t: Transfer, start: date, end: date) -> bool:
    return start <= t.when <= end


# ------------------------------------------------------------ resources
def countable_resources(hh: Household, owners: set[str]) -> float:
    """SSI-style countable resources: the home (tested separately for equity), one vehicle and burial spaces
    are not counted (LTC-FED-RESOURCE-COUNTING)."""
    return hh.assets_of(owners, exclude_kinds=NOT_COUNTED_RESOURCES)


def couple_ids(hh: Household) -> set[str]:
    ids = {hh.applicant.id}
    if hh.spouse is not None:
        ids.add(hh.spouse.id)
    return ids


def home_equity(hh: Household) -> float:
    a = hh.applicant
    if "home_equity" in a.facts:
        return float(a.facts["home_equity"])
    return sum(x.value for x in hh.assets if x.kind == "home" and x.owner == a.id)


def home_equity_exception(hh: Household) -> bool:
    """LTC-FED-HOME-EQUITY: the limit does not apply while a spouse, a child under 21, or a blind or disabled
    child lawfully lives in the home."""
    occ = hh.applicant.facts.get("home_occupied_by")
    return occ in HOME_EXCEPTION_OCCUPANTS or (community_spouse(hh) is not None and occ is None
                                                and hh.applicant.facts.get("spouse_lives_in_home", True))


def home_equity_test(hh: Household, as_of: date, det: Determination, limit: float, rule_id: str) -> bool:
    eq = home_equity(hh)
    if eq <= 0:
        return True
    if home_equity_exception(hh):
        det.note(rule_id, f"home equity ${eq:,.0f}: limit does not apply (spouse or qualifying child lives in the home)", True)
        return True
    ok = eq <= limit
    det.note(rule_id, f"home equity ${eq:,.0f} {'within' if ok else 'exceeds'} the ${limit:,.0f} limit", ok)
    det.amounts["home_equity_limit"] = float(limit)
    return ok


def spousal_share_csra(snapshot_total: float, state_minimum: float, maximum: float) -> float:
    """42 U.S.C. 1396r-5(f)(2)(A): the greatest of the state minimum and the spousal share (half the couple's
    resources at the snapshot date) up to the maximum."""
    return max(state_minimum, min(snapshot_total / 2.0, maximum))


def snapshot_total(hh: Household) -> float:
    v = hh.facts.get("snapshot_resources")
    return float(v) if v is not None else countable_resources(hh, couple_ids(hh))


# --------------------------------------------------------------- income
def gross_income(hh: Household, pid: str) -> float:
    return sum(i.monthly for i in hh.incomes if i.owner == pid)


def premiums(person) -> float:
    return float(person.facts.get("health_insurance_premiums_monthly", 0) or 0)


def community_spouse_income_allowance(mmmna: float, cs_income: float) -> float:
    """42 U.S.C. 1396r-5(d)(2): the amount by which the maintenance needs allowance exceeds the community
    spouse's own income."""
    return max(0.0, round(mmmna - cs_income, 2))


def excess_shelter_mmmna(minimum: float, housing_allowance: float, shelter_costs: float, cap: float) -> float:
    """Federal MMMNA: 150% FPL for two plus shelter costs above the housing allowance, capped
    (42 U.S.C. 1396r-5(d)(3)-(4)). The three states in the archive use the cap for everyone, so this is
    used only for the federal-minimum comparison."""
    return min(cap, minimum + max(0.0, shelter_costs - housing_allowance))


def family_allowance(standard: float, member_income: float, maximum: float | None = None) -> float:
    """42 U.S.C. 1396r-5(d)(1)(C): at least one-third of (MMMNA minimum - family member's income)."""
    fa = max(0.0, (standard - member_income) / 3.0)
    if maximum is not None:
        fa = min(fa, maximum)
    return round(fa, 2)


# -------------------------------------------------------------- penalty
def federal_penalty_months(value: float, divisor: float) -> float:
    """42 U.S.C. 1396p(c)(1)(E)(i), (iv): uncompensated value / divisor, fractions kept (2 decimals here)."""
    return round(value / divisor, 2) if divisor else 0.0


def dra_penalty_start(transfer_dates: list[date], otherwise_eligible: date) -> date:
    """42 U.S.C. 1396p(c)(1)(D)(ii) and (H): the later of the first day of the (earliest) transfer month and the
    date the person is otherwise eligible and receiving institutional care."""
    first = first_of_month(min(transfer_dates))
    return max(first, otherwise_eligible)


# ------------------------------------------------------ composed steps
def gate(hh: Household, as_of: date, det: Determination, state_label: str) -> str | None:
    """Category and setting checks every state shares. Returns the care setting, or None when the
    determination is already final (status set)."""
    from rulesarchive.determination import INELIGIBLE, UNDETERMINED

    setting = is_ltc_applicant(hh)
    a = hh.applicant
    if not categorical_ok(hh):
        det.status = UNDETERMINED
        det.note("LTC-FED-CATEGORY", f"applicant is {a.age}, not blind or disabled: long-term care under an "
                 "aged/blind/disabled group does not apply; the adult (MAGI) group rules are not in this playbook", None)
        det.unresolved("LTC-FED-OQ-01")
        det.links.append("medicaid:check_magi_group")
        return None
    det.note("LTC-FED-CATEGORY", f"applicant is {'65 or older' if a.age >= 65 else 'blind or disabled'}", True)
    if not a.facts.get("level_of_care_met", True):
        det.status = INELIGIBLE
        det.note("LTC-FED-INSTITUTIONALIZED", "does not meet nursing-facility level of care", False)
        return None
    if setting == "nursing_facility" and not a.facts.get("institutionalized"):
        det.status = INELIGIBLE
        det.note("LTC-FED-INSTITUTIONALIZED", "not in a nursing facility (and not applying for community-based "
                 "long-term care)", False)
        return None
    det.note("LTC-FED-INSTITUTIONALIZED",
             "in a nursing facility, expected to stay 30+ days" if setting == "nursing_facility"
             else "applying for community-based long-term care (home care / HCBS)", True)
    return setting


def resources_after_csra(hh: Household, det: Determination, csra: float | None, rule_id: str) -> tuple[float, int]:
    """Countable resources measured against the individual limit: the couple's combined resources minus the
    CSRA when there is a community spouse (42 U.S.C. 1396r-5(c)(2)); otherwise the applicant's own."""
    cs = community_spouse(hh)
    if cs is not None and csra is not None:
        total = countable_resources(hh, couple_ids(hh))
        det.amounts["csra"] = float(csra)
        res = max(0.0, total - csra)
        det.note(rule_id, f"couple's countable resources ${total:,.0f} - CSRA ${csra:,.0f} = ${res:,.0f} "
                 "attributed to the institutionalized spouse", None)
        return res, 1
    res = countable_resources(hh, {hh.applicant.id})
    return res, 1


def window_transfers(hh: Household, start: date, end: date, det: Determination, rule_id: str) -> list[Transfer]:
    out = []
    for t in transfers(hh):
        if not in_window(t, start, end):
            det.note(rule_id, f"transfer of ${t.amount:,.0f} on {t.when} is outside the look-back "
                     f"({start} to {end})", None)
            continue
        if exempt_transfer(t):
            det.note("LTC-FED-EXEMPT-TRANSFERS", f"transfer of ${t.amount:,.0f} on {t.when} to {t.recipient} "
                     "is exempt (no penalty)", True)
            continue
        out.append(t)
    return out


def post_eligibility(det: Determination, income: float, pna: float, csmia: float, fa: float, prem: float,
                     rule_id: str) -> float:
    """Amount the resident pays the facility each month (42 CFR 435.725; 42 U.S.C. 1396r-5(d)(1)):
    income minus, in order, the personal needs allowance, the community spouse income allowance, family
    allowances and health insurance premiums."""
    left = max(0.0, income - pna)
    csmia_used = min(csmia, left)
    left -= csmia_used
    fa_used = min(fa, left)
    left -= fa_used
    liability = round(max(0.0, left - prem), 2)
    det.amounts["community_spouse_income_allowance"] = round(csmia_used, 2)
    if fa:
        det.amounts["family_allowance"] = round(fa_used, 2)
    det.amounts["patient_liability_monthly"] = liability
    det.note(rule_id, f"income ${income:,.2f} - PNA ${pna:,.2f} - spouse allowance ${csmia_used:,.2f}"
             + (f" - family allowance ${fa_used:,.2f}" if fa else "")
             + (f" - premiums ${prem:,.2f}" if prem else "") + f" = ${liability:,.2f} a month to the facility", None)
    return liability


def evaluate(hh: Household, state: str, as_of: date) -> Determination:
    """Entry point: evaluate nursing-facility (or community LTC) Medicaid for ``state``."""
    from rulesarchive.dispatch import evaluate_state

    return evaluate_state(PROGRAM, hh, state, as_of)
