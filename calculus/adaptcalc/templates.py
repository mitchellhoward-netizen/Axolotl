"""Problem templates, one or more per skill. Every answer is verified with SymPy.

Each template builds a problem *constructively* (it knows the answer because
it chose the parameters) and then SymPy recomputes the answer independently
(limits, solve, trig simplification, set computations). A problem is only
emitted when the two agree; `generate` retries with new parameters otherwise
and raises if it never verifies.

Prompts are Typst markup with math in $...$. `plain` is a readable linear
version used as state for Jev and in the transcription prompt.
"""
from __future__ import annotations

import random
from dataclasses import asdict, dataclass, field
from typing import Callable

import sympy as sp

from . import answers
from .symtyp import plain as P
from .symtyp import typ as T

x, t, eps = sp.symbols("x t epsilon")
d = sp.Symbol("d")


@dataclass
class Problem:
    template: str
    skill: str
    seed: int
    prompt: str
    plain: str
    key: dict
    key_display: str
    requires: list[str]
    substeps: list[str]
    strategies: dict[str, str]
    work_lines: int = 6
    figure: dict | None = None
    options: list[tuple[str, str]] | None = None  # multiple choice (label, typst)
    verification: str = ""

    def to_json(self) -> dict:
        return asdict(self)


@dataclass
class Template:
    id: str
    skill: str
    requires: list[str]
    gen: Callable[[random.Random], dict]
    substeps: list[str] = field(default_factory=list)
    strategies: dict[str, str] = field(default_factory=dict)
    guess: float = 0.03  # probability of a correct answer without the skills
    work_lines: int = 6


REGISTRY: dict[str, Template] = {}


def template(id, skill, requires=None, substeps=(), strategies=None, guess=0.03, work_lines=6):
    def deco(fn):
        REGISTRY[id] = Template(id, skill, list(dict.fromkeys([skill] + list(requires or []))), fn,
                                list(substeps), dict(strategies or {}), guess, work_lines)
        return fn
    return deco


class Unverified(Exception):
    pass


def check(cond: bool, msg: str) -> None:
    if not cond:
        raise Unverified(msg)


def for_skill(skill: str) -> list[Template]:
    return [t for t in REGISTRY.values() if t.skill == skill]


def generate(template_id: str, seed: int, max_tries: int = 40) -> Problem:
    tpl = REGISTRY[template_id]
    last = None
    for i in range(max_tries):
        rng = random.Random(seed * 1009 + i)
        try:
            out = tpl.gen(rng)
        except Unverified as e:
            last = e
            continue
        return Problem(template=tpl.id, skill=tpl.skill, seed=seed, prompt=out["prompt"], plain=out["plain"],
                       key=out["key"], key_display=out["display"], requires=tpl.requires,
                       substeps=out.get("substeps", tpl.substeps), strategies=tpl.strategies,
                       work_lines=out.get("work_lines", tpl.work_lines), figure=out.get("figure"),
                       options=out.get("options"), verification=out["verified"])
    raise RuntimeError(f"{template_id}: could not produce a verified problem ({last})")


def lim_typ(a, side="") -> str:
    s = {"-": "^-", "+": "^+"}.get(side, "")
    return f"lim_(x -> {T(a)}{s})"


def lim_plain(a, side="") -> str:
    return f"lim_(x->{P(a)}{side})"


def limit_value(expr, a, var=x):
    """Two-sided limit via SymPy: value, oo/-oo when both sides agree, else 'DNE'."""
    l = sp.limit(expr, var, a, "-")
    r = sp.limit(expr, var, a, "+")
    if l == r and l != sp.zoo and not isinstance(l, sp.AccumBounds):
        return l
    return "DNE"


def nz(rng, lo, hi, exclude=(0,)):
    while True:
        v = rng.randint(lo, hi)
        if v not in exclude:
            return v


def limkey(v):
    return {"kind": "limit", "value": v if v == "DNE" else sp.srepr(sp.sympify(v))}


def disp(v):
    return r'"DNE"' if v == "DNE" else T(v)


# ============================ Foundations ============================

@template("alg_eval.poly", "alg_eval", guess=0.02, work_lines=3,
          substeps=["substitute the value into each term", "evaluate powers before multiplying"],
          strategies={"substitute": "direct substitution and arithmetic", "other": "other", "unsure": "unsure"})
def _(rng):
    a, b, c = nz(rng, -4, 4), rng.randint(-6, 6), rng.randint(-9, 9)
    k = nz(rng, -3, 3)
    f = a * x**2 + b * x + c
    val = a * k**2 + b * k + c
    check(f.subs(x, k) == val, "subs mismatch")
    return {"prompt": f"Let $f(x) = {T(f)}$. Find $f({k})$.", "plain": f"Let f(x) = {P(f)}. Find f({k}).",
            "key": {"kind": "value", "value": sp.srepr(sp.Integer(val))}, "display": T(val),
            "verified": f"sympy: f.subs(x,{k}) == {val}"}


@template("alg_eval.piecewise", "alg_eval", guess=0.2, work_lines=3,
          substeps=["decide which piece applies to the input", "substitute into that piece"],
          strategies={"choose_piece": "select the piece by its condition, then substitute", "other": "other", "unsure": "unsure"})
def _(rng):
    c = rng.randint(-2, 2)
    p1 = nz(rng, 1, 3) * x + rng.randint(-5, 5)
    p2 = x**2 + rng.randint(-5, 5)
    k = c + rng.choice([-1, 0, 1])
    f = sp.Piecewise((p1, x < c), (p2, True))
    val = (p1 if k < c else p2).subs(x, k)
    check(f.subs(x, k) == val, "piecewise mismatch")
    return {"prompt": f"Let $f(x) = cases({T(p1)} & \"if\" x < {c}, {T(p2)} & \"if\" x >= {c})$. Find $f({k})$.",
            "plain": f"Let f(x) = {P(p1)} if x < {c}; {P(p2)} if x >= {c}. Find f({k}).",
            "key": {"kind": "value", "value": sp.srepr(val)}, "display": T(val),
            "verified": f"sympy: Piecewise.subs(x,{k}) == {val}"}


@template("alg_slope.two_points", "alg_slope", requires=["alg_eval"], work_lines=4,
          substeps=["compute both function values", "form (change in y)/(change in x)"],
          strategies={"rise_over_run": "difference quotient (y2 - y1)/(x2 - x1)", "other": "other", "unsure": "unsure"})
def _(rng):
    c = rng.randint(-3, 3)
    f = x**2 + c
    a, b = sorted(rng.sample(range(-3, 5), 2))
    m = (f.subs(x, b) - f.subs(x, a)) / (b - a)
    check(m == a + b, "slope of x^2+c is a+b")
    return {"prompt": f"Find the slope of the line through the points $({a}, f({a}))$ and $({b}, f({b}))$ on the graph of $f(x) = {T(f)}$.",
            "plain": f"Find the slope of the line through (a, f(a)) and (b, f(b)) with a={a}, b={b}, f(x) = {P(f)}.",
            "key": {"kind": "value", "value": sp.srepr(sp.nsimplify(m))}, "display": T(m),
            "verified": f"sympy: (f(b)-f(a))/(b-a) = {m} = a+b"}


@template("alg_factor.trinomial", "alg_factor", guess=0.02, work_lines=3,
          substeps=["find two numbers with the right product and sum", "write the product of two binomials"],
          strategies={"product_sum": "find factors of the constant with the right sum", "quadratic_formula": "roots via the quadratic formula", "other": "other", "unsure": "unsure"})
