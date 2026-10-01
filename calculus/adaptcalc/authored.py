"""Load a book written for Marginalia (YAML) into the same IR the OpenStax parser produces.

The elementary book has no outside source: it is written here, one YAML file per grade
(books/mk5/grade-K.yaml ... grade-5.yaml). Loading it into cnxml's block IR means everything
downstream (lesson packets, the verbatim audit, Try It answers in the key, the Jev gate) works
unchanged.

A module (one lesson section) looks like:

    - number: "3.2"
      title: Multiplication as Equal Groups
      objectives: [Multiply to find the total in equal groups]
      opening: [ ...blocks... ]          # optional, before the first subsection
      sections:
        - title: Equal Groups
          blocks: [ ...blocks... ]

Blocks (each a one-key mapping, or a plain string for a paragraph):

    p: text                       a paragraph
    draw: "tenframe(7) | a ten frame with 7 dots"   a figure (Typst call | words for it)
    eq: "3 times 4 = 12"          a displayed equation (Typst math)
    list: [text, ...]             ol: [text, ...]
    table: {header: [...], rows: [[...], ...]}
    def: {term: ..., text: ...}   a definition box
    howto: {title: ..., steps: [text, ...]}
    grownup: text | [blocks]      a note for the parent who reads the lesson with the child
    example: {title: ..., problem: text | [blocks], solution: [text | {step: text, work: text}]}
    try: {q: text | [blocks], a: text}

Inline text: $...$ is Typst math, \\$ is a dollar sign, {{call | words}} is an inline figure,
**bold** marks a new term, _italic_ is emphasis.
"""
from __future__ import annotations

import re
from pathlib import Path

import yaml

from . import paths
from .cnxml import ModuleIR
from .source import BOOKS

TOKEN = re.compile(r"(\\\$|\$[^$]+\$|\{\{.+?\}\}|\*\*.+?\*\*|(?<![\w])_[^_]+?_(?![\w]))")


def _math_plain(typ: str) -> str:
    from .templates import typ_to_plain

    return typ_to_plain(typ)


def inline(text: str) -> list[dict]:
    out: list[dict] = []
    for part in TOKEN.split(str(text)):
        if not part:
            continue
        if part == "\\$":
            out.append({"k": "text", "s": "$"})
        elif part.startswith("$") and part.endswith("$") and len(part) > 1:
            typ = part[1:-1].strip()
            out.append({"k": "math", "typ": typ, "plain": _math_plain(typ), "display": False})
        elif part.startswith("{{"):
            call, _, alt = part[2:-2].partition("|")
            out.append({"k": "draw", "typ": call.strip(), "alt": alt.strip() or "a picture"})
        elif part.startswith("**"):
            out.append({"k": "term", "c": inline(part[2:-2])})
        elif part.startswith("_") and part.endswith("_") and len(part) > 2:
            out.append({"k": "em", "style": "italics", "c": inline(part[1:-1])})
        else:
            out.append({"k": "text", "s": part})
    merged: list[dict] = []
    for i in out:
        if i["k"] == "text" and merged and merged[-1]["k"] == "text":
            merged[-1] = {"k": "text", "s": merged[-1]["s"] + i["s"]}
        else:
            merged.append(i)
    return merged


