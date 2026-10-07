"""Fetch a source and reduce it to comparable text.

Used by the snapshot tool (``tools/sources.py``) and the change-detection
job (``tools/check_changes.py``). Government sites often refuse non-browser
clients, so requests go out with a browser user agent.

``normalize`` turns HTML or PDF into plain text with navigation, scripts
and whitespace noise stripped, so that a change in the hash means a change
in what the page says rather than in its markup.
"""

from __future__ import annotations

import hashlib
import io
import re
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

import warnings

import requests
from bs4 import XMLParsedAsHTMLWarning

warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/130.0 Safari/537.36")
HEADERS = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


@dataclass
class Fetched:
    url: str
    final_url: str
    status: int
    content_type: str
    body: bytes
    text: str

    @property
    def ok(self) -> bool:
        return 200 <= self.status < 300 and bool(self.text.strip())

    @property
    def kind(self) -> str:
        if "pdf" in self.content_type or self.body[:5] == b"%PDF-":
            return "pdf"
        if "html" in self.content_type or b"<html" in self.body[:2000].lower():
            return "html"
        return "txt"

    @property
    def text_sha256(self) -> str:
        return hashlib.sha256(self.text.encode()).hexdigest()


_INTERMEDIATES = Path(__file__).resolve().parent / "ca" / "intermediates.pem"
_BUNDLE: str | None = None


def ca_bundle() -> str:
    """System CA bundle plus public intermediates some agency sites fail to send.

    nysed.gov and ilga.gov serve incomplete chains, which browsers repair but
    Python does not. The extra certificates each chain to a system root.
    """
    global _BUNDLE
    if _BUNDLE is None:
        import os

        import certifi

        base = os.environ.get("REQUESTS_CA_BUNDLE") or os.environ.get("SSL_CERT_FILE") or certifi.where()
        tmp = tempfile.NamedTemporaryFile("w", suffix=".pem", delete=False)
        tmp.write(Path(base).read_text() + "\n" + _INTERMEDIATES.read_text())
        tmp.close()
        _BUNDLE = tmp.name
    return _BUNDLE


RETRY_STATUS = {0, 404, 429, 500, 502, 503, 504}


def fetch(url: str, timeout: int = 60, attempts: int = 5) -> Fetched:
    """Fetch with retries: some agency CDNs (FNS) answer 404 or 5xx intermittently."""
    import time

    r = None
    err = ""
    for i in range(attempts):
        try:
            r = requests.get(url, headers=HEADERS, timeout=timeout, allow_redirects=True, verify=ca_bundle())
            if r.status_code not in RETRY_STATUS:
                break
        except requests.RequestException as e:
            r, err = None, str(e)
        if i < attempts - 1:
            time.sleep(1 + i)
    if r is None:
        return Fetched(url, url, 0, "", b"", f"FETCH ERROR: {err}")
    ctype = r.headers.get("content-type", "").lower()
    body = r.content
    f = Fetched(url, r.url, r.status_code, ctype, body, "")
    try:
        f.text = normalize(body, f.kind)
    except Exception as e:  # a broken PDF should not kill the whole job
        f.text = f"NORMALIZE ERROR: {e}"
    return f


_SCRIPT = re.compile(rb"<(script|noscript|iframe)\b[^>]*>.*?</\1\s*>", re.I | re.S)
_INLINE_HANDLER = re.compile(rb"\son[a-z]+\s*=\s*(\"[^\"]*\"|'[^']*')", re.I)


def strip_active_content(body: bytes) -> bytes:
    """Raw HTML as stored in a snapshot: scripts, iframes and inline handlers removed.

    Agency pages embed third-party API keys in scripts (CMS pages carry a
    public Mapbox token), which secret scanners rightly refuse. The snapshot
    only needs the content a reader sees.
    """
    return redact(_INLINE_HANDLER.sub(b"", _SCRIPT.sub(b"", body)))[0]


# Same shapes as the repo's scripts/check-secrets.ts, plus Mapbox tokens.
SECRET_SHAPES = [
    rb"\bsk-[A-Za-z0-9_-]{20,}\b",
    rb"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b",
    rb"\b(?:pk|sk)\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b",
    rb"\bAIza[0-9A-Za-z_-]{35}\b",
    rb"\bxox[baprs]-[0-9A-Za-z-]{10,}\b",
    rb"\bgh[pousr]_[A-Za-z0-9]{30,}\b",
    rb"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b",
    rb"\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}\b",
    rb"\bSG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b",
    rb"-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----",
    rb"(?:api[_-]?key|secret|token|password)\s*[:=]\s*['\"][A-Za-z0-9_\-+/=]{32,}['\"]",
]
_SECRETS = re.compile(b"|".join(b"(?:" + p + b")" for p in SECRET_SHAPES), re.I)


def redact(body: bytes) -> tuple[bytes, int]:
    """Replace anything shaped like a credential (third-party keys embedded in agency pages)."""
    return _SECRETS.subn(b"[REDACTED-CREDENTIAL-SHAPE]", body)


def normalize(body: bytes, kind: str) -> str:
    if kind == "pdf":
        text = _pdf_text(body)
    elif kind == "html":
        text = _html_text(body)
    else:
        text = _squash(body.decode("utf-8", "replace"))
    return redact(text.encode())[0].decode()


def _squash(text: str) -> str:
    lines = [re.sub(r"[ \t ]+", " ", ln).strip() for ln in text.splitlines()]
    out: list[str] = []
    for ln in lines:
        if ln or (out and out[-1]):
            out.append(ln)
    return "\n".join(out).strip() + "\n"


# Lines that change on every request without the content changing.
_VOLATILE = re.compile(
    r"(page last (modified|updated|reviewed)|last (modified|updated|reviewed)\s*:?|"
    r"copyright ©|©\s*\d{4}|cookie|you are leaving|skip to main content)",
    re.I,
)


_BLOCKS = ["p", "div", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "table",
           "section", "article", "dt", "dd", "blockquote", "pre", "td", "th"]


def _html_text(body: bytes) -> str:
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(body, "lxml")
    for tag in soup(["script", "style", "noscript", "svg", "iframe"]):
        tag.decompose()
    # Page chrome is dropped only when it is small: some sites (SSA POMS)
    # wrap the whole document in a <form> (never dropped) or a large <header>.
    for tag in soup(["header", "footer", "nav"]):
        if len(tag.get_text(" ", strip=True)) < 3000:
            tag.decompose()
    body_el = soup.body or soup
    total = len(body_el.get_text(" ", strip=True)) or 1
    main = soup.find("main")
    if main is None or len(main.get_text(" ", strip=True)) < 0.3 * total:
        main = body_el
    # Break lines at block elements only, so inline links and emphasis stay in their sentence.
    for el in main.find_all(_BLOCKS):
        el.insert_before("\n")
        el.insert_after("\n")
    for br in main.find_all("br"):
        br.replace_with("\n")
    text = main.get_text("")
    kept = [ln for ln in text.splitlines() if not _VOLATILE.search(ln)]
    return _squash("\n".join(kept))


def _pdf_text(body: bytes) -> str:
    with tempfile.NamedTemporaryFile(suffix=".pdf") as tmp:
        tmp.write(body)
        tmp.flush()
        try:
            out = subprocess.run(["pdftotext", "-layout", tmp.name, "-"], capture_output=True, timeout=120)
            if out.returncode == 0 and out.stdout.strip():
                return _squash(out.stdout.decode("utf-8", "replace"))
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(body))
    return _squash("\n".join(page.extract_text() or "" for page in reader.pages))
