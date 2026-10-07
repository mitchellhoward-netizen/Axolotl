"""Long-term care Medi-Cal — California.

California (2026): property limit $130,000 for one person (no property test
in 2024-2025); a community spouse keeps the full $162,660 CSRA; MMMNA $4,067;
PNA $35. Transfers: 30-month look-back counted from the month before the
application, but months January 2024-December 2025 are never reviewed; a
transfer is disqualifying only if the person was over the property limit and
gave away more than the statewide average private pay rate ($14,440 in
2026); the period of ineligibility (POI) is whole months (no partial month),
starts in the month of the transfer and is at most 30 months. Community-based
programs have no POI. The federal home equity limit is not applied in
California yet (an open question, see CA-LTC-CONFLICT-01).
"""

from __future__ import annotations

import math
from datetime import date

from rulesarchive import params
from rulesarchive.determination import ELIGIBLE, INELIGIBLE, UNDETERMINED, Determination
from rulesarchive.household import Household

from playbooks.ltc_medicaid.federal import rules as fed

STATE = "ca"
BLACKOUT = (date(2024, 1, 1), date(2025, 12, 31))   # LTC-CA-TRANSFER-BLACKOUT


def _poi(hh: Household, as_of: date, det: Determination, limit: float) -> bool | None:
    base = fed.baseline_date(hh, as_of)
    months = int(params.use("ca.medi_cal_ltc.lookback_months", as_of, det).value)
    app_month = fed.first_of_month(base)
    start = fed.add_months(app_month, -months)
    window = [t for t in fed.transfers(hh)]
    reviewed = []
    for t in window:
        if t.when < start:
            det.note("LTC-CA-LOOKBACK", f"transfer of ${t.amount:,.0f} on {t.when} is before the 30-month look-back "
                     f"(which starts {start})", None)
            continue
        if BLACKOUT[0] <= t.when <= BLACKOUT[1]:
            det.note("LTC-CA-TRANSFER-BLACKOUT", f"transfer of ${t.amount:,.0f} on {t.when} falls in January 2024 - "
                     "December 2025, when there was no property test: not reviewed", None)
            continue
        if fed.exempt_transfer(t):
            det.note("LTC-FED-EXEMPT-TRANSFERS", f"transfer on {t.when} to {t.recipient} is exempt", True)
            continue
        reviewed.append(t)
    if not reviewed:
        det.note("LTC-CA-LOOKBACK", f"no reviewable transfers in the look-back ({start} to {base})", True)
        return False
    appr = float(params.use("ca.medi_cal_ltc.appr", as_of, det).value)
    cap = int(params.use("ca.medi_cal_ltc.max_poi_months", as_of, det).value)
    active = False
    total_months = 0
    for t in reviewed:
        if t.resources_at_transfer is None:
            det.status = UNDETERMINED
            det.note("LTC-CA-DISQUALIFYING", f"transfer on {t.when}: property held before the transfer not given, so "
                     "whether it was a disqualifying transfer cannot be decided", None)
            det.unresolved("LTC-CA-OQ-04")
            return None
        if t.resources_at_transfer <= limit or t.amount <= appr:
            det.note("LTC-CA-DISQUALIFYING", f"transfer of ${t.amount:,.0f} on {t.when}: not disqualifying "
                     f"(property ${t.resources_at_transfer:,.0f} vs ${limit:,.0f} limit; APPR ${appr:,.0f})", True)
            continue
        m = min(cap, int(math.floor(t.amount / appr)))
        total_months += m
        s = fed.first_of_month(t.when)
        e = fed.add_months(s, m)
        det.note("LTC-CA-POI", f"${t.amount:,.0f} / APPR ${appr:,.0f} = {m} whole months (no partial month, "
                 f"at most {cap}), {s} to {e}", not (s <= as_of < e))
        active = active or (s <= as_of < e)
    det.amounts["penalty_months"] = float(total_months)
    return active


