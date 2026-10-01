"""The bound book: a whole course as one textbook, for reading and flipping through.

A course's skills are taught from sections of one book (OpenStax, or our own elementary book).
The volume follows that book: its chapters and sections, with their own numbers, so "Example 4.83"
sits in Section 4.6 as it does in print. Each section prints the parts the course teaches (the
book's text, verbatim), then Exercises (verified templates, a few per skill), and the answers
(Try Its and exercises) are collected at the back, as textbooks do.

It is typeset once per course (the same Typst styles as the packets), checked with the verbatim
audit, and cut into page images that the reader in learn.html turns like pages. index.json maps
every skill to the page its section starts on, so a learner's book can open at their place.
"""
from __future__ import annotations

import hashlib
import json
import re
import threading
import zlib
from pathlib import Path

from . import cnxml, extract, paths, render, source, templates

EXERCISES_PER_SKILL = 4
PAGE_DPI = 150
_LOCK = threading.Lock()
_BUILDING: dict[str, str] = {}  # course -> "building" / error text


def volume_dir(course: str) -> Path:
    """On the data volume, so a printing survives redeploys that do not change the book."""
    return paths.DATA / "volumes" / course


def content_hash(course: str) -> str:
    """Everything the bound book is made from; a change to any of it means a new printing."""
    h = hashlib.sha256()
    files = [paths.course_dir(course) / "skills.json", paths.ROOT / "typst" / "textbook.typ",
             paths.ROOT / "typst" / "volume.typ", paths.ROOT / "typst" / "figures.typ"]
    here = Path(__file__).parent  # the code that decides what is printed and how
    files += [here / f for f in ("volume.py", "render.py", "cnxml.py", "mathml.py", "authored.py", "symtyp.py")]
    files += sorted(here.glob("templates*.py"))
    files += sorted((paths.ROOT / "books").rglob("*.yaml"))
    for f in files:
        if f.exists():
            h.update(f.name.encode())
            h.update(f.read_bytes())
    return h.hexdigest()[:16]


_INDEX: dict[str, tuple[float, dict | None]] = {}


def index(course: str) -> dict | None:
    """The current printing's index, or None when the book has not been bound (or is out of date).
    Checked against the sources at most every 30 seconds (every page image asks)."""
    import time

    hit = _INDEX.get(course)
    if hit and time.time() - hit[0] < 30:
        return hit[1]
    f = volume_dir(course) / "index.json"
    doc = json.loads(f.read_text(encoding="utf-8")) if f.exists() else None
    doc = doc if doc and doc.get("hash") == content_hash(course) else None
    _INDEX[course] = (time.time(), doc)
    return doc


def status(course: str) -> dict:
    idx = index(course)
    if idx:
        return {"ready": True}
    return {"ready": False, "building": _BUILDING.get(course) == "building", "error": _BUILDING.get(course)
            if _BUILDING.get(course) not in (None, "building") else None}


def bind_all_async() -> None:
    """At startup: bind every course whose printing is missing or out of date, one at a time."""
    for d in sorted(paths.COURSES_DIR.iterdir()):
        if (d / "skills.json").exists():
            ensure_async(d.name)


def ensure_async(course: str) -> None:
    """Bind the book in the background if it is missing (the web app calls this; warm binds them all)."""
    if index(course) or _BUILDING.get(course) == "building":
        return

    def run():
        try:
            with paths.use_course(course):
                build(course)
            _BUILDING.pop(course, None)
        except Exception as e:  # noqa: BLE001
            _BUILDING[course] = f"{type(e).__name__}: {e}"

    _BUILDING[course] = "building"
    threading.Thread(target=run, daemon=True).start()


# ---------------------------------------------------------------------------
# structure

def _num_key(n: str) -> tuple:
    return tuple((-1 if p == "K" else int(p)) if (p == "K" or p.isdigit()) else 99 for p in n.split("."))


def chapter_titles(book: str) -> dict[str, str]:
    if source.BOOKS[book].authored:
        from . import authored

        return authored.chapter_titles(book)
    return {str(ch): title for ch, _, _, title in source.chapter_modules(book)}


