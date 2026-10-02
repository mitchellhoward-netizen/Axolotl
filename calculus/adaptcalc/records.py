"""Homeschool records that keep themselves.

Everything here is read from what was actually checked: the day each page came back, the problems
on it, the skills each lesson was about, when each skill crossed into "learned". Nothing has to be
logged by hand. The same data makes:

  - the log a state may ask for (days of mathematics, estimated time, what was worked on);
  - a portfolio: a summary in plain words, progress by chapter, skills learned with dates, and
    samples of the child's own marked work, as a PDF to print or hand to an evaluator;
  - the pace: at the rate of the last four weeks, when the current grade or chapter will be done.

Time is estimated (no one is asked to time anything): a few minutes per checked problem, more in
higher grades, and the reading time of each lesson on the day its first page came back.
"""
from __future__ import annotations

import collections
import csv
import datetime as dt
import io
import json
from pathlib import Path

import functools

from . import extract, paths, source
from .learner import LearnerDB, config

@functools.lru_cache(maxsize=None)
def chapter_titles(book: str) -> dict[str, str]:
    """Chapter label ('3', or 'K' in the elementary book) -> its title."""
    if source.BOOKS[book].authored:
        from . import authored

        return authored.chapter_titles(book)
    return {str(ch): title for ch, _, _, title in source.chapter_modules(book)}


def skill_groups() -> dict[str, str]:
    """A readable group (chapter) for each skill of the active course."""
    sk = extract.skills()
    out = {}
    for s, k in sk.items():
        if extract.course_source().get("books"):
            sec = (k.get("lesson") or [{}])[0].get("section", "")
            ch = sec.split(".")[0]
            title = chapter_titles(k["book"]).get(ch, "")
            if source.BOOKS[k["book"]].authored:
                out[s] = title or f"Chapter {ch}"  # the elementary book's chapters are grades
            else:
                out[s] = f"Chapter {ch}" + (f": {title}" if title else "")
        else:
            out[s] = ("Prealgebra and algebra basics" if s.startswith("pre_") else
                      "Algebra and trigonometry for calculus" if k["kind"] == "foundation" else f"Calculus {k['section']}")
    return out


READ_MINUTES = 10  # reading a lesson's pages together before the practice


def minutes_per_problem(skill: dict) -> float:
    g = skill.get("grade")
    if g in ("K", "1", "2"):
        return 1.5
    if g in ("3", "4", "5"):
        return 2.5
    course = extract.course_source().get("course", "")
    return {"prealgebra": 3.0, "algebra1": 4.0}.get(course, 5.0)


def school_year(day: dt.date) -> str:
    """'2026–27' for a day from August 2026 to July 2027."""
    y = day.year if day.month >= 8 else day.year - 1
    return f"{y}–{str(y + 1)[-2:]}"


def learned_dates(db: LearnerDB) -> dict[str, dict]:
    """skill -> {"date", "how"} for the skills learned now: the day it last crossed the mastery
    threshold, and whether the getting-to-know-you pages found it already known ("known") or it was
    learned through lessons and practice ("learned")."""
    done = db.mastered_set()
    thr = config()["learner"]["mastery_threshold"]
    out: dict[str, dict] = {}
    for r in db.conn.execute("SELECT skill, before, after, reason, at FROM updates ORDER BY id"):
        if r["skill"] in done and r["after"] >= thr and (r["before"] is None or r["before"] < thr):
            how = "known" if (r["reason"] or "").startswith(("diagnostic", "recheck")) else "learned"
            out[r["skill"]] = {"date": r["at"][:10], "how": how}
    for s in done:  # placed without a crossing on record
        if s not in out:
            r = db.conn.execute("SELECT at FROM updates WHERE skill=? ORDER BY id DESC LIMIT 1", (s,)).fetchone()
            if r:
                out[s] = {"date": r["at"][:10], "how": "known"}
    return out


