"""Jev evidence calls must not see the learner model."""
import ast
from pathlib import Path

import pytest

from adaptcalc import evidence, extract, templates

PKG = Path(__file__).resolve().parent.parent / "adaptcalc"


def imports_of(mod: str) -> set[str]:
    tree = ast.parse((PKG / f"{mod}.py").read_text())
    out = set()
    for n in ast.walk(tree):
        if isinstance(n, ast.ImportFrom):
            out |= {a.name for a in n.names} | {n.module or ""}
        elif isinstance(n, ast.Import):
            out |= {a.name for a in n.names}
    return out


def test_evidence_module_cannot_reach_the_learner_model():
    reach, todo = set(), ["evidence"]
    while todo:
        m = todo.pop()
        for imp in imports_of(m):
            name = imp.split(".")[-1]
            if (PKG / f"{name}.py").exists() and name not in reach:
                reach.add(name)
                todo.append(name)
    assert not reach & {"learner", "diagnostic", "pipeline", "packets"}, reach


def _problem():
    p = templates.generate("factor_cancel.quadratic", 1).to_json()
    return {"statement": p["plain"], "key_display": "2", "strategies": p["strategies"], "substeps": p["substeps"]}


def test_state_rejects_learner_fields():
    with pytest.raises(evidence.IsolationError):
        evidence.assert_isolated({"problem": "x", "mastery": {"factor_cancel": 0.3}})
    with pytest.raises(evidence.IsolationError):
        evidence.assert_isolated({"problem": "x", "student_work": [{"p_mastery": 0.2}]})


def test_state_is_built_only_from_the_page_and_the_check(fake_jev):
    lib = extract.misconceptions()["factor_cancel"]
    tp = {"lines": [{"text": "x", "sympy": "", "crossed_out": False, "boxed": True}]}
    check = {"final_answer": "2", "final_correct": True, "first_invalid_line": None, "lines": []}

    def answer(name, q):
        if name == "misconception":
            return {"type": "choice", "choice": "none", "confidence": 0.9, "probabilities": {"none": 0.95}}
        if name == "strategy":
            return {"type": "choice", "choice": "factor_cancel", "confidence": 0.9, "probabilities": {"factor_cancel": 0.95}}
        return {"type": "noul", "noul": 0.9}

    client = fake_jev(answer)
    out = evidence.gather(_problem(), tp, check, lib, client=client)
    (state, questions), = client.calls
    assert set(state) <= evidence.STATE_KEYS
    assert out["decision"]["misconception"] == "none" and out["decision"]["attempts"] == 1


def test_restarts_are_counted_in_code(fake_jev):
    lib = extract.misconceptions()["factor_cancel"]
    lines = [{"text": "a", "sympy": "", "crossed_out": True, "boxed": False},
             {"text": "b", "sympy": "", "crossed_out": False, "boxed": False},
             {"text": "c", "sympy": "", "crossed_out": True, "boxed": False},
             {"text": "d", "sympy": "", "crossed_out": True, "boxed": False},
             {"text": "e", "sympy": "", "crossed_out": False, "boxed": True}]
    check = {"final_answer": "2", "final_correct": True, "first_invalid_line": None, "lines": []}

    def answer(name, q):
        if name.startswith("restart_"):
            return {"type": "noul", "noul": 0.8 if name == "restart_0" else 0.2}
        if name in ("misconception", "strategy"):
            return {"type": "choice", "choice": "unsure", "confidence": 0.1, "probabilities": {"unsure": 0.4}}
        return {"type": "noul", "noul": 0.1}

    out = evidence.gather(_problem(), {"lines": lines}, check, lib, client=fake_jev(answer))
    d = out["decision"]
    assert d["crossed_out_runs"] == 2 and d["attempts"] == 2 and d["substeps_written_fraction"] == 0
