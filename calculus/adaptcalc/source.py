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
    # The exact source commit we use, so the license we rely on is the one in the text we ship.
    # OpenStax relicensed its algebra books from CC BY 4.0 to CC BY-NC-SA 4.0 on 2026-04-23;
    # a CC license can't be withdrawn from copies already released under it, so we pin the last
    # CC BY commit (2026-04-09) of each bundle. See LICENSES.md.
    ref: str = "main"
    license_url: str = ""
    commercial: bool = True  # may appear in what we sell (False: personal study only)
    authors: str = ""


BOOKS: dict[str, Book] = {
    "calc1": Book("calc1", "Calculus Volume 1", "osbooks-calculus-bundle", "calculus-volume-1", "calculus-volume-1",
                  (2,), "chapter", "Checkpoint", "CC BY-NC-SA 4.0",
                  license_url="http://creativecommons.org/licenses/by-nc-sa/4.0/", commercial=False,
                  authors="Gilbert Strang and Edwin Herman"),
    "at2e": Book("at2e", "Algebra and Trigonometry 2e", "osbooks-college-algebra-bundle", "algebra-and-trigonometry-2e",
                 "algebra-and-trigonometry-2e", (1, 2, 3, 4, 5, 7, 9), "section", "Try It", "CC BY 4.0",
                 ref="d1bd19c69107ba7f45775670809ae161d63db864",
                 license_url="https://creativecommons.org/licenses/by/4.0/", authors="Jay Abramson"),
    "pa2e": Book("pa2e", "Prealgebra 2e", "osbooks-prealgebra-bundle", "prealgebra-2e", "prealgebra-2e",
                 tuple(range(1, 12)), "chapter", "Try It", "CC BY 4.0",
                 ref="c1bbed4b86ff5c80686d339a6ca5e4e48fae2483",
                 license_url="https://creativecommons.org/licenses/by/4.0/",
                 authors="Lynn Marecek, MaryAnne Anthony-Smith and Andrea Honeycutt Mathis"),
    "ea2e": Book("ea2e", "Elementary Algebra 2e", "osbooks-prealgebra-bundle", "elementary-algebra-2e",
                 "elementary-algebra-2e", tuple(range(1, 11)), "chapter", "Try It", "CC BY 4.0",
                 ref="c1bbed4b86ff5c80686d339a6ca5e4e48fae2483",
                 license_url="https://creativecommons.org/licenses/by/4.0/",
                 authors="Lynn Marecek, MaryAnne Anthony-Smith and Andrea Honeycutt Mathis"),
}

# Chapter 2 of Calculus Volume 1 is the course; kept for the modules that predate multiple books.
CHAPTER_NUMBER = 2
BOOK_URL = "https://openstax.org/books/calculus-volume-1/pages/2-introduction"
RAW = f"https://raw.githubusercontent.com/openstax/{BOOKS['calc1'].repo}/main"


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


def attribution_line(book: str) -> str:
    """The credit CC licenses require: title, authors, licensor, license, link, and that it was changed."""
    b = BOOKS[book]
    return (f"Adapted from {b.title} by {b.authors}, OpenStax, {b.license} "
            f"({b.license_url.replace('http://', 'https://')}). Access for free at {book_url(book)}. "
            f"Excerpted, reordered and interleaved with generated practice.")


ATTRIBUTION = " ".join(attribution_line(b) for b in ("calc1", "at2e", "pa2e"))


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
    b = BOOKS[book]
    return f"https://raw.githubusercontent.com/openstax/{b.repo}/{b.ref}"


def book_dir(book: str) -> Path:
    b = BOOKS[book]
    return paths.SOURCE_DIR / book / b.ref[:12]


class LicenseMismatch(RuntimeError):
    pass


def chapter_modules(book: str, refresh: bool = False) -> list[tuple[int, int, str, str]]:
    """[(chapter number, index in chapter, module id, chapter title)] for the chapters we use."""
    b = BOOKS[book]
    coll = _cached(f"{raw(book)}/collections/{b.collection}.collection.xml",
                   book_dir(book) / "collection.xml", refresh)
    declared = re.search(r'license url="([^"]*)"', coll.read_text(encoding="utf-8"))
    if b.license_url and (not declared or declared.group(1) != b.license_url):
        raise LicenseMismatch(f"{b.title} at {b.ref[:7]} declares {declared.group(1) if declared else 'no license'}, "
                              f"expected {b.license_url}")
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
    dest = paths.MEDIA_DIR / name  # media names are unique hashes-with-names across the bundles
    if dest.exists():
        return dest
    import urllib.error
    import urllib.parse

    # the book's own repository first, then the CC BY books, the non-commercial one last
    rest = sorted((b for b in BOOKS if b != book), key=lambda b: not BOOKS[b].commercial)
    order = ([book] if book else []) + rest
    for b in order:
        try:
            return _cached(f"{raw(b)}/media/{urllib.parse.quote(name)}", dest)
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
        p = _cached(f"{raw(book)}/modules/{mid}/index.cnxml", book_dir(book) / f"{mid}.cnxml", refresh)
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
