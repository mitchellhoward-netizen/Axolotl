"""Snapshot sources and inspect them.

    python -m tools.sources show URL [--grep REGEX]   print a page's normalized text (research aid)
    python -m tools.sources snapshot [--part PROG/SCOPE] [--id ID] [--refresh]
    python -m tools.sources list [--part PROG/SCOPE]
    python -m tools.sources import --id ID --file PATH [--via HOW]

``import`` records a copy fetched some other way (a browser, or a research
tool) for sites that refuse scripted requests. The manifest says how it was
obtained, and the change-detection job reports those sources as "re-check by
hand" when it cannot re-fetch them.

``snapshot`` fetches every source listed in a ``sources.yaml`` that has no
snapshot yet (or every selected source with ``--refresh``), saves the raw
file and its normalized text under the playbook's ``snapshots/<source-id>/``,
records the fetch in ``snapshots/<source-id>/manifest.yaml``, and sets the
source's ``retrieved:`` date in ``sources.yaml`` to the snapshot date.

A snapshot is the reviewer's record of what the source said when the rule
was written. Refreshing one means "I re-checked the dependent rules against
the new text"; the change-detection job never refreshes on its own.
"""

from __future__ import annotations

import argparse
import re
import sys
from datetime import date
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from rulesarchive import ARCHIVE_ROOT  # noqa: E402
from rulesarchive.registry import Part, iter_parts  # noqa: E402
from tools.fetch import fetch, strip_active_content  # noqa: E402

RAW_LIMIT = 6 * 1024 * 1024  # larger raw files are kept as text only


def manifest_path(part: Part, sid: str) -> Path:
    return part.snapshot_root / sid / "manifest.yaml"


def read_manifest(part: Part, sid: str) -> list[dict]:
    p = manifest_path(part, sid)
    return (yaml.safe_load(p.read_text()) or []) if p.exists() else []


def latest_snapshot(part: Part, sid: str) -> dict | None:
    m = read_manifest(part, sid)
    return m[-1] if m else None


def take_snapshot(part: Part, src: dict, today: date | None = None) -> dict:
    today = today or date.today()
    sid = src["id"]
    f = fetch(src["url"])
    d = part.snapshot_root / sid
    d.mkdir(parents=True, exist_ok=True)
    entry = {
        "retrieved": today.isoformat(),
        "url": src["url"],
        "final_url": f.final_url,
        "status": f.status,
        "content_type": f.content_type,
        "text_sha256": f.text_sha256,
        "text": f"{sid}/{today.isoformat()}.txt",
        "raw": None,
    }
    if not f.ok:
        # Keep the failure on record but do not store the error page as a snapshot.
        entry["error"] = f.text[:300] if f.status == 0 else f"HTTP {f.status}"
        entry["text"] = None
        # Never let a failed re-fetch replace a good snapshot taken the same day.
        m = [e for e in read_manifest(part, sid) if e["retrieved"] != entry["retrieved"] or not e.get("error")] + [entry]
        manifest_path(part, sid).write_text(yaml.safe_dump(m, sort_keys=False))
        return entry
    (d / f"{today.isoformat()}.txt").write_text(f.text)
    body = strip_active_content(f.body) if f.kind == "html" else f.body
    if body and len(body) <= RAW_LIMIT:
        raw_name = f"{today.isoformat()}.{f.kind if f.kind != 'txt' else 'raw'}"
        (d / raw_name).write_bytes(body)
        entry["raw"] = f"{sid}/{raw_name}"
    elif f.body:
        entry["raw_omitted"] = f"{len(f.body)} bytes > {RAW_LIMIT}; text only"
    m = read_manifest(part, sid)
    m = [e for e in m if e["retrieved"] != entry["retrieved"]] + [entry]
    manifest_path(part, sid).write_text(yaml.safe_dump(m, sort_keys=False))
    set_retrieved(part.path / "sources.yaml", sid, today)
    return entry


def set_retrieved(sources_file: Path, sid: str, when: date) -> None:
    """Set ``retrieved:`` inside the ``- id: sid`` block, keeping the file's comments."""
    lines = sources_file.read_text().splitlines(keepends=True)
    start = next((i for i, ln in enumerate(lines) if re.match(rf"\s*- id:\s*['\"]?{re.escape(sid)}['\"]?\s*$", ln)), None)
    if start is None:
        return
    indent = len(lines[start]) - len(lines[start].lstrip()) + 2
    end = start + 1
    while end < len(lines) and not re.match(r"\s*- id:", lines[end]) and not re.match(r"\S", lines[end]):
        end += 1
    for i in range(start + 1, end):
        if re.match(r"\s*retrieved:", lines[i]):
            lines[i] = " " * indent + f"retrieved: {when.isoformat()}\n"
            break
    else:
        lines.insert(start + 1, " " * indent + f"retrieved: {when.isoformat()}\n")
    sources_file.write_text("".join(lines))


