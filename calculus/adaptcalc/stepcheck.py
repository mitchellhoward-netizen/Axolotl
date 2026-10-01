"""Check a transcribed solution with SymPy, one step at a time.

A transcribed line is either
  * a chain of equal quantities "a = b = c" (each adjacent pair is a step), or
  * an equation to solve, Eq(lhs, rhs) (consecutive equations are steps).
A line with continues=true starts with "=": its first part must equal the last
part of the previous chain. Crossed-out lines are not checked.

Step rules:
  * Limit -> Limit at the same point: the limitands must agree near the point
    (equal as functions away from it). If they differ but the limits happen to
    agree, the step is "questionable".
  * Limit -> number: the number must be the value of the limit.
  * expression -> expression: equivalence (inside a limit: equal near the point).
  * Eq -> Eq: same solution set.
Parts that are labels (a lone new symbol such as m, or an undefined function
value such as f(2)) are skipped. The final (boxed) answer is graded against
the problem's verified key.
"""
from __future__ import annotations

import re

import sympy as sp
from sympy.core.function import AppliedUndef

from . import answers

PROBLEM_VARS = {answers.X, answers.T, answers.H, answers.THETA}
UNPARSEABLE = "UNPARSEABLE"


def split_chain(s: str) -> list[str]:
    """Split on top-level '=' (not ==, <=, >=, != and not inside parentheses)."""
    parts, depth, cur, i = [], 0, "", 0
    while i < len(s):
        ch = s[i]
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1
        if ch == "=" and depth == 0 and (i == 0 or s[i - 1] not in "<>=!") and (i + 1 >= len(s) or s[i + 1] != "="):
            parts.append(cur)
            cur = ""
        else:
            cur += ch
        i += 1
    parts.append(cur)
    return [p.strip() for p in parts if p.strip()]


def _parse(s: str):
    try:
        return answers.parse(s)
    except ValueError:
        return UNPARSEABLE


LABEL = re.compile(r"^[A-Za-z][A-Za-z_]*$")


def _is_label(e, idx: int, n: int, raw: str = "") -> bool:
    """A name being defined (m = ..., width = ..., A = ...) or an undefined function value like f(2)."""
    if idx == 0 and n > 1 and LABEL.match(raw.strip()) and raw.strip() not in {"x", "t", "theta"}:
        return True
    if e is UNPARSEABLE:
        return False
    if isinstance(e, sp.Basic) and e.atoms(AppliedUndef):
        return True
    return idx == 0 and n > 1 and isinstance(e, sp.Symbol) and e not in PROBLEM_VARS


def _ineq_set(s: str):
    """Solution set (over the reals) of an inequality line such as '3*x - 2 < 7' or '-2 <= x < 5'."""
    try:
        return answers.parse_solution_set(s)
    except Exception:  # noqa: BLE001
        return None


def _limit_parts(e):
    if isinstance(e, sp.Limit):
        f, var, pt, d = e.args
        return f, var, pt, str(d)
    return None


def _value(e):
    try:
        if isinstance(e, sp.Limit):
            f, var, pt, d = e.args
            if str(d) == "+-":
                l, r = sp.limit(f, var, pt, "-"), sp.limit(f, var, pt, "+")
                return l if l == r else "DNE"
            return e.doit()
        return e
    except Exception:  # noqa: BLE001
        return None


def _same_near(f, g, var, pt) -> bool:
    """f and g agree at several points near pt (excluding pt) -> equal as limitands."""
    try:
        if sp.simplify(f - g) == 0:
            return True
    except Exception:  # noqa: BLE001
        pass
    pt = sp.sympify(pt)
    base = 0 if pt in (sp.oo, -sp.oo) else pt
    for h in (sp.Rational(1, 7), sp.Rational(-1, 9), sp.Rational(1, 31), sp.Rational(-2, 13), sp.Rational(3, 101)):
        v = base + h
        try:
            a, b = complex(f.subs(var, v).evalf()), complex(g.subs(var, v).evalf())
        except Exception:  # noqa: BLE001
            return False
        if abs(a - b) > 1e-9 * max(1, abs(b)):
            return False
    return True


def _eq_solutions(e):
    if isinstance(e, sp.Equality):
        syms = sorted(e.free_symbols, key=str)
        if len(syms) == 1:
            try:
                return set(sp.solve(e, syms[0]))
            except Exception:  # noqa: BLE001
                return None
    return None


