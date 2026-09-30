import sympy as sp

from adaptcalc import answers


def key(kind, value, **kw):
    return {"kind": kind, "value": value if isinstance(value, (str, list)) else sp.srepr(value), **kw}


def test_limit_values_dne_and_infinity():
    assert answers.grade(key("limit", sp.Rational(1, 4)), "0.25")[0]
    assert answers.grade(key("limit", sp.Rational(1, 4)), "lim = 1/4")[0]
    assert not answers.grade(key("limit", sp.Rational(1, 4)), "DNE")[0]
    assert answers.grade({"kind": "limit", "value": "DNE"}, "does not exist")[0]
    assert answers.grade(key("limit", sp.oo), "∞")[0]
    assert not answers.grade(key("limit", sp.oo), "-∞")[0]


def test_expression_forms():
    x = answers.X
    assert answers.grade(key("expr", (x - 2) * (x + 3), form="factored"), "(x-2)(x+3)")[0]
    assert not answers.grade(key("expr", (x - 2) * (x + 3), form="factored"), "x^2 + x - 6")[0]
    k = key("expr", (sp.sqrt(x) + 4) / (x - 16), form="no_radical_denominator")
    assert answers.grade(k, "(sqrt(x)+4)/(x-16)")[0]
    assert not answers.grade(k, "1/(sqrt(x)-4)")[0]


def test_sets_intervals_choices():
    assert answers.grade({"kind": "set", "value": ["-5", "-6"]}, "x = -6, -5")[0]
    iv = sp.Union(sp.Interval.open(-sp.oo, -2), sp.Interval.open(-2, 2), sp.Interval.open(2, sp.oo))
    assert answers.grade(key("interval", iv), "(-∞,-2) ∪ (-2,2) ∪ (2,∞)")[0]
    assert not answers.grade(key("interval", iv), "(-∞,2) ∪ (2,∞)")[0]
    assert answers.grade({"kind": "choice", "value": "c"}, "(c)")[0]


def test_delta_check_accepts_any_small_enough_delta():
    eps, d = answers.EPS, sp.Symbol("d")
    k = {"kind": "delta", "value": sp.srepr(eps / 3), "bound": sp.srepr(3 * d)}
    assert answers.grade(k, "ε/3")[0]
    assert answers.grade(k, "ε/4")[0]          # smaller deltas also work
    assert not answers.grade(k, "ε")[0]        # the slope was ignored
    assert not answers.grade(k, "3ε")[0]
