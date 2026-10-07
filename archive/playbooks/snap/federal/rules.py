"""SNAP (Supplemental Nutrition Assistance Program) — federal base logic.

The federal part computes the SNAP budget the way 7 CFR 273.9-273.10 do
(gross income, the six deductions, net income, allotment) and applies the
regular eligibility tests (gross 130%, net 100%, resources). Each state part
supplies a :class:`StateConfig` with its own utility allowances, standard
medical deduction, standard deduction, child-support treatment and
broad-based categorical eligibility (BBCE) test, then calls :func:`run`.

Household inputs used (all monthly dollars):

- ``Household.incomes``: every member's income counts (one SNAP household =
  everyone who buys and prepares food together). ``earned`` and
  ``self_employment`` are earned; everything else, including SSI and the
  gross Social Security benefit before the Medicare premium is withheld, is
  unearned.
- ``Household.expenses``: ``rent``, ``mortgage``, ``property_tax``,
  ``homeowners_insurance`` (shelter); ``heating_cooling``, ``utilities``,
  ``phone`` (only used to infer which utilities are billed, see below);
  ``medical`` (unreimbursed medical costs of the elderly/disabled members,
  e.g. a Medicare Part B premium the member pays); ``dependent_care``;
  ``child_support_paid`` (legally obligated, paid to a non-member);
  ``internet`` (never allowed, Public Law 119-21 sec. 10104).
- ``Household.facts``:
    ``utilities``: list of utilities billed to the household separately from
      rent: ``heating_cooling``, ``electricity``, ``gas``, ``water``,
      ``sewer``, ``trash``, ``phone``. When absent it is inferred from
      expenses (``heating_cooling`` > 0 -> heating_cooling; ``utilities`` > 0
      -> electricity and water; ``phone`` > 0 -> phone).
    ``energy_assistance_over_20``: the household got a LIHEAP/HEAP (or
      similar) payment over $20 in the current month or previous 12 months.
    ``sanctioned_or_ipv_member``: a member is disqualified for an
      intentional program violation or sanctioned (blocks BBCE).
    ``homeless``: homeless household (homeless shelter deduction not
      modelled; such cases come back undetermined).
    ``ny_region``: nyc | nassau_suffolk | rest (New York only; otherwise
      derived from ``county``).
    ``part_b_premium_in_medical``: the ``medical`` expense includes the
      Medicare Part B premium (used for the MSP link).
- ``Person.disabled`` / ``Person.benefits`` (``ssi``, ``ssdi``, ``tanf``):
  disability as SNAP defines it (receipt of SSI or Social Security disability
  benefits counts, 7 CFR 271.2).
- ``Person.citizen_or_qualified``: False makes the case undetermined
  (SNAP-FED-OQ-05; non-citizen budgeting is not modelled).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date
from typing import Callable

from rulesarchive import params
from rulesarchive.determination import ELIGIBLE, INELIGIBLE, UNDETERMINED, Determination
from rulesarchive.household import EARNED_KINDS, Household

PROGRAM = "snap"

SHELTER_KINDS = ("rent", "mortgage", "property_tax", "homeowners_insurance")
COUNTED_ASSETS = {"cash", "investments", "real_estate", "burial_fund", "other"}
EXCLUDED_ASSETS = {"home", "retirement", "life_insurance_cash_value", "burial_space"}
NYC_COUNTIES = {"new york", "kings", "queens", "bronx", "richmond", "manhattan", "brooklyn", "staten island"}


class Unresolved(Exception):
    """A rule the case needs is unresolved in the archive."""

    def __init__(self, oq: str, rule: str, text: str):
        super().__init__(text)
        self.oq, self.rule, self.text = oq, rule, text


# ------------------------------------------------------------------ helpers
def by_size(pv: params.ParamValue, size: int):
    """Look up a household-size table with an ``additional`` per-person key."""
    table = pv.value
    keys = sorted(int(k) for k in table if str(k).isdigit())
    top = keys[-1]
    if size <= top:
        return pv[size]
    return pv[top] + (size - top) * table["additional"]


def is_elderly(p, as_of: date, det: Determination | None = None) -> bool:
    return p.age >= params.use("federal.snap.elderly_age", as_of, det).value


def is_disabled(p) -> bool:
    """SNAP disability (7 CFR 271.2): receives SSI or Social Security disability, or asserted."""
    return bool(p.disabled or p.blind or p.benefits & {"ssi", "ssdi"})


def elderly_or_disabled(hh: Household, as_of: date, det: Determination | None = None) -> bool:
    return any(is_elderly(m, as_of, det) or is_disabled(m) for m in hh.members)


def utilities_billed(hh: Household) -> set[str]:
    if "utilities" in hh.facts:
        return set(hh.facts["utilities"])
    out = set()
    if hh.expenses.get("heating_cooling", 0) > 0:
        out.add("heating_cooling")
    if hh.expenses.get("utilities", 0) > 0:
        out |= {"electricity", "water"}
    if hh.expenses.get("phone", 0) > 0:
        out.add("phone")
    return out


def energy_assistance_confers_hcsua(hh: Household, ed: bool, as_of: date, state_start: date | None,
                                    det: Determination, rule_id: str) -> bool:
    """Public Law 119-21 sec. 10103: LIHEAP-type payments over $20 confer the
    heating/cooling SUA only for households with an elderly or disabled member,
    from the date the state put the change in force (``state_start``)."""
    if not hh.facts.get("energy_assistance_over_20"):
        return False
    if ed:
        det.note(rule_id, "energy assistance payment over $20 and an elderly/disabled member: heating/cooling SUA", True)
        return True
    if state_start is not None and as_of < state_start:
        det.note(rule_id, f"energy assistance payment over $20; before {state_start} it still conferred the heating/cooling SUA", True)
        return True
    det.note(rule_id, "energy assistance alone no longer confers the heating/cooling SUA on a household "
                      "without an elderly or disabled member", False)
    return False


@dataclass
class BBCEResult:
    eligible: bool                 # meets the state's BBCE conditions
    rule: str
    text: str
    net_test: bool | None = False  # True: the net test still applies; None: unknown
    oq: str | None = None          # open question when net_test is None


@dataclass
class StateConfig:
    state: str
    standard_deduction_pid: str = "federal.snap.standard_deduction_monthly"
    standard_deduction_rule: str = "SNAP-FED-STANDARD-DEDUCTION"
    # (hh, as_of, det, ed, medical) -> deduction
    medical_deduction: Callable | None = None
    # (hh, as_of, det, ed) -> (amount, label)
    utility_allowance: Callable | None = None
    # (hh, as_of, det, ed, gross, budget) -> BBCEResult
    bbce: Callable | None = None
    child_support_exclusion: bool = True   # 7 CFR 273.9(c)(17) default; (d)(5) deduction is a state option
    child_support_rule: str = "SNAP-FED-CHILD-SUPPORT"
    extra_notes: Callable | None = None


@dataclass
class Budget:
    size: int
    earned: float
    unearned: float
    gross: float
    child_support_excluded: float
    earned_deduction: float
    standard_deduction: float
    medical_deduction: float
    dependent_care: float
    child_support_deduction: float
    adjusted: float
    shelter_costs: float
    utility_allowance: float
    utility_label: str
    excess_shelter: float
    net: float
    notes: list = field(default_factory=list)


# --------------------------------------------------------- budget pieces
def federal_medical_deduction(hh: Household, as_of: date, det: Determination, ed: bool, medical: float) -> float:
    """SNAP-FED-MEDICAL: elderly/disabled members' medical costs over $35."""
    if not ed or medical <= 0:
        return 0.0
    thr = params.use("federal.snap.medical_expense_threshold_monthly", as_of, det).value
    d = max(0.0, medical - thr)
    det.note("SNAP-FED-MEDICAL", f"medical costs ${medical:,.2f} - ${thr} = ${d:,.2f} deduction", d > 0)
    return d


