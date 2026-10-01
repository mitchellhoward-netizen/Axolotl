"""Parse OpenStax CNXML modules into a small intermediate representation (IR).

The IR keeps every character of canonical text. Inline math is converted to
Typst (for rendering) and a plain linear form (for detection). Cross-references
(<link target-id=.../>) become the label the book prints ("Figure 2.12").

Block kinds: heading, para, equation, list, figure, table, box, example,
exercise, section. Inline kinds: text, em, math, sup, sub, term, ref, br.
"""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path

from . import mathml
from .source import BOOKS, CHAPTER_NUMBER, Book, Module

C = "{http://cnx.rice.edu/cnxml}"
MD = "{http://cnx.rice.edu/mdml}"
M = mathml.M


def local(tag: str) -> str:
    return tag.split("}", 1)[-1]


@dataclass
class ModuleIR:
    module_id: str
    number: str  # "2", "2.1", ...
    title: str
    objectives: list[str]
    blocks: list[dict]
    glossary: list[dict] = field(default_factory=list)
    book: str = "calc1"
    chapter: int = CHAPTER_NUMBER


NOTE_SKIP = ("be-prepared", "manipulative-math", "media", "project", "links-to-literacy")


def note_kind(cls: str, title_text: str) -> str:
    """Normalize the box classes used across OpenStax books."""
    tokens = cls.split()
    if any(t in ("checkpoint", "try") for t in tokens):
        return "checkpoint"          # Calculus "Checkpoint", Algebra/Prealgebra "Try It"
    if "theorem" in tokens:
        return "theorem"
    if "problem-solving" in tokens:
        return "problem-solving"
    if any(t.startswith("how-to") or t == "howto" for t in tokens):
        return "howto"
    if "qa" in tokens:
        return "qa"
    if any(t.startswith("media") for t in tokens):
        return "media"
    if any(t in NOTE_SKIP for t in tokens):
        return "aside"
    if title_text.startswith("Definition"):
        return "definition"
    return "note"


class Numbering:
    """Labels the way each OpenStax web book prints them.

    Calculus numbers across a chapter ("Example 2.13", "Checkpoint 2.13");
    Algebra and Trigonometry restarts in every section ("Example 3", "Try It #3").
    """

    def __init__(self, book: Book | None = None) -> None:
        self.book = book or BOOKS["calc1"]
        self.labels: dict[tuple[str, str], str] = {}   # (module id, element id) -> label
        self.by_id: dict[str, str] = {}                 # element id -> label (first seen), for cross-module links
        self.counts: dict[str, int] = {}
        self._scope = None

    def get(self, module_id: str, eid: str | None) -> str | None:
        if not eid:
            return None
        return self.labels.get((module_id, eid)) or self.by_id.get(eid)

    def scan(self, root: ET.Element, chapter: int = CHAPTER_NUMBER, module_id: str = "") -> None:
        scope = chapter if self.book.numbering == "chapter" else module_id
        if scope != self._scope:
            self.counts = {"Figure": 0, "Table": 0, "Example": 0, "Checkpoint": 0}
            self._scope = scope
        for el in root.iter():
            tag = local(el.tag)
            eid = el.get("id")
            kind = None
            if tag == "figure" and "splash" not in (el.get("class") or ""):
                kind = "Figure"
            elif tag == "table" and "unnumbered" not in (el.get("class") or ""):
                kind = "Table"
            elif tag == "example":
                kind = "Example"
            elif tag == "note" and note_kind(el.get("class") or "", "") == "checkpoint":
                kind = "Checkpoint"
            if kind and eid:
                self.counts[kind] += 1
                n = self.counts[kind]
                name = self.book.try_label if kind == "Checkpoint" else kind
                if self.book.numbering == "chapter":
                    label = f"{name} {chapter}.{n}"
                else:
                    label = f"{name} #{n}" if kind == "Checkpoint" else f"{name} {n}"
                self.labels[(module_id, eid)] = label
                self.by_id.setdefault(eid, label)


