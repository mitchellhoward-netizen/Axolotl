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


import contextvars

_SYMBOL_OVERRIDES: contextvars.ContextVar[frozenset] = contextvars.ContextVar("symbol_overrides", default=frozenset())


def parse(s: str):
    """Parse a student/transcribed expression. Raises ValueError on failure."""
    if s is None:
        raise ValueError("empty")
    t = s.strip()
    t = re.sub(r"√\s*(\d+|[a-zA-Z])", r"sqrt(\1)", t)
    t = re.sub(r"([\w)])\s*√", r"\1*√", t)
    for a, b in UNICODE.items():
        t = t.replace(a, b)
    t = re.sub(r"\|([^|]+)\|", r"Abs(\1)", t)
    t = t.replace("{", "(").replace("}", ")")
    local = dict(LOCALS)
    for name in _SYMBOL_OVERRIDES.get():
        local[name] = sp.Symbol(name)
    try:
        return parse_expr(t, local_dict=local, transformations=TRANSFORMS, evaluate=True)
    except Exception as e:  # noqa: BLE001 - sympy raises many types
        raise ValueError(f"cannot parse {s!r}: {e}") from e


def is_dne(s: str) -> bool:
    return bool(re.fullmatch(r"\s*(dne|d\.n\.e\.?|does\s*not\s*exist|doesn't exist|no limit)\s*\.?",
                             s or "", re.I))


def equal(a, b, tol: float = 0.0) -> bool:
    a, b = sp.sympify(a), sp.sympify(b)
    if a in (sp.oo, -sp.oo, sp.zoo) or b in (sp.oo, -sp.oo, sp.zoo):
        return a == b
    if (a.has(sp.Float) or b.has(sp.Float)) and not tol:
        tol = 1e-9  # a decimal the learner wrote (0.00044) against an exact key (11/25000)
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


_REL = {"<": sp.Lt, ">": sp.Gt, "<=": sp.Le, ">=": sp.Ge}


def parse_solution_set(s: str, var=None) -> sp.Set:
    """Solution set of an inequality answer, written as an inequality (x > 3, -2 <= x < 5,
    3 < x) or in interval notation ((3, oo), [-2, 5))."""
    t = s.strip()
    for a, b in UNICODE.items():
        t = t.replace(a, b)
    t = t.replace("=<", "<=").replace("=>", ">=")
    if re.search(r"[<>]", t):
        var = var or X
        parts = re.split(r"(<=|>=|<|>)", t.replace(" ", ""))
        vals = parts[0::2]
        ops = parts[1::2]
        cond = sp.true
        for (lhs, op, rhs) in zip(vals, ops, vals[1:]):
            cond = sp.And(cond, _REL[op](parse(lhs), parse(rhs)))
        rels = sp.And.make_args(cond) if isinstance(cond, sp.And) else (cond,)
        free = set().union(*(r.free_symbols for r in rels))
        if len(free) != 1:
            raise ValueError(f"not an inequality in one variable: {s}")
        v = next(iter(free))
        out = sp.S.Reals
        for r in rels:
            out = out & sp.solveset(r.subs(v, var), var, sp.S.Reals)
        return out
    return parse_intervals(t)


def parse_point(s: str) -> tuple:
    """An ordered pair: (3, -2), x = 3, y = -2, or 3, -2."""
    t = s.strip()
    for a, b in UNICODE.items():
        t = t.replace(a, b)
    m = re.fullmatch(r"\s*x\s*=\s*([^,;]+)[,;]?\s*(and)?\s*y\s*=\s*(.+)", t)
    if m:
        return (parse(m.group(1)), parse(m.group(3)))
    t = t.strip().strip("()")
    parts = [p for p in re.split(r"[,;]", t) if p.strip()]
    if len(parts) != 2:
        raise ValueError(f"not an ordered pair: {s}")
    return (parse(parts[0]), parse(parts[1]))


def parse_set(s: str) -> list:
    t = s.strip().strip("{}")
    t = re.sub(r"\b[a-z]\s*=\s*", "", t)
    out = []
    for p in re.split(r",|\band\b|\bor\b|;", t):
        p = p.strip()
        if not p:
            continue
        if "±" in p or "+-" in p or "+/-" in p:
            q = p.replace("+/-", "±").replace("+-", "±")
            out += [parse(q.replace("±", "+", 1)), parse(q.replace("±", "-", 1))]
        else:
            out.append(parse(p))
    return out


def same_set(got: list, want: list) -> bool:
    if len(got) != len(want):
        return False
    left = list(want)
    for g in got:
        hit = next((w for w in left if equal(g, w)), None)
        if hit is None:
            return False
        left.remove(hit)
    return True


# ---------------------------------------------------------------------------

