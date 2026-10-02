"""Build packets: diagnostic rounds and lesson packets."""
from __future__ import annotations

import re

import sympy as sp

from . import answers, cnxml, extract, notation, paths, render, source, templates, textgen
from .learner import LearnerDB, config


# ---------------------------------------------------------------------------
# Diagnostic round

def render_diagnostic(db: LearnerDB, pid: str) -> dict:
    pk = db.packet(pid)
    probs = db.problems(pid)
    rnd = pk["round"]
    n = len(probs)
    who = render.learner_name()
    src = [render.doc_head(f"Pages {pid}", "Getting to know you", pid)]
    src.append(render.cover_markup(f"Getting to know you · {'first' if rnd == 1 else 'more'} pages",
                                   f"{who}’s first pages" if who and rnd == 1 else (f"More of {who}’s pages" if who else "Getting to know you"),
                                   f"{n} questions. Try each one; if you haven’t learned it yet, write skip. That helps too.", pid,
                                   kind="diagnostic"))
    scan = render.SCAN_LINK.get() is not None
    src.append("#instructions[#list("
               + ("" if scan else "[Write the code #strong[" + pid + "] at the top of every page you photograph.], ")
               + "[Work right on these pages. One step per line.], "
               "[Cross mistakes out with a single line; do not erase.], "
               "[Box your final answer.], "
               "[If you have not seen a topic yet, write #emph[skip]. Skipping is information too.])]\n")
    for p in probs:
        src.append(render.problem_markup(p["number"], p["data"]))
    out = paths.OUT / f"{pid}.pdf"
    render.compile_typst("\n".join(src), out)
    key = render_key(db, pid, diagnostic=True)
    db.set_packet_pdf(pid, str(out))
    return {"pdf": out, "key": key}


def render_key(db: LearnerDB, pid: str, diagnostic: bool = False, extra: list[str] | None = None) -> str:
    probs = db.problems(pid)
    sk = extract.skills()
    rows = []
    for p in probs:
        d = p["data"]
        gain = f"{p['info_gain']:.2f}" if p["info_gain"] is not None else "–"
        rows.append(f"[{p['number']}], [${d['key_display']}$], [#text(size: 8pt)[{render.esc(sk[d['skill']]['name'])}]], "
                    + (f"[{gain}], " if diagnostic else "") + f"[#text(size: 7pt)[#\"{render.esc(d['verification'])}\"]]")
    src = [render.doc_head(f"{pid} key", "Answer key", pid),
           f'#cover("Answer key", "Packet {pid}", "Answers verified with SymPy", "{pid}")\n',
           "#set par(justify: false)\n",
           ("#table(columns: (auto, auto, 1fr, auto, 1.3fr), inset: 5pt, "
            "table.header([*\\#*], [*Answer*], [*Skill*], [*Info (bits)*], [*SymPy verification*]), " if diagnostic else
            "#table(columns: (auto, auto, 1fr, 1.3fr), inset: 5pt, "
            "table.header([*\\#*], [*Answer*], [*Skill*], [*SymPy verification*]), ")
           + ", ".join(rows) + ")\n"]
    worked = [(p["number"], p["data"]["solution"]) for p in probs if p["data"].get("solution")]
    if worked and not diagnostic:
        src.append("#subsection[Worked solutions]\n")
        for num, lines in worked:
            src.append(f"#worked({num}, (" + ", ".join(f"[${ln}$]" for ln in lines) + ",))\n")
    if extra:
        src.append("#subsection[Checkpoint answers]\n" + "\n#line(length: 100%, stroke: 0.3pt + tint1)\n".join(extra))
    out = paths.OUT / f"{pid}-key.pdf"
    render.compile_typst("\n".join(src), out)
    return str(out)


# ---------------------------------------------------------------------------
# Lesson packet

def _ancestors(skill: str) -> set[str]:
    sk = extract.skills()
    out, stack = set(), list(sk[skill]["prerequisites"])
    while stack:
        p = stack.pop()
        if p not in out:
            out.add(p)
            stack.extend(sk[p]["prerequisites"])
    return out


