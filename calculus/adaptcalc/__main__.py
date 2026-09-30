"""Command line: python -m adaptcalc <command>

  extract                 fetch Chapter 2, write skills.json + misconceptions.json
  verify-templates        generate every template at many seeds; SymPy-check each key
  diagnostic              create + render the next diagnostic round (or report it is finished)
  status                  mastery per skill, diagnostic entropy, frontier, due reviews
  lesson [--no-jev]       build the next lesson packet for the frontier skills
  process PHOTO           run one photo through the pipeline
  watch [--once]          watch ./inbox for photos
  grade PACKET "1:c 2:x"  grade without a photo (c = correct, x = wrong, s = skipped)
  serve [--host --port]   the browser app (http://127.0.0.1:8000; HOST/PORT env also work)
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
    bad = templates.verify_all(range(a.seeds))
    print(f"{len(templates.REGISTRY)} templates x {a.seeds} seeds: " + ("all keys verified" if not bad else f"{len(bad)} failures"))
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
    # figures inside the subsections that refresh packets print
    n = 0
    for s in extract.skills().values():
        for part in s.get("lesson") or []:
            mod = extract.module(part["book"], part["section"])
            for sub in part["subsections"]:
                sec = extract.find_subsection(mod, sub["title"])
                for b in cnxml.walk([sec]) if sec else []:
                    if b["t"] == "figure":
                        for name in b["images"]:
                            assets.duotone(name)
                            n += 1
    print(f"warm: {n} refresh figures")
    # first compile downloads the cetz Typst package into the image
    render.compile_typst(render.doc_head("warm", "warm", "W") + "#cetz.canvas({ cetz.draw.line((0, 0), (1, 1)) })\n",
                         paths.BUILD / "warm.pdf")
    print("warm: source, figures, fonts and Typst packages cached")


def cmd_serve(a):
    from . import assets, web

    if a.host not in ("127.0.0.1", "localhost") and not os.environ.get("ADAPTCALC_PASSWORD") \
            and not os.environ.get("ADAPTCALC_ALLOW_OPEN"):
        sys.exit("Refusing to serve on a public address without ADAPTCALC_PASSWORD "
                 "(set it, or ADAPTCALC_ALLOW_OPEN=1 to override).")
    assets.ensure_fonts()
    print(f"open http://{a.host}:{a.port}")
    web.serve(a.host, a.port)


def main(argv=None):
    ap = argparse.ArgumentParser(prog="adaptcalc", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
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
    sv = sub.add_parser("serve")
    sv.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    sv.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8000)))
    sv.set_defaults(fn=cmd_serve)
    a = ap.parse_args(argv)
    return a.fn(a) or 0


if __name__ == "__main__":
    sys.exit(main())
