"""Turning 65 — California.

Federal Medicare rules apply unchanged. California adds the Medigap "birthday
rule": a person who already has a Medigap policy may, for 60 days starting on
their birthday each year, buy another Medigap policy with the same or lesser
benefits without medical screening or a new waiting period. California also
treats loss of COBRA/Cal-COBRA and loss of employer coverage of the 20%
coinsurance as Medigap open enrollment / guaranteed-issue events.
"""

from __future__ import annotations

from datetime import date

from rulesarchive import params
from rulesarchive.determination import Determination
from rulesarchive.household import Household

from playbooks.turning_65.federal import rules as fed

STATE = "ca"


def evaluate(hh: Household, as_of: date) -> Determination:
    det = Determination(fed.PROGRAM, STATE, as_of)
    fed.evaluate_core(hh, as_of, det)
    p = hh.applicant
    gi = fed.medigap_federal(hh, as_of, det)
    m = p.facts.get("medigap") or {}
    birth = fed._d(p.facts.get("birth_date"))
    if m.get("has_policy") and birth is not None:
        days = int(params.use("ca.cdi.medigap_birthday_window_days", as_of, det).value)
        if fed.birthday_window(birth, as_of, days):
            gi = True
            det.note("T65-CA-MEDIGAP-BIRTHDAY",
                     f"California birthday rule: within {days} days from the birthday, may switch to a Medigap policy "
                     "with the same or lesser benefits without medical screening", True)
        else:
            det.note("T65-CA-MEDIGAP-BIRTHDAY", f"outside the {days}-day California birthday window", False)
    if m.get("gi_event") in ("cobra_ended", "cal_cobra_ended", "employer_stopped_coinsurance") and m.get("gi_event_date"):
        det.note("T65-CA-MEDIGAP-GI-EXTRA", "California also gives Medigap rights when COBRA/Cal-COBRA ends or an employer stops covering the 20% coinsurance", None)
        gi = True
    det.amounts["medigap_guaranteed_issue_now"] = 1.0 if gi else 0.0
    det.note("T65-CA-HICAP", "free Medicare counseling: HICAP 1-800-434-0222", None)
    return det
