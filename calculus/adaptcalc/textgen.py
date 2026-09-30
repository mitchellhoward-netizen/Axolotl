"""Generated text for packets, and the gate every generated snippet must pass.

Only three things in a packet may vary: which boxes are selected, the
template problems, and short transitions. Every generated snippet must pass

  1. a SymPy check: every mathematical claim it makes is verified (claims are
     carried as SymPy relations; problems carry their verified answer key),
  2. a notation check: its math uses only notation the canonical text has
     introduced by that point (notation.py), and
  3. a Jev check for new ideas (jev_questions.yaml: generation.new_idea),

otherwise the canonical fallback is printed instead: the skill's learning
objective verbatim for a transition, or a canonical checkpoint/exercise for a
problem.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

import sympy as sp

from . import answers, notation
from .jev import Jev, noul, spec
from .symtyp import typ as T


@dataclass
class Snippet:
    slot: str
    kind: str                      # "transition" | "problem"
    typst: str
    plain: str
    position: int                  # notation registry position the snippet sits at
    fallback: dict                 # {"kind": "objective"|"canonical_block", ...}
    claims: list = field(default_factory=list)   # SymPy relations asserted by the snippet
    problem: dict | None = None
    checks: dict = field(default_factory=dict)
    allowed: set | None = None     # explicit notation allow-list (refresh packets); else chapter position

    @property
    def accepted(self) -> bool:
        return all(self.checks.get(k) for k in ("sympy", "notation", "jev"))


def sympy_check(s: Snippet) -> tuple[bool, str]:
    if s.kind == "problem":
        p = s.problem
        if not p.get("verification"):
            return False, "no SymPy verification recorded"
        # the key must still grade as correct against itself
        k = p["key"]
        if k["kind"] in ("limit", "value", "expr", "delta"):
            v = k["value"]
            sample = "DNE" if v == "DNE" else str(sp.sympify(v))
            ok, why = answers.grade(k, sample)
            return ok, why
        return True, p["verification"]
    for c in s.claims:
        try:
            val = c.doit() if hasattr(c, "doit") else c
            if isinstance(val, sp.Equality):
                val = sp.simplify(val.lhs - val.rhs) == 0
            if val is not sp.true and val is not True:
                return False, f"claim not verified: {c}"
        except Exception as e:  # noqa: BLE001
            return False, f"claim not checkable: {c} ({e})"
    # every $...$ segment in a transition must come from a checked claim
    if len(re.findall(r"\$[^$]+\$", s.typst)) > len(s.claims):
        return False, "math in the snippet that is not a verified claim"
    return True, f"{len(s.claims)} claim(s) verified"


def notation_check(s: Snippet) -> tuple[bool, str]:
    if s.allowed is not None:
        ok, bad = notation.check_allowed([s.typst], s.allowed)
    else:
        ok, bad = notation.check([s.typst], s.position)
    return ok, ("ok" if ok else f"notation not yet introduced: {sorted(bad)}")


def jev_check(snips: list[Snippet], canonical: list[str], log=None, client=None) -> None:
    """One request: a noul per snippet. Sets checks['jev'] and records the probability."""
    g = spec()["generation"]
    todo = [s for s in snips if s.checks.get("sympy") and s.checks.get("notation")]
    if not todo:
        return
    state = {"note": g["state_note"], "canonical": canonical, "snippets": [s.plain for s in todo]}
    qs = {f"s{i}": noul(g["new_idea"]["instructions"].format(i=i), g["new_idea"]["criteria"]) for i in range(len(todo))}
    out = Jev("generation_gate", log=log, client=client).ask(state, qs)
    thr = g["thresholds"]["new_idea_max"]
    for i, s in enumerate(todo):
        p = out["answers"][f"s{i}"]["noul"]
        s.checks["jev"] = p <= thr
        s.checks["jev_new_idea_p"] = p


def gate(snips: list[Snippet], canonical: list[str], log=None, client=None, use_jev: bool = True) -> list[Snippet]:
    """Run the three checks. Without Jev (use_jev=False) nothing generated is accepted."""
    for s in snips:
        ok, why = sympy_check(s)
        s.checks["sympy"], s.checks["sympy_note"] = ok, why
        ok, why = notation_check(s)
        s.checks["notation"], s.checks["notation_note"] = ok, why
        s.checks["jev"] = False
        if not use_jev:
            s.checks["jev_note"] = "Jev check not run; falling back to canonical text"
    if use_jev:
        jev_check(snips, canonical, log=log, client=client)
    return snips


# ---------------------------------------------------------------------------
# Transition writers. They only restate the packet's structure and the
# learner's own history; math appears only as verified SymPy claims.

def _clean(desc: str) -> str:
    """Drop worked 'e.g.' examples from a misconception description (they contain false math)."""
    d = re.sub(r",?\s*(e\.g\.|such as)[^.;]*", "", desc)
    d = re.sub(r"\([^)]*\)", "", d)
    return " ".join(d.split()).rstrip(".")


def roadmap(skill_names: list[str], section_title: str, position: int, fallback: dict) -> Snippet:
    names = "; ".join(n[0].lower() + n[1:] for n in skill_names)
    text = (f"This packet is Section {section_title}, read straight through. It concentrates on: {names}. "
            f"The examples kept in it are the ones that use these skills, and the practice set at the end follows them.")
    return Snippet("roadmap", "transition", text.replace('"', "'"), text, position, fallback)


def refresh_roadmap(skill_names: list[str], source_title: str, fallback: dict) -> Snippet:
    names = "; ".join(n[0].lower() + n[1:] for n in skill_names)
    text = (f"This is a refresh of something you have probably seen before: {names}. The pages below are from "
            f"{source_title}. Read the worked examples, then try the practice problems without looking back at them.")
    return Snippet("roadmap", "transition", text, text, 0, fallback)


def pointer(label: str, problem_numbers: list[int], position: int, fallback: dict) -> Snippet:
    nums = ", ".join(str(n) for n in problem_numbers)
    text = f"{label} is the model for practice problem{'s' if len(problem_numbers) > 1 else ''} {nums}."
    return Snippet(f"pointer:{label}", "transition", text, text, position, fallback)


def watch(label: str, misconception_desc: str, position: int, fallback: dict) -> Snippet:
    text = (f"On your last attempt at this kind of problem the work showed this: {_clean(misconception_desc).lower()}. "
            f"Compare each line of {label} with that step.")
    return Snippet(f"watch:{label}", "transition", text, text, position, fallback)


def reminder_for(skills: list[str], seed: int, position: int, fallback: dict) -> Snippet | None:
    """A one-line algebra warm-up whose equation SymPy verifies. Fresh numbers, not a practice problem."""
    x = sp.Symbol("x")
    k = 2 + seed % 6
    if any(s in ("factor_cancel", "alg_factor", "alg_rational", "vertical_asymptote", "discontinuity_types") for s in skills):
        lhs, rhs = x**2 - k**2, sp.Mul(x - k, x + k, evaluate=False)
        why = "the difference of squares used when factoring"
    elif any(s in ("conjugate_limit", "alg_conjugate") for s in skills):
        lhs = sp.Mul(sp.sqrt(x) - k, sp.sqrt(x) + k, evaluate=False)
        rhs = x - k**2
        why = "the conjugate product"
    else:
        return None
    claim = sp.Eq(lhs, rhs, evaluate=False)
    typst = f"Warm-up, {why}: ${T(lhs)} = {T(rhs)}$."
    plain = f"Warm-up, {why}: {sp.sstr(lhs)} = {sp.sstr(rhs)}."
    return Snippet("practice", "transition", typst, plain, position, fallback, claims=[claim])
