"""Disability playbook — Illinois.

SSI is federal (playbooks/disability/federal/rules.py). Illinois supplements
it with AABD cash, which IDHS (not SSA) runs and budgets case by case: the
AABD Cash Assistance Standard is built from allowances (personal allowance,
shelter up to $97, standard utility allowances by area, and the grant
adjustment), and the payment is the standard minus the client's nonexempt
income, SSI included, after a $25 exemption (PM 11-01-00 ff.). Illinois is a
209(b) state: SSI does not bring Medicaid automatically; AABD medical needs
its own IDHS application.

Household.facts used here
    il_utilities_paid            list of utilities the client pays separately: water, electricity,
                                 cooking_fuel, heat_metered_gas, heat_fuel_oil, heat_bottled_gas,
                                 heat_coal (default: none, e.g. utilities included in rent)
    il_separate_living_arrangement  true when the client lives with others but pays a flat fee and
                                 shares no expenses (PM 11-01-02-a); default false (shared)
    il_persons_eating_together   default: number of household members (1 if separate arrangement)
    il_bedfast                   true for a client confined to bed or chair 3+ months
    il_employment_expenses_monthly
Household.expenses used: rent; or mortgage + property_tax + homeowners_insurance for an owner.
"""

from __future__ import annotations

from datetime import date

from rulesarchive import params
from rulesarchive.determination import ELIGIBLE, Determination
from rulesarchive.household import EARNED_KINDS, Household, Person

from playbooks.disability.federal import rules as fed

STATE = "il"
DDS = "Disability Determination Services, Illinois Department of Human Services, Division of Rehabilitation Services"


def _bucket(n: int) -> str:
    return "1" if n <= 1 else "2" if n == 2 else "3-7" if n <= 7 else "8+"


def needs(hh: Household, p: Person, as_of: date, det: Determination) -> float | None:
    """AABD Cash Assistance Standard for one community client (DIS-IL-AABD-STANDARD)."""
    separate = bool(hh.facts.get("il_separate_living_arrangement"))
    persons = 1 if separate else len(hh.members)
    eating = int(hh.facts.get("il_persons_eating_together", 1 if separate else len(hh.members)))
    pa = params.use("il.aabd.personal_allowance_monthly", as_of, det).value
    personal = float(pa["bedfast" if hh.facts.get("il_bedfast") else "active"][_bucket(eating)])

    cap = float(params.use("il.aabd.shelter_maximum_monthly", as_of, det).value)
    rent = float(hh.expenses.get("rent", 0) or 0)
    owner_costs = sum(float(hh.expenses.get(k, 0) or 0) for k in ("mortgage", "property_tax", "homeowners_insurance"))
    shelter_cost = rent if rent else owner_costs
    shelter = min(shelter_cost, cap) / persons

    paid = list(hh.facts.get("il_utilities_paid", []) or [])
    utilities = 0.0
    if paid:
        if persons > 2:
            det.note("DIS-IL-AABD-UTILITIES", "utility allowances for households of 3 or more are not recorded in this archive", None)
            det.unresolved("DIS-IL-OQ-04")
            return None
        county = (hh.county or "").lower().replace(" county", "").strip()
        areas = params.use("il.aabd.utility_area_counties", as_of, det).value
        area = next((k for k, v in areas.items() if county in v), None)
        if area is None:
            det.note("DIS-IL-AABD-UTILITIES", f"county {hh.county!r} not found in the AABD utility areas", None)
            det.unresolved("DIS-IL-OQ-04")
            return None
        table = params.use("il.aabd.utility_allowance_monthly", as_of, det).value[str(area)]
        utilities = sum(float(table[u].get(persons, table[u].get(str(persons)))) for u in paid) / persons
    ga = float(params.use("il.aabd.grant_adjustment_monthly", as_of, det).value)
    total = round(personal + shelter + utilities + ga, 2)
    det.note("DIS-IL-AABD-STANDARD", f"{p.id}: personal allowance ${personal:,.2f} ({eating} eating together) + shelter "
             f"${shelter:,.2f} (lesser of ${shelter_cost:,.2f} and ${cap:,.0f}" + (f", shared by {persons}" if persons > 1 else "")
             + f") + utilities ${utilities:,.2f} + grant adjustment ${ga:,.2f} = ${total:,.2f}", None)
    return total


