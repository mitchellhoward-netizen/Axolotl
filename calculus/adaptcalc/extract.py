"""Extract the skill graph (skills.json) and misconception library (misconceptions.json).

Pipeline:
  1. fetch + parse Chapter 2 CNXML (source.py, cnxml.py)
  2. load the curated ontology (ontology.yaml)
  3. resolve every anchor against the parsed chapter: learning objectives
     (verbatim), example/box titles -> element ids + labels, glossary terms,
     misconception source passages; detectors find where foundation skills
     are exercised in the chapter's examples and exercises
  4. validate: every anchor resolves, prerequisites exist, graph is acyclic
  5. write JSON (deterministic ordering)
"""
from __future__ import annotations

import json
import re
from collections import defaultdict
from functools import lru_cache

import yaml

from . import cnxml, paths, source


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


@lru_cache(maxsize=1)
def load_chapter() -> tuple[cnxml.ModuleIR, ...]:
    """Calculus Volume 1, Chapter 2: the course."""
    return load_book("calc1")


@lru_cache(maxsize=None)
def load_book(book: str) -> tuple[cnxml.ModuleIR, ...]:
    return tuple(cnxml.parse_modules(source.fetch_book(book)))


def module(book: str, number: str) -> cnxml.ModuleIR:
    for m in load_book(book):
        if m.number == number:
            return m
    raise KeyError(f"{book} section {number} not loaded")


OPENING = "(opening)"


def find_subsection(mod: cnxml.ModuleIR, title: str) -> dict | None:
    """A <section> block anywhere in the module whose title matches (ignoring case and punctuation).

    "(opening)" is the section's untitled opening: the blocks before its first subsection
    (without the "Be Prepared" asides), as one synthetic section.
    """
    if title == OPENING:
        blocks = []
        for b in mod.blocks:
            if b["t"] == "section":
                break
            if b["t"] == "box" and b.get("kind") in ("aside", "media"):
                continue
            blocks.append(b)
        return {"t": "section", "id": f"{mod.module_id}-opening", "title": [], "blocks": blocks} if blocks else None
    for b in cnxml.walk(mod.blocks):
        if b["t"] == "section" and norm(cnxml.plain(b["title"])) == norm(title):
            return b
    return None


