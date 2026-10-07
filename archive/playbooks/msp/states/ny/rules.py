"""Medicare Savings Program — New York.

New York replaces the federal tiers with QMB (<= 138% FPL) and QI
(> 138% and <= 186% FPL), has no resource test for either, and keeps QDWI.
Its published limits are the standards *before* the $20 disregard, so the
comparison is on countable income (after the disregard).

Household facts read here (Person.facts, for the applicant and a
living-with spouse):

* ``health_insurance_premiums_monthly`` — health insurance premiums the
  person pays each month OTHER than the Medicare Part B premium (Medigap,
  union/retiree plan, Medicare Advantage plan premium, Part D, dental,
  long-term care). Deducted after the SSI disregards (MSP-NY-HEALTH-PREMIUMS).
* ``support_paid_monthly`` — court-ordered child or spousal support the
  person pays. Whether New York deducts it for an adult MSP applicant is
  unresolved (MSP-NY-OQ-07); when it would change the result the
  determination is ``undetermined``.
"""

from __future__ import annotations

from datetime import date

from rulesarchive import params
from rulesarchive.determination import ELIGIBLE, INELIGIBLE, UNDETERMINED, Determination
from rulesarchive.household import Household

from playbooks.msp.federal import rules as fed

STATE = "ny"


def evaluate(hh: Household, as_of: date) -> Determination:
    det = Determination(fed.PROGRAM, STATE, as_of)
    det.note("MSP-NY-TIERS", "New York tiers: QMB, QI, QDWI (no SLMB since 2023)", None)

    unit = fed.budget_unit(hh)
    premiums = sum(float(hh.person(pid).facts.get("health_insurance_premiums_monthly", 0) or 0) for pid in unit)
    support = sum(float(hh.person(pid).facts.get("support_paid_monthly", 0) or 0) for pid in unit)

    if fed.qdwi_test(hh, as_of, det, "ny.msp.qdwi_income_limit_monthly", "ny.msp.qdwi_resource_limit",
                     "MSP-NY-QDWI", limit_includes_disregards=False,
                     deductions=premiums, deduction_rule_id="MSP-NY-HEALTH-PREMIUMS"):
        fed.extra_help_link(det)
        return det

    if not fed.has_part_a(hh):
        det.status = INELIGIBLE
        det.note("MSP-NY-PART-A", "applicant does not have Medicare Part A (Part A Buy-in not indicated)", False)
        return det
    det.note("MSP-NY-PART-A", "applicant has Medicare Part A" +
             (" (through the Part A Buy-in)" if hh.applicant.facts.get("part_a_buy_in") else ""), True)

    inc = fed.countable_income(hh, as_of, det, general_disregard_pid="ny.msp.income_disregard_monthly",
                               rule_id="MSP-NY-DISREGARD", deductions=premiums,
                               deduction_rule_id="MSP-NY-HEALTH-PREMIUMS")
    if inc.size == 2:
        det.note("MSP-NY-COUPLE", "spouses live together: compared to the household-of-two limit", None)
    det.note("MSP-NY-NO-RESOURCE-TEST", "no resource test for QMB or QI in New York", True)

    qmb = params.use("ny.msp.qmb_income_limit_monthly", as_of, det)[inc.size]
    qi = params.use("ny.msp.qi_income_limit_monthly", as_of, det)[inc.size]

    if support:
        def band(x: float) -> str:
            return "QMB" if x <= qmb else "QI" if x <= qi else "over"
        without, with_support = band(inc.countable), band(max(0.0, inc.countable - support))
        if without != with_support:
            det.status = UNDETERMINED
            det.note("MSP-NY-SUPPORT-PAID",
                     f"${support:,.2f}/mo court-ordered support paid: result is {without} without deducting it "
                     f"and {with_support} with it; whether New York deducts support paid for an adult "
                     "MSP applicant is unresolved", None)
            det.unresolved("MSP-NY-OQ-07")
            return det
        det.note("MSP-NY-SUPPORT-PAID",
                 f"${support:,.2f}/mo support paid does not change the result either way (not deducted)", None)

    if inc.countable <= qmb:
        det.status, det.tier = ELIGIBLE, "QMB"
        det.note("MSP-NY-QMB-INCOME", f"countable ${inc.countable:,.2f} <= QMB standard ${qmb:,}", True)
    elif inc.countable <= qi:
        if hh.applicant.receives("medicaid") and not hh.applicant.facts.get("chooses_qi_over_medicaid"):
            det.status = INELIGIBLE
            det.note("MSP-NY-QI-NOT-MEDICAID",
                     f"countable ${inc.countable:,.2f} is in the QI range (<= ${qi:,}) but the person has Medicaid; "
                     "they must choose QI or Medicaid", False)
        else:
            det.status, det.tier = ELIGIBLE, "QI"
            det.note("MSP-NY-QI-INCOME", f"countable ${inc.countable:,.2f} > QMB ${qmb:,} and <= QI standard ${qi:,}", True)
    else:
        det.status = INELIGIBLE
        det.note("MSP-NY-QI-INCOME", f"countable ${inc.countable:,.2f} exceeds QI standard ${qi:,}", False)

    fed.extra_help_link(det)
    fed.part_b_amount(det, as_of)
    return det
