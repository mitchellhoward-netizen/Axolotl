"""Filesystem layout. Everything is relative to the project root (the `calculus/` dir)."""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(os.environ.get("ADAPTCALC_ROOT", Path(__file__).resolve().parent.parent))
CACHE = ROOT / ".cache"
SOURCE_DIR = CACHE / "openstax"
MEDIA_DIR = SOURCE_DIR / "media"
DUOTONE_DIR = CACHE / "duotone"
FONT_DIR = CACHE / "fonts"
STATE = ROOT / "state"
DB_PATH = Path(os.environ.get("ADAPTCALC_DB", STATE / "learner.db"))
OUT = ROOT / "out"
INBOX = ROOT / "inbox"
PROCESSED = INBOX / "processed"
TYPST_DIR = ROOT / "typst"

SKILLS_JSON = ROOT / "skills.json"
MISCONCEPTIONS_JSON = ROOT / "misconceptions.json"
JEV_YAML = ROOT / "jev_questions.yaml"
CONFIG_YAML = ROOT / "config.yaml"
ONTOLOGY_YAML = ROOT / "adaptcalc" / "ontology.yaml"


def ensure_dirs() -> None:
    for d in (CACHE, SOURCE_DIR, MEDIA_DIR, DUOTONE_DIR, FONT_DIR, STATE, OUT, INBOX, PROCESSED):
        d.mkdir(parents=True, exist_ok=True)
