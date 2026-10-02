"""What happens next, without anyone having to decide it.

A family's whole job is: print the pages, and when the child is done, point a phone at the code
on the first page. Everything else follows from that:

  - a new child gets their first pages straight away (the grade they are in sets the course and
    where the questions start);
  - when a set of pages is fully checked, the next set is made: more getting-to-know-you pages
    until the diagnostic is settled, then lessons, each one chosen from what the work showed;
  - when new pages are ready, the grown-up gets them by email with the PDF attached, ready to print.

The scan code on each cover opens a signed link (/s/<learner>/<pages>/<signature>) on any phone,
without signing in: it can only send in photos of those pages and see how they went.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import threading
import time

from . import accounts, diagnostic, packets, paths, render
from .learner import LearnerDB

# grade -> (course, starting point). The grade a child is in is the only question a parent answers.
GRADES = [
    ("K", "Kindergarten", "elementary", "gK"),
    ("1", "1st grade", "elementary", "g1"),
    ("2", "2nd grade", "elementary", "g2"),
    ("3", "3rd grade", "elementary", "g3"),
    ("4", "4th grade", "elementary", "g4"),
    ("5", "5th grade", "elementary", "g5"),
    ("6", "6th grade", "prealgebra", "grade6"),
    ("7", "7th grade", "prealgebra", "grade7"),
    ("8", "8th grade", "algebra1", "arithmetic"),
    ("9", "9th grade or Algebra 1", "algebra1", "partway"),
]
GRADE = {g: (course, start) for g, _, course, start in GRADES}

# what each child is doing right now (for the page to say so): lid -> {"kind", "stage", "at"}
ACTIVITY: dict[str, dict] = {}
_ACT_LOCK = threading.Lock()


def set_activity(lid: str, kind: str | None, stage: str = "") -> None:
    with _ACT_LOCK:
        if kind is None:
            ACTIVITY.pop(lid, None)
        else:
            ACTIVITY[lid] = {"kind": kind, "stage": stage, "at": time.time()}


def activity(lid: str) -> dict | None:
    a = ACTIVITY.get(lid)
    if a and time.time() - a["at"] > 900:  # a stuck entry never blocks the page for long
        ACTIVITY.pop(lid, None)
        return None
    return a


# ---------------------------------------------------------------------------
# scan links

def _secret(a: accounts.Accounts) -> bytes:
    s = a.setting("scan_secret")
    if not s:
        s = secrets.token_hex(32)
        a.set_setting("scan_secret", s)
    return bytes.fromhex(s)


def sign(a: accounts.Accounts, lid: str, pid: str) -> str:
    return hmac.new(_secret(a), f"{lid}:{pid}".encode(), hashlib.sha256).hexdigest()[:20]


def verify(a: accounts.Accounts, lid: str, pid: str, sig: str) -> bool:
    return hmac.compare_digest(sign(a, lid, pid), sig or "")


def scan_url(a: accounts.Accounts, base: str, lid: str, pid: str) -> str:
    return f"{base}/s/{lid}/{pid}/{sign(a, lid, pid)}"


# ---------------------------------------------------------------------------
# making the next pages

def next_pages(db: LearnerDB, progress=lambda s: None, use_jev: bool = True) -> dict | None:
    """Make the next set of pages for the learner in scope, unless some are still open.
    Returns {"packet", "kind"} or None when nothing was made."""
    if any(p["status"] == "open" for p in db.packets()):
        return None
    summ = diagnostic.summary(db)
    cfg = diagnostic._cfg()["diagnostic"]
    if summ["asked"] < cfg["max_questions"] and not placement_settled(db):
        progress("Choosing the questions that tell the most")
        try:
            pid = diagnostic.create_round(db)
        except RuntimeError:
            pid = None
        if pid:
            progress("Setting the pages")
            packets.render_diagnostic(db, pid)
            return {"packet": pid, "kind": "diagnostic"}
    if not any(p["kind"] in ("lesson", "refresh") for p in db.packets()) and not placement():
        save_placement(db)  # the getting-to-know-you pages are done: where the child starts
    from . import outside

    if outside.own_book():
        # the family's own book teaches; our pages only fill what its pages show is shaky
        focus = outside.gaps(db)
        if not focus:
            return None
        progress("Writing a short refresher on what the last pages showed")
        r = packets.build_refresh(db, focus, log=db.log_jev, use_jev=use_jev, kind="refresh")
        return {"packet": r["pid"], "kind": "refresh"}
    progress("Choosing what to teach next, and checking every line written for it")
    r = packets.next_lesson(db, log=db.log_jev, use_jev=use_jev)
    return {"packet": r["pid"], "kind": r["kind"]}


def placement_settled(db: LearnerDB) -> bool:
    """Enough getting-to-know-you: start teaching. True when the grown-up chose to start lessons,
    or when the last set came back mostly skipped or wrong (the material is new, and more questions
    about it would only be more pages of not knowing), or after two sets for any course."""
    from . import story

    if story.profile().get("placement_done"):
        return True
    rounds = [r for r in db.packets("diagnostic") if r["status"] != "open"]
    if len(rounds) >= 2:
        return True
    if not rounds:
        return False
    last = [db.attempt(p["id"]) for p in db.problems(rounds[-1]["id"])]
    seen = [a for a in last if a]
    return len(seen) >= 5 and sum(1 for a in seen if not a["correct"]) / len(seen) >= 0.6


def start_lessons(db: LearnerDB) -> None:
    """'Start teaching now': open getting-to-know-you pages are set aside and placement ends."""
    from . import story
    from .learner import config

    with db.tx() as c:
        c.execute("UPDATE packets SET status='set_aside' WHERE status='open' AND kind='diagnostic'")
    story.save_profile(placement_done=True)
    if not diagnostic.summary(db)["answered"]:
        # nothing answered: start where the grade the grown-up chose says, taking as known what that
        # grade makes more likely than not (not the very beginning of the book)
        thr = config()["learner"]["mastery_threshold"]
        known = {s: max(p, thr) for s, p in db.mastery().items() if p >= 0.5}
        if known:
            db.set_mastery(known, "diagnostic: starting point from the grade chosen", None, source="diagnostic")
            db.mark_placed(known)


def placement_path():
    return paths.learner_dir() / "placement.json"


def save_placement(db: LearnerDB) -> dict:
    """A snapshot, when the getting-to-know-you pages are done, of where the child is starting:
    each chapter (grade) with how much of it is already known, and the first thing to learn."""
    from . import extract, records

    sk = extract.skills()
    groups = records.skill_groups()
    chapters = records.chapter_progress(db, groups)
    front = db.frontier()
    start = None
    if front:
        part = (sk[front[0]].get("lesson") or [{}])[0]
        start = {"skill": sk[front[0]]["name"], "chapter": groups[front[0]],
                 "section": f"{part.get('section', '')} {part.get('title', '')}".strip()}
    snap = {"date": time.strftime("%Y-%m-%d"), "start": start,
            "chapters": [{"name": c["name"], "known": c["learned"], "total": c["total"]} for c in chapters],
            "answered": diagnostic.summary(db)["answered"]}
    placement_path().write_text(json.dumps(snap), encoding="utf-8")
    return snap


def placement() -> dict | None:
    f = placement_path()
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else None


def milestones(db: LearnerDB) -> list[dict]:
    """Chapters (grades) completed through the lessons, with the day each was finished."""
    from . import extract, records

    groups = records.skill_groups()
    learned = records.learned_dates(db)
    sk = extract.skills()
    out = []
    for c in records.chapter_progress(db, groups):
        ids = [x["id"] for x in c["skills"]]
        if not ids or not all(i in learned for i in ids) or not any(learned[i]["how"] == "learned" for i in ids):
            continue
        out.append({"chapter": c["name"], "date": max(learned[i]["date"] for i in ids),
                    "skills": [sk[i]["name"] for i in ids], "index": len(out)})
    return sorted(out, key=lambda m: m["date"])


def profile_name() -> str:
    return render.learner_name()


def describe(kind: str) -> str:
    return {"diagnostic": "getting-to-know-you pages", "lesson": "a new lesson", "refresh": "a short refresher"}.get(kind, "pages")


def _grownup_note(skill: dict) -> str | None:
    """The 'For the grown-up' note the book itself has for this skill's section (the elementary book)."""
    from . import cnxml, extract

    for part in skill.get("lesson") or []:
        try:
            mod = extract.module(part["book"], part["section"])
        except KeyError:
            continue
        for b in cnxml.walk(mod.blocks):
            if b["t"] == "box" and cnxml.plain(b.get("title")).strip() == "For the grown-up":
                return " ".join(cnxml.block_plain(x) for x in b["blocks"]).strip()
    return None


