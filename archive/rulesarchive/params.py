"""Effective-dated parameter lookup.

Every yearly number lives in a YAML file under some ``parameters/``
directory (``shared/parameters`` for numbers several playbooks use, or a
playbook's ``federal/parameters`` / ``states/<st>/parameters``). Parameter
IDs are global across the archive, so any playbook can use any number.

A parameter has a list of values, each with ``effective_from`` (and
optionally ``effective_to``). Lookup picks the value whose window contains
``as_of``. A value can be a scalar or a mapping (for example keyed by
household size). A value with ``value: null`` is a recorded gap: looking it
up raises :class:`ParameterUnresolved`, which evaluators turn into an
``undetermined`` result rather than a guess.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

from . import ARCHIVE_ROOT


class ParameterError(KeyError):
    pass


class ParameterUnresolved(ParameterError):
    """The archive knows this number is needed but has no sourced value."""

    def __init__(self, pid: str, as_of: date, open_question: str | None):
        super().__init__(pid)
        self.pid = pid
        self.as_of = as_of
        self.open_question = open_question

    def __str__(self) -> str:
        return f"{self.pid} unresolved for {self.as_of} (open question {self.open_question})"


@dataclass(frozen=True)
class ParamValue:
    pid: str
    effective_from: date
    effective_to: date | None
    value: Any
    confidence: str
    sources: tuple
    open_question: str | None

    def __getitem__(self, key: Any) -> Any:
        """Index a mapping value; integer keys also match their string form."""
        v = self.value
        if not isinstance(v, dict):
            raise TypeError(f"{self.pid} is a scalar")
        if key in v:
            return v[key]
        if str(key) in v:
            return v[str(key)]
        raise ParameterError(f"{self.pid} has no key {key!r}")


def _as_date(v: Any) -> date | None:
    if v is None or isinstance(v, date):
        return v
    return date.fromisoformat(str(v))


def parameter_files(root: Path = ARCHIVE_ROOT) -> list[Path]:
    return sorted(p for p in root.rglob("parameters/*.yaml") if ".venv" not in p.parts)


@lru_cache(maxsize=1)
def _index() -> dict[str, dict[str, Any]]:
    index: dict[str, dict[str, Any]] = {}
    for path in parameter_files():
        doc = yaml.safe_load(path.read_text()) or {}
        for p in doc.get("parameters", []):
            if p["id"] in index:
                raise ParameterError(f"duplicate parameter id {p['id']} in {path} and {index[p['id']]['_file']}")
            index[p["id"]] = {**p, "_file": str(path.relative_to(ARCHIVE_ROOT))}
    return index


def all_parameters() -> dict[str, dict[str, Any]]:
    return dict(_index())


def reload() -> None:
    _index.cache_clear()


def get(pid: str, as_of: date) -> ParamValue:
    """Return the value of ``pid`` in effect on ``as_of``."""
    try:
        p = _index()[pid]
    except KeyError:
        raise ParameterError(f"unknown parameter {pid}") from None
    best = None
    for v in p["values"]:
        start = _as_date(v["effective_from"])
        end = _as_date(v.get("effective_to"))
        if start <= as_of and (end is None or as_of <= end):
            if best is None or start > _as_date(best["effective_from"]):
                best = v
    if best is None:
        raise ParameterUnresolved(pid, as_of, p.get("open_question"))
    if best.get("value") is None:
        raise ParameterUnresolved(pid, as_of, best.get("open_question") or p.get("open_question"))
    return ParamValue(
        pid=pid,
        effective_from=_as_date(best["effective_from"]),
        effective_to=_as_date(best.get("effective_to")),
        value=best["value"],
        confidence=best["confidence"],
        sources=tuple(s["source"] for s in best.get("sources", [])),
        open_question=best.get("open_question"),
    )


def use(pid: str, as_of: date, det: Any = None) -> ParamValue:
    """``get`` and record the use on a Determination (if given)."""
    pv = get(pid, as_of)
    if det is not None:
        det.used(pid, pv.effective_from, pv.value)
    return pv
