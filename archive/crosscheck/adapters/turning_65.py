"""PolicyEngine adapter for the Turning 65 playbook.

PolicyEngine US models Medicare *premiums* only:
- ``base_part_a_premium`` (Person, YEAR): Part A premium from
  ``medicare_quarters_of_coverage`` (40+ free, 30-39 reduced, else full);
- ``gross_medicare_part_b_premium`` (Person, YEAR): standard Part B premium
  plus IRMAA from ``medicare_irmaa_magi_two_years_prior`` (TaxUnit) and filing status;
- ``income_adjusted_part_d_premium_surcharge`` (Person, YEAR): Part D IRMAA.

It does not model enrollment periods (IEP/GEP/SEP), coverage start dates, the
Part A/B/D late enrollment penalties, Medicare Secondary Payer rules, or
Medigap rights, so only the premium amounts are compared. Medicare
eligibility in PolicyEngine is age >= 65 (or 24 months of SSDI); it has no
Part B enrollment input, so only households already enrolled are compared.
"""

from __future__ import annotations

from datetime import date

PE_VARIABLES = ["base_part_a_premium", "gross_medicare_part_b_premium", "income_adjusted_part_d_premium_surcharge"]
KEYS = ("part_a_premium_monthly", "part_b_premium_monthly", "part_d_irmaa_monthly")


def pe_inputs(hh, as_of: date) -> dict:
    """Quarters of coverage per person (PolicyEngine defaults to 40)."""
    extra = {}
    for m in hh.members:
        q = m.facts.get("quarters_of_coverage")
        if q is not None:
            extra[m.id] = {"medicare_quarters_of_coverage": int(q)}
    return {"extra_person": extra}


def read(sim, hh, as_of: date) -> dict:
    y = str(as_of.year)
    magi = hh.applicant.facts.get("magi_two_years_prior")
    if magi is not None:
        # TaxUnit input; the generic situation builder only sets person/household inputs,
        # so it is set here before anything is calculated.
        sim.set_input("medicare_irmaa_magi_two_years_prior", y, [float(magi)])
    i = [m.id for m in hh.members].index(hh.applicant.id)
    pa = float(sim.calculate("base_part_a_premium", y)[i]) / 12
    pb = float(sim.calculate("gross_medicare_part_b_premium", y)[i]) / 12
    pd = float(sim.calculate("income_adjusted_part_d_premium_surcharge", y)[i]) / 12
    return {"status": "eligible", "tier": "ENROLLED",
            "part_a_premium_monthly": round(pa, 2), "part_b_premium_monthly": round(pb, 2),
            "part_d_irmaa_monthly": round(pd, 2)}


def ours(det) -> dict:
    out = {"status": det.status, "tier": det.tier}
    for k in KEYS:
        out[k] = round(float(det.amounts.get(k, 0.0)), 2)
    return out


def same(o: dict, p: dict) -> bool:
    return all(abs(o.get(k, 0.0) - p.get(k, 0.0)) < 0.01 for k in KEYS)