def outline() -> list[dict]:
    """Chapters -> sections -> the subsections to print and the skills taught there (active course)."""
    sk = extract.skills()
    src = extract.course_source()
    if not src.get("books"):  # the calculus chapter: its whole sections, in order
        chapter = extract.load_chapter()
        secs = [{"book": "calc1", "number": m.number, "title": m.title, "mod": m,
                 "parts": [b for b in m.blocks], "whole": True,
                 "skills": [s for s in extract.skill_order() if sk[s].get("section") == m.number]}
                for m in chapter if m.number != "2"]
        return [{"label": "2", "title": "Limits", "supplement": "Chapter 2", "sections": secs}]
    book = src["books"][0]["id"]
    titles = chapter_titles(book)
    by_sec: dict[str, dict] = {}
    for s in extract.skill_order():
        for part in sk[s].get("lesson") or []:
            num = part["section"]
            e = by_sec.setdefault(num, {"book": part["book"], "number": num, "skills": [], "subs": {}})
            if s not in e["skills"]:
                e["skills"].append(s)
            for sub in part["subsections"]:
                e["subs"].setdefault(sub["id"], sub["title"])
    chapters: dict[str, dict] = {}
    for num in sorted(by_sec, key=_num_key):
        e = by_sec[num]
        mod = extract.module(e["book"], num)
        e["mod"], e["title"] = mod, mod.title
        # the used subsections, in the book's own order
        order = [f"{mod.module_id}-opening"] + [b["id"] for b in cnxml.walk(mod.blocks) if b["t"] == "section"]
        ids = sorted(e["subs"], key=lambda i: order.index(i) if i in order else 999)
        e["parts"] = [extract.find_subsection(mod, e["subs"][i] or extract.OPENING) for i in ids]
        e["parts"] = [p for p in e["parts"] if p]
        ch = num.split(".")[0]
        title = titles.get(ch, "")
        if source.BOOKS[book].authored:
            c = chapters.setdefault(ch, {"label": ch, "title": title or ch, "supplement": "", "sections": []})
        else:
            c = chapters.setdefault(ch, {"label": ch, "title": title or f"Chapter {ch}", "supplement": f"Chapter {ch}",
                                         "sections": []})
        c["sections"].append(e)
    return list(chapters.values())


# ---------------------------------------------------------------------------
# typesetting

def exercises_for(skill: str) -> list[dict]:
    tpls = templates.for_skill(skill)
    if not tpls:
        return []
    from .packets import distinct_problems

    ids = [tpls[j % len(tpls)].id for j in range(EXERCISES_PER_SKILL)]
    out = distinct_problems(ids, zlib.crc32(skill.encode()) % 100_000)
    for p in out:
        p["work_lines"] = 0.4
        p.pop("faded", None)
    return out


def source_text(course: str) -> tuple[str, render.Ctx, list[dict]]:
    sk = extract.skills()
    src = extract.course_source()
    chapters = outline()
    books = [b["id"] for b in src.get("books", [])] or ["calc1"]
    credit = " ".join(source.attribution_line(b) for b in books)
    ctx = render.Ctx(select=lambda b: not (b["t"] == "box" and b["kind"] in ("media", "aside", "project")))
    title = src.get("title", course)
    subtitle = src.get("subtitle", "")
    out = [render.TEMPLATE_IMPORT, '#import "/typst/volume.typ": *\n',
           f'#show: volume.with(title: "{render.esc(title)}", subtitle: "{render.esc(subtitle)}")\n',
           f'#volume-cover("{render.esc(title)}", "{render.esc(subtitle)}", "A Marginalia textbook")\n',
           "#credits-page[" + f'#text(font: sans, weight: "bold", size: 10pt)[#"{render.esc(title)}"] \\\n'
           + f'#"{render.esc(credit)}" \\\n#v(6pt)\n'
           + '#"Exercises are generated for this book and every answer is checked with a computer algebra system. '
           + 'Answers to the Try Its and the exercises are at the back of the book."' + "]\n",
           "#contents-page()\n#pagebreak()\n#metadata(none) <mainmatter>\n"]
    answers: list[tuple[str, list[str], list[str]]] = []
    for ch in chapters:
        sup = f'supplement: [#"{render.esc(ch["supplement"])}"], ' if ch["supplement"] else "supplement: [], "
        out.append(f'#heading(level: 1, {sup}outlined: true)[#"{render.esc(ch["title"])}"]\n')
        for sec in ch["sections"]:
            mod = sec["mod"]
            out.append(f'#heading(level: 2)[#sec-num("{sec["number"]}")#"{render.esc(sec["title"])}"] <sec-{_label(sec["number"])}>\n')
            objs = [o for s in sec["skills"] for o in sk[s].get("learning_objectives", []) if o in mod.objectives]
            objs = list(dict.fromkeys(objs)) or list(mod.objectives)
            if objs:
                out.append("#objectives((" + ", ".join(f'[#"{render.esc(o)}"]' for o in objs) + ",))\n")
                ctx.runs.extend(objs)
            before = len(ctx.solutions)
            ctx.current_label = None
            if sec.get("whole"):
                out.append(render.blocks(sec["parts"], ctx))
            else:
                for part in sec["parts"]:
                    out.append(render.block(part, ctx))
            tries = ctx.solutions[before:]
            ex_answers = []
            ex = [(s, exercises_for(s)) for s in sec["skills"]]
            ex = [(s, ps) for s, ps in ex if ps]
            if ex:
                out.append("#exercises-head()\n")
                n = 0
                for s, ps in ex:
                    out.append(f'#exercise-group[#"{render.esc(sk[s]["name"])}"]\n')
                    for p in ps:
                        n += 1
                        out.append(render.problem_markup(n, p))
                        ex_answers.append(f"#strong[{n}.] ${p['key_display']}$")
            answers.append((f"{sec['number']} {sec['title']}", tries, ex_answers))
    out.append('#heading(level: 1, supplement: [Back matter], outlined: true)[Answers]\n')
    out.append("#columns(2, gutter: 16pt)[\n")
    for title_, tries, exs in answers:
        if not tries and not exs:
            continue
        body = "\n\n".join(tries)
        if exs:
            body += ("\n\n" if tries else "") + '#text(font: sans, size: 8pt, weight: "bold", fill: spot)[EXERCISES] \\\n' \
                + " #h(0.8em) ".join(exs)
        out.append(f'#answers-section([#"{render.esc(title_)}"], [{body}])\n')
    out.append("]\n")
    return "".join(out), ctx, chapters


