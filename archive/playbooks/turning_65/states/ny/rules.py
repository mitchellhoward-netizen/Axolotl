"""Turning 65 — New York.

Medicare enrollment windows, premiums, penalties and who-pays-first are
federal (playbooks/turning_65/federal/rules.py). New York adds:

- Medigap is sold on a continuous open enrollment basis and community rated
  (Insurance Law 3231(a)): an insurer must accept an application at any time of
  year, so ``medigap_guaranteed_issue_now`` is always 1 for a New Yorker with
  Part A and Part B. A pre-existing-condition waiting period of up to six months
  can still apply outside the federal open enrollment period (T65-NY-MEDIGAP-WAITING).
- EPIC, the state drug-cost program for residents 65+ with income below
  $75,000 (single) / $100,000 (married): flagged as a link, not decided here.
"""

from __future__ import annotations

from datetime import date

from rulesarchive import params
from rulesarchive.determination import Determination
from rulesarchive.household import Household

from playbooks.turning_65.federal import rules as fed

STATE = "ny"


def evaluate(hh: Household, as_of: date) -> Determination:
    det = Determination(fed.PROGRAM, STATE, as_of)
    fed.evaluate_core(hh, as_of, det)
    p = hh.applicant
    federal_gi = fed.medigap_federal(hh, as_of, det)
    if p.medicare_part_a and (p.medicare_part_b or p.facts.get("medigap")):
        det.amounts["medigap_guaranteed_issue_now"] = 1.0
        det.note("T65-NY-MEDIGAP-CONTINUOUS",
                 "New York: Medigap insurers must accept an application at any time of the year, community rated", True)
        if not federal_gi:
            det.note("T65-NY-MEDIGAP-WAITING",
                     "outside the federal open enrollment, a New York Medigap policy may impose up to a 6-month "
                     "pre-existing-condition waiting period, reduced month for month by prior creditable coverage", None)
    if hh.incomes and p.age >= 65:
        size = 2 if hh.spouse is not None else 1
        annual = 12 * sum(i.monthly for i in hh.incomes if i.owner in {p.id} | ({hh.spouse.id} if hh.spouse else set()))
        limit = params.use("ny.epic.income_limit_annual", as_of, det)[size]
        if annual < limit and not p.receives("medicaid"):
            det.links.append("ny_epic:may_qualify")
            det.note("T65-NY-EPIC", f"income about ${annual:,.0f}/yr is below the EPIC ceiling ${limit:,}: check EPIC", None)
    det.note("T65-NY-HIICAP", "free Medicare counseling: HIICAP 1-800-701-0501", None)
    return det