def import_snapshot(part: Part, src: dict, path: Path, via: str, today: date | None = None) -> dict:
    from tools.fetch import Fetched, normalize

    today = today or date.today()
    sid = src["id"]
    body = path.read_bytes()
    kind = "pdf" if body[:5] == b"%PDF-" else ("html" if b"<html" in body[:4000].lower() else "txt")
    f = Fetched(src["url"], src["url"], 200, kind, body, normalize(body, kind))
    d = part.snapshot_root / sid
    d.mkdir(parents=True, exist_ok=True)
    (d / f"{today.isoformat()}.txt").write_text(f.text)
    raw = None
    stored = strip_active_content(body) if kind == "html" else body
    if len(stored) <= RAW_LIMIT:
        raw = f"{sid}/{today.isoformat()}.{kind if kind != 'txt' else 'raw'}"
        (part.snapshot_root / raw).write_bytes(stored)
    entry = {
        "retrieved": today.isoformat(), "url": src["url"], "final_url": src["url"], "status": 200,
        "content_type": kind, "text_sha256": f.text_sha256, "text": f"{sid}/{today.isoformat()}.txt",
        "raw": raw, "fetched_via": via,
    }
    m = [e for e in read_manifest(part, sid) if e["retrieved"] != entry["retrieved"]] + [entry]
    manifest_path(part, sid).write_text(yaml.safe_dump(m, sort_keys=False))
    set_retrieved(part.path / "sources.yaml", sid, today)
    return entry


def cmd_import(args) -> int:
    for part in iter_parts():
        for src in part.sources:
            if src["id"] == args.id:
                e = import_snapshot(part, src, Path(args.file), args.via)
                print(f"imported {args.id} into {part.label}: {e['text']}")
                return 0
    print(f"no source {args.id} in any sources.yaml", file=sys.stderr)
    return 1


def _select(part_filter: str | None):
    for part in iter_parts():
        if part_filter and part.label != part_filter and part.program != part_filter:
            continue
        yield part


def cmd_snapshot(args) -> int:
    failures = 0
    for part in _select(args.part):
        for src in part.sources:
            if args.id and src["id"] not in args.id:
                continue
            have = latest_snapshot(part, src["id"])
            if have and not have.get("error") and not args.refresh:
                continue
            e = take_snapshot(part, src)
            flag = "OK " if not e.get("error") else "ERR"
            failures += bool(e.get("error"))
            print(f"{flag} {part.label:28} {src['id']:40} {e['status']} {e.get('error', '')}")
    return 1 if failures else 0


def cmd_show(args) -> int:
    f = fetch(args.url)
    print(f"# {f.status} {f.content_type} {f.final_url} ({len(f.body)} bytes)", file=sys.stderr)
    text = f.text
    if args.grep:
        rx = re.compile(args.grep, re.I)
        lines = text.splitlines()
        for i, ln in enumerate(lines):
            if rx.search(ln):
                lo, hi = max(0, i - args.context), min(len(lines), i + args.context + 1)
                print(f"--- line {i}")
                print("\n".join(lines[lo:hi]))
    else:
        print(text)
    return 0 if f.ok else 1


def cmd_list(args) -> int:
    for part in _select(args.part):
        for src in part.sources:
            snap = latest_snapshot(part, src["id"])
            state = "none" if not snap else ("ERR " + snap.get("error", "")) if snap.get("error") else snap["retrieved"]
            print(f"{part.label:28} {src['id']:44} {src.get('kind', '?'):9} {state}")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("show")
    s.add_argument("url")
    s.add_argument("--grep")
    s.add_argument("--context", type=int, default=3)
    s.set_defaults(fn=cmd_show)
    s = sub.add_parser("snapshot")
    s.add_argument("--part", help="program or program/scope, e.g. msp/ny")
    s.add_argument("--id", action="append")
    s.add_argument("--refresh", action="store_true", help="re-snapshot even if a snapshot exists")
    s.set_defaults(fn=cmd_snapshot)
    s = sub.add_parser("list")
    s.add_argument("--part")
    s.set_defaults(fn=cmd_list)
    s = sub.add_parser("import")
    s.add_argument("--id", required=True)
    s.add_argument("--file", required=True)
    s.add_argument("--via", default="manual browser download")
    s.set_defaults(fn=cmd_import)
    args = ap.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    raise SystemExit(main())
