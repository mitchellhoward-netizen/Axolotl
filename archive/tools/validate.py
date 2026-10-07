"""Validate the whole archive.

    python -m tools.validate            # errors fail (exit 1); warnings print
    python -m tools.validate --stats    # also print per-part counts (federal vs state share)
    python -m tools.validate --json OUT # write the stats as JSON

Checks, beyond the JSON schemas in schema/:

- every cited source ID exists somewhere in the archive;
- a "confirmed" item cites at least one primary source; a "secondary" item
  cites at least one source; an "unresolved" item names an open question
  that exists;
- every parameter value has sources (or is null with an open question);
- rule IDs and open-question IDs are unique; `overrides` point at rules of
  the same program's federal part; `parameters` exist; `implemented_in`
  functions exist;
- every source has a saved snapshot whose date matches `retrieved`;
- every state part has a REVIEW.md and test households; every playbook has
  at least one household tagged cross_state;
- links between playbooks are recorded on both sides (warning until the
  other playbook exists).
"""

from __future__ import annotations

import argparse
import ast
import json
import sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
from typing import Any

import yaml
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from rulesarchive import ARCHIVE_ROOT, STATES  # noqa: E402
from rulesarchive.params import parameter_files  # noqa: E402
from rulesarchive.registry import PLAYBOOKS_DIR, iter_parts, programs, walk_citations  # noqa: E402
from tools.sources import latest_snapshot  # noqa: E402

SCHEMA_DIR = ARCHIVE_ROOT / "schema"


def _jsonable(x: Any) -> Any:
    if isinstance(x, dict):
        return {str(k): _jsonable(v) for k, v in x.items()}
    if isinstance(x, list):
        return [_jsonable(v) for v in x]
    if isinstance(x, date):
        return x.isoformat()
    return x


def _validators() -> dict[str, Draft202012Validator]:
    resources = []
    docs = {}
    for f in SCHEMA_DIR.glob("*.schema.yaml"):
        d = yaml.safe_load(f.read_text())
        docs[f.name] = d
        resources.append((f.name, Resource.from_contents(d)))
    reg = Registry().with_resources(resources)
    return {name: Draft202012Validator(d, registry=reg) for name, d in docs.items()}


class Report:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def err(self, where: str, msg: str) -> None:
        self.errors.append(f"{where}: {msg}")

    def warn(self, where: str, msg: str) -> None:
        self.warnings.append(f"{where}: {msg}")


def _schema_check(rep: Report, v: Draft202012Validator, doc: Any, where: str) -> None:
    for e in sorted(v.iter_errors(_jsonable(doc)), key=lambda e: list(e.path)):
        path = "/".join(str(p) for p in e.path)
        rep.err(where, f"schema: {path}: {e.message[:300]}")


def _function_exists(rel: str, func: str) -> bool:
    p = ARCHIVE_ROOT / rel
    if not p.exists():
        return False
    tree = ast.parse(p.read_text())
    return any(isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == func for n in ast.walk(tree))


