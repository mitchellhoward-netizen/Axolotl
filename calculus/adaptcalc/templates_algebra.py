"""Algebra 1 templates (course `algebra1`, Elementary Algebra 2e). Every answer is verified with SymPy.

Same contract as templates.py: each generator builds a problem constructively, SymPy
recomputes the answer independently, and a problem is only emitted when they agree.
`solution` (optional) is a worked solution, one Typst math line per step: the answer
key prints it, and a faded (partly worked) version of it is how a new skill's first
practice problem is set.

Money in Typst text is written \\$; math is always inside $...$ (never bare < or * in text).
"""
from __future__ import annotations

import sympy as sp

from .symtyp import plain as P
from .symtyp import typ as T
from .templates import check, nz, template

x, y, a, b, n, m, w, r, t, u, v, z = sp.symbols("x y a b n m w r t u v z")
OU = {"other": "other", "unsure": "unsure"}


def V(val, form=None):
    val = sp.sympify(val)
    k = {"kind": "value", "value": sp.srepr(sp.nsimplify(val) if val.has(sp.Float) else val)}
    if form:
        k["form"] = form
    return k


def E(expr, form=None):
    k = {"kind": "expr", "value": sp.srepr(sp.sympify(expr))}
    if form:
        k["form"] = form
    return k


def eqt(l, r_):
    return f"{T(l)} = {T(r_)}"


def eqp(l, r_):
    return f"{P(l)} = {P(r_)}"


def money(v) -> str:
    v = sp.nsimplify(v)
    s = f"{float(v):,.2f}" if v != int(v) else f"{int(v):,}"
    return "\\$" + s


def money_p(v) -> str:
    return money(v).replace("\\", "")


def lin(mv, bv, var=x):
    """Typst for m x + b with a fraction slope written as a coefficient (-2/3 x, not -(2x)/3)."""
    mv, bv = sp.nsimplify(mv), sp.nsimplify(bv)
    if mv == 0:
        return T(bv)
    if mv == 1:
        head = T(var)
    elif mv == -1:
        head = f"-{T(var)}"
    elif mv.is_Integer:
        head = f"{mv} {T(var)}"
    else:
        head = f"{'-' if mv < 0 else ''}frac({abs(mv.p)}, {mv.q}) {T(var)}"
    if bv == 0:
        return head
    return f"{head} {'+' if bv > 0 else '-'} {T(abs(bv))}"


def lin_p(mv, bv, var="x"):
    mv, bv = sp.nsimplify(mv), sp.nsimplify(bv)
    head = "" if mv == 0 else (var if mv == 1 else f"-{var}" if mv == -1 else f"({mv}){var}" if not mv.is_Integer else f"{mv}{var}")
    if bv == 0:
        return head or "0"
    if not head:
        return str(bv)
    return f"{head} {'+' if bv > 0 else '-'} {abs(bv)}"


def signed(c) -> str:
    """ + 3 / - 3 for building expressions."""
    return f"+ {c}" if c >= 0 else f"- {-c}"


def sol_eqs(*eqs, var=x) -> list[str]:
    """Worked solution lines for an equation: every line must have the same solution set as the
    first (SymPy), so a faded solution never shows a false step."""
    want = sp.solveset(eqs[0].lhs - eqs[0].rhs, var, sp.S.Reals)
    out = []
    for e in eqs:
        got = sp.solveset(e.lhs - e.rhs, var, sp.S.Reals)
        check(got == want, f"step {e} changes the solutions")
        out.append(eqt(e.lhs, e.rhs))
    return out


def dedupe(lines: list[str]) -> list[str]:
    """Drop a step that repeats the line before it (e.g. when a coefficient is 1)."""
    out = []
    for ln in lines:
        if not out or out[-1].replace("= ", "", 1) != ln.replace("= ", "", 1):
            out.append(ln)
    return out


def signed_terms(e) -> str:
    """'+ 5 x^(2) - 7 x - 6': the terms of e, each with its sign written out."""
    out = []
    for term in sp.Add.make_args(sp.expand(e)):
        neg = term.could_extract_minus_sign()
        out.append(f"{'-' if neg else '+'} {T(-term if neg else term)}")
    return " ".join(out)


def UE(*args):
    """Unevaluated product/sum for showing a step as written."""
    return args


def interval_t(iv) -> str:
    """Interval notation in Typst: (3, infinity), [-2, 5)."""
    lo = "-infinity" if iv.start == -sp.oo else T(iv.start)
    hi = "infinity" if iv.end == sp.oo else T(iv.end)
    return f"{'(' if iv.left_open else '['}{lo}, {hi}{')' if iv.right_open else ']'}"


def interval_key(sol_set):
    return {"kind": "ineq", "value": sp.srepr(sol_set), "var": "x"}


# ============================================================ Chapter 1: foundations

@template("f_primes_lcm.lcm", "f_primes_lcm", guess=0.02, work_lines=4,
          substeps=["write the prime factorization of each number", "take each prime the greatest number of times it appears"],
          strategies={"prime_factors": "prime factorizations", "list_multiples": "list multiples", **OU})
