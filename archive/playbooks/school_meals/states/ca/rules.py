"""School meals — California.

California Education Code 49501.5 (from SY 2022-23) requires every public
school district, county office of education and charter school serving
TK-12 to offer a free breakfast and a free lunch each school day to any
pupil who asks, whatever the pupil's free/reduced-price status. Private
schools are not covered. Schools still determine each pupil's federal
category (for federal claiming and for the LCFF unduplicated pupil count),
and California directly certifies with Medi-Cal for free AND reduced-price
meals through CALPADS (public LEAs only).
"""

from __future__ import annotations

from datetime import date

from rulesarchive import params
from rulesarchive.determination import Determination
from rulesarchive.household import Household

from playbooks.school_meals.federal import rules as fed

STATE = "ca"
PUBLIC_LEA = {"public", "charter", "county_office"}


def _as_date(v) -> date:
    return v if isinstance(v, date) else date.fromisoformat(str(v))


def evaluate(hh: Household, as_of: date) -> Determination:
    det = Determination(fed.PROGRAM, STATE, as_of)
    school_type = hh.facts.get("school_type", "public")
    lea = school_type in PUBLIC_LEA
    start = _as_date(params.use("ca.cde.universal_meals_start", as_of, det).value)
    covered = lea and as_of >= start
    dcm_type = params.use("ca.cde.dcm_type", as_of, det).value
    participates = hh.facts.get("school_participates_nslp", True) is not False

    if not participates and not covered:
        return fed.evaluate_federal(hh, as_of, det, dcm_type=dcm_type, dcm_rule="SCH-CA-DCM-MEDI-CAL", dcm_available=lea)

    if participates:
        res = fed.federal_category(hh, as_of, det, dcm_type=dcm_type, dcm_rule="SCH-CA-DCM-MEDI-CAL", dcm_available=lea)
        if not lea and hh.anyone_receives("medicaid"):
            det.note("SCH-CA-DCM-MEDI-CAL", "Medi-Cal direct certification runs only through CALPADS, which private schools cannot use", None)
    else:
        res = fed.FederalResult(tier="paid")
        det.note("SCH-CA-UNIVERSAL-MEALS", "the LEA does not run the NSLP/SBP; it must still offer the two free meals "
                                           "but gets no federal or state meal reimbursement", None)

    if participates and fed.cep(hh, det, as_of):
        fed.universal(det, res, None, "", "cep")
    elif covered:
        fed.universal(det, res, "SCH-CA-UNIVERSAL-MEALS",
                      f"California public school ({school_type}): breakfast and lunch free to every pupil who requests one "
                      f"(EC 49501.5, since {start:%B %Y})", "ca_universal_meals")
    else:
        if not lea:
            det.note("SCH-CA-PRIVATE-SCHOOLS", "private school: California's universal meals law does not apply; federal rules only", None)
        return fed.apply_federal(det, res)

    # What a household form is for once meals are free (SCH-CA-LCFF-*)
    no_applications = hh.facts.get("school_cep") or hh.facts.get("school_provision2_nonbase") or not participates
    if lea and no_applications:
        deadline = params.use("ca.cde.lcff_alt_income_form_deadline", as_of, det).value
        det.note("SCH-CA-LCFF-ALT-INCOME-FORM",
                 f"school does not collect meal applications this year: an Alternative Income Form received by "
                 f"{deadline} counts the pupil toward the LCFF unduplicated pupil count (it does not change meal eligibility)", None)
        det.links.append("ca:lcff_alternative_income_form")
    elif lea:
        det.note("SCH-CA-APPLICATION-STILL-REQUIRED", "school uses standard counting and claiming: the household meal "
                                                      "application is still collected and also counts for LCFF", None)
        det.links.append("ca:meal_application_for_lcff")
    return det
