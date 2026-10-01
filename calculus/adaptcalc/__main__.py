"""Command line: python -m adaptcalc <command>

  --course ID             act on courses/ID (algebra1, calc_limits); default calc_limits
  extract                 fetch the course's books, write its skills.json + misconceptions.json
  verify-templates        generate every template at many seeds; SymPy-check each key
  diagnostic              create + render the next diagnostic round (or report it is finished)
  status                  mastery per skill, diagnostic entropy, frontier, due reviews
  lesson [--no-jev]       build the next lesson packet for the frontier skills
  process PHOTO           run one photo through the pipeline
  watch [--once]          watch ./inbox for photos
  grade PACKET "1:c 2:x"  grade without a photo (c = correct, x = wrong, s = skipped)
  serve [--host --port]   the browser app (http://127.0.0.1:8000; HOST/PORT env also work)
  codes [--add CODE --uses N --note TEXT]   pilot access codes for sign-up
  owner EMAIL             create the owner account (password from ADAPTCALC_OWNER_PASSWORD or a prompt)
  warm                    download the book, figures, fonts and Typst packages (for images)
"""
from __future__ import annotations

import argparse
import json
import os
import sys

from . import diagnostic, extract, packets, paths, pipeline, templates
from .learner import LearnerDB


def cmd_extract(a):
    s, m = extract.build()
    print(f"wrote {paths.SKILLS_JSON.name}: {len(s['skills'])} skills; "
          f"{paths.MISCONCEPTIONS_JSON.name}: {sum(len(v) for v in m['misconceptions'].values())} misconceptions")


def cmd_verify(a):
    mine = templates.for_course()
    bad = templates.verify_all(range(a.seeds), set(extract.skills()))
    print(f"{paths.course()}: {len(mine)} templates x {a.seeds} seeds: " + ("all keys verified" if not bad else f"{len(bad)} failures"))
    for b in bad:
        print("  " + b)
    return 1 if bad else 0


def cmd_diagnostic(a):
    db = LearnerDB()
    pid = diagnostic.create_round(db)
    if pid is None:
        s = diagnostic.summary(db)
        print(f"diagnostic finished after {s['asked']} questions; remaining uncertainty "
              f"{s['entropy']['sum_marginal_bits']:.2f} bits (max per skill {s['entropy']['max_marginal_bits']:.2f})")
        return
    r = packets.render_diagnostic(db, pid)
    meta = json.loads(db.packet(pid)["meta"])
    print(f"{pid}: {len(db.problems(pid))} questions, expected information {meta['expected_info_bits']:.2f} bits "
          f"(belief entropy before: {meta['entropy_before']['sum_marginal_bits']:.2f} bits summed over skills)")
    print(f"  packet: {r['pdf']}\n  key:    {r['key']}")


def cmd_status(a):
    db = LearnerDB()
    sk = extract.skills()
    rows = {r["id"]: r for r in db.skill_rows()}
    for s in extract.skill_order():
        r = rows[s]
        bar = "#" * int(round(r["p_mastery"] * 20))
        print(f"  {s:26s} {r['p_mastery']:.2f} {bar:20s} {r['source']:10s} {sk[s]['section'] or 'found.'}"
              + (f"  review {r['next_review'][:10]}" if r["next_review"] else ""))
    s = diagnostic.summary(db)
    print(f"diagnostic: {s['answered']}/{s['asked']} answered; uncertainty {s['entropy']['sum_marginal_bits']:.2f} bits")
    print("frontier:", ", ".join(db.frontier()) or "-")
    print("due reviews:", ", ".join(db.due_reviews()) or "-")


def cmd_lesson(a):
    db = LearnerDB()
    if a.focus or a.section:
        r = packets.build_lesson(db, focus=a.focus.split(",") if a.focus else None, section=a.section,
                                 log=db.log_jev, use_jev=not a.no_jev)
    else:
        r = packets.next_lesson(db, log=db.log_jev, use_jev=not a.no_jev)
    acc = sum(1 for d in r["decisions"] if d["accepted"])
    print(f"{r['pid']}: focus {', '.join(r['focus'])}; {acc}/{len(r['decisions'])} generated snippets accepted; "
          f"verbatim audit {'ok' if r['audit']['ok'] else 'FAILED'} ({r['audit']['runs']} canonical runs)")
    print(f"  packet: {r['pdf']}\n  key:    {r['key']}")


def _print_report(rep):
    if rep.get("pending"):
        print(f"{rep['photo']}: {rep['pending']}")
        return
    print(f"{rep['photo']} -> packet {rep.get('packet')} (transcriber: {rep.get('transcriber')})")
    for p in rep.get("problems", []):
        if p.get("status") != "graded":
            print(f"  #{p['number']}: {p.get('status')}")
            continue
        d = p["decision"]
        print(f"  #{p['number']}: {'correct' if p['correct'] else 'wrong'}  credit {p['credit']:.2f}  "
              f"first invalid line {p['stepcheck']['first_invalid_line']}  misconception {d['misconception']}  "
              f"attempts {d['attempts']}  strategy {d['strategy']}")
        for k, (b, c) in p["mastery_changes"].items():
            print(f"      {k}: {b:.2f} -> {c:.2f}")


def cmd_process(a):
    db = LearnerDB()
    _print_report(pipeline.process_photo(db, a.photo, move=not a.keep))


def cmd_watch(a):
    db = LearnerDB()
    print(f"watching {paths.INBOX} (Ctrl-C to stop)")
    pipeline.watch(db, once=a.once, on_report=_print_report)


