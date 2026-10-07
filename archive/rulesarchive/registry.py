"""Load the archive's YAML for tooling: playbooks, sources, rule statements.

Layout (see ``archive/README.md``)::

    shared/                         numbers and sources several playbooks use
        parameters/*.yaml
        sources.yaml
        snapshots/
    playbooks/<program>/
        federal/{playbook.yaml, rules.py, parameters/, sources.yaml}
        states/<st>/{playbook.yaml, rules.py, parameters/, sources.yaml, REVIEW.md}
        snapshots/<source-id>/<retrieved>.{html,pdf,txt}
        tests/

A "part" is one federal base or one state part. Source IDs, rule IDs and
parameter IDs are global, so any part may cite any source in the archive.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterator

import yaml

from . import ARCHIVE_ROOT, STATES

PLAYBOOKS_DIR = ARCHIVE_ROOT / "playbooks"
SHARED_DIR = ARCHIVE_ROOT / "shared"


@dataclass
class Part:
    program: str          # playbook directory name, or "shared"
    scope: str            # "federal" | "ny" | "ca" | "il" | "shared"
    path: Path            # directory of this part
    playbook: dict[str, Any] | None
    sources: list[dict[str, Any]]

    @property
    def label(self) -> str:
        return f"{self.program}/{self.scope}"

    @property
    def snapshot_root(self) -> Path:
        """Where this part's snapshots live (playbook-level ``snapshots/``)."""
        if self.program == "shared":
            return SHARED_DIR / "snapshots"
        return PLAYBOOKS_DIR / self.program / "snapshots"


def _load(path: Path) -> Any:
    return yaml.safe_load(path.read_text()) if path.exists() else None


def programs() -> list[str]:
    return sorted(p.name for p in PLAYBOOKS_DIR.iterdir() if (p / "federal").is_dir())


def iter_parts() -> Iterator[Part]:
    shared_sources = (_load(SHARED_DIR / "sources.yaml") or {}).get("sources", [])
    yield Part("shared", "shared", SHARED_DIR, None, shared_sources)
    for prog in programs():
        base = PLAYBOOKS_DIR / prog
        fed = base / "federal"
        yield Part(prog, "federal", fed, _load(fed / "playbook.yaml"),
                   (_load(fed / "sources.yaml") or {}).get("sources", []))
        for st in STATES:
            d = base / "states" / st
            if d.is_dir():
                yield Part(prog, st, d, _load(d / "playbook.yaml"),
                           (_load(d / "sources.yaml") or {}).get("sources", []))


@lru_cache(maxsize=1)
def sources_index() -> dict[str, tuple[Part, dict[str, Any]]]:
    idx: dict[str, tuple[Part, dict[str, Any]]] = {}
    for part in iter_parts():
        for s in part.sources:
            if s["id"] in idx:
                other = idx[s["id"]][0].label
                raise ValueError(f"duplicate source id {s['id']} in {part.label} and {other}")
            idx[s["id"]] = (part, s)
    return idx


def rules_index() -> dict[str, tuple[Part, dict[str, Any]]]:
    idx: dict[str, tuple[Part, dict[str, Any]]] = {}
    for part in iter_parts():
        for r in (part.playbook or {}).get("rules", []):
            idx[r["id"]] = (part, r)
    return idx


def walk_citations(node: Any, trail: str = "") -> Iterator[tuple[str, dict[str, Any]]]:
    """Yield (trail, citation) for every ``sources: [{source: ...}]`` entry under ``node``."""
    if isinstance(node, dict):
        for k, v in node.items():
            here = f"{trail}.{k}" if trail else str(k)
            if k == "sources" and isinstance(v, list):
                for c in v:
                    if isinstance(c, dict) and "source" in c:
                        yield trail, c
            else:
                yield from walk_citations(v, here)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            ident = v.get("id") if isinstance(v, dict) else None
            yield from walk_citations(v, f"{trail}[{ident or i}]")