def teaching_note(db: LearnerDB, pid: str, child: str) -> dict:
    """A short note for the grown-up with each set of pages: what it is about, how to start, what to
    watch for (this child's own recent mistakes first), and how long it takes. Built from the book
    and the misconception library; nothing generated."""
    from . import extract, records
    from .packets import recent_misconceptions

    pk = db.packet(pid)
    sk = extract.skills()
    probs = db.problems(pid)
    minutes = sum(records.minutes_per_problem(sk.get(p["skill"], {})) for p in probs)
    meta = json.loads(pk["meta"] or "{}")
    if pk["kind"] == "diagnostic":
        young = any(sk.get(p["skill"], {}).get("grade") in ("K", "1", "2") for p in probs)
        return {"title": "About these pages",
                "about": f"These pages find where {child} is, so the next ones start in the right place.",
                "how": (f"Read each question aloud if {child} wants. " if young else "")
                       + f"Please don’t teach or hint: if {child} hasn’t learned something yet, writing “skip” tells the book as much as an answer.",
                "watch": [], "minutes": int(round(minutes / 5) * 5) or 5}
    focus = [s for s in meta.get("focus", []) if s in sk]
    minutes += records.READ_MINUTES
    names = [sk[s]["name"] for s in focus]
    sections = []
    for s in focus:
        for part in sk[s].get("lesson") or []:
            t = f"{part['section']} {part.get('title', '')}".strip()
            if t not in sections:
                sections.append(t)
    note = next((n for n in (_grownup_note(sk[s]) for s in focus) if n), None)
    obj = next((o for s in focus for o in sk[s].get("learning_objectives", [])), None)
    how = note or (f"Read the first pages with {child}: the explanation and worked examples come straight from the book "
                   f"(Section {', '.join(sections)}). Ask {child} to explain one example back to you before starting the practice.")
    lib = {m["id"]: m for lst in extract.misconceptions().values() for m in lst}
    mine = recent_misconceptions(db)
    watch = []
    for s in focus:
        m = mine.get(s)
        if m in lib:
            watch.append({"text": lib[m]["description"], "seen": True})
    for s in focus:
        for m in extract.misconceptions().get(s, [])[:2]:
            if len(watch) < 3 and not any(w["text"] == m["description"] for w in watch):
                watch.append({"text": m["description"], "seen": False})
    if pk["kind"] == "refresh":
        about = f"A short refresher on {', '.join(names)}: something {child} has met before but was shaky on."
    else:
        about = f"A new lesson: {', '.join(names)}." + (f" By the end, {child} should be able to {obj[0].lower() + obj[1:]}." if obj else "")
    return {"title": "About these pages", "about": about, "how": how, "watch": watch, "sections": sections,
            "minutes": int(round(minutes / 5) * 5) or 5}


