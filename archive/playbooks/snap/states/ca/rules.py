"""CalFresh (SNAP) — California.

California uses the federal income limits, allotments, standard deduction,
shelter cap and resource limits. It adds: one statewide SUA (heating/cooling,
already reduced by the $4 SMD offset), LUA and TUA; the State Utility
Assistance Subsidy (SUAS) that gives the SUA to households with an elderly
or disabled member; the $150 Standard Medical Deduction demonstration; and
Modified/Broad-Based Categorical Eligibility at 200% FPL with no resource test.
"""

from __future__ import annotations

from datetime import date

from rulesarchive import params
from rulesarchive.determination import Determination
from rulesarchive.household import Household

from playbooks.snap.federal import rules as fed

STATE = "ca"


def medical_deduction(hh: Household, as_of: date, det: Determination, ed: bool, medical: float) -> float:
    if not ed or medical <= 0:
        return 0.0
    thr = params.use("federal.snap.medical_expense_threshold_monthly", as_of, det).value
    if medical <= thr:
        det.note("SNAP-CA-SMD", f"medical costs ${medical:,.2f} not over ${thr}: no deduction", False)
        return 0.0
    smd = float(params.use("ca.calfresh.standard_medical_deduction_monthly", as_of, det).value)
    top = float(params.use("ca.calfresh.smd_actual_expense_threshold_monthly", as_of, det).value)
    if medical <= top:
        det.note("SNAP-CA-SMD", f"medical costs ${medical:,.2f} between $35.01 and ${top:,.2f}: standard medical deduction ${smd:,.0f}", True)
        return smd
    d = max(smd, medical - thr)
    det.note("SNAP-CA-SMD", f"medical costs ${medical:,.2f} over ${top:,.0f}: actual costs over $35 = ${d:,.2f}", True)
    return d


def utility_allowance(hh: Household, as_of: date, det: Determination, ed: bool):
    ua = params.use("ca.calfresh.utility_allowances_monthly", as_of, det)
    billed = fed.utilities_billed(hh)
    if "heating_cooling" in billed:
        det.note("SNAP-CA-SUA", f"heating/cooling costs: SUA ${ua['heating_cooling']}", None)
        return float(ua["heating_cooling"]), "SUA"
    if ed:
        det.note("SNAP-CA-SUAS", "elderly/disabled household without its own heating/cooling bill: the State Utility "
                 f"Assistance Subsidy confers the SUA ${ua['heating_cooling']}", None)
        return float(ua["heating_cooling"]), "SUA (SUAS)"
    if not hh.facts.get("ca_suas_limit_in_effect"):
        raise fed.Unresolved("SNAP-CA-OQ-01", "SNAP-CA-SUAS",
                             "household without an elderly/disabled member and without heating/cooling costs: "
                             "whether it still gets the SUA through SUAS depends on the CalSAWS automation date")
    others = billed - {"heating_cooling"}
    if len(others) >= 2:
        det.note("SNAP-CA-SUA", f"two or more non-heating utilities: LUA ${ua['limited']}", None)
        return float(ua["limited"]), "LUA"
    if "phone" in others:
        det.note("SNAP-CA-SUA", f"telephone only: TUA ${ua['telephone']}", None)
        return float(ua["telephone"]), "TUA"
    return 0.0, "none"


def bbce(hh: Household, as_of: date, det: Determination, ed: bool, gross: float, b) -> fed.BBCEResult:
    if hh.facts.get("sanctioned_or_ipv_member"):
        return fed.BBCEResult(False, "SNAP-CA-BBCE", "a sanctioned or IPV-disqualified member blocks MCE")
    lim = float(fed.by_size(params.use("ca.calfresh.bbce_gross_income_limit_monthly", as_of, det), b.size))
    ok = gross <= lim
    return fed.BBCEResult(ok, "SNAP-CA-BBCE",
                          f"MCE/BBCE: gross ${gross:,.2f} {'<=' if ok else '>'} 200% FPL ${lim:,.0f}"
                          + (" — no resource test" if ok else ""), net_test=None, oq="SNAP-CA-OQ-02")


CONFIG = fed.StateConfig(state=STATE, medical_deduction=medical_deduction,
                         utility_allowance=utility_allowance, bbce=bbce)


def evaluate(hh: Household, as_of: date) -> Determination:
    return fed.run(hh, as_of, CONFIG)
