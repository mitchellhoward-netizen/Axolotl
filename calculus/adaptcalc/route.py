"""A route through the textbook: the book's own sections, in the book's order, and the book's own
exercises, chosen for one learner.

Nothing here writes mathematics. Every exercise printed for practice is the textbook's own, with the
book's own number (OpenStax numbers its end-of-section exercises through each chapter; the answers at
the back are for the odd ones, which is how the numbering is checked: 4,917 of 4,920 in Elementary
Algebra 2e land on the parity the answer key says). An exercise is used for checked practice only
when the book's answer becomes an answer key that our checker reads and that re-grades the book's
own answer as right; when the problem is an equation SymPy can solve, or an expression it can
simplify, SymPy must agree with the book as well. Everything else stays in the book, unprinted.

The route is the book's table of contents, marked for this learner: sections already known
(skipped), done here, the one being worked on now, the next ones, and the rest.
"""
from __future__ import annotations

import functools
import re

import sympy as sp

from . import answers, cnxml, extract, paths, render, templates
from .learner import LearnerDB

GROUPS = ("Practice Makes Perfect", "Everyday Math", "Section Exercises")  # the checked kinds
SKIP_GROUPS = ("Self Check",)
LEAD = re.compile(r"^\s*In the following exercises?,?\s*", re.I)


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def _num(section: str) -> list[int]:
    return [int(x) for x in re.findall(r"\d+", section)]


def _end_of_section(m) -> dict | None:
    for b in m.blocks:
        if b.get("t") == "section" and any(
                c.get("t") == "section" and cnxml.plain(c.get("title") or "") in GROUPS + ("Writing Exercises",)
                for c in b.get("blocks", [])):
            return b
    return None


@functools.lru_cache(maxsize=8)
def book_exercises(book: str) -> tuple[dict, ...]:
    """Every end-of-section exercise of a book, with its own number, section, heading and instruction."""
    mods = sorted(extract.load_book(book), key=lambda m: _num(m.number))
    out, counter = [], {}
    for m in mods:
        c = _end_of_section(m)
        if not c:
            continue
        chapter = m.number.split(".")[0]
        heads = {_norm(cnxml.plain(b.get("title") or "")): cnxml.plain(b.get("title") or "")
                 for b in m.blocks if b.get("t") == "section" and b.get("title")}
        for sub in c["blocks"]:
            if sub.get("t") != "section" or cnxml.plain(sub.get("title") or "") in SKIP_GROUPS:
                continue
            group = cnxml.plain(sub.get("title") or "")
            heading, instruction = None, None
            for x in cnxml.walk(sub.get("blocks", [])):
                if x.get("t") == "para":
                    text = " ".join(cnxml.block_plain(x).split())
                    if _norm(text) in heads:
                        heading, instruction = heads[_norm(text)], None
                    elif LEAD.match(text):
                        instruction = x
                    continue
                if x.get("t") != "exercise":
                    continue
                counter[chapter] = counter.get(chapter, 0) + 1
                out.append({
                    "id": x["id"], "book": book, "chapter": chapter, "section": m.number, "section_title": m.title,
                    "number": counter[chapter], "group": group, "heading": heading, "instruction": instruction,
                    "problem": x["problem"], "solution": x["solution"],
                    "plain": " ".join(" ".join(cnxml.block_plain(b) for b in x["problem"]).split()),
                    "answer": " ".join(" ".join(cnxml.block_plain(b) for b in x["solution"]).split()),
                })
    return tuple(out)


def instruction_text(ex: dict) -> str:
    if not ex["instruction"]:
        return ""
    t = LEAD.sub("", " ".join(cnxml.block_plain(ex["instruction"]).split()))
    return t[:1].upper() + t[1:]


# ---------------------------------------------------------------------------
# the book's answer as a key

THOUSANDS = re.compile(r"(?<=\d),(?=\d{3}(?!\d))")


def _clean(t: str) -> str:
    return THOUSANDS.sub("", t.replace("−", "-").replace("–", "-").strip().rstrip("."))


