"""School meals — Illinois.

Illinois uses the federal rules. Its Healthy School Meals for All Program
(105 ILCS 125/2.3, 2023) is "subject to appropriation" and opt-in per school
board; neither the FY2026 (P.A. 104-0003) nor the FY2027 (P.A. 104-0464)
appropriation act funds it, so a household above 185% FPL pays full price
unless the school is in CEP. ``il_hsmfa_participating`` (a school board that
reports participating) gives free meals to all only in a year the parameter
il.isbe.hsmfa_statewide_funded is true. Illinois
directly certifies with Medicaid for free AND reduced-price meals since SY 2022-23.
"""

from __future__ import annotations

from datetime import date

from rulesarchive import params
from rulesarchive.determination import Determination
from rulesarchive.household import Household

from playbooks.school_meals.federal import rules as fed

STATE = "il"


def evaluate(hh: Household, as_of: date) -> Determination:
    det = Determination(fed.PROGRAM, STATE, as_of)
    dcm_type = params.use("il.isbe.dcm_type", as_of, det).value
    det = fed.evaluate_federal(hh, as_of, det, dcm_type=dcm_type, dcm_rule="SCH-IL-DCM-FREE-REDUCED")
    if det.tier == "free_universal" or hh.facts.get("school_participates_nslp", True) is False:
        return det
    funded = params.use("il.isbe.hsmfa_statewide_funded", as_of, det)
    if funded.value and hh.facts.get("il_hsmfa_participating"):
        tier = det.tier
        det.links[:] = [l for l in det.links if not l.startswith("route:")]
        fed.universal(det, fed.FederalResult(tier=tier), "SCH-IL-HSMFA",
                      "school board participates in a funded Healthy School Meals for All Program: meals free to all students", "il_hsmfa")
    elif hh.facts.get("il_hsmfa_participating"):
        det.note("SCH-IL-HSMFA", "the school board reports Healthy School Meals for All, but the State appropriation act for "
                                 "this fiscal year has no Healthy School Meals for All line, so no State reimbursement backs "
                                 "free meals for all; federal free / reduced / paid categories apply unless the school is a "
                                 "CEP school or pays for universal meals itself", None)
    else:
        det.note("SCH-IL-HSMFA", "no State appropriation for Healthy School Meals for All this fiscal year; "
                                 "federal free / reduced / paid categories apply", None)
    return det