def choose_focus(db: LearnerDB) -> tuple[str, list[str]]:
    """Section of the earliest unmastered chapter skill on the frontier, its frontier chapter
    skills, and the unmastered foundation skills that section's skills depend on."""
    n = config()["lesson"]["target_skills_per_packet"]
    sk = extract.skills()
    front = db.frontier()
    chapter_front = [s for s in front if sk[s]["kind"] == "chapter"]
    if not chapter_front:
        chapter_front = [s for s in extract.skill_order() if sk[s]["kind"] == "chapter"
                         and db.mastery()[s] < config()["learner"]["mastery_threshold"]][:1]
    section = min(sk[s]["section"] for s in chapter_front)
    chapter_focus = [s for s in chapter_front if sk[s]["section"] == section][:n]
    needed = set().union(*(_ancestors(s) for s in extract.skill_order() if sk[s]["section"] == section))
    foundation_focus = [s for s in front if sk[s]["kind"] == "foundation" and s in needed][:1]
    return section, chapter_focus + foundation_focus


def canonical_key(problem_text: str, solution_text: str) -> dict | None:
    """An answer key read from the book's own answer, when it is a single value or expression.

    Multi-part answers (ⓐ ⓑ ...), approximations and word answers give None (print-only).
    The key must re-grade the book's answer as correct, or it is not used.
    """
    t = " ".join(solution_text.split())
    t = re.sub(r"\s*(units?\s*\^?\(?2?\)?|unit2|ft/s(ec)?|ft|m/s)\.?$", "", t)
    if not t or re.search(r"[\u24b6-\u24e9]|approximately|\bor\b|[a-z]{4,}", t) or t.count("=") > 1:
        return None
    t = re.sub(r"^\s*[A-Za-z]\s*=\s*", "", t)
    try:
        v = answers.parse(t)
    except ValueError:
        return None
    if not isinstance(v, sp.Expr):
        return None
    if v.free_symbols:
        key = {"kind": "expr", "value": sp.srepr(v)}
        if problem_text.strip().lower().startswith("factor"):
            key["form"] = "factored"
    else:
        key = {"kind": "value", "value": sp.srepr(sp.nsimplify(v))}
    ok, _ = answers.grade(key, solution_text)
    return key if ok else None


def canonical_problem(cp: dict, generated: dict) -> dict:
    """A canonical checkpoint / Try It printed in place of a rejected template problem.

    It is graded when the book's answer is a single value or expression (canonical_key);
    otherwise it is printed for practice only (key None, not stored).
    """
    exercises = [ex for ex in cp["blocks"] if ex["t"] == "exercise"]
    sol = " ".join(" ".join(cnxml.block_plain(b) for b in ex["solution"]) for ex in exercises)
    prob = " ".join(" ".join(cnxml.block_plain(b) for b in ex["problem"]) for ex in exercises)
    key = canonical_key(prob, sol) if len(exercises) == 1 else None
    display = " ".join(sol.split())
    return generated | {"prompt": None, "plain": " ".join(cnxml.block_plain(cp).split()), "key": key,
                        "key_display": f'"{render.esc(display)}"' if key else "", "canonical_fallback": cp["id"],
                        "verification": f"answer from the book: {display}; SymPy re-grades it as correct" if key else ""}


def canonical_passages(mod, select, anchor_ids, limit: int = 24000) -> list[str]:
    """What the Jev new-idea check compares against: the section's learning objectives, the prose
    of every subsection that holds a selected example, and the selected boxes (all verbatim)."""
    out = [f"Learning objectives: {'; '.join(mod.objectives)}"]

    def holds_anchor(sec):
        return any(b.get("id") in anchor_ids for b in cnxml.walk(sec["blocks"]))

    tops = [b for b in mod.blocks if b["t"] != "section"]
    out += [" ".join(cnxml.block_plain(b).split()) for b in tops if b["t"] == "para"]
    for sec in (b for b in mod.blocks if b["t"] == "section" and holds_anchor(b)):
        for b in sec["blocks"]:
            if b["t"] in ("para", "equation", "list"):
                out.append(" ".join(cnxml.block_plain(b).split()))
            elif b["t"] in ("box", "example") and (select(b) or b.get("id") in anchor_ids):
                out.append(" ".join(cnxml.block_plain(b).split()))
    total, kept = 0, []
    for t in out:
        if t and total + len(t) <= limit:
            kept.append(t)
            total += len(t)
    return kept


