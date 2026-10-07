"""Long-term care Medicaid — New York.

New York (2026): resource level $33,038 for the institutionalized person;
community spouse keeps the greater of $74,820 or the spousal share up to
$162,660; MMMNA $4,066.50; PNA $50; family member allowance one-third of
($2,705 - member income), at most $902; home equity limit $1,130,000; transfer
penalty = uncompensated value (reduced by any room under the resource level)
divided by the regional nursing home rate, partial months kept, starting the
later of the month after the transfer or the month the person is otherwise
eligible in a nursing home. The 30-month look-back for community-based
long-term care is enacted but not implemented, so home care has no transfer
penalty today.
"""

from __future__ import annotations

from datetime import date

from rulesarchive import params
from rulesarchive.determination import ELIGIBLE, INELIGIBLE, UNDETERMINED, Determination
from rulesarchive.household import Household

from playbooks.ltc_medicaid.federal import rules as fed

STATE = "ny"


def _penalty(hh: Household, as_of: date, det: Determination, resources: float, limit: float) -> bool:
    """Returns True when a transfer penalty period covers ``as_of`` (nursing facility services not paid)."""
    base = fed.baseline_date(hh, as_of)
    months = int(params.use("federal.ltc.lookback_months", as_of, det).value)
    start = fed.months_before(base, months)
    tr = fed.window_transfers(hh, start, base, det, "LTC-NY-LOOKBACK")
    if not tr:
        det.note("LTC-NY-LOOKBACK", f"no non-exempt transfers in the 60-month look-back ({start} to {base})", True)
        return False
    total = sum(t.amount for t in tr)
    room = max(0.0, limit - resources)
    unc = max(0.0, total - room)
    det.note("LTC-NY-UNCOMPENSATED", f"uncompensated transfers ${total:,.0f}"
             + (f" - ${room:,.0f} (resources below the ${limit:,.0f} level) = ${unc:,.0f}" if room else ""), None)
    region = hh.facts.get("ny_region")
    if not region:
        det.status = UNDETERMINED
        det.note("LTC-NY-PENALTY-DIVISOR", "facility region not given; the regional rate cannot be chosen", None)
        det.unresolved("LTC-NY-OQ-04")
        return True
    rate = params.use("ny.ltc.regional_rate", as_of, det)[region]
    pm = fed.federal_penalty_months(unc, rate)
    det.amounts["penalty_months"] = pm
    first_after = fed.add_months(fed.first_of_month(min(t.when for t in tr)), 1)
    start_p = max(first_after, fed.first_of_month(base))
    end_p = fed.penalty_end(start_p, pm)
    active = pm > 0 and start_p <= as_of < end_p
    det.note("LTC-NY-PENALTY-DIVISOR", f"${unc:,.0f} / ${rate:,} ({region} regional rate) = {pm} months, "
             f"from {start_p} to {end_p}", not active)
    return active


def evaluate(hh: Household, as_of: date) -> Determination:
    det = Determination(fed.PROGRAM, STATE, as_of)
    setting = fed.gate(hh, as_of, det, STATE)
    if setting is None:
        return det

    # home equity
    he_limit = params.use("ny.ltc.home_equity_limit", as_of, det).value
    if not fed.home_equity_test(hh, as_of, det, he_limit, "LTC-NY-HOME-EQUITY"):
        det.status, det.tier = INELIGIBLE, "home_equity"
        return det

    # resources (spousal impoverishment when there is a community spouse)
    limit = params.use("ny.ltc.resource_limit", as_of, det)[1]
    cs = fed.community_spouse(hh)
    csra = None
    if cs is not None:
        mn = params.use("ny.ltc.csra_minimum", as_of, det).value
        mx = params.use("ny.ltc.csra_maximum", as_of, det).value
        snap = fed.snapshot_total(hh)
        csra = fed.spousal_share_csra(snap, mn, mx)
        det.note("LTC-NY-CSRA", f"spousal share ${snap / 2:,.0f} (half of ${snap:,.0f} at the snapshot); CSRA = "
                 f"greater of ${mn:,} or the share up to ${mx:,} = ${csra:,.0f}", None)
    res, _ = fed.resources_after_csra(hh, det, csra, "LTC-NY-CSRA")
    if res > limit:
        det.status, det.tier = INELIGIBLE, "excess_resources"
        det.note("LTC-NY-RESOURCES", f"countable resources ${res:,.0f} exceed the ${limit:,} resource level", False)
        return det
    det.note("LTC-NY-RESOURCES", f"countable resources ${res:,.0f} within the ${limit:,} resource level", True)

    # transfers
    if setting == "nursing_facility":
        if _penalty(hh, as_of, det, res, limit):
            if det.status != UNDETERMINED:
                det.status, det.tier = INELIGIBLE, "transfer_penalty"
                det.links.append("medicaid:other_services_still_covered")
            return det
    else:
        det.note("LTC-NY-CBLTC-LOOKBACK", "community-based long-term care: New York's 30-month look-back is enacted "
                 "but not implemented, so transfers are not penalized", None)

    # post-eligibility income (NAMI) — nursing facility only
    if setting == "nursing_facility":
        a = hh.applicant
        income = fed.gross_income(hh, a.id)
        pna = float(params.use("ny.ltc.pna_nursing_home", as_of, det).value)
        csmia = 0.0
        if cs is not None:
            mmmna = float(params.use("ny.ltc.mmmna", as_of, det).value)
            csmia = fed.community_spouse_income_allowance(mmmna, fed.gross_income(hh, cs.id))
            det.note("LTC-NY-CSMIA", f"MMMNA ${mmmna:,.2f} - community spouse income "
                     f"${fed.gross_income(hh, cs.id):,.2f} = ${csmia:,.2f}", None)
        fa = 0.0
        fams = hh.facts.get("family_members") or []
        if fams and cs is not None:
            std = float(params.use("ny.ltc.family_allowance_standard", as_of, det).value)
            mx = float(params.use("ny.ltc.family_allowance_maximum", as_of, det).value)
            fa = sum(fed.family_allowance(std, float(f.get("monthly_income", 0)), mx) for f in fams)
            det.note("LTC-NY-FAMILY-ALLOWANCE", f"family member allowance(s) ${fa:,.2f}", None)
        nami = fed.post_eligibility(det, income, pna, csmia, fa, fed.premiums(a), "LTC-NY-NAMI")
        cost = hh.facts.get("nursing_facility_monthly_cost")
        if cost is not None and nami >= float(cost):
            det.status, det.tier = INELIGIBLE, "income_covers_cost"
            det.note("LTC-NY-NAMI", f"NAMI ${nami:,.2f} covers the ${float(cost):,.0f} monthly cost of care", False)
            return det

    det.status, det.tier = ELIGIBLE, setting
    return det
