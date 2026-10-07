"""Disability playbook — California.

SSI is federal (playbooks/disability/federal/rules.py). California adds the
State Supplementary Payment (SSP), which SSA administers and pays together
with SSI as one check. The SSP level depends on the California living
arrangement code and the category (aged, blind, disabled); countable income
above the federal benefit rate reduces it (SI 01401.001, SI 02005.001 D.2).
SSI/SSP recipients get Medi-Cal automatically and, since June 2019, may get
CalFresh. Non-citizens denied SSI only for immigration status may get CAPI.

Household.facts used here
    ca_oss_code   A | B | C | D | F | J. Default: D when the federal one-third
                  reduction applies, J in a Medicaid medical facility, otherwise A
                  (C when facts.no_cooking_facilities is true and the person is not blind)
"""

from __future__ import annotations

from datetime import date

from rulesarchive import params
from rulesarchive.determination import ELIGIBLE, INELIGIBLE, Determination
from rulesarchive.household import Household

from playbooks.disability.federal import rules as fed

STATE = "ca"
DDS = "the California Department of Social Services, Disability Determination Service Division"


def oss_code(hh: Household) -> str:
    code = hh.facts.get("ca_oss_code")
    if code:
        return code
    la = fed.living_arrangement(hh)
    if la == "household_of_another":
        return "D"
    if la == "medical_facility":
        return "J"
    if hh.facts.get("no_cooking_facilities") and not hh.applicant.blind:
        return "C"
    return "A"


def _cat(p, as_of) -> str:
    # California pays the highest categorical supplement the person qualifies for (blind is highest).
    if p.blind:
        return "blind"
    return fed.category(p, as_of) or "disabled"


def level(code: str, cats: list[str], as_of: date, det: Determination) -> float:
    if len(cats) == 1:
        table = params.use("ca.ssp.payment_level_individual", as_of, det).value[code]
        key = "all" if "all" in table else cats[0]
        if code == "C" and key == "blind":
            key = "aged"   # blind recipients are not eligible for OSS C; caller avoids this
    else:
        table = params.use("ca.ssp.payment_level_couple", as_of, det).value[code]
        key = "all" if "all" in table else "/".join(sorted(cats))
    return float(table[key])


def evaluate(hh: Household, as_of: date) -> Determination:
    det = Determination(fed.PROGRAM, STATE, as_of)
    if hh.facts.get("claim") == "ssdi":
        return fed.ssdi(hh, as_of, det, DDS)

    r = fed.ssi_federal(hh, as_of, det)
    a = hh.applicant
    ssp: float | None = 0.0
    if not r.state_payable:
        det.note("DIS-CA-SSP-ELIGIBILITY", f"no SSP: ineligible for SSI for a reason other than income ({r.reason})", False)
        if r.reason == "immigration status":
            det.links.append("ca_capi:possible")
            det.note("DIS-CA-CAPI", "a non-citizen denied SSI/SSP only because of immigration status may qualify for "
                     "CAPI, a state-funded program applied for at the county social services agency", None)
    else:
        code = oss_code(hh)
        if r.unit == "couple":
            cats = [_cat(a, as_of), _cat(hh.spouse, as_of)]
        else:
            cats = [_cat(a, as_of)]
        lvl = level(code, cats, as_of, det)
        if r.unit == "deemed_spouse" and r.deeming_couple_countable is not None:
            # SI 01320.430: couple-rate computation, limited to the individual computation.
            lvl_c = level(code, [cats[0], cats[0]], as_of, det)
            f2 = fed.fbr(as_of, det, 2) - (float(params.use("federal.ssi.vtr_monthly", as_of, det)[2]) if r.vtr else 0.0)
            ind = max(0.0, lvl - max(0.0, r.own_countable - r.benefit_rate))
            cpl_excess = max(0.0, r.deeming_couple_countable - f2)
            elig_rate = max(lvl, lvl_c)
            if cpl_excess >= elig_rate:
                ssp = 0.0
            else:
                ssp = round(min(ind, max(0.0, min(lvl, lvl_c) - cpl_excess)), 2)
            det.note("DIS-CA-SSP-DEEMING", f"ineligible spouse: SSP = lower of individual level ${lvl:,.2f} and couple level "
                     f"${lvl_c:,.2f}, less combined countable income above the couple rate (${cpl_excess:,.2f}), and not more "
                     f"than the SSP without deeming (${ind:,.2f}) = ${ssp:,.2f}", True)
        else:
            excess = r.excess_over_fbr
            ssp = round(lvl - excess, 2) if excess < lvl else 0.0
            det.note("DIS-CA-SSP-AMOUNT", f"living arrangement {code}, {'/'.join(cats)}: SSP level ${lvl:,.2f} - countable "
                     f"income above the federal rate ${excess:,.2f} = SSP ${ssp:,.2f}", ssp > 0)
    fed.set_amounts(det, r, ssp)
    if det.status == ELIGIBLE:
        det.note("DIS-CA-SSP-PAID-BY-SSA", "SSA pays the SSP with the SSI payment (one combined payment)", None)
        det.links.append("medicaid:automatic_medi_cal_with_ssi_ssp")
        det.note("DIS-CA-MEDI-CAL", "SSI/SSP recipients get Medi-Cal automatically", None)
        det.links.append("snap:calfresh_open_to_ssi_since_2019")
    fed.link_common(det, r)
    if det.status == INELIGIBLE and r.reason == "immigration status":
        det.tier = None
    return det