def evaluate(hh: Household, as_of: date) -> Determination:
    det = Determination(fed.PROGRAM, STATE, as_of)
    setting = fed.gate(hh, as_of, det, STATE)
    if setting is None:
        return det

    # home equity: not applied in California (conflict recorded)
    if fed.home_equity(hh) > params.use("federal.ltc.home_equity_minimum", as_of, det).value \
            and not fed.home_equity_exception(hh):
        det.status = UNDETERMINED
        det.note("LTC-CA-HOME-EQUITY", "home equity above the federal minimum limit; whether California applies the "
                 "limit before 2028 is unresolved", None)
        det.unresolved("LTC-CA-OQ-01")
        return det

    applies = params.use("ca.medi_cal_ltc.asset_test_applies", as_of, det).value
    if not applies:
        det.note("LTC-CA-ASSET-TEST", "no property test for Non-MAGI Medi-Cal in 2024-2025", True)
        limit = float("inf")
    else:
        limit = float(params.use("ca.medi_cal_ltc.asset_limit", as_of, det)[1])
        cs = fed.community_spouse(hh)
        csra = None
        if cs is not None:
            csra = float(params.use("ca.medi_cal_ltc.csra", as_of, det).value)
            det.note("LTC-CA-CSRA", f"community spouse keeps the full CSRA ${csra:,.0f}", None)
        res, _ = fed.resources_after_csra(hh, det, csra, "LTC-CA-CSRA")
        if res > limit:
            det.status, det.tier = INELIGIBLE, "excess_resources"
            det.note("LTC-CA-ASSET-LIMIT", f"net non-exempt property ${res:,.0f} exceeds the ${limit:,.0f} limit "
                     "(may spend down by the end of the month)", False)
            return det
        det.note("LTC-CA-ASSET-LIMIT", f"net non-exempt property ${res:,.0f} within the ${limit:,.0f} limit", True)

    if setting == "nursing_facility" and applies:
        pen = _poi(hh, as_of, det, limit)
        if pen is None:
            return det
        if pen:
            det.status, det.tier = INELIGIBLE, "transfer_penalty"
            det.links.append("medicaid:other_services_still_covered")
            return det
    elif setting != "nursing_facility":
        det.note("LTC-CA-NO-POI-COMMUNITY", "community-based Medi-Cal programs have no period of ineligibility", None)

    if setting == "nursing_facility":
        a = hh.applicant
        cs = fed.community_spouse(hh)
        pna = float(params.use("ca.medi_cal_ltc.pna", as_of, det).value)
        csmia = 0.0
        if cs is not None:
            mmmna = float(params.use("ca.medi_cal_ltc.mmmna", as_of, det).value)
            cs_inc = fed.gross_income(hh, cs.id) - fed.premiums(cs)
            csmia = fed.community_spouse_income_allowance(mmmna, cs_inc)
            det.note("LTC-CA-SPOUSAL-ALLOCATION", f"MMMNA ${mmmna:,.0f} - community spouse income net of health "
                     f"premiums ${cs_inc:,.2f} = ${csmia:,.2f}", None)
        if hh.facts.get("family_members") and cs is not None:
            det.note("LTC-CA-FAMILY-ALLOWANCE", "family allowance amount not established for California", None)
            det.unresolved("LTC-CA-OQ-05")
            det.status, det.tier = ELIGIBLE, setting
            return det
        soc = fed.post_eligibility(det, fed.gross_income(hh, a.id), pna, csmia, 0.0, fed.premiums(a), "LTC-CA-SOC")
        cost = hh.facts.get("nursing_facility_monthly_cost")
        if cost is not None and soc >= float(cost):
            det.status, det.tier = INELIGIBLE, "income_covers_cost"
            det.note("LTC-CA-SOC", f"share of cost ${soc:,.2f} covers the ${float(cost):,.0f} monthly cost", False)
            return det

    det.status, det.tier = ELIGIBLE, setting
    return det
