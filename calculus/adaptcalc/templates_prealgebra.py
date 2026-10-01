"""Pre-Algebra templates (course `prealgebra`, Prealgebra 2e): the skills Algebra 1 does not share.
Same contract as templates.py: constructive generation, independent SymPy verification."""
from __future__ import annotations

import sympy as sp

from .symtyp import plain as P
from .symtyp import typ as T
from .templates import check, nz, template
from .templates_algebra import OU, V, E, eqt, money, signed

x, n = sp.symbols("x n")


def mixed_t(q: sp.Rational) -> str:
    """3 2/5 in Typst."""
    w, r = divmod(abs(q.p), q.q)
    sign = "-" if q < 0 else ""
    if r and not w:
        return f"{sign}frac({r}, {q.q})"
    return f"{sign}{w} frac({r}, {q.q})" if r else f"{sign}{w}"


def mixed_p(q: sp.Rational) -> str:
    w, r = divmod(abs(q.p), q.q)
    sign = "-" if q < 0 else ""
    if r and not w:
        return f"{sign}{r}/{q.q}"
    return f"{sign}{w} {r}/{q.q}" if r else f"{sign}{w}"


# ============================================================ Chapter 1: whole numbers

@template("w_place_value.round", "w_place_value", guess=0.03, work_lines=2,
          substeps=["find the digit in the rounding place", "look at the digit to its right"],
          strategies={"rounding_rule": "look at the next digit", **OU})