def section_of(focus: list[str]) -> str:
    """The book section that teaches the first focus skill that has one."""
    sk = extract.skills()
    for s in focus:
        if sk[s].get("section"):
            return sk[s]["section"]
    raise ValueError(f"none of {focus} is taught in a section; give --section")


def build_lesson(db: LearnerDB, focus: list[str] | None = None, section: str | None = None,
                 log=None, jev_client=None, use_jev: bool = True) -> dict:
    if is_book_course() and focus is not None and section is None:
        return build_refresh(db, focus, log=log, jev_client=jev_client, use_jev=use_jev, kind="lesson")
    cfg = config()["lesson"]
    if focus is None:
        auto_section, focus = choose_focus(db)
        section = section or auto_section
    reviews = [s for s in db.due_reviews() if s not in focus]
    section = section or section_of(focus)
    chapter = extract.load_chapter()
    mod = next(m for m in chapter if m.number == section)
    sk = extract.skills()
    section_skills = [s for s in extract.skill_order() if sk[s]["section"] == section]
    focus_in_section = [s for s in focus if s in section_skills]
    # a foundation gap is taught where the section uses it: the section skills that depend on it
    users = [s for s in section_skills if any(f in sk[s]["prerequisites"] for f in focus if f not in section_skills)]
    shown = list(dict.fromkeys(focus_in_section + users)) or section_skills[:1]
    anchor_ids = {a["id"] for s in shown for a in sk[s]["anchors"]}

    n = len(db.packets("lesson")) + 1
    pid = f"L{n}"

    def select(b):
        if b["t"] == "box" and b["kind"] in ("definition", "theorem"):
            return True  # core statements of the section are always printed
        if b["t"] == "box" and b["kind"] in ("media", "project"):
            return False
        return b.get("id") in anchor_ids

    # practice problems: focus skills (templates for the skill and, for foundations, as listed)
    problems = []
    seed0 = 1000 * n
    practice_skills = focus + reviews[:2]
    for s in practice_skills:
        for tpl in templates.for_skill(s):
            for j in range(cfg["problems_per_skill"] if s in focus else 1):
                problems.append(templates.generate(tpl.id, seed0 + len(problems) + 1).to_json())
                if len([p for p in problems if p["skill"] == s]) >= (cfg["problems_per_skill"] if s in focus else 1):
                    break
            if len([p for p in problems if p["skill"] == s]) >= (cfg["problems_per_skill"] if s in focus else 1):
                break

    # snippets --------------------------------------------------------------
    end_pos = notation.end_of_section(section)
    first_block = next((b for b in cnxml.walk(mod.blocks) if b.get("id")), None)
    start_pos = notation.position_of(first_block["id"]) if first_block else 0
    obj_fallback = {"kind": "objective", "text": (mod.objectives or [""])[0]}
    snippets: list[textgen.Snippet] = []
    names = [sk[s]["name"] for s in focus]
    snippets.append(textgen.roadmap(names, f"{section} {mod.title}", start_pos, obj_fallback))
    # pointers to the selected examples, keyed by the problems that follow them
    number_of = {}
    for i, p in enumerate(problems, 1):
        number_of.setdefault(p["skill"], []).append(i)
    recent = {}
    for a in db.attempts():
        ev = (a["evidence"] or {}).get("decision") or {}
        if ev.get("misconception") and "." in str(ev.get("misconception")):
            recent[a["pdata"]["skill"]] = ev["misconception"]
    mis_by_id = {m["id"]: m for lst in extract.misconceptions().values() for m in lst}
    for s in shown:
        target = s if s in number_of else next((f for f in focus if f in sk[s]["prerequisites"] and f in number_of), None)
        for a in sk[s]["anchors"]:
            if a["type"] == "example" and target:
                fb = {"kind": "objective", "text": next((o for o in sk[s]["learning_objectives"]), obj_fallback["text"])}
                pos = notation.position_of(a["id"])
                sn = textgen.pointer(a["label"], number_of[target], pos, fb)
                sn.slot = f"before:{a['id']}"
                snippets.append(sn)
                if target in recent:
                    w = textgen.watch(a["label"], mis_by_id[recent[target]]["description"], pos, fb)
                    w.slot = f"before:{a['id']}"
                    snippets.append(w)
                break
    # a verified algebra warm-up before the practice set (a fresh expression, not a practice problem)
    rem = textgen.reminder_for(shown + focus, n, end_pos, obj_fallback)
    if rem:
        snippets.append(rem)
    for i, p in enumerate(problems, 1):
        donors = [p["skill"]] + [s for s in shown if p["skill"] in sk[s]["prerequisites"]]
        fb_cp = next((a for d in donors for a in sk[d]["anchors"] if a["type"] == "checkpoint"), None)
        snippets.append(textgen.Snippet(f"problem:{i}", "problem", p["prompt"], p["plain"], end_pos,
                                        {"kind": "canonical_block", "id": fb_cp["id"] if fb_cp else None,
                                         "text": sk[p["skill"]]["learning_objectives"][0] if sk[p["skill"]]["learning_objectives"] else ""},
                                        problem=p))

    canonical = canonical_passages(mod, select, anchor_ids)
    textgen.gate(snippets, canonical, log=log, client=jev_client, use_jev=use_jev)

    # assemble ---------------------------------------------------------------
    ctx = render.Ctx(select=select)
    blocks_by_id = {b.get("id"): b for m in chapter for b in cnxml.walk(m.blocks) if b.get("id")}
    decisions = []

    def use(sn: textgen.Snippet) -> str:
        decisions.append({"slot": sn.slot, "kind": sn.kind, "text": sn.plain, "accepted": sn.accepted, **sn.checks,
                          "fallback": sn.fallback})
        if sn.accepted:
            return f"#transition[{sn.typst}]" if sn.kind == "transition" else sn.typst
        if sn.kind == "transition":
            return f'#transition[#"{render.esc(sn.fallback["text"])}"]' if sn.fallback.get("text") else ""
        return None

    for sn in snippets:
        if sn.slot.startswith("before:"):
            m = use(sn)
            if m:
                ctx.before.setdefault(sn.slot.split(":", 1)[1], []).append(m)
    roadmap = use(snippets[0])
    src = [render.doc_head(f"Lesson {pid}", f"{section} {mod.title}", pid)]
    src.append(f'#cover("Lesson packet · {pid}", "{section} {render.esc(mod.title)}", '
               f'"Focus: {render.esc("; ".join(names))}", "{pid}")\n')
    src.append(f'#section-head("{section}", "{render.esc(mod.title)}")\n')
    src.append("#objectives((" + ", ".join(f'[#"{render.esc(o)}"]' for o in mod.objectives) + ",))\n")
    ctx.runs.extend(mod.objectives)
    if roadmap:
        src.append(roadmap)
    src.append(render.blocks(mod.blocks, ctx))
    src.append('#practice-head("Practice")\n')
    code_line = "" if render.SCAN_LINK.get() else "[Write the code #strong[" + pid + "] at the top of every page.], "
    src.append("#instructions[#list(" + code_line + "[Work right on these pages. One step per line.], "
               "[Cross mistakes out; do not erase.], [Box your final answer.])]\n")
    for sn in snippets:
        if sn.slot == "practice":
            m = use(sn)
            if m:
                src.append(m)
    practice, used_fallbacks = [], set()
    for i, p in enumerate(problems, 1):
        sn = next(s for s in snippets if s.slot == f"problem:{i}")
        if use(sn) is not None:
            src.append(render.problem_markup(len(practice) + 1, p))
            practice.append(p)
        else:
            bid = sn.fallback.get("id")
            if bid and bid in blocks_by_id and bid not in used_fallbacks:
                used_fallbacks.add(bid)
                cp = blocks_by_id[bid]
                fctx = render.Ctx()
                body = render.blocks(cp["blocks"], fctx)
                ctx.runs.extend(fctx.runs)
                src.append(f"#problem({len(practice) + 1}, [#text(font: sans, size: 8pt, fill: spot)[{cp['label']} (from the text)] {body}], space: 6)\n")
                practice.append(canonical_problem(cp, p))
    if ctx.omitted:
        src.append("#v(1em)#text(font: sans, size: 8pt, fill: luma(90))[Not printed in this packet (see the book): "
                   + render.esc(", ".join(dict.fromkeys(o for o in ctx.omitted if o))) + ".]\n")
    db.add_packet(pid, "lesson", None, {"section": section, "focus": focus, "reviews": reviews, "gate": decisions})
    for i, p in enumerate(practice, 1):
        if p.get("key") is not None:
            db.add_problem(pid, i, p)
    out = paths.OUT / f"{pid}.pdf"
    render.compile_typst("\n".join(src), out)
    audit = render.verbatim_audit(out, ctx.runs)
    key = render_key(db, pid, extra=ctx.solutions)
    db.set_packet_pdf(pid, str(out))
    render.write_json(paths.OUT / f"{pid}.gate.json", {"packet": pid, "decisions": decisions, "verbatim_audit": audit})
    return {"pid": pid, "pdf": out, "key": key, "audit": audit, "decisions": decisions, "focus": focus}