def validate(stats: bool = False) -> tuple[Report, dict[str, Any]]:
    rep = Report()
    vals = _validators()
    parts = list(iter_parts())

    # ---------------------------------------------------------------- sources
    sources: dict[str, tuple[Any, dict]] = {}
    for part in parts:
        where = f"{part.label}/sources.yaml"
        if part.scope != "shared" and not (part.path / "sources.yaml").exists():
            rep.err(part.label, "missing sources.yaml")
            continue
        _schema_check(rep, vals["sources.schema.yaml"], {"sources": part.sources}, where)
        for s in part.sources:
            if s["id"] in sources:
                rep.err(where, f"duplicate source id {s['id']} (also in {sources[s['id']][0].label})")
            sources[s["id"]] = (part, s)
            snap = latest_snapshot(part, s["id"])
            ok_snap = snap if snap and not snap.get("error") else None
            if ok_snap is None:
                # look for any earlier good snapshot
                from tools.sources import read_manifest
                goods = [e for e in read_manifest(part, s["id"]) if not e.get("error")]
                ok_snap = goods[-1] if goods else None
            if ok_snap is None:
                rep.err(where, f"source {s['id']} has no saved snapshot (run python -m tools.sources snapshot)")
            elif str(s.get("retrieved")) != str(ok_snap["retrieved"]):
                rep.err(where, f"source {s['id']} retrieved={s.get('retrieved')} but latest good snapshot is {ok_snap['retrieved']}")

    def scope_of(where: str) -> str:
        """federal | ny | ca | il | shared, from a playbook or parameter path label."""
        if where.startswith("shared"):
            return "shared"
        if "/states/" in where:
            return where.split("/states/")[1].split("/")[0]
        head = where.split("/")
        return head[1] if len(head) > 1 and head[1] in STATES else "federal"

    def check_citations(where: str, item: dict, label: str) -> None:
        conf = item.get("confidence")
        cites = item.get("sources") or []
        for c in cites:
            if c["source"] not in sources:
                rep.err(where, f"{label}: unknown source {c['source']}")
        known = [sources[c["source"]][1] for c in cites if c["source"] in sources]
        scope = scope_of(where)
        for s in known:
            j = s.get("jurisdiction")
            if scope in STATES and j in STATES and j != scope:
                rep.err(where, f"{label}: cites {s['id']} from another state ({j}); a state part needs its own source")
            if scope in ("federal", "shared") and j in STATES:
                rep.warn(where, f"{label}: federal item cites state source {s['id']} ({j})")
        kinds = {s["kind"] for s in known}
        if conf == "confirmed" and "primary" not in kinds:
            rep.err(where, f"{label}: confidence confirmed but no primary source cited")
        if conf == "confirmed" and scope in ("federal", "shared") and known and not any(
                s["kind"] == "primary" and s.get("jurisdiction") in ("federal", "multi") for s in known):
            rep.err(where, f"{label}: federal item confirmed only by state sources")
        if conf == "secondary" and not cites:
            rep.err(where, f"{label}: confidence secondary but no source cited")
        if conf == "unresolved" and not item.get("open_question"):
            rep.err(where, f"{label}: unresolved but names no open_question")
        if item.get("open_question"):
            oq_refs.append((where, label, item["open_question"]))

    oq_refs: list[tuple[str, str, str]] = []
    oq_ids: dict[str, str] = {}
    rule_ids: dict[str, tuple[str, dict]] = {}
    links: list[tuple[str, str, dict]] = []
    counts: dict[str, Counter] = defaultdict(Counter)

    # -------------------------------------------------------------- parameters
    param_ids: dict[str, str] = {}
    for f in parameter_files():
        rel = str(f.relative_to(ARCHIVE_ROOT))
        doc = yaml.safe_load(f.read_text()) or {}
        _schema_check(rep, vals["parameters.schema.yaml"], doc, rel)
        for p in doc.get("parameters", []):
            if p["id"] in param_ids:
                rep.err(rel, f"duplicate parameter id {p['id']} (also in {param_ids[p['id']]})")
            param_ids[p["id"]] = rel
            if ("income_limit" in p["id"] or "resource_limit" in p["id"]) and not p.get("compare_to"):
                rep.err(rel, f"parameter {p['id']}: limits must say what they are compared to (compare_to)")
            for i, v in enumerate(p.get("values", [])):
                label = f"parameter {p['id']} value[{i}] ({v.get('effective_from')})"
                if v.get("value") is None:
                    if not (v.get("open_question") or p.get("open_question")):
                        rep.err(rel, f"{label}: null value without open_question")
                    if v.get("open_question"):
                        oq_refs.append((rel, label, v["open_question"]))
                    continue
                if not v.get("sources") and v.get("confidence") != "unresolved":
                    rep.err(rel, f"{label}: no sources")
                check_citations(rel, v, label)
                scope = scope_of(rel)
                prog = "shared" if rel.startswith("shared/") else rel.split("/")[1]
                counts[f"{prog}/{scope}"]["parameter_values"] += 1
                counts[f"{prog}/{scope}"][f"param_{v['confidence']}"] += 1

    # --------------------------------------------------------------- playbooks
    for part in parts:
        if part.scope == "shared":
            continue
        where = f"{part.label}/playbook.yaml"
        pb = part.playbook
        if pb is None:
            rep.err(part.label, "missing playbook.yaml")
            continue
        _schema_check(rep, vals["playbook.schema.yaml"], pb, where)
        if pb.get("program") != part.program or pb.get("scope") != part.scope:
            rep.err(where, f"program/scope says {pb.get('program')}/{pb.get('scope')}, directory is {part.label}")
        check_citations(where, pb.get("summary", {}), "summary")
        for oq in pb.get("open_questions", []):
            if oq["id"] in oq_ids:
                rep.err(where, f"duplicate open question {oq['id']} (also in {oq_ids[oq['id']]})")
            oq_ids[oq["id"]] = where
        for r in pb.get("rules", []):
            if r["id"] in rule_ids:
                rep.err(where, f"duplicate rule id {r['id']} (also in {rule_ids[r['id']][0]})")
            rule_ids[r["id"]] = (where, r)
            check_citations(where, r, f"rule {r['id']}")
            counts[part.label]["rules"] += 1
            counts[part.label][f"rule_{r.get('confidence')}"] += 1
            for pid in r.get("parameters", []):
                if pid not in param_ids:
                    rep.err(where, f"rule {r['id']}: unknown parameter {pid}")
            impl = r.get("implemented_in")
            if impl:
                rel, func = impl.split(":")
                if not _function_exists(rel, func):
                    rep.err(where, f"rule {r['id']}: implemented_in {impl} not found")
        for section in ("procedure",):
            for key, items in (pb.get(section) or {}).items():
                for it in items:
                    check_citations(where, it, f"procedure.{key} {it['id']}")
                    counts[part.label]["procedure_items"] += 1
        for key in ("life_events", "outcome_proof"):
            for it in pb.get(key, []) or []:
                check_citations(where, it, f"{key} {it['id']}")
                counts[part.label][key] += 1
        for ln in pb.get("links", []) or []:
            check_citations(where, ln, f"link {ln['id']}")
            links.append((part.program, part.scope, ln))
        for c in pb.get("conflicts", []) or []:
            for cl in c["claims"]:
                if cl["source"] not in sources:
                    rep.err(where, f"conflict {c['id']}: unknown source {cl['source']}")
            counts[part.label]["conflicts"] += 1
        for cc in pb.get("claims_checked", []) or []:
            for c in cc.get("sources", []) or []:
                if c["source"] not in sources:
                    rep.err(where, f"claims_checked: unknown source {c['source']}")
        counts[part.label]["open_questions"] += len(pb.get("open_questions", []))
        # all citation-bearing nodes resolve (catch-all)
        for trail, c in walk_citations(pb):
            if c["source"] not in sources:
                rep.err(where, f"{trail}: unknown source {c['source']}")
        if part.scope in STATES and not (part.path / "REVIEW.md").exists():
            rep.err(part.label, "missing REVIEW.md")

    # overrides must point at federal rules of the same program
    for rid, (where, r) in rule_ids.items():
        prog = where.split("/")[0]
        for o in r.get("overrides", []) or []:
            if o not in rule_ids:
                rep.err(where, f"rule {rid}: overrides unknown rule {o}")
            elif not rule_ids[o][0].startswith(f"{prog}/federal"):
                rep.err(where, f"rule {rid}: overrides {o}, which is not in {prog}/federal")

    for where, label, oq in oq_refs:
        if oq not in oq_ids:
            rep.err(where, f"{label}: open_question {oq} is not defined in any playbook")

    # links both ways
    prog_set = set(programs())
    for prog, scope, ln in links:
        target = ln["playbook"]
        if target == prog:
            continue
        if target not in prog_set:
            rep.warn(f"{prog}/{scope}", f"link {ln['id']} -> {target}: playbook not built yet")
            continue
        back = [l2 for p2, s2, l2 in links if p2 == target and l2["playbook"] == prog]
        if not back:
            rep.err(f"{prog}/{scope}", f"link {ln['id']} -> {target}: {target} records no link back to {prog}")

    # --------------------------------------------------------------- tests
    for prog in programs():
        tdir = PLAYBOOKS_DIR / prog / "tests"
        files = sorted(tdir.glob("households_*.yaml")) if tdir.exists() else []
        if not files:
            rep.err(prog, "no test households")
            continue
        scopes_with_cases: Counter = Counter()
        cross_state = 0
        for f in files:
            rel = str(f.relative_to(ARCHIVE_ROOT))
            doc = yaml.safe_load(f.read_text()) or {}
            _schema_check(rep, vals["households.schema.yaml"], doc, rel)
            for c in doc.get("cases", []):
                scopes_with_cases[c["household"].get("state")] += 1
                if "cross_state" in (c.get("tags") or []) and c.get("compare_states"):
                    cross_state += 1
                for r in (c.get("expect") or {}).get("rules_include", []):
                    if r not in rule_ids:
                        rep.err(rel, f"case {c['id']}: expects unknown rule {r}")
        for st in STATES:
            if (PLAYBOOKS_DIR / prog / "states" / st).is_dir() and scopes_with_cases[st] == 0:
                rep.err(prog, f"no test households for state {st}")
        if cross_state == 0:
            rep.warn(prog, "no household tagged cross_state with compare_states results yet")
        counts[f"{prog}/tests"]["cases"] = sum(scopes_with_cases.values())

    summary = {k: dict(v) for k, v in sorted(counts.items())}
    return rep, summary


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stats", action="store_true")
    ap.add_argument("--json")
    ap.add_argument("--only", help="show only errors and warnings for this program (others may be mid-edit)")
    args = ap.parse_args(argv)
    rep, summary = validate()
    if args.only:
        keep = lambda m: m.startswith(f"{args.only}/") or m.startswith(f"{args.only}:") or f"playbooks/{args.only}/" in m.split(":")[0]
        rep.errors = [e for e in rep.errors if keep(e)]
        rep.warnings = [w for w in rep.warnings if keep(w)]
    for w in rep.warnings:
        print(f"WARN  {w}")
    for e in rep.errors:
        print(f"ERROR {e}")
    if args.stats:
        for k, v in summary.items():
            print(f"{k:32} " + ", ".join(f"{a}={b}" for a, b in sorted(v.items())))
    if args.json:
        Path(args.json).write_text(json.dumps(summary, indent=2))
    print(f"\n{len(rep.errors)} errors, {len(rep.warnings)} warnings")
    return 1 if rep.errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
