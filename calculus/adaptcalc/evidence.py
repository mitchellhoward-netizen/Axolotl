"""Jev evidence for one graded problem.

Isolation rule: Jev evidence calls must not see the learner model. This
module therefore
  * never imports the learner model or the diagnostic (tests/test_isolation.py
    checks the import graph),
  * builds state only from an allow-listed set of fields (the printed problem,
    its answer key, the transcribed work, the SymPy check, the misconception
    library and template strategy/sub-step lists), and
  * refuses to send any state containing learner-model fields.

It returns typed findings; turning them into a mastery update is the learner
model's job (pipeline.py -> learner.record_attempt).
"""
from __future__ import annotations

import json
import re

from .jev import Jev, choice, noul, spec

STATE_KEYS = {"note", "problem", "correct_answer", "student_work", "sympy_check", "misconceptions", "strategies"}
FORBIDDEN_KEY = re.compile(r"mastery|p_mastery|learner|stability|next_review|posterior|prior|n_obs|marginal", re.I)


class IsolationError(Exception):
    pass


def assert_isolated(state: dict) -> None:
    extra = set(state) - STATE_KEYS
    if extra:
        raise IsolationError(f"evidence state has non-allow-listed keys: {sorted(extra)}")

    def walk(o, path="state"):
        if isinstance(o, dict):
            for k, v in o.items():
                if FORBIDDEN_KEY.search(str(k)):
                    raise IsolationError(f"learner-model field {path}.{k} in evidence state")
                walk(v, f"{path}.{k}")
        elif isinstance(o, list):
            for i, v in enumerate(o):
                walk(v, f"{path}[{i}]")

    walk(state)


def crossed_runs(lines: list[dict]) -> list[list[int]]:
    """Maximal runs of consecutive crossed-out lines (1-based line numbers)."""
    runs, cur = [], []
    for i, ln in enumerate(lines, 1):
        if ln.get("crossed_out"):
            cur.append(i)
        elif cur:
            runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)
    return runs


def build_state(problem: dict, tproblem: dict, check: dict, library: list[dict]) -> dict:
    """problem: {statement, key_display, strategies, substeps} (public fields only)."""
    ev = spec()["evidence"]
    state = {
        "note": ev["state_note"],
        "problem": problem["statement"],
        "correct_answer": problem["key_display"],
        "student_work": [
            {"line": i, "text": ln.get("text", ""), "crossed_out": bool(ln.get("crossed_out")),
             "boxed": bool(ln.get("boxed"))}
            for i, ln in enumerate(tproblem.get("lines", []), 1)
        ],
        "sympy_check": {
            "final_answer": check.get("final_answer"),
            "final_answer_correct": check["final_correct"],
            "first_invalid_line": check["first_invalid_line"],
            "steps": [{"line": s["line"], "status": s["status"]} for s in check["lines"]
                      if s["status"] not in ("text",)],
        },
        "misconceptions": {m["id"].split(".", 1)[1]: m["description"] for m in library},
    }
    assert_isolated(state)
    return state


def questions(problem: dict, tproblem: dict, library: list[dict]) -> tuple[dict, dict]:
    ev = spec()["evidence"]
    qs, meta = {}, {"runs": [], "substeps": list(problem["substeps"])}
    opts = {m["id"].split(".", 1)[1]: m["description"] for m in library}
    opts.update(ev["misconception"]["extra_options"])
    qs["misconception"] = choice(ev["misconception"]["instructions"], opts)
    for r_i, run in enumerate(crossed_runs(tproblem.get("lines", []))):
        lines = f"{run[0]}-{run[-1]}" if len(run) > 1 else f"{run[0]}"
        qs[f"restart_{r_i}"] = noul(ev["restart"]["instructions"].format(lines=lines), ev["restart"]["criteria"])
        meta["runs"].append(run)
    for s_i, sub in enumerate(problem["substeps"]):
        qs[f"substep_{s_i}"] = noul(ev["substep"]["instructions"].format(substep=sub), ev["substep"]["criteria"])
    qs["strategy"] = choice(ev["strategy"]["instructions"], problem["strategies"])
    return qs, meta


def interpret(raw: dict, meta: dict, library: list[dict]) -> dict:
    th = spec()["evidence"]["thresholds"]
    a = raw["answers"]
    mc = a["misconception"]
    mis = mc["choice"]
    if mc["confidence"] < th["misconception_min_confidence"] or mc["probabilities"].get(mis, 0) < th["misconception_min_probability"]:
        mis = "unsure"
    by_short = {m["id"].split(".", 1)[1]: m for m in library}
    root = by_short[mis]["root_skill"] if mis in by_short else None
    restarts = sum(1 for i in range(len(meta["runs"])) if a[f"restart_{i}"]["noul"] > th["restart_yes"])
    written = [a[f"substep_{i}"]["noul"] > th["substep_written_yes"] for i in range(len(meta["substeps"]))]
    st = a["strategy"]
    strategy = st["choice"] if st["confidence"] >= th["strategy_min_confidence"] else "unsure"
    return {
        "misconception": (by_short[mis]["id"] if mis in by_short else mis),
        "misconception_root": root,
        "attempts": 1 + restarts,
        "crossed_out_runs": len(meta["runs"]),
        "substeps": dict(zip(meta["substeps"], written)),
        "substeps_written_fraction": (sum(written) / len(written)) if written else 1.0,
        "strategy": strategy,
    }


def gather(problem: dict, tproblem: dict, check: dict, library: list[dict], log=None, client=None) -> dict:
    """Ask Jev the typed evidence questions for one problem. One request."""
    state = build_state(problem, tproblem, check, library)
    qs, meta = questions(problem, tproblem, library)
    raw = Jev("evidence", log=log, client=client).ask(state, qs)
    return {"raw": raw, "decision": interpret(raw, meta, library), "state_bytes": len(json.dumps(state))}