def _(rng):
    N = rng.randint(10_000, 9_999_999)
    place, name = rng.choice([(10, "ten"), (100, "hundred"), (1000, "thousand"), (10_000, "ten thousand")])
    r = ((N + place // 2) // place) * place
    check(abs(r - N) <= place // 2 and r % place == 0, "rounding")
    return {"prompt": f"Round ${N:,}$ to the nearest {name}.".replace(",", "{,}"), "plain": f"Round {N:,} to the nearest {name}.",
            "key": V(r), "display": f"{r:,}".replace(",", "{,}"), "verified": f"round({N}, {place}) = {r}"}


@template("w_add_sub.column", "w_add_sub", requires=["w_place_value"], guess=0.02, work_lines=4,
          substeps=["line up the place values", "add or subtract each column, regrouping when needed"],
          strategies={"column": "column method with regrouping", "mental": "mental math", **OU})
def _(rng):
    a_, b_ = rng.randint(1200, 9800), rng.randint(300, 4800)
    op = rng.choice(["+", "-"])
    if op == "-":
        a_, b_ = max(a_, b_), min(a_, b_)
        check(any(int(c) < int(d) for c, d in zip(str(a_)[::-1], str(b_)[::-1])), "needs borrowing")
    val = a_ + b_ if op == "+" else a_ - b_
    return {"prompt": f"{'Add' if op == '+' else 'Subtract'}: ${a_} {op} {b_}$.", "plain": f"{a_} {op} {b_}",
            "key": V(val), "display": T(val), "verified": f"{a_} {op} {b_} = {val}"}


@template("w_mult.multi", "w_mult", requires=["w_add_sub"], guess=0.02, work_lines=5,
          substeps=["multiply by the ones digit", "multiply by the tens digit (write a placeholder zero)", "add the partial products"],
          strategies={"standard_algorithm": "standard algorithm", "partial_products": "partial products", **OU})
def _(rng):
    a_, b_ = rng.randint(120, 899), rng.randint(12, 89)
    val = a_ * b_
    p1, p2 = a_ * (b_ % 10), a_ * (b_ // 10) * 10
    return {"prompt": f"Multiply: ${a_} times {b_}$.", "plain": f"{a_} * {b_}", "key": V(val), "display": T(val),
            "verified": f"{a_}*{b_} = {val}", "solution": [f"{a_} times {b_ % 10} = {p1}", f"{a_} times {b_ // 10 * 10} = {p2}",
                                                           f"{p1} + {p2} = {val}"]}


@template("w_div.long", "w_div", requires=["w_mult"], guess=0.02, work_lines=6,
          substeps=["divide, multiply, subtract, bring down; repeat", "check: quotient times divisor plus remainder"],
          strategies={"long_division": "long division", **OU})
def _(rng):
    d_ = rng.randint(3, 9)
    q_ = rng.randint(105, 989)
    r_ = rng.choice([0, 0, rng.randint(1, d_ - 1)])
    N = d_ * q_ + r_
    if r_:
        prompt, plain = (f"Divide, and write the remainder: ${N} div {d_}$. Give the answer as a quotient and remainder, like 23 R 4.",
                         f"{N} / {d_}, quotient and remainder")
        key = {"kind": "choice", "value": f"{q_} R {r_}", "aliases": [f"{q_}R{r_}", f"{q_} r {r_}", f"{q_} remainder {r_}"]}
        disp = f"{q_} \"R\" {r_}"
    else:
        prompt, plain, key, disp = f"Divide: ${N} div {d_}$.", f"{N} / {d_}", V(q_), T(q_)
    check(d_ * q_ + r_ == N and r_ < d_, "division")
    return {"prompt": prompt, "plain": plain, "key": key, "display": disp, "verified": f"{d_}*{q_} + {r_} = {N}"}


# ============================================================ Chapters 2-3

@template("pa_evaluate.expr", "pa_evaluate", requires=["f_order_ops"], guess=0.03, work_lines=3,
          substeps=["substitute the values", "simplify with the order of operations"],
          strategies={"substitute": "substitute, then simplify", **OU})
def _(rng):
    xv, yv = rng.randint(2, 9), rng.randint(2, 6)
    c1, c2 = rng.randint(2, 7), rng.randint(1, 9)
    y = sp.Symbol("y")
    e = c1 * x**2 + c2 * y
    val = e.subs({x: xv, y: yv})
    return {"prompt": f"Evaluate ${T(e)}$ when $x = {xv}$ and $y = {yv}$.", "plain": f"Evaluate {P(e)} when x = {xv}, y = {yv}.",
            "key": V(val), "display": T(val), "verified": f"subs = {val}",
            "solution": [f"{c1} ({xv})^2 + {c2} ({yv})", f"= {c1} dot {xv * xv} + {c2 * yv}", f"= {T(val)}"]}


@template("pa_factors.all", "pa_factors", requires=["w_div"], guess=0.02, work_lines=4,
          substeps=["test divisors from 1 up to the square root", "write each factor with its pair"],
          strategies={"factor_pairs": "factor pairs", **OU})
def _(rng):
    N = rng.choice([12, 18, 20, 24, 28, 30, 32, 36, 40, 42, 45, 48, 50, 54, 60, 63, 64, 72, 75, 80, 84, 90, 96, 100])
    fs = sp.divisors(N)
    return {"prompt": f"Find all the factors of ${N}$.", "plain": f"Find all the factors of {N}.",
            "key": {"kind": "set", "value": [str(f) for f in fs]}, "display": ", ".join(map(str, fs)),
            "verified": f"sympy: divisors({N}) = {fs}"}


@template("pa_factors.prime", "pa_factors", requires=["w_div"], guess=0.5, work_lines=3,
          substeps=["check divisibility by primes up to the square root"],
          strategies={"divisibility": "divisibility tests", **OU})
def _(rng):
    N = rng.choice([p for p in range(31, 120) if sp.isprime(p)] + [p * q for p in (3, 7, 11) for q in (7, 11, 13) if p * q < 140])
    ans = "prime" if sp.isprime(N) else "composite"
    return {"prompt": f"Is ${N}$ prime or composite? Show how you know.", "plain": f"Is {N} prime or composite?",
            "key": {"kind": "choice", "value": ans, "aliases": [f"{ans} number"]}, "display": f"\"{ans}\"",
            "verified": f"sympy: isprime({N}) = {sp.isprime(N)}"}


@template("pa_int_intro.abs", "pa_int_intro", requires=["w_add_sub"], guess=0.05, work_lines=3,
          substeps=["find each absolute value (distance from 0)", "then combine"],
          strategies={"distance": "absolute value as distance", **OU})
def _(rng):
    a_, b_ = rng.randint(2, 20), rng.randint(2, 20)
    form = rng.choice(["minus", "neg"])
    if form == "minus":
        tp, val = f"lr(| -{a_} |) + lr(| {b_} |)", a_ + b_
    else:
        tp, val = f"-lr(| -{a_} |)", -a_
    return {"prompt": f"Simplify: ${tp}$.", "plain": f"Simplify: {tp.replace('lr(|', '|').replace('|)', '|')}.",
            "key": V(val), "display": T(val), "verified": f"= {val}"}


# ============================================================ Chapter 4: fractions

@template("pa_frac_meaning.to_mixed", "pa_frac_meaning", requires=["w_div"], guess=0.02, work_lines=3,
          substeps=["divide the numerator by the denominator", "the quotient is the whole number, the remainder over the denominator is the fraction"],
          strategies={"divide": "divide numerator by denominator", **OU})
def _(rng):
    d_ = rng.choice([3, 4, 5, 6, 7, 8, 9])
    w_, r_ = rng.randint(1, 9), rng.randint(1, d_ - 1)
    check(sp.gcd(r_, d_) == 1, "lowest terms")
    q = sp.Rational(w_ * d_ + r_, d_)
    return {"prompt": f"Write $frac({q.p}, {q.q})$ as a mixed number.", "plain": f"Write {q.p}/{q.q} as a mixed number.",
            "key": V(q, "mixed_number"), "display": mixed_t(q), "verified": f"{q.p} = {w_}*{d_} + {r_}",
            "solution": [f"{q.p} div {d_} = {w_} \"remainder\" {r_}", f"frac({q.p}, {q.q}) = {mixed_t(q)}"]}


@template("pa_mixed_muldiv.multiply", "pa_mixed_muldiv", requires=["f_frac_mul"], guess=0.02, work_lines=4,
          substeps=["write each mixed number as an improper fraction", "multiply (or divide) and simplify"],
          strategies={"improper": "convert to improper fractions", **OU})
def _(rng):
    a_ = sp.Rational(rng.randint(1, 4) * 3 + rng.choice([1, 2]), 3)
    b_ = sp.Rational(rng.randint(1, 3) * 4 + rng.choice([1, 3]), 4)
    op = rng.choice(["times", "div"])
    val = a_ * b_ if op == "times" else a_ / b_
    return {"prompt": f"{'Multiply' if op == 'times' else 'Divide'}, and simplify: ${mixed_t(a_)} {op} {mixed_t(b_)}$.",
            "plain": f"{mixed_p(a_)} {'*' if op == 'times' else '/'} {mixed_p(b_)}", "key": V(val), "display": T(val),
            "verified": f"= {val}", "solution": [f"frac({a_.p}, {a_.q}) {op} frac({b_.p}, {b_.q})", f"= {T(val)}"]}


@template("pa_frac_add_common.add", "pa_frac_add_common", requires=["pa_frac_meaning", "f_int_add"], guess=0.03, work_lines=3,
          substeps=["add or subtract the numerators", "keep the common denominator", "simplify"],
          strategies={"numerators": "combine numerators", **OU})
def _(rng):
    d_ = rng.choice([5, 7, 8, 9, 11, 12, 15])
    a_, b_ = rng.randint(1, d_ - 1), rng.randint(1, d_ - 1)
    op = rng.choice(["+", "-"])
    val = sp.Rational(a_ + (b_ if op == "+" else -b_), d_)
    return {"prompt": f"Simplify: $frac({a_}, {d_}) {op} frac({b_}, {d_})$.", "plain": f"{a_}/{d_} {op} {b_}/{d_}",
            "key": V(val, "lowest_terms"), "display": T(val), "verified": f"= {val}",
            "solution": [f"frac({a_} {op} {b_}, {d_})", f"= {T(val)}"]}


@template("pa_mixed_addsub.subtract", "pa_mixed_addsub", requires=["f_frac_add", "pa_frac_meaning"], guess=0.02, work_lines=5,
          substeps=["rewrite the fractions over a common denominator", "borrow 1 from the whole number if needed", "subtract the wholes and the fractions"],
          strategies={"borrow": "borrow from the whole number", "improper": "convert to improper fractions", **OU})
def _(rng):
    d_ = rng.choice([4, 6, 8, 10, 12])
    a_ = sp.Integer(rng.randint(4, 9)) + sp.Rational(rng.randint(1, d_ // 2), d_)
    b_ = sp.Integer(rng.randint(1, 3)) + sp.Rational(rng.randint(d_ // 2 + 1, d_ - 1), d_)
    check(a_ > b_, "positive")
    op = rng.choice(["+", "-"])
    val = a_ + b_ if op == "+" else a_ - b_
    check(val > 1, "the answer is a mixed or whole number")
    return {"prompt": f"{'Add' if op == '+' else 'Subtract'}, and write the answer as a mixed number: ${mixed_t(a_)} {op} {mixed_t(b_)}$.",
            "plain": f"{mixed_p(a_)} {op} {mixed_p(b_)}", "key": V(val, "mixed_number" if val.q != 1 else None), "display": mixed_t(val),
            "verified": f"= {val}", "solution": [f"frac({a_.p}, {a_.q}) {op} frac({b_.p}, {b_.q})", f"= {T(val)} = {mixed_t(val)}"]}


@template("pa_eq_frac.solve", "pa_eq_frac", requires=["lin_one_step", "f_frac_add"], guess=0.02, work_lines=4,
          substeps=["isolate the variable", "multiply both sides by the reciprocal of the coefficient"],
          strategies={"reciprocal": "multiply by the reciprocal", **OU})
def _(rng):
    p_, q_ = rng.choice([(2, 3), (3, 4), (2, 5), (4, 5), (5, 6), (3, 8)])
    sol = q_ * nz(rng, -6, 6)
    k = sp.Rational(rng.randint(1, 5), rng.choice([2, 3]))
    rhs = sp.Rational(p_, q_) * sol + k
    eq = sp.Eq(sp.Rational(p_, q_) * x + k, rhs)
    check(sp.solve(eq, x) == [sol], "solve")
    return {"prompt": f"Solve: $frac({p_}, {q_}) x + {T(k)} = {T(rhs)}$.", "plain": f"({p_}/{q_})x + {k} = {rhs}",
            "key": V(sol), "display": f"x = {sol}", "verified": f"sympy: solve = {sol}",
            "solution": [f"frac({p_}, {q_}) x = {T(rhs - k)}", f"x = frac({q_}, {p_}) dot {T(rhs - k)}", f"x = {sol}"]}


# ============================================================ Chapter 5: decimals, statistics, ratios

@template("pa_decimals.round", "pa_decimals", requires=["w_place_value", "pa_frac_meaning"], guess=0.03, work_lines=2,
          substeps=["find the rounding place", "look at the next digit to the right"],
          strategies={"rounding_rule": "next digit decides", **OU})
def _(rng):
    v = sp.Rational(rng.randint(10_000, 999_999), 10_000)
    place, name = rng.choice([(10, "tenth"), (100, "hundredth"), (1000, "thousandth")])
    r = sp.Rational(int(v * place + sp.Rational(1, 2)), place)
    check(abs(r - v) <= sp.Rational(1, 2 * place), "rounding")
    return {"prompt": f"Round ${float(v):.4f}$ to the nearest {name}.", "plain": f"Round {float(v):.4f} to the nearest {name}.",
            "key": V(r), "display": f"{float(r):g}", "verified": f"round = {r}"}


@template("pa_dec_frac.convert", "pa_dec_frac", requires=["f_decimals", "f_frac_mul"], guess=0.02, work_lines=3,
          substeps=["divide the numerator by the denominator"],
          strategies={"divide": "divide", "equivalent": "equivalent fraction over 10, 100, 1000", **OU})
def _(rng):
    d_ = rng.choice([4, 5, 8, 16, 20, 25, 40])
    a_ = rng.randint(1, d_ - 1)
    check(sp.gcd(a_, d_) == 1, "lowest")
    v = sp.Rational(a_, d_)
    return {"prompt": f"Write $frac({a_}, {d_})$ as a decimal.", "plain": f"Write {a_}/{d_} as a decimal.",
            "key": V(v), "display": f"{float(v):g}", "verified": f"{a_}/{d_} = {float(v)}"}


@template("pa_eq_dec.solve", "pa_eq_dec", requires=["lin_one_step", "f_decimals"], guess=0.02, work_lines=4,
          substeps=["undo the addition or subtraction", "undo the multiplication by dividing"],
          strategies={"inverse": "inverse operations", **OU})
def _(rng):
    c_ = sp.Rational(rng.randint(12, 95), 10)
    sol = sp.Rational(rng.randint(2, 40), 10)
    k = sp.Rational(rng.randint(5, 99), 100)
    rhs = c_ * sol + k
    check(sp.solve(sp.Eq(c_ * x + k, rhs), x) == [sol], "solve")
    return {"prompt": f"Solve: ${float(c_):g} x + {float(k):g} = {float(rhs):g}$.", "plain": f"{float(c_):g}x + {float(k):g} = {float(rhs):g}",
            "key": V(sol), "display": f"x = {float(sol):g}", "verified": f"sympy: solve = {sol}",
            "solution": [f"{float(c_):g} x = {float(rhs - k):g}", f"x = frac({float(rhs - k):g}, {float(c_):g}) = {float(sol):g}"]}


@template("pa_stats.mean_median", "pa_stats", requires=["f_decimals"], guess=0.03, work_lines=4,
          substeps=["for the mean: add the numbers and divide by how many", "for the median: put the numbers in order and find the middle"],
          strategies={"definition": "definition of mean / median", **OU})
def _(rng):
    k = rng.choice([5, 6, 7])
    data = [rng.randint(10, 98) for _ in range(k)]
    which = rng.choice(["mean", "median"])
    if which == "mean":
        val = sp.Rational(sum(data), k)
        check(val.q in (1, 2, 4, 5), "terminating mean")
    else:
        sd = sorted(data)
        val = sp.Rational(sd[k // 2]) if k % 2 else sp.Rational(sd[k // 2 - 1] + sd[k // 2], 2)
    return {"prompt": f"Find the {which} of these numbers: ${', '.join(map(str, data))}$.",
            "plain": f"Find the {which} of {', '.join(map(str, data))}.", "key": V(val), "display": f"{float(val):g}",
            "verified": f"{which} = {val}",
            "solution": ([f"{' + '.join(map(str, data))} = {sum(data)}", f"frac({sum(data)}, {k}) = {float(val):g}"] if which == "mean"
                         else [f"\"in order:\" {', '.join(map(str, sorted(data)))}", f"\"median\" = {float(val):g}"])}


@template("pa_ratio_rate.unit_price", "pa_ratio_rate", requires=["f_frac_mul", "f_decimals"], guess=0.02, work_lines=3,
          substeps=["divide the total price by the number of units"],
          strategies={"divide": "price divided by quantity", **OU})
def _(rng):
    k = rng.choice([4, 5, 6, 8, 10, 12, 16, 20, 24])
    unit = sp.Rational(rng.randint(15, 199), 100)
    total = unit * k
    check(total.q in (1, 2, 4, 5, 10, 20, 25, 50, 100), "cents")
    q = f"A pack of {k} pencils costs {money(total)}. What is the unit price (the price of one pencil)?"
    return {"prompt": q, "plain": q.replace("\\", ""), "key": V(unit), "display": money(unit),
            "verified": f"{total}/{k} = {unit}", "solution": [f"frac({float(total):.2f}, {k}) = {float(unit):.2f}"]}


# ============================================================ Chapter 7

@template("pa_real_numbers.classify", "pa_real_numbers", requires=["f_sqrt", "pa_dec_frac"], guess=0.5, work_lines=2,
          substeps=["a rational number can be written as a ratio of integers", "the square root of a non-perfect square is irrational"],
          strategies={"definition": "definition of rational number", **OU})
def _(rng):
    form = rng.choice(["sqrt_perfect", "sqrt_not", "fraction", "decimal"])
    if form == "sqrt_perfect":
        k = rng.randint(2, 15)
        tp, ans = f"sqrt({k * k})", "rational"
    elif form == "sqrt_not":
        k = rng.choice([2, 3, 5, 6, 7, 10, 11, 13])
        tp, ans = f"sqrt({k})", "irrational"
    elif form == "fraction":
        tp, ans = f"-frac({rng.randint(1, 9)}, {rng.randint(2, 9)})", "rational"
    else:
        tp, ans = f"{rng.randint(1, 9)}.{rng.randint(10, 99)}", "rational"
    expr = sp.sympify(tp.replace("frac(", "Rational(")) if "frac" in tp else sp.sympify(tp)
    check((expr.is_rational is True) == (ans == "rational"), "classification")
    return {"prompt": f"Is ${tp}$ rational or irrational?", "plain": f"Is {tp} rational or irrational?",
            "key": {"kind": "choice", "value": ans, "aliases": [f"{ans} number"]}, "display": f"\"{ans}\"",
            "verified": f"sympy is_rational = {expr.is_rational}"}


@template("pa_properties.reorder", "pa_properties", requires=["f_frac_mul", "f_int_add"], guess=0.03, work_lines=3,
          substeps=["use the commutative property to put the reciprocals together", "multiply the reciprocals first"],
          strategies={"commutative": "commutative and associative properties", **OU})
def _(rng):
    p_, q_ = rng.choice([(3, 5), (2, 7), (4, 9), (5, 8), (7, 3)])
    k = rng.randint(11, 49)
    val = sp.Rational(p_, q_) * k * sp.Rational(q_, p_)
    check(val == k, "inverse")
    return {"prompt": f"Evaluate (use the properties to make it easy): $frac({p_}, {q_}) dot {k} dot frac({q_}, {p_})$.",
            "plain": f"({p_}/{q_}) * {k} * ({q_}/{p_})", "key": V(val), "display": T(val), "verified": f"= {val}",
            "solution": [f"frac({p_}, {q_}) dot frac({q_}, {p_}) dot {k}", f"= 1 dot {k} = {k}"]}


@template("pa_measurement.convert", "pa_measurement", requires=["f_decimals", "f_frac_mul"], guess=0.02, work_lines=3,
          substeps=["write the conversion as a ratio equal to 1", "multiply and cancel the units"],
          strategies={"unit_factor": "multiply by a unit conversion factor", **OU})
def _(rng):
    form = rng.choice(["ft_in", "yd_ft", "km_m", "lb_oz", "gal_qt", "temp"])
    if form == "ft_in":
        a_ = rng.randint(3, 15); q, ans = f"How many inches are in {a_} feet?", 12 * a_
    elif form == "yd_ft":
        a_ = rng.randint(4, 40); q, ans = f"How many feet are in {a_} yards?", 3 * a_
    elif form == "km_m":
        a_ = sp.Rational(rng.randint(12, 95), 10); q, ans = f"How many meters are in {float(a_):g} kilometers?", 1000 * a_
    elif form == "lb_oz":
        a_ = rng.randint(2, 9); q, ans = f"How many ounces are in {a_} pounds?", 16 * a_
    elif form == "gal_qt":
        a_ = rng.randint(2, 12); q, ans = f"How many quarts are in {a_} gallons?", 4 * a_
    else:
        c_ = 5 * rng.randint(-4, 20); q, ans = f"Convert {c_} degrees Celsius to degrees Fahrenheit.", sp.Rational(9, 5) * c_ + 32
    check(sp.nsimplify(ans) == ans, "exact")
    return {"prompt": q, "plain": q, "key": V(ans), "display": f"{float(ans):g}", "verified": f"= {ans}"}


# ============================================================ Chapter 9: geometry

@template("pa_area.shapes", "pa_area", requires=["f_decimals", "f_frac_mul", "f_order_ops"], guess=0.02, work_lines=4,
          substeps=["choose the area formula for the shape", "substitute the measurements", "simplify, with square units"],
          strategies={"formula": "area formula", **OU})
def _(rng):
    form = rng.choice(["triangle", "trapezoid", "circle"])
    if form == "triangle":
        b_, h_ = rng.randint(4, 24), rng.randint(3, 18)
        val = sp.Rational(b_ * h_, 2)
        q = f"Find the area of a triangle with base {b_} inches and height {h_} inches."
        sol = ["A = frac(1, 2) b h", f"A = frac(1, 2) ({b_}) ({h_})", f"A = {T(val)}"]
    elif form == "trapezoid":
        b1, b2, h_ = rng.randint(4, 14), rng.randint(15, 26), rng.randint(3, 12)
        val = sp.Rational((b1 + b2) * h_, 2)
        q = f"Find the area of a trapezoid with bases {b1} cm and {b2} cm and height {h_} cm."
        sol = ["A = frac(1, 2) h (b + B)", f"A = frac(1, 2) ({h_}) ({b1} + {b2})", f"A = {T(val)}"]
    else:
        r_ = rng.randint(2, 12)
        val = sp.pi * r_**2
        q = f"Find the area of a circle with radius {r_} meters. Leave the answer in terms of $pi$."
        sol = ["A = pi r^2", f"A = pi ({r_})^2", f"A = {r_ * r_} pi"]
    return {"prompt": q, "plain": q.replace("$", ""), "key": V(val), "display": T(val), "verified": f"area = {val}", "solution": sol}


@template("pa_volume.solid", "pa_volume", requires=["pa_area"], guess=0.02, work_lines=4,
          substeps=["choose the volume formula", "substitute and simplify, with cubic units"],
          strategies={"formula": "volume formula", **OU})
def _(rng):
    form = rng.choice(["box", "cylinder", "cone"])
    if form == "box":
        l_, w_, h_ = rng.randint(2, 15), rng.randint(2, 12), rng.randint(2, 10)
        val = l_ * w_ * h_
        q = f"Find the volume of a rectangular box {l_} ft long, {w_} ft wide and {h_} ft tall."
        sol = ["V = L W H", f"V = {l_} dot {w_} dot {h_}", f"V = {val}"]
    elif form == "cylinder":
        r_, h_ = rng.randint(2, 9), rng.randint(3, 15)
        val = sp.pi * r_**2 * h_
        q = f"Find the volume of a cylinder with radius {r_} cm and height {h_} cm. Leave the answer in terms of $pi$."
        sol = ["V = pi r^2 h", f"V = pi ({r_})^2 ({h_})", f"V = {r_ * r_ * h_} pi"]
    else:
        r_, h_ = rng.randint(2, 9), 3 * rng.randint(1, 6)
        val = sp.Rational(1, 3) * sp.pi * r_**2 * h_
        q = f"Find the volume of a cone with radius {r_} in and height {h_} in. Leave the answer in terms of $pi$."
        sol = ["V = frac(1, 3) pi r^2 h", f"V = frac(1, 3) pi ({r_})^2 ({h_})", f"V = {T(val)}"]
    return {"prompt": q, "plain": q.replace("$", ""), "key": V(val), "display": T(val), "verified": f"volume = {val}", "solution": sol}
