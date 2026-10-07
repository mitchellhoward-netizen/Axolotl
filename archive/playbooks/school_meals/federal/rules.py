"""School meals (free and reduced-price meals) — federal base logic.

Shared building blocks that every state part calls: the income test against
USDA's income eligibility guidelines (IEGs) by pay frequency, categorical
eligibility, direct certification with SNAP and with Medicaid (the state's
demonstration type decides free-only or free and reduced price), the
Community Eligibility Provision, and the 30-operating-day carry-over.

The determination is about one student (``target_student``) in a household.
Tiers: ``free``, ``reduced``, ``paid`` and ``free_universal`` (no charge to
any student because of CEP or a state universal-meals law). Status is
eligible for free / reduced / free_universal and ineligible for paid.

Household facts used (``Household.facts``):
  student                 id of the student the question is about (default:
                          first member with ``student: true``, else applicant)
  reported_income         list of {owner, kind, amount, frequency}; frequency
                          one of annual | monthly | twice_monthly | biweekly |
                          weekly. When absent, ``Household.incomes`` (monthly)
                          are used as monthly income.
  school_cep              the student's school operates the Community
                          Eligibility Provision
  school_provision2_nonbase  the school is in a Provision 2 non-base year
  school_participates_nslp   the school runs the NSLP/SBP (default true)
  school_type             public | charter | private (default public)
  medicaid_income_fpl_percent  household income as measured by Medicaid, % of
                          FPL for the Medicaid family size (for direct
                          certification with Medicaid). When absent, the
                          school-meal income ratio is used as a proxy.
  application_filed       household has filed (or will file) a meal
                          application (default true)
  prior_year_tier, operating_days_into_school_year, new_determination_made
                          carry-over of last year's eligibility
  il_hsmfa_participating  (Illinois) the school board participates in a funded
                          Healthy School Meals for All program
Person facts / benefits: benefits snap, tanf, fdpir, medicaid, foster_care,
  head_start, homeless_liaison; facts homeless, migrant, runaway (true).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from rulesarchive import params
from rulesarchive.determination import ELIGIBLE, INELIGIBLE, Determination
from rulesarchive.household import Household, Person

PROGRAM = "school_meals"

FREQ_PER_YEAR = {"annual": 1, "monthly": 12, "twice_monthly": 24, "biweekly": 26, "weekly": 52}
TIER_RANK = {"free": 3, "reduced": 2, "paid": 1}

DCM_NONE = "none"
DCM_FREE_ONLY = "free_only"
DCM_FREE_AND_REDUCED = "free_and_reduced"


@dataclass
class FederalResult:
    tier: str = "paid"
    route: str | None = None          # categorical_snap | categorical_individual | dcm_medicaid | income_application | cep | carryover
    routes: list[str] = field(default_factory=list)
    income_ratio_band: str | None = None   # free | reduced | over


def school_year_start(as_of: date) -> date:
    """School year for the meal programs runs July 1 - June 30 (7 CFR 245.2 / IEG notices)."""
    return date(as_of.year if as_of.month >= 7 else as_of.year - 1, 7, 1)


def target_student(hh: Household) -> Person:
    sid = hh.facts.get("student")
    if sid:
        return hh.person(sid)
    for m in hh.members:
        if m.student:
            return m
    return hh.applicant


def _limit(table: dict, freq: str, size: int) -> float:
    col = table[freq]
    if size <= 8:
        return float(col.get(size, col.get(str(size))))
    return float(col.get(8, col.get("8"))) + float(col["additional"]) * (size - 8)


def reported_income(hh: Household) -> list[dict]:
    rows = hh.facts.get("reported_income")
    if rows:
        return [dict(r) for r in rows]
    return [{"owner": i.owner, "kind": i.kind, "amount": i.monthly, "frequency": "monthly"} for i in hh.incomes]


def income_test(hh: Household, as_of: date, det: Determination, rule_id: str = "SCH-FED-INCOME-TEST") -> str:
    """Compare household gross income with the IEGs. Returns free | reduced | over.

    One frequency: the sum is compared with that frequency's column. Mixed
    frequencies: each amount is annualized (x52, x26, x24, x12) without
    rounding and the total compared with the annual column
    (SCH-FED-INCOME-CONVERSION).
    """
    free = params.use("federal.usda.cn_ieg_free_income_limit", as_of, det).value
    reduced = params.use("federal.usda.cn_ieg_reduced_income_limit", as_of, det).value
    rows = reported_income(hh)
    size = hh.size
    freqs = {r["frequency"] for r in rows}
    if not rows:
        freq, total = "annual", 0.0
    elif len(freqs) == 1:
        freq = next(iter(freqs))
        total = sum(float(r["amount"]) for r in rows)
    else:
        freq = "annual"
        total = sum(float(r["amount"]) * FREQ_PER_YEAR[r["frequency"]] for r in rows)
        det.note("SCH-FED-INCOME-CONVERSION",
                 f"income received at different frequencies ({', '.join(sorted(freqs))}); annualized to ${total:,.2f}", None)
    lf, lr = _limit(free, freq, size), _limit(reduced, freq, size)
    if total <= lf:
        band = "free"
    elif total <= lr:
        band = "reduced"
    else:
        band = "over"
    det.note(rule_id, f"household of {size}: {freq} income ${total:,.2f} vs free ${lf:,.0f} / reduced ${lr:,.0f} "
                      f"({school_year_start(as_of).year}-{(school_year_start(as_of).year + 1) % 100:02d} IEGs) -> {band}",
             band != "over")
    return band


def household_categorical(hh: Household) -> str | None:
    """SNAP, TANF or FDPIR for any household member makes every child free (SCH-FED-CATEGORICAL-PROGRAM)."""
    for b in ("snap", "tanf", "fdpir"):
        if hh.anyone_receives(b):
            return b
    return None


def individual_categorical(student: Person) -> str | None:
    """Foster, homeless, migrant, runaway, Head Start: that child only (SCH-FED-CATEGORICAL-INDIVIDUAL)."""
    if student.receives("foster_care"):
        return "foster"
    if student.receives("homeless_liaison") or student.facts.get("homeless"):
        return "homeless"
    if student.facts.get("migrant"):
        return "migrant"
    if student.facts.get("runaway"):
        return "runaway"
    if student.receives("head_start"):
        return "head_start"
    return None


def medicaid_dc(hh: Household, as_of: date, det: Determination, dcm_type: str, rule_id: str,
                income_band: str) -> str | None:
    """Direct certification with Medicaid. Returns free | reduced | None.

    Any household member on Medicaid is matched; the match uses income as
    Medicaid measured it (``medicaid_income_fpl_percent``) or, when that fact
    is absent, the school-meal income band as a proxy.
    """
    if not hh.anyone_receives("medicaid"):
        return None
    if dcm_type == DCM_NONE:
        det.note(rule_id, "state does not directly certify with Medicaid", None)
        return None
    pct = hh.facts.get("medicaid_income_fpl_percent")
    free_pct = params.use("federal.usda.dcm_free_fpl_percent", as_of, det).value
    red_pct = params.use("federal.usda.dcm_reduced_fpl_percent", as_of, det).value
    if pct is None:
        band = income_band
        how = "school-meal income used as a proxy for Medicaid-measured income"
    else:
        pct = float(pct)
        band = "free" if pct <= free_pct else ("reduced" if pct <= red_pct else "over")
        how = f"Medicaid-measured income {pct:.0f}% FPL"
    if band == "free":
        det.note(rule_id, f"Medicaid match: {how} <= {free_pct}% -> directly certified free", True)
        return "free"
    if band == "reduced":
        if dcm_type == DCM_FREE_AND_REDUCED:
            det.note(rule_id, f"Medicaid match: {how} <= {red_pct}% -> directly certified reduced price", True)
            return "reduced"
        det.note(rule_id, f"Medicaid match: {how} is in the reduced-price range, but this state certifies "
                          "with Medicaid for free meals only; reduced price needs an application", False)
        return None
    det.note(rule_id, f"Medicaid match: {how} above {red_pct}%; no direct certification", False)
    return None


def carryover(hh: Household, as_of: date, det: Determination) -> str | None:
    """Last year's free/reduced status runs up to 30 operating days into the new year (SCH-FED-CARRYOVER)."""
    prior = hh.facts.get("prior_year_tier")
    days = hh.facts.get("operating_days_into_school_year")
    if prior not in ("free", "reduced") or days is None or hh.facts.get("new_determination_made"):
        return None
    limit = params.use("federal.usda.carryover_operating_days", as_of, det).value
    if int(days) <= int(limit):
        det.note("SCH-FED-CARRYOVER", f"operating day {days} of the school year (<= {limit}): last year's "
                                      f"{prior} status carries over until a new determination", True)
        return prior
    det.note("SCH-FED-CARRYOVER", f"operating day {days} is past the {limit}-day carry-over; last year's status has lapsed", False)
    return None


