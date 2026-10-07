"""PolicyEngine adapter for the Disability playbook (SSI + state supplements).

PolicyEngine variables compared (all MONTH):
- ``ssi`` (Person): federal SSI, summed over the applicant and an eligible spouse;
- ``ca_state_supplement`` (SPMUnit): California SSP;
- ``il_aabd`` (SPMUnit): Illinois AABD cash.
PolicyEngine has no New York State Supplement Program variable, so for New
York only the federal SSI amount is compared. It does not model SSDI.

We compare amounts (within $1), not labels: the archive reports a person whose
countable income equals the FBR as SSI-eligible with a $0 payment (SI 02005.001
C.3), while PolicyEngine's ``ssi`` is simply 0.
"""

from __future__ import annotations

from datetime import date

PE_VARIABLES = ["ssi", "ca_state_supplement", "il_aabd"]

UTILITY_EXPENSE = {
    "water": "water_expense", "electricity": "electricity_expense", "cooking_fuel": "cooking_fuel_expense",
    "heat_coal": "coal_expense", "heat_fuel_oil": "fuel_oil_expense", "heat_metered_gas": "gas_expense",
    "heat_bottled_gas": "bottled_gas_expense",
}


def pe_inputs(hh, as_of: date) -> dict:
    """Translate the archive's living-arrangement and Illinois facts into PolicyEngine inputs."""
    person: dict = {}
    spm: dict = {}
    household: dict = {}
    a = hh.applicant.id
    unit = [a] + ([hh.spouse.id] if hh.spouse else [])
    la = hh.facts.get("living_arrangement", "own_household")
    for pid in unit:
        p = person.setdefault(pid, {})
        if la == "household_of_another":
            # PolicyEngine's VTR gate also asks whether others pay all meals; the
            # archive's post-9/30/2024 rule looks at shelter only, so we set all three.
            p.update({"ssi_lives_in_another_persons_household": True,
                      "ssi_receives_shelter_from_others_in_household": True,
                      "ssi_others_pay_all_meals": True})
    v = float(hh.facts.get("ism_shelter_value_monthly", 0) or 0)
    if v and la == "own_household":
        person.setdefault(a, {}).update({"ssi_receives_outside_shelter_support": True,
                                         "ssi_shelter_support_value": v * 12})
    if hh.state == "il":
        rent = float(hh.expenses.get("rent", 0) or 0)
        if rent:
            person.setdefault(a, {})["rent"] = rent * 12
        for u in hh.facts.get("il_utilities_paid", []) or []:
            spm[UTILITY_EXPENSE[u]] = 1200.0   # well above any allowance, so PolicyEngine allows the standard amount
        if hh.county:
            household["county_str"] = hh.county.upper().replace(" ", "_") + "_COUNTY_IL"
    if hh.state == "ca" and hh.facts.get("no_cooking_facilities"):
        household["living_arrangements_allow_for_food_preparation"] = False
    return {"extra_person": person, "extra_spm": spm, "extra_household": household}


def read(sim, hh, as_of: date) -> dict:
    period = f"{as_of.year}-{as_of.month:02d}"
    ids = [m.id for m in hh.members]
    unit = [hh.applicant.id] + ([hh.spouse.id] if hh.spouse else [])
    ssi = sim.calculate("ssi", period)
    fed = round(sum(float(ssi[ids.index(pid)]) for pid in unit), 2)
    state = None
    if hh.state == "ca":
        state = round(float(sim.calculate("ca_state_supplement", period)[0]), 2)
    elif hh.state == "il":
        state = round(float(sim.calculate("il_aabd", period)[0]), 2)
    total = fed + (state or 0.0)
    out = {"status": "eligible" if total > 0 else "ineligible", "ssi_federal_monthly": fed}
    if state is not None:
        out["state_supplement_monthly"] = state
    return out


def ours(det) -> dict:
    out = {"status": det.status, "ssi_federal_monthly": det.amounts.get("ssi_federal_monthly")}
    if "state_supplement_monthly" in det.amounts:
        out["state_supplement_monthly"] = det.amounts["state_supplement_monthly"]
    return out


def _close(x, y) -> bool:
    if x is None or y is None:
        return x is None and y is None
    return abs(float(x) - float(y)) < 1.0


def same(o: dict, p: dict) -> bool:
    if not _close(o.get("ssi_federal_monthly") or 0.0, p.get("ssi_federal_monthly") or 0.0):
        return False
    if "state_supplement_monthly" in p and not o.get("federal_only"):   # PolicyEngine models the supplement (CA, IL)
        return _close(o.get("state_supplement_monthly"), p["state_supplement_monthly"])
    return True


def federal_minimum(hh, as_of: date) -> dict:
    """Our federal SSI amount alone (no state supplement), for the 'federal minimum' column."""
    from playbooks.disability.federal import rules as fed
    from rulesarchive.determination import Determination

    det = Determination("disability", hh.state, as_of)
    r = fed.ssi_federal(hh, as_of, det)
    return {"status": "eligible" if r.federal_payment > 0 else "ineligible", "ssi_federal_monthly": r.federal_payment,
            "federal_only": True}