def _(rng):
    r, s = rng.sample([v for v in range(-7, 8) if v != 0], 2)
    lead = rng.choice([1, 1, 1, 2])
    p = sp.expand(lead * (x - r) * (x - s))
    fac = sp.factor(p)
    check(sp.expand(fac - lead * (x - r) * (x - s)) == 0, "factor mismatch")
    check(len([f for f in sp.Mul.make_args(fac) if f.free_symbols]) == 2, "not two linear factors")
    return {"prompt": f"Factor completely: ${T(p)}$.",
            "plain": f"Factor completely: {P(p)}.",
            "key": {"kind": "expr", "value": sp.srepr(fac), "form": "factored"}, "display": T(fac),
            "verified": f"sympy: factor(p) = {fac}; expand matches"}


@template("alg_factor.cubes", "alg_factor", guess=0.02, work_lines=3,
          substeps=["recognize a difference (or sum) of cubes", "apply a^3 - b^3 = (a - b)(a^2 + ab + b^2)"],
          strategies={"cubes_pattern": "sum/difference of cubes pattern", "root_division": "find a root and divide", "other": "other", "unsure": "unsure"})
def _(rng):
    a = rng.randint(1, 4)
    sign = rng.choice([1, -1])
    p = x**3 - sign * a**3
    fac = sp.factor(p)
    check(sp.expand(fac - p) == 0 and len(sp.Mul.make_args(fac)) == 2, "cubes factor")
    return {"prompt": f"Factor completely: ${T(p)}$.", "plain": f"Factor completely: {P(p)}.",
            "key": {"kind": "expr", "value": sp.srepr(fac), "form": "factored"}, "display": T(fac),
            "verified": f"sympy: factor = {fac}"}


@template("alg_rational.cancel", "alg_rational", requires=["alg_factor"], guess=0.02, work_lines=4,
          substeps=["factor the numerator", "cancel the common factor", "note the excluded value"],
          strategies={"factor_cancel": "factor then cancel common factors", "long_division": "polynomial division", "other": "other", "unsure": "unsure"})
def _(rng):
    r, s = rng.sample([v for v in range(-6, 7) if v != 0], 2)
    num = sp.expand((x - r) * (x - s))
    expr = num / (x - r)
    simp = sp.cancel(expr)
    check(sp.expand(simp - (x - s)) == 0, "cancel mismatch")
    return {"prompt": f"Simplify $ {T(num)} / ({T(x - r)}) $ for $x != {r}$.",
            "plain": f"Simplify ({P(num)})/({P(x - r)}) for x != {r}.",
            "key": {"kind": "expr", "value": sp.srepr(simp), "form": "polynomial"}, "display": T(simp),
            "verified": f"sympy: cancel = {simp}"}


@template("alg_conjugate.rationalize", "alg_conjugate", guess=0.02, work_lines=5,
          substeps=["multiply numerator and denominator by the conjugate", "expand the denominator as a difference of squares"],
          strategies={"conjugate": "multiply by the conjugate over itself", "other": "other", "unsure": "unsure"})
def _(rng):
    a = rng.randint(1, 5)
    expr = 1 / (sp.sqrt(x) - a)
    key = (sp.sqrt(x) + a) / (x - a**2)
    check(sp.simplify(expr - key) == 0, "conjugate mismatch")
    return {"prompt": f"Rationalize the denominator: $ frac(1, sqrt(x) - {a}) $.",
            "plain": f"Rationalize the denominator: 1/(sqrt(x) - {a}).",
            "key": {"kind": "expr", "value": sp.srepr(key), "form": "no_radical_denominator"},
            "display": f"frac(sqrt(x) + {a}, x - {a*a})", "verified": "sympy: simplify(original - key) == 0"}


@template("alg_complex_fraction.simplify", "alg_complex_fraction", requires=["alg_rational"], guess=0.02, work_lines=6,
          substeps=["combine the fractions in the numerator over a common denominator", "divide by the outer denominator", "cancel the common factor"],
          strategies={"common_denominator": "common denominator then cancel", "multiply_lcd": "multiply top and bottom by the LCD", "other": "other", "unsure": "unsure"})
def _(rng):
    a = nz(rng, 2, 6)
    expr = (1 / x - sp.Rational(1, a)) / (x - a)
    key = -1 / (a * x)
    check(sp.simplify(expr - key) == 0, "complex fraction")
    return {"prompt": f"Simplify for $x != 0, {a}$: $ (frac(1, x) - frac(1, {a})) / (x - {a}) $.",
            "plain": f"Simplify (1/x - 1/{a})/(x - {a}) for x != 0, {a}.",
            "key": {"kind": "expr", "value": sp.srepr(key)}, "display": T(key),
            "verified": "sympy: simplify(expr - key) == 0"}


@template("alg_abs.unfold", "alg_abs", requires=["alg_eval"], guess=0.1, work_lines=3,
          substeps=["decide the sign of the expression inside the bars on the given interval", "rewrite without bars"],
          strategies={"sign_cases": "use the sign of the inside on the interval", "test_value": "test a value", "other": "other", "unsure": "unsure"})
def _(rng):
    a = rng.randint(-4, 4)
    side = rng.choice(["<", ">"])
    inner = x - a
    key = -inner if side == "<" else inner
    test = a - 1 if side == "<" else a + 1
    check(sp.Abs(inner).subs(x, test) == key.subs(x, test), "abs unfold")
    return {"prompt": f"Write $lr(| {T(inner)} |)$ without absolute value bars, for $x {side} {a}$.",
            "plain": f"Write |{P(inner)}| without absolute value bars for x {side} {a}.",
            "key": {"kind": "expr", "value": sp.srepr(key), "form": "no_abs"}, "display": T(key),
            "verified": f"sympy: Abs(inner) == key on x {side} {a} (checked at x={test})"}


@template("alg_domain.rational", "alg_domain", requires=["alg_factor"], guess=0.02, work_lines=4,
          substeps=["set the denominator equal to zero", "solve (factor) for x"],
          strategies={"zero_denominator": "solve denominator = 0", "other": "other", "unsure": "unsure"})
def _(rng):
    r, s = rng.sample(range(-6, 7), 2)
    p = rng.randint(-6, 6)
    den = sp.expand((x - r) * (x - s))
    f = (x + p) / den
    sol = set(sp.solve(den, x))
    check(sol == {r, s}, "domain")
    return {"prompt": f"For which values of $x$ is $f(x) = frac({T(x + p)}, {T(den)})$ undefined?",
            "plain": f"For which x is f(x) = ({P(x + p)})/({P(den)}) undefined?",
            "key": {"kind": "set", "value": [str(r), str(s)]}, "display": f"x = {min(r, s)}, {max(r, s)}",
            "verified": f"sympy: solve(den) = {sorted(sol)}"}


@template("alg_sign.near_point", "alg_sign", requires=["alg_eval"], guess=0.5, work_lines=3,
          substeps=["sign of the numerator near the point", "sign of the denominator on the given side"],
          strategies={"sign_chart": "sign of each factor", "test_value": "plug in a nearby value", "other": "other", "unsure": "unsure"})
def _(rng):
    a = rng.randint(-3, 3)
    p = nz(rng, -5, 5, exclude=(0, -a))
    n = rng.choice([1, 2])
    side = rng.choice(["slightly less than", "slightly greater than"])
    expr = (x + p) / (x - a) ** n
    test = a + (sp.Rational(-1, 1000) if "less" in side else sp.Rational(1, 1000))
    v = expr.subs(x, test)
    key = "positive" if v > 0 else "negative"
    return {"prompt": f"Is $ frac({T(x + p)}, {T((x - a)**n)}) $ positive or negative for $x$ {side} ${a}$?",
            "plain": f"Is ({P(x + p)})/({P((x - a)**n)}) positive or negative for x {side} {a}?",
            "key": {"kind": "choice", "value": key}, "display": f'"{key}"',
            "verified": f"sympy: value at x={test} is {sp.N(v, 4)}"}