def day_log(db: LearnerDB) -> list[dict]:
    """One row per day with checked work: problems, right, estimated minutes, what it was about."""
    sk = extract.skills()
    days: dict[str, dict] = collections.OrderedDict()
    first_check: dict[str, str] = {}
    kinds = {p["id"]: p["kind"] for p in db.packets()}
    for a in db.attempts():
        day = a["graded_at"][:10]
        d = days.setdefault(day, {"date": day, "problems": 0, "right": 0, "minutes": 0.0, "packets": [], "skills": []})
        s = a["pdata"]["skill"]
        d["problems"] += 1
        d["right"] += int(a["correct"])
        d["minutes"] += minutes_per_problem(sk.get(s, {}))
        if a["packet_id"] not in d["packets"]:
            d["packets"].append(a["packet_id"])
        name = sk[s]["name"] if s in sk else s
        if name not in d["skills"]:
            d["skills"].append(name)
        first_check.setdefault(a["packet_id"], day)
    for pid, day in first_check.items():
        if kinds.get(pid) in ("lesson", "refresh"):
            days[day]["minutes"] += READ_MINUTES
    for d in days.values():
        d["minutes"] = int(round(d["minutes"] / 5.0) * 5) or 5
        d["what"] = ("Getting to know you: " if all(kinds.get(p) == "diagnostic" for p in d["packets"]) else "") + \
            "; ".join(d["skills"][:4]) + ("…" if len(d["skills"]) > 4 else "")
    return list(days.values())


def chapter_progress(db: LearnerDB, groups: dict[str, str]) -> list[dict]:
    sk = extract.skills()
    done = db.mastered_set()
    out: dict[str, dict] = collections.OrderedDict()
    for s in extract.skill_order():
        g = out.setdefault(groups[s], {"name": groups[s], "learned": 0, "total": 0, "skills": []})
        g["total"] += 1
        g["learned"] += int(s in done)
        g["skills"].append({"id": s, "name": sk[s]["name"], "learned": s in done})
    return list(out.values())


def pace(db: LearnerDB, groups: dict[str, str], learned: dict[str, dict], today: dt.date | None = None) -> dict:
    """When the chapter (or grade) being worked on will be done, at the pace of the last four weeks."""
    today = today or dt.datetime.now(dt.timezone.utc).date()
    front = db.frontier()
    if not front:
        return {"current": None, "message": "Everything in this course is learned."}
    current = groups[front[0]]
    done = db.mastered_set()
    remaining = sum(1 for s, g in groups.items() if g == current and s not in done)
    since = (today - dt.timedelta(days=28)).isoformat()
    recent = sum(1 for d in learned.values() if d["how"] == "learned" and d["date"] >= since)
    days_worked = sum(1 for d in day_log(db) if d["date"] >= since)
    out = {"current": current, "remaining": remaining, "recent_skills": recent, "days_worked_4wk": days_worked}
    if recent < 2:
        out["message"] = (f"Working on {current}: {remaining} skill{'s' if remaining != 1 else ''} to go. "
                          "After a few weeks of pages this shows when it will be done.")
        return out
    per_week = recent / 4.0
    weeks = max(1, round(remaining / per_week))
    finish = today + dt.timedelta(weeks=weeks)
    out.update({"per_week": round(per_week, 1), "weeks": weeks, "finish": finish.isoformat(),
                "message": (f"At this pace (about {per_week:.0f} skill{'s' if round(per_week) != 1 else ''} a week, "
                            f"on {days_worked} day{'s' if days_worked != 1 else ''} in the last four weeks), {current} is done in about {weeks} "
                            f"week{'s' if weeks != 1 else ''}, around {finish.strftime('%B')} {finish.day}.")})
    return out


