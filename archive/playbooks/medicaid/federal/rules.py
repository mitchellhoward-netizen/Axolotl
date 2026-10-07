"""Medicaid (enrollment and renewal) — federal base logic.

Building blocks the state parts call with their own parameters:

- MAGI household, MAGI income and the MAGI group a person falls in
  (parent/caretaker, pregnant, adult expansion group) — 42 CFR 435.603,
  435.110, 435.116, 435.119;
- SSI-style countable income and countable resources for the
  age/blind/disabled (non-MAGI) route — 42 CFR 435.601-602 (methodology
  borrowed from SSI, 42 U.S.C. 1382a);
- the timing rules changed by Public Law 119-21: retroactive months
  (sec. 71112), renewal interval (sec. 71107), community engagement
  (sec. 71119), and federal funding by immigration status (sec. 71109).

Long-term care Medicaid (nursing home and HCBS institutional rules) is the
``ltc_medicaid`` playbook; a household with ``facts.seeking_ltc`` is handed
over with a link instead of being evaluated here.

Household facts read by this playbook
-------------------------------------
Household.facts:
  applicant              id of the person the question is about (default: first member)
  application_date       ISO date the Medicaid application was (or will be) filed;
                         drives retroactive months and the renewal interval
  magi_household_size    override for the MAGI household size (tax-household cases
                         this simple model cannot build)
  pays_part_b_premium    (CA) whether the applicant pays the Part B premium; default
                         = applicant has Part B and no MSP
  health_insurance_premiums_monthly  (CA) premiums deducted in a Medically Needy budget
Person.facts:
  immigration_status     citizen | lpr | refugee_asylee | parolee | cuban_haitian | cofa |
                         other_lawfully_present | undocumented  (default: citizen when
                         Person.citizen_or_qualified is true, else undocumented)
  lpr_five_year_bar_met  for lpr: has met (or is exempt from) the 5-year bar (default true)
  expected_children      for a pregnant person: number of expected children (default 1)
  required_to_file       a child/tax dependent whose income counts (435.603(d)(2))
  tax_dependent          a non-spouse, non-child member counted in the MAGI household
  retirement_in_payout   receiving periodic payments from a retirement fund (not a resource)
  community_engagement_hours  monthly hours of work, service, work program or school
  medically_frail, american_indian, snap_work_compliant, in_treatment_program,
  veteran_total_disability, recently_incarcerated   community engagement exclusions
  seeking_ltc            wants nursing-home or institutional long-term care
  full_scope_before_2026 (CA) enrolled in full-scope Medi-Cal before January 1, 2026
  parole_one_year_or_more (CA) for a parolee: paroled into the U.S. for at least one year
                         (a qualified non-citizen; shorter paroles are not)
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from rulesarchive import params
from rulesarchive.determination import ELIGIBLE, INELIGIBLE, UNDETERMINED, Determination
from rulesarchive.household import EARNED_KINDS, Household, Person

PROGRAM = "medicaid"

# MAGI follows the tax definition (IRC 36B(d)(2)(B)): wages, self-employment,
# all Social Security benefits, pensions, unemployment, interest, dividends,
# rental and other taxable income. Not counted: SSI, state supplements, TANF,
# child support received, veterans' benefits, workers' compensation.
MAGI_COUNTED = {"earned", "self_employment", "social_security", "pension", "railroad_retirement",
                "unemployment", "alimony", "interest", "dividends", "rental", "other_unearned"}
# Needs-based assistance not counted in SSI-style budgets.
NON_MAGI_NOT_COUNTED = {"ssi", "ssp", "tanf"}
# Assets never counted in the age/blind/disabled budgets of the three states.
EXEMPT_ASSETS = {"home", "vehicle", "burial_space"}

FFP_STATUSES_BEFORE = {"citizen", "lpr", "refugee_asylee", "cuban_haitian", "cofa"}
FFP_STATUSES_FROM_2026_10 = {"citizen", "lpr", "cuban_haitian", "cofa"}


# ------------------------------------------------------------------ people
def has_medicare(p: Person) -> bool:
    return bool(p.medicare_part_a or p.medicare_part_b)


def is_dependent_child(p: Person) -> bool:
    """42 CFR 435.4: under 18, or 18 and a full-time secondary student (state option)."""
    return p.relationship == "child" and (p.age < 18 or (p.age == 18 and p.student))


def is_parent_caretaker(hh: Household) -> bool:
    return any(is_dependent_child(m) for m in hh.members if m is not hh.applicant)


def aged_blind_disabled(p: Person) -> bool:
    return p.age >= 65 or p.blind or p.disabled


def immigration_status(p: Person) -> str:
    return p.facts.get("immigration_status") or ("citizen" if p.citizen_or_qualified else "undocumented")


# -------------------------------------------------------------------- MAGI
@dataclass
class Magi:
    members: list[Person]
    size: int
    income: float


def magi_household(hh: Household, det: Determination) -> Magi:
    """Applicant, spouse, the applicant's children and declared tax dependents (435.603(f)).

    A pregnant member counts as herself plus the expected children (435.603(b)).
    Income of a child or tax dependent who is not required to file is not
    counted (435.603(d)(2)).
    """
    a = hh.applicant
    members = [m for m in hh.members
               if m is a or m.relationship in ("spouse", "child") or m.facts.get("tax_dependent")]
    size = len(members) + sum(int(m.facts.get("expected_children", 1)) for m in members if m.pregnant)
    if "magi_household_size" in hh.facts:
        size = int(hh.facts["magi_household_size"])
    ids = {m.id for m in members}
    income = 0.0
    for i in hh.incomes:
        if i.kind not in MAGI_COUNTED:
            continue
        if i.owner is None:
            income += i.monthly
            continue
        if i.owner not in ids:
            continue
        owner = hh.person(i.owner)
        if owner is not a and (owner.relationship == "child" or owner.facts.get("tax_dependent")) \
                and not owner.facts.get("required_to_file"):
            continue
        income += i.monthly
    income = round(income, 2)
    det.note("MCD-FED-MAGI-HOUSEHOLD",
             f"MAGI household of {size}; MAGI-based household income ${income:,.2f}/mo "
             "(SSI, child support, VA benefits and workers' comp not counted)", None)
    det.amounts["magi_income_monthly"] = income
    return Magi(members, size, income)


def table_value(pv: params.ParamValue, size: int) -> float:
    """Look up a household-size table, extending with the 'additional' increment."""
    v = pv.value
    keys = sorted(int(k) for k in v if str(k).isdigit())
    if size in keys or str(size) in v:
        return float(pv[size])
    top = max(keys)
    if size > top and "additional" in v:
        return float(pv[top]) + (size - top) * float(v["additional"])
    raise params.ParameterError(f"{pv.pid} has no value for household size {size}")


def magi_test(hh: Household, as_of: date, det: Determination, limits: dict[str, str],
              rules: dict[str, str]) -> str | None:
    """Try the MAGI groups in federal order; return the group the person qualifies in.

    ``limits`` maps a group (pregnant, parent, parent_medicare, adult) to the
    state's income-limit parameter; ``rules`` maps a group to the rule ID that
    states the test. Groups a state does not list are skipped. The adult group
    is only for people 19-64 who are not pregnant and have no Medicare
    (435.119(b)); parents are tested first because the adult group is only for
    people not otherwise eligible for a mandatory group (435.119(b)(4)).
    """
    a = hh.applicant
    magi = magi_household(hh, det)
    candidates: list[str] = []
    if a.pregnant and "pregnant" in limits:
        candidates.append("pregnant")
    if is_parent_caretaker(hh):
        if not has_medicare(a) and "parent" in limits:
            candidates.append("parent")
        elif has_medicare(a) and "parent_medicare" in limits:
            candidates.append("parent_medicare")
    if 19 <= a.age < 65 and not a.pregnant and not has_medicare(a) and "adult" in limits:
        candidates.append("adult")
    if not candidates:
        why = ("has Medicare" if has_medicare(a) else f"is {a.age}") if (a.age >= 65 or has_medicare(a)) \
            else "is not in a MAGI group this archive models"
        det.note("MCD-FED-ADULT-GROUP", f"no MAGI group: the applicant {why}", None)
        return None
    for g in candidates:
        limit = table_value(params.use(limits[g], as_of, det), magi.size)
        ok = magi.income <= limit
        det.note(rules[g], f"{g}: MAGI income ${magi.income:,.2f} vs limit ${limit:,.0f} for {magi.size}", ok)
        if ok:
            return {"parent_medicare": "parent_caretaker", "parent": "parent_caretaker",
                    "adult": "adult_expansion", "pregnant": "pregnant"}[g]
    return None


# ---------------------------------------------------------------- non-MAGI
@dataclass
class Budget:
    owners: set[str]
    size: int
    unearned: float
    earned: float
    countable: float


def budget_unit(hh: Household) -> set[str]:
    ids = {hh.applicant.id}
    if hh.spouse is not None:
        ids.add(hh.spouse.id)
    return ids


def ssi_style_countable(hh: Household, as_of: date, det: Determination, general_pid: str, rule_id: str,
                        owners: set[str] | None = None, earned_disregard: bool = True) -> Budget:
    """SSI-style countable income (MCD-FED-NONMAGI-METHOD).

    One general disregard per budget (``general_pid``), from unearned income
    first; then $65 and one-half of the remaining earned income. SSI, state
    supplements and TANF are not counted. Written for Medicaid rather than
    reusing ``playbooks/msp/federal/rules.py:countable_income``, because that
    function also applies the MSP-only COLA transition-month rule
    (42 U.S.C. 1396d(p)(2)(D)), which does not apply to Medicaid.
    """
    owners = owners or budget_unit(hh)
    unearned = sum(i.monthly for i in hh.incomes
                   if i.owner in owners and i.kind not in EARNED_KINDS and i.kind not in NON_MAGI_NOT_COUNTED)
    earned = sum(i.monthly for i in hh.incomes if i.owner in owners and i.kind in EARNED_KINDS)
    gd = float(params.use(general_pid, as_of, det).value)
    unearned_after = max(0.0, unearned - gd)
    gd_left = max(0.0, gd - unearned)
    if earned_disregard:
        ed = float(params.use("federal.ssi.earned_income_exclusion_monthly", as_of, det).value)
        earned_after = max(0.0, earned - gd_left - ed) / 2.0
    else:
        ed = 0.0
        earned_after = max(0.0, earned - gd_left)
    countable = round(unearned_after + earned_after, 2)
    size = 2 if len(owners) == 2 else 1
    det.note(rule_id, f"countable income ${countable:,.2f}/mo = unearned ${unearned:,.2f} - ${gd:.0f}"
             + (f" + (earned ${earned:,.2f} - ${gd_left:.0f} - ${ed:.0f}) / 2" if earned and earned_disregard else
                (f" + earned ${earned:,.2f}" if earned else "")) + f"; budget size {size}", None)
    det.amounts["countable_income_monthly"] = countable
    return Budget(owners, size, unearned, earned, countable)


def countable_resources(hh: Household, owners: set[str], det: Determination, rule_id: str) -> float:
    """Countable resources: everything except the home, one vehicle and burial spaces;
    retirement funds in periodic payout status are not resources (MCD-FED-RESOURCES-METHOD)."""
    total = 0.0
    vehicles = 0
    for a in hh.assets:
        if a.owner not in owners and not (a.owner is None and hh.applicant.id in owners):
            continue
        if a.kind == "vehicle":
            vehicles += 1
            if vehicles == 1:
                continue
        elif a.kind in EXEMPT_ASSETS:
            continue
        if a.kind == "retirement" and a.owner and hh.person(a.owner).facts.get("retirement_in_payout"):
            continue
        total += a.value
    det.note(rule_id, f"countable resources ${total:,.0f} (home, one vehicle, burial spaces and retirement "
             "funds in payout excluded)", None)
    det.amounts["countable_resources"] = total
    return total


# ----------------------------------------------------------- timing rules
def _as_date(v) -> date | None:
    if v is None or isinstance(v, date):
        return v
    return date.fromisoformat(str(v))


def application_date(hh: Household) -> date | None:
    return _as_date(hh.facts.get("application_date"))


def retroactive_months(hh: Household, tier: str | None, det: Determination,
                       rule_id: str = "MCD-FED-RETRO-2027") -> None:
    """Retroactive months available for the application (P.L. 119-21 sec. 71112)."""
    app = application_date(hh)
    if app is None or det.status != ELIGIBLE:
        return
    key = "adult_expansion" if tier == "adult_expansion" else "other"
    n = params.use("federal.medicaid.retroactive_months", app, det)[key]
    rid = rule_id if app >= date(2027, 1, 1) else "MCD-FED-RETRO-3-MONTHS"
    det.note(rid, f"application dated {app}: up to {n} retroactive month(s) for the {key.replace('_', ' ')} group", None)
    det.amounts["retroactive_months"] = float(n)


def renewal_interval(hh: Household, tier: str | None, det: Determination) -> None:
    """Months until the next renewal for a new approval (P.L. 119-21 sec. 71107; 435.916)."""
    app = application_date(hh)
    if app is None or det.status != ELIGIBLE:
        return
    key = "adult_expansion" if tier == "adult_expansion" else "other"
    n = params.use("federal.medicaid.renewal_interval_months", app, det)[key]
    det.note("MCD-FED-RENEWAL-6-MONTHS" if (key == "adult_expansion" and n == 6) else "MCD-FED-RENEWAL-12-MONTHS",
             f"renewal every {n} months for this group (date used: {app})", None)
    det.amounts["renewal_interval_months"] = float(n)


def community_engagement(hh: Household, as_of: date, det: Determination, start: date | None = None) -> bool:
    """Community engagement for the adult expansion group (P.L. 119-21 sec. 71119; 42 CFR 435.550-563).

    Returns False only when the requirement applies, no exclusion or
    exception applies, and neither 80 hours nor 80 x minimum wage of income is
    shown for the month. ``start`` lets a state with a later (exemption) or
    earlier date override the federal date.
    """
    start = start or _as_date(params.use("federal.medicaid.community_engagement_start", as_of, det).value)
    if as_of < start:
        return True
    a = hh.applicant
    f = a.facts
    child_max = params.use("federal.medicaid.community_engagement_parent_child_age_max", as_of, det).value
    young_child = any(m.relationship == "child" and m.age <= child_max for m in hh.members if m is not a)
    disabled_member = any(m.disabled for m in hh.members if m is not a)
    reasons = [
        (a.pregnant, "pregnant"),
        (has_medicare(a), "has Medicare"),
        (a.disabled or a.blind or f.get("medically_frail"), "medically frail, blind or disabled"),
        (young_child, f"parent/caretaker of a child {child_max} or under"),
        (disabled_member, "caregiver of a disabled household member"),
        (f.get("american_indian"), "American Indian or Alaska Native"),
        (f.get("snap_work_compliant"), "meets SNAP/TANF work rules"),
        (f.get("in_treatment_program"), "in a drug or alcohol treatment program"),
        (f.get("veteran_total_disability"), "veteran with a total disability rating"),
        (f.get("recently_incarcerated"), "incarcerated in the last 3 months"),
    ]
    for cond, why in reasons:
        if cond:
            det.note("MCD-FED-CE-EXCLUSIONS", f"community engagement does not apply: {why}", True)
            return True
    hours_needed = params.use("federal.medicaid.community_engagement_hours_monthly", as_of, det).value
    wage = float(params.use("federal.dol.flsa_minimum_wage_hourly", as_of, det).value)
    inc_hours = params.use("federal.medicaid.community_engagement_income_hours", as_of, det).value
    income_needed = round(wage * inc_hours, 2)
    own_income = sum(i.monthly for i in hh.incomes if i.owner == a.id and i.kind in MAGI_COUNTED)
    hours = float(f.get("community_engagement_hours", 0))
    ok = hours >= hours_needed or own_income >= income_needed
    det.note("MCD-FED-COMMUNITY-ENGAGEMENT",
             f"{hours:.0f} hours (need {hours_needed}) or own income ${own_income:,.2f} (need ${income_needed:,.2f})", ok)
    return ok


def ffp_immigration(p: Person, as_of: date, det: Determination) -> bool | None:
    """Whether federal Medicaid payment is available for this person's status (sec. 71109).

    None = status this archive cannot classify (e.g. parolee before October 2026).
    """
    start = _as_date(params.use("federal.medicaid.alien_ffp_restriction_start", as_of, det).value)
    status = immigration_status(p)
    if status == "lpr" and not p.facts.get("lpr_five_year_bar_met", True):
        det.note("MCD-FED-IMMIGRANT-2026", "LPR still within the 5-year bar: no federal Medicaid (full scope)", False)
        return False
    allowed = FFP_STATUSES_FROM_2026_10 if as_of >= start else FFP_STATUSES_BEFORE
    if status in allowed:
        return True
    if status == "undocumented" or as_of >= start:
        det.note("MCD-FED-IMMIGRANT-2026",
                 f"status {status}: no federal Medicaid payment for full coverage"
                 + (" from October 1, 2026" if as_of >= start and status != "undocumented" else ""), False)
        return False
    det.note("MCD-FED-IMMIGRANT-2026", f"status {status} before October 1, 2026 is not classified in this archive", None)
    return None


def ltc_handoff(hh: Household, det: Determination) -> bool:
    """People asking for nursing-home/institutional care go to the ltc_medicaid playbook."""
    if hh.applicant.facts.get("seeking_ltc"):
        det.status = UNDETERMINED
        det.links.append("ltc_medicaid:evaluate")
        det.note("MCD-FED-LTC-HANDOFF", "long-term care Medicaid is evaluated by the ltc_medicaid playbook", None)
        return True
    return False


def ssi_recipient_1634(hh: Household, det: Determination, rule_id: str) -> bool:
    """In a 1634 state (NY, CA) an SSI recipient gets Medicaid from the SSI award (MCD-FED-SSI-1634)."""
    if hh.applicant.receives("ssi"):
        det.status, det.tier = ELIGIBLE, "ssi_recipient"
        det.note(rule_id, "receives SSI: Medicaid follows from the SSI award (1634 state); no income or resource test", True)
        det.links.append("disability:ssi_medicaid")
        return True
    return False


def finish(hh: Household, det: Determination) -> Determination:
    """Common end steps: retroactive months and renewal interval for approvals."""
    retroactive_months(hh, det.tier, det)
    renewal_interval(hh, det.tier, det)
    return det


def federal_adult_minimum(hh: Household, as_of: date) -> Determination:
    """Federal-minimum adult-group test only (133% + 5 points of the HHS guideline / 12).

    Used by the PolicyEngine cross-check to separate the shared MAGI logic
    from each state's published (rounded) tables.
    """
    det = Determination(PROGRAM, hh.state, as_of)
    a = hh.applicant
    if not (19 <= a.age < 65 and not a.pregnant and not has_medicare(a)):
        det.status = INELIGIBLE
        det.note("MCD-FED-ADULT-GROUP", "not in the adult group age/Medicare/pregnancy conditions", False)
        return det
    magi = magi_household(hh, det)
    fpl = table_value(params.use("federal.hhs.poverty_guideline_annual", as_of, det), magi.size) / 12.0
    pct = params.use("federal.medicaid.adult_group_fpl_percent", as_of, det).value + \
        params.use("federal.medicaid.magi_disregard_fpl_points", as_of, det).value
    limit = fpl * pct / 100.0
    ok = magi.income <= limit
    det.status = ELIGIBLE if ok else INELIGIBLE
    det.tier = "adult_expansion" if ok else None
    det.note("MCD-FED-ADULT-GROUP", f"MAGI ${magi.income:,.2f} vs {pct}% FPL ${limit:,.2f}", ok)
    return det


def evaluate(hh: Household, state: str, as_of: date) -> Determination:
    """Entry point: evaluate Medicaid for ``state``."""
    from rulesarchive.dispatch import evaluate_state

    return evaluate_state(PROGRAM, hh, state, as_of)