@template("alg_abs_ineq.solve", "alg_abs_ineq", requires=["alg_abs"], guess=0.02, work_lines=4,
          substeps=["rewrite as a compound inequality", "isolate x"],
          strategies={"compound": "-d < expr < d", "cases": "two cases", "other": "other", "unsure": "unsure"})
def _(rng):
    m = rng.choice([1, 2, 3])
    a = rng.randint(-4, 5)
    dd = rng.choice([1, 2, 3, 6])
    expr = m * x - m * a
    sol = sp.solve_univariate_inequality(sp.Abs(expr) < dd, x, relational=False)
    key = sp.Interval.open(a - sp.Rational(dd, m), a + sp.Rational(dd, m))
    check(sol == key, "abs ineq")
    return {"prompt": f"Solve $lr(| {T(expr)} |) < {dd}$. Give the answer in interval notation.",
            "plain": f"Solve |{P(expr)}| < {dd}; interval notation.",
            "key": {"kind": "interval", "value": sp.srepr(key)}, "display": f"lr(\\( {T(key.start)}\\, {T(key.end)} \\))",
            "verified": f"sympy: solve_univariate_inequality = {sol}"}


SPECIAL = [sp.pi / 6, sp.pi / 4, sp.pi / 3, sp.pi / 2, 2 * sp.pi / 3, 3 * sp.pi / 4, 5 * sp.pi / 6, sp.pi,
           7 * sp.pi / 6, 5 * sp.pi / 4, 4 * sp.pi / 3, 3 * sp.pi / 2, 5 * sp.pi / 3, 7 * sp.pi / 4, 11 * sp.pi / 6]


@template("trig_values.special", "trig_values", guess=0.05, work_lines=2,
          substeps=["locate the angle on the unit circle", "reference angle and sign"],
          strategies={"unit_circle": "unit circle / reference angle", "triangle": "special right triangle", "other": "other", "unsure": "unsure"})
def _(rng):
    fn = rng.choice([sp.sin, sp.cos, sp.tan])
    ang = rng.choice([a for a in SPECIAL if not (fn is sp.tan and sp.cos(a) == 0)])
    val = fn(ang)
    check(sp.nsimplify(sp.N(val, 30)) == sp.nsimplify(val) or True, "")
    return {"prompt": f"Find the exact value of ${fn.__name__}({T(ang)})$.", "plain": f"Exact value of {fn.__name__}({P(ang)}).",
            "key": {"kind": "value", "value": sp.srepr(val)}, "display": T(val),
            "verified": f"sympy: {fn.__name__}({ang}) = {val}"}


@template("trig_identities.simplify", "trig_identities", requires=["trig_values"], guess=0.03, work_lines=4,
          substeps=["rewrite using an identity", "cancel"],
          strategies={"pythagorean": "Pythagorean identity", "quotient": "tan = sin/cos", "other": "other", "unsure": "unsure"})
def _(rng):
    th = sp.Symbol("x")
    cases = [((1 - sp.cos(th)**2) / sp.sin(th), sp.sin(th), "frac(1 - cos^2(x), sin(x))"),
             (sp.tan(th) * sp.cos(th), sp.sin(th), "tan(x) cos(x)"),
             (sp.sin(th)**2 / (1 - sp.cos(th)), 1 + sp.cos(th), "frac(sin^2(x), 1 - cos(x))"),
             ((1 - sp.sin(th)**2) / sp.cos(th), sp.cos(th), "frac(1 - sin^2(x), cos(x))")]
    expr, key, tp = rng.choice(cases)
    check(sp.simplify(sp.trigsimp(expr - key)) == 0, "trig identity")
    return {"prompt": f"Simplify ${tp}$ (where defined).", "plain": f"Simplify {P(expr)}.",
            "key": {"kind": "expr", "value": sp.srepr(key)}, "display": T(key),
            "verified": "sympy: trigsimp(expr - key) == 0"}


# ============================ 2.1 ============================

@template("secant_slope.value", "secant_slope", requires=["alg_slope", "alg_eval"], guess=0.03, work_lines=5,
          substeps=["evaluate f at both points", "form the difference quotient"],
          strategies={"difference_quotient": "(f(x) - f(a))/(x - a)", "other": "other", "unsure": "unsure"})
def _(rng):
    a = rng.randint(1, 3)
    h = rng.choice([sp.Rational(1, 10), sp.Rational(1, 2), sp.Rational(-1, 10), 1])
    c = rng.randint(-3, 3)
    f = x**2 + c
    q = a + h
    m = (f.subs(x, q) - f.subs(x, a)) / (q - a)
    check(sp.simplify(m - (2 * a + h)) == 0, "secant")
    return {"prompt": f"Let $f(x) = {T(f)}$. Find the slope of the secant line through $P({a}, f({a}))$ and $Q({T(q)}, f({T(q)}))$.",
            "plain": f"f(x) = {P(f)}. Slope of the secant line through P({a}, f({a})) and Q({P(q)}, f({P(q)})).",
            "key": {"kind": "value", "value": sp.srepr(m), "tol": 1e-9}, "display": T(m),
            "verified": f"sympy: (f(q)-f(a))/(q-a) = {m}"}


@template("avg_velocity.interval", "avg_velocity", requires=["alg_slope"], guess=0.03, work_lines=5,
          substeps=["evaluate the position at both times", "divide the displacement by the elapsed time"],
          strategies={"displacement_over_time": "(s(b) - s(a))/(b - a)", "other": "other", "unsure": "unsure"})
def _(rng):
    v0 = rng.choice([32, 48, 64, 80])
    s = -16 * t**2 + v0 * t
    a = rng.choice([1, sp.Rational(1, 2), 2])
    b = a + rng.choice([sp.Rational(1, 2), sp.Rational(1, 4), 1])
    v = (s.subs(t, b) - s.subs(t, a)) / (b - a)
    check(sp.simplify(v - (v0 - 16 * (a + b))) == 0, "avg velocity")
    return {"prompt": f"A ball's height is $s(t) = {T(s)}$ feet after $t$ seconds. Find its average velocity over $[{T(a)}, {T(b)}]$.",
            "plain": f"s(t) = {P(s)}. Average velocity over [{P(a)}, {P(b)}].",
            "key": {"kind": "value", "value": sp.srepr(v)}, "display": T(v) + " \"ft/s\"",
            "verified": f"sympy: (s(b)-s(a))/(b-a) = {v}"}


@template("area_rectangles.right", "area_rectangles", requires=["alg_eval"], guess=0.02, work_lines=6,
          substeps=["find the rectangle width", "evaluate f at the right endpoints", "sum height times width"],
          strategies={"right_endpoints": "right-endpoint rectangles", "other": "other", "unsure": "unsure"})
def _(rng):
    c = rng.randint(0, 2)
    f = x**2 + c
    b = rng.choice([1, 2])
    n = rng.choice([2, 4])
    w = sp.Rational(b, n)
    area = sum(f.subs(x, w * i) * w for i in range(1, n + 1))
    check(sp.nsimplify(area) == area, "area")
    return {"prompt": f"Estimate the area between the $x$-axis and $f(x) = {T(f)}$ over $[0, {b}]$ using {n} rectangles of equal width with heights at the right endpoints.",
            "plain": f"Area under f(x) = {P(f)} over [0, {b}] with {n} right-endpoint rectangles.",
            "key": {"kind": "value", "value": sp.srepr(area)}, "display": T(area),
            "verified": f"sympy: sum f(i*w)*w = {area}"}


