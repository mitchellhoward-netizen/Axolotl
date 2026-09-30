"""Fetch OpenStax books from OpenStax's public source repositories.

OpenStax publishes each book's source (CNXML + MathML, CC BY licenses) in a
GitHub "bundle" repository. A book's collection file lists its chapters
(subcollections) and their modules (sections) in order. We fetch only the
chapters a book entry asks for.

Books used:
  calc1  Calculus Volume 1, Chapter 2 (Limits): the course itself
  at2e   Algebra and Trigonometry 2e: the foundations underneath it
  pa2e   Prealgebra 2e: fractions and the language of algebra, deeper still
"""
from __future__ import annotations

import re
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

from . import paths

NS = {"col": "http://cnx.rice.edu/collxml", "md": "http://cnx.rice.edu/mdml"}


@dataclass(frozen=True)
class Book:
    id: str
    title: str
    repo: str
    collection: str
    slug: str
    chapters: tuple[int, ...]
    # "chapter": Example 2.13 / Checkpoint 2.13 numbered across the chapter
    # "section": Example 1 / Try It #1 restart in every section
    numbering: str
    try_label: str          # what the book calls its practice-after-example boxes
    license: str


BOOKS: dict[str, Book] = {
    "calc1": Book("calc1", "Calculus Volume 1", "osbooks-calculus-bundle", "calculus-volume-1", "calculus-volume-1",
                  (2,), "chapter", "Checkpoint", "CC BY-NC-SA 4.0"),
    "at2e": Book("at2e", "Algebra and Trigonometry 2e", "osbooks-college-algebra-bundle", "algebra-and-trigonometry-2e",
                 "algebra-and-trigonometry-2e", (1, 2, 3, 4, 5, 7, 9), "section", "Try It", "CC BY 4.0"),
    "pa2e": Book("pa2e", "Prealgebra 2e", "osbooks-prealgebra-bundle", "prealgebra-2e", "prealgebra-2e",
                 (2, 4), "chapter", "Try It", "CC BY 4.0"),
}

# Chapter 2 of Calculus Volume 1 is the course; kept for the modules that predate multiple books.
CHAPTER_NUMBER = 2
BOOK_URL = "https://openstax.org/books/calculus-volume-1/pages/2-introduction"
RAW = f"https://raw.githubusercontent.com/openstax/{BOOKS['calc1'].repo}/main"
ATTRIBUTION = (
    "Canonical text: OpenStax, Calculus Volume 1 (CC BY-NC-SA 4.0), Algebra and Trigonometry 2e "
    "(CC BY 4.0) and Prealgebra 2e (CC BY 4.0)."
)


@dataclass
class Module:
    module_id: str
    path: Path
    section_number: str  # "2" for a chapter intro, "2.1", "2.2", ...
    book: str = "calc1"
    chapter: int = CHAPTER_NUMBER
    title: str = ""


def book_url(book: str) -> str:
    return f"https://openstax.org/books/{BOOKS[book].slug}"


def _get(url: str, tries: int = 5) -> bytes:
    import http.client
    import time
    import urllib.error

    req = urllib.request.Request(url, headers={"User-Agent": "adaptcalc/0.2"})
    for i in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503) or i == tries - 1:
                raise
            time.sleep(2 ** (i + 1))
        except (http.client.IncompleteRead, urllib.error.URLError, TimeoutError, ConnectionError):
            if i == tries - 1:
                raise
            time.sleep(2 ** (i + 1))
    raise RuntimeError("unreachable")


def _cached(url: str, dest: Path, refresh: bool = False) -> Path:
    if refresh or not dest.exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(_get(url))
    return dest


def raw(book: str) -> str:
    return f"https://raw.githubusercontent.com/openstax/{BOOKS[book].repo}/main"


def chapter_modules(book: str, refresh: bool = False) -> list[tuple[int, int, str, str]]:
    """[(chapter number, index in chapter, module id, chapter title)] for the chapters we use."""
    b = BOOKS[book]
    coll = _cached(f"{raw(book)}/collections/{b.collection}.collection.xml",
                   paths.SOURCE_DIR / book / "collection.xml", refresh)
    root = ET.parse(coll).getroot()
    subs = list(root.iter(f"{{{NS['col']}}}subcollection"))
    out = []
    for ci, sub in enumerate(subs, 1):
        if ci not in b.chapters:
            continue
        title = sub.find("md:title", NS).text
        for i, m in enumerate(sub.iter(f"{{{NS['col']}}}module")):
            out.append((ci, i, m.get("document"), title))
    return out


def fetch_media(name: str, book: str | None = None) -> Path:
    """A figure, fetched on first use from the book's repository (or any of ours)."""
    dest = paths.MEDIA_DIR / name
    if dest.exists():
        return dest
    import urllib.error

    order = ([book] if book else []) + [b for b in BOOKS if b != book]
    for b in order:
        try:
            return _cached(f"{raw(b)}/media/{name}", dest)
        except urllib.error.HTTPError as e:
            if e.code != 404:
                raise
    raise FileNotFoundError(name)


def fetch_book(book: str, refresh: bool = False, with_media: bool | None = None) -> list[Module]:
    """Download (or reuse the cache of) every module of the chapters a book uses.

    Figures are fetched on first use (fetch_media) except for the calculus chapter, which is
    small enough to prefetch.
    """
    if with_media is None:
        with_media = book == "calc1"
    paths.ensure_dirs()
    mods: list[Module] = []
    for ch, i, mid, _ in chapter_modules(book, refresh):
        p = _cached(f"{raw(book)}/modules/{mid}/index.cnxml", paths.SOURCE_DIR / book / f"{mid}.cnxml", refresh)
        number = str(ch) if i == 0 else f"{ch}.{i}"
        text = p.read_text(encoding="utf-8")
        t = re.search(r"<title>([^<]*)</title>", text)
        mods.append(Module(mid, p, number, book, ch, t.group(1) if t else ""))
        if with_media:
            for src in re.findall(r'src="\.\./\.\./media/([^"]+)"', text):
                fetch_media(src, book)
    return mods


def fetch_chapter(refresh: bool = False, with_media: bool = True) -> list[Module]:
    """Calculus Volume 1, Chapter 2 (the course)."""
    return fetch_book("calc1", refresh, with_media)
