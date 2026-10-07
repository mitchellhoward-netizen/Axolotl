"""Disability playbook (SSI and Social Security disability) — federal base logic.

SSI is a federal program with the same financial rules in every state; the
state parts add their state supplement (New York SSP, California SSP,
Illinois AABD cash) on top of :func:`ssi_federal`. The Social Security
disability (SSDI) part is procedure-oriented: :func:`ssdi` applies the
substantial-gainful-activity (SGA) test to earnings, works out the waiting
period and Medicare dates, and leaves insured status and the medical decision
to the inputs (the archive cannot compute insured status without SSA's
earnings record, and the medical decision is the state DDS's).

Every decision is recorded on the Determination with the rule ID that made it.

Inputs used (beyond the core Household model)
--------------------------------------------
Household.facts
    claim                      "ssi" (default) or "ssdi" — which program the question is about
    living_arrangement         "own_household" (default) | "household_of_another"
                               (lives throughout the month in another person's household and
                               receives shelter from others there without paying a pro rata
                               share: the VTR applies) | "medical_facility" (Medicaid pays more
                               than half the cost of care)
    ism_shelter_value_monthly  value of shelter paid by someone else for a person living in
                               their own household (in-kind support and maintenance valued
                               under the PMV rule)
Person.facts
    life_insurance_face_value  total face value of life insurance on that person
    irwe_monthly               impairment-related work expenses paid by the person
    blind_work_expenses_monthly
    ssdi_insured               True/False from SSA's earnings record (insured status); None = unknown
    disability_onset           ISO date the person says disability began
    ssdi_application_date      ISO date the SSDI application was (or will be) filed
    ssdi_entitlement_start     ISO date (first of month) SSDI entitlement began, for Medicare timing
    birth_year                 for full retirement age; otherwise derived from age
    applies_for_ssi            False if a spouse who could be eligible is not applying (default True)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from rulesarchive import params
from rulesarchive.determination import ELIGIBLE, INELIGIBLE, UNDETERMINED, Determination
from rulesarchive.household import EARNED_KINDS, Household, Person

PROGRAM = "disability"

# Not income for SSI purposes when counting the recipient's own income
# (SSI itself and state supplements are not counted against SSI).
NOT_INCOME = {"ssi", "ssp"}
# Income based on need: counted, but the $20 general exclusion does not apply
# (SI 00810.420 A.2). TANF is the only IBON kind in the household vocabulary.
INCOME_BASED_ON_NEED = {"tanf"}
# Public income-maintenance payments are not deemed from a spouse or parent (SI 01320.100 B.2).
PIM = {"ssi", "ssp", "tanf"}
# Assets never counted as SSI resources in this model (home: SI 01130.100;
# burial spaces: SI 01130.400; household goods are not an asset kind here: SI 01130.430).
EXCLUDED_ASSET_KINDS = {"home", "burial_space"}


# ----------------------------------------------------------------- helpers
def _d(v) -> date | None:
    if v is None or isinstance(v, date):
        return v
    return date.fromisoformat(str(v))


def add_months(d: date, n: int) -> date:
    m = d.month - 1 + n
    return date(d.year + m // 12, m % 12 + 1, 1)


def spouse_of(hh: Household) -> Person | None:
    """The applicant's living-with spouse. A child applicant has no spouse here
    (Household.spouse would return a parent's spouse)."""
    if hh.applicant.relationship not in ("self", "spouse"):
        return None
    return hh.spouse


def fbr(as_of: date, det: Determination, size: int) -> float:
    return float(params.use("federal.ssa.ssi_federal_benefit_rate_monthly", as_of, det)[size])


def category(p: Person, as_of: date, det: Determination | None = None) -> str | None:
    """SSI category: aged, blind or disabled (DIS-FED-SSI-CATEGORY)."""
    aged = float(params.use("federal.ssi.aged_age", as_of, det).value)
    if p.age >= aged:
        return "aged"
    if p.blind:
        return "blind"
    if p.disabled:
        return "disabled"
    return None


def could_be_eligible(p: Person, as_of: date) -> bool:
    return category(p, as_of) is not None and p.citizen_or_qualified


def earned_of(hh: Household, pid: str) -> float:
    return sum(i.monthly for i in hh.incomes if (i.owner or hh.applicant.id) == pid and i.kind in EARNED_KINDS)


def unearned_of(hh: Household, pid: str, exclude: set[str]) -> tuple[float, float]:
    """(unearned income the $20 applies to, income based on need) for one person."""
    gen = ibon = 0.0
    for i in hh.incomes:
        if (i.owner or hh.applicant.id) != pid or i.kind in EARNED_KINDS or i.kind in exclude:
            continue
        if i.kind in INCOME_BASED_ON_NEED:
            ibon += i.monthly
        else:
            gen += i.monthly
    return gen, ibon


@dataclass
class Exclusions:
    """Monthly income of a budget unit before exclusions."""
    unearned: float = 0.0        # unearned income the $20 general exclusion applies to
    ibon: float = 0.0            # income based on need (no $20)
    earned: float = 0.0
    seie: float = 0.0            # student earned income exclusion available
    irwe: float = 0.0
    bwe: float = 0.0
    trace: list[str] = field(default_factory=list)


def apply_exclusions(x: Exclusions, as_of: date, det: Determination, rule_id: str, label: str) -> float:
    """SSI countable income (SI 00820.500 order): SEIE, unused $20, $65, IRWE, one-half, BWE.

    One $20 general exclusion and one $65 earned exclusion per budget unit
    (individual, couple, or individual with deemed spouse).
    """
    gd = float(params.use("federal.ssi.general_income_exclusion_monthly", as_of, det).value)
    ed = float(params.use("federal.ssi.earned_income_exclusion_monthly", as_of, det).value)
    unearned_after = max(0.0, x.unearned - gd)
    gd_left = max(0.0, gd - x.unearned)
    earned = max(0.0, x.earned - min(x.seie, x.earned))
    earned = max(0.0, earned - gd_left)
    earned = max(0.0, earned - ed)
    earned = max(0.0, earned - x.irwe)
    earned = earned / 2.0
    earned = max(0.0, earned - x.bwe)
    countable = round(unearned_after + x.ibon + earned, 2)
    parts = [f"unearned ${x.unearned:,.2f} - ${gd:.0f}"]
    if x.ibon:
        parts.append(f"income based on need ${x.ibon:,.2f} (no $20)")
    if x.earned:
        e = f"(earned ${x.earned:,.2f}"
        if x.seie:
            e += f" - SEIE up to ${x.seie:,.0f}"
        e += f" - unused ${gd_left:.0f} - ${ed:.0f}"
        if x.irwe:
            e += f" - IRWE ${x.irwe:,.2f}"
        e += ") / 2"
        if x.bwe:
            e += f" - BWE ${x.bwe:,.2f}"
        parts.append(e)
    det.note(rule_id, f"{label}: countable income ${countable:,.2f} = " + " + ".join(parts) + " " + " ".join(x.trace), None)
    return countable


def person_exclusions(hh: Household, p: Person, as_of: date, det: Determination) -> Exclusions:
    gen, ibon = unearned_of(hh, p.id, NOT_INCOME)
    x = Exclusions(unearned=gen, ibon=ibon, earned=earned_of(hh, p.id))
    if x.earned and p.student and p.age < 22 and (p.blind or p.disabled):
        x.seie = float(params.use("federal.ssi.student_earned_income_exclusion", as_of, det)["monthly"])
        det.note("DIS-FED-SSI-SEIE", f"{p.id} is a blind/disabled student under 22: earnings up to ${x.seie:,.0f}/mo excluded "
                 "(yearly cap not tracked)", None)
    if p.disabled and not p.blind:
        x.irwe = float(p.facts.get("irwe_monthly", 0) or 0)
    if p.blind:
        x.bwe = float(p.facts.get("blind_work_expenses_monthly", 0) or 0)
    return x


def merge(a: Exclusions, b: Exclusions) -> Exclusions:
    return Exclusions(a.unearned + b.unearned, a.ibon + b.ibon, a.earned + b.earned,
                      a.seie + b.seie, a.irwe + b.irwe, a.bwe + b.bwe, a.trace + b.trace)


# --------------------------------------------------------------- resources
def countable_resources(hh: Household, owners: set[str], as_of: date, det: Determination,
                        pension_excluded_for: set[str] = frozenset()) -> float:
    """SSI countable resources of ``owners`` (DIS-FED-SSI-RESOURCE-EXCLUSIONS).

    Excluded: the home and burial spaces regardless of value; one vehicle per
    household regardless of value; up to $1,500 of burial funds per person;
    life insurance when the face value on the insured person is $1,500 or
    less; an ineligible spouse's pension funds (IRA, work pensions).
    Household-level assets (owner None) count to the applicant's unit.
    """
    burial_cap = float(params.use("federal.ssi.burial_funds_exclusion", as_of, det).value)
    li_cap = float(params.use("federal.ssi.life_insurance_face_value_exclusion", as_of, det).value)
    total = 0.0
    excluded: list[str] = []
    vehicles = sorted((a for a in hh.assets if a.kind == "vehicle" and (a.owner in owners or a.owner is None)),
                      key=lambda a: -a.value)
    vehicle_free = vehicles[0] if vehicles else None
    burial_used: dict[str, float] = {}
    for a in hh.assets:
        owner = a.owner or hh.applicant.id
        if owner not in owners:
            continue
        if a.kind in EXCLUDED_ASSET_KINDS:
            excluded.append(f"{a.kind} ${a.value:,.0f}")
            continue
        if a is vehicle_free:
            excluded.append(f"one vehicle ${a.value:,.0f}")
            continue
        if a.kind == "burial_fund":
            room = max(0.0, burial_cap - burial_used.get(owner, 0.0))
            ex = min(room, a.value)
            burial_used[owner] = burial_used.get(owner, 0.0) + ex
            total += a.value - ex
            if ex:
                excluded.append(f"burial funds ${ex:,.0f}")
            continue
        if a.kind == "life_insurance_cash_value":
            fv = hh.person(owner).facts.get("life_insurance_face_value")
            if fv is not None and float(fv) <= li_cap:
                excluded.append(f"life insurance (face value ${float(fv):,.0f})")
                continue
        if a.kind == "retirement" and owner in pension_excluded_for:
            excluded.append(f"ineligible spouse's pension funds ${a.value:,.0f}")
            continue
        total += a.value
    if excluded:
        det.note("DIS-FED-SSI-RESOURCE-EXCLUSIONS", "excluded: " + ", ".join(excluded), None)
    return total


# ------------------------------------------------------------------- ISM
def living_arrangement(hh: Household) -> str:
    return hh.facts.get("living_arrangement", "own_household")


def ism_pmv(hh: Household, size: int, as_of: date, det: Determination) -> float:
    """ISM valued under the PMV rule (own household, shelter paid by others): unearned income."""
    v = float(hh.facts.get("ism_shelter_value_monthly", 0) or 0)
    if not v or living_arrangement(hh) != "own_household":
        return 0.0
    pmv = float(params.use("federal.ssi.pmv_monthly", as_of, det)[size])
    counted = min(v, pmv)
    det.note("DIS-FED-SSI-ISM-PMV", f"shelter support ${v:,.2f} counted as in-kind income at ${counted:,.2f} "
             f"(lesser of actual value and PMV ${pmv:,.2f}); food is not ISM since 9/30/2024", None)
    return counted


# ----------------------------------------------------------------- result
@dataclass
class SSIResult:
    eligible: bool | None = None
    unit: str = "individual"            # individual | couple | deemed_spouse | deemed_parent
    size: int = 1                        # FBR / state-standard size (2 for couple or couple-computation)
    fbr_full: float = 0.0                # FBR for the computation (before VTR)
    benefit_rate: float = 0.0            # FBR after the VTR, or $30 in a medical facility
    countable: float = 0.0               # countable income of the computation unit
    own_countable: float = 0.0           # applicant's own countable income (individual computation)
    federal_payment: float = 0.0
    vtr: float = 0.0                     # value of the one-third reduction applied (income value)
    reason: str = ""                     # why ineligible, for state parts
    excess_over_fbr: float = 0.0         # countable income above the FBR (state supplement tests)
    deeming_couple_countable: float | None = None
    state_payable: bool = True           # False if ineligible for a reason other than income


def _resource_test(hh: Household, owners: set[str], limit_size: int, as_of: date, det: Determination,
                   pension_excluded_for: set[str] = frozenset(), extra: float = 0.0, label: str = "") -> bool:
    limit = float(params.use("federal.ssa.ssi_resource_limit", as_of, det)[limit_size])
    res = countable_resources(hh, owners, as_of, det, pension_excluded_for) + extra
    ok = res <= limit
    det.note("DIS-FED-SSI-RESOURCES", f"countable resources ${res:,.2f}{label} vs limit ${limit:,.0f} "
             f"({'couple' if limit_size == 2 else 'individual'})", ok)
    return ok


def _parents_of_child(hh: Household) -> list[Person]:
    a = hh.applicant
    if a.age >= 18:
        return []
    if a.relationship == "child":
        return [m for m in hh.members if m.relationship in ("self", "spouse")]
    return [m for m in hh.members if m.relationship == "parent"]


def _ineligible_children(hh: Household, exclude: set[str]) -> list[Person]:
    return [m for m in hh.members if m.id not in exclude and (m.age < 18 or (m.student and m.age < 22))
            and m.relationship == "child" and not m.receives("ssi")]


def _child_allocations(hh: Household, children: list[Person], unearned: float, earned: float,
                       alloc_each: float, det: Determination, rule_id: str) -> tuple[float, float]:
    total = 0.0
    for c in children:
        own = sum(i.monthly for i in hh.incomes if i.owner == c.id and i.kind not in PIM)
        total += max(0.0, alloc_each - own)
    if total:
        take_u = min(unearned, total)
        unearned -= take_u
        earned = max(0.0, earned - (total - take_u))
        det.note(rule_id, f"allocation for {len(children)} ineligible child(ren): ${total:,.2f} "
                 f"(${alloc_each:,.2f} each, less the child's own income)", None)
    return unearned, earned


def ssi_federal(hh: Household, as_of: date, det: Determination) -> SSIResult:
    """Federal SSI eligibility and payment for the applicant (and eligible spouse).

    Covers: category (aged/blind/disabled), the SGA bar for new disabled
    applicants, citizenship flag, resources, income exclusions, ISM (VTR and
    PMV), couples, spouse-to-spouse deeming and parent-to-child deeming.
    Uses the household's stated monthly income as the budget month's income
    (DIS-FED-SSI-RETRO-BUDGETING).
    """
    r = SSIResult()
    a = hh.applicant
    cat = category(a, as_of, det)
    if cat is None:
        det.note("DIS-FED-SSI-CATEGORY", f"{a.id} is under 65 and not blind or disabled", False)
        r.eligible, r.reason, r.state_payable = False, "not aged, blind or disabled", False
        return r
    det.note("DIS-FED-SSI-CATEGORY", f"{a.id} qualifies by category: {cat}", True)
    if not a.citizen_or_qualified:
        det.note("DIS-FED-SSI-NONCITIZEN", "applicant does not meet SSI citizenship/qualified-alien rules", False)
        r.eligible, r.reason, r.state_payable = False, "immigration status", False
        return r
    sga = params.use("federal.ssa.sga_monthly", as_of, det)
    if cat == "disabled" and not a.receives("ssi"):
        gross = earned_of(hh, a.id) - float(a.facts.get("irwe_monthly", 0) or 0)
        if gross > float(sga["nonblind"]):
            det.note("DIS-FED-SSI-SGA-INITIAL", f"new disabled applicant earns ${gross:,.2f}/mo, above SGA "
                     f"${sga['nonblind']:,}: SSA will find the person not disabled", False)
            r.eligible, r.reason, r.state_payable = False, "substantial gainful activity", False
            return r

    det.note("DIS-FED-SSI-RETRO-BUDGETING", "income stated for the month is used as the budget month's income "
             "(SSA pays on income from two months earlier)", None)
    la = living_arrangement(hh)
    spouse = spouse_of(hh)
    parents = _parents_of_child(hh)

    # -------------------------------------------------- unit / deeming choice
    if spouse is not None and could_be_eligible(spouse, as_of) and spouse.facts.get("applies_for_ssi", True):
        r.unit, r.size = "couple", 2
    elif spouse is not None:
        r.unit = "deemed_spouse"
    elif parents:
        r.unit = "deemed_parent"
    det.note("DIS-FED-SSI-UNIT", {"individual": "eligible individual (no spouse in household)",
                                   "couple": "eligible couple: combined income against the couple FBR",
                                   "deemed_spouse": "eligible individual living with an ineligible spouse: deeming test",
                                   "deemed_parent": "child under 18 living with parent(s): parental deeming"}[r.unit], None)

    f1, f2 = fbr(as_of, det, 1), fbr(as_of, det, 2)

    # ---------------------------------------------------------- resources
    if r.unit == "couple":
        ok = _resource_test(hh, {a.id, spouse.id}, 2, as_of, det)
    elif r.unit == "deemed_spouse":
        ok = _resource_test(hh, {a.id, spouse.id}, 2, as_of, det, pension_excluded_for={spouse.id},
                            label=" (with ineligible spouse)")
        det.note("DIS-FED-SSI-DEEM-RESOURCES", "ineligible spouse's resources are counted; the couple limit applies", None)
    elif r.unit == "deemed_parent":
        p_ids = {p.id for p in parents}
        p_res = countable_resources(hh, p_ids, as_of, det)
        allow = float(params.use("federal.ssa.ssi_resource_limit", as_of, det)[2 if len(parents) == 2 else 1])
        deemed = max(0.0, p_res - allow)
        det.note("DIS-FED-SSI-DEEM-PARENT", f"parents' countable resources ${p_res:,.2f} above ${allow:,.0f} "
                 f"are deemed: ${deemed:,.2f}", None)
        ok = _resource_test(hh, {a.id}, 1, as_of, det, extra=deemed, label=" incl. deemed parental resources")
    else:
        ok = _resource_test(hh, {a.id}, 1, as_of, det)
    if not ok:
        r.eligible, r.reason, r.state_payable = False, "resources", False
        return r

    # --------------------------------------------------------- benefit rate
    def rate(size: int) -> tuple[float, float]:
        full = f2 if size == 2 else f1
        if la == "medical_facility":
            v = float(params.use("federal.ssi.medical_facility_payment_monthly", as_of, det)[size])
            det.note("DIS-FED-SSI-MEDICAL-FACILITY", f"Medicaid pays over half the cost of care: benefit rate ${v:,.0f}", None)
            return v, 0.0
        if la == "household_of_another":
            vtr = float(params.use("federal.ssi.vtr_monthly", as_of, det)[size])
            det.note("DIS-FED-SSI-VTR", f"lives in another person's household and receives shelter there: FBR "
                     f"${full:,.2f} reduced by one-third (VTR ${vtr:,.2f}); no exclusions apply to the VTR "
                     "and no other ISM is counted", None)
            return round(full - vtr, 2), vtr
        return full, 0.0

    me = person_exclusions(hh, a, as_of, det)

    # --------------------------------------------------------------- couple
    if r.unit == "couple":
        x = merge(me, person_exclusions(hh, spouse, as_of, det))
        x.unearned += ism_pmv(hh, 2, as_of, det)
        r.fbr_full = f2
        r.benefit_rate, r.vtr = rate(2)
        r.countable = apply_exclusions(x, as_of, det, "DIS-FED-SSI-COUPLE", "couple")
        r.own_countable = r.countable
    # -------------------------------------------------------- deemed spouse
    elif r.unit == "deemed_spouse":
        own = Exclusions(**{**me.__dict__, "trace": []})
        own.unearned += ism_pmv(hh, 1, as_of, det)
        r.own_countable = apply_exclusions(own, as_of, det, "DIS-FED-SSI-INCOME-EXCLUSIONS", "applicant alone")
        rate1, vtr1 = rate(1)
        if r.own_countable > rate1:
            det.note("DIS-FED-SSI-DEEM-SPOUSE", "applicant is ineligible on own income, so deeming does not apply", False)
            r.fbr_full, r.benefit_rate, r.vtr, r.countable = f1, rate1, vtr1, r.own_countable
        else:
            if spouse.receives("snap"):
                s_un = s_ea = 0.0
                det.note("DIS-FED-DEEM-SNAP-PIM", "ineligible spouse receives SNAP: SNAP is a public income-maintenance "
                         "payment since 9/30/2024, so the income used to compute it is not deemed", None)
            else:
                s_un, _ = unearned_of(hh, spouse.id, PIM)
                s_ea = earned_of(hh, spouse.id)
            kids = _ineligible_children(hh, {a.id, spouse.id})
            s_un, s_ea = _child_allocations(hh, kids, s_un, s_ea, f2 - f1, det, "DIS-FED-SSI-DEEM-SPOUSE")
            threshold = f2 - f1
            if s_un + s_ea <= threshold:
                det.note("DIS-FED-SSI-DEEM-SPOUSE", f"ineligible spouse's remaining income ${s_un + s_ea:,.2f} is not "
                         f"more than ${threshold:,.2f} (couple FBR minus individual FBR): nothing is deemed", None)
                r.fbr_full, r.benefit_rate, r.vtr, r.countable = f1, rate1, vtr1, r.own_countable
            else:
                x = merge(me, Exclusions(unearned=s_un, earned=s_ea))
                x.unearned += ism_pmv(hh, 1, as_of, det)
                cc = apply_exclusions(x, as_of, det, "DIS-FED-SSI-DEEM-SPOUSE", "applicant + deemed spouse income")
                rate2, vtr2 = rate(2)
                r.deeming_couple_countable = cc
                det.note("DIS-FED-SSI-DEEM-SPOUSE", f"spouse's remaining income ${s_un + s_ea:,.2f} exceeds ${threshold:,.2f}: "
                         f"couple computation ${rate2:,.2f} - ${cc:,.2f}; payment is the lower of that and the "
                         f"individual computation ${rate1:,.2f} - ${r.own_countable:,.2f}", None)
                if cc > rate2:
                    r.fbr_full, r.benefit_rate, r.vtr, r.countable = f2, rate2, vtr2, cc
                    r.size = 2
                else:
                    pay = min(rate2 - cc, rate1 - r.own_countable)
                    r.eligible = True
                    r.fbr_full, r.vtr = f1, vtr1
                    r.benefit_rate = rate1
                    r.countable = round(rate1 - pay, 2)
    # ------------------------------------------------------- deemed parent
    elif r.unit == "deemed_parent":
        p_un = p_ea = 0.0
        for p in parents:
            u, _ = unearned_of(hh, p.id, PIM)
            if p.receives("snap"):
                det.note("DIS-FED-DEEM-SNAP-PIM", f"parent {p.id} receives SNAP: income used for SNAP is not deemed", None)
                continue
            p_un += u
            p_ea += earned_of(hh, p.id)
        kids = _ineligible_children(hh, {a.id} | {p.id for p in parents})
        p_un, p_ea = _child_allocations(hh, kids, p_un, p_ea, f2 - f1, det, "DIS-FED-SSI-DEEM-PARENT")
        gd = float(params.use("federal.ssi.general_income_exclusion_monthly", as_of, det).value)
        ed = float(params.use("federal.ssi.earned_income_exclusion_monthly", as_of, det).value)
        un_after = max(0.0, p_un - gd)
        ea_after = max(0.0, p_ea - max(0.0, gd - p_un) - ed) / 2.0
        allowance = f2 if len(parents) == 2 else f1
        deemed = max(0.0, un_after + ea_after - allowance)
        det.note("DIS-FED-SSI-DEEM-PARENT", f"parental income after exclusions ${un_after + ea_after:,.2f} minus living "
                 f"allowance ${allowance:,.2f} = ${deemed:,.2f} deemed to the child as unearned income", None)
        x = Exclusions(**{**me.__dict__, "trace": []})
        x.unearned += deemed
        r.fbr_full = f1
        r.benefit_rate, r.vtr = rate(1)
        r.countable = apply_exclusions(x, as_of, det, "DIS-FED-SSI-INCOME-EXCLUSIONS", "child incl. deemed income")
        r.own_countable = r.countable
    # ----------------------------------------------------------- individual
    else:
        me.unearned += ism_pmv(hh, 1, as_of, det)
        r.fbr_full = f1
        r.benefit_rate, r.vtr = rate(1)
        r.countable = apply_exclusions(me, as_of, det, "DIS-FED-SSI-INCOME-EXCLUSIONS", "applicant")
        r.own_countable = r.countable

    if r.eligible is None:
        r.eligible = r.countable <= r.benefit_rate
    r.federal_payment = round(max(0.0, r.benefit_rate - r.countable), 2) if r.eligible else 0.0
    r.excess_over_fbr = round(max(0.0, r.countable - r.benefit_rate), 2)
    if not r.eligible:
        r.reason = "income"
    det.note("DIS-FED-SSI-PAYMENT", f"benefit rate ${r.benefit_rate:,.2f} - countable income ${r.countable:,.2f} = "
             f"federal SSI ${r.federal_payment:,.2f}" + ("" if r.eligible else " (countable income exceeds the rate: no federal SSI)"),
             r.eligible)
    if r.eligible and r.federal_payment == 0:
        det.note("DIS-FED-SSI-BREAKEVEN", "countable income equals the benefit rate: eligible under the income test "
                 "but no federal payment", None)
        det.unresolved("DIS-FED-OQ-01")
    return r


def set_amounts(det: Determination, r: SSIResult, ssp: float | None) -> None:
    """Record amounts and final status. ``ssp`` None = state supplement not determinable."""
    det.amounts["ssi_federal_monthly"] = round(r.federal_payment, 2)
    if ssp is None:
        det.status = ELIGIBLE if r.eligible and r.federal_payment > 0 else UNDETERMINED
        det.tier = "SSI" if det.status == ELIGIBLE else None
        return
    det.amounts["state_supplement_monthly"] = round(ssp, 2)
    det.amounts["total_monthly"] = round(r.federal_payment + ssp, 2)
    if r.eligible:
        det.status, det.tier = ELIGIBLE, "SSI"
    elif ssp > 0:
        det.status, det.tier = ELIGIBLE, "STATE_SUPPLEMENT_ONLY"
    else:
        det.status, det.tier = INELIGIBLE, None


def link_common(det: Determination, r: SSIResult) -> None:
    """Cross-playbook effects of SSI receipt that are the same in every state."""
    if det.status == ELIGIBLE and det.tier == "SSI" and r.federal_payment > 0:
        det.links.append("msp:extra_help_deemed")
        det.note("DIS-FED-SSI-EXTRA-HELP", "SSI recipients are deemed eligible for Extra Help (Part D LIS)", None)
        det.links.append("snap:categorically_eligible_if_all_members_ssi")


# -------------------------------------------------------------------- SSDI
def full_retirement_age(p: Person, as_of: date, det: Determination) -> float:
    by = p.facts.get("birth_year") or (as_of.year - p.age)
    fra = params.use("federal.ssa.full_retirement_age_years", as_of, det)
    by = int(by)
    if by <= 1954:
        return float(fra["1943-1954"])
    if by >= 1960:
        return float(fra["1960+"])
    return float(fra[str(by)])


def ssdi(hh: Household, as_of: date, det: Determination, dds_name: str) -> Determination:
    """Procedure-oriented SSDI evaluation (DIS-FED-SSDI-*).

    The archive applies the SGA test to earnings and computes the waiting
    period and Medicare dates. Insured status is an input (SSA earnings
    record); the medical decision is the state DDS's and is an input too
    (Person.disabled = the DDS found the person disabled).
    """
    a = hh.applicant
    det.tier = None
    fra = full_retirement_age(a, as_of, det)
    if a.age >= fra:
        if a.receives("ssdi"):
            det.note("DIS-FED-SSDI-FRA-CONVERSION", f"at full retirement age ({fra:g}) SSDI converts automatically to "
                     "retirement benefits; no application is needed and the amount does not change", None)
            det.status, det.tier = ELIGIBLE, "RETIREMENT_AFTER_CONVERSION"
        else:
            det.note("DIS-FED-SSDI-FRA-CONVERSION", f"applicant is at or over full retirement age ({fra:g}): "
                     "disability benefits are not payable from that age; file for retirement benefits", False)
            det.status = INELIGIBLE
        det.links.append("turning_65:ssdi_to_retirement")
        return det

    sga = params.use("federal.ssa.sga_monthly", as_of, det)
    limit = float(sga["blind"] if a.blind else sga["nonblind"])
    earnings = earned_of(hh, a.id) - float(a.facts.get("irwe_monthly", 0) or 0)

    if a.receives("ssdi"):
        twp = float(params.use("federal.ssa.twp_service_month_monthly", as_of, det).value)
        months = int(params.use("federal.ssa.twp_months", as_of, det).value)
        det.note("DIS-FED-SSDI-TWP", f"current beneficiary earning ${earnings:,.2f}/mo: "
                 + (f"above ${twp:,.0f}, a trial work period service month ({months} allowed); benefits continue"
                    if earnings > twp else f"not above ${twp:,.0f}, not a trial work period month"), None)
        det.status, det.tier = ELIGIBLE, "SSDI"
        _medicare_dates(hh, as_of, det)
        return det

    if earnings > limit:
        det.note("DIS-FED-SSDI-SGA", f"earnings ${earnings:,.2f}/mo are above the {'blind' if a.blind else 'non-blind'} "
                 f"SGA amount ${limit:,.0f}: SSA finds a person working at SGA not disabled", False)
        det.status = INELIGIBLE
        return det
    det.note("DIS-FED-SSDI-SGA", f"earnings ${earnings:,.2f}/mo are not above SGA ${limit:,.0f}", True)

    insured = a.facts.get("ssdi_insured")
    if insured is None:
        det.note("DIS-FED-SSDI-INSURED", "insured status (20 credits in the last 40 quarters, fully insured) can only "
                 "be read from the SSA earnings record; ask the member to check their Social Security Statement", None)
        det.status = UNDETERMINED
        return det
    if not insured:
        det.note("DIS-FED-SSDI-INSURED", "not insured for disability benefits on the SSA record; consider SSI", False)
        det.status = INELIGIBLE
        det.links.append("disability:check_ssi")
        return det
    det.note("DIS-FED-SSDI-INSURED", "insured for disability benefits (input from the SSA record)", True)

    det.note("DIS-FED-SSDI-DDS", f"the medical decision is made by {dds_name} for SSA on the medical evidence", None)
    if not a.disabled and not a.blind:
        det.status = UNDETERMINED
        return det
    det.note("DIS-FED-SSDI-MEDICAL-INPUT", "household states the DDS found the person disabled", True)
    det.status, det.tier = ELIGIBLE, "SSDI"
    onset = _d(a.facts.get("disability_onset"))
    filed = _d(a.facts.get("ssdi_application_date")) or as_of
    if onset:
        wp = int(params.use("federal.ssa.dib_waiting_period_months", as_of, det).value)
        look = int(params.use("federal.ssa.dib_waiting_period_lookback_months", as_of, det).value)
        first_full = onset.replace(day=1) if onset.day == 1 else add_months(onset, 1)
        earliest = add_months(filed.replace(day=1), -look)
        start_wp = max(first_full, earliest)
        ent = add_months(start_wp, wp)
        det.note("DIS-FED-SSDI-WAITING-PERIOD", f"onset {onset}: waiting period of {wp} full months starts {start_wp:%B %Y}"
                 + (f" (limited to {look} months before filing in {filed:%B %Y})" if earliest > first_full else "")
                 + f"; first month of entitlement {ent:%B %Y}", None)
        a.facts.setdefault("ssdi_entitlement_start", ent.isoformat())
    _medicare_dates(hh, as_of, det)
    return det


def _medicare_dates(hh: Household, as_of: date, det: Determination) -> None:
    ent = _d(hh.applicant.facts.get("ssdi_entitlement_start"))
    if not ent:
        return
    n = int(params.use("federal.ssa.medicare_disability_entitlement_months", as_of, det).value)
    med = add_months(ent, n)
    det.note("DIS-FED-SSDI-MEDICARE-24", f"entitled from {ent:%B %Y}: Medicare Part A from the 25th month, {med:%B %Y}", None)
    det.links.append("turning_65:medicare_part_a_after_24_months")
    det.links.append("msp:check_after_part_a")


def evaluate(hh: Household, state: str, as_of: date) -> Determination:
    """Entry point: evaluate the Disability playbook (SSI + state supplement, or SSDI) for ``state``."""
    from rulesarchive.dispatch import evaluate_state

    return evaluate_state(PROGRAM, hh, state, as_of)


def evaluate_ssdi(hh: Household, as_of: date) -> Determination:
    """Cross-playbook helper: SSDI evaluation for the household's state."""
    hh.facts["claim"] = "ssdi"
    return evaluate(hh, hh.state, as_of)