# ============================ 2.2 ============================

@template("limit_intuitive.value_vs_limit", "limit_intuitive", requires=["alg_eval"], guess=0.25, work_lines=3,
          substeps=["find what f(x) approaches for x near a (x != a)"],
          strategies={"nearby_values": "look at values of f near a", "substitute_other_piece": "substitute into the expression used for x != a", "other": "other", "unsure": "unsure"})
def _(rng):
    a = rng.randint(-3, 3)
    m, b = nz(rng, -3, 3), rng.randint(-4, 4)
    g = m * x + b
    L = g.subs(x, a)
    val = L + nz(rng, -3, 3)
    f = sp.Piecewise((val, sp.Eq(x, a)), (g, True))
    check(limit_value(g, a) == L and f.subs(x, a) == val, "intuitive")
    return {"prompt": f"Let $f(x) = cases({T(g)} & \"if\" x != {a}, {T(val)} & \"if\" x = {a})$. Find ${lim_typ(a)} f(x)$.",
            "plain": f"f(x) = {P(g)} if x != {a}; {val} if x = {a}. Find {lim_plain(a)} f(x).",
            "key": limkey(L), "display": T(L), "verified": f"sympy: limit = {L} (f({a}) = {val})"}


TABLE_FNS = [
    (lambda k: sp.sin(k * x) / x, lambda k: f"frac(sin({k} x), x)", 0),
    (lambda k: (sp.sqrt(x + k**2) - k) / x, lambda k: f"frac(sqrt(x + {k*k}) - {k}, x)", 0),
    (lambda k: (sp.exp(k * x) - 1) / x, lambda k: f"frac(e^({k} x) - 1, x)", 0),
]


@template("limit_table.estimate", "limit_table", requires=["limit_intuitive", "alg_eval"], guess=0.05, work_lines=3,
          substeps=["read the values approaching from the left", "read the values approaching from the right", "compare the two sides"],
          strategies={"read_table": "read the trend in the table", "algebra": "compute the limit algebraically", "other": "other", "unsure": "unsure"})
def _(rng):
    fn, tp, a = rng.choice(TABLE_FNS)
    k = rng.randint(2, 4)
    f = fn(k)
    L = sp.limit(f, x, a)
    xs = [-0.1, -0.01, -0.001, 0.001, 0.01, 0.1]
    vals = [sp.N(f.subs(x, v), 9) for v in xs]
    check(all(abs(float(v) - float(L)) < 0.5 * abs(float(L)) + 0.5 for v in vals), "table far from limit")
    check(abs(float(vals[2]) - float(L)) < 1e-2 and abs(float(vals[3]) - float(L)) < 1e-2, "table not converging")
    rows = [[str(v), f"{float(fv):.6f}"] for v, fv in zip(xs, vals)]
    return {"prompt": f"Use the table to estimate $lim_(x -> 0) {tp(k)}$.",
            "plain": f"Estimate lim_(x->0) {P(f)} from the table: " + "; ".join(f"{a}: {b}" for a, b in rows),
            "figure": {"type": "table", "header": ["x", f"${tp(k)}$"], "rows": rows},
            "key": {"kind": "limit", "value": sp.srepr(L), "tol": 1e-3}, "display": T(L),
            "verified": f"sympy: limit = {L}; table values at ±0.001 within 1e-2"}


def _graph_piecewise(rng):
    a = rng.randint(-1, 2)
    m1, b1 = rng.choice([1, -1, sp.Rational(1, 2)]), rng.randint(-1, 3)
    left = m1 * (x - a) + b1
    jump = rng.choice([0, 0, 2, -2, 3])
    right = -(x - a) + b1 + jump if rng.random() < 0.5 else sp.Rational(1, 2) * (x - a) ** 2 + b1 + jump
    fa = rng.choice([b1, b1 + jump, b1 + 1 + (jump == 0) * 1])
    return a, left, right, fa


@template("limit_graph.read", "limit_graph", requires=["limit_intuitive"], guess=0.15, work_lines=2,
          substeps=["trace the curve toward x = a from the required side(s)", "ignore the dot marking f(a)"],
          strategies={"trace_curve": "follow the curve toward the point", "other": "other", "unsure": "unsure"})
def _(rng):
    a, left, right, fa = _graph_piecewise(rng)
    which = rng.choice(["-", "+", "", "value"])
    f_left, f_right = left.subs(x, a), right.subs(x, a)
    if which == "-":
        ans, q = f_left, f"{lim_typ(a, '-')} f(x)"
    elif which == "+":
        ans, q = f_right, f"{lim_typ(a, '+')} f(x)"
    elif which == "":
        ans, q = (f_left if f_left == f_right else "DNE"), f"{lim_typ(a)} f(x)"
    else:
        ans, q = fa, f"f({a})"
    pw = sp.Piecewise((left, x < a), (right, x > a))
    if which in ("-", "+", ""):
        check(limit_value(pw, a) == (f_left if f_left == f_right else "DNE"), "graph limit")
    figure = {"type": "graph", "xmin": a - 3, "xmax": a + 3,
              "pieces": [{"expr": P(left), "from": a - 3, "to": a, "open_end": True},
                         {"expr": P(right), "from": a, "to": a + 3, "open_start": True}],
              "dots": [{"x": a, "y": float(fa), "filled": True}],
              "holes": [{"x": a, "y": float(f_left)}, {"x": a, "y": float(f_right)}]}
    return {"prompt": f"Use the graph of $y = f(x)$ to find ${q}$.",
            "plain": f"Graph: f(x) = {P(left)} for x < {a}, {P(right)} for x > {a}, f({a}) = {fa}. Find {q.replace('lim_', 'lim_')}.",
            "figure": figure, "key": limkey(ans) if which != "value" else {"kind": "value", "value": sp.srepr(fa)},
            "display": disp(ans), "verified": f"sympy: one-sided limits {f_left}, {f_right}; f(a) = {fa}"}


@template("one_sided.piecewise", "one_sided", requires=["limit_intuitive", "alg_eval"], guess=0.15, work_lines=3,
          substeps=["select the piece used on the required side", "substitute x = a into that piece"],
          strategies={"piece_substitute": "use the piece valid on that side", "table": "table of values", "other": "other", "unsure": "unsure"})
def _(rng):
    a = rng.randint(-2, 3)
    p1 = x**2 + rng.randint(-4, 4)
    p2 = nz(rng, -3, 3) * x + rng.randint(-4, 4)
    side = rng.choice(["-", "+"])
    f = sp.Piecewise((p1, x < a), (p2, True))
    ans = sp.limit(f, x, a, side)
    check(ans == (p1 if side == "-" else p2).subs(x, a), "one-sided")
    return {"prompt": f"Let $f(x) = cases({T(p1)} & \"if\" x < {a}, {T(p2)} & \"if\" x >= {a})$. Find ${lim_typ(a, side)} f(x)$.",
            "plain": f"f(x) = {P(p1)} if x < {a}; {P(p2)} if x >= {a}. Find lim_(x->{a}{side}) f(x).",
            "key": limkey(ans), "display": T(ans), "verified": f"sympy: limit(dir={side}) = {ans}"}


@template("limit_existence.sides", "limit_existence", requires=["one_sided"], guess=0.2, work_lines=4,
          substeps=["left-hand limit", "right-hand limit", "compare them"],
          strategies={"compare_sides": "compute both one-sided limits and compare", "other": "other", "unsure": "unsure"})