def budget(hh: Household, as_of: date, det: Determination, cfg: StateConfig, ed: bool) -> Budget:
    size = hh.size
    earned = sum(i.monthly for i in hh.incomes if i.kind in EARNED_KINDS)
    unearned = sum(i.monthly for i in hh.incomes if i.kind not in EARNED_KINDS)
    cs_paid = float(hh.expenses.get("child_support_paid", 0))
    cs_excl = cs_paid if cfg.child_support_exclusion else 0.0
    gross = earned + unearned - cs_excl
    det.note("SNAP-FED-GROSS-INCOME",
             f"gross income ${gross:,.2f} (earned ${earned:,.2f}, unearned ${unearned:,.2f}"
             + (f", less ${cs_excl:,.2f} child support excluded" if cs_excl else "") + f"); household of {size}", None)

    pct = params.use("federal.snap.earned_income_deduction_percent", as_of, det).value
    e_ded = round(earned * pct / 100.0, 2)
    std = float(params.use(cfg.standard_deduction_pid, as_of, det)[min(size, 6)])
    det.note(cfg.standard_deduction_rule, f"standard deduction ${std:,.2f} for {size}", None)
    medical = float(hh.expenses.get("medical", 0))
    med_fn = cfg.medical_deduction or federal_medical_deduction
    med = med_fn(hh, as_of, det, ed, medical)
    dep = float(hh.expenses.get("dependent_care", 0))
    cs_ded = 0.0 if cfg.child_support_exclusion else cs_paid
    if cs_paid:
        det.note(cfg.child_support_rule, f"child support paid ${cs_paid:,.2f} "
                 + ("excluded from gross income" if cfg.child_support_exclusion else "deducted"), None)
    adjusted = max(0.0, gross - e_ded - std - med - dep - cs_ded)

    if hh.facts.get("homeless"):
        raise Unresolved("SNAP-FED-OQ-06", "SNAP-FED-HOMELESS", "homeless shelter deduction is not modelled")
    if hh.expenses.get("internet"):
        det.note("SNAP-FED-NO-INTERNET", "internet costs are not a shelter expense (Public Law 119-21 sec. 10104)", None)
    housing = sum(float(hh.expenses.get(k, 0)) for k in SHELTER_KINDS)
    ua, ua_label = (cfg.utility_allowance(hh, as_of, det, ed) if cfg.utility_allowance else (0.0, "none"))
    shelter = housing + ua
    share = params.use("federal.snap.shelter_income_share_percent", as_of, det).value / 100.0
    excess = max(0.0, shelter - share * adjusted)
    if ed:
        det.note("SNAP-FED-SHELTER-UNCAPPED", f"excess shelter ${excess:,.2f} (no cap: elderly/disabled member)", None)
    else:
        cap = float(params.use("federal.snap.excess_shelter_cap_monthly", as_of, det).value)
        if excess > cap:
            det.note("SNAP-FED-SHELTER-CAP", f"excess shelter ${excess:,.2f} capped at ${cap:,.0f}", None)
            excess = cap
        else:
            det.note("SNAP-FED-SHELTER-CAP", f"excess shelter ${excess:,.2f} (under the ${cap:,.0f} cap)", None)
    net = max(0.0, round(adjusted - excess, 2))
    det.note("SNAP-FED-NET-INCOME",
             f"net income ${net:,.2f} = gross ${gross:,.2f} - earned 20% ${e_ded:,.2f} - standard ${std:,.0f}"
             f" - medical ${med:,.2f} - dependent care ${dep:,.2f} - child support ${cs_ded:,.2f}"
             f" - excess shelter ${excess:,.2f} (shelter ${housing:,.2f} + {ua_label} ${ua:,.2f})", None)
    return Budget(size, earned, unearned, gross, cs_excl, e_ded, std, med, dep, cs_ded, adjusted,
                  shelter, ua, ua_label, excess, net)


