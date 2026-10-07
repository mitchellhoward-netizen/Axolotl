"""Turning 65 — federal base logic (Medicare enrollment, premiums, penalties,
coordination with other coverage, federal Medigap rights).

What a Determination means in this playbook
-------------------------------------------
``status``
    ``eligible``   the person may enroll in Medicare Part B (and premium Part A)
                   *now* (on ``as_of``), or already has Part B;
    ``ineligible`` no enrollment window is open on ``as_of`` (for example, the
                   Initial Enrollment Period has not started, or it ended and
                   it is not January-March and no Special Enrollment Period
                   applies);
    ``undetermined`` a fact the decision needs is missing (no birth date), or
                   the date is outside the rules this archive holds.
``tier``
    the window that is open: ``IEP``, ``GEP``, ``SEP_GHP`` (current-employment
    group health plan), ``SEP_MEDICAID_LOSS``, ``SEP_EMPLOYER_MISINFO``,
    ``SEP_EXCEPTIONAL`` (other exceptional condition granted by SSA/CMS), or
    ``ENROLLED`` when the person already has Part B. ``None`` when ineligible.
``amounts`` (all monthly dollars unless the key says otherwise)
    ``coverage_start_yyyymm``          first month of Part B coverage if the person
                                       enrolls in the month given by ``facts.enroll_month``
                                       (default: the as_of month), e.g. 202606.0;
    ``part_b_penalty_percent``         late-enrollment surcharge percent;
    ``part_b_irmaa_monthly``           income-related monthly adjustment (Part B);
    ``part_b_premium_monthly``         standard premium with penalty (rounded to
                                       10 cents) plus IRMAA;
    ``part_a_premium_monthly``         0 for premium-free Part A, else reduced/full;
    ``part_a_penalty_percent``         10 when the premium-Part A penalty applies;
    ``part_d_penalty_monthly``         Part D late enrollment penalty (rounded to 10 cents);
    ``part_d_irmaa_monthly``           Part D income-related adjustment;
    ``medicare_primary``               1 = Medicare pays first, 0 = the other plan pays first
                                       (only when ``facts.ghp`` describes other coverage);
    ``medigap_guaranteed_issue_now``   1 = an insurer must sell a Medigap policy without
                                       medical underwriting on as_of (federal or state right).

Inputs (``Person.facts`` of the applicant)
------------------------------------------
``birth_date``                 ISO date (required for the enrollment window).
``medicare_basis``             ``age`` (default), ``disability`` or ``esrd``.
``part_a_start``               ISO date; for disability, the first month of Part A
                               (25th month of SSDI). Defaults from ``ssdi_start``.
``ssdi_start``                 ISO date of the first month of SSDI entitlement.
``enroll_month``               ISO date in the month the person signs up (default as_of).
``ghp``                        other coverage: ``{basis: current_employment|retiree|cobra|none,
                               whose: self|spouse|family, employer_size: int,
                               since_first_eligible: bool (default true),
                               last_month: ISO date of the last month of current-employment
                               coverage or employment (whichever ended first), or null if
                               still covered, esrd_month: int}``.
``medicaid_loss``              ``{notified: date, ended: date}`` (Medicaid ended entirely).
``employer_misinformation_reported``  ISO date the person told SSA of employer/plan misinformation.
``exceptional_sep``            ``{start: date, end: date}`` granted by SSA/CMS.
``part_b_uncovered_months``    override of counted late months for the Part B penalty.
``quarters_of_coverage``       own quarters; ``spouse_quarters_of_coverage`` qualifying spouse's.
``part_a_months_late``         full months premium Part A was delayed.
``part_d_uncovered_months``    uncovered months after the IEP (no Part D, no creditable coverage).
``part_d_gap_days``            longest gap in days (a gap under 63 days carries no penalty).
``magi_two_years_prior``       MAGI on the return for the second preceding year.
``filing_status``              ``single`` (default), ``joint`` or ``separate``.
``medigap``                    ``{has_policy: bool, part_b_start: date,
                               gi_event: employer_plan_ended|..., gi_event_date: date}``.
Benefits used: ``qmb``, ``slmb``, ``qi`` (state buy-in), ``extra_help``, ``medicaid``, ``ssdi``.
"""

from __future__ import annotations

import math
from datetime import date, timedelta
from typing import Any