def note_text(n: dict, child: str) -> list[str]:
    """The teaching note as paragraphs (for email)."""
    out = [n["about"], n["how"]]
    if n.get("watch"):
        out.append("What to watch for: " + " ".join(
            (f"{child} did this last time: " if w["seen"] else "") + w["text"] for w in n["watch"]))
    out.append(f"About {n['minutes']} minutes.")
    return out


def pages_email(to: str, child: str, made: dict, pdf, book_url: str, scan: str, first: bool, note: dict | None = None) -> dict:
    from . import mailer

    what = describe(made["kind"])
    subject = f"{child}’s first pages are ready" if first else f"{child}’s next pages are ready"
    guide = note_text(note, child) if note else []
    text = (f"{subject}: {what}, attached as a PDF.\n\n"
            + ("".join(p + "\n\n" for p in guide))
            + f"Print them and let {child} work right on the pages. When {child} is done, point your phone’s camera "
            f"at the code on the first page and take a photo of each page. Every step is checked, and the next "
            f"pages are made from what the work shows.\n\n{child}’s book: {book_url}\n")
    html = mailer._html(subject, [f"{what.capitalize()}, attached as a PDF."] + guide + [
        f"Print them and let {child} work right on the pages. When {child} is done, point your phone’s camera at the code "
        f"on the first page and take a photo of each page.",
        "Every step is checked, and the next pages are made from what the work shows."],
        button=(f"Open {child}’s book", book_url))
    att = [{"filename": f"{child}-{made['packet']}.pdf".replace(" ", "-"), "path": str(pdf)}]
    return mailer.send(to, subject, text, html, attachments=att)