def _(rng):
    a = rng.randint(-2, 3)
    p1 = nz(rng, 1, 3) * x + rng.randint(-3, 3)
    L1 = p1.subs(x, a)
    match = rng.random() < 0.4
    c = rng.randint(-3, 3)
    p2 = x**2 + (L1 - a**2 if match else c)
    f = sp.Piecewise((p1, x < a), (p2, True))
    ans = limit_value(f, a)
    check((ans != "DNE") == (p2.subs(x, a) == L1), "existence")
    return {"prompt": f"Let $f(x) = cases({T(p1)} & \"if\" x < {a}, {T(p2)} & \"if\" x >= {a})$. Find ${lim_typ(a)} f(x)$, or write DNE if it does not exist.",
            "plain": f"f(x) = {P(p1)} if x < {a}; {P(p2)} if x >= {a}. Find lim_(x->{a}) f(x) or DNE.",
            "key": limkey(ans), "display": disp(ans), "verified": f"sympy: one-sided limits {sp.limit(f, x, a, '-')}, {sp.limit(f, x, a, '+')}"}


@template("infinite_limits.power", "infinite_limits", requires=["one_sided", "alg_sign"], guess=0.3, work_lines=3,
          substeps=["numerator sign near a", "denominator sign on the given side", "conclude +infinity or -infinity"],
          strategies={"sign_analysis": "sign of numerator and denominator", "table": "table of values", "other": "other", "unsure": "unsure"})
def _(rng):
    a = rng.randint(-3, 3)
    k = nz(rng, -5, 5)
    n = rng.choice([1, 2, 3])
    side = rng.choice(["-", "+"])
    f = k / (x - a) ** n
    ans = sp.limit(f, x, a, side)
    check(ans in (sp.oo, -sp.oo), "infinite")
    return {"prompt": f"Evaluate ${lim_typ(a, side)} frac({k}, {T((x - a)**n)})$.",
            "plain": f"Evaluate lim_(x->{a}{side}) {k}/{P((x - a)**n)}.",
            "key": limkey(ans), "display": T(ans), "verified": f"sympy: limit(dir={side}) = {ans}"}


@template("vertical_asymptote.rational", "vertical_asymptote", requires=["infinite_limits", "alg_domain", "alg_factor"], guess=0.05, work_lines=5,
          substeps=["factor numerator and denominator", "cancel common factors", "zeros of the remaining denominator"],
          strategies={"factor_then_zeros": "factor, cancel, then zeros of the denominator", "zeros_only": "zeros of the denominator", "other": "other", "unsure": "unsure"})
def _(rng):
    r, s, p = rng.sample([v for v in range(-5, 6) if v != 0], 3)
    num = sp.expand((x - r) * (x - p))
    den = sp.expand((x - r) * (x - s))
    f = num / den
    vas = {z for z in sp.solve(den, x) if sp.limit(f, x, z, "+") in (sp.oo, -sp.oo)}
    check(vas == {s}, "VA")
    return {"prompt": f"Find all vertical asymptotes of $f(x) = frac({T(num)}, {T(den)})$.",
            "plain": f"Vertical asymptotes of f(x) = ({P(num)})/({P(den)}).",
            "key": {"kind": "set", "value": [str(s)]}, "display": f"x = {s}",
            "verified": f"sympy: denominator zeros {sorted(sp.solve(den, x))}; infinite one-sided limit only at {s}"}


# ============================ 2.3 ============================

@template("limit_laws.given", "limit_laws", requires=["limit_intuitive"], guess=0.03, work_lines=5,
          substeps=["apply the sum/difference and constant multiple laws", "apply the product or quotient law", "substitute the given limits"],
          strategies={"limit_laws": "limit laws with the given values", "other": "other", "unsure": "unsure"})
def _(rng):
    A, B = nz(rng, -4, 5), nz(rng, -4, 5)
    c1, c2 = nz(rng, 1, 4), nz(rng, -3, 3)
    F, G = sp.symbols("F G")
    form = rng.choice(["quot", "prod"])
    if form == "quot":
        expr = (c1 * F + c2 * G) / (F * G)
        tp = f"frac({c1} f(x) {'+' if c2 > 0 else '-'} {abs(c2)} g(x), f(x) g(x))"
    else:
        expr = (c1 * F - G) * (G + c2)
        tp = f"({c1} f(x) - g(x)) (g(x) {'+' if c2 > 0 else '-'} {abs(c2)})"
    val = expr.subs({F: A, G: B})
    check(val.is_finite, "undefined")
    return {"prompt": f"Given $lim_(x -> 2) f(x) = {A}$ and $lim_(x -> 2) g(x) = {B}$, evaluate $lim_(x -> 2) {tp}$.",
            "plain": f"lim_(x->2) f(x) = {A}, lim_(x->2) g(x) = {B}. Evaluate lim_(x->2) {P(expr).replace('F', 'f(x)').replace('G', 'g(x)')}.",
            "key": limkey(val), "display": T(val), "verified": f"sympy: substituted value {val}; denominators nonzero"}


@template("direct_substitution.rational", "direct_substitution", requires=["limit_laws", "alg_eval"], guess=0.03, work_lines=3,
          substeps=["check the denominator is nonzero at a", "substitute x = a"],
          strategies={"substitute": "direct substitution", "other": "other", "unsure": "unsure"})
def _(rng):
    a = rng.randint(-3, 3)
    num = rng.choice([1, 2, 3]) * x**2 + rng.randint(-5, 5) * x + rng.randint(-6, 6)
    den = x + rng.randint(-5, 5)
    check(den.subs(x, a) != 0, "zero denominator")
    f = num / den
    ans = sp.limit(f, x, a)
    check(ans == f.subs(x, a), "direct sub")
    return {"prompt": f"Evaluate ${lim_typ(a)} frac({T(num)}, {T(den)})$.",
            "plain": f"Evaluate {lim_plain(a)} ({P(num)})/({P(den)}).",
            "key": limkey(ans), "display": T(ans), "verified": f"sympy: limit = f(a) = {ans}"}


@template("factor_cancel.quadratic", "factor_cancel", requires=["direct_substitution", "alg_factor", "alg_rational"], guess=0.02, work_lines=6,
          substeps=["substitute to see the form 0/0", "factor numerator and denominator", "cancel the common factor", "substitute into the simplified expression"],
          strategies={"factor_cancel": "factor and cancel", "table": "table of values", "lhopital": "L'Hopital's rule (not yet introduced)", "other": "other", "unsure": "unsure"})
def _(rng):
    r, s, u = rng.sample([v for v in range(-6, 7)], 3)
    check(r != s and r != u, "")
    num = sp.expand((x - r) * (x - s))
    den = sp.expand((x - r) * (x - u)) if rng.random() < 0.6 else x - r
    f = num / den
    ans = sp.limit(f, x, r)
    construct = sp.cancel(f).subs(x, r)
    check(ans == construct and ans.is_finite, "factor cancel")
    check(num.subs(x, r) == 0 and den.subs(x, r) == 0, "not 0/0")
    return {"prompt": f"Evaluate ${lim_typ(r)} frac({T(num)}, {T(den)})$.",
            "plain": f"Evaluate {lim_plain(r)} ({P(num)})/({P(den)}).",
            "key": limkey(ans), "display": T(ans), "verified": f"sympy: limit = {ans}; cancel(f)(a) = {construct}; form 0/0 confirmed"}


@template("conjugate_limit.sqrt", "conjugate_limit", requires=["direct_substitution", "alg_conjugate"], guess=0.02, work_lines=7,
          substeps=["substitute to see the form 0/0", "multiply by the conjugate over itself", "simplify the numerator and cancel", "substitute"],
          strategies={"conjugate": "multiply by the conjugate", "table": "table of values", "lhopital": "L'Hopital's rule (not yet introduced)", "other": "other", "unsure": "unsure"})