def samples(db: LearnerDB, limit: int = 6) -> list[dict]:
    """Work samples for a portfolio: photographed pages with their marks, spread over the year."""
    reps = []
    if paths.OUT.exists():
        for f in sorted(paths.OUT.glob("report-*.json"), key=lambda p: p.stat().st_mtime):
            rep = json.loads(f.read_text(encoding="utf-8"))
            if rep.get("packet") and rep.get("photo") and any(p.get("status") == "graded" for p in rep.get("problems", [])):
                reps.append(rep)
    if len(reps) > limit:  # evenly through the year, always including the latest
        step = (len(reps) - 1) / (limit - 1)
        reps = [reps[round(i * step)] for i in range(limit)]
    out = []
    for rep in reps:
        seen_at = {tp["number"]: tp.get("position") for tp in (rep.get("transcript") or {}).get("problems", [])}
        graded = [p for p in rep["problems"] if p.get("status") == "graded"]
        out.append({"packet": rep["packet"], "photo": rep["photo"], "at": (rep.get("at") or "")[:10],
                    "right": sum(1 for p in graded if p.get("correct")), "of": len(graded),
                    "marks": [{"n": p["number"], "v": "skip" if p["stepcheck"]["skipped"] else ("yes" if p["correct"] else "no"),
                               **(seen_at.get(p["number"]) or {})} for p in graded]})
    return out


def build(db: LearnerDB, name: str, groups: dict[str, str]) -> dict:
    sk = extract.skills()
    log = day_log(db)
    learned = learned_dates(db)
    attempts = db.attempts()
    chapters = chapter_progress(db, groups)
    first = log[0]["date"] if log else None
    last = log[-1]["date"] if log else None
    minutes = sum(d["minutes"] for d in log)
    right = sum(d["right"] for d in log)
    problems = sum(d["problems"] for d in log)
    order = extract.skill_order()
    learned_list = sorted(({"id": s, "name": sk[s]["name"], "chapter": groups[s], "date": d["date"]}
                           for s, d in learned.items() if d["how"] == "learned"),
                          key=lambda x: (x["date"], order.index(x["id"])))
    known_list = sorted(({"id": s, "name": sk[s]["name"], "chapter": groups[s], "date": d["date"]}
                         for s, d in learned.items() if d["how"] == "known"), key=lambda x: order.index(x["id"]))
    complete = [c for c in chapters if c["total"] and c["learned"] == c["total"]]
    p = pace(db, groups, learned)
    today = dt.datetime.now(dt.timezone.utc).date()
    data = {"name": name, "course": extract.course_source().get("title", ""),
            "year": school_year(dt.date.fromisoformat(first) if first else today),
            "from": first, "to": last, "generated": today.isoformat(),
            "totals": {"days": len(log), "minutes": minutes, "hours": round(minutes / 60, 1), "problems": problems,
                       "right": right, "accuracy": round(100 * right / problems) if problems else None,
                       "learned": len(learned_list), "known": len(known_list), "skills": len(sk), "pages_sent": len({a.get("photo") for a in attempts if a.get("photo")})},
            "log": log, "learned": learned_list, "known": known_list, "chapters": chapters, "complete": [c["name"] for c in complete],
            "pace": p, "samples": samples(db)}
    data["summary"] = narrative(data)
    return data


def duration(minutes: int) -> str:
    """'40 minutes', '1 hour', '3.5 hours'."""
    if minutes < 60:
        return f"{minutes} minutes"
    h = round(minutes / 60 * 2) / 2
    return f"{h:g} hour{'s' if h != 1 else ''}"


def _fmt(day: str) -> str:
    d = dt.date.fromisoformat(day)
    return f"{d.strftime('%B')} {d.day}, {d.year}"


def narrative(r: dict) -> str:
    """The record in a paragraph, the way a teacher would write it on a report."""
    t, n = r["totals"], r["name"]
    if not t["days"]:
        return f"{n}’s record starts with the first checked page."
    when = f"On {_fmt(r['from'])}" if r["from"] == r["to"] else f"Between {_fmt(r['from'])} and {_fmt(r['to'])}"
    parts = [f"{when}, {n} did mathematics on {t['days']} day{'s' if t['days'] != 1 else ''} "
             f"(about {duration(t['minutes'])} by our estimate), working {t['problems']} "
             f"problem{'s' if t['problems'] != 1 else ''} on paper, {t['accuracy']}% of them correct."]
    if t["known"]:
        parts.append(f"The first pages found {t['known']} skill{'s' if t['known'] != 1 else ''} {n} already knew"
                     + (f" ({', '.join(r['complete'][:3])} complete)" if r["complete"] and not t["learned"] else "") + ".")
    if t["learned"]:
        s = "s" if t["learned"] != 1 else ""
        parts.append((f"Since then {n} has learned {t['learned']} more skill{s}" if t["known"]
                      else f"{n} learned {t['learned']} skill{s}") + f" in {r['course']}"
                     + (f", completing {', '.join(r['complete'][:3])}" if r["complete"] else "") + ".")
    if r["pace"].get("current"):
        parts.append(f"{n} is now working on {r['pace']['current']}.")
    return " ".join(parts)


