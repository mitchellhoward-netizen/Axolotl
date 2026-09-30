"""MathML (as used in OpenStax CNXML) -> Typst math, plus a plain linear form.

The Typst output is used by the packet renderer; the plain form is used for
skill/notation detection and as readable state for Jev. Conversion is
structural (no re-interpretation of the mathematics), so canonical formulas
render as written in the source.
"""
from __future__ import annotations

import xml.etree.ElementTree as ET

M = "{http://www.w3.org/1998/Math/MathML}"

# Operators Typst math knows by name.
TYPST_OPS = {
    "lim", "sin", "cos", "tan", "cot", "sec", "csc", "ln", "log", "exp", "max", "min",
    "sinh", "cosh", "tanh", "arcsin", "arccos", "arctan", "det", "sup", "inf",
}

# Characters with syntactic meaning in Typst math; emitted escaped.
TYPST_SPECIAL = set("()[]{}|,;&^_/\\\"#$'*<>=@~`!.:+-")

MO_MAP = {
    "−": "-", "-": "-", "+": "+", "=": "=", "·": "dot.op", "×": "times", "→": "->",
    "←": "<-", "≤": "<=", "≥": ">=", "≠": "!=", "∞": "infinity", "±": "plus.minus",
    "…": "...", "⋯": "dots.c", "∈": "in", "∉": "in.not", "∪": "union", "∩": "sect",
    "′": "'", "<": "<", ">": ">", "≈": "approx", "⇒": "=>", "⟹": "==>", "∘": "compose",
    "∣": "|", "/": "\\/", "%": "\\%", "∀": "forall", "∃": "exists", "°": "degree",
    "*": "*", "∑": "sum", "·": "dot.op", "⋅": "dot.op", "⊂": "subset", "−∞": "-infinity",
}
FENCE_OPEN = {"(": ")", "[": "]", "{": "}", "|": "|", "⌊": "⌋", "⌈": "⌉", "⟨": "⟩"}

PLAIN_MO = {"−": "-", "·": "*", "×": "*", "→": "→", "≤": "<=", "≥": ">=", "≠": "!="}


def local(tag: str) -> str:
    return tag.split("}", 1)[-1]


