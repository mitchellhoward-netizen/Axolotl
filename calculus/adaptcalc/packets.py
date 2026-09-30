"""Build packets: diagnostic rounds and lesson packets."""
from __future__ import annotations

import re

import sympy as sp

from . import cnxml, extract, notation, paths, render, templates, textgen
from .learner import LearnerDB, config


# ---------------------------------------------------------------------------
# Diagnostic round

def render_diagnostic(db: LearnerDB, pid: str) -> dict:
    pk = db.packet(pid)
    probs = db.problems(pid)
    rnd = pk["round"]
    n = len(probs)
    src = [render.doc_head(f"Diagnostic {pid}", f"Diagnostic, round {rnd}", pid)]
    src.append(f'#cover("Diagnostic · Round {rnd}", "Where you stand in Chapter 2", '
               f'"{n} questions, chosen to split what is still uncertain about your skills", "{pid}")\n')
    src.append("#instructions[#list("
               "[Write the code #strong[" + pid + "] at the top of every page you photograph.], "
               "[Start each problem with its number. One step per line.], "
               "[Cross mistakes out with a single line; do not erase.], "
               "[Box your final answer.], "
               "[If you have not seen a topic yet, write the number and #emph[skip]. Skipping is information too.])]\n")
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
                    f"[{gain}], [#text(size: 7pt)[#\"{render.esc(d['verification'])}\"]]")
    src = [render.doc_head(f"{pid} key", "Answer key", pid),
           f'#cover("Answer key", "Packet {pid}", "Answers verified with SymPy", "{pid}")\n',
           "#set par(justify: false)\n",
           "#table(columns: (auto, auto, 1fr, auto, 1.3fr), inset: 5pt, "
           "table.header([*\\#*], [*Answer*], [*Skill*], [*Info (bits)*], [*SymPy verification*]), "
           + ", ".join(rows) + ")\n"]
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


def canonical_problem(cp: dict, generated: dict) -> dict:
    """A canonical checkpoint printed in place of a rejected template problem.

    It is graded when the book's answer is a plain number (e.g. "17 unit2");
    otherwise it is printed for practice only (key None, not stored).
    """
    sol = " ".join(" ".join(cnxml.block_plain(b) for b in ex["solution"]) for ex in cp["blocks"] if ex["t"] == "exercise")
    m = re.fullmatch(r"\s*(-?\d+(?:\.\d+)?)\s*(?:unit.*|ft.*|m/s.*)?\s*", sol)
    key = {"kind": "value", "value": sp.srepr(sp.nsimplify(m.group(1)))} if m else None
    return generated | {"prompt": None, "plain": " ".join(cnxml.block_plain(cp).split()), "key": key,
                        "key_display": m.group(1) if m else "", "canonical_fallback": cp["id"],
                        "verification": f"canonical answer from the book: {sol.strip()}" if m else ""}


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


def build_lesson(db: LearnerDB, focus: list[str] | None = None, section: str | None = None,
                 log=None, jev_client=None, use_jev: bool = True) -> dict:
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
    src.append("#instructions[#list([Write the code #strong[" + pid + "] at the top of every page.], "
               "[Number each problem. One step per line.], [Cross mistakes out; do not erase.], [Box your final answer.])]\n")
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
