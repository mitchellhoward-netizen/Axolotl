"""Photo pipeline: ./inbox photo -> transcription -> SymPy step check -> Jev evidence -> one update per problem."""
from __future__ import annotations

import json
import shutil
import time
from pathlib import Path

import sympy as sp

from . import evidence, extract, paths, stepcheck, transcribe
from .learner import AlreadyGraded, LearnerDB, config, now
from .symtyp import plain as P

PHOTO_EXT = {".jpg", ".jpeg", ".png", ".webp", ".heic"}


def key_plain(key: dict) -> str:
    v = key.get("value")
    if key["kind"] in ("limit", "value", "expr", "delta"):
        return "DNE (does not exist)" if v == "DNE" else P(sp.sympify(v))
    if key["kind"] == "interval":
        return str(sp.sympify(v))
    if key["kind"] == "set":
        return ", ".join(v)
    return str(v)


def credit_from(check: dict, decision: dict, strategies: dict) -> float:
    pol = config()["evidence_policy"]
    if check["skipped"]:
        return pol["skip_credit"]
    if not check["final_correct"]:
        return 0.0
    c = 1.0
    if decision["attempts"] > 1:
        c *= pol["restart_credit"]
    c *= pol["substeps_floor"] + (1 - pol["substeps_floor"]) * decision["substeps_written_fraction"]
    target = next(iter(strategies))
    if decision["strategy"] not in (target, "unsure"):
        c *= pol["off_strategy_credit"]
    if not check["all_steps_valid"]:
        c *= pol["invalid_step_credit"]
    return round(c, 3)


def resolve_packet(db: LearnerDB, code: str | None) -> str | None:
    if code:
        code = code.strip().upper()
        if db.packet(code):
            return code
    op = db.open_packet()
    return op["id"] if op else None


def process_photo(db: LearnerDB, photo: Path, transcriber=None, jev_client=None, move: bool = True) -> dict:
    photo = Path(photo)
    transcriber = transcriber or transcribe.default_transcriber()
    op = db.open_packet()
    context = transcribe.packet_context(db.problems(op["id"])) if op else ""
    doc = transcriber.transcribe(photo, context)
    pid = resolve_packet(db, doc.get("packet_code"))
    report = {"photo": photo.name, "transcriber": transcriber.backend, "packet": pid,
              "transcript": doc, "problems": [], "at": now()}
    if pid is None:
        report["error"] = "no packet code on the page and no open packet"
        return report
    library_all = extract.misconceptions()
    for tp in doc["problems"]:
        prid = f"{pid}-{tp['number']:02d}"
        prob = db.problem(prid)
        entry = {"number": tp["number"], "problem_id": prid}
        if prob is None:
            entry["status"] = "no such problem on the packet"
            report["problems"].append(entry)
            continue
        if db.is_graded(prid):
            entry["status"] = "already graded (the model is updated once per problem)"
            report["problems"].append(entry)
            continue
        data = prob["data"]
        check = stepcheck.check(tp, data["key"])
        library = library_all[data["skill"]]
        public = {"statement": data["plain"], "key_display": key_plain(data["key"]),
                  "strategies": data["strategies"], "substeps": data["substeps"]}
        if check["skipped"]:
            ev = {"decision": {"misconception": "skipped", "misconception_root": None, "attempts": 0,
                               "crossed_out_runs": 0, "substeps": {}, "substeps_written_fraction": 0.0,
                               "strategy": "skipped"}}
        else:
            ev = evidence.gather(public, tp, check, library, log=db.log_jev, client=jev_client)
        dec = ev["decision"]
        credit = credit_from(check, dec, data["strategies"])
        outcome = {"correct": check["final_correct"], "credit": credit,
                   "misconception_root": dec.get("misconception_root"),
                   "photo": photo.name, "transcript": tp, "stepcheck": check,
                   "evidence": {"decision": dec, "jev": ev.get("raw"), "transcriber": transcriber.backend}}
        try:
            changes = db.record_attempt(prob | {"id": prid}, outcome)
        except AlreadyGraded:
            entry["status"] = "already graded"
            report["problems"].append(entry)
            continue
        entry.update({"status": "graded", "correct": check["final_correct"], "credit": credit,
                      "stepcheck": check, "decision": dec,
                      "mastery_changes": {k: [round(a, 3), round(b, 3)] for k, (a, b) in changes.items()}})
        report["problems"].append(entry)
    rep_path = paths.OUT / f"report-{photo.stem}.json"
    rep_path.parent.mkdir(parents=True, exist_ok=True)
    rep_path.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    report["report_path"] = str(rep_path)
    if move:
        paths.PROCESSED.mkdir(parents=True, exist_ok=True)
        request = photo.with_name(photo.name + ".transcription-request.md")
        for f in [photo, transcribe.sidecar_path(photo), request]:
            if f.exists():
                shutil.move(str(f), paths.PROCESSED / f.name)
    return report


def pending_photos(inbox: Path) -> list[Path]:
    return sorted(p for p in inbox.iterdir() if p.is_file() and p.suffix.lower() in PHOTO_EXT)


def watch(db: LearnerDB, inbox: Path | None = None, interval: float = 5.0, once: bool = False,
          transcriber=None, on_report=None) -> None:
    inbox = inbox or paths.INBOX
    inbox.mkdir(parents=True, exist_ok=True)
    waiting: set[str] = set()
    while True:
        for photo in pending_photos(inbox):
            try:
                rep = process_photo(db, photo, transcriber=transcriber)
                waiting.discard(photo.name)
                if on_report:
                    on_report(rep)
            except transcribe.PendingTranscription as e:
                if photo.name not in waiting and on_report:
                    on_report({"photo": photo.name, "pending": f"waiting for transcript {e}"})
                waiting.add(photo.name)
        if once:
            return
        time.sleep(interval)
