"""Change detection: re-fetch every source and flag what depends on it.

    python -m tools.check_changes                     # all sources -> reports/source-check-<date>.md
    python -m tools.check_changes --part msp          # one playbook (or msp/ny)
    python -m tools.check_changes --fail-on-change    # exit 1 if anything needs re-checking (for CI)
    python -m tools.check_changes --workers 8

For each source in every sources.yaml it fetches the URL, normalizes it the
same way the snapshot tool does, and compares the text hash with the latest
saved snapshot. A changed source flags every rule, parameter value,
procedure item, life event, outcome-proof item and link that cites it. The
report groups those by state (federal and shared items under "Federal").

It never updates snapshots. After re-checking the flagged items against the
new text, a person re-snapshots with
``python -m tools.sources snapshot --refresh --id <source>``.

Statuses:
  changed         text differs from the snapshot (diff excerpt in the report)
  unchanged       same text
  fetch_failed    could not fetch now (HTTP error or network); re-run or check by hand
  manual          the snapshot was imported by hand because the site blocks scripts; check by hand
  no_snapshot     no saved snapshot to compare with
"""

from __future__ import annotations

import argparse
import difflib
import re
import sys
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from rulesarchive import ARCHIVE_ROOT, STATES  # noqa: E402
from rulesarchive.params import parameter_files  # noqa: E402
from rulesarchive.registry import Part, iter_parts, walk_citations  # noqa: E402
from tools.fetch import fetch  # noqa: E402
from tools.sources import read_manifest  # noqa: E402

REPORTS = ARCHIVE_ROOT / "reports"
# Pages some sites return (with HTTP 200) instead of the content when they block a client.
BOT_WALL = re.compile(r"think that you are a bot|request unsuccessful\. incapsula|access denied|just a moment\.\.\.|"
                      r"enable javascript and cookies|captcha|request unblock", re.I)
NUMBER = re.compile(r"\$\s?\d|\d[\d,]*\.\d\d|\b\d{1,3}(,\d{3})+\b|\d+\s?%")


@dataclass
class Dependent:
    scope: str        # federal | ny | ca | il | shared
    program: str
    kind: str         # rule | parameter | procedure | life_event | outcome_proof | link | summary
    ident: str
    where: str        # file


@dataclass
class Result:
    part: Part
    source: dict
    status: str
    detail: str = ""
    diff: list[str] = field(default_factory=list)
    number_lines: list[str] = field(default_factory=list)
    final_url: str = ""


def dependents_index() -> dict[str, list[Dependent]]:
    idx: dict[str, list[Dependent]] = defaultdict(list)
    for part in iter_parts():
        pb = part.playbook
        if not pb:
            continue
        where = str((part.path / "playbook.yaml").relative_to(ARCHIVE_ROOT))
        for trail, c in walk_citations(pb):
            kind = trail.split("[")[0].split(".")[0]
            kind = {"rules": "rule", "life_events": "life_event", "links": "link"}.get(kind, kind)
            ident = re.findall(r"\[([^\]]+)\]", trail)
            idx[c["source"]].append(Dependent(part.scope, part.program, kind, ident[-1] if ident else trail, where))
    for f in parameter_files():
        rel = str(f.relative_to(ARCHIVE_ROOT))
        prog = "shared" if rel.startswith("shared/") else rel.split("/")[1]
        scope = "shared" if prog == "shared" else (rel.split("/states/")[1].split("/")[0] if "/states/" in rel else "federal")
        for p in (yaml.safe_load(f.read_text()) or {}).get("parameters", []):
            for v in p.get("values", []):
                for c in v.get("sources", []) or []:
                    idx[c["source"]].append(Dependent(scope, prog, "parameter",
                                                      f"{p['id']} (from {v['effective_from']})", rel))
    return idx


def check_one(part: Part, src: dict) -> Result:
    manifest = read_manifest(part, src["id"])
    good = [e for e in manifest if not e.get("error") and e.get("text")]
    if not good:
        return Result(part, src, "no_snapshot", "no saved snapshot")
    snap = good[-1]
    f = fetch(src["url"])
    if f.ok and BOT_WALL.search(f.text[:3000]) and not BOT_WALL.search(
            (part.snapshot_root / snap["text"]).read_text()[:3000]):
        f.status = 403   # a block page, not the content
    if f.ok and snap.get("fetched_via"):
        # Imported by another route (browser, reader, converted file): a direct
        # fetch is not comparable text, so this needs a person or the same route.
        return Result(part, src, "manual", f"snapshot {snap['retrieved']} was imported via {snap['fetched_via']}; "
                      "re-fetch the same way and compare", final_url=f.final_url)
    if not f.ok:
        status = "manual" if snap.get("fetched_via") else "fetch_failed"
        why = f"HTTP {f.status}" if f.status else f.text[:200]
        return Result(part, src, status, f"{why}; snapshot {snap['retrieved']}" +
                      (f" was imported via {snap['fetched_via']}" if snap.get("fetched_via") else ""))
    vol = [re.compile(v, re.I) for v in src.get("volatile", []) or []]
    end = re.compile(src["ends_at"], re.I) if src.get("ends_at") else None

    def clean(t: str) -> str:
        out = []
        for ln in t.splitlines():
            if end is not None and end.search(ln):
                break
            if not any(v.search(ln) for v in vol):
                out.append(ln)
        return "\n".join(out)

    vol = vol or ([end] if end else [])   # any cleaning configured
    if f.text_sha256 == snap["text_sha256"] or (vol and clean(f.text) == clean(
            (part.snapshot_root / snap["text"]).read_text())):
        return Result(part, src, "unchanged", f"same as snapshot {snap['retrieved']}", final_url=f.final_url)
    old = clean((part.snapshot_root / snap["text"]).read_text()).splitlines() if vol else \
        (part.snapshot_root / snap["text"]).read_text().splitlines()
    new = clean(f.text).splitlines() if vol else f.text.splitlines()
    diff = [ln for ln in difflib.unified_diff(old, new, lineterm="", n=0) if not ln.startswith(("---", "+++", "@@"))]
    numbers = [ln for ln in diff if NUMBER.search(ln)]
    out_dir = REPORTS / "fetched" / date.today().isoformat()
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / f"{src['id']}.txt").write_text(f.text)
    return Result(part, src, "changed", f"{len(diff)} changed lines vs snapshot {snap['retrieved']}",
                  diff, numbers, f.final_url)