def cmd_grade(a):
    db = LearnerDB()
    for tok in a.marks.split():
        num, mark = tok.split(":")
        prid = f"{a.packet}-{int(num):02d}"
        prob = db.problem(prid)
        c = {"c": 1.0, "x": 0.0, "s": 0.0}[mark]
        db.record_attempt(prob | {"id": prid}, {"correct": c == 1.0, "credit": c, "misconception_root": None,
                                               "evidence": {"decision": {"manual": True}}})
        print(f"{prid}: {'correct' if c else 'wrong/skipped'}")


def cmd_recheck(a):
    db = LearnerDB()
    for prid in a.problems:
        print(prid, db.recheck(prid))


def cmd_warm(a):
    """Download everything the app needs once (used by the Dockerfile)."""
    from . import assets, extract, render, source

    from . import cnxml

    for book in source.BOOKS:
        source.fetch_book(book)
        extract.load_book(book)
    assets.ensure_fonts()
    for img in sorted(paths.MEDIA_DIR.glob("*.jpg")):
        assets.duotone(img.name)
    # figures (and the small images inside worked-step tables) in every lesson of every course
    def images_in(node):
        if isinstance(node, dict):
            if node.get("t") == "figure":
                yield from node.get("images", [])
            if node.get("k") == "img":
                yield node["src"]
            for v in node.values():
                yield from images_in(v)
        elif isinstance(node, list):
            for v in node:
                yield from images_in(v)

    n, seen = 0, set()
    for course in sorted(p.name for p in paths.COURSES_DIR.iterdir() if (p / "skills.json").exists()):
        with paths.use_course(course):
            for s in extract.skills().values():
                for part in s.get("lesson") or []:
                    mod = extract.module(part["book"], part["section"])
                    for sub in part["subsections"]:
                        sec = extract.find_subsection(mod, sub["title"] or extract.OPENING)
                        for name in images_in(sec) if sec else []:
                            if name not in seen:
                                seen.add(name)
                                assets.duotone(name)
                                n += 1
    print(f"warm: {n} lesson figures")
    # first compile downloads the cetz Typst package into the image
    render.compile_typst(render.doc_head("warm", "warm", "W") + "#cetz.canvas({ cetz.draw.line((0, 0), (1, 1)) })\n",
                         paths.BUILD / "warm.pdf")
    assets.ensure_web_assets()
    print("warm: source, figures, fonts, KaTeX and Typst packages cached")


def cmd_serve(a):
    from . import web

    print(f"open http://{a.host}:{a.port}")
    web.serve(a.host, a.port)


def cmd_codes(a):
    """Pilot access codes: list them, or add one (python -m adaptcalc codes --add CODE --uses 10)."""
    from . import accounts

    acc = accounts.Accounts()
    if a.add is not None:
        code = acc.add_code(a.add, a.uses, a.note or "")
        print(f"added {code} ({a.uses} uses)")
    for c in acc.codes():
        print(f"{c['code']:<16} {c['uses_left']:>4} uses left  {c['note'] or ''}")


def cmd_owner(a):
    """Create the owner account (may use personal-study courses)."""
    import getpass

    from . import accounts

    pw = os.environ.get("ADAPTCALC_OWNER_PASSWORD") or getpass.getpass("password: ")
    fid = accounts.Accounts().create_family(a.email, pw, name="Owner", role="owner")
    print(f"owner account {a.email} created ({fid})")


def main(argv=None):
    ap = argparse.ArgumentParser(prog="adaptcalc", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--course", default=None, help="course id (courses/<id>); default $ADAPTCALC_COURSE or calc_limits")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("extract").set_defaults(fn=cmd_extract)
    v = sub.add_parser("verify-templates")
    v.add_argument("--seeds", type=int, default=25)
    v.set_defaults(fn=cmd_verify)
    sub.add_parser("diagnostic").set_defaults(fn=cmd_diagnostic)
    sub.add_parser("status").set_defaults(fn=cmd_status)
    le = sub.add_parser("lesson")
    le.add_argument("--no-jev", action="store_true")
    le.add_argument("--focus")
    le.add_argument("--section")
    le.set_defaults(fn=cmd_lesson)
    pr = sub.add_parser("process")
    pr.add_argument("photo")
    pr.add_argument("--keep", action="store_true", help="do not move the photo to inbox/processed")
    pr.set_defaults(fn=cmd_process)
    w = sub.add_parser("watch")
    w.add_argument("--once", action="store_true")
    w.set_defaults(fn=cmd_watch)
    g = sub.add_parser("grade")
    g.add_argument("packet")
    g.add_argument("marks")
    g.set_defaults(fn=cmd_grade)
    sub.add_parser("warm").set_defaults(fn=cmd_warm)
    rc = sub.add_parser("recheck")
    rc.add_argument("problems", nargs="+")
    rc.set_defaults(fn=cmd_recheck)
    cd = sub.add_parser("codes")
    cd.add_argument("--add", nargs="?", const="", default=None, help="add a code (blank: random)")
    cd.add_argument("--uses", type=int, default=10)
    cd.add_argument("--note")
    cd.set_defaults(fn=cmd_codes)
    ow = sub.add_parser("owner")
    ow.add_argument("email")
    ow.set_defaults(fn=cmd_owner)
    sv = sub.add_parser("serve")
    sv.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    sv.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8000)))
    sv.set_defaults(fn=cmd_serve)
    a = ap.parse_args(argv)
    if a.course:
        with paths.use_course(a.course):
            return a.fn(a) or 0
    return a.fn(a) or 0


if __name__ == "__main__":
    sys.exit(main())