def csv_log(r: dict) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Date", "Subject", "Minutes (estimated)", "Problems", "Correct", "Worked on"])
    for d in r["log"]:
        w.writerow([d["date"], "Mathematics", d["minutes"], d["problems"], d["right"], d["what"]])
    w.writerow([])
    w.writerow(["Total", "", r["totals"]["minutes"], r["totals"]["problems"], r["totals"]["right"],
                f"{r['totals']['days']} day{'s' if r['totals']['days'] != 1 else ''}, {r['totals']['learned']} skills learned"])
    return buf.getvalue()


# ---------------------------------------------------------------------------
# the portfolio, typeset

def portfolio_pdf(r: dict, out: Path) -> Path:
    from PIL import Image

    from . import render, transcribe

    esc = render.esc
    t = r["totals"]
    src = [render.doc_head(f"{r['name']} · mathematics record", f"{r['name']} · Mathematics record {r['year']}", "REC",
                           attribution_text=f"Prepared by Marginalia from checked work on {_fmt(r['generated'])}. "
                                            "Times are estimates from the work done.")]
    src.append(f'#block(width: 100%, below: 1.2em)[#text(font: sans, size: 9pt, weight: "bold", fill: spot, tracking: 0.12em)'
               f'[HOMESCHOOL RECORD · {esc(r["year"])}] \\ #text(font: sans, size: 24pt, weight: "bold")[#"{esc(r["name"])} · Mathematics"] '
               f'\\ #text(font: sans, size: 11pt, fill: luma(60))[#"{esc(r["course"])}"]\n#line(length: 100%, stroke: 2pt + spot)]\n')
    src.append(f'#text(size: 11.5pt)[#"{esc(r["summary"])}"]\n')
    if r["pace"].get("message"):
        src.append(f'#v(4pt)\n#text(size: 10pt, fill: luma(60))[#"{esc(r["pace"]["message"])}"]\n')
    stats = [("Days of mathematics", t["days"]), ("Time (estimated)", duration(t["minutes"])), ("Problems worked", t["problems"]),
             ("Correct", f'{t["accuracy"]}%' if t["accuracy"] is not None else "–"), ("Skills learned here", t["learned"])]
    src.append("#v(8pt)\n#table(columns: (1fr,) * 5, align: center, inset: 7pt, fill: (x, y) => if y == 0 { tint1 }, "
               + ", ".join(f'[#text(size: 8pt, weight: "bold")[#"{esc(k)}"]]' for k, _ in stats) + ", "
               + ", ".join(f'[#text(size: 15pt, font: sans, weight: "bold", fill: spot)[#"{v}"]]' for _, v in stats) + ")\n")
    # progress by chapter
    src.append('#subsection[Progress through the course]\n#table(columns: (1fr, auto, 2.2in), inset: 5pt, stroke: none, '
               'table.hline(stroke: 0.5pt + spot), ')
    rows = []
    for c in r["chapters"]:
        frac = c["learned"] / c["total"] if c["total"] else 0
        bar = (f'box(width: 2in, height: 7pt, fill: tint2, stroke: 0.4pt + spot, '
               f'place(box(width: {2 * frac:.3f}in, height: 7pt, fill: spot)))')
        rows.append(f'[#"{esc(c["name"])}"], [#"{c["learned"]} of {c["total"]}"], [#{bar}]')
    src.append(", ".join(rows) + ")\n")
    # skills learned
    if r["learned"]:
        src.append('#subsection[Skills learned here]\n#table(columns: (auto, 1fr, 1fr), inset: 4pt, stroke: none, '
                   'table.header([*Date*], [*Skill*], [*Part of*]), table.hline(stroke: 0.5pt + spot), '
                   + ", ".join(f'[#"{esc(x["date"])}"], [#"{esc(x["name"])}"], [#text(fill: luma(80))[#"{esc(x["chapter"])}"]]'
                               for x in r["learned"]) + ")\n")
    if r["known"]:
        src.append('#subsection[Already known at the start]\n#text(size: 9.5pt)[#"'
                   + esc("Found by the getting-to-know-you pages: " + "; ".join(x["name"] for x in r["known"]) + ".") + '"]\n')
    # the log
    src.append('#subsection[Daily log]\n#set text(size: 9pt)\n#table(columns: (auto, auto, auto, 1fr), inset: 4pt, stroke: none, '
               'table.header([*Date*], [*Minutes*], [*Problems*], [*Worked on*]), table.hline(stroke: 0.5pt + spot), '
               + ", ".join(f'[#"{d["date"]}"], [#"{d["minutes"]}"], [#"{d["right"]} of {d["problems"]} right"], [#"{esc(d["what"])}"]'
                           for d in r["log"])
               + f', table.hline(stroke: 0.5pt + spot), [*Total*], [*#"{t["minutes"]}"*], [*#"{t["right"]} of {t["problems"]}"*], '
                 f'[#"{t["days"]} day{"s" if t["days"] != 1 else ""}"])\n#set text(size: 10.5pt)\n')
    # work samples: the child's own pages, as marked
    if r["samples"]:
        src.append('#pagebreak()\n#subsection[Samples of work]\n'
                   '#text(size: 9.5pt, fill: luma(70))[#"Pages as photographed and checked, with the marks the book made."]\n'
                   '#grid(columns: (1fr, 1fr), column-gutter: 14pt, row-gutter: 16pt, ')
        cells = []
        build_dir = paths.BUILD / "samples"
        build_dir.mkdir(parents=True, exist_ok=True)
        for smp in r["samples"]:
            src_photo = next((d / smp["photo"] for d in (paths.PROCESSED, paths.INBOX) if (d / smp["photo"]).exists()), None)
            if src_photo is None:
                continue
            dest = build_dir / f"{paths.learner_dir().name}-{Path(smp['photo']).stem}.jpg"
            if not dest.exists():
                try:
                    _, raw = transcribe.prepare_image(src_photo)
                except transcribe.UnreadableImage:
                    continue
                dest.write_bytes(raw)
            w, h = Image.open(dest).size
            W = 3.1
            H = W * h / w
            marks = "".join(
                f'#place(top + left, dx: {max(0.0, m["x"] - 0.07) * W:.3f}in, dy: {m["y"] * H - 0.12:.3f}in, '
                + (f'text(font: "Caveat", size: 20pt, weight: "bold", fill: rgb("#0d6b5e"))[✓])'
                   if m["v"] == "yes" else
                   f'circle(radius: 7.5pt, stroke: 1.4pt + rgb("#b13a26"), align(center + horizon, '
                   f'text(font: "Caveat", size: 12pt, weight: "bold", fill: rgb("#b13a26"))[{m["n"]}])))'
                   if m["v"] == "no" else 'text(fill: luma(120))[–])')
                for m in smp["marks"] if "x" in m and "y" in m)
            rel = "/" + str(dest.relative_to(paths.ROOT))
            cells.append(f'[#box(width: {W}in, height: {H:.3f}in, stroke: 0.5pt + luma(180))[#image("{rel}", width: {W}in){marks}]'
                         f' \\ #text(size: 8.5pt)[#"{smp["at"]} · pages {smp["packet"]} · {smp["right"]} of {smp["of"]} right"]]')
        src.append(", ".join(cells) + ")\n")
    src.append('#v(1fr)\n#line(length: 45%, stroke: 0.5pt)\n#text(size: 9pt)[Parent or teacher #h(2.2in) Date]\n')
    return render.compile_typst("\n".join(src), out)
