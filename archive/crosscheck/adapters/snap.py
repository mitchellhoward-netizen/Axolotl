"""PolicyEngine adapter for the SNAP playbook.

PolicyEngine variables read (SPMUnit, MONTH): ``snap`` (benefit),
``is_snap_eligible``, ``snap_net_income``, ``snap_utility_allowance``,
``snap_excess_medical_expense_deduction``. PolicyEngine models federal SNAP
rules with per-state parameters for utility allowances, standard medical
deductions and BBCE (TANF non-cash) limits; it does not model New York's
regional UTIL/Phone SUA rule (it gives New York and California households the
full heating/cooling SUA always), the Public Law 119-21 LIHEAP limit, or
Illinois' own standard deduction. See crosscheck/explanations/snap.yaml.

Inputs mapped beyond crosscheck/pe_situation.py (all annual amounts):
rent -> pre_subsidy_rent (person), mortgage/insurance ->
mortgage_payments / homeowners_insurance (property tax is not mapped), medical ->
other_medical_expenses (on the oldest elderly or disabled member),
dependent_care -> childcare_expenses (SPM), child_support_paid ->
child_support_expense, heating/cooling bill -> heating_cooling_expense (SPM),
other billed utilities -> electricity_expense / water_expense /
phone_expense (SPM; a nominal $1 a month when the household only says the
utility is billed), and takes_up_snap_if_eligible = True.
"""

from __future__ import annotations

from datetime import date

PE_VARIABLES = ["snap", "is_snap_eligible", "snap_net_income", "snap_utility_allowance"]

TOLERANCE = 1.0   # benefit differences of more than $1 count as differences


def _billed(hh) -> set[str]:
    from playbooks.snap.federal.rules import utilities_billed
    return utilities_billed(hh)


def pe_inputs(hh, as_of: date) -> dict:
    ex = hh.expenses
    person: dict[str, dict] = {}
    first = hh.members[0].id
    if ex.get("rent"):
        person.setdefault(first, {})["pre_subsidy_rent"] = ex["rent"] * 12
    if ex.get("child_support_paid"):
        person.setdefault(first, {})["child_support_expense"] = ex["child_support_paid"] * 12
    if ex.get("medical"):
        ed = [m for m in hh.members if m.age >= 60 or m.disabled or m.benefits & {"ssi", "ssdi"}]
        who = (max(ed, key=lambda m: m.age) if ed else hh.members[0]).id
        person.setdefault(who, {})["other_medical_expenses"] = ex["medical"] * 12
    spm: dict[str, float] = {}
    for k, var in (("mortgage", "mortgage_payments"),
                   ("homeowners_insurance", "homeowners_insurance")):
        if ex.get(k):
            spm[var] = ex[k] * 12
    if ex.get("dependent_care"):
        spm["childcare_expenses"] = ex["dependent_care"] * 12
    billed = _billed(hh)
    if "heating_cooling" in billed:
        spm["heating_cooling_expense"] = max(ex.get("heating_cooling", 0), 1) * 12
    if "electricity" in billed:
        spm["electricity_expense"] = 12
    if "water" in billed:
        spm["water_expense"] = 12
    if "phone" in billed:
        spm["phone_expense"] = max(ex.get("phone", 0), 1) * 12
    spm["takes_up_snap_if_eligible"] = True
    return {"extra_person": person, "extra_spm": spm}


def read(sim, hh, as_of: date) -> dict:
    period = f"{as_of.year}-{as_of.month:02d}"
    benefit = float(sim.calculate("snap", period)[0])
    elig = bool(sim.calculate("is_snap_eligible", period)[0])
    net = float(sim.calculate("snap_net_income", period)[0])
    ua = float(sim.calculate("snap_utility_allowance", period)[0])
    status = "eligible" if elig and benefit > 0 else "ineligible"
    return {"status": status, "tier": None, "benefit_monthly": round(benefit, 2),
            "net_income_monthly": round(net, 2), "utility_allowance_monthly": round(ua, 2)}


def ours(det) -> dict:
    return {"status": det.status, "tier": None, "benefit_monthly": det.amounts.get("benefit_monthly", 0.0),
            "net_income_monthly": det.amounts.get("net_income_monthly"),
            "utility_allowance_monthly": det.amounts.get("utility_allowance_monthly")}


def same(o: dict, p: dict) -> bool:
    if o["status"] != p["status"]:
        return False
    return abs((o.get("benefit_monthly") or 0.0) - (p.get("benefit_monthly") or 0.0)) <= TOLERANCE
