"""Filesystem layout. Everything is relative to the project root (the `calculus/` dir).

Two things vary per request and are held in context variables, so every module
can keep reading `paths.X` unchanged:

  course   which course's skill graph is active (skills.json, misconceptions.json,
           ontology). Set with `use_course(course_id)`.
  learner  whose data is active (database, packets, photos). Set with
           `use_learner(directory)`. Without one, the single-learner layout under
           DATA is used (the command line and the tests).
"""
from __future__ import annotations

import contextvars
import os
from contextlib import contextmanager
from pathlib import Path

ROOT = Path(os.environ.get("ADAPTCALC_ROOT", Path(__file__).resolve().parent.parent))
CACHE = ROOT / ".cache"
SOURCE_DIR = CACHE / "openstax"
MEDIA_DIR = SOURCE_DIR / "media"
DUOTONE_DIR = CACHE / "duotone"
FONT_DIR = CACHE / "fonts"
# Learner data (database, packets, photos). On a host, point this at a persistent volume.
DATA = Path(os.environ.get("ADAPTCALC_DATA", ROOT))
LEARNERS = DATA / "learners"
ACCOUNTS_DB = DATA / "accounts.db"
TYPST_DIR = ROOT / "typst"
BUILD = CACHE / "build"  # Typst sources must sit under ROOT; only the PDFs go to DATA

COURSES_DIR = ROOT / "courses"
JEV_YAML = ROOT / "jev_questions.yaml"
CONFIG_YAML = ROOT / "config.yaml"

DEFAULT_COURSE = os.environ.get("ADAPTCALC_COURSE", "calc_limits")
_course: contextvars.ContextVar[str] = contextvars.ContextVar("course", default=DEFAULT_COURSE)
_learner: contextvars.ContextVar[Path | None] = contextvars.ContextVar("learner", default=None)


def course() -> str:
    return _course.get()


def course_dir(course_id: str | None = None) -> Path:
    return COURSES_DIR / (course_id or course())


def learner_dir() -> Path:
    return _learner.get() or DATA


@contextmanager
def use_course(course_id: str):
    tok = _course.set(course_id)
    try:
        yield
    finally:
        _course.reset(tok)


@contextmanager
def use_learner(directory: Path, course_id: str | None = None):
    tok = _learner.set(Path(directory))
    ctok = _course.set(course_id) if course_id else None
    try:
        yield
    finally:
        _learner.reset(tok)
        if ctok is not None:
            _course.reset(ctok)


def set_scope(directory: Path | None, course_id: str) -> None:
    """Set learner and course for the rest of the current context (one web request)."""
    _learner.set(Path(directory) if directory else None)
    _course.set(course_id)


def __getattr__(name: str):
    # per-course
    if name == "SKILLS_JSON":
        return course_dir() / "skills.json"
    if name == "MISCONCEPTIONS_JSON":
        return course_dir() / "misconceptions.json"
    if name == "ONTOLOGY_YAML":
        return course_dir() / "ontology.yaml"
    # per-learner
    if name == "STATE":
        return learner_dir() / "state"
    if name == "DB_PATH":
        env = os.environ.get("ADAPTCALC_DB")
        return Path(env) if env and _learner.get() is None else learner_dir() / "state" / "learner.db"
    if name == "OUT":
        return learner_dir() / "out"
    if name == "INBOX":
        return learner_dir() / "inbox"
    if name == "PROCESSED":
        return learner_dir() / "inbox" / "processed"
    raise AttributeError(name)


def ensure_dirs() -> None:
    import sys

    me = sys.modules[__name__]
    for d in (CACHE, SOURCE_DIR, MEDIA_DIR, DUOTONE_DIR, FONT_DIR, me.STATE, me.OUT, me.INBOX, me.PROCESSED):
        d.mkdir(parents=True, exist_ok=True)