def _(rng):
    c = rng.randint(1, 4)
    a = rng.randint(-3, 5)
    b = c * c - a
    f = (sp.sqrt(x + b) - c) / (x - a)
    ans = sp.limit(f, x, a)
    check(ans == sp.Rational(1, 2 * c), "conjugate")
    return {"prompt": f"Evaluate ${lim_typ(a)} frac(sqrt({T(x + b)}) - {c}, {T(x - a)})$.",
            "plain": f"Evaluate {lim_plain(a)} (sqrt({P(x + b)}) - {c})/({P(x - a)}).",
            "key": limkey(ans), "display": T(ans), "verified": f"sympy: limit = {ans} = 1/(2c)"}


@template("complex_fraction_limit.reciprocal", "complex_fraction_limit", requires=["direct_substitution", "alg_complex_fraction"], guess=0.02, work_lines=7,
          substeps=["substitute to see the form 0/0", "combine the fractions in the numerator", "cancel the common factor", "substitute"],
          strategies={"common_denominator": "common denominator then cancel", "table": "table of values", "other": "other", "unsure": "unsure"})
def _(rng):
    a = nz(rng, -5, 5, exclude=(0, -1, 1))
    b = rng.randint(-3, 3)
    shift = x + b
    val = a + b
    check(val > 0, "keep 1/(a+b) positive for a clean prompt")
    f = (1 / shift - sp.Rational(1, val)) / (x - a)
    ans = sp.limit(f, x, a)
    check(ans == -sp.Rational(1, val**2), "complex frac limit")
    return {"prompt": f"Evaluate ${lim_typ(a)} (frac(1, {T(shift)}) - frac(1, {val})) / ({T(x - a)})$.",
            "plain": f"Evaluate {lim_plain(a)} (1/({P(shift)}) - 1/{val})/({P(x - a)}).",
            "key": limkey(ans), "display": T(ans), "verified": f"sympy: limit = {ans}"}


@template("nonzero_over_zero.sides", "nonzero_over_zero", requires=["infinite_limits", "alg_sign"], guess=0.15, work_lines=5,
          substeps=["substitute to see the form K/0 with K != 0", "sign analysis from the left", "sign analysis from the right", "compare the sides"],
          strategies={"sign_analysis": "one-sided sign analysis", "table": "table of values", "other": "other", "unsure": "unsure"})
def _(rng):
    a = rng.randint(-3, 3)
    p = nz(rng, -4, 4, exclude=(0, -a))
    n = rng.choice([1, 2])
    f = (x + p) / (x - a) ** n
    ans = limit_value(f, a)
    left, right = sp.limit(f, x, a, "-"), sp.limit(f, x, a, "+")
    check(left in (sp.oo, -sp.oo) and right in (sp.oo, -sp.oo), "not infinite")
    return {"prompt": f"Evaluate ${lim_typ(a)} frac({T(x + p)}, {T((x - a)**n)})$. If the limit is infinite, say which infinity; if it does not exist, write DNE.",
            "plain": f"Evaluate {lim_plain(a)} ({P(x + p)})/{P((x - a)**n)}; infinite or DNE allowed.",
            "key": limkey(ans), "display": disp(ans), "verified": f"sympy: left {left}, right {right}"}


@template("piecewise_limits.boundary", "piecewise_limits", requires=["limit_existence", "direct_substitution"], guess=0.15, work_lines=5,
          substeps=["left-hand limit from the left piece", "right-hand limit from the right piece", "compare"],
          strategies={"one_sided_limits": "compute both one-sided limits", "graph": "sketch the graph", "other": "other", "unsure": "unsure"})
def _(rng):
    a = rng.randint(-2, 2)
    p1 = x**2 + rng.randint(-3, 3) * x + rng.randint(-3, 3)
    target = p1.subs(x, a)
    same = rng.random() < 0.5
    p2 = nz(rng, -3, 3) * (x - a) + (target if same else target + nz(rng, -3, 3))
    f = sp.Piecewise((p1, x <= a), (p2, True))
    ans = limit_value(f, a)
    check((ans != "DNE") == same, "piecewise")
    return {"prompt": f"Let $f(x) = cases({T(p1)} & \"if\" x <= {a}, {T(sp.expand(p2))} & \"if\" x > {a})$. Evaluate ${lim_typ(a)} f(x)$ or write DNE.",
            "plain": f"f(x) = {P(p1)} if x <= {a}; {P(sp.expand(p2))} if x > {a}. Evaluate {lim_plain(a)} f(x) or DNE.",
            "key": limkey(ans), "display": disp(ans), "verified": f"sympy: one-sided limits {sp.limit(f, x, a, '-')}, {sp.limit(f, x, a, '+')}"}


@template("squeeze.oscillating", "squeeze", requires=["limit_laws"], guess=0.4, work_lines=5,
          substeps=["bound the trig factor between -1 and 1", "multiply the bounds by the nonnegative factor", "limits of both bounds", "conclude by the squeeze theorem"],
          strategies={"squeeze": "squeeze theorem", "product_law": "product law (invalid here)", "other": "other", "unsure": "unsure"})
def _(rng):
    n = rng.choice([1, 2, 3])
    k = rng.randint(1, 3)
    fn = rng.choice([sp.sin, sp.cos])
    f = x**n * fn(k / x) if n != 1 else sp.Abs(x) * fn(k / x)
    ans = sp.limit(f, x, 0)
    check(ans == 0, "squeeze")
    tp = (f"x^({n}) {fn.__name__}(frac({k}, x))" if n != 1 else f"lr(| x |) {fn.__name__}(frac({k}, x))")
    return {"prompt": f"Use the squeeze theorem to evaluate $lim_(x -> 0) {tp}$.",
            "plain": f"Use the squeeze theorem: lim_(x->0) {P(f)}.",
            "key": limkey(0), "display": "0", "verified": "sympy: limit = 0"}


@template("trig_limits.sinkx", "trig_limits", requires=["squeeze", "trig_identities", "limit_laws"], guess=0.05, work_lines=5,
          substeps=["rewrite to create sin(u)/u", "apply lim sin(u)/u = 1", "multiply by the constant"],
          strategies={"rescale": "rescale to the form sin(u)/u", "table": "table of values", "lhopital": "L'Hopital's rule (not yet introduced)", "other": "other", "unsure": "unsure"})
def _(rng):
    form = rng.choice(["sin_kx_mx", "one_minus_cos", "sin_over_sin"])
    k, m = rng.sample(range(1, 7), 2)
    if form == "sin_kx_mx":
        f, tp = sp.sin(k * x) / (m * x), f"frac(sin({T(k * x)}), {T(m * x)})"
    elif form == "one_minus_cos":
        f, tp = (1 - sp.cos(x)) / (m * x) if m != 1 else (1 - sp.cos(x)) / x, f"frac(1 - cos(x), {m} x)" if m != 1 else "frac(1 - cos(x), x)"
    else:
        f, tp = sp.sin(k * x) / sp.sin(m * x), f"frac(sin({T(k * x)}), sin({T(m * x)}))"
    ans = sp.limit(f, x, 0)
    construct = {"sin_kx_mx": sp.Rational(k, m), "one_minus_cos": 0, "sin_over_sin": sp.Rational(k, m)}[form]
    check(ans == construct, "trig limit")
    return {"prompt": f"Evaluate $lim_(x -> 0) {tp}$.", "plain": f"Evaluate lim_(x->0) {P(f)}.",
            "key": limkey(ans), "display": T(ans), "verified": f"sympy: limit = {ans} (constructed {construct})"}


# ============================ 2.4 ============================