UNITS = re.compile(r"\s*(ft\s*/\s*s(ec)?|m\s*/\s*s|feet per second|square units|sq\.? units|units?\s*\^?\s*\(?2\)?|units?"
                   r"|square (feet|ft|inches|meters|miles)|sq\.? ?(ft|in|m)|ft²|ft\^2|ft|feet|foot|inches|inch|in\.|sec|seconds?"
                   r"|minutes?|min|hours?|hrs?|days?|years?|yrs?|miles?|mi|mph|miles per hour|km|cm|meters?|m|gallons?|liters?"
                   r"|pounds?|lbs?|ounces?|oz|dollars?|cents?|percent|%|tickets?|dimes?|quarters?|nickels?|pennies|coins?"
                   r"|students?|people|classes|items?)\.?\s*$", re.I)


def strip_units(s: str) -> str:
    """'$1,250.50' -> '1250.50'; '12 feet' -> '12'; '25%' -> '25' (only when a number is present)."""
    if not re.search(r"\d", s):
        return s
    t = s.strip()
    t = re.sub(r"^\$\s*|^-\s*\$\s*", lambda m_: "-" if "-" in m_.group(0) else "", t)
    t = re.sub(r"(?<=\d),(?=\d{3}\b)", "", t)
    for _ in range(2):
        t = UNITS.sub("", t)
    return t


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
    """Return (correct, explanation) for a student's final answer string.

    A letter that is a function name elsewhere (f, g, h, s, p) is read as a variable when the
    key itself uses it as one (h for height in A = (1/2)bh)."""
    names = set()
    try:
        names = {str(sym) for sym in sp.sympify(key.get("value")).free_symbols} & {"f", "g", "h", "s", "p", "F", "G"} \
            if isinstance(key.get("value"), str) and key.get("kind") in ("expr", "equation") else set()
    except Exception:  # noqa: BLE001
        names = set()
    tok = _SYMBOL_OVERRIDES.set(frozenset(names))
    try:
        return _grade(key, student)
    finally:
        _SYMBOL_OVERRIDES.reset(tok)


def _grade(key: dict, student: str | None) -> tuple[bool, str]:
    if student is None or not str(student).strip():
        return False, "no final answer"
    student = str(student).strip()
    m = re.fullmatch(r"Eq\((.+)\)", student)
    if m:  # a transcribed equation line: read it as lhs = rhs
        try:
            e = sp.sympify(student, locals={"Eq": sp.Eq})
            if isinstance(e, sp.Equality):
                student = f"{sp.sstr(e.lhs)} = {sp.sstr(e.rhs)}"
        except Exception:  # noqa: BLE001
            pass
    m = re.fullmatch(r"Tuple\((.+)\)", student)
    if m:
        student = f"({m.group(1)})"
    if key["kind"] not in ("choice", "point", "points", "ineq", "equation", "set"):
        student = re.sub(r"^\s*(lim.*?=|[a-zA-Zδε]+\s*=)\s*", "", student)
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
            ok = equal(parse(student), sp.sympify(key["value"]), key.get("tol", 0.0))
            form = key.get("form")
            if ok and form == "scientific" and not re.search(r"(\*|x|×|·)\s*10\s*(\^|\*\*)", student.replace(" ", "")):
                return False, "equal, but not written in scientific notation"
            if ok and form == "simplified_radical" and not _radical_simplified(student_raw_expr(student)):
                return False, "equal, but the radical is not fully simplified"
            if ok and form == "lowest_terms" and not _lowest_terms(student):
                return False, "equal, but the fraction is not in lowest terms"
            if ok and form == "prime_factorization" and not _prime_product(student):
                return False, "equal, but not written as a product of primes"
            return ok, f"the answer is {show(key)}"
        if kind == "choice":
            s = norm_choice(student)
            accepted = {norm_choice(key["value"])} | {norm_choice(a) for a in key.get("aliases", [])}
            return s in accepted, f"the answer is {show(key)}"
        if kind == "set":
            got = parse_set(student) if not re.fullmatch(r"\s*(none|no\s*\w*|∅|\{\})\s*", student, re.I) else []
            want = [sp.sympify(v) for v in key["value"]]
            return same_set(got, want), f"the answer is {', '.join(map(str, want))}"
        if kind == "equation":
            want = sp.sympify(key["value"])
            if "=" not in student:
                return False, "write an equation"
            lhs, _, rhs = student.partition("=")
            diff = parse(lhs) - parse(rhs)
            ratio = sp.simplify(diff / want)
            ok = ratio.is_number and ratio != 0
            if ok and key.get("form") == "slope_intercept" and sp.sympify(parse(lhs)) != sp.Symbol("y"):
                return False, "equivalent, but not in slope-intercept form y = mx + b"
            return bool(ok), f"the answer is {key.get('display', show(key))}"
        if kind == "interval":
            return parse_intervals(student) == sp.sympify(key["value"]), f"the answer is {show(key)}"
        if kind == "ineq":
            want = sp.sympify(key["value"])
            v = sp.Symbol(key.get("var", "x"))
            return parse_solution_set(student, v) == want, f"the solution set is {show(key)}"
        if kind == "point":
            want = tuple(sp.sympify(v) for v in key["value"])
            got = parse_point(student)
            return all(equal(g, w) for g, w in zip(got, want)), f"the answer is ({', '.join(map(str, want))})"
        if kind == "points":
            want = {tuple(sp.nsimplify(sp.sympify(v)) for v in pt) for pt in key["value"]}
            chunks = re.findall(r"\(([^()]*)\)", student) if "(" in student else []
            got = {tuple(sp.nsimplify(parse(c)) for c in ch.split(",")) for ch in chunks}
            return got == want, f"the answer is {sorted(want)}"
        if kind == "expr":
            stu = parse(student)
            if not equal(stu, sp.sympify(key["value"])):
                return False, f"not equal to {show(key)}"
            form = key.get("form")
            if form == "factored" and not _is_factored(stu):
                return False, "equivalent but not factored"
            if form == "factored_completely":
                raw = student_raw_expr(student)
                if not _is_factored(raw, any_degree=True):
                    return False, "equivalent but not factored"
                if not _factored_completely(raw):
                    return False, "equivalent, but a factor can still be factored"
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
            if form == "simplified_radical" and not _radical_simplified(student_raw_expr(student)):
                return False, "equivalent but the radical is not fully simplified"
            if form == "positive_exponents" and re.search(r"(\^|\*\*)\s*\(?\s*[-−]", student):
                return False, "equivalent but still has a negative exponent"
            return True, "equivalent"
        if kind == "delta":
            return check_delta(key, parse(student))
    except ValueError as e:
        return False, str(e)
    raise ValueError(f"unknown answer kind {kind}")