# ---------------------------------------------------------------------------
# Refresh packets: re-learning a foundation skill you once knew

def _practice_problems(skills: list[str], per_skill: int, seed0: int) -> list[dict]:
    problems = []
    for s in skills:
        tpls = templates.for_skill(s)
        for j in range(per_skill):
            tpl = tpls[j % len(tpls)]
            problems.append(templates.generate(tpl.id, seed0 + len(problems) + 1).to_json())
    return problems


def choose_refresh(db: LearnerDB) -> list[str]:
    """Unmastered foundation skills on the frontier, deepest first (at most two per packet)."""
    sk = extract.skills()
    n = config()["lesson"]["target_skills_per_packet"]
    return [s for s in db.frontier() if sk[s]["kind"] == "foundation" and sk[s].get("lesson")][:n]


def recent_misconceptions(db: LearnerDB) -> dict[str, str]:
    """skill -> the latest misconception whose root is that skill (from graded work)."""
    out = {}
    for a in db.attempts():
        ev = (a["evidence"] or {}).get("decision") or {}
        root, mis = ev.get("misconception_root"), ev.get("misconception")
        if root and mis and "." in str(mis):
            out[root] = mis
    return out


def is_book_course() -> bool:
    return bool(extract.course_source().get("books"))


def choose_focus_book(db: LearnerDB) -> tuple[list[str], str]:
    """The next skills to teach in a book course: the deepest unmastered skills on the frontier.

    Rusty foundations are refreshed two at a time; a new course skill is taught on its own,
    so each lesson carries one new idea."""
    cfg = config()["lesson"]
    sk = extract.skills()
    front = db.frontier()
    found = [s for s in front if sk[s]["kind"] == "foundation"]
    if found:
        return found[:cfg["target_skills_per_packet"]], "refresh"
    return front[:cfg.get("new_skills_per_packet", 1)], "lesson"