def countable_resources(hh: Household) -> float:
    if any(a.kind == "vehicle" for a in hh.assets):
        raise Unresolved("SNAP-FED-OQ-04", "SNAP-FED-RESOURCES", "vehicle resource rules are not modelled")
    excluded_owners = {m.id for m in hh.members if m.benefits & {"ssi", "tanf"}}
    return sum(a.value for a in hh.assets
               if a.kind in COUNTED_ASSETS and not (a.owner and a.owner in excluded_owners))


def allotment(size: int, net: float, as_of: date, det: Determination) -> tuple[float, float]:
    """Maximum allotment minus 30% of net income (rounded up), and the maximum."""
    pv = params.use("federal.snap.max_allotment_monthly", as_of, det)
    mx = float(by_size(pv, min(size, 17)))
    if size >= 18:
        try:
            mx = float(params.use("federal.snap.max_allotment_cap_monthly", as_of, det).value)
        except params.ParameterError:
            mx = float(by_size(pv, size))
    rate = params.use("federal.snap.benefit_reduction_percent", as_of, det).value / 100.0
    contribution = math.ceil(round(net * rate, 4))
    return mx - contribution, mx


# ------------------------------------------------------------------ run
def run(hh: Household, as_of: date, cfg: StateConfig) -> Determination:
    det = Determination(PROGRAM, cfg.state, as_of)
    try:
        return _run(hh, as_of, cfg, det)
    except Unresolved as u:
        det.status, det.tier = UNDETERMINED, None
        det.note(u.rule, u.text, None)
        det.unresolved(u.oq)
        return det