class Parser:
    def __init__(self, numbering: Numbering, module_number: str, module_id: str = "") -> None:
        self.num = numbering
        self.module_number = module_number
        self.mid = module_id

    def label(self, eid):
        """This element's own label (never borrowed: ids repeat across modules)."""
        return self.num.labels.get((self.mid, eid)) if eid else None

    def ref_label(self, tid):
        """Label for a link target: this module first, then anywhere in the book."""
        return self.num.get(self.mid, tid)

    # ----- inline -----
    def inlines(self, el: ET.Element, include_tail_of_children: bool = True) -> list[dict]:
        out: list[dict] = []
        if el.text:
            out.append({"k": "text", "s": el.text})
        for ch in el:
            out.extend(self.inline(ch))
            if ch.tail:
                out.append({"k": "text", "s": ch.tail})
        return _merge_text(out)

    def inline(self, el: ET.Element) -> list[dict]:
        tag = local(el.tag)
        if el.tag == M + "math":
            return [math_inline(el)]
        if tag == "emphasis":
            return [{"k": "em", "style": el.get("effect", "italics"), "c": self.inlines(el)}]
        if tag == "term":
            return [{"k": "term", "c": self.inlines(el)}]
        if tag in ("sup", "sub"):
            return [{"k": tag, "c": self.inlines(el)}]
        if tag == "newline":
            return [{"k": "br"}]
        if tag == "space":
            return [{"k": "text", "s": " "}]
        if tag == "link":
            kids = self.inlines(el)
            if kids:
                return [{"k": "em", "style": "link", "c": kids}]
            tid = el.get("target-id")
            if tid and self.ref_label(tid):
                return [{"k": "ref", "s": self.ref_label(tid)}]
            if el.get("document") and not tid:
                return [{"k": "ref", "s": "another chapter"}]
            return [{"k": "ref", "s": "the text"}]
        if tag in ("label", "title"):
            return []
        if tag == "media":
            img = el.find(C + "image")
            if img is not None and img.get("src"):
                return [{"k": "img", "src": Path(img.get("src")).name, "alt": el.get("alt", "")}]
            return []
        # Fallback: keep text of unknown inline wrappers (foreign, quote, code...)
        return self.inlines(el)

    # ----- blocks -----
    def blocks(self, el: ET.Element) -> list[dict]:
        out: list[dict] = []
        pending: list[dict] = []
        if el.text and el.text.strip():
            pending.append({"k": "text", "s": el.text})
        for ch in el:
            b = self.block(ch)
            if b is None:
                pending.extend(self.inline(ch))
            else:
                if pending and any(i.get("s", "x").strip() for i in pending):
                    out.append({"t": "para", "id": None, "inl": _merge_text(pending)})
                pending = []
                if b:
                    out.extend(b)
            if ch.tail and ch.tail.strip():
                pending.append({"k": "text", "s": ch.tail})
        if pending and any(i.get("s", "x").strip() for i in pending):
            out.append({"t": "para", "id": None, "inl": _merge_text(pending)})
        return out

    def block(self, el: ET.Element) -> list[dict] | None:
        """Return a list of blocks, [] to drop, or None when the element is inline."""
        tag = local(el.tag)
        eid = el.get("id")
        if tag == "para":
            title = el.find(C + "title")
            if any(local(ch.tag) in ("table", "list") for ch in el):
                # a table or list nested in a paragraph (worked-solution step tables): lift it out
                out, pending = [], ([{"k": "text", "s": el.text}] if el.text else [])

                def flush():
                    if pending and any(i.get("s", "x").strip() for i in pending):
                        out.append({"t": "para", "id": eid if not out else None, "inl": _merge_text(list(pending))})
                    pending.clear()

                for ch in el:
                    if local(ch.tag) in ("table", "list"):
                        flush()
                        out.extend(self.block(ch) or [])
                    else:
                        pending.extend(self.inline(ch))
                    if ch.tail:
                        pending.append({"k": "text", "s": ch.tail})
                flush()
                if title is not None and out and out[0]["t"] == "para":
                    out[0]["title"] = self.inlines(title)
                return out
            b = {"t": "para", "id": eid, "inl": self.inlines(el)}
            if title is not None:
                b["title"] = self.inlines(title)
            return [b]
        if tag == "title":
            return []
        if tag == "equation":
            m = el.find(M + "math")
            return [{"t": "equation", "id": eid, "math": math_inline(m)}] if m is not None else []
        if tag == "list":
            items = []
            for it in el.findall(C + "item"):
                items.append(self.blocks(it) if any(local(c.tag) in BLOCK_TAGS for c in it) else
                             [{"t": "para", "id": None, "inl": self.inlines(it)}])
            title = el.find(C + "title")
            return [{
                "t": "list", "id": eid,
                "ordered": el.get("list-type") == "enumerated",
                "style": el.get("number-style") or el.get("bullet-style") or "",
                "title": self.inlines(title) if title is not None else None,
                "items": items,
            }]
        if tag == "figure":
            imgs, alts = [], []
            for media in el.iter(C + "media"):
                img = media.find(C + "image")
                if img is not None:
                    imgs.append(Path(img.get("src")).name)
                    alts.append(media.get("alt", ""))
            cap = el.find(C + "caption")
            return [{
                "t": "figure", "id": eid, "images": imgs, "alt": alts,
                "caption": self.inlines(cap) if cap is not None else [],
                "label": self.label(eid),
                "splash": "splash" in (el.get("class") or ""),
            }]
        if tag == "media":
            img = el.find(C + "image")
            if img is None:
                return []
            return [{"t": "figure", "id": eid, "images": [Path(img.get("src")).name],
                     "alt": [el.get("alt", "")], "caption": [], "label": None, "splash": False}]
        if tag == "table":
            rows, header = [], 0
            for tg in el.findall(C + "tgroup"):
                for part in tg:
                    p = local(part.tag)
                    if p not in ("thead", "tbody"):
                        continue
                    for row in part.findall(C + "row"):
                        cells = []
                        for entry in row.findall(C + "entry"):
                            cells.append({
                                "inl": self.inlines(entry),
                                "morerows": int(entry.get("morerows", 0)),
                            })
                        rows.append(cells)
                        if p == "thead":
                            header += 1
            title = el.find(C + "title")
            return [{
                "t": "table", "id": eid, "rows": rows, "header_rows": header,
                "label": self.label(eid),
                "title": self.inlines(title) if title is not None else None,
                "unstyled": "unstyled" in (el.get("class") or ""),
            }]
        if tag == "note":
            cls = el.get("class") or ""
            title_el = el.find(C + "title")
            title = self.inlines(title_el) if title_el is not None else []
            title_text = plain(title)
            kind = note_kind(cls, title_text)
            return [{
                "t": "box", "id": eid, "kind": kind, "title": title,
                "label": self.label(eid),
                "blocks": self.blocks(el),
            }]
        if tag == "example":
            title_el = el.find(C + "title")
            ex = el.find(C + "exercise")
            problem, solution = [], []
            if ex is not None:
                pr = ex.find(C + "problem")
                so = ex.find(C + "solution")
                problem = self.blocks(pr) if pr is not None else []
                solution = self.blocks(so) if so is not None else []
            if title_el is None and ex is not None and ex.find(C + "problem") is not None:
                title_el = ex.find(C + "problem").find(C + "title")
            rest = [c for c in el if local(c.tag) not in ("title", "exercise")]
            extra = []
            for c in rest:
                extra.extend(self.block(c) or [])
            return [{
                "t": "example", "id": eid, "label": self.label(eid),
                "title": self.inlines(title_el) if title_el is not None else [],
                "problem": problem, "solution": solution, "after": extra,
            }]
        if tag == "exercise":
            pr = el.find(C + "problem")
            so = el.find(C + "solution")
            return [{
                "t": "exercise", "id": eid,
                "problem": self.blocks(pr) if pr is not None else [],
                "solution": self.blocks(so) if so is not None else [],
            }]
        if tag == "section":
            title_el = el.find(C + "title")
            return [{
                "t": "section", "id": eid, "class": el.get("class") or "",
                "title": self.inlines(title_el) if title_el is not None else [],
                "blocks": self.blocks(el),
            }]
        if tag in ("glossary", "metadata", "label"):
            return []
        if tag in ("problem", "solution", "commentary", "content", "item"):
            return self.blocks(el)
        if el.tag == M + "math" or tag in INLINE_TAGS:
            return None
        return self.blocks(el)


