"""Turn an archive Household into a PolicyEngine US situation.

Only run inside the separate PolicyEngine virtualenv (see crosscheck/README.md).
This file contains no PolicyEngine code; it only builds the JSON input that
PolicyEngine's public Simulation API accepts.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from rulesarchive.household import Household

# archive income kind -> PolicyEngine person-level input variable (annual)
INCOME_VARS = {
    "earned": "employment_income",
    "self_employment": "self_employment_income",
    "social_security": "social_security_retirement",
    "ssi": "ssi_reported",
    "pension": "taxable_pension_income",
    "veterans": "veterans_benefits",
    "unemployment": "unemployment_compensation",
    "child_support": "child_support_received",
    "alimony": "alimony_income",
    "interest": "taxable_interest_income",
    "dividends": "qualified_dividend_income",
    "rental": "rental_income",
    "workers_comp": "workers_compensation",
}
ASSET_VARS = {"cash": "bank_account_assets", "investments": "stock_assets", "retirement": "stock_assets"}


def build(hh: Household, as_of: date, extra_person: dict | None = None, extra_household: dict | None = None,
          extra_spm: dict | None = None, extra_tax_unit: dict | None = None) -> dict[str, Any]:
    y = str(as_of.year)
    people: dict[str, Any] = {}
    for m in hh.members:
        p: dict[str, Any] = {"age": {y: m.age}}
        if m.disabled:
            p["is_disabled"] = {y: True}
            p["is_ssi_disabled"] = {y: True}
        if m.blind:
            p["is_blind"] = {y: True}
        if m.age < 65 and m.medicare_part_a and "ssdi" in m.benefits:
            p["months_receiving_social_security_disability"] = {y: 24}
        if "medicaid" in m.benefits:
            p["receives_medicaid"] = {y: True}
        people[m.id] = p
    for inc in hh.incomes:
        owner = inc.owner or hh.members[0].id
        var = INCOME_VARS.get(inc.kind)
        if var is None:
            continue
        if inc.kind == "social_security" and hh.person(owner).age < 65 and "ssdi" in hh.person(owner).benefits:
            var = "social_security_disability"
        people[owner][var] = {y: people[owner].get(var, {}).get(y, 0) + inc.monthly * 12}
    for a in hh.assets:
        var = ASSET_VARS.get(a.kind)
        if var is None:
            continue
        owner = a.owner or hh.members[0].id
        people[owner][var] = {y: people[owner].get(var, {}).get(y, 0) + a.value}
    for pid, extra in (extra_person or {}).items():
        people.setdefault(pid, {}).update({k: {y: v} for k, v in extra.items()})
    ids = [m.id for m in hh.members]
    spouses = [m.id for m in hh.members if m.relationship in ("self", "spouse")]
    marital = {"mu": {"members": spouses}} if len(spouses) == 2 else {f"mu_{i}": {"members": [i]} for i in ids if i in spouses}
    for i in ids:
        if not any(i in mu["members"] for mu in marital.values()):
            marital[f"mu_{i}"] = {"members": [i]}
    return {
        "people": people,
        "marital_units": marital,
        "tax_units": {"tu": {"members": ids, **{k: {y: v} for k, v in (extra_tax_unit or {}).items()}}},
        "spm_units": {"spm": {"members": ids, **{k: {y: v} for k, v in (extra_spm or {}).items()}}},
        "families": {"fam": {"members": ids}},
        "households": {"hh": {"members": ids, "state_code": {y: hh.state.upper()},
                              **{k: {y: v} for k, v in (extra_household or {}).items()}}},
    }