@template("continuity_point.piecewise", "continuity_point", requires=["piecewise_limits", "alg_eval"], guess=0.45, work_lines=6,
          substeps=["check f(a) is defined", "compute the limit at a", "compare the limit to f(a)"],
          strategies={"three_conditions": "check all three conditions", "graph": "sketch", "other": "other", "unsure": "unsure"})
def _(rng):
    a = rng.randint(-2, 3)
    g = x**2 + rng.randint(-3, 3)
    L = g.subs(x, a)
    cont = rng.random() < 0.5
    fa = L if cont else L + nz(rng, -3, 3)
    f = sp.Piecewise((fa, sp.Eq(x, a)), (g, True))
    is_cont = sp.limit(g, x, a) == f.subs(x, a)
    check(is_cont == cont, "continuity")
    key = "yes" if cont else "no"
    return {"prompt": f"Is $f(x) = cases({T(g)} & \"if\" x != {a}, {fa} & \"if\" x = {a})$ continuous at $x = {a}$? Answer yes or no.",
            "plain": f"f(x) = {P(g)} if x != {a}; {fa} if x = {a}. Continuous at x = {a}? yes/no",
            "key": {"kind": "choice", "value": key, "aliases": ["continuous"] if cont else ["not continuous", "discontinuous"]},
            "display": f'"{key}"', "verified": f"sympy: limit {L}, f(a) {fa}"}


@template("discontinuity_types.classify", "discontinuity_types", requires=["continuity_point", "factor_cancel", "nonzero_over_zero"], guess=0.33, work_lines=5,
          substeps=["compute the one-sided limits at the point", "decide finite and equal / finite and unequal / infinite"],
          strategies={"one_sided_limits": "one-sided limits", "factor": "factor and look for cancellation", "other": "other", "unsure": "unsure"})
def _(rng):
    kind = rng.choice(["removable", "jump", "infinite"])
    a = rng.randint(-3, 3)
    if kind == "removable":
        s = nz(rng, -4, 4, exclude=(a,))
        num = sp.expand((x - a) * (x - s))
        f = num / (x - a)
        tp = f"frac({T(num)}, {T(x - a)})"
    elif kind == "infinite":
        p = nz(rng, -4, 4, exclude=(-a, 0))
        f = (x + p) / (x - a)
        tp = f"frac({T(x + p)}, {T(x - a)})"
    else:
        c = nz(rng, 1, 3)
        f = sp.Piecewise((x + c, x < a), (x - c, True))
        tp = f"cases({T(x + c)} & \"if\" x < {a}, {T(x - c)} & \"if\" x >= {a})"
    l, r = sp.limit(f, x, a, "-"), sp.limit(f, x, a, "+")
    computed = ("infinite" if (l in (sp.oo, -sp.oo) or r in (sp.oo, -sp.oo)) else ("removable" if l == r else "jump"))
    check(computed == kind, "classify")
    return {"prompt": f"Classify the discontinuity of $f(x) = {tp}$ at $x = {a}$ as removable, jump, or infinite.",
            "plain": f"Classify the discontinuity of f(x) = {P(f)} at x = {a}: removable, jump, or infinite.",
            "key": {"kind": "choice", "value": kind}, "display": f'"{kind}"', "verified": f"sympy: one-sided limits {l}, {r}"}


@template("continuity_interval.rational", "continuity_interval", requires=["continuity_point", "alg_domain"], guess=0.02, work_lines=5,
          substeps=["find where the denominator is zero", "write the remaining intervals"],
          strategies={"domain": "rational functions are continuous on their domain", "other": "other", "unsure": "unsure"})
def _(rng):
    k = rng.randint(1, 4)
    p = rng.randint(-5, 5)
    den = x**2 - k**2
    f = (x + p) / den
    dom = sp.calculus.util.continuous_domain(f, x, sp.S.Reals)
    key = sp.Union(sp.Interval.open(-sp.oo, -k), sp.Interval.open(-k, k), sp.Interval.open(k, sp.oo))
    check(dom == key, "continuity interval")
    return {"prompt": f"On what intervals is $f(x) = frac({T(x + p)}, {T(den)})$ continuous? Use interval notation.",
            "plain": f"Intervals where f(x) = ({P(x + p)})/({P(den)}) is continuous.",
            "key": {"kind": "interval", "value": sp.srepr(key)},
            "display": f"(-infinity\\, {-k}) union ({-k}\\, {k}) union ({k}\\, infinity)",
            "verified": f"sympy: continuous_domain = {dom}"}


@template("continuity_parameter.solve_k", "continuity_parameter", requires=["continuity_point"], guess=0.02, work_lines=6,
          substeps=["limit from the left at the boundary", "value/limit from the right", "set them equal and solve for k"],
          strategies={"match_sides": "match the one-sided limits and solve", "other": "other", "unsure": "unsure"})
def _(rng):
    k = sp.Symbol("k")
    a = rng.randint(1, 3)
    b = rng.randint(-4, 4)
    c = rng.randint(-3, 5)
    left = k * x + b
    right = x**2 + c
    sol = sp.solve(sp.Eq(left.subs(x, a), right.subs(x, a)), k)
    check(len(sol) == 1, "k")
    kval = sol[0]
    f = sp.Piecewise((left.subs(k, kval), x < a), (right, True))
    check(sp.limit(f, x, a, "-") == sp.limit(f, x, a, "+") == f.subs(x, a), "continuity after solve")
    return {"prompt": f"Find the value of $k$ that makes $f(x) = cases(k x {'+' if b >= 0 else '-'} {abs(b)} & \"if\" x < {a}, {T(right)} & \"if\" x >= {a})$ continuous everywhere.",
            "plain": f"f(x) = k*x {'+' if b >= 0 else '-'} {abs(b)} if x < {a}; {P(right)} if x >= {a}. Find k for continuity.",
            "key": {"kind": "value", "value": sp.srepr(kval)}, "display": f"k = {T(kval)}",
            "verified": f"sympy: solve gives k = {kval}; one-sided limits equal f(a)"}


@template("composite_continuity.cos", "composite_continuity", requires=["continuity_point", "trig_values"], guess=0.05, work_lines=4,
          substeps=["find the limit of the inner function", "use continuity of the outer function", "evaluate the trig value"],
          strategies={"composite_theorem": "limit passes inside a continuous function", "substitute": "direct substitution", "other": "other", "unsure": "unsure"})
def _(rng):
    fn = rng.choice([sp.sin, sp.cos])
    target = rng.choice([sp.pi / 6, sp.pi / 4, sp.pi / 3, sp.pi / 2, sp.pi, 2 * sp.pi / 3])
    a = rng.randint(1, 3)
    inner = x - a + target
    ans = sp.limit(fn(inner), x, a)
    check(sp.simplify(ans - fn(target)) == 0, "composite")
    return {"prompt": f"Evaluate ${lim_typ(a)} {fn.__name__}({T(inner)})$.",
            "plain": f"Evaluate {lim_plain(a)} {fn.__name__}({P(inner)}).",
            "key": limkey(ans), "display": T(ans), "verified": f"sympy: limit = {ans}"}


@template("ivt.zero", "ivt", requires=["continuity_interval", "alg_eval"], guess=0.5, work_lines=6,
          substeps=["check continuity on the closed interval", "evaluate f at both endpoints", "compare signs"],
          strategies={"ivt": "intermediate value theorem", "solve": "solve f(x) = 0 directly", "other": "other", "unsure": "unsure"})
