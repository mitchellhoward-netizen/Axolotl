"""Answer keys and grading of final answers (SymPy).

A key is a dict: {"kind": ..., "value": <str, sympy srepr-able>, ...}. Keys are
stored as JSON in the learner DB, so values are kept as strings and re-parsed.
"""
from __future__ import annotations

import re

import sympy as sp
from sympy.parsing.sympy_parser import (convert_xor, implicit_multiplication_application,
                                        parse_expr, standard_transformations)

X, T, EPS, DELTA, THETA, H, K = sp.symbols("x t epsilon delta theta h k")
LOCALS = {"x": X, "t": T, "epsilon": EPS, "eps": EPS, "delta": DELTA, "theta": THETA,
          "k": K, "e": sp.E, "pi": sp.pi, "oo": sp.oo, "inf": sp.oo, "infinity": sp.oo,
          "sqrt": sp.sqrt, "sin": sp.sin, "cos": sp.cos, "tan": sp.tan, "ln": sp.log,
          "log": sp.log, "Abs": sp.Abs, "abs": sp.Abs, "min": sp.Min, "Min": sp.Min,
          "max": sp.Max, "Max": sp.Max, "E": sp.E,
          # a transcribed Limit(expr, x, a) is two-sided unless a side is given (SymPy defaults to '+')
          "Limit": lambda e, v, a, d="+-": sp.Limit(e, v, a, d)}
# single letters used as function names in the chapter: f(2) is a function value, not 2*f
LOCALS.update({n: sp.Function(n) for n in ("f", "g", "h", "s", "p", "F", "G")})
TRANSFORMS = standard_transformations + (implicit_multiplication_application, convert_xor)

UNICODE = {"ε": "epsilon", "δ": "delta", "θ": "theta", "π": "pi", "∞": "oo", "−": "-",
           "·": "*", "×": "*", "√": "sqrt", "²": "^2", "³": "^3", "≤": "<=", "≥": ">="}


def parse(s: str):
    """Parse a student/transcribed expression. Raises ValueError on failure."""
    if s is None:
        raise ValueError("empty")
    t = s.strip()
    for a, b in UNICODE.items():
        t = t.replace(a, b)
    t = re.sub(r"\|([^|]+)\|", r"Abs(\1)", t)
    t = t.replace("{", "(").replace("}", ")")
    try:
        return parse_expr(t, local_dict=dict(LOCALS), transformations=TRANSFORMS, evaluate=True)
    except Exception as e:  # noqa: BLE001 - sympy raises many types
        raise ValueError(f"cannot parse {s!r}: {e}") from e


def is_dne(s: str) -> bool:
    return bool(re.fullmatch(r"\s*(dne|d\.n\.e\.?|does\s*not\s*exist|doesn't exist|no limit)\s*\.?",
                             s or "", re.I))


def equal(a, b, tol: float = 0.0) -> bool:
    a, b = sp.sympify(a), sp.sympify(b)
    if a in (sp.oo, -sp.oo, sp.zoo) or b in (sp.oo, -sp.oo, sp.zoo):
        return a == b
    try:
        d = sp.simplify(a - b)
        if d == 0:
            return True
        if tol and d.is_number:
            return abs(float(d)) <= tol * max(1.0, abs(float(b)))
    except Exception:  # noqa: BLE001
        pass
    if a.free_symbols or b.free_symbols:
        return _numeric_equiv(a, b)
    return False


def _numeric_equiv(a, b, n: int = 7) -> bool:
    syms = sorted(a.free_symbols | b.free_symbols, key=str)
    pts = [0.37, 1.73, 2.41, 3.19, 0.83, 5.29, 7.11]
    for i in range(n):
        sub = {s: pts[(i + j) % len(pts)] + 0.1 * j for j, s in enumerate(syms)}
        try:
            va, vb = complex(a.evalf(subs=sub)), complex(b.evalf(subs=sub))
        except Exception:  # noqa: BLE001
            return False
        if abs(va - vb) > 1e-8 * max(1.0, abs(vb)):
            return False
    return True


# ---------------------------------------------------------------------------
# Interval notation: "(-oo, 2) U (2, 3]" etc.

def parse_intervals(s: str) -> sp.Set:
    t = s.replace("∪", "U").replace("−", "-").replace("∞", "oo").replace(" ", "")
    t = t.replace("infinity", "oo").replace("inf", "oo")
    parts = [p for p in re.split(r"U|u|or", t) if p]
    out = sp.S.EmptySet
    for p in parts:
        m = re.fullmatch(r"([\[(])(.+),(.+)([\])])", p)
        if not m:
            raise ValueError(f"not an interval: {p}")
        lo, hi = parse(m.group(2)), parse(m.group(3))
        out = out | sp.Interval(lo, hi, left_open=m.group(1) == "(", right_open=m.group(4) == ")")
    return out


def parse_set(s: str) -> set:
    t = s.strip().strip("{}").replace("x=", "").replace("x =", "")
    return {sp.nsimplify(parse(p)) for p in re.split(r",|and|;", t) if p.strip()}


# ---------------------------------------------------------------------------

UNITS = re.compile(r"\s*(ft\s*/\s*s(ec)?|m\s*/\s*s|feet per second|square units|sq\.? units|units?\s*\^?\s*\(?2\)?|units?|ft|feet|sec|seconds|m)\.?\s*$", re.I)