class _Loader:
    def __init__(self, book: str, chapter: int, module_number: str):
        self.book = book
        self.chapter = chapter
        self.num = module_number
        self.n = 0

    def nid(self, kind: str) -> str:
        self.n += 1
        return f"{self.book}-{self.num}-{kind}{self.n}"

    def para(self, text: str) -> dict:
        return {"t": "para", "id": self.nid("p"), "inl": inline(text)}

    def blocks(self, items) -> list[dict]:
        if items is None:
            return []
        if isinstance(items, str):
            return [self.para(items)]
        out: list[dict] = []
        steps: list[list[dict]] = []

        def flush():
            if steps:
                out.append({"t": "table", "id": self.nid("steps"), "rows": list(steps), "header_rows": 0,
                            "label": None, "title": None, "unstyled": True})
                steps.clear()

        for it in items:
            if isinstance(it, dict) and "step" in it:
                steps.append([{"inl": inline(it["step"]), "morerows": 0},
                              {"inl": inline(it.get("work", "")), "morerows": 0}])
                continue
            flush()
            out.extend(self.block(it))
        flush()
        return out

    def block(self, it) -> list[dict]:
        if isinstance(it, str):
            return [self.para(it)]
        if not isinstance(it, dict) or len(it) != 1:
            raise ValueError(f"{self.num}: a block is a one-key mapping, got {it!r}")
        (k, v), = it.items()
        if k == "p":
            return [self.para(v)]
        if k == "draw":
            call, _, alt = str(v).partition("|")
            return [{"t": "draw", "id": self.nid("fig"), "typ": call.strip(), "alt": alt.strip() or "a picture"}]
        if k == "eq":
            return [{"t": "equation", "id": self.nid("eq"),
                     "math": {"k": "math", "typ": v, "plain": _math_plain(v), "display": True}}]
        if k in ("list", "ol"):
            return [{"t": "list", "id": self.nid("list"), "ordered": k == "ol", "style": "", "title": None,
                     "items": [self.blocks(x) if isinstance(x, list) else [self.para(x)] for x in v]}]
        if k == "table":
            rows = [[{"inl": inline(c), "morerows": 0} for c in v["header"]]] if v.get("header") else []
            rows += [[{"inl": inline(c), "morerows": 0} for c in r] for r in v["rows"]]
            return [{"t": "table", "id": self.nid("table"), "rows": rows, "header_rows": 1 if v.get("header") else 0,
                     "label": None, "title": None, "unstyled": False}]
        if k == "def":
            return [{"t": "box", "id": self.nid("def"), "kind": "definition", "title": inline(v["term"]),
                     "label": None, "blocks": self.blocks(v["text"])}]
        if k == "howto":
            steps = [self.para(f"Step {i}. {s}") for i, s in enumerate(v["steps"], 1)]
            return [{"t": "box", "id": self.nid("howto"), "kind": "howto", "title": inline(v["title"]),
                     "label": None, "blocks": steps}]
        if k == "grownup":
            return [{"t": "box", "id": self.nid("grownup"), "kind": "note", "title": inline("For the grown-up"),
                     "label": None, "blocks": self.blocks(v)}]
        if k == "example":
            return [{"t": "example", "id": self.nid("ex"), "label": None, "title": inline(v.get("title", "")),
                     "problem": self.blocks(v["problem"]), "solution": self.blocks(v.get("solution")),
                     "after": self.blocks(v.get("after"))}]
        if k == "try":
            ex = {"t": "exercise", "id": self.nid("tryex"), "problem": self.blocks(v["q"]),
                  "solution": self.blocks(str(v["a"]))}
            return [{"t": "box", "id": self.nid("try"), "kind": "checkpoint", "title": [], "label": None,
                     "blocks": [ex]}]
        raise ValueError(f"{self.num}: unknown block {k!r}")


def chapter_label(chapter: int) -> str:
    return "K" if chapter == 0 else str(chapter)


def _number_labels(mods: list[ModuleIR], book: str) -> None:
    """Example K.3, Try It 2.14: numbered across each chapter (grade), as the algebra books do."""
    from .cnxml import walk

    counters: dict[tuple, int] = {}
    try_label = BOOKS[book].try_label
    for m in mods:
        for b in walk(m.blocks):
            if b["t"] == "example" or (b["t"] == "box" and b["kind"] == "checkpoint"):
                name = "Example" if b["t"] == "example" else try_label
                k = (m.chapter, name)
                counters[k] = counters.get(k, 0) + 1
                b["label"] = f"{name} {chapter_label(m.chapter)}.{counters[k]}"


def load(book: str) -> list[ModuleIR]:
    root = paths.ROOT / BOOKS[book].authored
    mods: list[ModuleIR] = []
    files = sorted(root.glob("grade-*.yaml"), key=lambda p: (p.stem != "grade-K", p.stem))
    for f in files:
        doc = yaml.safe_load(f.read_text(encoding="utf-8"))
        ch = int(doc["chapter"])
        for m in doc["modules"]:
            num = str(m["number"])
            ld = _Loader(book, ch, num)
            blocks = ld.blocks(m.get("opening"))
            for sec in m.get("sections", []):
                blocks.append({"t": "section", "id": ld.nid("sec"), "class": "",
                               "title": inline(sec["title"]), "blocks": ld.blocks(sec["blocks"])})
            mods.append(ModuleIR(f"{book}-{num}", num, m["title"], list(m.get("objectives", [])), blocks,
                                 book=book, chapter=ch))
    _number_labels(mods, book)
    return mods


def chapter_titles(book: str) -> dict[str, str]:
    """'K' -> 'Kindergarten', '3' -> 'Grade 3': the label a section number starts with, and its title."""
    out = {}
    for f in files(book):
        doc = yaml.safe_load(f.read_text(encoding="utf-8"))
        out[chapter_label(int(doc["chapter"]))] = doc["title"]
    return out


def files(book: str) -> list[Path]:
    return sorted((paths.ROOT / BOOKS[book].authored).glob("grade-*.yaml"))