def federal_category(hh: Household, as_of: date, det: Determination, *, dcm_type: str,
                     dcm_rule: str = "SCH-FED-DCM", dcm_available: bool = True) -> FederalResult:
    """The student's own federal category (free / reduced / paid) and how it is reached.

    The most favorable category wins (a Medicaid reduced-price match does not
    override a free income application).
    """
    student = target_student(hh)
    res = FederalResult()
    best = "paid"

    def take(tier: str, route: str) -> None:
        nonlocal best
        res.routes.append(f"{route}:{tier}")
        if TIER_RANK[tier] > TIER_RANK[best]:
            best, res.route = tier, route

    prog = household_categorical(hh)
    if prog:
        det.note("SCH-FED-CATEGORICAL-PROGRAM", f"a household member receives {prog.upper()}: every child in the household is free", True)
        if prog == "snap":
            det.note("SCH-FED-DC-SNAP", "SNAP households are directly certified by data match; no application needed", True)
            det.links.append("snap:direct_certification")
        take("free", "categorical_" + prog)
    ind = individual_categorical(student)
    if ind:
        det.note("SCH-FED-CATEGORICAL-INDIVIDUAL", f"student is a {ind.replace('_', ' ')} child: free (this child only)", True)
        take("free", "categorical_individual")

    band = income_test(hh, as_of, det)
    res.income_ratio_band = band
    if dcm_available:
        m = medicaid_dc(hh, as_of, det, dcm_type, dcm_rule, band)
        if m:
            det.links.append(f"medicaid:direct_certification_{m}")
            take(m, "dcm_medicaid")
    elif hh.anyone_receives("medicaid"):
        det.note(dcm_rule, "Medicaid direct certification is not available to this school (in California it runs only through CALPADS, which private schools cannot use)", None)
    if band in ("free", "reduced"):
        take(band, "income_application")
        if res.route == "income_application" and hh.facts.get("application_filed") is False:
            det.links.append("action:file_application")
    co = carryover(hh, as_of, det)
    if co:
        take(co, "carryover")
    res.tier = best
    return res


