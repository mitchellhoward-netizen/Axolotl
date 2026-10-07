"""Run a playbook's synthetic households.

Each playbook keeps ``tests/households_<scope>.yaml`` files (schema:
``schema/households.schema.yaml``) and a tiny ``tests/test_<program>.py``
that calls :func:`cases` and :func:`check`. Keeping the runner here means
every playbook is tested the same way and the cross-check script can reuse
the same cases.
"""

from __future__ import annotations

import importlib
from datetime import date
from pathlib import Path
from typing import Any

import yaml

from . import ARCHIVE_ROOT
from .determination import Determination
from .household import Household


def load_cases(program: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for f in sorted((ARCHIVE_ROOT / "playbooks" / program / "tests").glob("households_*.yaml")):
        doc = yaml.safe_load(f.read_text()) or {}
        for c in doc.get("cases", []):
            c = dict(c)
            c["_file"] = str(f.relative_to(ARCHIVE_ROOT))
            out.append(c)
    return out


def cases(program: str) -> list[Any]:
    """pytest params: one per case (and one per extra state in ``compare_states``)."""
    import pytest

    params = []
    for c in load_cases(program):
        params.append(pytest.param(c, None, id=c["id"]))
        for st in (c.get("compare_states") or {}):
            params.append(pytest.param(c, st, id=f"{c['id']}@{st}"))
    return params


def _as_date(v: Any) -> date:
    return v if isinstance(v, date) else date.fromisoformat(str(v))


def evaluate_case(program: str, case: dict[str, Any], state: str | None = None) -> Determination:
    hh_dict = dict(case["household"])
    if state:
        hh_dict["state"] = state
    hh = Household.from_dict(hh_dict)
    mod = importlib.import_module(f"playbooks.{program}")
    return mod.evaluate(hh, hh.state, _as_date(case["as_of"]))


def assert_expect(det: Determination, expect: dict[str, Any], label: str) -> None:
    msg = f"{label}\n{det.explain()}"
    assert det.status == expect["status"], msg
    if "tier" in expect:
        assert det.tier == expect["tier"], msg
    for r in expect.get("rules_include", []):
        assert r in det.rule_ids(), f"missing rule {r}\n{msg}"
    for oq in expect.get("open_questions_include", []):
        assert oq in det.open_questions, f"missing open question {oq}\n{msg}"
    for link in expect.get("links_include", []):
        assert link in det.links, f"missing link {link}\n{msg}"
    for k, v in (expect.get("amounts") or {}).items():
        assert k in det.amounts and abs(det.amounts[k] - float(v)) < 0.005, f"amount {k}: {det.amounts.get(k)} != {v}\n{msg}"


def check(program: str, case: dict[str, Any], state: str | None) -> None:
    if state is None:
        det = evaluate_case(program, case)
        assert_expect(det, case["expect"], f"{case['id']} ({case['_file']})")
        for other in case.get("also", []) or []:
            hh = Household.from_dict(case["household"])
            mod = importlib.import_module(f"playbooks.{other['program']}")
            fn = getattr(mod, other.get("function", "evaluate"))
            args = (hh, _as_date(case["as_of"])) if other.get("function") else (hh, hh.state, _as_date(case["as_of"]))
            assert_expect(fn(*args), other["expect"], f"{case['id']} -> {other['program']}")
    else:
        det = evaluate_case(program, case, state)
        assert_expect(det, case["compare_states"][state], f"{case['id']} in {state}")
