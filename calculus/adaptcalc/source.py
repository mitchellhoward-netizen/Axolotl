"""Fetch OpenStax Calculus Volume 1, Chapter 2 from OpenStax's public source repository.

OpenStax publishes the book source (CNXML + MathML, CC BY-NC-SA 4.0) at
github.com/openstax/osbooks-calculus-bundle. The collection file lists the modules
of each chapter in order; we take the "Limits" subcollection.
"""
from __future__ import annotations

import re
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

from . import paths

RAW = "https://raw.githubusercontent.com/openstax/osbooks-calculus-bundle/main"
COLLECTION = "collections/calculus-volume-1.collection.xml"
CHAPTER_TITLE = "Limits"
CHAPTER_NUMBER = 2
BOOK_URL = "https://openstax.org/books/calculus-volume-1/pages/2-introduction"
ATTRIBUTION = (
    "Canonical text: Strang, Herman et al., Calculus Volume 1, OpenStax (2016), "
    "Chapter 2. Licensed CC BY-NC-SA 4.0. Source: " + BOOK_URL
)

NS = {"col": "http://cnx.rice.edu/collxml", "md": "http://cnx.rice.edu/mdml"}


@dataclass
class Module:
    module_id: str
    path: Path
    section_number: str  # "2" for the chapter intro, "2.1" ... "2.5"


def _get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "adaptcalc/0.1"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def _cached(rel: str, dest: Path, refresh: bool = False) -> Path:
    if refresh or not dest.exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(_get(f"{RAW}/{rel}"))
    return dest


def chapter_module_ids(refresh: bool = False) -> list[str]:
    coll = _cached(COLLECTION, paths.SOURCE_DIR / "collection.xml", refresh)
    root = ET.parse(coll).getroot()
    for sub in root.iter(f"{{{NS['col']}}}subcollection"):
        title = sub.find("md:title", NS)
        if title is not None and title.text == CHAPTER_TITLE:
            return [m.get("document") for m in sub.iter(f"{{{NS['col']}}}module")]
    raise RuntimeError(f"subcollection {CHAPTER_TITLE!r} not found in {COLLECTION}")


def fetch_chapter(refresh: bool = False, with_media: bool = True) -> list[Module]:
    """Download (or reuse the cache of) every module of Chapter 2 and its figures."""
    paths.ensure_dirs()
    mods: list[Module] = []
    for i, mid in enumerate(chapter_module_ids(refresh)):
        p = _cached(f"modules/{mid}/index.cnxml", paths.SOURCE_DIR / f"{mid}.cnxml", refresh)
        number = str(CHAPTER_NUMBER) if i == 0 else f"{CHAPTER_NUMBER}.{i}"
        mods.append(Module(mid, p, number))
        if with_media:
            for src in re.findall(r'src="\.\./\.\./media/([^"]+)"', p.read_text(encoding="utf-8")):
                _cached(f"media/{src}", paths.MEDIA_DIR / src, refresh=False)
    return mods
