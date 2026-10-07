"""Disability playbook — New York.

SSI is federal (playbooks/disability/federal/rules.py). New York adds the
State Supplement Program (SSP): Social Services Law 209 sets a "standard of
monthly need" (SSI + SSP) by living arrangement, and the SSP is the standard
minus the SSI benefit plus countable income. New York pays the SSP itself
(OTDA) rather than through SSA. SSI receipt brings Medicaid without a
separate application (New York has a section 1634 agreement with SSA).

Household.facts used here
    ny_ssp_living_arrangement  living_alone | living_with_others | family_care |
                               residential_care | enhanced_residential_care
                               (default: living_alone if only the applicant and spouse
                               live in the household, otherwise living_with_others)
"""

from __future__ import annotations

from datetime import date

from rulesarchive import params
from rulesarchive.determination import ELIGIBLE, Determination
from rulesarchive.household import Household

from playbooks.disability.federal import rules as fed

STATE = "ny"
DDS = "the New York State Office of Temporary and Disability Assistance, Division of Disability Determinations"


def arrangement(hh: Household) -> str:
    arr = hh.facts.get("ny_ssp_living_arrangement")
    if arr:
        return arr
    unit = {hh.applicant.id} | ({fed.spouse_of(hh).id} if fed.spouse_of(hh) else set())
    return "living_alone" if all(m.id in unit for m in hh.members) else "living_with_others"


def standard(hh: Household, arr: str, size: int, as_of: date, det: Determination) -> float:
    table = params.use("ny.ssp.standard_of_need_monthly", as_of, det).value[arr]
    if arr in ("family_care", "residential_care"):
        metro = params.use("ny.ssp.metro_counties", as_of, det).value
        region = "metro" if (hh.county or "").lower().replace(" county", "") in metro else "rest"
        table = table[region]
    return float(table.get(size, table.get(str(size))))


def evaluate(hh: Household, as_of: date) -> Determination:
    det = Determination(fed.PROGRAM, STATE, as_of)
    if hh.facts.get("claim") == "ssdi":
        return fed.ssdi(hh, as_of, det, DDS)

    r = fed.ssi_federal(hh, as_of, det)
    ssp: float | None = 0.0
    if not r.state_payable:
        det.note("DIS-NY-SSP-ELIGIBILITY", f"no New York SSP: ineligible for SSI for a reason other than income ({r.reason})", False)
    elif fed.living_arrangement(hh) == "medical_facility":
        det.note("DIS-NY-SSP-ELIGIBILITY", "no New York SSP for a person in a medical facility where Medicaid pays "
                 "more than half the cost of care", False)
    elif r.unit == "deemed_spouse":
        ssp = None
        det.note("DIS-NY-SSP-DEEMING", "how New York budgets the SSP for an SSI recipient living with an ineligible "
                 "spouse was not found in New York sources", None)
        det.unresolved("DIS-NY-OQ-01")
    else:
        arr = arrangement(hh)
        size = 2 if r.unit == "couple" else 1
        need = standard(hh, arr, size, as_of, det)
        income = round(r.countable + r.vtr, 2)
        if income < need:
            ssp = round(max(0.0, need - (r.federal_payment + income)), 2)
            det.note("DIS-NY-SSP-AMOUNT", f"{arr.replace('_', ' ')} standard of need ${need:,.2f} - (SSI ${r.federal_payment:,.2f} "
                     f"+ countable income ${income:,.2f}" + (f", incl. VTR ${r.vtr:,.2f}" if r.vtr else "")
                     + f") = SSP ${ssp:,.2f}", True)
        else:
            det.note("DIS-NY-SSP-AMOUNT", f"countable income ${income:,.2f} is not less than the {arr.replace('_', ' ')} "
                     f"standard of need ${need:,.2f}: no SSP", False)
        if arr in ("family_care", "residential_care", "enhanced_residential_care"):
            det.unresolved("DIS-NY-OQ-02")
    fed.set_amounts(det, r, ssp)
    if det.status == ELIGIBLE:
        det.note("DIS-NY-SSP-PAYMENT", "New York pays the SSP itself (OTDA), as a separate payment from SSA's SSI payment", None)
        if det.tier == "SSI":
            det.links.append("medicaid:automatic_with_ssi")
            det.note("DIS-NY-MEDICAID-1634", "SSI recipients in New York get Medicaid without a separate application", None)
        else:
            det.unresolved("DIS-NY-OQ-03")
    fed.link_common(det, r)
    return det