def budgetable_income(hh: Household, p: Person, ssi_share: float, as_of: date, det: Determination) -> float:
    """Nonexempt income for AABD cash: SSI plus other income, after the $25 exemption (DIS-IL-AABD-INCOME)."""
    unearned = ssi_share + sum(i.monthly for i in hh.incomes
                               if (i.owner or hh.applicant.id) == p.id and i.kind not in EARNED_KINDS and i.kind not in {"ssi", "ssp"})
    earned = sum(i.monthly for i in hh.incomes if (i.owner or hh.applicant.id) == p.id and i.kind in EARNED_KINDS)
    ex = float(params.use("il.aabd.income_exemption_monthly", as_of, det).value)
    u_after = max(0.0, unearned - ex)
    left = max(0.0, ex - unearned)
    e_after = max(0.0, earned - left)
    if e_after:
        first = min(20.0, e_after)
        nxt = min(60.0, max(0.0, e_after - 20.0))
        e_after = e_after - first - nxt / 2.0
        e_after = max(0.0, e_after - float(hh.facts.get("il_employment_expenses_monthly", 0) or 0))
    total = round(u_after + e_after, 2)
    det.note("DIS-IL-AABD-INCOME", f"{p.id}: SSI ${ssi_share:,.2f} + other unearned ${unearned - ssi_share:,.2f} + earned "
             f"${earned:,.2f}, less the $25 exemption" + (" and earned income disregards" if earned else "")
             + f" = ${total:,.2f}", None)
    return total


def evaluate(hh: Household, as_of: date) -> Determination:
    det = Determination(fed.PROGRAM, STATE, as_of)
    if hh.facts.get("claim") == "ssdi":
        return fed.ssdi(hh, as_of, det, DDS)

    r = fed.ssi_federal(hh, as_of, det)
    a = hh.applicant
    aabd: float | None = 0.0
    minimum = float(params.use("il.aabd.minimum_payment_monthly", as_of, det).value)
    if not r.state_payable:
        det.note("DIS-IL-AABD-ELIGIBILITY", f"no AABD cash: ineligible for SSI for a reason other than income ({r.reason})", False)
    elif fed.living_arrangement(hh) == "medical_facility" or r.unit in ("deemed_spouse", "deemed_parent"):
        aabd = None
        det.note("DIS-IL-AABD-RELATIVE", "AABD cash for this situation (long-term care, an ineligible spouse or "
                 "parents in the household) is budgeted with responsible-relative rules this archive does not encode", None)
        det.unresolved("DIS-IL-OQ-01")
    else:
        lim = float(params.use("il.aabd.cash_resource_limit", as_of, det)[2 if r.unit == "couple" else 1])
        owners = {a.id} | ({fed.spouse_of(hh).id} if r.unit == "couple" else set())
        res = fed.countable_resources(hh, owners, as_of, det)
        if res > lim:
            det.note("DIS-IL-AABD-RESOURCES", f"nonexempt resources ${res:,.2f} exceed the AABD cash limit ${lim:,.0f}", False)
        else:
            det.note("DIS-IL-AABD-RESOURCES", f"nonexempt resources ${res:,.2f} within ${lim:,.0f}", True)
            people = [a] + ([fed.spouse_of(hh)] if r.unit == "couple" else [])
            share = r.federal_payment / len(people)
            rows = []
            for p in people:
                n = needs(hh, p, as_of, det)
                if n is None:
                    aabd = None
                    break
                rows.append([p, n, budgetable_income(hh, p, share, as_of, det)])
            if aabd is not None:
                if len(rows) == 2:
                    rows.sort(key=lambda x: -x[2])
                    excess = max(0.0, rows[0][2] - rows[0][1])
                    if excess:
                        rows[0][2] = rows[0][1]
                        rows[1][2] += excess
                        det.note("DIS-IL-AABD-COUPLE", f"spouse with greater income has ${excess:,.2f} above own needs; "
                                 "budgeted against the other spouse's needs", None)
                aabd = 0.0
                for p, n, inc in rows:
                    gap = round(n - inc, 2)
                    pay = gap if gap >= minimum else 0.0
                    aabd += pay
                    det.note("DIS-IL-AABD-AMOUNT", f"{p.id}: needs ${n:,.2f} - income ${inc:,.2f} = "
                             + (f"AABD cash ${pay:,.2f}" if pay else f"${gap:,.2f}, less than the ${minimum:.0f} minimum: no AABD cash"),
                             pay > 0)
                aabd = round(aabd, 2)
    fed.set_amounts(det, r, aabd)
    if det.status == ELIGIBLE:
        det.links.append("medicaid:separate_application_209b")
        det.note("DIS-IL-MEDICAID-209B", "Illinois is a 209(b) state: SSI does not bring Medicaid automatically; "
                 "apply for AABD medical with IDHS", None)
        if aabd:
            det.note("DIS-IL-AABD-PAID-BY-IDHS", "AABD cash is paid by IDHS, separately from SSA's SSI payment", None)
    fed.link_common(det, r)
    return det
