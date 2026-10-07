"""School meals — New York.

From SY 2025-26, Education Law 915-a requires every school district, charter
school and nonpublic school in the NSLP/SBP to serve breakfast and lunch at
no cost to all students; the state pays the difference up to the free rate.
Schools must still certify students' federal categories (direct
certification at least three times a year; applications where the school is
not in CEP or Provision 2). New York directly certifies with Medicaid for
FREE meals only.
"""

from __future__ import annotations

from datetime import date

from rulesarchive import params
from rulesarchive.determination import Determination
from rulesarchive.household import Household

from playbooks.school_meals.federal import rules as fed

STATE = "ny"


def _as_date(v) -> date:
    return v if isinstance(v, date) else date.fromisoformat(str(v))


def evaluate(hh: Household, as_of: date) -> Determination:
    det = Determination(fed.PROGRAM, STATE, as_of)
    dcm_type = params.use("ny.nysed.dcm_type", as_of, det).value
    if hh.facts.get("school_participates_nslp", True) is False:
        det.note("SCH-NY-UNIVERSAL-MEALS", "New York's universal free meals cover only schools in the NSLP/SBP", False)
        return fed.evaluate_federal(hh, as_of, det, dcm_type=dcm_type, dcm_rule="SCH-NY-DCM-FREE-ONLY")

    res = fed.federal_category(hh, as_of, det, dcm_type=dcm_type, dcm_rule="SCH-NY-DCM-FREE-ONLY")
    if fed.cep(hh, det, as_of):
        fed.universal(det, res, None, "", "cep")
    else:
        start = _as_date(params.use("ny.nysed.universal_meals_start", as_of, det).value)
        if as_of < start:
            return fed.apply_federal(det, res)
        fed.universal(det, res, "SCH-NY-UNIVERSAL-MEALS",
                      f"New York school in the NSLP/SBP: breakfast and lunch at no cost to all students (Education Law 915-a, since {start:%B %Y})",
                      "ny_universal_meals")
    if hh.facts.get("school_cep") or hh.facts.get("school_provision2_nonbase"):
        det.note("SCH-NY-HOUSEHOLD-INCOME-FORM", "CEP / Provision 2 non-base-year school: a Household Income Eligibility "
                                                 "Form (not a meal application) identifies the student for other state and federal benefits, including Summer EBT", None)
        det.links.append("ny:household_income_eligibility_form")
    else:
        det.note("SCH-NY-APPLICATION-STILL-REQUIRED", "school outside CEP / Provision 2 non-base years still collects the "
                                                      "free and reduced-price application while meals are free", None)
        det.links.append("ny:meal_application_still_collected")
    return det