def _esc_str(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')


def _text(el: ET.Element) -> str:
    return "".join(el.itertext())


class Converter:
    """Walks a <m:math> element. `to_typst` and `to_plain` are independent passes."""

    # ---------- Typst ----------
    def typ(self, el: ET.Element) -> str:
        tag = local(el.tag)
        fn = getattr(self, "t_" + tag, None)
        if fn is None:
            return self.t_mrow(el)
        return fn(el)

    def _join(self, parts: list[str]) -> str:
        return " ".join(p for p in parts if p)

    def t_math(self, el):
        return self.t_mrow(el)

    def t_semantics(self, el):
        kids = [k for k in el if local(k.tag) not in ("annotation", "annotation-xml")]
        return self._join([self.typ(k) for k in kids])

    def t_mstyle(self, el):
        return self.t_mrow(el)

    t_mpadded = t_mstyle

    def t_mphantom(self, el):
        return ""

    def t_mrow(self, el):
        kids = list(el)
        # "{" followed by a table and no closing brace: a piecewise definition.
        if kids and local(kids[0].tag) == "mo" and _text(kids[0]).strip() == "{":
            rest = kids[1:]
            if rest and all(local(k.tag) in ("mtable", "mrow") for k in rest):
                tables = [t for k in rest for t in ([k] if local(k.tag) == "mtable" else k.iter(M + "mtable"))]
                if len(tables) == 1:
                    return self._cases(tables[0])
        # Fenced group -> lr(...) so delimiters scale like the typeset book.
        if len(kids) >= 2 and local(kids[0].tag) == "mo" and local(kids[-1].tag) == "mo":
            o, c = _text(kids[0]).strip(), _text(kids[-1]).strip()
            if o in FENCE_OPEN and FENCE_OPEN[o] == c and self._balanced(kids[1:-1], o, c):
                inner = self._join([self.typ(k) for k in kids[1:-1]])
                return f"lr({self._delim(o)} {inner} {self._delim(c)})"
        return self._join([self.typ(k) for k in kids])

    def _balanced(self, kids, o, c) -> bool:
        depth = 0
        for k in kids:
            if local(k.tag) == "mo":
                t = _text(k).strip()
                if o != c and t == o:
                    depth += 1
                elif o != c and t == c:
                    depth -= 1
                    if depth < 0:
                        return False
                elif o == c and t == o:
                    return False
        return depth == 0

    def _delim(self, ch: str) -> str:
        return "\\" + ch if ch in TYPST_SPECIAL else ch

    def t_mfenced(self, el):
        o = el.get("open", "(")
        c = el.get("close", ")")
        seps = el.get("separators", ",")
        parts = []
        for i, k in enumerate(el):
            if i:
                parts.append("\\" + (seps[0] if seps else ","))
            parts.append(self.typ(k))
        inner = self._join(parts)
        if not o and not c:
            return inner
        return f"lr({self._delim(o) if o else ''} {inner} {self._delim(c) if c else ''})"

    def t_mi(self, el):
        s = _text(el).strip()
        if not s:
            return ""
        variant = el.get("mathvariant")
        if s in TYPST_OPS:
            return s
        if len(s) == 1:
            if s in TYPST_SPECIAL:
                return "\\" + s
            if variant == "normal" and s.isalpha() and s.isascii():
                return f'upright("{_esc_str(s)}")'
            if variant == "bold":
                return f'bold("{_esc_str(s)}")'
            return s
        return f'upright("{_esc_str(s)}")'

    def t_mn(self, el):
        s = _text(el).strip()
        if not s:
            return ""
        if all(ch.isdigit() or ch == "." for ch in s) and not s.startswith(".") and not s.endswith("."):
            return s
        return f'"{_esc_str(s)}"'

    def t_mo(self, el):
        s = _text(el).strip()
        if not s:
            return ""
        if s in TYPST_OPS:
            return s
        if s in MO_MAP:
            return MO_MAP[s]
        if len(s) == 1:
            return "\\" + s if s in TYPST_SPECIAL else s
        if s.isalpha():
            return f'op("{_esc_str(s)}")'
        return f'"{_esc_str(s)}"'

    def t_mtext(self, el):
        s = _text(el)
        if not s.strip():
            return "space"
        if s.strip() in TYPST_OPS and s.strip() == s:
            return s.strip()
        return f'"{_esc_str(s)}"'

    t_ms = t_mtext

    def t_mspace(self, el):
        w = el.get("width", "0.2em")
        return f"#h({w})" if w.endswith("em") else "space"

    def t_mfrac(self, el):
        kids = list(el)
        if len(kids) != 2:
            return self.t_mrow(el)
        num, den = self.typ(kids[0]), self.typ(kids[1])
        if el.get("linethickness") in ("0", "0pt", "0em"):
            return f"binom({num}, {den})"
        return f"frac({num}, {den})"

    def t_msqrt(self, el):
        return f"sqrt({self.t_mrow(el)})"

    def t_mroot(self, el):
        kids = list(el)
        return f"root({self.typ(kids[1])}, {self.typ(kids[0])})"

    def _base(self, el) -> str:
        b = self.typ(el)
        return b if b else '""'

    def t_msup(self, el):
        b, e = list(el)
        return f"attach({self._base(b)}, t: {self.typ(e) or chr(34) * 2})"

    def t_msub(self, el):
        b, s = list(el)
        return f"attach({self._base(b)}, b: {self.typ(s) or chr(34) * 2})"

    def t_msubsup(self, el):
        b, s, e = list(el)
        return f"attach({self._base(b)}, b: {self.typ(s)}, t: {self.typ(e)})"

    def t_munder(self, el):
        b, u = list(el)
        base = self._base(b)
        if _text(b).strip() in ("lim", "max", "min", "sup", "inf"):
            return f"attach({_text(b).strip()}, b: {self.typ(u)})"
        ut = _text(u).strip()
        if ut in ("_", "̲", "‾") or (ut and set(ut) == {"_"}):
            return f"underline({base})"
        if ut in ("︸", "⏟", ""):
            return f"underbrace({base})"
        return f"attach(limits({base}), b: {self.typ(u)})"

    def t_mover(self, el):
        b, o = list(el)
        ot = _text(o).strip()
        base = self._base(b)
        accents = {"¯": "overline", "‾": "overline", "→": "arrow", "^": "hat", "˙": "dot", "~": "tilde"}
        if ot in accents:
            return f"{accents[ot]}({base})"
        if ot in ("︷", "⏞", ""):
            return f"overbrace({base})"
        return f"attach(limits({base}), t: {self.typ(o)})"

    def t_munderover(self, el):
        b, u, o = list(el)
        return f"attach(limits({self._base(b)}), b: {self.typ(u)}, t: {self.typ(o)})"

    def t_menclose(self, el):
        return f"lr(| {self.t_mrow(el)} |)" if el.get("notation") == "box" else self.t_mrow(el)

    def _rows(self, el):
        rows = []
        for tr in el:
            if local(tr.tag) not in ("mtr", "mlabeledtr"):
                continue
            rows.append([self.t_mrow(td) or '""' for td in tr if local(td.tag) == "mtd"])
        return rows

    def _cases(self, table):
        rows = self._rows(table)
        return "cases(" + ", ".join(" & ".join(r) for r in rows) + ")"

    def t_mtable(self, el):
        rows = self._rows(el)
        return "mat(delim: #none, align: #left, " + "; ".join(", ".join(r) for r in rows) + ")"

    def t_annotation(self, el):
        return ""

    # ---------- plain ----------
    def plain(self, el) -> str:
        tag = local(el.tag)
        if tag in ("annotation", "annotation-xml", "mphantom"):
            return ""
        if tag in ("mi", "mn", "mtext", "ms"):
            return _text(el).strip() if tag != "mtext" else _text(el)
        if tag == "mo":
            s = _text(el).strip()
            return PLAIN_MO.get(s, s)
        if tag == "mspace":
            return " "
        kids = list(el)
        if tag == "mfrac" and len(kids) == 2:
            return f"({self.plain(kids[0])})/({self.plain(kids[1])})"
        if tag == "msqrt":
            return f"sqrt({''.join(self.plain(k) for k in kids)})"
        if tag == "mroot":
            return f"root[{self.plain(kids[1])}]({self.plain(kids[0])})"
        if tag == "msup":
            return f"{self.plain(kids[0])}^({self.plain(kids[1])})"
        if tag == "msub":
            return f"{self.plain(kids[0])}_({self.plain(kids[1])})"
        if tag == "msubsup":
            return f"{self.plain(kids[0])}_({self.plain(kids[1])})^({self.plain(kids[2])})"
        if tag == "munder":
            return f"{self.plain(kids[0])}_({self.plain(kids[1])}) "
        if tag == "mover":
            return f"{self.plain(kids[0])}^({self.plain(kids[1])})"
        if tag == "munderover":
            return f"{self.plain(kids[0])}_({self.plain(kids[1])})^({self.plain(kids[2])})"
        if tag == "mtable":
            rows = []
            for tr in kids:
                rows.append(" ".join(self.plain(td) for td in tr))
            return "{ " + "; ".join(rows) + " }"
        return "".join(self.plain(k) for k in kids)


_conv = Converter()


def to_typst(math_el: ET.Element) -> str:
    return _conv.typ(math_el)


def to_plain(math_el: ET.Element) -> str:
    return " ".join(_conv.plain(math_el).split())