def choose_review(db: LearnerDB, exclude: set[str], k: int, seed: int) -> list[str]:
    """Mixed review: skills due for review first, then other mastered skills, spread over the course."""
    import random

    if k <= 0:
        return []
    due = [s for s in db.due_reviews() if s not in exclude]
    done = sorted(s for s in db.mastered_set() if s not in exclude and s not in due and templates.for_skill(s))
    rng = random.Random(seed)
    rng.shuffle(done)
    return (due + done)[:k]


def distinct_problems(template_ids: list[str], seed0: int) -> list[dict]:
    """One problem per template id, regenerating with another seed when a problem would look
    like one already in the list (same opening up to its first number or relation)."""
    out, seen = [], set()
    for j, tid in enumerate(template_ids):
        for attempt in range(12):
            p = templates.generate(tid, seed0 + 37 * j + 1009 * attempt + 1).to_json()
            shape = re.split(r"[=<>]", p["plain"])[0][:40]
            if shape not in seen:
                break
        seen.add(shape)
        out.append(p)
    return out


def interleave(groups: dict[str, list[dict]]) -> list[dict]:
    """Round-robin across skills, so no two problems of the same kind sit together when it can be avoided."""
    order, queues = [], {k: list(v) for k, v in groups.items() if v}
    while queues:
        for k in list(queues):
            order.append(queues[k].pop(0))
            if not queues[k]:
                del queues[k]
    return order


# fixed prompts (not generated): self-explanation after the first worked example of each new skill
PAUSES = [
    "Pause before going on. In one sentence, write down why the first step of {label} is allowed.",
    "Pause before going on. Cover the solution of {label} and redo it yourself; then say in a sentence what decided each step.",
    "Pause before going on. In {label}, which step would be easiest to get wrong, and why does the book do it that way?",
]