BLOCK_TAGS = {"para", "equation", "list", "figure", "table", "note", "example", "exercise",
              "section", "media"}
INLINE_TAGS = {"emphasis", "term", "sup", "sub", "link", "newline", "space", "foreign",
               "quote", "code", "span"}


def math_inline(m: ET.Element) -> dict:
    return {"k": "math", "typ": mathml.to_typst(m), "plain": mathml.to_plain(m),
            "display": m.get("display") == "block"}


def _merge_text(inl: list[dict]) -> list[dict]:
    out: list[dict] = []
    for i in inl:
        if i["k"] == "text" and out and out[-1]["k"] == "text":
            out[-1] = {"k": "text", "s": out[-1]["s"] + i["s"]}
        else:
            out.append(i)
    return out


def plain(inl: list[dict] | None, math: bool = True) -> str:
    """Linear text of an inline list (math as its plain form)."""
    if not inl:
        return ""
    parts = []
    for i in inl:
        k = i["k"]
        if k == "text":
            parts.append(i["s"])
        elif k == "math":
            parts.append(i["plain"] if math else " ")
        elif k in ("em", "term", "sup", "sub"):
            parts.append(plain(i["c"], math))
        elif k == "ref":
            parts.append(i["s"])
        elif k == "br":
            parts.append("\n")
    return re.sub(r"[ \t]+", " ", "".join(parts))


