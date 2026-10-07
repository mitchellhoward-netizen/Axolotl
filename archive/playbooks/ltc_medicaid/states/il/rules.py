"""Long-term care Medicaid (AABD medical) — Illinois.

Illinois (2026): asset limit $17,500 (same for one or two people); a community
spouse keeps a flat CSRA of $143,172; CSMNA = $4,066.50 minus the community
spouse's gross income; PNA $60 in a nursing facility; home equity limit
$752,000 (the federal minimum). Non-exempt resources above $17,500 do not
deny the case: they are added to what the resident owes the facility
(two-step budgeting), so the case is a spenddown that is met only if the
facility's charges absorb them. Transfers: 60-month look-back for nursing
home, supportive living and DoA HCBS waiver services; penalty = uncompensated
value / the facility's monthly (30-day) private rate, rounded up to two
decimals, no maximum, starting the later of the first day of the transfer
month or the date the person is otherwise eligible.
"""

from __future__ import annotations

import math
from datetime import date

from rulesarchive import params
from rulesarchive.determination import ELIGIBLE, INELIGIBLE, UNDETERMINED, Determination
from rulesarchive.household import Household

from playbooks.ltc_medicaid.federal import rules as fed

STATE = "il"


def _penalty(hh: Household, as_of: date, det: Determination, setting: str) -> bool | None:
    base = fed.baseline_date(hh, as_of)
    months = int(params.use("il.ltc.lookback_months", as_of, det).value)
    start = fed.months_before(base, months)
    tr = fed.window_transfers(hh, start, base, det, "LTC-IL-LOOKBACK")
    if not tr:
        det.note("LTC-IL-LOOKBACK", f"no non-allowable transfers in the 60-month look-back ({start} to {base})", True)
        return False
    unc = sum(t.amount for t in tr)
    rate = hh.facts.get("facility_private_rate_monthly")
    if rate is None:
        det.status = UNDETERMINED
        det.note("LTC-IL-PENALTY-DIVISOR", "the penalty divisor is the facility's (or, for HCBS, the Bureau of Long "
                 "Term Care's) monthly private rate, which was not given", None)
        det.unresolved("LTC-IL-OQ-01" if setting != "nursing_facility" else "LTC-IL-OQ-03")
        return None
    rate = float(rate)
    pm = math.ceil(unc / rate * 100 - 1e-9) / 100.0
    det.amounts["penalty_months"] = pm
    start_p = max(fed.first_of_month(min(t.when for t in tr)), fed.first_of_month(base))
    end_p = fed.penalty_end(start_p, pm)
    active = pm > 0 and start_p <= as_of < end_p
    det.note("LTC-IL-PENALTY-DIVISOR", f"${unc:,.0f} / facility private rate ${rate:,.0f} = {pm} months "
             f"(rounded up to two decimals), from {start_p} to {end_p}", not active)
    return active


def evaluate(hh: Household, as_of: date) -> Determination:
    det = Determination(fed.PROGRAM, STATE, as_of)
    setting = fed.gate(hh, as_of, det, STATE)
    if setting is None:
        return det

    he_limit = params.use("il.ltc.home_equity_limit", as_of, det).value
    if not fed.home_equity_test(hh, as_of, det, he_limit, "LTC-IL-HOME-EQUITY"):
        det.status, det.tier = INELIGIBLE, "home_equity"
        return det

    limit = float(params.use("il.aabd_medical.resource_limit", as_of, det)[1])
    cs = fed.community_spouse(hh)
    csra = None
    if cs is not None:
        csra = float(params.use("il.ltc.csra", as_of, det).value)
        det.note("LTC-IL-CSRA", f"community spouse keeps up to the flat CSRA ${csra:,.0f}", None)
    res, _ = fed.resources_after_csra(hh, det, csra, "LTC-IL-CSRA")
    excess = max(0.0, res - limit)
    det.note("LTC-IL-RESOURCES", f"non-exempt resources ${res:,.0f} vs the ${limit:,.0f} AABD medical limit"
             + (f": ${excess:,.0f} excess is applied to the cost of care (spenddown)" if excess else ""), not excess)
    if excess:
        det.amounts["excess_resources_applied"] = round(excess, 2)

    pen = _penalty(hh, as_of, det, setting)
    if pen is None:
        return det
    if pen:
        det.status, det.tier = INELIGIBLE, "transfer_penalty"
        det.links.append("medicaid:other_services_still_covered")
        return det

    if setting != "nursing_facility":
        if excess:
            det.status, det.tier = UNDETERMINED, "resource_spenddown"
            det.note("LTC-IL-RESOURCES", "HCBS waiver case with excess resources: spenddown rules for the waiver "
                     "are not modelled", None)
            det.unresolved("LTC-IL-OQ-04")
            return det
        det.status, det.tier = ELIGIBLE, setting
        return det

    a = hh.applicant
    pna = float(params.use("il.ltc.pna_nursing_home", as_of, det).value)
    csmia = 0.0
    if cs is not None:
        std = float(params.use("il.ltc.csmna_standard", as_of, det).value)
        csmia = fed.community_spouse_income_allowance(std, fed.gross_income(hh, cs.id))
        det.note("LTC-IL-CSMNA", f"CSMNA = ${std:,.2f} - community spouse gross income "
                 f"${fed.gross_income(hh, cs.id):,.2f} = ${csmia:,.2f}", None)
    if hh.facts.get("family_members") and cs is not None:
        det.note("LTC-IL-FMNA", "family maintenance needs allowance formula not established", None)
        det.unresolved("LTC-IL-OQ-02")
        det.status, det.tier = ELIGIBLE, setting
        return det
    credit = fed.post_eligibility(det, fed.gross_income(hh, a.id), pna, csmia, 0.0, fed.premiums(a), "LTC-IL-NH-CREDIT")
    cost = hh.facts.get("nursing_facility_monthly_cost", hh.facts.get("facility_private_rate_monthly"))
    owed = credit + excess
    if excess:
        det.amounts["patient_liability_first_month"] = round(owed, 2)
    if cost is not None and owed >= float(cost):
        det.status, det.tier = INELIGIBLE, "spenddown_not_met" if excess else "income_covers_cost"
        det.note("LTC-IL-NH-CREDIT", f"amount owed ${owed:,.2f} covers the ${float(cost):,.0f} monthly private rate: "
                 "spenddown not met", False)
        return det
    det.status, det.tier = ELIGIBLE, ("resource_spenddown" if excess else setting)
    return det
