"""PolicyEngine adapter for the Medicare Savings Program playbook.

PolicyEngine variable: ``msp_category`` (Person, MONTH) -> NONE | QMB | SLMB | QI.
It models the federal-minimum tiers (100/120/135% FPL) with a per-state flag
for whether the asset test applies; it does not model state expansions such
as New York's 138%/186% levels, QDWI, or the QI/Medicaid exclusion. For
California it keeps the 2024 "no asset test" flag (no 2026 reinstatement);
for Illinois it applies the $20 SSI exclusion, not Illinois's $25.
"""

from __future__ import annotations

from datetime import date

PE_VARIABLES = ["msp_category", "msp_countable_income"]


def pe_inputs(hh, as_of: date) -> dict:
    """Extra PolicyEngine inputs beyond the generic situation (none needed)."""
    return {}


def read(sim, hh, as_of: date) -> dict:
    period = f"{as_of.year}-{as_of.month:02d}"
    pid_index = [m.id for m in hh.members].index(hh.applicant.id)
    cat = str(sim.calculate("msp_category", period).decode_to_str()[pid_index])
    inc = float(sim.calculate("msp_countable_income", period)[pid_index])
    tier = None if cat == "NONE" else cat
    return {"status": "eligible" if tier else "ineligible", "tier": tier, "countable_income": round(inc, 2)}


def ours(det) -> dict:
    return {"status": det.status, "tier": det.tier}


def same(o: dict, p: dict) -> bool:
    return o["status"] == p["status"] and o["tier"] == p["tier"]


def federal_minimum(hh, as_of: date) -> dict:
    """Our federal-minimum result (federal tiers, PolicyEngine's asset-test flag
    for the state). Isolates the shared income-counting logic from state
    expansions: this column should agree with PolicyEngine exactly."""
    from playbooks.msp.federal import rules as fed
    from rulesarchive.determination import Determination

    from rulesarchive.params import ParameterUnresolved

    asset_test = hh.state not in {"ca", "ny"}   # PolicyEngine parameters/.../asset/applies.yaml (2024-)
    try:
        det = fed.federal_tiers(hh, as_of, Determination("msp", hh.state, as_of), resource_test=asset_test)
    except ParameterUnresolved:   # the federal tables are held for 2026 only
        return {"status": "undetermined", "tier": None}
    return {"status": det.status, "tier": det.tier}