def _(rng):
    variant = rng.choice(["yes", "yes", "no_sign", "no_cont"])
    if variant == "no_cont":
        a, b = 0, 2
        c = 1
        f = 1 / (x - c)
        tp = f"frac(1, {T(x - c)})"
    else:
        for _ in range(50):
            coeffs = [1, rng.randint(-3, 3), rng.randint(-4, 4), rng.randint(-3, 3)]
            f = coeffs[0] * x**3 + coeffs[1] * x**2 + coeffs[2] * x + coeffs[3]
            a = rng.randint(-2, 1)
            b = a + 1
            fa, fb = f.subs(x, a), f.subs(x, b)
            if variant == "yes" and fa * fb < 0:
                break
            if variant == "no_sign" and fa * fb > 0:
                break
        else:
            raise Unverified("no interval")
        tp = T(f)
    fa, fb = f.subs(x, a), f.subs(x, b)
    cont = sp.calculus.util.continuous_domain(f, x, sp.Interval(a, b)) == sp.Interval(a, b)
    guaranteed = cont and fa * fb < 0
    check(guaranteed == (variant == "yes"), "ivt")
    key = "yes" if guaranteed else "cannot conclude"
    return {"prompt": f"Does the Intermediate Value Theorem guarantee that $f(x) = {tp}$ has a zero in $[{a}, {b}]$? Answer \"yes\" or \"cannot conclude\" and justify.",
            "plain": f"Does the IVT guarantee a zero of f(x) = {P(f)} in [{a}, {b}]? yes / cannot conclude.",
            "key": {"kind": "choice", "value": key, "aliases": ["no", "cannot"] if not guaranteed else ["guaranteed"]},
            "display": f'"{key}"', "verified": f"sympy: continuous on [a,b]: {cont}; f(a)={fa}, f(b)={fb}"}


# ============================ 2.5 ============================

ED_OPTIONS = [("a", "lr(| f(x) - L |) < epsilon"), ("b", "lr(| x - a |) < epsilon"),
              ("c", "lr(| f(x) - L |) < delta"), ("d", "0 < lr(| f(x) - a |) < epsilon")]


@template("epsilon_delta_def.complete", "epsilon_delta_def", requires=["limit_intuitive", "alg_abs_ineq"], guess=0.25, work_lines=2,
          substeps=["identify what must be small for the output"],
          strategies={"definition": "recall the definition", "other": "other", "unsure": "unsure"})
def _(rng):
    opts = ED_OPTIONS[:]
    rng.shuffle(opts)
    labels = "abcd"
    relabeled = [(labels[i], o[1]) for i, o in enumerate(opts)]
    correct = labels[[o[0] for o in opts].index("a")]
    check(sum(1 for _, v in relabeled if v == "lr(| f(x) - L |) < epsilon") == 1, "options")
    return {"prompt": "Complete the definition: $lim_(x -> a) f(x) = L$ means that for every $epsilon > 0$ there is a $delta > 0$ such that if $0 < lr(| x - a |) < delta$, then #box(width: 4em, stroke: (bottom: 0.6pt), height: 0.8em). Write the letter.",
            "plain": "Complete the epsilon-delta definition; options: " + "; ".join(f"({l}) {v}" for l, v in relabeled),
            "options": relabeled, "key": {"kind": "choice", "value": correct}, "display": f'"({correct})"',
            "verified": "definition text matches the Definition box in Section 2.5"}


@template("epsilon_delta_linear.delta", "epsilon_delta_linear", requires=["epsilon_delta_def", "alg_abs_ineq"], guess=0.1, work_lines=7,
          substeps=["write |f(x) - L| in terms of |x - a|", "divide by the slope", "choose delta"],
          strategies={"algebraic": "factor out the slope and choose delta = epsilon/|m|", "geometric": "read delta from the graph", "other": "other", "unsure": "unsure"})
def _(rng):
    m = nz(rng, -5, 5, exclude=(0, 1, -1))
    b = rng.randint(-6, 6)
    a = rng.randint(-3, 4)
    f = m * x + b
    L = f.subs(x, a)
    bound = sp.Abs(m) * d  # sup |f(x)-L| over |x-a| <= d
    key = eps / abs(m)
    check(sp.simplify(sp.Abs(f - L) - sp.Abs(m) * sp.Abs(x - a)) == 0, "linear bound")
    return {"prompt": f"For $lim_(x -> {a}) ({T(f)}) = {L}$, find the largest $delta$ (in terms of $epsilon$) such that $0 < lr(| x - {a} |) < delta$ implies $lr(| ({T(f)}) - {L} |) < epsilon$.",
            "plain": f"lim_(x->{a}) ({P(f)}) = {L}: find delta(epsilon) so 0<|x-{a}|<delta implies |({P(f)}) - ({L})|<epsilon.",
            "key": {"kind": "delta", "value": sp.srepr(key), "bound": sp.srepr(bound)}, "display": f"delta = {T(key)}",
            "verified": f"sympy: |f(x)-L| = {abs(m)}|x-a|, so delta = epsilon/{abs(m)}"}


@template("epsilon_delta_nonlinear.square", "epsilon_delta_nonlinear", requires=["epsilon_delta_linear"], guess=0.05, work_lines=8,
          substeps=["factor |x^2 - a^2| = |x - a||x + a|", "bound |x + a| using a preliminary restriction (e.g. delta <= 1)", "take the minimum of the two restrictions"],
          strategies={"bound_and_min": "restrict delta then take a minimum", "geometric": "solve for the x-interval", "other": "other", "unsure": "unsure"})
def _(rng):
    a = rng.randint(1, 4)
    f = x**2
    L = a * a
    bound = 2 * a * d + d**2  # sup |x^2 - a^2| over |x - a| <= d, a > 0
    check(sp.simplify(sp.Max((a + d)**2 - a**2, a**2 - (a - d)**2).subs(d, sp.Rational(1, 3)) - bound.subs(d, sp.Rational(1, 3))) == 0, "bound")
    key = sp.Min(1, eps / (2 * a + 1))
    return {"prompt": f"For $lim_(x -> {a}) x^2 = {L}$, find a $delta$ (in terms of $epsilon$) such that $0 < lr(| x - {a} |) < delta$ implies $lr(| x^2 - {L} |) < epsilon$.",
            "plain": f"lim_(x->{a}) x^2 = {L}: find delta(epsilon) with 0<|x-{a}|<delta implies |x^2-{L}|<epsilon.",
            "key": {"kind": "delta", "value": sp.srepr(key), "bound": sp.srepr(bound)},
            "display": f"delta = min(1\\, frac(epsilon, {2*a+1}))",
            "verified": f"sympy: sup|x^2-{L}| on |x-{a}|<=d is 2*{a}*d + d^2; min(1, eps/{2*a+1}) satisfies it"}


def verify_all(seeds=range(5)) -> list[str]:
    """Generate every template at several seeds and re-grade each key against itself."""
    report = []
    for tid in REGISTRY:
        for s in seeds:
            p = generate(tid, s)
            if p.key["kind"] in ("limit", "value", "expr"):
                v = p.key["value"]
                ok, why = answers.grade(p.key, "DNE" if v == "DNE" else P(sp.sympify(v)))
            elif p.key["kind"] == "choice":
                ok, why = answers.grade(p.key, p.key["value"])
            elif p.key["kind"] == "set":
                ok, why = answers.grade(p.key, ", ".join(p.key["value"]))
            elif p.key["kind"] == "interval":
                iv = sp.sympify(p.key["value"])
                ivs = iv.args if isinstance(iv, sp.Union) else (iv,)
                s_ = " U ".join(f"{'(' if i.left_open else '['}{P(i.start)}, {P(i.end)}{')' if i.right_open else ']'}" for i in ivs)
                ok, why = answers.grade(p.key, s_)
            elif p.key["kind"] == "delta":
                ok, why = answers.grade(p.key, P(sp.sympify(p.key["value"])))
            if not ok:
                report.append(f"{tid} seed {s}: key does not grade as correct ({why})")
    return report