def _run(hh: Household, as_of: date, cfg: StateConfig, det: Determination) -> Determination:
    if any(not m.citizen_or_qualified for m in hh.members):
        raise Unresolved("SNAP-FED-OQ-05", "SNAP-FED-NONCITIZEN",
                         "a member is not a citizen or eligible non-citizen; budgeting of ineligible members is not modelled")
    ed = elderly_or_disabled(hh, as_of, det)
    det.note("SNAP-FED-ELDERLY-DISABLED",
             "household has an elderly (60+) or disabled member" if ed else "no elderly or disabled member", None)
    b = budget(hh, as_of, det, cfg, ed)
    size = b.size
    det.amounts.update({"gross_income_monthly": round(b.gross, 2), "net_income_monthly": b.net,
                        "medical_deduction_monthly": round(b.medical_deduction, 2),
                        "excess_shelter_deduction_monthly": round(b.excess_shelter, 2),
                        "utility_allowance_monthly": b.utility_allowance})

    gross_limit = float(by_size(params.use("federal.snap.gross_income_limit_monthly", as_of, det), size))
    net_limit = float(by_size(params.use("federal.snap.net_income_limit_monthly", as_of, det), size))
    benefit, mx = allotment(size, b.net, as_of, det)
    minimum = float(params.use("federal.snap.min_benefit_monthly", as_of, det).value)

    tier = None
    pure_ce = all(m.benefits & {"ssi", "tanf"} for m in hh.members)
    if pure_ce:
        tier = "categorical"
        det.note("SNAP-FED-CATEGORICAL", "every member receives SSI or TANF: categorically eligible "
                 "(no gross, net or resource test)", True)
    else:
        # Regular rules first; BBCE only matters when they fail.
        reasons = []
        if not ed and b.gross > gross_limit:
            reasons.append(("SNAP-FED-GROSS-TEST", f"gross ${b.gross:,.2f} > 130% limit ${gross_limit:,.0f}"))
        res_pv = params.use("federal.snap.resource_limit", as_of, det)
        res_limit = float(res_pv["elderly_disabled" if ed else "general"])
        try:
            resources = countable_resources(hh)
            if resources > res_limit:
                reasons.append(("SNAP-FED-RESOURCES", f"resources ${resources:,.0f} > ${res_limit:,.0f}"))
        except Unresolved as u:
            reasons.append((u.rule, u.text, u))
        if b.net > net_limit:
            reasons.append(("SNAP-FED-NET-TEST", f"net ${b.net:,.2f} > 100% limit ${net_limit:,.0f}"))
        if not reasons:
            tier = "regular"
            det.note("SNAP-FED-GROSS-TEST", "gross test not applied (elderly/disabled member)" if ed
                     else f"gross ${b.gross:,.2f} <= ${gross_limit:,.0f}", True)
            det.note("SNAP-FED-RESOURCES", f"resources within ${res_limit:,.0f}", True)
            det.note("SNAP-FED-NET-TEST", f"net ${b.net:,.2f} <= ${net_limit:,.0f}", True)
        else:
            bb = cfg.bbce(hh, as_of, det, ed, b.gross, b) if cfg.bbce else None
            if bb and bb.eligible:
                det.note(bb.rule, bb.text, True)
                if bb.net_test is None and b.net > net_limit:
                    raise Unresolved(bb.oq or "SNAP-FED-OQ-01", bb.rule,
                                     f"net ${b.net:,.2f} > ${net_limit:,.0f}; whether the net test applies to this "
                                     "state's BBCE households is unresolved")
                if bb.net_test and b.net > net_limit:
                    det.note("SNAP-FED-NET-TEST", f"net ${b.net:,.2f} > ${net_limit:,.0f}", False)
                    det.status = INELIGIBLE
                    return det
                tier = "bbce"
            else:
                if bb:
                    det.note(bb.rule, bb.text, False)
                for r in reasons:
                    if len(r) == 3:
                        raise r[2]
                    det.note(r[0], r[1], False)
                det.status = INELIGIBLE
                return det

    # benefit
    if size <= 2:
        if benefit < minimum:
            det.note("SNAP-FED-MIN-BENEFIT", f"computed ${benefit:,.0f} raised to the ${minimum:,.0f} minimum "
                     "for 1-2 person households", True)
            benefit = minimum
    elif benefit <= 0:
        det.note("SNAP-FED-ZERO-BENEFIT", f"household of {size} with net ${b.net:,.2f} would get no benefit: ineligible", False)
        det.status = INELIGIBLE
        return det
    det.note("SNAP-FED-BENEFIT", f"benefit ${benefit:,.0f} = maximum ${mx:,.0f} - 30% of net income (rounded up)", True)
    det.status, det.tier = ELIGIBLE, tier
    det.amounts["benefit_monthly"] = float(benefit)
    _links_and_notes(hh, as_of, det, ed)
    if cfg.extra_notes:
        cfg.extra_notes(hh, as_of, det, ed)
    return det


