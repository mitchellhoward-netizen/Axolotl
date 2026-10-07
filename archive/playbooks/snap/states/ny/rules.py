"""SNAP — New York.

New York uses the federal income limits, allotments, standard deduction and
shelter cap. It adds: regional standard utility allowances (NYC, Nassau and
Suffolk, rest of state), broad-based categorical eligibility at 200% FPL for
households with an aged/disabled member or dependent care costs and at 150%
FPL for other households with earnings (no resource test), and the
post-Public Law 119-21 HEAP rule. Medical costs are deducted at actual cost
over $35 (no New York standard medical deduction was found).
"""

from __future__ import annotations

from datetime import date

from rulesarchive import params
from rulesarchive.determination import Determination
from rulesarchive.household import Household

from playbooks.snap.federal import rules as fed

STATE = "ny"
HEAP_ED_ONLY_FROM = date(2025, 11, 1)   # SNAP-NY-HEAP-SUA (date: SNAP-NY-OQ-03)


def region(hh: Household) -> str:
    r = hh.facts.get("ny_region")
    if r:
        return r
    c = (hh.county or "").lower().replace(" county", "").strip()
    if not c:
        raise fed.Unresolved("SNAP-NY-OQ-02", "SNAP-NY-SUA", "county not given; New York SUAs vary by region")
    if c in fed.NYC_COUNTIES:
        return "nyc"
    if c in {"nassau", "suffolk"}:
        return "nassau_suffolk"
    return "rest"


def utility_allowance(hh: Household, as_of: date, det: Determination, ed: bool):
    billed = fed.utilities_billed(hh)
    if not billed and not hh.facts.get("energy_assistance_over_20"):
        det.note("SNAP-NY-SUA", "no utility costs billed separately from rent: no utility allowance", None)
        return 0.0, "no SUA"
    heat = "heating_cooling" in billed
    if not heat and hh.facts.get("energy_assistance_over_20"):
        if not ed and as_of < HEAP_ED_ONLY_FROM:
            raise fed.Unresolved("SNAP-NY-OQ-03", "SNAP-NY-HEAP-SUA",
                                 "HEAP-only household without an elderly/disabled member before November 2025")
        heat = fed.energy_assistance_confers_hcsua(hh, ed, as_of, HEAP_ED_ONLY_FROM, det, "SNAP-NY-HEAP-SUA")
    rg = region(hh)
    if heat:
        amt = float(params.use("ny.snap.heating_cooling_sua_monthly", as_of, det)[rg])
        det.note("SNAP-NY-SUA", f"HT/AC SUA ({rg}) ${amt:,.0f}", None)
        return amt, "HT/AC SUA"
    others = billed - {"heating_cooling"}
    if len(others) >= 2:
        amt = float(params.use("ny.snap.utility_sua_monthly", as_of, det)[rg])
        det.note("SNAP-NY-SUA", f"UTIL SUA ({rg}) ${amt:,.0f} (two or more non-heating utilities)", None)
        return amt, "UTIL SUA"
    if "phone" in others:
        amt = float(params.use("ny.snap.phone_sua_monthly", as_of, det).value)
        det.note("SNAP-NY-SUA", f"Phone SUA ${amt:,.0f}", None)
        return amt, "Phone SUA"
    det.note("SNAP-NY-SUA", f"one non-heating utility ({', '.join(sorted(others))}) and no phone: no SUA", None)
    return 0.0, "no SUA"


def bbce(hh: Household, as_of: date, det: Determination, ed: bool, gross: float, b) -> fed.BBCEResult:
    if hh.facts.get("sanctioned_or_ipv_member"):
        return fed.BBCEResult(False, "SNAP-NY-BBCE-200", "a sanctioned or IPV-disqualified member blocks categorical eligibility")
    dep = b.dependent_care > 0
    if ed or dep:
        lim = float(fed.by_size(params.use("ny.snap.bbce_200_income_limit_monthly", as_of, det), b.size))
        ok = gross <= lim
        why = "aged/disabled member" if ed else "dependent care costs"
        return fed.BBCEResult(ok, "SNAP-NY-BBCE-200",
                              f"{why}: gross ${gross:,.2f} {'<=' if ok else '>'} 200% FPL ${lim:,.0f}"
                              + (" — categorically eligible, no resource or net income test" if ok else ""))
    if b.earned > 0:
        lim = float(fed.by_size(params.use("ny.snap.bbce_150_income_limit_monthly", as_of, det), b.size))
        ok = gross <= lim
        return fed.BBCEResult(ok, "SNAP-NY-BBCE-150",
                              f"earned income: gross ${gross:,.2f} {'<=' if ok else '>'} 150% FPL ${lim:,.0f}"
                              + (" — categorically eligible, no resource or net income test" if ok else ""))
    return fed.BBCEResult(False, "SNAP-NY-NO-BBCE-OTHER",
                          "no earnings, no aged/disabled member and no dependent care: regular rules only")


CONFIG = fed.StateConfig(state=STATE, utility_allowance=utility_allowance, bbce=bbce)


def evaluate(hh: Household, as_of: date) -> Determination:
    return fed.run(hh, as_of, CONFIG)