def _label(num: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "-", num)


def build(course: str, log=print) -> dict:
    """Typeset the course's book, audit it, cut it into pages; returns the index."""
    import pymupdf

    with _LOCK:
        h = content_hash(course)
        d = volume_dir(course)
        src, ctx, chapters = source_text(course)
        log(f"volume {course}: typesetting")
        pdf = render.compile_typst(src, paths.BUILD / f"volume-{course}.pdf")
        audit = render.verbatim_audit(pdf, ctx.runs)
        doc = pymupdf.open(pdf)
        # where each section and chapter starts, from the PDF outline (Typst writes headings as bookmarks)
        toc = doc.get_toc()
        sec_pages: dict[str, int] = {}
        ch_pages: list[int] = []
        answers_page = None
        for level, title, page in toc:
            if level == 1:
                if title.strip() == "Answers":
                    answers_page = page
                else:
                    ch_pages.append(page)
            elif level == 2:
                m = re.match(r"\s*([K0-9][0-9.]*)", title)
                if m:
                    sec_pages.setdefault(m.group(1).rstrip("."), page)
        tmp = d.with_name(d.name + ".new")
        if tmp.exists():
            import shutil
            shutil.rmtree(tmp)
        (tmp / "pages").mkdir(parents=True)
        sizes = []
        for i, page in enumerate(doc, 1):
            pix = page.get_pixmap(dpi=PAGE_DPI)
            from PIL import Image

            img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            img.save(tmp / "pages" / f"{i}.webp", "WEBP", quality=82, method=4)
            sizes.append([pix.width, pix.height])
        (tmp / "book.pdf").write_bytes(Path(pdf).read_bytes())
        sk = extract.skills()
        skill_pages = {}
        sections = []
        for ci, ch in enumerate(chapters):
            for sec in ch["sections"]:
                pg = sec_pages.get(sec["number"])
                sections.append({"number": sec["number"], "title": sec["title"], "page": pg, "chapter": ch["title"],
                                 "skills": sec["skills"]})
                for s in sec["skills"]:
                    skill_pages.setdefault(s, pg)
        idx = {"course": course, "hash": h, "pages": len(doc), "size": sizes[0] if sizes else None,
               "chapters": [{"label": c["label"], "title": c["title"], "supplement": c["supplement"],
                             "page": ch_pages[i] if i < len(ch_pages) else None} for i, c in enumerate(chapters)],
               "sections": sections, "skills": skill_pages, "answers_page": answers_page,
               "audit": {"ok": audit["ok"], "runs": audit["runs"], "missing": audit["missing"][:20]},
               "skill_names": {s: sk[s]["name"] for s in skill_pages}}
        (tmp / "index.json").write_text(json.dumps(idx, indent=1), encoding="utf-8")
        if d.exists():
            import shutil
            shutil.rmtree(d)
        tmp.rename(d)
        _INDEX.pop(course, None)
        log(f"volume {course}: {len(doc)} pages, {len(sections)} sections, verbatim audit "
            f"{'ok' if audit['ok'] else 'FAILED'}")
        return idx