def scope_label(scope: str) -> str:
    return {"federal": "Federal (applies in every state)", "shared": "Federal (applies in every state)",
            "ny": "New York", "ca": "California", "il": "Illinois"}[scope]


def render(results: list[Result], deps: dict[str, list[Dependent]], today: date) -> str:
    changed = [r for r in results if r.status == "changed"]
    failed = [r for r in results if r.status in ("fetch_failed", "no_snapshot")]
    manual = [r for r in results if r.status == "manual"]
    unchanged = [r for r in results if r.status == "unchanged"]
    lines = [f"# Source check, {today.isoformat()}", "",
             f"{len(results)} sources checked: **{len(changed)} changed**, {len(failed)} could not be fetched, "
             f"{len(manual)} need a manual check (sites that block scripts), {len(unchanged)} unchanged.", ""]

    # group flagged items by the state of the item
    by_state: dict[str, list[tuple[Result, Dependent]]] = defaultdict(list)
    for r in changed:
        for d in deps.get(r.source["id"], []):
            by_state["federal" if d.scope in ("federal", "shared") else d.scope].append((r, d))
    lines += ["## Needs re-checking, by state", ""]
    if not changed:
        lines += ["Nothing changed.", ""]
    for st in ["federal", *STATES]:
        items = by_state.get(st)
        if not items:
            continue
        lines += [f"### {scope_label(st)}", ""]
        per_source: dict[str, list[Dependent]] = defaultdict(list)
        res_of: dict[str, Result] = {}
        for r, d in items:
            per_source[r.source["id"]].append(d)
            res_of[r.source["id"]] = r
        for sid, ds in per_source.items():
            r = res_of[sid]
            lines.append(f"- **{r.source['title']}** (`{sid}`): {r.detail}. Re-check:")
            for d in sorted({(d.kind, d.ident, d.where) for d in ds}):
                lines.append(f"  - {d[0]} `{d[1]}` ({d[2]})")
        lines.append("")
    if changed:
        lines += ["## What changed", ""]
        for r in changed:
            lines += [f"### `{r.source['id']}`", "", f"{r.source['url']}", ""]
            show = r.number_lines[:12] or r.diff[:12]
            if r.number_lines:
                lines.append("Changed lines that contain numbers (first 12):")
            else:
                lines.append("First changed lines (no numbers changed):")
            lines += ["", "```diff", *[ln[:200] for ln in show], "```", ""]
    if failed or manual:
        lines += ["## Could not compare automatically", ""]
        for r in failed + manual:
            n = len(deps.get(r.source["id"], []))
            lines.append(f"- `{r.source['id']}` ({r.part.label}, {r.status}): {r.detail}. {n} dependent items. {r.source['url']}")
        lines.append("")
    orphans = [r for r in results if not deps.get(r.source["id"])]
    if orphans:
        lines += ["## Sources nothing cites", "", "These are snapshotted but no rule or parameter cites them:", ""]
        lines += [f"- `{r.source['id']}` ({r.part.label})" for r in orphans]
        lines.append("")
    return "\n".join(lines) + "\n"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--part")
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--out", help="report path (default reports/source-check-<date>.md)")
    ap.add_argument("--fail-on-change", action="store_true")
    args = ap.parse_args(argv)

    jobs = [(p, s) for p in iter_parts() for s in p.sources
            if not args.part or p.label == args.part or p.program == args.part]
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        results = list(ex.map(lambda j: check_one(*j), jobs))
    deps = dependents_index()
    today = date.today()
    report = render(results, deps, today)
    REPORTS.mkdir(exist_ok=True)
    out = Path(args.out) if args.out else REPORTS / f"source-check-{today.isoformat()}.md"
    out.write_text(report)
    counts = defaultdict(int)
    for r in results:
        counts[r.status] += 1
    print(f"{len(results)} sources: " + ", ".join(f"{k}={v}" for k, v in sorted(counts.items())) + f" -> {out}")
    return 1 if args.fail_on_change and counts["changed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