def key_for(ex: dict) -> dict | None:
    """The book's answer as a key our checker reads, or None when it can't be checked reliably."""
    from .packets import canonical_key

    sol, prob, instr = _clean(ex["answer"]), _clean(ex["plain"]), instruction_text(ex).lower()
    if not sol or re.search(r"[Ⓐ-ⓩ]", sol + prob + instr):  # multi-part (ⓐ ⓑ): print-only
        return None
    if re.search(r"[A-Za-z]\d", sol.replace("sqrt", "")):
        return None  # an exponent the extraction flattened (a3 for a³): can't be trusted
    if re.fullmatch(r"-?[\d.]+\s*[-+*/·×÷⋅]\s*[\d.\s*·×⋅+\-/÷()]+", sol) and "prime factorization" not in instr:
        return None  # the answer is arithmetic written out (translate, write as): it's about the form
    if re.match(r"(translate|write an|write the|write a|express|name|describe|explain|list|identify)", instr):
        return None
    if re.search(r"\b(mi|ft|in|cm|m|km|lb|oz|hours?|minutes?|dollars?|miles?|feet|inches|units?)\b", sol):
        return None  # an answer with units: word problems are printed from the book, not auto-marked
    if "determine whether" in instr and _norm(sol) in ("yes", "no"):
        return {"kind": "choice", "value": _norm(sol)}
    key = None
    parts = [p for p in re.split(r",\s*|\s+or\s+|\s+and\s+", sol) if p.strip()]
    if len(parts) > 1 and all("=" in p or not re.search(r"[a-z]{2,}", p) for p in parts):
        try:
            vals = [answers.parse(re.sub(r"^\s*[A-Za-z]\s*=\s*", "", _clean(p))) for p in parts]
            if all(not v.free_symbols for v in vals):
                key = {"kind": "set", "value": [sp.srepr(sp.nsimplify(v)) for v in vals]}
        except (ValueError, AttributeError, TypeError):
            key = None
    else:
        key = canonical_key(prob, sol)
    if not key:
        return None
    # the form the instruction asks for is part of the answer
    if "prime factorization" in instr:
        key["form"] = "prime_factorization"
    elif "mixed number" in instr:
        key["form"] = "mixed_number"
    elif "scientific notation" in instr:
        key["form"] = "scientific"
    elif key["kind"] == "expr" and re.match(r"factor", instr):
        key["form"] = "factored_completely" if "completely" in instr else "factored"
    elif key["kind"] == "value" and "simplif" in instr:
        v = sp.sympify(key["value"])
        if v.is_Rational and not v.is_Integer:
            key["form"] = "lowest_terms"
        elif v.has(sp.sqrt(2).func) and any(isinstance(a, sp.Pow) for a in sp.preorder_traversal(v)):
            key["form"] = "simplified_radical"
    if key["kind"] == "expr":
        # an answer's letters must be the problem's own variables (159 cal is a unit, not a variable)
        names = {str(x) for x in sp.sympify(key["value"]).free_symbols}
        if any(len(n) > 1 or not re.search(rf"(?<![A-Za-z]){n}(?![A-Za-z])", prob) for n in names):
            return None
    if key["kind"] == "expr" and "simplif" in instr and "form" not in key:
        try:
            key["form"] = "simplest"
            key["ops"] = int(sp.count_ops(answers.student_raw_expr(sol)))
        except Exception:  # noqa: BLE001
            return None
    if not agrees_with_sympy(ex, key, instr):
        return None
    # copying the question must never count as answering it (an exercise about the form of an
    # answer, with no form check we can apply, is left to the book)
    q = prob
    if q and "=" not in q and not re.search(r"[a-z]{3,}", q.replace("sqrt", "")):
        try:
            if answers.grade(key, q)[0] and key["kind"] == "value" and "form" not in key:
                key["form"] = "computed"  # 'Add. 45 + 33': the answer must be worked out, not copied
            if answers.grade(key, q)[0]:
                return None
        except Exception:  # noqa: BLE001
            pass
    try:
        ok, _ = answers.grade(key, sol)
    except Exception:  # noqa: BLE001
        return None
    return key if ok else None


def agrees_with_sympy(ex: dict, key: dict, instr: str) -> bool:
    """When the exercise is an equation in one unknown, SymPy's solutions must be the book's; when it is
    an expression to simplify, it must equal the book's. Anything SymPy can't read is left to the book."""
    prob = _clean(ex["plain"])
    if re.search(r"[a-z]{3,}", prob.replace("sqrt", "")) or not prob:
        return True  # words, a table, a picture: the book's answer stands
    try:
        if prob.count("=") == 1 and "solve" in instr:
            lhs, rhs = prob.split("=")
            e = answers.parse(lhs) - answers.parse(rhs)
            syms = sorted(e.free_symbols, key=str)
            if len(syms) != 1:
                return True
            got = set(sp.solve(e, syms[0]))
            want = {sp.sympify(v) for v in (key["value"] if key["kind"] == "set" else [key["value"]])}
            return got == want if key["kind"] in ("set", "value") else True
        if "=" not in prob and key["kind"] == "expr" and instr.startswith("simplify"):
            return answers.equal(answers.parse(prob), sp.sympify(key["value"]))
    except Exception:  # noqa: BLE001 - SymPy couldn't read it: the book's answer stands
        return True
    return True


@functools.lru_cache(maxsize=8)
def _checked(book: str) -> dict[str, dict]:
    return {ex["id"]: k for ex in book_exercises(book) if (k := key_for(ex))}


# ---------------------------------------------------------------------------
# which skill an exercise practises

@functools.lru_cache(maxsize=8)
def _skill_index(course_key: str) -> dict[tuple, str]:
    sk = extract.skills()
    idx = {}
    for s in extract.skill_order():
        for part in sk[s].get("lesson") or []:
            for sub in part.get("subsections") or []:
                idx.setdefault((part["book"], part["section"], _norm(sub.get("title") or "")), s)
    return idx