def block_plain(b: dict, math: bool = True) -> str:
    """Linear text of a block tree."""
    t = b["t"]
    if t == "para":
        return plain(b.get("title"), math) + " " + plain(b["inl"], math)
    if t == "equation":
        return b["math"]["plain"] if math else ""
    if t == "list":
        return "\n".join(block_plain(x, math) for item in b["items"] for x in item)
    if t == "figure":
        return plain(b["caption"], math)
    if t == "table":
        return "\n".join(" | ".join(plain(c["inl"], math) for c in r) for r in b["rows"])
    if t == "box":
        return plain(b["title"], math) + "\n" + "\n".join(block_plain(x, math) for x in b["blocks"])
    if t == "example":
        return (plain(b["title"], math) + "\n" +
                "\n".join(block_plain(x, math) for x in b["problem"] + b["solution"] + b["after"]))
    if t == "exercise":
        return "\n".join(block_plain(x, math) for x in b["problem"] + b["solution"])
    if t == "section":
        return plain(b["title"], math) + "\n" + "\n".join(block_plain(x, math) for x in b["blocks"])
    return ""


def walk(blocks: list[dict]):
    """Yield every block in document order (depth first)."""
    for b in blocks:
        yield b
        t = b["t"]
        if t in ("box", "section"):
            yield from walk(b["blocks"])
        elif t == "example":
            yield from walk(b["problem"] + b["solution"] + b["after"])
        elif t == "exercise":
            yield from walk(b["problem"] + b["solution"])
        elif t == "list":
            for item in b["items"]:
                yield from walk(item)


def source_text(el: ET.Element) -> str:
    """Every character of text content in a CNXML element, math excluded.

    Used by the verbatim audit: the IR (and the rendered PDF) must reproduce it.
    """
    parts = []

    def rec(e):
        if e.tag.startswith(M):
            parts.append(" ")
            if e.tail:
                parts.append(e.tail)
            return
        if local(e.tag) in ("label",):
            if e.tail:
                parts.append(e.tail)
            return
        if e.text:
            parts.append(e.text)
        for c in e:
            rec(c)
        if e.tail:
            parts.append(e.tail)

    if el.text:
        parts.append(el.text)
    for c in el:
        rec(c)
    return " ".join("".join(parts).split())


def parse_modules(modules: list[Module]) -> list[ModuleIR]:
    """Parse the modules of one book (in book order) into IR."""
    if not modules:
        return []
    roots = [(m, ET.parse(m.path).getroot()) for m in modules]
    num = Numbering(BOOKS[modules[0].book])
    for m, r in roots:
        num.scan(r, m.chapter, m.module_id)
    out = []
    for m, r in roots:
        p = Parser(num, m.section_number, m.module_id)
        title = r.find(C + "title").text
        abstract = r.find(f"{C}metadata/{MD}abstract")
        objectives = ([" ".join("".join(it.itertext()).split()) for it in abstract.iter(C + "item")]
                      if abstract is not None else [])
        content = r.find(C + "content")
        blocks = p.blocks(content)
        glossary = []
        g = r.find(C + "glossary")
        if g is not None:
            for d in g.findall(C + "definition"):
                term = d.find(C + "term")
                meaning = d.find(C + "meaning")
                glossary.append({"id": d.get("id"),
                                 "term": " ".join("".join(term.itertext()).split()),
                                 "meaning": p.inlines(meaning) if meaning is not None else []})
        out.append(ModuleIR(m.module_id, m.section_number, title, objectives, blocks, glossary,
                            book=m.book, chapter=m.chapter))
    return out


parse_chapter = parse_modules


def element_index(modules: list[Module]) -> dict[str, tuple[str, ET.Element]]:
    """id -> (module_id, element) over the whole chapter, for audits."""
    idx = {}
    for m in modules:
        r = ET.parse(m.path).getroot()
        for el in r.iter():
            if el.get("id"):
                idx[el.get("id")] = (m.module_id, el)
    return idx