from rulesarchive import params
from rulesarchive.determination import ELIGIBLE, INELIGIBLE, UNDETERMINED, Determination
from rulesarchive.household import Household, Person

PROGRAM = "turning_65"
RULES_2023 = date(2023, 1, 1)


# ------------------------------------------------------------------ dates
def _d(v: Any) -> date | None:
    if v is None or v == "":
        return None
    return v if isinstance(v, date) else date.fromisoformat(str(v))


def mi(d: date) -> int:
    """Month index (months since year 0) of the month containing ``d``."""
    return d.year * 12 + d.month - 1


def from_mi(i: int) -> date:
    return date(i // 12, i % 12 + 1, 1)


def yyyymm(i: int) -> float:
    d = from_mi(i)
    return float(d.year * 100 + d.month)


def round_dime(x: float) -> float:
    """Round to the nearest 10 cents; 5 cents rounds up (42 CFR 408.27)."""
    return math.floor(x * 10 + 0.5 + 1e-9) / 10.0


def attains_65_month(birth: date) -> int:
    """Month index in which the person attains 65 (the day before the 65th birthday)."""
    bday65 = date(birth.year + 65, birth.month, birth.day if not (birth.month == 2 and birth.day == 29) else 28)
    attains = bday65 - timedelta(days=1)
    return mi(attains)


# ---------------------------------------------------------- eligibility month
def first_eligibility_month(p: Person, det: Determination) -> int | None:
    f = p.facts
    basis = f.get("medicare_basis", "age")
    birth = _d(f.get("birth_date"))
    if basis == "disability" and p.age < 65:
        start = _d(f.get("part_a_start"))
        if start is None and _d(f.get("ssdi_start")):
            start = from_mi(mi(_d(f.get("ssdi_start"))) + 24)
        if start is None:
            return None
        det.note("T65-FED-PART-A-DISABILITY",
                 f"Part A based on disability starts {start:%B %Y} (25th month of disability benefits)", None)
        return mi(start)
    if birth is None:
        return None
    m = attains_65_month(birth)
    rule = "T65-FED-AGE-ATTAINMENT"
    if birth.day == 1:
        det.note(rule, f"born on the 1st ({birth}): attains 65 the day before the birthday, so in {from_mi(m):%B %Y}", None)
    else:
        det.note(rule, f"attains 65 in {from_mi(m):%B %Y}", None)
    det.note("T65-FED-PART-A-AGE", f"premium-free Part A (if insured) can start {from_mi(m):%B %Y}", None)
    return m


# ----------------------------------------------------------------- windows
def _ghp(p: Person) -> dict:
    return dict(p.facts.get("ghp") or {})


def sep_ghp(p: Person, enroll: int, first_elig: int, det: Determination) -> tuple[bool, int | None]:
    """Group-health-plan SEP (42 CFR 406.24, 407.20). Returns (open, coverage start month)."""
    g = _ghp(p)
    basis = g.get("basis", "none")
    if basis == "retiree" or (basis == "cobra" and not g.get("last_month")):
        det.note("T65-FED-SEP-NO-RETIREE-COBRA",
                 f"{basis} coverage is not coverage based on current employment; it gives no Special Enrollment Period", False)
        return False, None
    if basis == "cobra":
        det.note("T65-FED-SEP-NO-RETIREE-COBRA",
                 "COBRA does not give or extend an SEP; the 8 months run from the end of the employment-based coverage", None)
    if basis not in ("current_employment", "cobra"):
        return False, None
    if p.facts.get("medicare_basis") == "esrd":
        det.note("T65-FED-SEP-GHP", "the GHP SEP is not available to people entitled only because of ESRD", False)
        return False, None
    if not g.get("since_first_eligible", True):
        det.note("T65-FED-SEP-GHP", "not covered by a current-employment GHP since the first month of eligibility; no SEP", False)
        return False, None
    whose = g.get("whose", "self")
    if whose == "family" and p.facts.get("medicare_basis", "age") == "age":
        det.note("T65-FED-SEP-GHP", "for people 65+, the GHP must be based on their own or a spouse's current employment", False)
        return False, None
    last = _d(g.get("last_month"))
    months_after = int(params.use("federal.cms.sep_ghp_months_after", from_mi(enroll), det).value)
    if last is None:
        det.note("T65-FED-SEP-GHP", f"still covered by a GHP based on {whose} current employment: SEP open", True)
        det.note("T65-FED-SEP-GHP-COVERAGE-START",
                 "enrolling while still covered: Part B can start the first day of the enrollment month (or any of the next 3 months)", None)
        return True, enroll
    last_i = mi(last)
    end_i = last_i + months_after
    if enroll <= last_i:
        det.note("T65-FED-SEP-GHP", f"still covered through {last:%B %Y}: SEP open", True)
        return True, enroll
    if enroll <= end_i:
        det.note("T65-FED-SEP-GHP-DURATION",
                 f"current-employment coverage ended {last:%B %Y}; the 8-month SEP runs through {from_mi(end_i):%B %Y}", True)
        if enroll == last_i + 1:
            det.note("T65-FED-SEP-GHP-COVERAGE-START",
                     "enrolling in the first full month without current-employment coverage: Part B can start that month", None)
            return True, enroll
        det.note("T65-FED-SEP-GHP-COVERAGE-START", "enrolling later in the SEP: Part B starts the month after enrollment", None)
        return True, enroll + 1
    det.note("T65-FED-SEP-GHP-DURATION",
             f"current-employment coverage ended {last:%B %Y}; the SEP ended {from_mi(end_i):%B %Y}", False)
    return False, None


def exceptional_seps(p: Person, enroll_date: date, det: Determination) -> tuple[str | None, int | None]:
    enroll = mi(enroll_date)
    if enroll_date < RULES_2023:
        return None, None
    ml = p.facts.get("medicaid_loss") or {}
    if ml:
        notified, ended = _d(ml.get("notified")), _d(ml.get("ended"))
        months = params.use("federal.cms.exceptional_sep_months", enroll_date, det)["medicaid_loss"]
        if p.benefits & {"qmb", "slmb", "qi", "medicaid"}:
            det.note("T65-FED-SEP-MEDICAID-LOSS", "still has Medicaid or a Medicare Savings Program: the Medicaid-loss SEP does not apply", False)
        elif notified and ended and notified <= enroll_date and enroll <= mi(ended) + int(months):
            det.note("T65-FED-SEP-MEDICAID-LOSS",
                     f"Medicaid ended {ended}; SEP runs from the notice ({notified}) to 6 months after the end", True)
            return "SEP_MEDICAID_LOSS", enroll + 1
    rep = _d(p.facts.get("employer_misinformation_reported"))
    if rep:
        months = params.use("federal.cms.exceptional_sep_months", enroll_date, det)["employer_misinformation"]
        if rep <= enroll_date and enroll <= mi(rep) + int(months):
            det.note("T65-FED-SEP-MISINFORMATION",
                     f"employer/plan misinformation reported to SSA {rep}: SEP for 6 months", True)
            return "SEP_EMPLOYER_MISINFO", enroll + 1
    ex = p.facts.get("exceptional_sep") or {}
    if ex and _d(ex.get("start")) <= enroll_date <= _d(ex.get("end")):
        det.note("T65-FED-SEP-OTHER-EXCEPTIONAL", "exceptional-conditions SEP granted by SSA/CMS is open", True)
        return "SEP_EXCEPTIONAL", enroll + 1
    return None, None


def enrollment_window(hh: Household, as_of: date, det: Determination) -> Determination:
    """Which Part B enrollment period is open on ``as_of`` and when coverage would start."""
    p = hh.applicant
    if p.medicare_part_b:
        det.status, det.tier = ELIGIBLE, "ENROLLED"
        det.note("T65-FED-IEP", "already enrolled in Part B; no enrollment window needed", None)
        return det
    first = first_eligibility_month(p, det)
    if first is None:
        det.status = UNDETERMINED
        det.note("T65-FED-IEP", "no birth date (or disability Part A start date) given; the window cannot be computed", None)
        return det
    enroll_date = _d(p.facts.get("enroll_month")) or as_of
    enroll = mi(enroll_date)
    if enroll_date < RULES_2023:
        det.status = UNDETERMINED
        det.note("T65-FED-IEP-COVERAGE-START", "enrollment before 2023 used different start dates; not modelled here", None)
        return det
    before = int(params.use("federal.cms.iep_months_before", as_of, det).value)
    after = int(params.use("federal.cms.iep_months_after", as_of, det).value)
    iep_start, iep_end = first - before, first + after
    det.note("T65-FED-IEP", f"Initial Enrollment Period {from_mi(iep_start):%B %Y} - {from_mi(iep_end):%B %Y}", None)

    if enroll < iep_start:
        det.status = INELIGIBLE
        det.note("T65-FED-IEP", f"too early: the IEP starts {from_mi(iep_start):%B %Y}", False)
        return det
    if enroll <= iep_end:
        start = first if enroll < first else enroll + 1
        det.status, det.tier = ELIGIBLE, "IEP"
        det.amounts["coverage_start_yyyymm"] = yyyymm(start)
        det.note("T65-FED-IEP-COVERAGE-START",
                 f"enrolling {from_mi(enroll):%B %Y}: Part B starts {from_mi(start):%B %Y}"
                 + (" (month of eligibility)" if enroll < first else " (month after enrollment)"), True)
        return det

    birth = _d(p.facts.get("birth_date"))
    if birth and birth.day == 1 and p.facts.get("medicare_basis", "age") == "age" and enroll == iep_end + 1:
        det.status, det.tier = ELIGIBLE, "IEP"
        det.amounts["coverage_start_yyyymm"] = yyyymm(enroll + 1)
        det.note("T65-FED-DEEMED-IEP-FIRST-OF-MONTH",
                 "born on the 1st and enrolling the month after the IEP: SSA gives a deemed IEP; Part B starts the next month", True)
        return det

    ok, start = sep_ghp(p, enroll, first, det)
    if ok:
        det.status, det.tier = ELIGIBLE, "SEP_GHP"
        det.amounts["coverage_start_yyyymm"] = yyyymm(start)
        return det
    tier, start = exceptional_seps(p, enroll_date, det)
    if tier:
        det.status, det.tier = ELIGIBLE, tier
        det.amounts["coverage_start_yyyymm"] = yyyymm(start)
        return det
    gep = params.use("federal.cms.gep_months", as_of, det).value
    if enroll_date.month in gep:
        det.status, det.tier = ELIGIBLE, "GEP"
        det.amounts["coverage_start_yyyymm"] = yyyymm(enroll + 1)
        det.note("T65-FED-GEP", "January-March General Enrollment Period is open", True)
        det.note("T65-FED-GEP-COVERAGE-START", f"Part B starts {from_mi(enroll + 1):%B %Y} (month after enrollment)", None)
        return det
    det.status = INELIGIBLE
    det.note("T65-FED-GEP", f"IEP ended {from_mi(iep_end):%B %Y}; no SEP applies; next General Enrollment Period is January-March", False)
    return det


# ----------------------------------------------------------------- penalties
def part_b_penalty_months(hh: Household, as_of: date, det: Determination) -> int:
    """Months counted for the Part B surcharge (42 CFR 408.24(b); POMS HI 01001.010)."""
    p = hh.applicant
    if "part_b_uncovered_months" in p.facts:
        n = int(p.facts["part_b_uncovered_months"])
        det.note("T65-FED-PART-B-PENALTY-MONTHS", f"{n} counted months (given)", None)
        return n
    if det.tier in ("IEP", "SEP_GHP", "SEP_MEDICAID_LOSS", "SEP_EMPLOYER_MISINFO", "SEP_EXCEPTIONAL", "ENROLLED", None):
        if det.tier in ("SEP_MEDICAID_LOSS", "SEP_EMPLOYER_MISINFO", "SEP_EXCEPTIONAL"):
            det.note("T65-FED-PART-B-PENALTY-EXCEPTIONAL-SEP", "enrolling in an exceptional-conditions SEP: no late penalty", None)
        elif det.tier == "SEP_GHP":
            det.note("T65-FED-PART-B-PENALTY-GHP-EXCLUDED", "months with current-employment GHP coverage are not counted; SEP enrollment carries no penalty", None)
        return 0
    first = first_eligibility_month(p, Determination(PROGRAM, hh.state, as_of))
    iep_end = first + int(params.use("federal.cms.iep_months_after", as_of, det).value)
    enroll = mi(_d(p.facts.get("enroll_month")) or as_of)
    g = _ghp(p)
    covered_through = None
    if g.get("basis") == "current_employment" and g.get("since_first_eligible", True) and g.get("last_month"):
        covered_through = mi(_d(g["last_month"]))
    n = 0
    for m in range(iep_end + 1, enroll + 1):
        if covered_through is not None and m <= covered_through:
            continue
        n += 1
    det.note("T65-FED-PART-B-PENALTY-MONTHS",
             f"{n} months counted from the end of the IEP ({from_mi(iep_end):%B %Y}) through the enrollment month"
             + (f", excluding current-employment GHP months through {from_mi(covered_through):%B %Y}" if covered_through else ""), None)
    return n


def part_b_penalty_percent(months_late: int, as_of: date, det: Determination | None = None) -> int:
    """10% for each FULL 12 months counted (11 months = 0%, 12 = 10%, 24 = 20%)."""
    pct = params.use("federal.cms.part_b_late_penalty_percent_per_12_months", as_of, det).value
    return int(pct) * (months_late // 12)


def irmaa(pid: str, magi: float, status: str, as_of: date, det: Determination) -> float:
    rows = params.use(pid, as_of, det)[status]
    amt = 0.0
    for lower, inclusive, a in rows:
        if magi > lower or (inclusive and magi >= lower):
            amt = float(a)
    return amt


def part_b_premium(hh: Household, as_of: date, det: Determination) -> None:
    p = hh.applicant
    std = float(params.use("federal.cms.part_b_standard_premium", as_of, det).value)
    if p.benefits & {"qmb", "slmb", "qi"}:
        pct = 0
        det.note("T65-FED-PART-B-PENALTY-MSP",
                 "a Medicare Savings Program (state buy-in) pays the Part B premium and no late penalty is charged", None)
        det.links.append("msp:part_b_premium_paid_no_penalty")
    else:
        months = part_b_penalty_months(hh, as_of, det)
        pct = part_b_penalty_percent(months, as_of, det)
        det.note("T65-FED-PART-B-PENALTY", f"{months} counted months -> {pct}% surcharge (10% per full 12 months)", None if pct == 0 else False)
    base = round_dime(std * (1 + pct / 100.0))
    status = p.facts.get("filing_status", "single")
    magi = p.facts.get("magi_two_years_prior")
    irm = 0.0
    if magi is not None:
        irm = irmaa("federal.cms.part_b_irmaa_monthly", float(magi), status, as_of, det)
        det.note("T65-FED-IRMAA-PART-B", f"MAGI ${float(magi):,.0f} ({status}, return from {as_of.year - 2}) -> IRMAA ${irm:.2f}", None)
    det.amounts["part_b_penalty_percent"] = float(pct)
    det.amounts["part_b_irmaa_monthly"] = irm
    det.amounts["part_b_premium_monthly"] = round(base + irm, 2)
    det.note("T65-FED-PREMIUM-ROUNDING", f"standard ${std:.2f} x (1 + {pct}%) rounded to 10 cents = ${base:.2f}", None)


def part_a_premium(quarters: int, as_of: date, det: Determination | None = None) -> float:
    """Monthly Part A premium for a person 65+ by quarters of coverage (own or qualifying spouse's)."""
    free = int(params.use("federal.ssa.premium_free_part_a_quarters", as_of, det).value)
    reduced = int(params.use("federal.ssa.reduced_part_a_premium_quarters", as_of, det).value)
    if quarters >= free:
        return 0.0
    if quarters >= reduced:
        return float(params.use("federal.cms.part_a_premium_reduced_monthly", as_of, det).value)
    return float(params.use("federal.cms.part_a_premium_full_monthly", as_of, det).value)


def part_a(hh: Household, as_of: date, det: Determination) -> None:
    f = hh.applicant.facts
    if "quarters_of_coverage" not in f:
        return
    q = max(int(f.get("quarters_of_coverage", 0)), int(f.get("spouse_quarters_of_coverage", 0)))
    prem = part_a_premium(q, as_of, det)
    rid = ("T65-FED-PART-A-PREMIUM-FREE" if prem == 0 else
           "T65-FED-PART-A-PREMIUM-REDUCED" if q >= 30 else "T65-FED-PART-A-PREMIUM-FULL")
    det.note(rid, f"{q} quarters of coverage (own or qualifying spouse) -> Part A premium ${prem:,.0f}/month", None)
    pct = 0
    if prem > 0 and int(f.get("part_a_months_late", 0)) >= 12:
        pct = int(params.use("federal.cms.part_a_late_penalty_percent", as_of, det).value)
        years = int(f["part_a_months_late"]) // 12
        det.amounts["part_a_penalty_months_payable"] = float(years * 2 * 12)
        det.note("T65-FED-PART-A-PENALTY", f"premium Part A {years} full year(s) late -> 10% for {years * 2} years", False)
        prem = float(round(prem * (1 + pct / 100.0)))
    det.amounts["part_a_penalty_percent"] = float(pct)
    det.amounts["part_a_premium_monthly"] = prem
    if prem > 0:
        det.links.append("msp:check_qmb_part_a")


def part_d_penalty(uncovered_months: int, as_of: date, det: Determination | None = None) -> float:
    """1% of the national base beneficiary premium per uncovered month, rounded to 10 cents."""
    pct = float(params.use("federal.cms.part_d_late_penalty_percent_per_month", as_of, det).value)
    base = float(params.use("federal.cms.part_d_base_beneficiary_premium", as_of, det).value)
    return round_dime(base * pct / 100.0 * uncovered_months)


def part_d(hh: Household, as_of: date, det: Determination) -> None:
    p = hh.applicant
    f = p.facts
    if "part_d_uncovered_months" in f:
        n = int(f["part_d_uncovered_months"])
        gap = f.get("part_d_gap_days")
        min_gap = int(params.use("federal.cms.part_d_creditable_gap_days", as_of, det).value)
        if p.receives("extra_help") or p.benefits & {"qmb", "slmb", "qi", "medicaid"}:
            amt = 0.0
            det.note("T65-FED-PART-D-PENALTY-EXTRA-HELP", "Extra Help (including deemed through Medicaid or an MSP): no Part D late penalty", None)
        elif gap is not None and int(gap) < min_gap:
            amt = 0.0
            det.note("T65-FED-PART-D-PENALTY", f"gap of {gap} days is under {min_gap}: no penalty", None)
        else:
            amt = part_d_penalty(n, as_of, det)
            det.note("T65-FED-PART-D-PENALTY", f"{n} uncovered months x 1% x national base premium -> ${amt:.2f}/month", None if amt == 0 else False)
        det.amounts["part_d_penalty_monthly"] = amt
    if f.get("magi_two_years_prior") is not None:
        status = f.get("filing_status", "single")
        d = irmaa("federal.cms.part_d_irmaa_monthly", float(f["magi_two_years_prior"]), status, as_of, det)
        det.amounts["part_d_irmaa_monthly"] = d
        det.note("T65-FED-IRMAA-PART-D", f"Part D IRMAA ${d:.2f}", None)


# ---------------------------------------------------------- who pays first
def who_pays_first(employer_size: int | None, active_or_retiree: str, basis: str, as_of: date,
                   det: Determination | None = None, esrd_month: int | None = None) -> str:
    """'medicare' or 'other' (the group plan / COBRA pays first)."""
    if basis == "esrd":
        months = int(params.use("federal.cms.esrd_coordination_months", as_of, det).value)
        if active_or_retiree in ("current_employment", "retiree", "cobra") and esrd_month is not None and esrd_month <= months:
            return "other"
        return "medicare"
    if active_or_retiree != "current_employment":
        return "medicare"
    if basis == "disability":
        lghp = int(params.use("federal.cms.msp_disability_lghp_size", as_of, det).value)
        return "other" if (employer_size or 0) >= lghp else "medicare"
    size = int(params.use("federal.cms.msp_working_aged_employer_size", as_of, det).value)
    return "other" if (employer_size or 0) >= size else "medicare"


def coordination(hh: Household, as_of: date, det: Determination) -> None:
    p = hh.applicant
    g = _ghp(p)
    if not g or g.get("basis", "none") == "none":
        return
    basis = p.facts.get("medicare_basis", "age")
    kind = g.get("basis")
    active = kind
    if kind == "current_employment" and g.get("last_month") and mi(_d(g["last_month"])) < mi(as_of):
        return  # the employment-based coverage has ended; no other coverage to coordinate with
    payer = who_pays_first(g.get("employer_size"), active, basis, as_of, det, g.get("esrd_month"))
    det.amounts["medicare_primary"] = 1.0 if payer == "medicare" else 0.0
    if basis == "esrd":
        rid = "T65-FED-COB-ESRD"
    elif active == "retiree":
        rid = "T65-FED-COB-RETIREE"
    elif active == "cobra":
        rid = "T65-FED-COB-COBRA"
    elif basis == "disability":
        rid = "T65-FED-COB-DISABILITY"
    elif payer == "other":
        rid = "T65-FED-COB-WORKING-AGED"
    else:
        rid = "T65-FED-COB-SMALL-EMPLOYER"
    det.note(rid, f"{kind} coverage (employer size {g.get('employer_size')}), basis {basis}: "
             + ("Medicare pays first" if payer == "medicare" else "the group plan pays first, Medicare second"), None)
    if active == "retiree":
        det.note("T65-FED-RETIREE-NEEDS-B",
                 "retiree coverage pays after Medicare and may not pay full benefits without Part B; check the plan", None)


# ------------------------------------------------------------------ Medigap
def medigap_federal(hh: Household, as_of: date, det: Determination) -> bool:
    """Federal Medigap guaranteed-issue status on ``as_of`` (OEP or a 63-day GI right)."""
    p = hh.applicant
    m = p.facts.get("medigap") or {}
    b_start = _d(m.get("part_b_start"))
    birth = _d(p.facts.get("birth_date"))
    gi = False
    if b_start is not None and birth is not None:
        # 65 "as of the first day" of a month: the birthday month if born on the 1st or 2nd
        # (age is attained the day before the birthday), otherwise the following month.
        bmonth = (birth.year + 65) * 12 + birth.month - 1
        first_day_65 = bmonth if birth.day <= 2 else bmonth + 1
        first65 = max(mi(b_start), first_day_65)
        months = int(params.use("federal.cms.medigap_oep_months", as_of, det).value)
        if first65 <= mi(as_of) < first65 + months:
            gi = True
            det.note("T65-FED-MEDIGAP-OEP",
                     f"federal 6-month Medigap open enrollment {from_mi(first65):%B %Y} - {from_mi(first65 + months - 1):%B %Y} is open", True)
        else:
            det.note("T65-FED-MEDIGAP-OEP",
                     f"federal Medigap open enrollment ran {from_mi(first65):%B %Y} - {from_mi(first65 + months - 1):%B %Y}", False)
    ev, ev_date = m.get("gi_event"), _d(m.get("gi_event_date"))
    if ev and ev_date:
        days = int(params.use("federal.cms.medigap_gi_days", as_of, det).value)
        if ev_date <= as_of <= ev_date + timedelta(days=days):
            gi = True
            det.note("T65-FED-MEDIGAP-GI-EMPLOYER-PLAN-ENDS" if ev == "employer_plan_ended" else "T65-FED-MEDIGAP-GI",
                     f"guaranteed-issue right ({ev}) within {days} days of {ev_date}", True)
    if not gi:
        det.note("T65-FED-MEDIGAP-UNDERWRITING", "no federal Medigap guaranteed-issue right on this date; insurers may underwrite", None)
    det.amounts["medigap_guaranteed_issue_now"] = 1.0 if gi else 0.0
    return gi


def birthday_window(birth: date, as_of: date, days: int) -> bool:
    """True when as_of falls in the window that starts on this year's (or last year's) birthday."""
    for y in (as_of.year, as_of.year - 1):
        try:
            b = date(y, birth.month, birth.day)
        except ValueError:
            b = date(y, 2, 28)
        if b <= as_of < b + timedelta(days=days):
            return True
    return False


# ------------------------------------------------------------------ links
def links(hh: Household, as_of: date, det: Determination) -> None:
    p = hh.applicant
    if p.facts.get("medicare_basis") == "disability" or p.receives("ssdi"):
        det.links.append("disability:medicare_after_24_months_ssdi")
        if p.age < 65:
            det.note("T65-FED-AGE65-NEW-IEP",
                     "a person on Medicare because of disability gets a new IEP at 65 and any Part B surcharge ends at 65", None)
    if (p.facts.get("medicaid_loss") or p.receives("medicaid")):
        det.links.append("medicaid:dual_eligibility_or_loss_sep")


def evaluate_core(hh: Household, as_of: date, det: Determination) -> Determination:
    enrollment_window(hh, as_of, det)
    if det.status != UNDETERMINED:
        part_b_premium(hh, as_of, det)
    part_a(hh, as_of, det)
    part_d(hh, as_of, det)
    coordination(hh, as_of, det)
    links(hh, as_of, det)
    return det


def evaluate(hh: Household, state: str, as_of: date) -> Determination:
    """Entry point: evaluate the Turning 65 playbook for ``state``."""
    from rulesarchive.dispatch import evaluate_state

    return evaluate_state(PROGRAM, hh, state, as_of)