def skill_of(ex: dict) -> str | None:
    if not ex["heading"]:
        return None
    return _skill_index(paths.course()).get((ex["book"], ex["section"], _norm(ex["heading"])))


def books() -> list[str]:
    src = extract.course_source().get("books") or []
    return [b["id"] if isinstance(b, dict) else b for b in src]


def exercises_for(skill: str) -> list[dict]:
    """The book's checked exercises for a skill, in the book's order."""
    out = []
    for b in books():
        keys = _checked(b)
        out += [ex for ex in book_exercises(b) if ex["id"] in keys and skill_of(ex) == skill]
    return out


def used(db: LearnerDB) -> set[str]:
    return {p["data"].get("exercise_id") for pk in db.packets() for p in db.problems(pk["id"])} - {None}


def choose(db: LearnerDB, skill: str, k: int, taken: set[str] | None = None) -> list[dict]:
    """k of the book's exercises for this skill not yet given, spread through the set (the book
    orders them from easier to harder), so practice climbs the way the book does."""
    seen = used(db) | (taken or set())
    pool = [ex for ex in exercises_for(skill) if ex["id"] not in seen]
    if len(pool) <= k:
        return pool
    step = (len(pool) - 1) / (k - 1) if k > 1 else 0
    return [pool[round(i * step)] for i in range(k)]


def problem(ex: dict, skill: str) -> dict:
    """The exercise as one of our problems: the book's words, the book's answer, the book's number."""
    key = _checked(ex["book"])[ex["id"]]
    ctx = render.Ctx()
    instr = instruction_text(ex)
    body = (f'#emph[#"{render.esc(instr)}"] ' if instr else "") + render.blocks(ex["problem"], ctx)
    tpls = templates.for_skill(skill)
    shown = " ".join(" ".join(cnxml.block_plain(b) for b in ex["solution"]).split())
    return {
        "template": tpls[0].id if tpls else None, "skill": skill,
        "requires": list(tpls[0].requires) if tpls else [skill], "seed": 0,
        "prompt": body, "plain": (instr + " " + ex["plain"]).strip(), "key": key,
        "key_display": f'"{render.esc(shown)}"', "substeps": [], "strategies": {}, "work_lines": 5,
        "verification": f"the book’s answer to Exercise {ex['number']} (Section {ex['section']}); SymPy re-grades it as correct",
        "exercise_id": ex["id"],
        "book_ref": {"book": ex["book"], "chapter": ex["chapter"], "section": ex["section"], "number": ex["number"]},
        "runs": ctx.runs,
    }


# ---------------------------------------------------------------------------
# the route: the book's contents, marked for this learner

def overview(db: LearnerDB) -> dict:
    """Sections in the book's order, each with this learner's status:
    known (found already known at the start: skipped), done (learned here), now, next, later."""
    sk = extract.skills()
    rows = db.skill_rows()
    placed = {r["id"] for r in rows if r["placed"]}
    done = db.mastered_set()
    front = set(db.frontier())
    opens = [p for p in db.packets() if p["status"] == "open" and p["kind"] in ("lesson", "refresh")]
    import json as _json

    now_skills = set(_json.loads(opens[-1]["meta"] or "{}").get("focus", [])) if opens else set()
    sections: dict[tuple, dict] = {}
    for s in extract.skill_order():
        for part in (sk[s].get("lesson") or [])[:1]:
            key = (part["book"], part["section"])
            sec = sections.setdefault(key, {"book": part["book"], "section": part["section"], "title": part.get("title", ""),
                                            "skills": []})
            sec["skills"].append(s)
    out = []
    for (book, num), sec in sorted(sections.items(), key=lambda kv: (books().index(kv[0][0]) if kv[0][0] in books() else 99,
                                                                     _num(kv[0][1]))):
        ss = sec["skills"]
        if ss and all(s in done for s in ss):
            status = "known" if all(s in placed for s in ss) else "done"
        elif any(s in now_skills for s in ss):
            status = "now"
        elif any(s in front for s in ss):
            status = "next"
        else:
            status = "later"
        out.append({"book": book, "section": num, "title": sec["title"], "status": status,
                    "skills": [sk[s]["name"] for s in ss]})
    counts = {k: sum(1 for r in out if r["status"] == k) for k in ("known", "done", "now", "next", "later")}
    from . import records, source

    names = {b: source.BOOKS[b].title for b in books() if b in source.BOOKS}
    chapters: list[dict] = []
    for r in out:
        ch = r["section"].split(".")[0]
        if not chapters or (chapters[-1]["book"], chapters[-1]["chapter"]) != (r["book"], ch):
            title = records.chapter_titles(r["book"]).get(ch, "") if r["book"] in source.BOOKS else ""
            chapters.append({"book": r["book"], "chapter": ch, "title": title, "sections": []})
        chapters[-1]["sections"].append(r)
    here = next((r for r in out if r["status"] == "now"), None) or next((r for r in out if r["status"] == "next"), None)
    return {"books": names, "chapters": chapters, "sections": out, "counts": counts, "here": here}
