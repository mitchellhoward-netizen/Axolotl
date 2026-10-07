"""School meals — Illinois.

Illinois uses the federal rules. Its Healthy School Meals for All Program
(105 ILCS 125/2.3, 2023) is "subject to appropriation" and opt-in per school
board, and no statewide funding for SY 2026-27 was found, so a household
above 185% FPL pays full price unless the school is in CEP (or a school board
proves participation in a funded HSMFA, ``il_hsmfa_participating``). Illinois
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
    if hh.facts.get("il_hsmfa_participating"):
        tier = det.tier
        det.links[:] = [l for l in det.links if not l.startswith("route:")]
        fed.universal(det, fed.FederalResult(tier=tier), "SCH-IL-HSMFA",
                      "school board participates in a funded Healthy School Meals for All Program: meals free to all students", "il_hsmfa")
        det.unresolved("SCH-IL-OQ-01")
    elif not funded.value:
        det.note("SCH-IL-HSMFA", "no funded statewide Healthy School Meals for All program was found for this school year; "
                                 "federal free / reduced / paid categories apply", None)
        if det.tier == "paid":
            det.unresolved("SCH-IL-OQ-01")
    return det