def advance(a: accounts.Accounts, fam: dict, lr: dict, base: str, progress=lambda s: None,
            email: bool = True) -> dict | None:
    """In the learner's scope: make the next pages if none are open, then email them. Billing and
    daily limits apply; reasons for not making pages are returned, not raised."""
    lid = lr["id"]
    if not a.has_access(fam):
        return {"skipped": "subscription"}
    db = LearnerDB()
    if any(p["status"] == "open" for p in db.packets()):
        return None
    first = not db.packets()
    from .learner import config

    try:
        a.use(lid, "packets", int(config().get("limits", {}).get("packets_per_day", 1000)))
    except accounts.AuthError:
        return {"skipped": "daily limit"}
    from . import story

    token = render.SCAN_LINK.set(lambda pid: scan_url(a, base, lid, pid))
    told = render.STORY.set(lambda pid, kind, about: (progress("Writing the next part of the story"),
                                                      story.for_pages(pid, kind, about))[1])
    try:
        import os

        made = next_pages(db, progress, use_jev=bool(os.environ.get("TYPESAFE_API_KEY")))
    finally:
        render.STORY.reset(told)
        render.SCAN_LINK.reset(token)
    if made and email and fam.get("email"):
        pk = db.packet(made["packet"])
        try:
            pages_email(fam["email"], lr["name"], made, pk["pdf"], f"{base}/learn/{lid}",
                        scan_url(a, base, lid, made["packet"]), first, teaching_note(db, made["packet"], lr["name"]))
        except Exception as e:  # noqa: BLE001 - the pages are made; a mail problem must not undo that
            print(f"pages email failed: {e}")
    return made


OLD_CODE_BOX = "WRITE THIS CODE ON YOUR PAGE"


def ensure_scan_code(a: accounts.Accounts, db: LearnerDB, base: str, lid: str, pid: str) -> bool:
    """Pages made before the scan code existed get one, so every open set can be sent in from a
    phone. Getting-to-know-you pages are set again from their stored questions (same questions, the
    current design); other pages get the code stamped where the old 'write this code' box was, so
    their problems stay exactly as printed. Returns True when the pages changed."""
    import pymupdf

    pk = db.packet(pid)
    if not pk or not pk["pdf"] or not os.path.exists(pk["pdf"]):
        return False
    with pymupdf.open(pk["pdf"]) as doc:
        hits = doc[0].search_for(OLD_CODE_BOX)
    if not hits:
        return False
    link = lambda p: scan_url(a, base, lid, p)  # noqa: E731
    if pk["kind"] == "diagnostic":
        from . import packets

        token = render.SCAN_LINK.set(link)
        try:
            packets.render_diagnostic(db, pid)
        finally:
            render.SCAN_LINK.reset(token)
        return True
    import segno

    r = hits[0]
    box = pymupdf.Rect(r.x0 - 9, r.y0 - 9, r.x1 + 9, r.y1 + 40)
    qr = segno.make(link(pid), error="m")
    import io

    png = io.BytesIO()
    qr.save(png, kind="png", scale=8, border=0, dark="#006B7F")
    who = render.learner_name() or "your child"
    tmp = pk["pdf"] + ".tmp"
    with pymupdf.open(pk["pdf"]) as doc:
        page = doc[0]
        page.add_redact_annot(box, fill=(1, 1, 1))
        page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE)
        teal = (0, 0x6B / 255, 0x7F / 255)
        page.draw_rect(box, color=teal, width=1.2)
        side = box.height - 8
        page.insert_image(pymupdf.Rect(box.x0 + 4, box.y0 + 4, box.x0 + 4 + side, box.y0 + 4 + side), stream=png.getvalue())
        page.insert_textbox(pymupdf.Rect(box.x0 + side + 9, box.y0 + 5, box.x1 - 3, box.y1 - 3),
                            f"GROWN-UPS\nWhen {who} is done, point your phone's camera here.",
                            fontsize=6.6, fontname="helv", color=teal)
        doc.save(tmp)
    os.replace(tmp, pk["pdf"])
    return True


def packet_done(db: LearnerDB, pid: str) -> bool:
    pk = db.packet(pid)
    return bool(pk) and pk["status"] != "open"


def summary_of(db: LearnerDB, pid: str) -> dict:
    """How a set of pages went, in a parent's terms."""
    probs = db.problems(pid)
    atts = {x["problem_id"]: x for x in db.attempts() if x["packet_id"] == pid}
    skipped = sum(1 for x in atts.values() if ((x["evidence"] or {}).get("decision") or {}).get("strategy") == "skipped")
    right = sum(1 for x in atts.values() if x["correct"])
    return {"packet": pid, "problems": len(probs), "checked": len(atts), "right": right, "skipped": skipped}