def load_ontology() -> dict:
    return yaml.safe_load(paths.ONTOLOGY_YAML.read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------
# Items: examples, checkpoints and exercises, with their section context.

def items(chapter) -> list[dict]:
    out = []
    for mod in chapter:
        def rec(blocks, section_title):
            for b in blocks:
                t = b["t"]
                if t == "section":
                    rec(b["blocks"], cnxml.plain(b["title"]) or section_title)
                elif t == "example":
                    out.append({"module": mod.module_id, "section": mod.number, "id": b["id"],
                                "type": "example", "label": b["label"], "title": cnxml.plain(b["title"]),
                                "text": cnxml.block_plain(b), "subsection": section_title})
                elif t == "box" and b["kind"] == "checkpoint":
                    out.append({"module": mod.module_id, "section": mod.number, "id": b["id"],
                                "type": "checkpoint", "label": b["label"], "title": "",
                                "text": cnxml.block_plain(b), "subsection": section_title})
                elif t == "exercise":
                    out.append({"module": mod.module_id, "section": mod.number, "id": b["id"],
                                "type": "exercise", "label": None, "title": "",
                                "text": cnxml.block_plain(b), "subsection": section_title})
                elif t == "box":
                    rec(b["blocks"], section_title)
        rec(mod.blocks, mod.title)
    return out


def boxes(chapter) -> list[dict]:
    out = []
    for mod in chapter:
        def rec(blocks, section_title):
            for b in blocks:
                if b["t"] == "section":
                    rec(b["blocks"], cnxml.plain(b["title"]) or section_title)
                elif b["t"] == "box" and b["kind"] in ("definition", "theorem", "problem-solving", "note"):
                    out.append({"module": mod.module_id, "section": mod.number, "id": b["id"],
                                "kind": b["kind"], "title": cnxml.plain(b["title"]),
                                "subsection": section_title, "text": cnxml.block_plain(b)})
        rec(mod.blocks, mod.title)
    return out


# ---------------------------------------------------------------------------
# Detectors: where a (usually foundation) skill is exercised in the chapter.
# They run on the plain linear text of an item (math linearized by mathml.py).

LIM = r"lim_\("


def _has(p):
    rx = re.compile(p, re.S)
    return lambda t: bool(rx.search(t))


DETECTORS = {
    "evaluate_at_point": _has(r"\b[fghp]\(\s*[−-]?\d"),
    "piecewise": _has(r"\{ [^{}]*;"),
    "slope_quotient": _has(r"secant|average velocity|\(f\(x\)\s*-\s*f\(|\(s\(t\)|[Ss]lope"),
    "factorable_rational": _has(LIM + r".*\)\s*\(.*\^\((2|3)\).*\)/\(.*[a-z]"),
    "radical_in_fraction": _has(LIM + r".*sqrt\(.*/|" + LIM + r".*/\(.*sqrt\("),
    "nested_fraction": lambda t: bool(re.search(LIM, t)) and len(re.findall(r"\)/\(", t)) >= 2 and "((" in t,
    "absolute_value": _has(r"\|[^|]+\|"),
    "rational_function": _has(r"/\([^)]*[a-z]"),
    "infinite_result": _has(r"∞"),
    "epsilon_delta": _has(r"δ|ε"),
    "trig_at_special_angle": _has(r"(sin|cos|tan|cot|sec|csc)\W{0,3}\(?[^a-z]{0,6}π"),
    "trig_ratio": _has(r"(sin|cos|tan)[^\n]{0,40}\)/\(|\)/\([^\n]{0,20}(sin|cos|tan)"),
    "unknown_constant_piecewise": lambda t: "{ " in t and bool(re.search(r"\b[kc]\b", t)) and "continuous" in t,
    "numeric_fraction": _has(r"\(\s*-?\d+\s*\)/\(\s*\d+\s*\)"),
    "exponent": _has(r"\^\(\s*-?\d+\s*\)"),
    "binomial_product": _has(r"\([a-z]\s*[-+−]\s*\d+\)\s*\(\s*[a-z]\s*[-+−]"),
}


def resolve_lesson(sk: dict) -> tuple[list[dict], list[str], list[dict]]:
    """Resolve a foundation skill's lesson against its book: subsections to print, the worked
    examples / Try Its / How Tos inside them, and the section's matching learning objectives."""
    parts, anchors, objectives = [], [], []
    for part in sk["lesson"]:
        mod = module(part["book"], part["section"])
        subs = []
        for title in part["subsections"]:
            sec = find_subsection(mod, title)
            if sec is None:
                raise ValueError(f"{sk['id']}: subsection {title!r} not found in {part['book']} {part['section']}")
            subs.append({"id": sec["id"], "title": cnxml.plain(sec["title"]).strip()})
            for b in cnxml.walk(sec["blocks"]):
                if b["t"] == "example" or (b["t"] == "box" and b["kind"] in ("checkpoint", "howto", "note", "definition")):
                    kind = "example" if b["t"] == "example" else ("checkpoint" if b["kind"] == "checkpoint" else "box")
                    anchors.append({"book": part["book"], "module": mod.module_id, "section": part["section"],
                                    "id": b["id"], "type": kind, "label": b.get("label"),
                                    "title": cnxml.plain(b.get("title")).strip()})
        for rx in part.get("objectives", []):
            hits = [o for o in mod.objectives if re.search(rx, o, re.I)]
            if not hits:
                raise ValueError(f"{sk['id']}: objective /{rx}/ not found in {part['book']} {part['section']}")
            objectives += [h for h in hits if h not in objectives]
        parts.append({"book": part["book"], "section": part["section"], "module": mod.module_id,
                      "title": mod.title, "url": f"{source.book_url(part['book'])}", "subsections": subs})
    if not any(a["type"] == "example" for a in anchors):
        raise ValueError(f"{sk['id']}: lesson has no worked examples")
    return parts, anchors, objectives


# ---------------------------------------------------------------------------

def resolve_skill(sk: dict, chapter, all_items, all_boxes) -> dict:
    mods = {m.number: m for m in chapter}
    anchors, objectives, glossary, problems = [], [], [], []

    sec = sk.get("section")
    if sec:
        mod = mods[sec]
        for rx in sk.get("objectives", []):
            hits = [o for o in mod.objectives if re.search(rx, o, re.I)]
            if not hits:
                raise ValueError(f"{sk['id']}: objective /{rx}/ not found in {sec}")
            objectives.extend(h for h in hits if h not in objectives)

        for title in sk.get("examples", []):
            hits = [i for i in all_items if i["type"] == "example" and i["section"] == sec
                    and norm(i["title"]) == norm(title)]
            if not hits:
                raise ValueError(f"{sk['id']}: example {title!r} not found in {sec}")
            for h in hits:
                anchors.append({k: h[k] for k in ("module", "section", "id", "type", "label", "title")})
                # the checkpoint that immediately follows an example in the book
                pos = all_items.index(h)
                for nxt in all_items[pos + 1:pos + 3]:
                    if nxt["type"] == "checkpoint" and nxt["section"] == sec:
                        anchors.append({k: nxt[k] for k in ("module", "section", "id", "type", "label")}
                                       | {"title": "Checkpoint following " + (h["label"] or "")})
                        break

        for spec in sk.get("boxes", []):
            want_sub, idx = None, None
            title = spec
            if "@" in spec:
                title, want_sub = spec.split("@", 1)
                if "#" in want_sub:
                    want_sub, idx = want_sub.split("#")
                    idx = int(idx)
            hits = [b for b in all_boxes if b["section"] == sec and norm(b["title"]) == norm(title)
                    and (want_sub is None or norm(b["subsection"]) == norm(want_sub))]
            if idx is not None:
                hits = hits[idx - 1:idx]
            if not hits:
                raise ValueError(f"{sk['id']}: box {spec!r} not found in {sec}")
            for h in hits:
                anchors.append({"module": h["module"], "section": sec, "id": h["id"], "type": "box",
                                "kind": h["kind"], "label": None,
                                "title": h["title"] + (f" ({h['subsection']})" if h["title"] == "Definition" else "")})

        for term in sk.get("glossary", []):
            hits = [g for g in mod.glossary if norm(g["term"]) == norm(term)]
            if not hits:
                raise ValueError(f"{sk['id']}: glossary term {term!r} not found in {sec}")
            for g in hits:
                glossary.append({"term": g["term"], "id": g["id"], "meaning": cnxml.plain(g["meaning"]).strip()})

    for det in sk.get("detect", []):
        fn = DETECTORS[det]
        for it in all_items:
            if fn(it["text"]):
                problems.append(it["id"])
    anchored_items = {a["id"] for a in anchors}
    problems = [p for p in dict.fromkeys(problems) if p not in anchored_items]
    lesson = []
    if sk.get("lesson"):
        lesson, lesson_anchors, lesson_objectives = resolve_lesson(sk)
        anchors += lesson_anchors
        objectives += lesson_objectives

    out = {
        "id": sk["id"],
        "name": sk["name"],
        "kind": sk["kind"],
        "section": sec,
        "book": "calc1" if sk["kind"] == "chapter" else (lesson[0]["book"] if lesson else None),
        "origin": sk.get("origin") or f"Section {sec}",
        "lesson": lesson,
        "prerequisites": sk.get("prerequisites", []),
        "learning_objectives": objectives,
        "anchors": anchors,
        "glossary": glossary,
        "exercised_in": {"count": len(problems), "ids": problems[:25]},
    }
    if sk["kind"] == "foundation" and not problems and chapter:
        raise ValueError(f"{sk['id']}: foundation skill not detected anywhere in the chapter")
    if not chapter:  # a book course: every skill is taught from its lesson
        out["book"] = lesson[0]["book"]
        out["origin"] = sk.get("origin") or ", ".join(f"{source.BOOKS[p['book']].title} {p['section']}" for p in lesson)
    if sk["kind"] == "chapter" and not anchors and not problems:
        raise ValueError(f"{sk['id']}: chapter skill has no anchors")
    return out


def topo_order(skills: list[dict]) -> list[str]:
    ids = {s["id"] for s in skills}
    deps = {s["id"]: list(s["prerequisites"]) for s in skills}
    for s, ps in deps.items():
        for p in ps:
            if p not in ids:
                raise ValueError(f"{s}: unknown prerequisite {p}")
    order, state = [], {}

    def visit(n, stack=()):
        if state.get(n) == 2:
            return
        if state.get(n) == 1:
            raise ValueError("cycle: " + " -> ".join(stack + (n,)))
        state[n] = 1
        for p in deps[n]:
            visit(p, stack + (n,))
        state[n] = 2
        order.append(n)

    for s in skills:
        visit(s["id"])
    return order


def resolve_misconceptions(onto: dict, chapter, skill_ids: set[str], all_items) -> dict:
    out = {}
    for skill, lst in onto["misconceptions"].items():
        if skill not in skill_ids:
            raise ValueError(f"misconceptions for unknown skill {skill}")
        entries = []
        for m in lst:
            if m["root"] not in skill_ids:
                raise ValueError(f"misconception {m['id']}: unknown root {m['root']}")
            e = {"id": f"{skill}.{m['id']}", "skill": skill, "root_skill": m["root"],
                 "description": m["desc"]}
            if m.get("source"):
                hits = [i for i in all_items if m["source"] in i["text"]]
                if not hits:
                    raise ValueError(f"misconception {m['id']}: source text not found")
                h = hits[0]
                e["source"] = {"module": h["module"], "section": h["section"], "id": h["id"],
                               "text": " ".join(h["text"].split())}
            entries.append(e)
        out[skill] = entries
    missing = skill_ids - set(out)
    if missing:
        raise ValueError(f"skills without a misconception library: {sorted(missing)}")
    return out


def build(write: bool = True) -> tuple[dict, dict]:
    onto = load_ontology()
    meta = onto.get("course")
    chapter = () if meta else load_chapter()
    all_items = items(chapter) if chapter else []
    all_boxes = boxes(chapter) if chapter else []
    skills = [resolve_skill(sk, chapter, all_items, all_boxes) for sk in onto["skills"]]
    order = topo_order(skills)
    by_id = {s["id"]: s for s in skills}
    dependents = defaultdict(list)
    for s in skills:
        for p in s["prerequisites"]:
            dependents[p].append(s["id"])
    depth = {}
    for sid in order:
        ps = by_id[sid]["prerequisites"]
        depth[sid] = 1 + max((depth[p] for p in ps), default=-1)
    from . import templates  # local import: templates import the skill ids

    for s in skills:
        s["dependents"] = dependents.get(s["id"], [])
        s["depth"] = depth[s["id"]]
        s["templates"] = [t.id for t in templates.for_skill(s["id"])]
    misconceptions = resolve_misconceptions(onto, chapter, set(by_id), all_items)
    for s in skills:
        s["misconceptions"] = [m["id"] for m in misconceptions[s["id"]]]

    if meta:
        books = meta["books"]
        src = {"course": meta["id"], "title": meta["title"], "subtitle": meta.get("subtitle", ""),
               "books": [{"id": b, "title": source.BOOKS[b].title, "url": source.book_url(b),
                          "repository": source.raw(b), "license": source.BOOKS[b].license,
                          "commercial": source.BOOKS[b].commercial} for b in books],
               "commercial": all(source.BOOKS[b].commercial for b in books)}
    else:
        src = {"course": "calc_limits", "title": "Calculus: Limits", "subtitle": "Calculus Volume 1, Chapter 2",
               "book": "Calculus Volume 1 (OpenStax)", "chapter": 2,
               "url": source.BOOK_URL, "repository": source.RAW,
               "modules": [{"id": m.module_id, "section": m.number, "title": m.title} for m in chapter],
               "license": "CC BY-NC-SA 4.0", "commercial": False}
    skills_doc = {
        "source": src,
        "topological_order": order,
        "skills": [by_id[i] for i in order],
    }
    mis_doc = {"source": skills_doc["source"], "misconceptions": misconceptions}
    if write:
        paths.SKILLS_JSON.write_text(json.dumps(skills_doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        paths.MISCONCEPTIONS_JSON.write_text(json.dumps(mis_doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return skills_doc, mis_doc


# ---------------------------------------------------------------------------
# Readers used by the rest of the system.

_READ: dict[tuple, object] = {}


def _read(path, key: str):
    """JSON for the active course, re-read when the file changes (several courses share a process)."""
    st = path.stat()
    k = (str(path), st.st_mtime_ns, key)
    if k not in _READ:
        doc = json.loads(path.read_text(encoding="utf-8"))
        _READ[k] = {"skills": lambda: {s["id"]: s for s in doc["skills"]},
                    "order": lambda: doc["topological_order"],
                    "mis": lambda: doc["misconceptions"],
                    "source": lambda: doc.get("source", {})}[key]()
    return _READ[k]


def skills() -> dict[str, dict]:
    return _read(paths.SKILLS_JSON, "skills")


def skill_order() -> list[str]:
    return _read(paths.SKILLS_JSON, "order")


def course_source() -> dict:
    return _read(paths.SKILLS_JSON, "source")


def misconceptions() -> dict[str, list[dict]]:
    return _read(paths.MISCONCEPTIONS_JSON, "mis")
