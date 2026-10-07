"""SNAP — Illinois.

Illinois uses the federal net income limit, allotments, shelter cap and
resource limits, but its own standard deduction ($4 below the FNS table),
four utility standards, a $185 Standard Medical Deduction, child support
treated as an income exclusion, and categorical eligibility for all
households at 165% FPL (200% FPL with a qualifying elderly/disabled member),
with no resource test and no net income test.
"""

from __future__ import annotations

from datetime import date

from rulesarchive import params
from rulesarchive.determination import Determination
from rulesarchive.household import Household

from playbooks.snap.federal import rules as fed

STATE = "il"
LIHEAP_QM_ONLY_FROM = date(2025, 9, 26)   # MR #25.33


def medical_deduction(hh: Household, as_of: date, det: Determination, ed: bool, medical: float) -> float:
    if not ed or medical <= 0:
        return 0.0
    thr = params.use("federal.snap.medical_expense_threshold_monthly", as_of, det).value
    if medical <= thr:
        det.note("SNAP-IL-SMD", f"medical costs ${medical:,.2f} not over ${thr}: no deduction", False)
        return 0.0
    smd = float(params.use("il.snap.standard_medical_deduction_monthly", as_of, det).value)
    d = max(smd, medical - thr)
    det.note("SNAP-IL-SMD", f"medical costs ${medical:,.2f}: " + (f"standard medical deduction ${smd:,.0f}" if d == smd
             else f"actual costs over $35 = ${d:,.2f}"), True)
    return d


def utility_allowance(hh: Household, as_of: date, det: Determination, ed: bool):
    us = params.use("il.snap.utility_standards_monthly", as_of, det)
    billed = fed.utilities_billed(hh)
    heat = "heating_cooling" in billed or fed.energy_assistance_confers_hcsua(
        hh, ed, as_of, LIHEAP_QM_ONLY_FROM, det, "SNAP-IL-LIHEAP-SUA")
    if heat:
        det.note("SNAP-IL-UTILITY", f"Air Conditioning/Heating Standard ${us['ac_heat']}", None)
        return float(us["ac_heat"]), "AC/Heating Standard"
    others = billed - {"heating_cooling"}
    if len(others) >= 2:
        det.note("SNAP-IL-UTILITY", f"two or more utilities: Limited Utility Standard ${us['limited']}", None)
        return float(us["limited"]), "Limited Utility Standard"
    if others and "phone" not in others:
        det.note("SNAP-IL-UTILITY", f"one non-telephone utility: Single Utility Standard ${us['single']}", None)
        return float(us["single"]), "Single Utility Standard"
    if "phone" in others:
        det.note("SNAP-IL-UTILITY", f"telephone only: Telephone Standard ${us['telephone']}", None)
        return float(us["telephone"]), "Telephone Standard"
    det.note("SNAP-IL-UTILITY", "no utility billed separately: no utility standard", None)
    return 0.0, "none"


def bbce(hh: Household, as_of: date, det: Determination, ed: bool, gross: float, b) -> fed.BBCEResult:
    if hh.facts.get("sanctioned_or_ipv_member"):
        return fed.BBCEResult(False, "SNAP-IL-BBCE", "an IPV or work-sanctioned member: regular gross and net tests apply")
    pid = "il.snap.bbce_qm_gross_income_limit_monthly" if ed else "il.snap.bbce_gross_income_limit_monthly"
    lim = float(fed.by_size(params.use(pid, as_of, det), b.size))
    ok = gross <= lim
    pct = "200%" if ed else "165%"
    return fed.BBCEResult(ok, "SNAP-IL-BBCE-QM" if ed else "SNAP-IL-BBCE",
                          f"gross ${gross:,.2f} {'<=' if ok else '>'} {pct} FPL ${lim:,.0f}"
                          + (" — categorically eligible, no resource or net income test" if ok else ""), net_test=False)


CONFIG = fed.StateConfig(state=STATE, standard_deduction_pid="il.snap.standard_deduction_monthly",
                         standard_deduction_rule="SNAP-IL-STANDARD-DEDUCTION",
                         medical_deduction=medical_deduction, utility_allowance=utility_allowance, bbce=bbce,
                         child_support_exclusion=True, child_support_rule="SNAP-IL-CHILD-SUPPORT")


def evaluate(hh: Household, as_of: date) -> Determination:
    return fed.run(hh, as_of, CONFIG)
