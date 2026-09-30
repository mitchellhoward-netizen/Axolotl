"""Notation registry: which mathematical notation the canonical text has introduced, and where.

Notation features are detected in Typst math strings (canonical math is
converted MathML; generated math is printed from SymPy by symtyp), so both
sides are compared in the same representation. A generated snippet may only
use features that are in the baseline (Chapter 1 and earlier) or were
introduced by canonical text at or before its position in the chapter.
"""
from __future__ import annotations

import re
from functools import lru_cache

from . import cnxml

# Notation a reader of Chapter 2 already has from Chapter 1 / precalculus.
BASELINE = {"fraction", "power", "radical", "absolute_value", "trig", "exp_log", "piecewise",
            "function_notation", "inequality", "pi", "interval"}

FEATURES = {
    "limit": r"\blim\b",
    "approach_arrow": r"->|→",
    "one_sided": r"(->|→)[^;]{0,40}?(\^\(?[-+−]|t:\s*[-+−])",
    "infinity": r"infinity|∞",
    "epsilon": r"epsilon|ε|ϵ",
    "delta": r"\bdelta\b|δ",
    "fraction": r"frac\(|/",
    "power": r"\^|attach\([^,]+,\s*t:",
    "radical": r"sqrt\(|root\(",
    "absolute_value": r"lr\(\s*\\?\||\\\|",
    "trig": r"\b(sin|cos|tan|cot|sec|csc)\b",
    "exp_log": r"\bln\b|\blog\b|\be\s*\^|attach\(e,",
    "piecewise": r"cases\(",
    "function_notation": r"\b[fghs]\s*(\\?\()",
    "inequality": r"<|>|<=|>=|≤|≥",
    "pi": r"\bpi\b|π",
    "derivative_prime": r"[a-z]\s*'|′",
    "derivative_leibniz": r"frac\(d\s*[a-z]?,\s*d\s*x\)|dy/dx|d/dx",
    "integral": r"integral|∫",
    "summation": r"\bsum\b|∑",
    "interval": r"\[|\]|\\\[|\\\]",
}


def features(typst_math: str) -> set[str]:
    return {name for name, rx in FEATURES.items() if re.search(rx, typst_math)}


def _math_of_block(b: dict) -> list[str]:
    out = []

    def inl(lst):
        for i in lst or []:
            if i["k"] == "math":
                out.append(i["typ"])
            elif "c" in i:
                inl(i["c"])

    t = b["t"]
    if t == "para":
        inl(b.get("title"))
        inl(b["inl"])
    elif t == "equation":
        out.append(b["math"]["typ"])
    elif t == "figure":
        inl(b["caption"])
    elif t == "table":
        for r in b["rows"]:
            for c in r:
                inl(c["inl"])
    elif t in ("box", "example", "section"):
        inl(b.get("title"))
    return out


@lru_cache(maxsize=1)
def registry() -> dict:
    """{"first": {feature: (position, section, block id)}, "positions": {block id: position},
    "sections": {number: (first position, last position)}}"""
    from .extract import load_chapter

    first: dict[str, tuple[int, str, str]] = {}
    pos = 0
    positions, sections = {}, {}
    for mod in load_chapter():
        start = pos
        for b in cnxml.walk(mod.blocks):
            key = b.get("id") or f"{mod.module_id}#{pos}"
            positions.setdefault(key, pos)  # ids are not always unique across modules
            for m in _math_of_block(b):
                for f in features(m):
                    if f not in first:
                        first[f] = (pos, mod.number, key)
            pos += 1
        sections[mod.number] = (start, pos - 1)
    return {"first": first, "positions": positions, "sections": sections}


def introduced_by(position: int) -> set[str]:
    reg = registry()
    return BASELINE | {f for f, (p, _, _) in reg["first"].items() if p <= position}


def position_of(block_id: str) -> int:
    return registry()["positions"][block_id]


def end_of_section(number: str) -> int:
    """Registry position of the last block of a section (e.g. "2.3")."""
    return registry()["sections"][number][1]


# What a reader of an algebra refresh can be assumed to know without the excerpt itself.
BASELINE_FOUNDATION = {"fraction", "power", "function_notation", "inequality", "interval", "pi"}


def features_in_blocks(blocks: list[dict]) -> set[str]:
    """Notation used by canonical math in these blocks (and everything nested in them)."""
    used = set()
    for b in cnxml.walk(blocks):
        for m in _math_of_block(b):
            used |= features(m)
    return used


def check_allowed(typst_texts: list[str], allowed: set[str]) -> tuple[bool, set[str]]:
    used = set()
    for t in typst_texts:
        for m in re.findall(r"\$([^$]*)\$", t):
            used |= features(m)
    bad = used - allowed
    return (not bad), bad


def check(typst_texts: list[str], position: int) -> tuple[bool, set[str]]:
    """Every math segment must use only notation introduced by `position`."""
    allowed = introduced_by(position)
    used = set()
    for t in typst_texts:
        for m in re.findall(r"\$([^$]*)\$", t):
            used |= features(m)
    bad = used - allowed
    return (not bad), bad