def build_refresh(db: LearnerDB, focus: list[str], log=None, jev_client=None, use_jev: bool = True,
                  kind: str = "refresh") -> dict:
    """A packet taught from the book's own subsections (verbatim), then practice.

    kind "refresh": re-learning a foundation you once knew. kind "lesson": a new skill of a book
    course. Built on the strongest-evidence practices:
      - the book's worked examples first, each new skill's first example followed by a fixed
        self-explanation prompt;
      - a new skill's first practice problem is faded (the first steps of a worked solution are
        given; the learner finishes it);
      - a share of the practice is mixed review of earlier skills, and all practice is interleaved;
      - review problems are verified templates of skills taught earlier.
    Only the subsections that teach the skills are printed; all their worked examples, How To
    boxes and Try Its are kept (Try It answers go to the key).
    """
    import math

    cfg = config()["lesson"]
    sk = extract.skills()
    prefix = "R" if kind == "refresh" else "L"
    n = len([p for p in db.packets() if p["kind"] == kind]) + 1
    pid = f"{prefix}{n}"
    seed0 = (5000 if kind == "refresh" else 7000) * n
    per = cfg["problems_per_skill"] if kind == "refresh" else cfg.get("new_skill_problems", 4)
    from . import route

    focus_problems: dict[str, list[dict]] = {}
    taken: set[str] = set()
    for s in focus:
        book = route.choose(db, s, per, taken)  # the textbook's own exercises first
        if len(book) >= min(per, 2):
            taken |= {ex["id"] for ex in book}
            focus_problems[s] = [route.problem(ex, s) for ex in book]
            continue
        tpls = templates.for_skill(s)
        probs = distinct_problems([tpls[j % len(tpls)].id for j in range(per)], seed0 + 100 * len(focus_problems))
        if kind == "lesson":
            # fade the first problem that has a worked solution
            for p in probs:
                if p.get("solution") and len(p["solution"]) >= 3:  # a one- or two-step answer has nothing to fade
                    p["faded"] = math.ceil(len(p["solution"]) / 2)
                    probs.remove(p)
                    probs.insert(0, p)
                    break
        focus_problems[s] = probs
    n_focus = sum(len(v) for v in focus_problems.values())
    share = cfg.get("review_share", 0.0)
    n_review = min(cfg.get("max_review", 4), round(share / (1 - share) * n_focus)) if share else 0
    review = choose_review(db, set(focus), n_review, seed0)
    review_problems = {}
    for i, s in enumerate(review):
        book = route.choose(db, s, 1, taken)
        if book:
            taken.add(book[0]["id"])
            review_problems[s] = [route.problem(book[0], s)]
        elif templates.for_skill(s):
            review_problems[s] = [templates.generate(templates.for_skill(s)[0].id, seed0 + 500 + i).to_json()]
    for ps in review_problems.values():
        for p in ps:
            p["review"] = True
    # faded problems first (right after the examples they follow), then everything interleaved
    faded = [ps.pop(0) for ps in focus_problems.values() if ps and ps[0].get("faded")]
    problems = faded + interleave({**focus_problems, **review_problems})
    number_of: dict[str, list[int]] = {}
    for i, p in enumerate(problems, 1):
        number_of.setdefault(p["skill"], []).append(i)

    # the canonical excerpt: every lesson part of every focus skill, in order, without repeats
    parts, seen = [], set()
    for s in focus:
        for part in sk[s]["lesson"]:
            mod = extract.module(part["book"], part["section"])
            secs = [extract.find_subsection(mod, sub["title"] or extract.OPENING) for sub in part["subsections"]]
            secs = [x for x in secs if x and x["id"] not in seen]
            seen |= {x["id"] for x in secs}
            if secs:
                parts.append({"skill": s, "book": part["book"], "mod": mod, "sections": secs})
    books = list(dict.fromkeys(p["book"] for p in parts))
    source_title = " and ".join(source.BOOKS[b].title for b in books)
    excerpt_blocks = [x for p in parts for x in p["sections"]]
    allowed = notation.BASELINE_FOUNDATION | notation.features_in_blocks(excerpt_blocks)

    # generated snippets ----------------------------------------------------------
    first_obj = next((o for s in focus for o in sk[s]["learning_objectives"]), "")
    fb = {"kind": "objective", "text": first_obj}
    if kind == "refresh":
        road = textgen.refresh_roadmap([sk[s]["name"] for s in focus], source_title, fb)
    else:
        road = textgen.lesson_roadmap([sk[s]["name"] for s in focus], source_title, bool(review), fb)
    snippets: list[textgen.Snippet] = [road]
    recent = recent_misconceptions(db)
    mis_by_id = {m["id"]: m for lst in extract.misconceptions().values() for m in lst}
    pauses = {}
    for j, s in enumerate(focus):
        ex = next((a for a in sk[s]["anchors"] if a["type"] == "example" and a["id"] in
                   {b["id"] for p in parts if p["skill"] == s for sec in p["sections"] for b in cnxml.walk([sec])}), None)
        if ex and s in number_of:
            sfb = {"kind": "objective", "text": (sk[s]["learning_objectives"] or [first_obj])[0]}
            sn = textgen.pointer(ex["label"], number_of[s], 0, sfb)
            sn.slot = f"before:{ex['id']}"
            snippets.append(sn)
            if s in recent:
                w = textgen.watch(ex["label"], mis_by_id[recent[s]]["description"], 0, sfb)
                w.slot = f"before:{ex['id']}"
                snippets.append(w)
            if kind == "lesson" and ex.get("label"):
                pauses[ex["id"]] = PAUSES[(n + j) % len(PAUSES)].format(label=ex["label"])
    try_its = {s: [a for a in sk[s]["anchors"] if a["type"] == "checkpoint"] for s in sk}
    used_try = {s: 0 for s in sk}
    for i, p in enumerate(problems, 1):
        if p.get("book_ref"):
            continue  # the book's own exercise: nothing generated to check
        lst = try_its[p["skill"]]
        try_it = lst[used_try[p["skill"]] % len(lst)] if lst else None  # each fallback a different Try It
        used_try[p["skill"]] += 1
        sn = textgen.Snippet(f"problem:{i}", "problem", p["prompt"], p["plain"], 0,
                             {"kind": "canonical_block", "id": try_it["id"] if try_it else None,
                              "book": try_it.get("book") if try_it else None,
                              "text": (sk[p["skill"]]["learning_objectives"] or [""])[0]},
                             problem=p)
        sn.review = bool(p.get("review"))
        snippets.append(sn)
    for sn in snippets:
        sn.allowed = allowed if not getattr(sn, "review", False) else None
    canonical = []
    # whole subsections where possible (the later examples, remainders and harder cases, are what
    # practice draws on); a long lesson shares one budget evenly across its subsections
    cap = max(4000, min(12000, 40000 // max(1, len(excerpt_blocks))))
    for p in parts:
        canonical.append("Learning objectives: " + "; ".join(p["mod"].objectives))
        canonical += [" ".join(cnxml.block_plain(x).split())[:cap] for x in p["sections"]]
    textgen.gate(snippets, canonical, log=log, client=jev_client, use_jev=use_jev)

    # assemble ------------------------------------------------------------------
    ctx = render.Ctx(select=lambda b: not (b["t"] == "box" and b["kind"] in ("media", "aside", "project")))
    decisions = []

    def use(sn: textgen.Snippet):
        decisions.append({"slot": sn.slot, "kind": sn.kind, "text": sn.plain, "accepted": sn.accepted, **sn.checks,
                          "fallback": sn.fallback})
        if sn.accepted:
            return f"#transition[{sn.typst}]" if sn.kind == "transition" else sn.typst
        if sn.kind == "transition":
            return f'#transition[#"{render.esc(sn.fallback["text"])}"]' if sn.fallback.get("text") else ""
        return None

    for sn in snippets:
        if sn.slot.startswith("before:"):
            m = use(sn)
            if m:
                ctx.before.setdefault(sn.slot.split(":", 1)[1], []).append(m)
    for eid, text in pauses.items():
        ctx.after.setdefault(eid, []).append(f'#pause[#"{render.esc(text)}"]')
    names = [sk[s]["name"] for s in focus]
    attribution = " · ".join(render.book_attribution(b) for b in books)
    kicker = " · ".join(source.BOOKS[b].title for b in books)
    title = "Refresh" if kind == "refresh" else "Lesson"
    src = [render.doc_head(f"{title} {pid}", title, pid, attribution, kicker=kicker)]
    who = render.learner_name()
    src.append(render.cover_markup(f"{who}’s pages · {title.lower()}" if who else f"{title} · {pid}",
                                   "; ".join(names), f"From {source_title}", pid, kind=kind, about=names))
    roadmap = use(snippets[0])
    if roadmap:
        src.append(roadmap)
    for p in parts:
        mod = p["mod"]
        objs = [o for o in sk[p["skill"]]["learning_objectives"] if o in mod.objectives]
        src.append(f'#section-head("{mod.number}", "{render.esc(mod.title)}")\n')
        if objs:
            src.append("#objectives((" + ", ".join(f'[#"{render.esc(o)}"]' for o in objs) + ",))\n")
            ctx.runs.extend(objs)
        for sec in p["sections"]:
            src.append(render.block(sec, ctx))
    src.append('#practice-head("Practice")\n')
    code_line = "" if render.SCAN_LINK.get() else "[Write the code #strong[" + pid + "] at the top of every page.], "
    src.append("#instructions[#list(" + code_line + "[Work right on these pages. One step per line.], "
               "[Cross mistakes out; do not erase.], [Box your final answer.])]\n")
    if review_problems:
        src.append('#transition[#"Problems marked review come from earlier skills. They are mixed in on purpose: '
                   'deciding which method a problem needs is part of the skill."]\n')
    practice, used_fallbacks = [], set()
    for i, p in enumerate(problems, 1):
        if p.get("book_ref"):
            src.append(render.problem_markup(len(practice) + 1, p))
            ctx.runs.extend(p.pop("runs", []))
            practice.append(p)
            continue
        sn = next(s_ for s_ in snippets if s_.slot == f"problem:{i}")
        if use(sn) is not None:
            src.append(render.problem_markup(len(practice) + 1, p))
            practice.append(p)
            continue
        if p.get("review"):
            continue  # a review problem that failed its checks is simply left out
        bid, bbook = sn.fallback.get("id"), sn.fallback.get("book")
        if bid and bid not in used_fallbacks and bbook:
            cp = next((b for m in extract.load_book(bbook) for b in cnxml.walk(m.blocks) if b.get("id") == bid
                       and b["t"] == "box"), None)
            if cp:
                used_fallbacks.add(bid)
                fctx = render.Ctx()
                body = render.blocks(cp["blocks"], fctx)
                ctx.runs.extend(fctx.runs)
                src.append(f"#problem({len(practice) + 1}, [#text(font: sans, size: 8pt, fill: spot)[{cp.get('label') or 'Try It'} "
                           f"(from the text)] {body}], space: 6)\n")
                practice.append(canonical_problem(cp, p))
    if kind == "lesson":
        src.append("#explain[In two or three sentences, explain to someone who missed this lesson how you decide "
                   "what to do first in a problem like the ones above. Writing it down is part of the practice; "
                   "it is not graded.]\n")
    db.add_packet(pid, kind, None, {"focus": focus, "review": review, "sources": [
        {"book": p["book"], "section": p["mod"].number, "subsections": [cnxml.plain(x["title"]) for x in p["sections"]]}
        for p in parts], "gate": decisions})
    for i, p in enumerate(practice, 1):
        if p.get("key") is not None:
            db.add_problem(pid, i, p)
    out = paths.OUT / f"{pid}.pdf"
    render.compile_typst("\n".join(src), out)
    audit = render.verbatim_audit(out, ctx.runs)
    key = render_key(db, pid, extra=ctx.solutions)
    db.set_packet_pdf(pid, str(out))
    render.write_json(paths.OUT / f"{pid}.gate.json", {"packet": pid, "decisions": decisions, "verbatim_audit": audit})
    return {"pid": pid, "pdf": out, "key": key, "audit": audit, "decisions": decisions, "focus": focus, "kind": kind,
            "review": review}


def next_lesson(db: LearnerDB, log=None, jev_client=None, use_jev: bool = True) -> dict:
    """Refresh the deepest rusty foundation first; once foundations hold, teach the course."""
    if is_book_course():
        focus, kind = choose_focus_book(db)
        if not focus:
            raise RuntimeError("Every skill in this course is mastered.")
        return build_refresh(db, focus, log=log, jev_client=jev_client, use_jev=use_jev, kind=kind)
    refresh = choose_refresh(db)
    if refresh:
        return build_refresh(db, refresh, log=log, jev_client=jev_client, use_jev=use_jev)
    r = build_lesson(db, log=log, jev_client=jev_client, use_jev=use_jev)
    r["kind"] = "lesson"
    return r