def student_raw_expr(s: str):
    """The student's expression without evaluation, to inspect its written form."""
    t = s.strip()
    t = re.sub(r"√\s*(\d+|[a-zA-Z])", r"sqrt(\1)", t)
    t = re.sub(r"([\w)])\s*√", r"\1*√", t)
    for a, b in UNICODE.items():
        t = t.replace(a, b)
    t = re.sub(r"^\s*[a-zA-Z]\s*=\s*", "", t)
    try:
        return parse_expr(t, local_dict=dict(LOCALS), transformations=TRANSFORMS, evaluate=False)
    except Exception:  # noqa: BLE001
        return parse(s)


def _radical_simplified(e) -> bool:
    """No square factor left under a square root, and no radical in a denominator."""
    e = sp.sympify(e)
    for a in sp.preorder_traversal(e):
        if isinstance(a, sp.Pow) and a.exp == sp.Rational(1, 2) and a.base.is_Integer:
            n = int(a.base)
            if any(n % (k * k) == 0 for k in range(2, int(n ** 0.5) + 1)):
                return False
    den = sp.fraction(sp.together(e))[1]
    return not any(isinstance(a, sp.Pow) and a.exp.is_Rational and not a.exp.is_Integer
                   for a in sp.preorder_traversal(den))


def _lowest_terms(s: str) -> bool:
    for a, b in re.findall(r"(\d+)\s*/\s*(\d+)", s):
        if sp.gcd(int(a), int(b)) != 1:
            return False
    return True


def norm_choice(s: str) -> str:
    s = s.strip().lower()
    s = re.sub(r"^\(?([a-e])[).]?\s*$", r"\1", s)
    return re.sub(r"[^a-z0-9]", "", s)


def _is_factored(e, any_degree: bool = False) -> bool:
    e = e if any_degree else sp.sympify(e)
    if not isinstance(e, sp.Mul) and not isinstance(e, sp.Pow):
        return False
    factors = [f for f in sp.Mul.make_args(e) if f.free_symbols]
    count = sum(int(f.exp) if isinstance(f, sp.Pow) and f.exp.is_Integer else 1 for f in factors)
    if any_degree:
        return count >= 2 or (count == 1 and any(not f.free_symbols and f != 1 for f in sp.Mul.make_args(e)))
    return count >= 2 and all(sp.degree(f.base if isinstance(f, sp.Pow) else f, X) <= 2 for f in factors)


def _factored_completely(e) -> bool:
    """Every non-constant factor is irreducible over the rationals, and no common numeric factor
    is left inside a factor. `e` is the expression as written (unevaluated)."""
    for f in sp.Mul.make_args(e):
        base = f.base if isinstance(f, sp.Pow) and f.exp.is_Integer else f
        base = sp.expand(base)
        if not base.free_symbols:
            continue
        poly = sp.Poly(base, *sorted(base.free_symbols, key=str))
        if not poly.is_irreducible:
            return False
        if poly.total_degree() > 0 and sp.gcd_list(poly.coeffs()) not in (1, -1):
            return False
    return True


def _prime_product(s: str) -> bool:
    t = s.replace("·", "*").replace("×", "*").replace("⋅", "*").replace(" ", "")
    if not re.search(r"[*^x]|\*\*", t):
        return sp.isprime(int(re.sub(r"\D", "", t) or 0))
    bases = re.findall(r"(?<![\^*]{2})(?<!\^)(\d+)", t)
    return all(sp.isprime(int(b_)) for b_ in bases)


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