def _(rng):
    base = rng.choice([2, 3, 4, 5, 6])
    p, q = rng.sample([2, 3, 4, 5, 6, 7, 9], 2)
    A, B = base * p, base * q
    check(A != B, "distinct")
    val = sp.ilcm(A, B)
    check(val == A * B // sp.igcd(A, B) and val < A * B, "lcm smaller than the product")
    return {"prompt": f"Find the least common multiple of ${A}$ and ${B}$.", "plain": f"Find the least common multiple of {A} and {B}.",
            "key": V(val), "display": T(val), "verified": f"sympy: ilcm({A}, {B}) = {val}",
            "solution": [f"{A} = {' dot '.join(map(str, sp.factorint(A, multiple=True)))}",
                         f"{B} = {' dot '.join(map(str, sp.factorint(B, multiple=True)))}", f"\"LCM\" = {val}"]}


@template("f_primes_lcm.factor", "f_primes_lcm", guess=0.02, work_lines=4,
          substeps=["divide by the smallest prime repeatedly", "write the product of primes"],
          strategies={"factor_tree": "factor tree", "ladder": "repeated division", **OU})
def _(rng):
    ps = [rng.choice([2, 2, 3, 3, 5, 7]) for _ in range(rng.randint(3, 4))]
    N = 1
    for q in ps:
        N *= q
    check(40 <= N <= 700, "reasonable size")
    fac = sp.factorint(N)
    key = sp.Mul(*[sp.Pow(q, e, evaluate=False) for q, e in sorted(fac.items())], evaluate=False)
    check(sp.Integer(N) == sp.Mul(*[q ** e for q, e in fac.items()]), "factorization")
    disp = " dot ".join(f"{q}^{e}" if e > 1 else f"{q}" for q, e in sorted(fac.items()))
    return {"prompt": f"Write the prime factorization of ${N}$. Use exponents for repeated factors.",
            "plain": f"Write the prime factorization of {N}.",
            "key": {"kind": "value", "value": sp.srepr(sp.Integer(N)), "form": "prime_factorization"},
            "display": disp, "verified": f"sympy: factorint({N}) = {fac}"}


@template("f_order_ops.simplify", "f_order_ops", guess=0.03, work_lines=4,
          substeps=["parentheses and exponents first", "multiply and divide left to right", "add and subtract left to right"],
          strategies={"order_of_operations": "parentheses, exponents, multiply/divide, add/subtract", **OU})
def _(rng):
    a_, b_, c_, d_ = rng.randint(2, 9), rng.randint(2, 6), rng.randint(1, 5), rng.choice([2, 3])
    form = rng.choice(["a", "b", "c"])
    if form == "a":
        tp, pl = f"{a_} + {b_} ({c_} + {d_})^2", f"{a_} + {b_}*({c_} + {d_})^2"
    elif form == "b":
        k = rng.randint(2, 5)
        tp, pl = f"{k * b_ * d_} div {b_} dot {d_} - {c_}", f"{k * b_ * d_} / {b_} * {d_} - {c_}"
    else:
        tp, pl = f"{a_}^2 - {b_} dot {c_} + {d_}", f"{a_}^2 - {b_}*{c_} + {d_}"
    val = sp.sympify(pl.replace("^", "**"))
    check(val.is_Integer, "integer result")
    return {"prompt": f"Simplify: ${tp}$.", "plain": f"Simplify: {pl}.", "key": V(val), "display": T(val),
            "verified": f"sympy: {pl} = {val}"}


@template("f_order_ops.evaluate", "f_order_ops", guess=0.03, work_lines=3,
          substeps=["substitute the value for the variable", "simplify with the order of operations"],
          strategies={"substitute": "substitute, then order of operations", **OU})
def _(rng):
    k = rng.randint(2, 6)
    c1, c2 = rng.randint(2, 5), rng.randint(1, 9)
    e = c1 * x**2 + c2
    val = e.subs(x, k)
    return {"prompt": f"Evaluate ${T(e)}$ when $x = {k}$.", "plain": f"Evaluate {P(e)} when x = {k}.",
            "key": V(val), "display": T(val), "verified": f"sympy: subs x={k} -> {val}"}


@template("f_like_terms.combine", "f_like_terms", requires=["f_order_ops"], guess=0.02, work_lines=3,
          substeps=["group the like terms", "add the coefficients of like terms"],
          strategies={"group": "group like terms and add coefficients", **OU})
def _(rng):
    c = [nz(rng, -9, 9) for _ in range(4)]
    k1, k2 = rng.randint(1, 9), nz(rng, -9, 9)
    e_t = f"{c[0]} x^2 {signed(c[1])} x {signed(k1)} {signed(c[2])} x^2 {signed(c[3])} x {signed(k2)}"
    e = c[0] * x**2 + c[1] * x + k1 + c[2] * x**2 + c[3] * x + k2
    check(c[0] + c[2] != 0 and c[1] + c[3] != 0, "no cancellation")
    return {"prompt": f"Simplify by combining like terms: ${e_t}$.",
            "plain": f"Simplify by combining like terms: {e_t.replace(' x', 'x')}.",
            "key": E(sp.expand(e), "polynomial"), "display": T(sp.expand(e)), "verified": f"sympy: expand = {sp.expand(e)}"}


@template("f_translate.phrase", "f_translate", requires=["f_order_ops"], guess=0.05, work_lines=2,
          substeps=["identify the operation words", "keep the order the words require"],
          strategies={"translate": "translate word by word", **OU})
def _(rng):
    k = rng.randint(2, 12)
    c = rng.randint(2, 9)
    form = rng.choice(["less", "product_sum", "diff_twice"])
    if form == "less":
        words, e = f"{k} less than the product of {c} and $x$", c * x - k
    elif form == "product_sum":
        words, e = f"the product of {c} and the sum of $x$ and {k}", c * (x + k)
    else:
        words, e = f"{k} more than twice the difference of $x$ and {c}", 2 * (x - c) + k
    return {"prompt": f"Translate to an algebraic expression: {words}. (You do not need to simplify.)",
            "plain": f"Translate to an algebraic expression: {words.replace('$', '')}.",
            "key": E(e), "display": T(e), "verified": f"expression {e}"}


@template("f_int_add.add_sub", "f_int_add", requires=["f_order_ops"], guess=0.03, work_lines=3,
          substeps=["subtracting a number is adding its opposite", "add numbers with different signs by subtracting absolute values"],
          strategies={"opposite": "add the opposite", "number_line": "number line", **OU})
def _(rng):
    p_, q_, s_ = nz(rng, -25, 25), nz(rng, -25, -1), nz(rng, -15, 15)
    tp = f"{p_} - ({q_}) + ({s_})"
    val = p_ - q_ + s_
    return {"prompt": f"Simplify: ${tp}$.", "plain": f"Simplify: {tp}.", "key": V(val), "display": T(val),
            "verified": f"sympy: {tp} = {val}"}


@template("f_int_add.abs", "f_int_add", requires=["f_order_ops"], guess=0.03, work_lines=3,
          substeps=["simplify inside the absolute value bars first", "take the absolute value"],
          strategies={"inside_first": "simplify inside first", **OU})
def _(rng):
    p_, q_, s_ = rng.randint(2, 9), rng.randint(10, 20), rng.randint(1, 6)
    tp = f"{s_} - lr(| {p_} - {q_} |)"
    val = s_ - abs(p_ - q_)
    return {"prompt": f"Simplify: ${tp}$.", "plain": f"Simplify: {s_} - |{p_} - {q_}|.", "key": V(val),
            "display": T(val), "verified": f"sympy: {s_} - Abs({p_}-{q_}) = {val}"}


@template("f_int_mul.simplify", "f_int_mul", requires=["f_int_add"], guess=0.03, work_lines=3,
          substeps=["multiply and divide first", "use the sign rules for products and quotients"],
          strategies={"sign_rules": "sign rules, then order of operations", **OU})
def _(rng):
    p_, q_ = nz(rng, -9, -2), nz(rng, -8, -2)
    d_ = nz(rng, -6, -2)
    k = rng.randint(2, 6)
    tp = f"({p_}) ({q_}) + {d_ * k} div ({d_})"
    val = p_ * q_ + k
    check(sp.Integer(p_ * q_) + sp.Rational(d_ * k, d_) == val, "arith")
    return {"prompt": f"Simplify: ${tp}$.", "plain": f"Simplify: ({p_})({q_}) + {d_ * k}/({d_}).", "key": V(val),
            "display": T(val), "verified": f"sympy = {val}"}


@template("f_int_eval.negative", "f_int_eval", requires=["f_int_mul"], guess=0.03, work_lines=3,
          substeps=["substitute the negative value in parentheses", "square before multiplying"],
          strategies={"substitute_parens": "substitute with parentheses", **OU})
def _(rng):
    k = rng.randint(-6, -2)
    c1, c2, c3 = nz(rng, -4, 4), nz(rng, -6, 6), rng.randint(-9, 9)
    e = c1 * x**2 + c2 * x + c3
    val = e.subs(x, k)
    return {"prompt": f"Evaluate ${T(e)}$ when $x = {k}$.", "plain": f"Evaluate {P(e)} when x = {k}.",
            "key": V(val), "display": T(val), "verified": f"sympy: subs x={k} -> {val}",
            "solution": [f"{T(e).replace('x', f'({k})')}", f"= {T(val)}"]}


@template("f_frac_mul.multiply_divide", "f_frac_mul", requires=["f_primes_lcm", "f_int_mul"], guess=0.02, work_lines=4,
          substeps=["to divide, multiply by the reciprocal of the second fraction", "multiply numerators and denominators", "simplify"],
          strategies={"reciprocal": "multiply by the reciprocal", **OU})
def _(rng):
    a_, b_ = rng.randint(1, 9), rng.randint(2, 12)
    c_, d_ = rng.randint(1, 9), rng.randint(2, 12)
    check(sp.gcd(a_, b_) == 1 and sp.gcd(c_, d_) == 1 and a_ != b_ and c_ != d_, "lowest terms")
    op = rng.choice(["mul", "div"])
    neg = rng.choice([True, False])
    A = sp.Rational(-a_ if neg else a_, b_)
    val = A * sp.Rational(c_, d_) if op == "mul" else A / sp.Rational(c_, d_)
    check(val.q != 1 or abs(val) > 1, "not trivial")
    sym = "dot" if op == "mul" else "div"
    return {"prompt": f"{'Multiply' if op == 'mul' else 'Divide'} and simplify: ${T(A)} {sym} frac({c_}, {d_})$.",
            "plain": f"{'Multiply' if op == 'mul' else 'Divide'} and simplify: {A} {'*' if op == 'mul' else '/'} {c_}/{d_}.",
            "key": V(val, "lowest_terms"), "display": T(val), "verified": f"sympy: = {val}"}


@template("f_frac_mul.simplify", "f_frac_mul", requires=["f_primes_lcm"], guess=0.02, work_lines=3,
          substeps=["factor numerator and denominator", "remove the common factors"],
          strategies={"gcf": "divide by the greatest common factor", "repeated": "divide repeatedly", **OU})
def _(rng):
    p_, q_ = rng.randint(1, 9), rng.randint(2, 11)
    check(sp.gcd(p_, q_) == 1 and p_ != q_, "reduced target")
    g = rng.choice([4, 6, 8, 9, 12, 15])
    val = sp.Rational(p_, q_)
    return {"prompt": f"Simplify: $frac({p_ * g}, {q_ * g})$.", "plain": f"Simplify: {p_ * g}/{q_ * g}.",
            "key": V(val, "lowest_terms"), "display": T(val), "verified": f"sympy: {p_ * g}/{q_ * g} = {val}"}


@template("f_frac_add.unlike", "f_frac_add", requires=["f_frac_mul"], guess=0.02, work_lines=5,
          substeps=["find the least common denominator", "rewrite each fraction over the LCD", "add or subtract the numerators and simplify"],
          strategies={"lcd": "least common denominator", "cross_multiply": "multiply denominators together", **OU})
def _(rng):
    b_, d_ = rng.sample([3, 4, 5, 6, 8, 9, 10, 12, 15], 2)
    a_, c_ = rng.randint(1, b_ - 1), rng.randint(1, d_ - 1)
    check(sp.gcd(a_, b_) == 1 and sp.gcd(c_, d_) == 1, "lowest terms")
    op = rng.choice(["+", "-"])
    val = sp.Rational(a_, b_) + (sp.Rational(c_, d_) if op == "+" else -sp.Rational(c_, d_))
    return {"prompt": f"{'Add' if op == '+' else 'Subtract'} and simplify: $frac({a_}, {b_}) {op} frac({c_}, {d_})$.",
            "plain": f"{'Add' if op == '+' else 'Subtract'}: {a_}/{b_} {op} {c_}/{d_}.",
            "key": V(val, "lowest_terms"), "display": T(val), "verified": f"sympy: = {val}",
            "solution": [f"\"LCD\" = {sp.ilcm(b_, d_)}",
                         f"frac({a_ * sp.ilcm(b_, d_) // b_}, {sp.ilcm(b_, d_)}) {op} frac({c_ * sp.ilcm(b_, d_) // d_}, {sp.ilcm(b_, d_)})",
                         f"= {T(val)}"]}


@template("f_frac_bar.complex", "f_frac_bar", requires=["f_frac_add"], guess=0.02, work_lines=5,
          substeps=["simplify the numerator and the denominator separately", "divide the numerator by the denominator"],
          strategies={"separately": "simplify top and bottom, then divide", "lcd": "multiply top and bottom by the LCD", **OU})
def _(rng):
    p_, q_ = rng.sample([2, 3, 4, 5, 6], 2)
    k = rng.randint(2, 5)
    num = sp.Rational(1, p_) + sp.Rational(1, q_)
    den = sp.Rational(k, p_ * q_) if rng.random() < 0.5 else sp.Rational(1, 1) - sp.Rational(1, p_)
    val = num / den
    if den == 1 - sp.Rational(1, p_):
        tp_den, pl_den = f"1 - frac(1, {p_})", f"1 - 1/{p_}"
    else:
        tp_den, pl_den = f"frac({den.p}, {den.q})", f"{den.p}/{den.q}"
    return {"prompt": f"Simplify: $frac(frac(1, {p_}) + frac(1, {q_}), {tp_den})$.",
            "plain": f"Simplify: (1/{p_} + 1/{q_}) / ({pl_den}).",
            "key": V(val, "lowest_terms"), "display": T(val), "verified": f"sympy: = {val}"}


@template("f_frac_bar.bar", "f_frac_bar", requires=["f_order_ops"], guess=0.03, work_lines=3,
          substeps=["simplify the whole numerator", "simplify the whole denominator", "divide"],
          strategies={"separately": "simplify top and bottom first", **OU})
def _(rng):
    a_, b_, c_ = rng.randint(2, 9), rng.randint(2, 9), rng.randint(2, 5)
    d_ = rng.randint(1, 4)
    num = a_ * b_ + c_ ** 2
    den = c_ + d_
    val = sp.Rational(num, den)
    check(val.q == 1, "whole-number answer")
    return {"prompt": f"Simplify: $frac({a_} dot {b_} + {c_}^2, {c_} + {d_})$.",
            "plain": f"Simplify: ({a_}*{b_} + {c_}^2)/({c_} + {d_}).", "key": V(val), "display": T(val),
            "verified": f"sympy: = {val}"}


@template("f_decimals.operate", "f_decimals", requires=["f_int_mul"], guess=0.02, work_lines=3,
          substeps=["line up the decimal points (add/subtract) or count decimal places (multiply)"],
          strategies={"align": "line up decimal points / count places", **OU})
def _(rng):
    form = rng.choice(["add", "mul", "div"])
    if form == "add":
        p_, q_ = sp.Rational(rng.randint(101, 999), 100), sp.Rational(rng.randint(11, 99), 10)
        val, tp = p_ - q_, f"{float(p_):.2f} - {float(q_):.1f}"
    elif form == "mul":
        p_, q_ = sp.Rational(rng.randint(11, 99), 10), sp.Rational(rng.randint(2, 9), 10)
        val, tp = p_ * q_, f"({float(p_):.1f}) ({float(q_):.1f})"
    else:
        q_ = sp.Rational(rng.choice([2, 4, 5, 8]), 10)
        ans = sp.Rational(rng.randint(12, 95), 10)
        p_ = ans * q_
        val, tp = ans, f"{float(p_):g} div {float(q_):g}"
    return {"prompt": f"Simplify: ${tp}$.", "plain": f"Simplify: {tp.replace('div', '/')}.",
            "key": V(val), "display": f"{float(val):g}", "verified": f"sympy exact: {val}"}


@template("f_percent.convert", "f_percent", requires=["f_decimals", "f_frac_mul"], guess=0.03, work_lines=2,
          substeps=["a percent is a ratio to 100"],
          strategies={"over_100": "write over 100", **OU})
def _(rng):
    form = rng.choice(["frac_to_pct", "pct_to_dec", "dec_to_pct"])
    if form == "frac_to_pct":
        q_ = rng.choice([4, 5, 8, 20, 25])
        p_ = rng.randint(1, q_ - 1)
        pct = sp.Rational(p_, q_) * 100
        return {"prompt": f"Write $frac({p_}, {q_})$ as a percent.", "plain": f"Write {p_}/{q_} as a percent.",
                "key": V(pct), "display": f"{float(pct):g} %", "verified": f"sympy: {p_}/{q_}*100 = {pct}"}
    if form == "pct_to_dec":
        pct = sp.Rational(rng.randint(1, 250), rng.choice([1, 10]))
        return {"prompt": f"Write ${float(pct):g} %$ as a decimal.", "plain": f"Write {float(pct):g}% as a decimal.",
                "key": V(pct / 100), "display": f"{float(pct / 100):g}", "verified": f"sympy: {pct}/100"}
    dec = sp.Rational(rng.randint(1, 180), 100)
    return {"prompt": f"Write ${float(dec):g}$ as a percent.", "plain": f"Write {float(dec):g} as a percent.",
            "key": V(dec * 100), "display": f"{float(dec * 100):g} %", "verified": f"sympy: {dec}*100"}


@template("f_sqrt.perfect", "f_sqrt", requires=["f_int_mul"], guess=0.03, work_lines=3,
          substeps=["take each square root", "then combine"],
          strategies={"known_squares": "recall perfect squares", **OU})
def _(rng):
    p_, q_ = rng.sample(range(2, 16), 2)
    form = rng.choice(["sum", "neg"])
    if form == "sum":
        tp, val = f"sqrt({p_ ** 2}) + sqrt({q_ ** 2})", p_ + q_
    else:
        tp, val = f"-sqrt({p_ ** 2}) - sqrt({q_ ** 2})", -p_ - q_
    check(sp.sympify(tp.replace("sqrt", "sqrt")) == val, "sqrt")
    return {"prompt": f"Simplify: ${tp}$.", "plain": f"Simplify: {tp}.", "key": V(val), "display": T(val),
            "verified": f"sympy: {tp} = {val}"}


@template("f_distributive.simplify", "f_distributive", requires=["f_int_mul", "f_like_terms"], guess=0.02, work_lines=3,
          substeps=["distribute to every term inside the parentheses", "combine like terms"],
          strategies={"distribute": "distribute, then combine", **OU})
def _(rng):
    c1, k1 = nz(rng, -6, 6), nz(rng, -9, 9)
    c2, k2 = nz(rng, -5, -1), nz(rng, -8, 8)
    e = c1 * (x + k1) + c2 * (2 * x - k2)
    tp = f"{c1} (x {signed(k1)}) - {abs(c2)} (2 x {signed(-k2)})"
    check(sp.expand(e) == sp.expand(sp.sympify(f"{c1}*(x + ({k1})) - {abs(c2)}*(2*x - ({k2}))")), "expr")
    return {"prompt": f"Simplify: ${tp}$.", "plain": f"Simplify: {c1}(x {signed(k1)}) - {abs(c2)}(2x {signed(-k2)}).",
            "key": E(sp.expand(e), "polynomial"), "display": T(sp.expand(e)), "verified": f"sympy: expand = {sp.expand(e)}"}


# ============================================================ Chapter 2: linear equations

def _solve_one(eq, var=x):
    sols = sp.solve(eq, var)
    check(len(sols) == 1, "one solution")
    return sols[0]


@template("lin_one_step.add", "lin_one_step", requires=["f_int_add"], guess=0.02, work_lines=3,
          substeps=["undo the addition or subtraction on both sides"],
          strategies={"inverse": "inverse operation on both sides", "guess_check": "guess and check", **OU})
def _(rng):
    sol, k = nz(rng, -20, 20), nz(rng, -15, 15)
    eq = sp.Eq(x + k, sol + k)
    check(_solve_one(eq) == sol, "solve")
    return {"prompt": f"Solve: ${eqt(x + k, sol + k)}$.", "plain": f"Solve: {eqp(x + k, sol + k)}.",
            "key": V(sol), "display": f"x = {sol}", "verified": f"sympy: solve = {sol}"}


@template("lin_one_step.multiply", "lin_one_step", requires=["f_int_mul", "f_frac_mul"], guess=0.02, work_lines=3,
          substeps=["divide (or multiply by the reciprocal) on both sides"],
          strategies={"inverse": "inverse operation on both sides", **OU})
def _(rng):
    form = rng.choice(["coef", "frac"])
    sol = nz(rng, -12, 12)
    if form == "coef":
        c = nz(rng, -9, 9, exclude=(0, 1))
        lhs, rhs = c * x, c * sol
        tp = eqt(lhs, rhs)
    else:
        p_, q_ = rng.choice([(2, 3), (3, 4), (2, 5), (3, 5), (5, 6)])
        sol = q_ * nz(rng, -5, 5)
        lhs, rhs = sp.Rational(p_, q_) * x, sp.Rational(p_, q_) * sol
        tp = f"frac({p_}, {q_}) x = {T(rhs)}"
    check(_solve_one(sp.Eq(lhs, rhs)) == sol, "solve")
    coef = lhs / x
    steps = sol_eqs(sp.Eq(lhs, rhs, evaluate=False), sp.Eq(x, rhs / coef, evaluate=False))
    steps = [tp, f"frac({T(lhs)}, {T(coef)}) = frac({T(rhs)}, {T(coef)})" if form == "coef" else f"{T(1 / coef)} dot {T(lhs)} = {T(1 / coef)} dot {T(rhs)}", steps[1]]
    return {"prompt": f"Solve: ${tp}$.", "plain": f"Solve: {P(lhs)} = {P(rhs)}.", "key": V(sol),
            "display": f"x = {sol}", "verified": f"sympy: solve = {sol}", "solution": steps}


@template("lin_both_sides.solve", "lin_both_sides", requires=["lin_one_step", "f_like_terms"], guess=0.02, work_lines=5,
          substeps=["collect the variable terms on one side", "collect the constants on the other side", "divide by the coefficient"],
          strategies={"isolate": "collect variables, then constants, then divide", "guess_check": "guess and check", **OU})
def _(rng):
    sol = rng.randint(-8, 8)
    a_, c_ = rng.sample([v_ for v_ in range(-7, 10) if v_ != 0], 2)
    b_ = rng.randint(-12, 12)
    d_ = a_ * sol + b_ - c_ * sol
    eq = sp.Eq(a_ * x + b_, c_ * x + d_)
    check(_solve_one(eq) == sol, "solve")
    return {"prompt": f"Solve: ${eqt(a_ * x + b_, c_ * x + d_)}$.", "plain": f"Solve: {eqp(a_ * x + b_, c_ * x + d_)}.",
            "key": V(sol), "display": f"x = {sol}", "verified": f"sympy: solve = {sol}",
            "solution": [eqt(a_ * x - c_ * x, d_ - b_), eqt((a_ - c_) * x, d_ - b_), f"x = {sol}"]}


@template("lin_general.parens", "lin_general", requires=["lin_both_sides", "f_distributive"], guess=0.02, work_lines=6,
          substeps=["distribute to clear parentheses", "combine like terms on each side", "collect variables and constants", "divide"],
          strategies={"general": "the general strategy", **OU})
def _(rng):
    sol = rng.randint(-6, 6)
    a_, k1 = nz(rng, 2, 6), nz(rng, -7, 7)
    c_ = nz(rng, -5, 5, exclude=(0, a_))
    k2 = rng.randint(-9, 9)
    rhs_const = a_ * (sol + k1) - c_ * sol - k2
    lhs = a_ * (x + k1)
    rhs = c_ * x + k2 + rhs_const
    tp = f"{a_} (x {signed(k1)}) = {T(c_ * x + k2 + rhs_const)}"
    check(_solve_one(sp.Eq(lhs, rhs)) == sol, "solve")
    rhs_c = sp.expand(rhs - c_ * x)  # the constant on the right
    lines = [tp, f"{T(sp.expand(lhs))} = {T(rhs)}", f"{T(a_ * x)} {signed_terms(-c_ * x)} = {T(rhs_c)} {signed_terms(-a_ * k1)}",
             f"{T((a_ - c_) * x)} = {T(rhs_c - a_ * k1)}", f"x = {sol}"]
    check(sp.solve(sp.Eq((a_ - c_) * x, rhs_c - a_ * k1), x) == [sol], "steps")
    lines = dedupe(lines)
    return {"prompt": f"Solve: ${tp}$.", "plain": f"Solve: {a_}(x {signed(k1)}) = {P(c_ * x + k2 + rhs_const)}.",
            "key": V(sol), "display": f"x = {sol}", "verified": f"sympy: solve = {sol}", "solution": lines}


@template("lin_general.classify", "lin_general", requires=["lin_both_sides", "f_distributive"], guess=0.34, work_lines=4,
          substeps=["simplify both sides", "decide from the final statement"],
          strategies={"simplify_compare": "simplify, then read the statement", **OU})
def _(rng):
    a_, k = nz(rng, 2, 6), nz(rng, -6, 6)
    kind = rng.choice(["identity", "contradiction", "conditional"])
    lhs = a_ * (x + k)
    if kind == "identity":
        rhs = a_ * x + a_ * k
    elif kind == "contradiction":
        rhs = a_ * x + a_ * k + nz(rng, -5, 5)
    else:
        rhs = (a_ + nz(rng, -3, 3)) * x + a_ * k
    diff = sp.expand(lhs - rhs)
    truth = "identity" if diff == 0 else ("contradiction" if not diff.free_symbols else "conditional")
    check(truth == kind, "classification")
    ans = {"identity": "identity", "contradiction": "contradiction", "conditional": "conditional"}[kind]
    return {"prompt": f"Classify the equation as a conditional equation, an identity, or a contradiction: "
                      f"${a_} (x {signed(k)}) = {T(rhs)}$.",
            "plain": f"Classify {a_}(x {signed(k)}) = {P(rhs)} as conditional, identity or contradiction.",
            "key": {"kind": "choice", "value": ans, "aliases": {
                "identity": ["all real numbers", "infinitely many", "identity all real numbers", "an identity"],
                "contradiction": ["no solution", "contradiction no solution", "a contradiction"],
                "conditional": ["conditional equation", "a conditional equation"]}[ans]},
            "display": f"\"{ans}\"", "verified": f"sympy: expand(lhs - rhs) = {diff}"}


@template("lin_fractions.clear", "lin_fractions", requires=["lin_general", "f_frac_add"], guess=0.02, work_lines=6,
          substeps=["find the LCD of all fractions", "multiply every term on both sides by the LCD", "solve the resulting equation"],
          strategies={"clear_lcd": "clear fractions with the LCD", "work_fractions": "work with the fractions", **OU})
def _(rng):
    p_, q_ = rng.sample([2, 3, 4, 5, 6], 2)
    L = sp.ilcm(p_, q_)
    sol = L * nz(rng, -3, 3)
    k = rng.randint(1, 6)
    rhs = sp.Rational(sol, p_) + sp.Rational(sol, q_) - k
    check(rhs.is_Integer, "integer right side")
    eq = sp.Eq(x / p_ + x / q_ - k, rhs)
    check(_solve_one(eq) == sol, "solve")
    cleared = sp.Eq(sp.expand(L * (x / p_ + x / q_ - k)), L * rhs, evaluate=False)
    lines = sol_eqs(eq, cleared, sp.Eq(sp.expand(L * (x / p_ + x / q_)), L * rhs + L * k, evaluate=False), sp.Eq(x, sol, evaluate=False))
    lines[0] = f"frac(1, {p_}) x + frac(1, {q_}) x - {k} = {rhs}"
    lines.insert(1, f"{L} (frac(1, {p_}) x + frac(1, {q_}) x - {k}) = {L} ({rhs})")
    return {"solution": lines, "prompt": f"Solve: $frac(1, {p_}) x + frac(1, {q_}) x - {k} = {rhs}$.",
            "plain": f"Solve: (1/{p_})x + (1/{q_})x - {k} = {rhs}.", "key": V(sol), "display": f"x = {sol}",
            "verified": f"sympy: solve = {sol}"}


@template("lin_fractions.decimal", "lin_fractions", requires=["lin_general", "f_decimals"], guess=0.02, work_lines=5,
          substeps=["multiply every term by a power of 10 to clear the decimals", "solve"],
          strategies={"clear": "clear decimals", "decimal_arith": "work with decimals", **OU})
def _(rng):
    sol = rng.randint(2, 30)
    a_ = sp.Rational(rng.randint(2, 9), 10)
    b_ = sp.Rational(rng.randint(11, 60), 100)
    c_ = a_ * sol + b_ * (sol - rng.randint(0, 0))
    eq = sp.Eq(a_ * x + b_ * x, c_)
    check(_solve_one(eq) == sol, "solve")
    return {"prompt": f"Solve: ${float(a_):g} x + {float(b_):g} x = {float(c_):g}$.",
            "plain": f"Solve: {float(a_):g}x + {float(b_):g}x = {float(c_):g}.", "key": V(sol),
            "display": f"x = {sol}", "verified": f"sympy: solve = {sol}"}


@template("lin_formula.solve_for", "lin_formula", requires=["lin_general"], guess=0.02, work_lines=4,
          substeps=["treat the other letters as numbers", "isolate the requested variable"],
          strategies={"isolate": "inverse operations", **OU})
def _(rng):
    A, l, W, d, c_ = sp.symbols("A l w d c")
    form = rng.choice(["perimeter", "line", "area_tri", "rate"])
    if form == "perimeter":
        Pp = sp.Symbol("P")
        eq, var, words = sp.Eq(Pp, 2 * l + 2 * W), W, "$P = 2 l + 2 w$ for $w$"
    elif form == "line":
        k1, k2 = rng.randint(2, 7), rng.randint(2, 7)
        eq, var, words = sp.Eq(k1 * x + k2 * y, rng.randint(6, 30)), y, None
        words = f"${T(eq.lhs)} = {eq.rhs}$ for $y$"
    elif form == "area_tri":
        bb, hh = sp.Symbol("b"), sp.Symbol("h")
        eq, var, words = sp.Eq(A, bb * hh / 2), hh, "$A = frac(1, 2) b h$ for $h$"
    else:
        eq, var, words = sp.Eq(d, r * t), t, "$d = r t$ for $t$"
    sol = sp.solve(eq, var)
    check(len(sol) == 1, "unique")
    coef = sp.diff(eq.rhs - eq.lhs, var)  # the formula is linear in the variable
    lines = [f"{T(eq.lhs)} = {T(eq.rhs)}", f"{T(coef * var)} = {T(sp.expand(coef * var - (eq.rhs - eq.lhs)))}",
             f"{T(var)} = {T(sol[0])}"]
    check(sp.simplify(sp.expand(coef * var - (eq.rhs - eq.lhs)) / coef - sol[0]) == 0, "steps")
    return {"solution": lines, "prompt": f"Solve the formula {words}.", "plain": f"Solve the formula {words.replace('$', '')}.",
            "key": E(sol[0]), "display": f"{T(var)} = {T(sol[0])}", "verified": f"sympy: solve for {var} = {sol[0]}"}


@template("lin_ineq.solve", "lin_ineq", requires=["lin_general"], guess=0.02, work_lines=5,
          substeps=["isolate the variable as in an equation", "reverse the inequality when multiplying or dividing by a negative"],
          strategies={"isolate": "isolate the variable", **OU})
def _(rng):
    bnd = rng.randint(-6, 8)
    c = nz(rng, -6, 6, exclude=(0, 1))
    k = rng.randint(-10, 10)
    op = rng.choice(["<", "<=", ">", ">="])
    rel = {"<": sp.Lt, "<=": sp.Le, ">": sp.Gt, ">=": sp.Ge}[op]
    ineq = rel(c * x + k, c * bnd + k)
    sol = sp.solveset(ineq, x, sp.S.Reals)
    check(isinstance(sol, sp.Interval), "interval")
    tops = {"<": "<", "<=": "<=", ">": ">", ">=": ">="}[op]
    flip = {"<": ">", "<=": ">=", ">": "<", ">=": "<="}
    op2 = flip[op] if c < 0 else op
    lines = [f"{T(c * x + k)} {tops} {c * bnd + k}", f"{T(c * x)} {tops} {c * bnd}",
             f"x {op2} {bnd}" + (" quad \"(divide by a negative: the inequality reverses)\"" if c < 0 else "")]
    check(sp.solveset({"<": sp.Lt, "<=": sp.Le, ">": sp.Gt, ">=": sp.Ge}[op2](x, bnd), x, sp.S.Reals) == sol, "steps")
    return {"solution": lines, "prompt": f"Solve the inequality and write the solution in interval notation: ${T(c * x + k)} {tops} {c * bnd + k}$.",
            "plain": f"Solve {P(c * x + k)} {op} {c * bnd + k}; interval notation.",
            "key": interval_key(sol), "display": interval_t(sol), "verified": f"sympy: solveset = {sol}"}


# ============================================================ Chapter 3: applications

@template("app_number.consecutive", "app_number", requires=["lin_general", "f_translate"], guess=0.02, work_lines=6,
          substeps=["name the unknown with a variable", "translate the sentence into an equation", "solve and answer the question"],
          strategies={"equation": "write and solve an equation", "guess_check": "guess and check", **OU})
def _(rng):
    kind = rng.choice(["consecutive", "odd"])
    first = rng.randint(-20, 60)
    if kind == "odd":
        first = first if first % 2 else first + 1
        total = first + first + 2 + first + 4
        words = f"The sum of three consecutive odd integers is {total}. Find the smallest of the three integers."
    else:
        total = first + first + 1 + first + 2
        words = f"The sum of three consecutive integers is {total}. Find the smallest of the three integers."
    step = 2 if kind == "odd" else 1
    check(_solve_one(sp.Eq(3 * n + 3 * step, total), n) == first, "solve")
    lines = [f"\"Let\" n = \"the smallest integer\"", f"n + (n + {step}) + (n + {2 * step}) = {total}",
             f"3 n + {3 * step} = {total}", f"3 n = {total - 3 * step}", f"n = {first}"]
    return {"solution": lines, "prompt": words, "plain": words, "key": V(first), "display": T(first), "verified": f"sympy: 3n + {3 * step} = {total} -> {first}"}


@template("app_number.translate", "app_number", requires=["lin_general", "f_translate"], guess=0.02, work_lines=5,
          substeps=["translate the sentence into an equation", "solve"],
          strategies={"equation": "write and solve an equation", **OU})
def _(rng):
    num = rng.randint(-12, 25)
    c1, k = rng.randint(2, 6), rng.randint(3, 20)
    total = c1 * num - k
    words = f"{k} less than {c1} times a number is {total}. Find the number."
    check(_solve_one(sp.Eq(c1 * n - k, total), n) == num, "solve")
    return {"prompt": words, "plain": words, "key": V(num), "display": T(num), "verified": f"sympy: {c1}n - {k} = {total} -> {num}"}


@template("app_percent.equation", "app_percent", requires=["lin_one_step", "f_percent"], guess=0.02, work_lines=4,
          substeps=["translate: 'of' means multiply, 'is' means equals", "write the percent as a decimal", "solve"],
          strategies={"equation": "percent equation", "proportion": "percent proportion", **OU})
def _(rng):
    pct = rng.choice([5, 8, 12, 15, 20, 25, 35, 40, 60, 75, 125])
    base = rng.choice([20, 40, 60, 80, 120, 160, 200, 240, 360])
    part = sp.Rational(pct, 100) * base
    check(part.q == 1, "whole part")
    form = rng.choice(["find_base", "find_pct", "find_part"])
    dec = f"{float(sp.Rational(pct, 100)):g}"
    if form == "find_base":
        q, ans, disp = f"{part} is {pct}% of what number?", base, T(base)
        lines = [f"{part} = {dec} n", f"n = frac({part}, {dec}) = {base}"]
    elif form == "find_pct":
        q, ans, disp = f"What percent of {base} is {part}?", pct, f"{pct} %"
        lines = [f"p dot {base} = {part}", f"p = frac({part}, {base}) = {dec} = {pct} %"]
    else:
        q, ans, disp = f"What is {pct}% of {base}?", part, T(part)
        lines = [f"n = {dec} dot {base}", f"n = {part}"]
    return {"solution": lines, "prompt": q.replace("%", "\\%"), "plain": q, "key": V(ans), "display": disp,
            "verified": f"sympy: {pct}/100 * {base} = {part}"}


@template("app_percent.change", "app_percent", requires=["lin_one_step", "f_percent"], guess=0.02, work_lines=4,
          substeps=["find the amount of change", "divide the change by the original amount"],
          strategies={"change_over_original": "change divided by original", **OU})
def _(rng):
    orig = rng.choice([20, 25, 40, 50, 80, 120, 150, 200])
    pct = rng.choice([10, 15, 20, 25, 30, 40, 60])
    up = rng.choice([True, False])
    new = orig + sp.Rational(pct, 100) * orig * (1 if up else -1)
    check(new.q == 1, "whole")
    word = "increased" if up else "decreased"
    chg = abs(new - orig)
    change_lines = [f"\"change\" = {T(chg)}", f"frac({T(chg)}, {orig}) = {float(chg / orig):g} = {pct} %"]
    q = f"The price of a ticket {word} from {money(orig)} to {money(new)}. Find the percent {'increase' if up else 'decrease'}."
    return {"solution": change_lines, "prompt": q, "plain": q.replace("\\", ""), "key": V(pct), "display": f"{pct} %",
            "verified": f"sympy: |{new} - {orig}|/{orig} = {pct}/100"}


@template("app_interest.simple", "app_interest", requires=["app_percent"], guess=0.02, work_lines=4,
          substeps=["write I = Prt with the rate as a decimal", "solve for the unknown"],
          strategies={"formula": "I = Prt", **OU})
def _(rng):
    Pp = rng.choice([500, 1200, 2000, 2500, 4000, 6000])
    rate = rng.choice([2, 3, 4, 5, 6])
    yrs = rng.randint(2, 6)
    I = sp.Rational(Pp * rate * yrs, 100)
    form = rng.choice(["interest", "rate"])
    rl = [f"I = P r t", f"I = {Pp} ({float(sp.Rational(rate, 100)):g}) ({yrs})", f"I = {T(I)}"] if form == "interest" else \
        [f"I = P r t", f"{T(I)} = {Pp} dot r dot {yrs}", f"r = frac({T(I)}, {Pp * yrs}) = {float(sp.Rational(rate, 100)):g} = {rate} %"]
    if form == "interest":
        q, ans, disp = f"Find the simple interest earned on {money(Pp)} invested at {rate}% for {yrs} years.", I, money(I)
    else:
        q, ans, disp = f"An investment of {money(Pp)} earned {money(I)} in simple interest over {yrs} years. What was the annual interest rate, as a percent?", rate, f"{rate} %"
    return {"solution": rl, "prompt": q.replace("%", "\\%"), "plain": q.replace("\\", ""), "key": V(ans), "display": disp,
            "verified": f"sympy: I = {Pp}*{rate}/100*{yrs} = {I}"}


@template("app_interest.discount", "app_interest", requires=["app_percent"], guess=0.02, work_lines=4,
          substeps=["find the amount of discount (or mark-up)", "subtract from (or add to) the original price"],
          strategies={"two_step": "amount, then sale price", "multiplier": "multiply by (1 - rate)", **OU})
def _(rng):
    orig = rng.choice([40, 60, 80, 120, 150, 240, 300])
    rate = rng.choice([10, 15, 20, 25, 30, 40])
    sale = orig * (1 - sp.Rational(rate, 100))
    q = f"A jacket regularly priced at {money(orig)} is on sale for {rate}% off. Find the sale price."
    return {"prompt": q.replace("%", "\\%"), "plain": q.replace("\\", ""), "key": V(sale), "display": money(sale),
            "verified": f"sympy: {orig}*(1 - {rate}/100) = {sale}"}


@template("app_mixture.coins", "app_mixture", requires=["app_number", "f_decimals"], guess=0.02, work_lines=6,
          substeps=["write the number of each coin with one variable", "write the value equation", "solve and answer"],
          strategies={"table": "number / value / total value table", "guess_check": "guess and check", **OU})
def _(rng):
    dimes = rng.randint(4, 20)
    extra = rng.randint(2, 9)
    quarters = dimes + extra
    total = sp.Rational(10 * dimes + 25 * quarters, 100)
    q = (f"A jar holds only dimes and quarters. There are {extra} more quarters than dimes, and the coins are worth "
         f"{money(total)} in all. How many dimes are in the jar?")
    check(_solve_one(sp.Eq(sp.Rational(1, 10) * n + sp.Rational(1, 4) * (n + extra), total), n) == dimes, "solve")
    lines = [f"\"Let\" n = \"the number of dimes\", quad n + {extra} = \"the number of quarters\"",
             f"0.10 n + 0.25 (n + {extra}) = {float(total):.2f}", f"0.35 n + {0.25 * extra:.2f} = {float(total):.2f}",
             f"0.35 n = {float(total - sp.Rational(extra, 4)):.2f}", f"n = {dimes}"]
    check(sp.Rational(35, 100) * dimes == total - sp.Rational(extra, 4), "steps")
    return {"solution": lines, "prompt": q, "plain": q.replace("\\", ""), "key": V(dimes), "display": T(dimes),
            "verified": f"sympy: 0.10n + 0.25(n + {extra}) = {total} -> {dimes}"}


@template("app_mixture.tickets", "app_mixture", requires=["app_number", "f_decimals"], guess=0.02, work_lines=6,
          substeps=["write each number of tickets with one variable", "write the value equation", "solve"],
          strategies={"table": "number / value / total value table", **OU})
def _(rng):
    adult_p, child_p = rng.choice([(12, 7), (15, 8), (10, 6), (9, 5)])
    total_n = rng.randint(80, 300)
    adults = rng.randint(20, total_n - 20)
    rev = adult_p * adults + child_p * (total_n - adults)
    q = (f"A school play sold {total_n} tickets. Adult tickets cost {money(adult_p)} and child tickets cost {money(child_p)}. "
         f"Ticket sales totaled {money(rev)}. How many adult tickets were sold?")
    check(_solve_one(sp.Eq(adult_p * n + child_p * (total_n - n), rev), n) == adults, "solve")
    return {"prompt": q, "plain": q.replace("\\", ""), "key": V(adults), "display": T(adults),
            "verified": f"sympy: {adult_p}n + {child_p}({total_n} - n) = {rev} -> {adults}"}


@template("app_geometry.pythagorean", "app_geometry", requires=["app_number", "f_sqrt"], guess=0.02, work_lines=4,
          substeps=["write a^2 + b^2 = c^2 with c the hypotenuse", "solve for the missing side"],
          strategies={"pythagorean": "Pythagorean Theorem", **OU})
def _(rng):
    tri = rng.choice([(3, 4, 5), (5, 12, 13), (8, 15, 17), (7, 24, 25), (6, 8, 10), (9, 12, 15), (20, 21, 29)])
    k = rng.choice([1, 1, 2])
    a_, b_, c_ = (k * s for s in tri)
    form = rng.choice(["hyp", "leg"])
    if form == "hyp":
        q, ans = f"A right triangle has legs of length {a_} and {b_}. Find the length of the hypotenuse.", c_
    else:
        q, ans = f"A right triangle has hypotenuse {c_} and one leg of length {a_}. Find the length of the other leg.", b_
    check(a_ ** 2 + b_ ** 2 == c_ ** 2, "pythagorean")
    if form == "hyp":
        lines = [f"a^2 + b^2 = c^2", f"{a_}^2 + {b_}^2 = c^2", f"{a_ ** 2 + b_ ** 2} = c^2", f"c = sqrt({c_ ** 2}) = {c_}"]
    else:
        lines = [f"a^2 + b^2 = c^2", f"{a_}^2 + b^2 = {c_}^2", f"b^2 = {c_ ** 2} - {a_ ** 2} = {b_ ** 2}", f"b = sqrt({b_ ** 2}) = {b_}"]
    return {"solution": lines, "prompt": q, "plain": q, "key": V(ans), "display": T(ans), "verified": f"{a_}^2 + {b_}^2 = {c_}^2"}


@template("app_geometry.rectangle", "app_geometry", requires=["app_number"], guess=0.02, work_lines=5,
          substeps=["write the length in terms of the width", "use P = 2L + 2W", "solve and answer"],
          strategies={"equation": "perimeter equation", "guess_check": "guess and check", **OU})
def _(rng):
    W_ = rng.randint(3, 20)
    k, extra = rng.choice([1, 2, 3]), rng.randint(1, 9)
    L_ = k * W_ + extra
    Pp = 2 * L_ + 2 * W_
    rel = f"{extra} more than {'twice' if k == 2 else 'three times' if k == 3 else ''} the width".replace("  ", " ")
    q = f"The length of a rectangle is {rel}. The perimeter is {Pp} feet. Find the width."
    check(_solve_one(sp.Eq(2 * (k * w + extra) + 2 * w, Pp), w) == W_, "solve")
    return {"prompt": q, "plain": q, "key": V(W_), "display": f"{W_} \"feet\"", "verified": f"sympy: width = {W_}"}


@template("app_motion.opposite", "app_motion", requires=["app_number", "lin_formula"], guess=0.02, work_lines=6,
          substeps=["write each distance as rate times time", "set up the equation from the situation", "solve"],
          strategies={"table": "rate / time / distance table", **OU})
def _(rng):
    r1 = rng.choice([40, 45, 50, 55, 60])
    r2 = r1 + rng.choice([5, 10, 15, 20])
    tt = sp.Rational(rng.choice([2, 3, 4, 5, 6]), rng.choice([1, 2]))
    dist = (r1 + r2) * tt
    check(dist.q == 1, "whole distance")
    q = (f"Two cars leave the same town at the same time, driving in opposite directions. One travels {r1} mph and the "
         f"other {r2} mph. After how many hours will they be {dist} miles apart?")
    check(_solve_one(sp.Eq(r1 * t + r2 * t, dist), t) == tt, "solve")
    lines = [f"{r1} t + {r2} t = {dist}", f"{r1 + r2} t = {dist}", f"t = {T(tt)}"]
    return {"solution": lines, "prompt": q, "plain": q, "key": V(tt), "display": f"{T(tt)} \"hours\"", "verified": f"sympy: ({r1}+{r2})t = {dist} -> {tt}"}


@template("app_ineq.budget", "app_ineq", requires=["lin_ineq", "app_number"], guess=0.02, work_lines=5,
          substeps=["write the inequality from the words 'at most' / 'at least'", "solve it", "round to a sensible whole number"],
          strategies={"inequality": "write and solve an inequality", **OU})
def _(rng):
    fee = rng.choice([20, 25, 30, 45])
    per = rng.choice([6, 8, 9, 12, 15])
    budget = fee + per * rng.randint(4, 15) + rng.randint(1, per - 1)
    most = (budget - fee) // per
    q = (f"A gym charges a {money(fee)} sign-up fee and {money(per)} per class. Maria can spend at most {money(budget)}. "
         f"What is the greatest number of classes she can take?")
    check(fee + per * most <= budget < fee + per * (most + 1), "bound")
    lines = [f"{fee} + {per} n <= {budget}", f"{per} n <= {budget - fee}", f"n <= {T(sp.Rational(budget - fee, per))}",
             f"n = {most} quad \"(the greatest whole number)\""]
    return {"solution": lines, "prompt": q, "plain": q.replace("\\", ""), "key": V(most), "display": T(most),
            "verified": f"{fee} + {per}n <= {budget} -> n <= {sp.Rational(budget - fee, per)} -> {most}"}


# ============================================================ Chapter 4: graphs

@template("gr_points.table", "gr_points", requires=["f_int_eval", "lin_one_step"], guess=0.02, work_lines=3,
          substeps=["substitute the given coordinate", "solve for the other coordinate"],
          strategies={"substitute": "substitute and solve", **OU})
def _(rng):
    a_, b_ = nz(rng, -5, 5), nz(rng, -5, 5)
    xv = rng.randint(-4, 4)
    yv = sp.Rational(rng.randint(-12, 12), 1)
    c_ = a_ * xv + b_ * yv
    q = f"Find the value of $y$ that makes $({xv}, y)$ a solution of ${T(a_ * x + b_ * y)} = {c_}$."
    check(_solve_one(sp.Eq(a_ * xv + b_ * y, c_), y) == yv, "solve")
    lines = [f"{a_} ({xv}) + {T(b_ * y)} = {c_}", f"{a_ * xv} + {T(b_ * y)} = {c_}", f"{T(b_ * y)} = {c_ - a_ * xv}", f"y = {yv}"]
    check(b_ * yv == c_ - a_ * xv, "steps")
    return {"solution": lines, "prompt": q, "plain": q.replace("$", ""), "key": V(yv), "display": f"y = {yv}", "verified": f"sympy: y = {yv}"}


@template("gr_points.verify", "gr_points", requires=["f_int_eval"], guess=0.5, work_lines=3,
          substeps=["substitute both coordinates", "check whether the equation is true"],
          strategies={"substitute": "substitute and check", **OU})
def _(rng):
    a_, b_ = nz(rng, -5, 5), nz(rng, -5, 5)
    xv, yv = rng.randint(-4, 4), rng.randint(-4, 4)
    c_ = a_ * xv + b_ * yv
    is_sol = rng.choice([True, False])
    px, py = (xv, yv) if is_sol else (yv, xv)
    check(is_sol or a_ * px + b_ * py != c_, "swapped point is not a solution")
    ans = "yes" if a_ * px + b_ * py == c_ else "no"
    return {"prompt": f"Is $({px}, {py})$ a solution of ${T(a_ * x + b_ * y)} = {c_}$? Show the check.",
            "plain": f"Is ({px}, {py}) a solution of {P(a_ * x + b_ * y)} = {c_}?",
            "key": {"kind": "choice", "value": ans, "aliases": ["it is a solution"] if ans == "yes" else ["not a solution", "it is not"]},
            "display": f"\"{ans}\"", "verified": f"{a_}*{px} + {b_}*{py} = {a_ * px + b_ * py} vs {c_}"}


@template("gr_lines.point_on_line", "gr_lines", requires=["gr_points"], guess=0.02, work_lines=3,
          substeps=["choose the x-value", "compute y from the equation"],
          strategies={"substitute": "substitute into the equation", **OU})
def _(rng):
    mv = sp.Rational(nz(rng, -4, 4), rng.choice([1, 1, 2, 3]))
    bv = rng.randint(-6, 6)
    xv = mv.q * rng.randint(-3, 3)
    yv = mv * xv + bv
    q = f"The line $y = {lin(mv, bv)}$ passes through the point $({xv}, y)$. Find $y$."
    lines = [f"y = {lin(mv, bv).replace('x', f'({xv})')}", f"y = {T(mv * xv)} {signed(bv)}", f"y = {yv}"]
    return {"solution": lines, "prompt": q, "plain": f"The line y = {lin_p(mv, bv)} passes through ({xv}, y). Find y.", "key": V(yv),
            "display": f"y = {yv}", "verified": f"sympy: {mv}*{xv} + {bv} = {yv}"}


@template("gr_lines.vertical_horizontal", "gr_lines", requires=["gr_points"], guess=0.25, work_lines=2,
          substeps=["a vertical line has the same x for every point; a horizontal line has the same y"],
          strategies={"same_coordinate": "which coordinate stays the same", **OU})
def _(rng):
    k = nz(rng, -7, 7)
    vert = rng.choice([True, False])
    pts = [(k, rng.randint(-5, 5)) for _ in range(3)] if vert else [(rng.randint(-5, 5), k) for _ in range(3)]
    check(len(set(pts)) == 3, "distinct points")
    ans = f"x = {k}" if vert else f"y = {k}"
    q = f"The points ${', '.join(f'({p_}, {q_})' for p_, q_ in pts)}$ all lie on one line. Write the equation of the line."
    return {"prompt": q, "plain": q.replace("$", ""),
            "key": {"kind": "equation", "value": sp.srepr((x if vert else y) - k), "display": ans}, "display": ans,
            "verified": f"all points share {'x' if vert else 'y'} = {k}"}


@template("gr_intercepts.find", "gr_intercepts", requires=["gr_lines"], guess=0.02, work_lines=4,
          substeps=["to find the x-intercept, let y = 0", "to find the y-intercept, let x = 0"],
          strategies={"zero_substitution": "set the other variable to zero", **OU})
def _(rng):
    xi, yi = nz(rng, -6, 6), nz(rng, -6, 6)
    # line through (xi, 0) and (0, yi): x/xi + y/yi = 1 -> yi x + xi y = xi yi
    A_, B_, C_ = yi, xi, xi * yi
    g = sp.igcd(sp.igcd(A_, B_), C_)
    A_, B_, C_ = A_ // g, B_ // g, C_ // g
    which = rng.choice(["x", "y"])
    ans = (xi, 0) if which == "x" else (0, yi)
    check(A_ * ans[0] + B_ * ans[1] == C_, "intercept on line")
    q = f"Find the {which}-intercept of the line ${T(A_ * x + B_ * y)} = {C_}$. Write it as an ordered pair."
    if which == "x":
        lines = [f"\"Let\" y = 0", f"{T(A_ * x)} + {B_} (0) = {C_}", f"x = {xi}"]
    else:
        lines = [f"\"Let\" x = 0", f"{A_} (0) + {T(B_ * y)} = {C_}", f"y = {yi}"]
    return {"solution": lines, "prompt": q, "plain": q.replace("$", ""), "key": {"kind": "point", "value": [str(ans[0]), str(ans[1])]},
            "display": f"({ans[0]}, {ans[1]})", "verified": f"sympy: {A_}*{ans[0]} + {B_}*{ans[1]} = {C_}"}


@template("gr_slope.two_points", "gr_slope", requires=["gr_points", "f_frac_mul"], guess=0.02, work_lines=4,
          substeps=["subtract the y-coordinates", "subtract the x-coordinates in the same order", "divide and simplify"],
          strategies={"slope_formula": "m = (y2 - y1)/(x2 - x1)", "graph": "count rise and run", **OU})
def _(rng):
    x1, y1 = rng.randint(-6, 6), rng.randint(-6, 6)
    x2, y2 = rng.randint(-6, 6), rng.randint(-6, 6)
    check(x1 != x2 and y1 != y2, "not horizontal or vertical")
    mv = sp.Rational(y2 - y1, x2 - x1)
    return {"prompt": f"Find the slope of the line through $({x1}, {y1})$ and $({x2}, {y2})$.",
            "plain": f"Find the slope of the line through ({x1}, {y1}) and ({x2}, {y2}).",
            "key": V(mv), "display": T(mv), "verified": f"sympy: ({y2}-{y1})/({x2}-{x1}) = {mv}",
            "solution": [f"m = frac({y2} - ({y1}), {x2} - ({x1}))", f"m = frac({y2 - y1}, {x2 - x1})", f"m = {T(mv)}"]}


@template("gr_slope.horizontal_vertical", "gr_slope", requires=["gr_points"], guess=0.3, work_lines=3,
          substeps=["use the slope formula, or recognize the kind of line"],
          strategies={"formula": "slope formula", "recognize": "recognize horizontal / vertical", **OU})
def _(rng):
    k = nz(rng, -6, 6)
    p1, p2 = rng.sample(range(-6, 7), 2)
    vert = rng.choice([True, False])
    if vert:
        pts, ans, aliases = [(k, p1), (k, p2)], "undefined", ["undefined", "no slope", "dne"]
    else:
        pts, ans, aliases = [(p1, k), (p2, k)], "0", ["zero", "0"]
    return {"prompt": f"Find the slope of the line through $({pts[0][0]}, {pts[0][1]})$ and $({pts[1][0]}, {pts[1][1]})$.",
            "plain": f"Find the slope of the line through {pts[0]} and {pts[1]}.",
            "key": {"kind": "choice", "value": ans, "aliases": aliases}, "display": f"\"{ans}\"",
            "verified": f"{'x' if vert else 'y'} coordinates equal"}


@template("gr_slope_int.identify", "gr_slope_int", requires=["gr_slope", "lin_formula"], guess=0.02, work_lines=4,
          substeps=["solve the equation for y", "read the slope as the coefficient of x"],
          strategies={"solve_for_y": "solve for y, then read m", **OU})
def _(rng):
    A_, B_ = nz(rng, -6, 6), nz(rng, -6, 6, exclude=(0, 1))
    C_ = rng.randint(-12, 12)
    sol_y = sp.solve(sp.Eq(A_ * x + B_ * y, C_), y)[0]
    mv = sp.Poly(sol_y, x).coeff_monomial(x)
    check(mv == sp.Rational(-A_, B_), "slope")
    bv = sol_y.subs(x, 0)
    lines = [f"{T(A_ * x + B_ * y)} = {C_}", f"{T(B_ * y)} = {T(-A_ * x + C_)}", f"y = {lin(mv, bv)}", f"m = {T(mv)}"]
    return {"solution": lines, "prompt": f"Find the slope of the line ${T(A_ * x + B_ * y)} = {C_}$.",
            "plain": f"Find the slope of the line {P(A_ * x + B_ * y)} = {C_}.", "key": V(mv), "display": T(mv),
            "verified": f"sympy: y = {sol_y}"}


@template("gr_slope_int.perpendicular", "gr_slope_int", requires=["gr_slope"], guess=0.02, work_lines=3,
          substeps=["a perpendicular slope is the negative reciprocal", "a parallel slope is the same"],
          strategies={"negative_reciprocal": "negative reciprocal / same slope", **OU})
def _(rng):
    mv = sp.Rational(nz(rng, -5, 5), rng.choice([1, 2, 3, 4]))
    bv = rng.randint(-6, 6)
    kind = rng.choice(["perpendicular", "parallel"])
    ans = -1 / mv if kind == "perpendicular" else mv
    check(ans * mv == -1 if kind == "perpendicular" else ans == mv, "relationship")
    return {"prompt": f"Find the slope of a line {kind} to $y = {lin(mv, bv)}$.",
            "plain": f"Find the slope of a line {kind} to y = {lin_p(mv, bv)}.", "key": V(ans), "display": T(ans),
            "verified": f"sympy: {kind} slope = {ans}"}


@template("gr_line_eq.point_slope", "gr_line_eq", requires=["gr_slope_int"], guess=0.02, work_lines=4,
          substeps=["start from y - y1 = m(x - x1)", "distribute and solve for y"],
          strategies={"point_slope": "point-slope form", "slope_intercept": "substitute into y = mx + b", **OU})
def _(rng):
    mv = sp.Rational(nz(rng, -5, 5), rng.choice([1, 1, 2, 3]))
    x1 = mv.q * rng.randint(-3, 3)
    y1 = rng.randint(-6, 6)
    bv = y1 - mv * x1
    line = mv * x + bv
    check(line.subs(x, x1) == y1, "passes through the point")
    return {"prompt": f"Find the equation of the line with slope $m = {T(mv)}$ that passes through $({x1}, {y1})$. "
                      f"Write it in slope-intercept form.",
            "plain": f"Line with slope {mv} through ({x1}, {y1}), slope-intercept form.",
            "key": {"kind": "equation", "value": sp.srepr(y - line), "form": "slope_intercept", "display": f"y = {lin_p(mv, bv)}"},
            "display": f"y = {lin(mv, bv)}", "verified": f"sympy: y = {line}",
            "solution": [f"y - ({y1}) = {T(mv)} (x - ({x1}))", f"y = {lin(mv, bv)}"]}


@template("gr_line_eq.two_points", "gr_line_eq", requires=["gr_slope_int", "gr_slope"], guess=0.02, work_lines=5,
          substeps=["find the slope from the two points", "use point-slope form with one of the points", "solve for y"],
          strategies={"point_slope": "slope, then point-slope form", **OU})
def _(rng):
    mv = nz(rng, -4, 4)
    bv = rng.randint(-6, 6)
    x1, x2 = rng.sample(range(-4, 5), 2)
    y1, y2 = mv * x1 + bv, mv * x2 + bv
    line = mv * x + bv
    check(sp.Rational(y2 - y1, x2 - x1) == mv, "slope")
    return {"prompt": f"Find the equation of the line through $({x1}, {y1})$ and $({x2}, {y2})$. Write it in slope-intercept form.",
            "plain": f"Line through ({x1}, {y1}) and ({x2}, {y2}), slope-intercept form.",
            "key": {"kind": "equation", "value": sp.srepr(y - line), "form": "slope_intercept", "display": f"y = {lin_p(mv, bv)}"},
            "display": f"y = {lin(mv, bv)}", "verified": f"sympy: y = {line}"}


@template("gr_ineq2.test_point", "gr_ineq2", requires=["gr_slope_int", "lin_ineq"], guess=0.5, work_lines=3,
          substeps=["substitute the point into the inequality", "decide whether the result is true"],
          strategies={"substitute": "substitute and check", **OU})
def _(rng):
    mv, bv = nz(rng, -3, 3), rng.randint(-5, 5)
    px, py = rng.randint(-4, 4), rng.randint(-6, 6)
    op = rng.choice(["<", "<=", ">", ">="])
    val = {"<": py < mv * px + bv, "<=": py <= mv * px + bv, ">": py > mv * px + bv, ">=": py >= mv * px + bv}[op]
    ans = "yes" if val else "no"
    lines = [f"{py} {op} {lin(mv, bv).replace('x', f'({px})')}", f"{py} {op} {mv * px + bv}",
             f"\"{'true, so it is a solution' if val else 'false, so it is not a solution'}\""]
    return {"solution": lines, "prompt": f"Is $({px}, {py})$ a solution of $y {op} {lin(mv, bv)}$? Show the check.",
            "plain": f"Is ({px}, {py}) a solution of y {op} {lin_p(mv, bv)}?",
            "key": {"kind": "choice", "value": ans, "aliases": []}, "display": f"\"{ans}\"",
            "verified": f"{py} {op} {mv * px + bv} is {val}"}


# ============================================================ Chapter 5: systems

def _system(rng):
    xs, ys = rng.randint(-6, 6), rng.randint(-6, 6)
    while True:
        a1, b1, a2, b2 = (nz(rng, -5, 5) for _ in range(4))
        if a1 * b2 - a2 * b1 != 0:
            break
    return xs, ys, (a1, b1, a1 * xs + b1 * ys), (a2, b2, a2 * xs + b2 * ys)


def _sys_t(e1, e2):
    return f"cases({T(e1[0] * x + e1[1] * y)} = {e1[2]}, {T(e2[0] * x + e2[1] * y)} = {e2[2]})"


def _sys_p(e1, e2):
    return f"{P(e1[0] * x + e1[1] * y)} = {e1[2]} and {P(e2[0] * x + e2[1] * y)} = {e2[2]}"


@template("sys_graph.count", "sys_graph", requires=["gr_slope_int"], guess=0.34, work_lines=4,
          substeps=["write both equations in slope-intercept form", "compare slopes and intercepts"],
          strategies={"compare_slopes": "compare slopes and intercepts", "graph": "graph both lines", **OU})
def _(rng):
    m1 = nz(rng, -4, 4)
    b1 = rng.randint(-5, 5)
    kind = rng.choice(["one", "none", "infinitely many"])
    k = rng.choice([2, 3])
    if kind == "one":
        m2, b2 = m1 + nz(rng, -3, 3), rng.randint(-5, 5)
        e2 = (-k * m2, k, k * b2)
    elif kind == "none":
        b2 = b1 + nz(rng, -4, 4)
        e2 = (-k * m1, k, k * b2)
    else:
        e2 = (-k * m1, k, k * b1)
    e1 = (-m1, 1, b1)
    M = sp.Matrix([[e1[0], e1[1]], [e2[0], e2[1]]])
    sol = sp.linsolve([e1[0] * x + e1[1] * y - e1[2], e2[0] * x + e2[1] * y - e2[2]], x, y)
    truth = "none" if sol == sp.EmptySet else ("one" if M.det() != 0 else "infinitely many")
    check(truth == kind, "count")
    m2_, b2_ = sp.Rational(-e2[0], e2[1]), sp.Rational(e2[2], e2[1])
    count_lines = [f"y = {lin(m1, b1)}", f"y = {lin(m2_, b2_)}",
                   "\"" + {"one": "different slopes: one solution", "none": "same slope, different intercepts: no solution",
                            "infinitely many": "same line: infinitely many solutions"}[kind] + "\""]
    return {"solution": count_lines, "prompt": f"Without solving, decide how many solutions the system has: one, none, or infinitely many. ${_sys_t(e1, e2)}$",
            "plain": f"How many solutions: {_sys_p(e1, e2)}?",
            "key": {"kind": "choice", "value": kind, "aliases": {"one": ["1", "one solution", "exactly one"],
                                                                  "none": ["no solution", "0", "zero", "no solutions"],
                                                                  "infinitely many": ["infinite", "infinitely many solutions", "infinitely"]}[kind]},
            "display": f"\"{kind}\"", "verified": f"sympy: linsolve = {sol}"}


@template("sys_substitution.solve", "sys_substitution", requires=["sys_graph", "lin_general"], guess=0.02, work_lines=6,
          substeps=["solve one equation for a variable", "substitute into the other equation", "solve, then find the other variable"],
          strategies={"substitution": "substitution", "elimination": "elimination", **OU})
def _(rng):
    xs, ys = rng.randint(-6, 6), rng.randint(-6, 6)
    mv = nz(rng, -4, 4)
    bv = ys - mv * xs
    a2, b2 = nz(rng, -5, 5), nz(rng, -5, 5)
    check(a2 + b2 * mv != 0, "independent")
    c2 = a2 * xs + b2 * ys
    sol = sp.linsolve([y - (mv * x + bv), a2 * x + b2 * y - c2], x, y)
    check(sol == sp.FiniteSet((xs, ys)), "solve")
    sub = sp.expand(a2 * x + b2 * (mv * x + bv))
    lines = [f"{T(a2 * x)} + {b2} ({lin(mv, bv)}) = {c2}", f"{T(sub)} = {c2}", f"x = {xs}", f"y = {lin(mv, bv).replace('x', f'({xs})')} = {ys}"]
    check(_solve_one(sp.Eq(sub, c2)) == xs, "steps")
    return {"solution": lines, "prompt": f"Solve the system by substitution: $cases(y = {lin(mv, bv)}, {T(a2 * x + b2 * y)} = {c2})$",
            "plain": f"Solve by substitution: y = {lin_p(mv, bv)} and {P(a2 * x + b2 * y)} = {c2}.",
            "key": {"kind": "point", "value": [str(xs), str(ys)]}, "display": f"({xs}, {ys})", "verified": f"sympy: linsolve = {sol}"}


@template("sys_elimination.solve", "sys_elimination", requires=["sys_substitution"], guess=0.02, work_lines=7,
          substeps=["multiply one or both equations so a variable has opposite coefficients", "add the equations", "solve, then back-substitute"],
          strategies={"elimination": "elimination", "substitution": "substitution", **OU})
def _(rng):
    xs, ys, e1, e2 = _system(rng)
    sol = sp.linsolve([e1[0] * x + e1[1] * y - e1[2], e2[0] * x + e2[1] * y - e2[2]], x, y)
    check(sol == sp.FiniteSet((xs, ys)), "solve")
    L_ = sp.ilcm(abs(e1[1]), abs(e2[1]))
    k1, k2 = L_ // e1[1], -(L_ // e2[1])
    A_ = k1 * e1[0] + k2 * e2[0]
    C_ = k1 * e1[2] + k2 * e2[2]
    check(A_ != 0 and sp.Rational(C_, A_) == xs, "elimination")
    lines = [f"{k1} ({T(e1[0] * x + e1[1] * y)}) = {k1} ({e1[2]})", f"{k2} ({T(e2[0] * x + e2[1] * y)}) = {k2} ({e2[2]})",
             f"\"add:\" quad {T(A_ * x)} = {C_}", f"x = {xs}, quad y = {ys}"]
    return {"solution": lines, "prompt": f"Solve the system by elimination: ${_sys_t(e1, e2)}$",
            "plain": f"Solve by elimination: {_sys_p(e1, e2)}.",
            "key": {"kind": "point", "value": [str(xs), str(ys)]}, "display": f"({xs}, {ys})", "verified": f"sympy: linsolve = {sol}"}


@template("sys_apps.two_numbers", "sys_apps", requires=["sys_elimination", "app_mixture"], guess=0.02, work_lines=7,
          substeps=["name the two unknowns", "write two equations", "solve the system and answer the question"],
          strategies={"system": "system of equations", "one_variable": "one variable", **OU})
def _(rng):
    form = rng.choice(["tickets", "sum_diff"])
    if form == "sum_diff":
        big, small = rng.randint(20, 80), rng.randint(3, 19)
        q = f"The sum of two numbers is {big + small} and their difference is {big - small}. Find the larger number."
        sol = sp.linsolve([u + v - (big + small), u - v - (big - small)], u, v)
        check(sol == sp.FiniteSet((big, small)), "solve")
        return {"solution": [f"u + v = {big + small}", f"u - v = {big - small}", f"2 u = {2 * big}", f"u = {big}"], "prompt": q, "plain": q, "key": V(big), "display": T(big), "verified": f"sympy: {sol}"}
    pa, pc = rng.choice([(8, 5), (12, 7), (9, 4)])
    na, nc = rng.randint(10, 60), rng.randint(10, 60)
    q = (f"A museum sold {na + nc} tickets for {money(pa * na + pc * nc)}. Adult tickets cost {money(pa)} and "
         f"student tickets cost {money(pc)}. How many student tickets were sold?")
    sol = sp.linsolve([u + v - (na + nc), pa * u + pc * v - (pa * na + pc * nc)], u, v)
    check(sol == sp.FiniteSet((na, nc)), "solve")
    lines = [f"a + s = {na + nc}", f"{pa} a + {pc} s = {pa * na + pc * nc}", f"{pa} ({na + nc} - s) + {pc} s = {pa * na + pc * nc}",
             f"{pc - pa} s = {pa * na + pc * nc - pa * (na + nc)}", f"s = {nc}"]
    return {"solution": lines, "prompt": q, "plain": q.replace("\\", ""), "key": V(nc), "display": T(nc), "verified": f"sympy: {sol}"}


@template("sys_ineq.check", "sys_ineq", requires=["sys_graph", "gr_ineq2"], guess=0.5, work_lines=4,
          substeps=["check the point in the first inequality", "check the point in the second inequality"],
          strategies={"substitute_both": "substitute into both", **OU})
def _(rng):
    m1, b1, m2, b2 = nz(rng, -3, 3), rng.randint(-4, 4), nz(rng, -3, 3), rng.randint(-4, 4)
    px, py = rng.randint(-3, 3), rng.randint(-5, 5)
    ok = (py > m1 * px + b1) and (py <= m2 * px + b2)
    ans = "yes" if ok else "no"
    sys_lines = [f"{py} > {m1 * px + b1} quad \"{'true' if py > m1 * px + b1 else 'false'}\"",
                 f"{py} <= {m2 * px + b2} quad \"{'true' if py <= m2 * px + b2 else 'false'}\"",
                 f"\"{'both true: a solution' if ok else 'not both true: not a solution'}\""]
    return {"solution": sys_lines, "prompt": f"Is $({px}, {py})$ a solution of the system $cases(y > {lin(m1, b1)}, y <= {lin(m2, b2)})$? Show both checks.",
            "plain": f"Is ({px}, {py}) a solution of y > {lin_p(m1, b1)} and y <= {lin_p(m2, b2)}?",
            "key": {"kind": "choice", "value": ans, "aliases": []}, "display": f"\"{ans}\"",
            "verified": f"{py} > {m1 * px + b1}: {py > m1 * px + b1}; {py} <= {m2 * px + b2}: {py <= m2 * px + b2}"}


# ============================================================ Chapter 6: polynomials and exponents

@template("poly_addsub.subtract", "poly_addsub", requires=["f_like_terms", "f_int_eval"], guess=0.02, work_lines=4,
          substeps=["distribute the minus sign to every term of the second polynomial", "combine like terms"],
          strategies={"distribute_negative": "change every sign, then combine", **OU})
def _(rng):
    p1 = nz(rng, -6, 6) * x**2 + rng.randint(-9, 9) * x + rng.randint(-9, 9)
    p2 = nz(rng, -6, 6) * x**2 + nz(rng, -9, 9) * x + nz(rng, -9, 9)
    res = sp.expand(p1 - p2)
    check(sp.degree(res, x) == 2, "degree two")
    lines = [f"({T(p1)}) - ({T(p2)})", f"= {T(p1)} {signed_terms(-p2)}", f"= {T(res)}"]
    return {"solution": lines, "prompt": f"Subtract: $({T(p1)}) - ({T(p2)})$.", "plain": f"Subtract: ({P(p1)}) - ({P(p2)}).",
            "key": E(res, "polynomial"), "display": T(res), "verified": f"sympy: expand = {res}"}


@template("poly_addsub.evaluate", "poly_addsub", requires=["f_int_eval"], guess=0.02, work_lines=3,
          substeps=["substitute the value", "simplify with the order of operations"],
          strategies={"substitute": "substitute", **OU})
def _(rng):
    p_ = nz(rng, -3, 3) * x**3 + nz(rng, -5, 5) * x**2 + rng.randint(-9, 9)
    k = nz(rng, -3, 3)
    val = p_.subs(x, k)
    return {"prompt": f"Evaluate the polynomial ${T(p_)}$ when $x = {k}$.", "plain": f"Evaluate {P(p_)} at x = {k}.",
            "key": V(val), "display": T(val), "verified": f"sympy: subs = {val}"}


@template("exp_product.simplify", "exp_product", requires=["f_int_mul"], guess=0.02, work_lines=3,
          substeps=["raise every factor to the power", "multiply powers of the same base by adding exponents"],
          strategies={"properties": "exponent properties", "expand": "write out the factors", **OU})
def _(rng):
    c_, p_, q_ = rng.choice([2, 3, -2, 4]), rng.randint(2, 4), rng.randint(2, 3)
    k, s_ = rng.randint(2, 5), rng.randint(1, 4)
    e = (c_ * x**p_) ** q_ * (k * x**s_)
    res = sp.expand(e)
    mid = f"{c_ ** q_} x^({p_ * q_}) dot {k} x^({s_})"
    tp = f"({c_} x^{p_})^{q_} dot {k} x^{s_}" if s_ > 1 else f"({c_} x^{p_})^{q_} dot {k} x"
    return {"solution": [tp, f"= {mid}", f"= {T(res)}"], "prompt": f"Simplify: ${tp}$.", "plain": f"Simplify: ({c_}x^{p_})^{q_} * {k}x^{s_}.", "key": E(res),
            "display": T(res), "verified": f"sympy: = {res}"}


@template("poly_mult.binomials", "poly_mult", requires=["exp_product", "f_distributive", "poly_addsub"], guess=0.02, work_lines=4,
          substeps=["multiply every term of the first by every term of the second", "combine like terms"],
          strategies={"foil": "FOIL", "distributive": "distributive property", "vertical": "vertical method", **OU})
def _(rng):
    a1, b1, a2, b2 = nz(rng, 1, 4), nz(rng, -8, 8), nz(rng, 1, 3), nz(rng, -8, 8)
    e = sp.Mul(a1 * x + b1, a2 * x + b2, evaluate=False)
    res = sp.expand((a1 * x + b1) * (a2 * x + b2))
    return {"prompt": f"Multiply: $({T(a1 * x + b1)}) ({T(a2 * x + b2)})$.", "plain": f"Multiply: ({P(a1 * x + b1)})({P(a2 * x + b2)}).",
            "key": E(res, "expanded"), "display": T(res), "verified": f"sympy: expand = {res}",
            "solution": [f"{T(a1 * a2 * x**2)} {signed(a1 * b2)} x {signed(b1 * a2)} x {signed(b1 * b2)}", T(res)]}


@template("poly_mult.trinomial", "poly_mult", requires=["exp_product", "f_distributive", "poly_addsub"], guess=0.02, work_lines=5,
          substeps=["multiply each term of the binomial by the trinomial", "combine like terms"],
          strategies={"distributive": "distributive property", "vertical": "vertical method", **OU})
def _(rng):
    b1 = nz(rng, -5, 5)
    tri = x**2 + nz(rng, -5, 5) * x + nz(rng, -6, 6)
    res = sp.expand((x + b1) * tri)
    return {"prompt": f"Multiply: $(x {signed(b1)}) ({T(tri)})$.", "plain": f"Multiply: (x {signed(b1)})({P(tri)}).",
            "key": E(res, "expanded"), "display": T(res), "verified": f"sympy: expand = {res}"}


@template("poly_special.square", "poly_special", requires=["poly_mult"], guess=0.02, work_lines=3,
          substeps=["square the first term", "twice the product of the terms", "square the last term"],
          strategies={"pattern": "binomial squares pattern", "foil": "FOIL", **OU})
def _(rng):
    a1, b1 = rng.randint(1, 5), nz(rng, -9, 9)
    form = rng.choice(["square", "conjugate"])
    if form == "square":
        res = sp.expand((a1 * x + b1) ** 2)
        tp, pl = f"({T(a1 * x + b1)})^2", f"({P(a1 * x + b1)})^2"
        steps = [tp, f"= ({T(a1 * x)})^2 + 2 ({T(a1 * x)}) ({b1}) + ({b1})^2", f"= {T(res)}"]
    else:
        res = sp.expand((a1 * x + abs(b1)) * (a1 * x - abs(b1)))
        tp, pl = f"({T(a1 * x + abs(b1))}) ({T(a1 * x - abs(b1))})", f"({P(a1 * x + abs(b1))})({P(a1 * x - abs(b1))})"
        steps = [tp, f"= ({T(a1 * x)})^2 - {abs(b1)}^2", f"= {T(res)}"]
    return {"solution": steps, "prompt": f"Multiply using a special products pattern: ${tp}$.", "plain": f"Multiply: {pl}.",
            "key": E(res, "expanded"), "display": T(res), "verified": f"sympy: expand = {res}"}


@template("exp_quotient.divide", "exp_quotient", requires=["exp_product", "f_frac_mul"], guess=0.02, work_lines=3,
          substeps=["divide the coefficients", "subtract exponents of the same base"],
          strategies={"quotient_property": "quotient property", **OU})
def _(rng):
    c1 = rng.choice([12, 18, 24, 30, 36, 42, 56])
    c2 = rng.choice([d for d in (2, 3, 4, 6, 7, 8) if c1 % d == 0])
    p_, q_ = rng.randint(5, 9), rng.randint(1, 4)
    s_, t_ = rng.randint(2, 6), rng.randint(1, 5)
    num = c1 * x**p_ * y**s_
    den = c2 * x**q_ * y**t_
    res = sp.simplify(num / den)
    check(s_ != t_, "the y powers differ")
    lines = [f"frac({T(num)}, {T(den)})", f"= frac({c1}, {c2}) dot x^({p_} - {q_}) dot y^({s_} - {t_})", f"= {T(res)}"]
    return {"solution": lines, "prompt": f"Simplify: $frac({T(num)}, {T(den)})$.", "plain": f"Simplify: ({P(num)})/({P(den)}).",
            "key": E(res, "positive_exponents"), "display": T(res), "verified": f"sympy: = {res}"}


@template("exp_quotient.zero", "exp_quotient", requires=["exp_product"], guess=0.05, work_lines=3,
          substeps=["any nonzero base to the zero power is 1", "watch what the exponent applies to"],
          strategies={"zero_exponent": "zero exponent rule", **OU})
def _(rng):
    c_ = rng.randint(2, 9)
    form = rng.choice(["coef", "paren"])
    if form == "coef":
        tp, val = f"{c_} x^0 + ({c_} x)^0", c_ + 1
    else:
        tp, val = f"-{c_}^0 + (-{c_})^0", 0
    return {"prompt": f"Simplify (assume $x != 0$): ${tp}$.", "plain": f"Simplify: {tp}.", "key": V(val), "display": T(val),
            "verified": f"zero-exponent rule: = {val}"}


@template("poly_divide.monomial", "poly_divide", requires=["exp_quotient", "poly_mult"], guess=0.02, work_lines=4,
          substeps=["divide every term of the numerator by the monomial", "simplify each quotient"],
          strategies={"term_by_term": "term by term", **OU})
def _(rng):
    k = rng.choice([2, 3, 4, 5, 6])
    q_ = rng.randint(1, 2)
    res = nz(rng, -5, 5) * x**3 + nz(rng, -6, 6) * x**2 + nz(rng, -7, 7) * x
    num = sp.expand(res * k * x**q_)
    out = sp.expand(num / (k * x**q_))
    check(out == res, "division")
    terms = sp.Add.make_args(num)
    lines = [" + ".join(f"frac({T(tm)}, {T(k * x**q_)})" for tm in terms).replace("+ -", "- "), f"= {T(res)}"]
    return {"solution": lines, "prompt": f"Divide: $frac({T(num)}, {T(k * x**q_)})$.", "plain": f"Divide: ({P(num)})/({P(k * x**q_)}).",
            "key": E(res, "polynomial"), "display": T(res), "verified": f"sympy: expand = {res}"}


@template("poly_divide.binomial", "poly_divide", requires=["exp_quotient", "poly_mult"], guess=0.02, work_lines=6,
          substeps=["divide the leading terms", "multiply and subtract", "bring down and repeat"],
          strategies={"long_division": "long division", "factor": "factor and cancel", **OU})
def _(rng):
    rr = nz(rng, -6, 6)
    quo = x**2 + nz(rng, -6, 6) * x + nz(rng, -8, 8)
    num = sp.expand(quo * (x + rr))
    q2, rem = sp.div(num, x + rr, x)
    check(rem == 0 and q2 == quo, "exact division")
    return {"prompt": f"Divide: $({T(num)}) div (x {signed(rr)})$.", "plain": f"Divide: ({P(num)})/(x {signed(rr)}).",
            "key": E(quo, "polynomial"), "display": T(quo), "verified": f"sympy: div = {quo}, remainder 0"}


@template("exp_negative.simplify", "exp_negative", requires=["exp_quotient"], guess=0.02, work_lines=4,
          substeps=["use the properties of exponents", "rewrite negative exponents as positive ones (a^(-n) = 1/a^n)"],
          strategies={"properties": "exponent properties", **OU})
def _(rng):
    p_, q_ = rng.randint(2, 6), rng.randint(3, 8)
    c_ = rng.choice([2, 3, 4, 5])
    form = rng.choice(["product", "quotient"])
    if form == "product":
        e = x ** (-p_) * x ** (p_ - q_)
        tp = f"x^(-{p_}) dot x^({p_ - q_})"
    else:
        e = c_ * x ** (-p_) / x ** (q_ - p_) if q_ != p_ else c_ * x ** (-p_)
        tp = f"frac({c_} x^(-{p_}), x^({q_ - p_}))"
    res = sp.powsimp(e)
    check(res.free_symbols and sp.degree(sp.fraction(sp.together(res))[1], x) > 0, "negative exponent result")
    if form == "product":
        neg_lines = [tp, f"= x^(-{p_} + ({p_ - q_}))", f"= x^({-q_})", f"= {T(res)}"]
    else:
        neg_lines = [tp, f"= {c_} x^(-{p_} - ({q_ - p_}))", f"= {c_} x^({-q_})", f"= {T(res)}"]
    return {"solution": neg_lines, "prompt": f"Simplify, and write with positive exponents only: ${tp}$.", "plain": f"Simplify with positive exponents: {tp}.",
            "key": E(res, "positive_exponents"), "display": T(res), "verified": f"sympy: powsimp = {res}"}


@template("sci_notation.convert", "sci_notation", requires=["exp_negative", "f_decimals"], guess=0.02, work_lines=2,
          substeps=["move the decimal point so the coefficient is between 1 and 10", "count the places for the power of ten"],
          strategies={"count_places": "count decimal places", **OU})
def _(rng):
    coef = sp.Rational(rng.randint(11, 99), 10)
    ex = rng.choice([-5, -4, -3, 3, 4, 5, 6, 7])
    val = coef * sp.Integer(10) ** ex
    dec = f"{float(val):.10f}".rstrip("0").rstrip(".") if ex < 0 else f"{int(val):,}".replace(",", "{,}")
    sci_lines = [f"\"move the decimal point {abs(ex)} places {'left' if ex > 0 else 'right'}\"",
                 f"{dec} = {float(coef):g} times 10^({ex})"]
    return {"solution": sci_lines, "prompt": f"Write in scientific notation: ${dec}$.", "plain": f"Write in scientific notation: {dec.replace('{,}', ',')}.",
            "key": V(val, "scientific"), "display": f"{float(coef):g} times 10^({ex})", "verified": f"sympy: {coef} * 10^{ex} = {val}"}


@template("sci_notation.multiply", "sci_notation", requires=["exp_negative", "f_decimals"], guess=0.02, work_lines=3,
          substeps=["multiply the coefficients", "add the exponents of 10", "adjust so the coefficient is between 1 and 10"],
          strategies={"group": "coefficients together, powers of ten together", **OU})
def _(rng):
    c1, c2 = rng.choice([2, 3, 4, 5, 6]), rng.choice([2, 3, 4, 1.5, 2.5])
    c2 = sp.nsimplify(c2)
    e1, e2 = rng.randint(-6, 6), rng.randint(-6, 6)
    val = c1 * c2 * sp.Integer(10) ** (e1 + e2)
    coef, ex = c1 * c2, e1 + e2
    while coef >= 10:
        coef, ex = coef / 10, ex + 1
    check(1 <= coef < 10 and coef * sp.Integer(10) ** ex == val, "normalized")
    return {"prompt": f"Multiply, and write the answer in scientific notation: $({c1} times 10^({e1})) ({float(c2):g} times 10^({e2}))$.",
            "plain": f"Multiply: ({c1} x 10^{e1})({float(c2):g} x 10^{e2}); scientific notation.",
            "key": V(val, "scientific"), "display": f"{float(coef):g} times 10^({ex})", "verified": f"sympy: = {val}"}


# ============================================================ Chapter 7: factoring

@template("fac_gcf.factor", "fac_gcf", requires=["poly_mult", "f_primes_lcm"], guess=0.02, work_lines=3,
          substeps=["find the GCF of the coefficients and of the variable parts", "divide each term by the GCF"],
          strategies={"gcf": "factor out the GCF", **OU})
def _(rng):
    g = rng.choice([2, 3, 4, 5, 6, 8])
    p_ = rng.randint(1, 2)
    inner = nz(rng, 1, 5) * x**2 + nz(rng, -7, 7) * x + nz(rng, -9, 9)
    check(sp.gcd_list([c for c in sp.Poly(inner, x).all_coeffs()]) == 1, "inner has no common factor")
    check(sp.Poly(inner, x).is_irreducible, "what is left after the GCF does not factor further")
    e = sp.expand(g * x**p_ * inner)
    fac = sp.factor(e)
    check(sp.expand(fac - e) == 0, "factor")
    gcf_lines = [f"\"GCF\" = {g} {T(x**p_)}", f"{T(e)} = {g} {T(x**p_)} ({T(inner)})"]
    return {"solution": gcf_lines, "prompt": f"Factor the greatest common factor: ${T(e)}$.", "plain": f"Factor the GCF: {P(e)}.",
            "key": E(g * x**p_ * inner, "factored_completely"), "display": f"{g} {T(x**p_)} ({T(inner)})",
            "verified": f"sympy: factor = {fac}"}


@template("fac_gcf.grouping", "fac_gcf", requires=["poly_mult"], guess=0.02, work_lines=4,
          substeps=["group the terms in pairs", "factor the GCF from each pair", "factor out the common binomial"],
          strategies={"grouping": "factor by grouping", **OU})
def _(rng):
    p_, q_ = nz(rng, -7, 7), nz(rng, -7, 7)
    e = sp.expand((x + p_) * (y + q_))
    fac = sp.factor(e)
    check(sp.expand(fac - e) == 0 and len(sp.Mul.make_args(fac)) == 2, "two factors")
    tp = f"x y {signed(q_)} x {signed(p_)} y {signed(p_ * q_)}"
    return {"prompt": f"Factor by grouping: ${tp}$.", "plain": f"Factor by grouping: xy {signed(q_)}x {signed(p_)}y {signed(p_ * q_)}.",
            "key": E(fac, "factored_completely"), "display": T(fac), "verified": f"sympy: factor = {fac}"}


@template("fac_trinomial.monic", "fac_trinomial", requires=["fac_gcf"], guess=0.02, work_lines=3,
          substeps=["find two numbers whose product is c and whose sum is b", "write the two binomial factors"],
          strategies={"product_sum": "product c, sum b", "quadratic_formula": "quadratic formula", **OU})
def _(rng):
    r1, r2 = rng.sample([v_ for v_ in range(-9, 10) if v_ != 0], 2)
    p_ = sp.expand((x - r1) * (x - r2))
    fac = sp.factor(p_)
    check(sp.expand(fac - p_) == 0 and len(sp.Mul.make_args(fac)) == 2, "two factors")
    return {"prompt": f"Factor: ${T(p_)}$.", "plain": f"Factor: {P(p_)}.", "key": E(fac, "factored_completely"), "display": T(fac),
            "verified": f"sympy: factor = {fac}",
            "solution": [f"{-r1 * 1} dot {-r2} = {r1 * r2}, quad {-r1} + ({-r2}) = {-(r1 + r2)}", T(fac)]}


@template("fac_trinomial_a.ac", "fac_trinomial_a", requires=["fac_trinomial"], guess=0.02, work_lines=5,
          substeps=["find the product ac", "find two numbers with product ac and sum b", "split the middle term and factor by grouping"],
          strategies={"ac_method": "ac method", "trial_error": "trial and error", **OU})
def _(rng):
    a1, a2 = rng.choice([(2, 1), (3, 1), (2, 3), (5, 1), (3, 2), (4, 1), (2, 5)])
    b1, b2 = nz(rng, -7, 7), nz(rng, -7, 7)
    check(sp.igcd(a1, b1) == 1 and sp.igcd(a2, b2) == 1, "primitive factors")
    p_ = sp.expand((a1 * x + b1) * (a2 * x + b2))
    fac = sp.factor(p_)
    check(sp.Poly(p_, x).LC() > 1 and sp.expand(fac - p_) == 0, "leading coefficient > 1")
    A_, B_, C_ = sp.Poly(p_, x).all_coeffs()
    m1, m2 = a1 * b2, a2 * b1
    lines = [f"a c = {A_} dot {C_} = {A_ * C_}, quad {m1} dot {m2} = {m1 * m2}, quad {m1} + {m2} = {B_}",
             f"{T(A_ * x**2)} {signed(m1)} x {signed(m2)} x {signed(C_)}", T(fac)]
    check(m1 * m2 == A_ * C_ and m1 + m2 == B_, "ac split")
    return {"solution": lines, "prompt": f"Factor completely: ${T(p_)}$.", "plain": f"Factor completely: {P(p_)}.", "key": E(fac, "factored_completely"),
            "display": T(fac), "verified": f"sympy: factor = {fac}"}


@template("fac_special.patterns", "fac_special", requires=["fac_trinomial", "poly_special"], guess=0.02, work_lines=3,
          substeps=["recognize the pattern", "write the factors from the pattern"],
          strategies={"pattern": "special product pattern", **OU})
def _(rng):
    form = rng.choice(["diff_squares", "perfect_square", "cubes"])
    a1, b1 = rng.randint(1, 5), rng.randint(1, 9)
    if form == "diff_squares":
        p_ = sp.expand((a1 * x) ** 2 - b1**2)
    elif form == "perfect_square":
        p_ = sp.expand((a1 * x + rng.choice([1, -1]) * b1) ** 2)
    else:
        b1 = rng.randint(1, 5)
        p_ = x**3 + rng.choice([1, -1]) * b1**3
    fac = sp.factor(p_)
    check(sp.expand(fac - p_) == 0 and fac != p_, "factors")
    pat = {"diff_squares": "a^2 - b^2 = (a - b)(a + b)", "perfect_square": "a^2 plus.minus 2 a b + b^2 = (a plus.minus b)^2",
           "cubes": "a^3 plus.minus b^3 = (a plus.minus b)(a^2 minus.plus a b + b^2)"}[form]
    sp_lines = [f"{pat}", f"{T(p_)} = {T(fac)}"]
    return {"solution": sp_lines, "prompt": f"Factor completely: ${T(p_)}$.", "plain": f"Factor completely: {P(p_)}.", "key": E(fac, "factored_completely"),
            "display": T(fac), "verified": f"sympy: factor = {fac}"}


@template("fac_general.completely", "fac_general", requires=["fac_trinomial_a", "fac_special"], guess=0.02, work_lines=4,
          substeps=["factor out the GCF first", "factor what remains by its form", "check that no factor can be factored further"],
          strategies={"general_strategy": "GCF first, then by number of terms", **OU})
def _(rng):
    g = rng.choice([2, 3, 4, 5])
    form = rng.choice(["trinomial", "diff_squares"])
    if form == "trinomial":
        r1, r2 = rng.sample([v_ for v_ in range(-6, 7) if v_ != 0], 2)
        inner = (x - r1) * (x - r2)
    else:
        b1 = rng.randint(1, 7)
        inner = (x - b1) * (x + b1)
    p_ = sp.expand(g * x * inner)
    fac = sp.factor(p_)
    check(sp.expand(fac - p_) == 0 and len([f_ for f_ in sp.Mul.make_args(fac) if f_.free_symbols]) == 3, "three factors")
    gen_lines = [f"{T(p_)} = {g} x ({T(sp.expand(inner))})", f"= {T(fac)}"]
    return {"solution": gen_lines, "prompt": f"Factor completely: ${T(p_)}$.", "plain": f"Factor completely: {P(p_)}.", "key": E(fac, "factored_completely"),
            "display": T(fac), "verified": f"sympy: factor = {fac}"}


@template("quad_factor.solve", "quad_factor", requires=["fac_trinomial", "lin_one_step"], guess=0.02, work_lines=5,
          substeps=["write the equation in standard form (= 0)", "factor", "set each factor equal to zero and solve"],
          strategies={"factor_zero_product": "factor, then zero product property", "quadratic_formula": "quadratic formula", **OU})
def _(rng):
    r1, r2 = rng.sample([v_ for v_ in range(-8, 9) if v_ != 0], 2)
    k = rng.randint(-10, 10)
    lhs = sp.expand((x - r1) * (x - r2)) + k
    sols = sp.solve(sp.Eq(lhs, k), x)
    check(set(sols) == {r1, r2}, "roots")
    std = sp.expand((x - r1) * (x - r2))
    lines = [f"{T(lhs)} = {k}", f"{T(std)} = 0", f"({T(x - r1)}) ({T(x - r2)}) = 0", f"x = {r1} quad \"or\" quad x = {r2}"]
    return {"solution": lines, "prompt": f"Solve: ${T(lhs)} = {k}$.", "plain": f"Solve: {P(lhs)} = {k}.",
            "key": {"kind": "set", "value": [str(r1), str(r2)]}, "display": f"x = {r1}, x = {r2}", "verified": f"sympy: solve = {sols}"}


# ============================================================ Chapter 8: rational expressions

@template("rat_simplify.cancel", "rat_simplify", requires=["fac_trinomial", "f_frac_mul"], guess=0.02, work_lines=4,
          substeps=["factor the numerator and the denominator", "remove the common factors"],
          strategies={"factor_cancel": "factor, then remove common factors", **OU})
def _(rng):
    r1, r2, r3 = rng.sample([v_ for v_ in range(-7, 8) if v_ != 0], 3)
    num = sp.expand((x - r1) * (x - r2))
    den = sp.expand((x - r1) * (x - r3))
    res = sp.cancel(num / den)
    check(sp.simplify(res - (x - r2) / (x - r3)) == 0, "cancel")
    lines = [f"frac({T(num)}, {T(den)})", f"= frac(({T(x - r1)}) ({T(x - r2)}), ({T(x - r1)}) ({T(x - r3)}))", f"= frac({T(x - r2)}, {T(x - r3)})"]
    return {"solution": lines, "prompt": f"Simplify: $frac({T(num)}, {T(den)})$.", "plain": f"Simplify: ({P(num)})/({P(den)}).",
            "key": E((x - r2) / (x - r3)), "display": f"frac({T(x - r2)}, {T(x - r3)})", "verified": f"sympy: cancel = {res}"}


@template("rat_simplify.undefined", "rat_simplify", requires=["fac_trinomial"], guess=0.02, work_lines=3,
          substeps=["set the denominator equal to zero", "solve"],
          strategies={"denominator_zero": "denominator = 0", **OU})
def _(rng):
    r1, r2 = rng.sample([v_ for v_ in range(-7, 8) if v_ != 0], 2)
    den = sp.expand((x - r1) * (x - r2))
    num = x + nz(rng, -9, 9)
    check(num.subs(x, r1) != 0 and num.subs(x, r2) != 0, "no removable point")
    return {"prompt": f"Find the values of $x$ for which $frac({T(num)}, {T(den)})$ is undefined.",
            "plain": f"Where is ({P(num)})/({P(den)}) undefined?",
            "key": {"kind": "set", "value": [str(r1), str(r2)]}, "display": f"x = {r1}, x = {r2}",
            "verified": f"sympy: solve(den) = {sp.solve(den, x)}"}


@template("rat_muldiv.divide", "rat_muldiv", requires=["rat_simplify"], guess=0.02, work_lines=5,
          substeps=["rewrite as multiplication by the reciprocal", "factor everything", "remove common factors"],
          strategies={"reciprocal": "multiply by the reciprocal", **OU})
def _(rng):
    r1, r2, r3 = rng.sample([v_ for v_ in range(-6, 7) if v_ != 0], 3)
    k = rng.choice([2, 3, 4, 5])
    A_ = sp.expand((x - r1) * (x - r2)) / (k * x)
    B_ = (x - r1) / (k * k * x**2)
    res = sp.simplify(A_ / B_)
    check(sp.simplify(res - k * x * (x - r2)) == 0, "result")
    md_lines = [f"frac(({T(x - r1)}) ({T(x - r2)}), {k} x) dot frac({k * k} x^2, {T(x - r1)})", f"= {k} x ({T(x - r2)})"]
    return {"solution": md_lines, "prompt": f"Divide and simplify: $frac({T(sp.expand((x - r1) * (x - r2)))}, {k} x) div frac({T(x - r1)}, {k * k} x^2)$.",
            "plain": f"Divide: ({P(sp.expand((x - r1) * (x - r2)))})/({k}x) / (({P(x - r1)})/({k * k}x^2)).",
            "key": E(k * x * (x - r2)), "display": T(sp.factor(res)), "verified": f"sympy: simplify = {res}"}


@template("rat_add_common.subtract", "rat_add_common", requires=["rat_simplify", "poly_addsub"], guess=0.02, work_lines=4,
          substeps=["subtract the numerators, distributing the minus sign", "keep the common denominator", "simplify"],
          strategies={"combine_numerators": "combine numerators over the common denominator", **OU})
def _(rng):
    rr = nz(rng, -6, 6)
    q_ = nz(rng, -6, 6)
    n1 = x**2 + q_ * x
    n2 = rr * x + q_ * rr
    res = sp.cancel((n1 - n2) / (x - rr))
    check(sp.simplify(res - (x + q_)) == 0, "result")
    ac_lines = [f"frac({T(n1)} - ({T(n2)}), x {signed(-rr)})", f"= frac({T(sp.expand(n1 - n2))}, x {signed(-rr)})",
                f"= frac(({T(x - rr)}) ({T(x + q_)}), x {signed(-rr)})", f"= {T(x + q_)}"]
    return {"solution": ac_lines, "prompt": f"Subtract and simplify: $frac({T(n1)}, x {signed(-rr)}) - frac({T(n2)}, x {signed(-rr)})$.",
            "plain": f"Subtract: ({P(n1)})/(x {signed(-rr)}) - ({P(n2)})/(x {signed(-rr)}).",
            "key": E(x + q_), "display": T(x + q_), "verified": f"sympy: cancel = {res}"}


@template("rat_add_unlike.add", "rat_add_unlike", requires=["rat_add_common", "f_frac_add"], guess=0.02, work_lines=5,
          substeps=["find the LCD", "rewrite each expression over the LCD", "add the numerators and simplify"],
          strategies={"lcd": "least common denominator", **OU})
def _(rng):
    p_, q_ = rng.sample([v_ for v_ in range(-6, 7) if v_ != 0], 2)
    c1, c2 = nz(rng, 1, 5), nz(rng, -5, 5)
    e = c1 / (x - p_) + c2 / (x - q_)
    res = sp.together(e)
    num, den = sp.fraction(sp.factor(res))
    check(sp.simplify(res - e) == 0, "sum")
    lines = [f"frac({c1}, {T(x - p_)}) + frac({c2}, {T(x - q_)})",
             f"= frac({c1} ({T(x - q_)}), ({T(x - p_)}) ({T(x - q_)})) + frac({c2} ({T(x - p_)}), ({T(x - p_)}) ({T(x - q_)}))",
             f"= frac({T(sp.expand(num))}, {T(den)})"]
    return {"solution": lines, "prompt": f"Add and simplify: $frac({c1}, {T(x - p_)}) + frac({c2}, {T(x - q_)})$.",
            "plain": f"Add: {c1}/({P(x - p_)}) + {c2}/({P(x - q_)}).",
            "key": E(res), "display": f"frac({T(sp.expand(num))}, {T(den)})", "verified": f"sympy: together = {res}"}


@template("rat_complex.simplify", "rat_complex", requires=["rat_add_unlike", "rat_muldiv"], guess=0.02, work_lines=5,
          substeps=["multiply the numerator and denominator by the LCD of all the fractions", "simplify"],
          strategies={"lcd": "multiply by the LCD", "division": "rewrite as division", **OU})
def _(rng):
    k = rng.choice([2, 3, 4, 5])
    num = 1 + sp.Integer(k) / x
    den = 1 - sp.Integer(k * k) / x**2
    res = sp.cancel(num / den)
    check(sp.simplify(res - x / (x - k)) == 0, "result")
    cx_lines = [f"frac(x^2 (1 + frac({k}, x)), x^2 (1 - frac({k * k}, x^2)))", f"= frac(x^2 + {k} x, x^2 - {k * k})",
                f"= frac(x (x + {k}), (x - {k}) (x + {k}))", f"= frac(x, x - {k})"]
    return {"solution": cx_lines, "prompt": f"Simplify: $frac(1 + frac({k}, x), 1 - frac({k * k}, x^2))$.", "plain": f"Simplify: (1 + {k}/x)/(1 - {k * k}/x^2).",
            "key": E(x / (x - k)), "display": f"frac(x, x - {k})", "verified": f"sympy: cancel = {res}"}


@template("rat_equations.solve", "rat_equations", requires=["rat_add_unlike", "quad_factor"], guess=0.02, work_lines=6,
          substeps=["note the values that make a denominator zero", "multiply both sides by the LCD", "solve, and discard any excluded value"],
          strategies={"clear_lcd": "clear denominators with the LCD", **OU})
def _(rng):
    sol = nz(rng, -8, 8)
    k = nz(rng, 2, 6)
    c_ = sp.Rational(k, sol) + 1 if sol != 0 else None
    check(c_ is not None, "nonzero")
    eq = sp.Eq(sp.Integer(k) / x + 1, c_)
    sols = sp.solve(eq, x)
    check(sols == [sol], "solve")
    lines = [f"frac({k}, x) + 1 = {T(c_)} quad (x != 0)", f"{k} + x = {T(c_)} x", f"{k} = {T(c_ - 1)} x", f"x = {sol}"]
    check(sp.solve(sp.Eq(k, (c_ - 1) * x), x) == [sol], "steps")
    return {"solution": lines, "prompt": f"Solve: $frac({k}, x) + 1 = {T(c_)}$.", "plain": f"Solve: {k}/x + 1 = {c_}.", "key": V(sol),
            "display": f"x = {sol}", "verified": f"sympy: solve = {sols}"}


@template("rat_proportion.solve", "rat_proportion", requires=["lin_fractions"], guess=0.02, work_lines=4,
          substeps=["cross multiply (or multiply both sides by the LCD)", "solve"],
          strategies={"cross_multiply": "cross multiply", "scale": "scale factor", **OU})
def _(rng):
    a_, b_ = rng.sample(range(2, 13), 2)
    kk = rng.randint(2, 6)
    form = rng.choice(["plain", "shadow"])
    if form == "plain":
        sol = _solve_one(sp.Eq(x / (a_ * kk), sp.Rational(b_, a_)))
        check(sol == b_ * kk, "proportion")
        return {"solution": [f"{a_} x = {b_} dot {a_ * kk}", f"{a_} x = {a_ * b_ * kk}", f"x = {sol}"], "prompt": f"Solve the proportion: $frac(x, {a_ * kk}) = frac({b_}, {a_})$.",
                "plain": f"Solve: x/{a_ * kk} = {b_}/{a_}.", "key": V(sol), "display": f"x = {sol}", "verified": f"sympy: solve = {sol}"}
    h_ = a_ * kk
    s_ = b_
    tree_shadow = b_ * kk
    q = (f"A {a_}-foot pole casts a {b_}-foot shadow. At the same time, a tree casts a {tree_shadow}-foot shadow. "
         f"How tall is the tree?")
    sol = sp.solve(sp.Eq(x / tree_shadow, sp.Rational(a_, s_)), x)[0]
    check(sol == h_, "similar triangles")
    return {"solution": [f"frac(x, {tree_shadow}) = frac({a_}, {s_})", f"{s_} x = {a_ * tree_shadow}", f"x = {sol}"], "prompt": q, "plain": q, "key": V(sol), "display": f"{sol} \"feet\"", "verified": f"sympy: x/{tree_shadow} = {a_}/{s_} -> {sol}"}


@template("rat_work.together", "rat_work", requires=["rat_equations", "app_motion"], guess=0.02, work_lines=5,
          substeps=["write each worker's rate as 1/(time)", "add the rates and set equal to 1/t", "solve"],
          strategies={"rates": "add rates", **OU})
def _(rng):
    t1, t2 = rng.choice([(2, 3), (3, 6), (4, 12), (6, 3), (10, 15), (4, 6), (12, 6), (2, 6)])
    tt = sp.Rational(t1 * t2, t1 + t2)
    work_lines = [f"frac(1, {t1}) + frac(1, {t2}) = frac(1, t)", f"\"multiply by\" {sp.ilcm(t1, t2)} t: quad {sp.ilcm(t1, t2) // t1} t + {sp.ilcm(t1, t2) // t2} t = {sp.ilcm(t1, t2)}",
                  f"t = {T(tt)}"]
    q = (f"One pump can empty a pool in {t1} hours; a second pump can empty it in {t2} hours. "
         f"How many hours will it take the two pumps working together?")
    check(sp.solve(sp.Eq(sp.Rational(1, t1) + sp.Rational(1, t2), 1 / t), t) == [tt], "solve")
    return {"solution": work_lines, "prompt": q, "plain": q, "key": V(tt), "display": f"{T(tt)} \"hours\"", "verified": f"sympy: 1/{t1} + 1/{t2} = 1/t -> {tt}"}


@template("variation.solve", "variation", requires=["rat_proportion"], guess=0.02, work_lines=4,
          substeps=["write the variation equation", "find k from the given values", "use k to find the unknown"],
          strategies={"find_k": "find the constant of variation", "proportion": "proportion", **OU})
def _(rng):
    kind = rng.choice(["direct", "inverse"])
    kk = rng.randint(2, 9)
    x1, x2 = rng.sample([1, 2, 3, 4, 5, 6, 8, 10, 12], 2)
    if kind == "direct":
        y1, y2 = kk * x1, kk * x2
    else:
        y1, y2 = sp.Rational(kk * 12, x1), sp.Rational(kk * 12, x2)
    q = (f"$y$ varies {'directly' if kind == 'direct' else 'inversely'} with $x$. When $x = {x1}$, $y = {T(y1)}$. "
         f"Find $y$ when $x = {x2}$.")
    check((y2 / x2 == y1 / x1) if kind == "direct" else (y2 * x2 == y1 * x1), "variation")
    if kind == "direct":
        lines = [f"y = k x", f"{T(y1)} = k ({x1}) quad arrow.r quad k = {T(y1 / x1)}", f"y = {T(y1 / x1)} ({x2}) = {T(y2)}"]
    else:
        lines = [f"y = frac(k, x)", f"{T(y1)} = frac(k, {x1}) quad arrow.r quad k = {T(y1 * x1)}", f"y = frac({T(y1 * x1)}, {x2}) = {T(y2)}"]
    return {"solution": lines, "prompt": q, "plain": q.replace("$", ""), "key": V(y2), "display": f"y = {T(y2)}", "verified": f"{kind}: y = {y2}"}


# ============================================================ Chapter 9: roots and radicals

@template("rad_sqrt.variables", "rad_sqrt", requires=["f_sqrt", "exp_product"], guess=0.02, work_lines=3,
          substeps=["take the square root of the coefficient", "halve each even exponent"],
          strategies={"halve_exponents": "halve the exponents", **OU})
def _(rng):
    c_ = rng.choice([4, 9, 16, 25, 36, 49, 64, 81])
    p_, q_ = 2 * rng.randint(1, 5), 2 * rng.randint(1, 4)
    xx, yy = sp.symbols("x y", positive=True)
    res = sp.sqrt(c_ * xx**p_ * yy**q_)
    out = sp.sqrt(c_) * x ** (p_ // 2) * y ** (q_ // 2)
    check(sp.simplify(res - out.subs({x: xx, y: yy})) == 0, "sqrt")
    rs_lines = [f"sqrt({c_}) dot sqrt(x^({p_})) dot sqrt(y^({q_}))", f"= {T(sp.sqrt(c_))} x^({p_ // 2}) y^({q_ // 2})"]
    return {"solution": rs_lines, "prompt": f"Simplify (assume $x, y >= 0$): $sqrt({c_} x^({p_}) y^({q_}))$.", "plain": f"Simplify: sqrt({c_}x^{p_}y^{q_}).",
            "key": E(out), "display": T(out), "verified": f"sympy: = {out}"}


@template("rad_simplify.product", "rad_simplify", requires=["rad_sqrt", "f_primes_lcm"], guess=0.02, work_lines=3,
          substeps=["write the radicand as the largest perfect square times a factor", "take the square root of the perfect square"],
          strategies={"largest_square": "largest perfect-square factor", "prime_factors": "prime factorization", **OU})
def _(rng):
    sq = rng.choice([4, 9, 16, 25, 36, 49])
    free = rng.choice([2, 3, 5, 6, 7, 10, 11])
    N = sq * free
    val = sp.sqrt(N)
    check(val == sp.sqrt(sq) * sp.sqrt(free), "simplify")
    return {"prompt": f"Simplify: $sqrt({N})$.", "plain": f"Simplify: sqrt({N}).", "key": V(val, "simplified_radical"),
            "display": T(val), "verified": f"sympy: sqrt({N}) = {val}",
            "solution": [f"sqrt({N}) = sqrt({sq} dot {free})", f"= sqrt({sq}) dot sqrt({free})", f"= {T(val)}"]}


@template("rad_addsub.combine", "rad_addsub", requires=["rad_simplify", "f_like_terms"], guess=0.02, work_lines=4,
          substeps=["simplify each radical", "combine like radicals by adding their coefficients"],
          strategies={"simplify_first": "simplify, then combine", **OU})
def _(rng):
    free = rng.choice([2, 3, 5, 6, 7])
    s1, s2 = rng.sample([1, 4, 9, 16, 25], 2)
    c1, c2 = nz(rng, 1, 6), nz(rng, -6, 6)
    tp = f"{c1} sqrt({s1 * free}) {'+' if c2 > 0 else '-'} {abs(c2)} sqrt({s2 * free})"
    val = c1 * sp.sqrt(s1 * free) + c2 * sp.sqrt(s2 * free)
    check(val != 0, "nonzero")
    r1_, r2_ = sp.sqrt(s1), sp.sqrt(s2)
    lines = [tp, f"= {c1} dot {r1_} sqrt({free}) {'+' if c2 > 0 else '-'} {abs(c2)} dot {r2_} sqrt({free})", f"= {T(val)}"]
    return {"solution": lines, "prompt": f"Simplify: ${tp}$.", "plain": f"Simplify: {c1}sqrt({s1 * free}) {'+' if c2 > 0 else '-'} {abs(c2)}sqrt({s2 * free}).",
            "key": V(val, "simplified_radical"), "display": T(val), "verified": f"sympy: = {val}"}


@template("rad_mult.binomial", "rad_mult", requires=["rad_simplify", "poly_mult"], guess=0.02, work_lines=4,
          substeps=["distribute (or FOIL)", "multiply the radicals and simplify", "combine like terms"],
          strategies={"foil": "FOIL / distribute", **OU})
def _(rng):
    free = rng.choice([2, 3, 5, 7])
    a1, b1, c1 = nz(rng, 1, 5), nz(rng, -6, 6), nz(rng, -6, 6)
    e = (a1 + b1 * sp.sqrt(free)) * (2 + c1 * sp.sqrt(free))
    val = sp.expand(e)
    lines = [f"= {2 * a1} {signed(a1 * c1)} sqrt({free}) {signed(2 * b1)} sqrt({free}) {signed(b1 * c1)} dot {free}", f"= {T(val)}"]
    check(sp.expand(2 * a1 + a1 * c1 * sp.sqrt(free) + 2 * b1 * sp.sqrt(free) + b1 * c1 * free - val) == 0, "steps")
    return {"solution": lines, "prompt": f"Multiply and simplify: $({a1} {'+' if b1 > 0 else '-'} {abs(b1)} sqrt({free})) (2 {'+' if c1 > 0 else '-'} {abs(c1)} sqrt({free}))$.",
            "plain": f"Multiply: ({a1} {'+' if b1 > 0 else '-'} {abs(b1)}sqrt({free}))(2 {'+' if c1 > 0 else '-'} {abs(c1)}sqrt({free})).",
            "key": V(val, "simplified_radical"), "display": T(val), "verified": f"sympy: expand = {val}"}


@template("rad_divide.rationalize", "rad_divide", requires=["rad_mult", "poly_special"], guess=0.02, work_lines=4,
          substeps=["multiply numerator and denominator by the radical (or the conjugate)", "simplify"],
          strategies={"rationalize": "rationalize the denominator", **OU})
def _(rng):
    form = rng.choice(["one", "two"])
    free = rng.choice([2, 3, 5, 6, 7])
    if form == "one":
        k = rng.randint(1, 9) * free
        e = sp.Integer(k) / sp.sqrt(free)
        tp = f"frac({k}, sqrt({free}))"
    else:
        a1 = rng.randint(1, 4)
        c_ = (a1 * a1 - free) * nz(rng, -3, 3)
        check(a1 * a1 != free, "nonzero denominator")
        e = sp.Integer(c_) / (a1 + sp.sqrt(free))
        tp = f"frac({c_}, {a1} + sqrt({free}))"
    val = sp.radsimp(e)
    check(sp.simplify(val - e) == 0, "equal")
    if form == "one":
        lines = [f"{tp} dot frac(sqrt({free}), sqrt({free}))", f"= frac({k} sqrt({free}), {free})", f"= {T(val)}"]
    else:
        lines = [f"{tp} dot frac({a1} - sqrt({free}), {a1} - sqrt({free}))", f"= frac({c_} ({a1} - sqrt({free})), {a1 * a1 - free})", f"= {T(val)}"]
    return {"solution": lines, "prompt": f"Simplify by rationalizing the denominator: ${tp}$.", "plain": f"Rationalize: {tp.replace('frac(', '(').replace(', ', ')/(')}.",
            "key": V(val, "simplified_radical"), "display": T(val), "verified": f"sympy: radsimp = {val}"}


@template("rad_equations.solve", "rad_equations", requires=["rad_sqrt", "quad_factor"], guess=0.02, work_lines=5,
          substeps=["isolate the radical", "square both sides", "solve and check for extraneous solutions"],
          strategies={"isolate_square": "isolate, square, check", **OU})
def _(rng):
    sol = rng.randint(1, 20)
    k = rng.randint(1, 9)
    c_ = rng.randint(1, 6)
    inside = 2 * sol + k
    rhs = sp.sqrt(inside) + c_
    check(sp.sqrt(inside).is_Integer, "perfect square")
    eq = sp.Eq(sp.sqrt(2 * x + k) + c_, rhs)
    sols = [s_ for s_ in sp.solve(eq, x)]
    check(sols == [sol], "solve")
    rv = rhs - c_
    lines = [f"sqrt(2 x + {k}) = {T(rv)}", f"2 x + {k} = {T(rv ** 2)}", f"2 x = {T(rv ** 2 - k)}", f"x = {sol} quad \"(check: \" sqrt({2 * sol + k}) + {c_} = {T(rhs)} \")\""]
    return {"solution": lines, "prompt": f"Solve: $sqrt(2 x + {k}) + {c_} = {rhs}$.", "plain": f"Solve: sqrt(2x + {k}) + {c_} = {rhs}.",
            "key": V(sol), "display": f"x = {sol}", "verified": f"sympy: solve = {sols}"}


@template("rad_higher.simplify", "rad_higher", requires=["rad_simplify"], guess=0.02, work_lines=3,
          substeps=["find the largest perfect n-th power factor", "take its n-th root"],
          strategies={"perfect_power": "largest perfect power", **OU})
def _(rng):
    form = rng.choice(["cube", "cube_neg", "fourth"])
    if form == "cube":
        base, free = rng.choice([2, 3, 4]), rng.choice([2, 3, 5])
        check(base != free, "distinct")
        N, tp = base**3 * free, f"root(3, {base**3 * free})"
        val = base * sp.cbrt(free)
    elif form == "cube_neg":
        base = rng.randint(2, 6)
        N, tp, val = -base**3, f"root(3, -{base**3})", -base
    else:
        base = rng.randint(2, 4)
        N, tp, val = base**4, f"root(4, {base**4})", base
    real = sp.real_root(N, 3) if form != "fourth" else sp.root(N, 4)
    check(sp.simplify(real - val) == 0, "root")
    if form == "cube":
        hr_lines = [f"root(3, {N}) = root(3, {base ** 3} dot {free})", f"= root(3, {base ** 3}) dot root(3, {free})", f"= {T(val)}"]
    elif form == "cube_neg":
        hr_lines = [f"({-base})^3 = {N}", f"root(3, {N}) = {val}"]
    else:
        hr_lines = [f"{base}^4 = {N}", f"root(4, {N}) = {val}"]
    return {"solution": hr_lines, "prompt": f"Simplify: ${tp}$.", "plain": f"Simplify: {tp}.", "key": V(val), "display": T(val), "verified": f"sympy: = {val}"}


@template("rat_exponents.evaluate", "rat_exponents", requires=["rad_higher", "exp_negative"], guess=0.02, work_lines=3,
          substeps=["the denominator of the exponent is the root", "the numerator is the power", "take the root first"],
          strategies={"root_then_power": "root first, then the power", **OU})
def _(rng):
    base, rt = rng.choice([(8, 3), (27, 3), (16, 4), (32, 5), (25, 2), (64, 3), (81, 4), (36, 2)])
    pw = rng.choice([1, 2, 3])
    sgn = rng.choice([1, -1])
    ex = sp.Rational(sgn * pw, rt)
    val = sp.Integer(base) ** ex
    check(val.is_Rational, "exact")
    rootv = sp.Integer(base) ** sp.Rational(1, rt)
    check(rootv.is_Integer, "exact root")
    re_lines = [f"{base}^({T(ex)}) = " + (f"frac(1, {base}^({T(-ex)}))" if sgn < 0 else f"(root({rt}, {base}))^({pw})"),
                f"= " + (f"frac(1, ({rootv})^({pw}))" if sgn < 0 else f"({rootv})^({pw})"), f"= {T(val)}"]
    return {"solution": re_lines, "prompt": f"Simplify: ${base}^({T(ex)})$.", "plain": f"Simplify: {base}^({ex}).", "key": V(val), "display": T(val),
            "verified": f"sympy: {base}**({ex}) = {val}"}


# ============================================================ Chapter 10: quadratics

@template("quad_sqrt_prop.solve", "quad_sqrt_prop", requires=["rad_simplify", "lin_one_step"], guess=0.02, work_lines=4,
          substeps=["isolate the squared expression", "take the square root of both sides (plus or minus)", "solve for x"],
          strategies={"square_root_property": "square root property", "factor": "factoring", **OU})
def _(rng):
    hh = nz(rng, -6, 6)
    kk = rng.choice([4, 9, 16, 25, 36, 8, 12, 18, 20])
    c_ = rng.choice([1, 2, 3])
    sols = sp.solve(sp.Eq(c_ * (x - hh) ** 2, c_ * kk), x)
    want = {hh + sp.sqrt(kk), hh - sp.sqrt(kk)}
    check(set(sols) == want, "solve")
    lines = [f"(x {signed(-hh)})^2 = {kk}", f"x {signed(-hh)} = plus.minus sqrt({kk})", f"x = {hh} plus.minus {T(sp.sqrt(kk))}"]
    tp = f"{c_ if c_ > 1 else ''} (x {signed(-hh)})^2 = {c_ * kk}"
    return {"solution": lines, "prompt": f"Solve using the Square Root Property: ${tp}$.", "plain": f"Solve: {c_}(x {signed(-hh)})^2 = {c_ * kk}.",
            "key": {"kind": "set", "value": [str(s_) for s_ in sols]}, "display": ", ".join(T(s_) for s_ in sols),
            "verified": f"sympy: solve = {sols}"}


@template("quad_complete.term", "quad_complete", requires=["quad_sqrt_prop", "poly_special"], guess=0.02, work_lines=4,
          substeps=["take half of the coefficient of x", "square it and add to both sides", "factor the perfect square and use the Square Root Property"],
          strategies={"complete_square": "complete the square", "quadratic_formula": "quadratic formula", **OU})
def _(rng):
    hh = nz(rng, -5, 5)
    kk = rng.choice([1, 4, 9, 16, 25, 2, 3, 5, 7])
    bb = -2 * hh
    cc = hh * hh - kk
    sols = sp.solve(x**2 + bb * x + cc, x)
    check(set(sols) == {hh + sp.sqrt(kk), hh - sp.sqrt(kk)}, "solve")
    lines = [f"{T(x**2 + bb * x)} + ({T(sp.Rational(bb, 2))})^2 = {-cc} + ({T(sp.Rational(bb, 2))})^2",
             f"(x {signed(-hh)})^2 = {kk}", f"x {signed(-hh)} = plus.minus sqrt({kk})", f"x = {hh} plus.minus {T(sp.sqrt(kk))}"]
    check(-cc + hh * hh == kk, "steps")
    return {"solution": lines, "prompt": f"Solve by completing the square: ${T(x**2 + bb * x)} = {-cc}$.", "plain": f"Complete the square: {P(x**2 + bb * x)} = {-cc}.",
            "key": {"kind": "set", "value": [str(s_) for s_ in sols]}, "display": ", ".join(T(s_) for s_ in sols),
            "verified": f"sympy: solve = {sols}"}


@template("quad_formula.solve", "quad_formula", requires=["quad_sqrt_prop", "rad_simplify"], guess=0.02, work_lines=6,
          substeps=["identify a, b and c", "substitute into the quadratic formula", "simplify the discriminant and the radical"],
          strategies={"quadratic_formula": "quadratic formula", "complete_square": "complete the square", **OU})
def _(rng):
    while True:
        a_, b_, c_ = rng.choice([1, 1, 2, 3]), rng.randint(-7, 7), rng.randint(-8, 8)
        disc = b_ * b_ - 4 * a_ * c_
        if disc > 0 and not sp.sqrt(disc).is_Integer and c_ != 0:
            break
    sols = sp.solve(a_ * x**2 + b_ * x + c_, x)
    check(len(sols) == 2, "two roots")
    lines = [f"a = {a_}, quad b = {b_}, quad c = {c_}", f"x = frac(-({b_}) plus.minus sqrt(({b_})^2 - 4 ({a_}) ({c_})), 2 ({a_}))",
             f"x = frac({-b_} plus.minus sqrt({disc}), {2 * a_})", "x = " + ", quad ".join(T(sp.radsimp(s_)) for s_ in sols)]
    return {"solution": lines, "prompt": f"Solve using the quadratic formula: ${T(a_ * x**2 + b_ * x + c_)} = 0$.",
            "plain": f"Solve with the quadratic formula: {P(a_ * x**2 + b_ * x + c_)} = 0.",
            "key": {"kind": "set", "value": [str(sp.radsimp(s_)) for s_ in sols]}, "display": ", ".join(T(s_) for s_ in sols),
            "verified": f"sympy: solve = {sols}; discriminant {disc}"}


@template("quad_formula.discriminant", "quad_formula", requires=["quad_sqrt_prop"], guess=0.34, work_lines=3,
          substeps=["compute b^2 - 4ac", "positive: two, zero: one, negative: none (real)"],
          strategies={"discriminant": "discriminant", **OU})
def _(rng):
    a_, b_, c_ = nz(rng, -3, 4), rng.randint(-8, 8), nz(rng, -8, 8)
    disc = b_ * b_ - 4 * a_ * c_
    ans = "two" if disc > 0 else ("one" if disc == 0 else "none")
    check(len(sp.solveset(a_ * x**2 + b_ * x + c_, x, sp.S.Reals)) == {"two": 2, "one": 1, "none": 0}[ans], "count")
    return {"prompt": f"Use the discriminant to find the number of real solutions of ${T(a_ * x**2 + b_ * x + c_)} = 0$.",
            "plain": f"Number of real solutions of {P(a_ * x**2 + b_ * x + c_)} = 0 (discriminant).",
            "key": {"kind": "choice", "value": ans, "aliases": {"two": ["2", "two solutions", "two real solutions"],
                                                                 "one": ["1", "one solution", "one real solution"],
                                                                 "none": ["0", "no real solutions", "no solution", "zero"]}[ans]},
            "display": f"\"{ans}\"", "verified": f"discriminant = {disc}"}


@template("quad_apps.area", "quad_apps", requires=["quad_formula", "app_geometry"], guess=0.02, work_lines=6,
          substeps=["write the area equation with one variable", "solve the quadratic", "discard the negative solution"],
          strategies={"factor": "factoring", "quadratic_formula": "quadratic formula", **OU})
def _(rng):
    W_ = rng.randint(3, 15)
    d_ = rng.randint(2, 9)
    area = W_ * (W_ + d_)
    q = f"The length of a rectangular garden is {d_} feet more than its width. The area is {area} square feet. Find the width."
    sols = [s_ for s_ in sp.solve(sp.Eq(w * (w + d_), area), w) if s_ > 0]
    check(sols == [W_], "solve")
    other = -(W_ + d_)
    lines = [f"w (w + {d_}) = {area}", f"w^2 + {d_} w - {area} = 0", f"(w - {W_}) (w + {W_ + d_}) = 0",
             f"w = {W_} quad (w = {other} \" is not a length\")"]
    check(sp.expand((w - W_) * (w + W_ + d_)) == sp.expand(w**2 + d_ * w - area), "steps")
    return {"solution": lines, "prompt": q, "plain": q, "key": V(W_), "display": f"{W_} \"feet\"", "verified": f"sympy: positive root = {W_}"}


@template("quad_graph.vertex", "quad_graph", requires=["quad_formula", "gr_intercepts"], guess=0.02, work_lines=4,
          substeps=["the axis of symmetry is x = -b/(2a)", "substitute to find the y-coordinate of the vertex"],
          strategies={"formula": "x = -b/(2a)", "complete_square": "complete the square", **OU})
def _(rng):
    a_ = rng.choice([1, -1, 2, -2])
    hh, kk = rng.randint(-4, 4), rng.randint(-6, 6)
    poly = sp.expand(a_ * (x - hh) ** 2 + kk)
    cf = sp.Poly(poly, x).all_coeffs()
    xv = -cf[1] / (2 * cf[0])
    check(xv == hh and poly.subs(x, xv) == kk, "vertex")
    lines = [f"x = -frac(b, 2 a) = -frac({cf[1]}, 2 ({cf[0]})) = {hh}", f"y = {T(poly).replace('x', f'({hh})')} = {kk}"]
    return {"solution": lines, "prompt": f"Find the vertex of the parabola $y = {T(poly)}$.", "plain": f"Find the vertex of y = {P(poly)}.",
            "key": {"kind": "point", "value": [str(hh), str(kk)]}, "display": f"({hh}, {kk})", "verified": f"sympy: vertex ({hh}, {kk})"}


@template("quad_graph.maxmin", "quad_graph", requires=["quad_formula"], guess=0.02, work_lines=5,
          substeps=["the maximum occurs at the vertex", "find t = -b/(2a)", "substitute to find the maximum height"],
          strategies={"vertex": "vertex", **OU})
def _(rng):
    v0 = rng.choice([32, 48, 64, 80, 96, 128])
    h0 = rng.choice([0, 6, 10, 20, 40])
    height = -16 * t**2 + v0 * t + h0
    tv = sp.Rational(v0, 32)
    hmax = height.subs(t, tv)
    check(sp.diff(height, t).subs(t, tv) == 0, "vertex")
    sol_lines = [f"t = -frac(b, 2 a) = -frac({v0}, 2 (-16)) = {T(tv)}", f"h = -16 ({T(tv)})^2 + {v0} ({T(tv)}) + {h0} = {T(hmax)}"]
    q = (f"A ball is thrown upward; its height in feet after $t$ seconds is $h = {T(height)}$. What is the maximum height of the ball?")
    return {"solution": sol_lines, "prompt": q, "plain": f"Height h = {P(height)}. Maximum height?", "key": V(hmax), "display": f"{T(hmax)} \"feet\"",
            "verified": f"sympy: t = {tv}, h = {hmax}"}