def _links_and_notes(hh: Household, as_of: date, det: Determination, ed: bool) -> None:
    if any(m.age < 19 for m in hh.members):
        det.links.append("school_meals:direct_certification")
        det.note("SNAP-FED-LINK-SCHOOL-MEALS", "school-age children in a SNAP household are directly certified "
                 "for free school meals", None)
    if any("ssi" in m.benefits for m in hh.members):
        det.links.append("disability:ssi_household")
    if ed and hh.facts.get("part_b_premium_in_medical"):
        det.links.append("msp:part_b_in_medical_deduction")
        det.note("SNAP-FED-MSP-PART-B", "the Medicare Part B premium is counted in the medical deduction; "
                 "MSP approval would remove it", None)
    rng = params.use("federal.snap.abawd_age_range", as_of, det).value
    child_under_14 = any(m.age < 14 for m in hh.members)
    for m in hh.members:
        if rng["min"] <= m.age <= rng["max"] and not is_disabled(m) and not child_under_14 and not m.pregnant:
            det.note("SNAP-FED-ABAWD", f"member {m.id} (age {m.age}) may be subject to the ABAWD 3-month time "
                     "limit unless working 80 hours a month or exempt", None)
            break


def evaluate(hh: Household, state: str, as_of: date) -> Determination:
    """Entry point: evaluate SNAP for ``state``."""
    from rulesarchive.dispatch import evaluate_state

    return evaluate_state(PROGRAM, hh, state, as_of)
