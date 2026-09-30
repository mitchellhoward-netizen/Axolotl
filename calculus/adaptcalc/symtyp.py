"""SymPy expression -> Typst math / readable plain text."""
from __future__ import annotations

import sympy as sp
from sympy.printing.str import StrPrinter

GREEK = {"epsilon", "delta", "theta", "alpha", "beta", "pi", "phi", "lambda"}


class TypstPrinter(StrPrinter):
    def __init__(self):
        super().__init__({"order": "lex"})

    def _print_Symbol(self, expr):
        n = expr.name
        if n in GREEK or len(n) == 1:
            return n
        return f'upright("{n}")'

    def _print_Rational(self, expr):
        if expr.q == 1:
            return str(expr.p)
        sign = "-" if expr.p < 0 else ""
        return f"{sign}frac({abs(expr.p)}, {expr.q})"

    def _print_Integer(self, expr):
        return str(expr.p)

    def _print_Infinity(self, expr):
        return "infinity"

    def _print_NegativeInfinity(self, expr):
        return "-infinity"

    def _print_Pi(self, expr):
        return "pi"

    def _print_Exp1(self, expr):
        return "e"

    def _print_Abs(self, expr):
        return f"lr(| {self._print(expr.args[0])} |)"

    def _print_Function(self, expr):
        name = expr.func.__name__
        args = ", ".join(self._print(a) for a in expr.args)
        return f"{name}({args})"

    def _print_Pow(self, expr, rational=False):
        b, e = expr.as_base_exp()
        if e == sp.Rational(1, 2):
            return f"sqrt({self._print(b)})"
        if e == -sp.Rational(1, 2):
            return f"frac(1, sqrt({self._print(b)}))"
        if e == -1:
            return f"frac(1, {self._print(b)})"
        if e.is_Rational and e < 0:
            return f"frac(1, {self._print(sp.Pow(b, -e, evaluate=False))})"
        bs = self._print(b)
        if not (b.is_Symbol or (b.is_Integer and b >= 0)):
            bs = f"({bs})"
        if isinstance(b, sp.Function) and b.func in (sp.sin, sp.cos, sp.tan):
            # sin^2(x) style
            return f"{b.func.__name__}^({self._print(e)})({self._print(b.args[0])})"
        return f"{bs}^({self._print(e)})"

    def _print_Mul(self, expr):
        num, den = sp.fraction(expr, exact=True)
        if den != 1:
            sign = ""
            if num.could_extract_minus_sign():
                sign, num = "-", -num
            return f"{sign}frac({self._print(num)}, {self._print(den)})"
        coeff, rest = expr.as_coeff_mul()
        parts = []
        sign = ""
        if coeff == -1:
            sign = "-"
        elif coeff != 1:
            if coeff < 0:
                sign = "-"
                coeff = -coeff
            parts.append(self._print(coeff))
        for f in sorted(rest, key=lambda a: (not a.is_number, sp.default_sort_key(a))):
            s = self._print(f)
            if f.is_Add:
                s = f"({s})"
            parts.append(s)
        out = []
        for i, p in enumerate(parts):
            if i and (parts[i - 1][-1:].isdigit() and p[:1].isdigit()):
                out.append("dot")
            out.append(p)
        return sign + " ".join(out)

    def _print_Add(self, expr, order=None):
        terms = self._as_ordered_terms(expr, order="lex")
        s = ""
        for i, t in enumerate(terms):
            ts = self._print(t)
            if i == 0:
                s = ts
            elif ts.startswith("-"):
                s += " - " + ts[1:]
            else:
                s += " + " + ts
        return s

    def _print_Min(self, expr):
        return "min(" + ", ".join(self._print(a) for a in expr.args) + ")"

    def _print_Max(self, expr):
        return "max(" + ", ".join(self._print(a) for a in expr.args) + ")"


_tp = TypstPrinter()


def typ(expr) -> str:
    return _tp.doprint(sp.sympify(expr))


def plain(expr) -> str:
    return sp.sstr(sp.sympify(expr), order="lex").replace("**", "^")


def poly_typ(p, x) -> str:
    """Polynomial in descending powers (as a textbook writes it)."""
    return typ(sp.Poly(sp.expand(p), x).as_expr())