def apply_federal(det: Determination, res: FederalResult) -> Determination:
    det.tier = res.tier
    det.status = ELIGIBLE if res.tier in ("free", "reduced") else INELIGIBLE
    if res.route:
        det.links.append(f"route:{res.route}")
    return det


def cep(hh: Household, det: Determination, as_of: date) -> bool:
    """A CEP school serves breakfast and lunch free to every enrolled student (SCH-FED-CEP)."""
    if not hh.facts.get("school_cep"):
        return False
    isp = params.use("federal.usda.cep_min_isp_percent", as_of, det).value
    det.note("SCH-FED-CEP", f"school operates the Community Eligibility Provision (ISP >= {isp}% when elected): "
                            "breakfast and lunch free to all enrolled students; no household application", True)
    return True


def universal(det: Determination, res: FederalResult, rule_id: str | None, text: str, route: str) -> Determination:
    """No charge for every student; the federal category is still recorded for claiming and state funding."""
    if rule_id:
        det.note(rule_id, text, True)
    det.status, det.tier = ELIGIBLE, "free_universal"
    det.links.append(f"federal_category:{res.tier}")
    det.links.append(f"route:{route}")
    return det


def evaluate_federal(hh: Household, as_of: date, det: Determination, *, dcm_type: str,
                     dcm_rule: str = "SCH-FED-DCM", dcm_available: bool = True) -> Determination:
    """Federal rules only: CEP, then the student's own category. States add universal meals around this."""
    if hh.facts.get("school_participates_nslp", True) is False:
        det.note("SCH-FED-NSLP-PARTICIPATION", "the school does not run the National School Lunch / School Breakfast "
                                               "Program, so federal free or reduced-price meals are not available there", False)
        det.status, det.tier = INELIGIBLE, "paid"
        return det
    res = federal_category(hh, as_of, det, dcm_type=dcm_type, dcm_rule=dcm_rule, dcm_available=dcm_available)
    if cep(hh, det, as_of):
        return universal(det, res, None, "", "cep")
    return apply_federal(det, res)


def evaluate(hh: Household, state: str, as_of: date) -> Determination:
    """Entry point: evaluate school meals for ``state``."""
    from rulesarchive.dispatch import evaluate_state

    return evaluate_state(PROGRAM, hh, state, as_of)