def compare(prev, cur, ctx_limit=None) -> tuple[str, str]:
    """Return (status, note) for the step prev -> cur."""
    if prev is UNPARSEABLE or cur is UNPARSEABLE:
        return "unchecked", "could not parse a part"
    lp, lc = _limit_parts(prev), _limit_parts(cur)
    if lp and lc:
        if lp[1:] != lc[1:]:
            return "invalid", "limit point or variable changed"
        if _same_near(lp[0], lc[0], lp[1], lp[2]):
            return "valid", ""
        vp, vc = _value(prev), _value(cur)
        if vp is not None and vp == vc:
            return "questionable", "limitands differ but the limits agree"
        return "invalid", "the expressions under the limit are not equal"
    if lp and not lc:
        if isinstance(cur, sp.Basic) and cur.free_symbols & {lp[1]}:
            ok = _same_near(lp[0], cur, lp[1], lp[2])
            return ("valid", "limit notation dropped") if ok else ("invalid", "not equal to the expression under the limit")
        vp = _value(prev)
        if vp is None:
            return "unchecked", "limit could not be evaluated"
        if vp == "DNE":
            return "invalid", "the limit does not exist"
        return ("valid", "") if answers.equal(vp, cur) else ("invalid", f"the limit is {vp}")
    if lc and not lp:
        return compare(cur, prev, ctx_limit)
    if isinstance(prev, sp.core.relational.Relational) or isinstance(cur, sp.core.relational.Relational):
        return "unchecked", "inequality"
    if ctx_limit is not None and (prev.free_symbols | cur.free_symbols) & {ctx_limit[1]}:
        ok = _same_near(prev, cur, ctx_limit[1], ctx_limit[2])
        return ("valid", "") if ok else ("invalid", "not equal near the limit point")
    return ("valid", "") if answers.equal(prev, cur) else ("invalid", "not equivalent")


def check(tproblem: dict, key: dict) -> dict:
    lines = tproblem.get("lines", [])
    out_lines = []
    prev_last = None      # last checkable part of the previous chain
    prev_eq = None        # previous equation
    prev_ineq = None      # solution set of the previous inequality
    ctx_limit = None
    first_invalid = None
    for i, ln in enumerate(lines, 1):
        if ln.get("crossed_out"):
            out_lines.append({"line": i, "status": "crossed_out"})
            continue
        s = (ln.get("sympy") or "").strip()
        if not s:
            out_lines.append({"line": i, "status": "text"})
            continue
        steps = []
        if re.search(r"(?<![-=])[<>]", s) and "->" not in s:
            # an inequality step: it must keep the solution set of the previous inequality
            cur = _ineq_set(s)
            if prev_ineq is not None and cur is not None:
                steps.append(("valid", "") if cur == prev_ineq else ("invalid", "solution set changed"))
            elif prev_ineq is not None:
                steps.append(("unchecked", "inequality step not checkable"))
            prev_ineq = cur
            prev_eq, prev_last = None, None
            worst = "start" if not steps else steps[0][0]
            out_lines.append({"line": i, "status": worst, "steps": len(steps), "note": "; ".join(n for _, n in steps if n)})
            if worst == "invalid" and first_invalid is None:
                first_invalid = i
            continue
        prev_ineq = None
        if s.startswith("Eq("):
            e = _parse(s)
            if prev_eq is not None and e is not UNPARSEABLE:
                a, b = _eq_solutions(prev_eq), _eq_solutions(e)
                if a is None or b is None:
                    steps.append(("unchecked", "equation step not checkable"))
                else:
                    steps.append(("valid", "") if a == b else ("invalid", "solution set changed"))
            prev_eq, prev_last = (e if e is not UNPARSEABLE else None), None
        else:
            raw = split_chain(s)
            parsed = [_parse(p) for p in raw]
            checkable = [e for j, e in enumerate(parsed) if not _is_label(e, j, len(parsed), raw[j])]
            for e in checkable:
                if isinstance(e, sp.Limit):
                    ctx_limit = _limit_parts(e)
            seq = ([prev_last] if ln.get("continues") and prev_last is not None else []) + checkable
            for a, b in zip(seq, seq[1:]):
                steps.append(compare(a, b, ctx_limit))
            prev_last = checkable[-1] if checkable else prev_last
            prev_eq = None
        worst = "start" if not steps else next((st for st in ("invalid", "questionable", "unchecked", "valid")
                                                if any(x[0] == st for x in steps)), "valid")
        notes = "; ".join(n for st, n in steps if n)
        out_lines.append({"line": i, "status": worst, "steps": len(steps), "note": notes})
        if worst == "invalid" and first_invalid is None:
            first_invalid = i
    final = tproblem.get("final_answer")
    if not final:
        boxed = [ln for ln in lines if ln.get("boxed") and not ln.get("crossed_out")]
        if boxed:
            final = split_chain(boxed[-1].get("sympy") or boxed[-1].get("text") or "")[-1:] or [None]
            final = final[0]
    boxed = True
    if not final:
        # nothing boxed: take the last value the learner wrote (last part of the last live line)
        live = [ln for ln in lines if not ln.get("crossed_out") and (ln.get("sympy") or "").strip()]
        if live:
            last = live[-1]["sympy"]
            final = last if last.startswith("Eq(") else split_chain(last)[-1]
            boxed = False
    skipped = bool(tproblem.get("skipped"))
    correct, why = (False, "skipped") if skipped else answers.grade(key, final)
    if not boxed and final:
        why += " (answer not boxed; read from the last line)"
    return {"lines": out_lines, "first_invalid_line": first_invalid,
            "all_steps_valid": first_invalid is None,
            "final_answer": final, "final_correct": bool(correct), "final_note": why, "skipped": skipped,
            "final_boxed": boxed}
