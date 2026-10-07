"""PolicyEngine adapter for the school meals playbook.

PolicyEngine variables read (SPMUnit, YEAR):
  school_meal_tier                      FREE | REDUCED | PAID; FREE already includes
                                        PolicyEngine's state universal-meal flag
                                        (CA from 2022-07-01, NY from 2025-07-01, IL never)
  school_meal_fpg_ratio                 countable income / the period year's poverty guideline
  meets_school_meal_categorical_eligibility
                                        SNAP / TANF / FDPIR / foster / homeless / runaway /
                                        migrant / Head Start for anyone in the SPM unit
  state_has_universal_free_school_meals

PolicyEngine does not model CEP, direct certification with Medicaid, the
30-operating-day carry-over, whether a school participates in the NSLP, private
vs public schools, or which child the question is about (its tier is for the
whole SPM unit). It uses the poverty guideline of the period's calendar year,
not the July-June school-year income eligibility guidelines.

``federal_minimum`` compares our *federal category* (before CEP and state
universal meals) with a federal tier derived from PolicyEngine's own outputs
(categorical flag, then FPG ratio <= 1.30 / <= 1.85) to separate logic
differences from universal-meal policy differences.
"""

from __future__ import annotations

from datetime import date

from playbooks.school_meals.federal.rules import FREQ_PER_YEAR

PE_VARIABLES = ["school_meal_tier", "school_meal_fpg_ratio", "meets_school_meal_categorical_eligibility",
                "state_has_universal_free_school_meals"]

INCOME_VAR = {"earned": "employment_income", "self_employment": "self_employment_income",
              "social_security": "social_security", "unemployment": "unemployment_compensation",
              "child_support": "child_support_received", "pension": "pension_income"}


def pe_inputs(hh, as_of: date) -> dict:
    person: dict = {}
    for r in hh.facts.get("reported_income") or []:
        owner = r.get("owner") or hh.members[0].id
        var = INCOME_VAR.get(r["kind"], "miscellaneous_income")
        person.setdefault(owner, {})
        person[owner][var] = person[owner].get(var, 0) + float(r["amount"]) * FREQ_PER_YEAR[r["frequency"]]
    for m in hh.members:
        if m.receives("foster_care"):
            person.setdefault(m.id, {})["was_in_foster_care"] = True
        if m.facts.get("migrant"):
            person.setdefault(m.id, {})["is_migratory_child"] = True
        if m.facts.get("runaway"):
            person.setdefault(m.id, {})["is_runaway_child"] = True
    spm = {"receives_snap": hh.anyone_receives("snap"), "takes_up_snap_if_eligible": hh.anyone_receives("snap"),
           "receives_tanf": hh.anyone_receives("tanf"), "takes_up_tanf_if_eligible": hh.anyone_receives("tanf")}
    household = {}
    if any(m.receives("homeless_liaison") or m.facts.get("homeless") for m in hh.members):
        household["is_homeless"] = True
    return {"extra_person": person, "extra_spm": spm, "extra_household": household}


def read(sim, hh, as_of: date) -> dict:
    y = str(as_of.year)
    tier = str(sim.calculate("school_meal_tier", y).decode_to_str()[0]).lower()
    ratio = float(sim.calculate("school_meal_fpg_ratio", y)[0])
    cat = bool(sim.calculate("meets_school_meal_categorical_eligibility", y)[0])
    universal = bool(sim.calculate("state_has_universal_free_school_meals", y)[0])
    eps = 1e-6   # PolicyEngine arrays are float32; 61,050 / 33,000 reads back as 1.8500000238
    fed = "free" if (cat or ratio <= 1.30 + eps) else ("reduced" if ratio <= 1.85 + eps else "paid")
    return {"status": "ineligible" if tier == "paid" else "eligible", "tier": tier,
            "federal_tier": fed, "fpg_ratio": round(ratio, 4), "categorical": cat, "state_universal": universal}


def ours(det) -> dict:
    tier = "free" if det.tier == "free_universal" else det.tier
    return {"status": det.status, "tier": tier, "archive_tier": det.tier}


def same(o: dict, p: dict) -> bool:
    if o.get("basis") == "federal":
        return o["tier"] == p["federal_tier"]
    return o["status"] == p["status"] and o["tier"] == p["tier"]


def federal_minimum(hh, as_of: date) -> dict:
    """Our federal category for the student, before CEP and state universal meals."""
    from playbooks.school_meals.federal import rules as fed
    from rulesarchive.determination import Determination
    from rulesarchive import params

    det = Determination("school_meals", hh.state, as_of)
    dcm = {"ca": "ca.cde.dcm_type", "ny": "ny.nysed.dcm_type", "il": "il.isbe.dcm_type"}[hh.state]
    dcm_type = params.get(dcm, as_of).value
    res = fed.federal_category(hh, as_of, det, dcm_type=dcm_type,
                               dcm_available=not (hh.state == "ca" and hh.facts.get("school_type") == "private"))
    return {"status": "eligible" if res.tier in ("free", "reduced") else "ineligible", "tier": res.tier,
            "basis": "federal"}