def strip_units(s: str) -> str:
    return UNITS.sub("", s) if re.search(r"\d", s) else s


def show(key: dict) -> str:
    """Readable form of a key's value for messages."""
    v = key.get("value")
    if key["kind"] in ("choice", "set") or v == "DNE":
        return str(v)
    try:
        return sp.sstr(sp.sympify(v), order="lex").replace("**", "^")
    except Exception:  # noqa: BLE001
        return str(v)


def grade(key: dict, student: str | None) -> tuple[bool, str]:
    """Return (correct, explanation) for a student's final answer string."""
    if student is None or not str(student).strip():
        return False, "no final answer"
    student = str(student).strip()
    student = re.sub(r"^\s*(lim.*?=|[a-zA-Zδε]+\s*=)\s*", "", student) if key["kind"] not in ("choice",) else student
    kind = key["kind"]
    if kind in ("limit", "value"):
        student = strip_units(student)
    try:
        if kind == "limit":
            if key["value"] == "DNE":
                return is_dne(student), "key: DNE"
            if is_dne(student):
                return False, f"you wrote DNE; the answer is {show(key)}"
            return equal(parse(student), sp.sympify(key["value"]), key.get("tol", 0.0)), f"the answer is {show(key)}"
        if kind == "value":
            return equal(parse(student), sp.sympify(key["value"]), key.get("tol", 0.0)), f"the answer is {show(key)}"
        if kind == "choice":
            s = norm_choice(student)
            accepted = {norm_choice(key["value"])} | {norm_choice(a) for a in key.get("aliases", [])}
            return s in accepted, f"the answer is {show(key)}"
        if kind == "set":
            got = parse_set(student) if not re.fullmatch(r"\s*(none|no\s*\w*|∅|\{\})\s*", student, re.I) else set()
            want = {sp.nsimplify(sp.sympify(v)) for v in key["value"]}
            return got == want, f"the answer is {', '.join(sorted(map(str, want)))}"
        if kind == "interval":
            return parse_intervals(student) == sp.sympify(key["value"]), f"the answer is {show(key)}"
        if kind == "expr":
            stu = parse(student)
            if not equal(stu, sp.sympify(key["value"])):
                return False, f"not equal to {show(key)}"
            form = key.get("form")
            if form == "factored" and not _is_factored(stu):
                return False, "equivalent but not factored"
            if form == "no_radical_denominator" and any(isinstance(a, sp.Pow) and a.exp.is_Rational and not a.exp.is_Integer
                                                        for a in sp.preorder_traversal(sp.fraction(sp.together(stu))[1])):
                return False, "radical left in denominator"
            if form == "no_abs" and stu.has(sp.Abs):
                return False, "still contains absolute value"
            if form == "polynomial" and not sp.sympify(stu).is_polynomial():
                return False, "not simplified to a polynomial"
            if form == "single_power" and not (stu == X or (isinstance(stu, sp.Pow) and stu.base == X)
                                                or (isinstance(stu, sp.Pow) and stu.base == X ** -1)):
                return False, "equivalent but not written as a single power of x"
            if form == "expanded" and sp.expand(stu) != stu:
                return False, "equivalent but not multiplied out"
            return True, "equivalent"
        if kind == "delta":
            return check_delta(key, parse(student))
    except ValueError as e:
        return False, str(e)
    raise ValueError(f"unknown answer kind {kind}")


def norm_choice(s: str) -> str:
    s = s.strip().lower()
    s = re.sub(r"^\(?([a-e])[).]?\s*$", r"\1", s)
    return re.sub(r"[^a-z0-9]", "", s)


def _is_factored(e) -> bool:
    e = sp.sympify(e)
    if not isinstance(e, sp.Mul) and not isinstance(e, sp.Pow):
        return False
    factors = [f for f in sp.Mul.make_args(e) if f.free_symbols]
    count = sum(int(f.exp) if isinstance(f, sp.Pow) and f.exp.is_Integer else 1 for f in factors)
    return count >= 2 and all(sp.degree(f.base if isinstance(f, sp.Pow) else f, X) <= 2 for f in factors)


def check_delta(key: dict, delta_expr) -> tuple[bool, str]:
    """A delta works if, for sampled epsilons, 0 < |x-a| < delta forces |f(x) - L| < eps.

    `key["bound"]` is the supremum of |f(x) - L| over |x - a| <= d, as an
    expression in d (computed exactly in the template), so the check is
    bound(delta(eps)) <= eps.
    """
    bound = sp.sympify(key["bound"])
    d = sp.Symbol("d")
    if delta_expr.free_symbols - {EPS}:
        return False, "delta may only depend on epsilon"
    for eps in (sp.Rational(1, 1000), sp.Rational(1, 10), sp.Rational(1, 2), 1, 3, 10):
        dv = sp.nsimplify(delta_expr.subs(EPS, eps))
        if not (dv.is_positive):
            return False, f"delta not positive at epsilon={eps}"
        if sp.simplify(bound.subs(d, dv) - eps) > 0:
            return False, f"delta too large at epsilon={eps}"
    return True, "delta satisfies the definition for sampled epsilon"
