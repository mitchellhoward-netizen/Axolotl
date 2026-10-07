"""PolicyEngine adapter for the Medicaid (enrollment and renewal) playbook.

PolicyEngine variables: ``is_medicaid_eligible`` (Person, YEAR) and
``medicaid_category`` (Person, YEAR: ADULT, PARENT, PREGNANT, SSI_RECIPIENT,
SENIOR_OR_DISABLED, MEDICALLY_NEEDY, ...). PolicyEngine works on annual
income against annual FPL percentages, models a "senior or disabled"
optional group with per-state income/asset parameters and a medically needy
flag, and does not model spenddown amounts, retroactive months, renewals or
New York's / Illinois's excess-resource spenddown.

Comparison: eligible vs not. Our "spenddown"/"share of cost" tiers count as
eligible (Medicaid once the excess is met); PolicyEngine's MEDICALLY_NEEDY
category counts as eligible too.
"""

from __future__ import annotations

from datetime import date

PE_VARIABLES = ["is_medicaid_eligible", "medicaid_category"]

PE_TIER = {
    "ADULT": "adult_expansion", "PARENT": "parent_caretaker", "PREGNANT": "pregnant",
    "SSI_RECIPIENT": "ssi_recipient", "SENIOR_OR_DISABLED": "senior_or_disabled",
    "MEDICALLY_NEEDY": "medically_needy", "NONE": None,
}


def pe_inputs(hh, as_of: date) -> dict:
    """Pass Medicare enrollment for people under 65 who have it (PolicyEngine infers it from age otherwise)."""
    extra = {}
    for m in hh.members:
        if m.age < 65 and (m.medicare_part_a or m.medicare_part_b):
            extra[m.id] = {"is_medicare_eligible": True}
    return {"extra_person": extra} if extra else {}


def read(sim, hh, as_of: date) -> dict:
    period = str(as_of.year)
    idx = [m.id for m in hh.members].index(hh.applicant.id)
    elig = bool(sim.calculate("is_medicaid_eligible", period)[idx])
    cat = str(sim.calculate("medicaid_category", period).decode_to_str()[idx])
    return {"status": "eligible" if elig else "ineligible", "tier": PE_TIER.get(cat.strip().upper().replace(" ", "_"), cat)}


def ours(det) -> dict:
    return {"status": det.status, "tier": det.tier}


def same(o: dict, p: dict) -> bool:
    return o["status"] == p["status"]


def federal_minimum(hh, as_of: date) -> dict:
    """Our federal-minimum adult-group test (133% + 5 points of the HHS guideline), for MAGI adults only."""
    from playbooks.medicaid.federal.rules import federal_adult_minimum

    det = federal_adult_minimum(hh, as_of)
    return {"status": det.status, "tier": det.tier}
