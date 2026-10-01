"""Fonts and two-color figures for the packet renderer."""
from __future__ import annotations

import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

from . import paths

FONTS = {  # Fira Sans (SIL OFL) for headings; body and math use fonts bundled with Typst
    f"FiraSans-{w}.ttf": f"https://raw.githubusercontent.com/google/fonts/main/ofl/firasans/FiraSans-{w}.ttf"
    for w in ("Regular", "Medium", "SemiBold", "Bold", "Italic")
}
SPOT = (0x00, 0x6B, 0x7F)  # must match `spot` in typst/textbook.typ

# The web pages' book faces (SIL OFL): EB Garamond for titles, Source Serif 4 for reading.
GF = "https://raw.githubusercontent.com/google/fonts/main/ofl"
WEB_FONTS = {
    "EBGaramond.ttf": f"{GF}/ebgaramond/EBGaramond%5Bwght%5D.ttf",
    "EBGaramond-Italic.ttf": f"{GF}/ebgaramond/EBGaramond-Italic%5Bwght%5D.ttf",
    "SourceSerif4.ttf": f"{GF}/sourceserif4/SourceSerif4%5Bopsz,wght%5D.ttf",
    "SourceSerif4-Italic.ttf": f"{GF}/sourceserif4/SourceSerif4-Italic%5Bopsz,wght%5D.ttf",
    "Caveat.ttf": f"{GF}/caveat/Caveat%5Bwght%5D.ttf",  # the margin notes: a teacher's hand
}
KATEX = "https://registry.npmjs.org/katex/-/katex-0.16.11.tgz"
VENDOR = paths.CACHE / "vendor"


def ensure_web_assets() -> Path:
    """Fonts and KaTeX served from this app (no third-party requests from a learner's browser)."""
    import io
    import tarfile

    paths.FONT_DIR.mkdir(parents=True, exist_ok=True)
    for name, url in WEB_FONTS.items():
        dest = paths.FONT_DIR / name
        if not dest.exists():
            with urllib.request.urlopen(url, timeout=120) as r:
                dest.write_bytes(r.read())
    kdir = VENDOR / "katex"
    if not (kdir / "katex.min.js").exists():
        with urllib.request.urlopen(KATEX, timeout=120) as r:
            data = r.read()
        kdir.mkdir(parents=True, exist_ok=True)
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tf:
            for m in tf.getmembers():
                if m.isfile() and m.name.startswith("package/dist/") and (
                        m.name.endswith((".min.js", ".min.css", ".woff2")) and "/contrib/" not in m.name
                        or m.name.endswith("contrib/auto-render.min.js")):
                    rel = m.name[len("package/dist/"):]
                    out = kdir / rel
                    out.parent.mkdir(parents=True, exist_ok=True)
                    out.write_bytes(tf.extractfile(m).read())
    return VENDOR


def ensure_fonts() -> Path:
    paths.FONT_DIR.mkdir(parents=True, exist_ok=True)
    for name, url in FONTS.items():
        dest = paths.FONT_DIR / name
        if not dest.exists():
            with urllib.request.urlopen(url, timeout=60) as r:
                dest.write_bytes(r.read())
    return paths.FONT_DIR


def duotone(name: str) -> Path:
    """Re-ink a full-color OpenStax figure in black + the spot color.

    Neutral pixels (axes, labels, gray fills) keep their darkness in black ink;
    saturated pixels (the colored curves) are printed in the spot color with
    the same density. The result reads like a two-color printed figure.
    """
    from .source import fetch_media

    src = fetch_media(name)
    dest = paths.DUOTONE_DIR / (Path(name).stem + ".png")
    if dest.exists() and dest.stat().st_mtime >= src.stat().st_mtime:
        return dest
    paths.DUOTONE_DIR.mkdir(parents=True, exist_ok=True)
    im = np.asarray(Image.open(src).convert("RGB")).astype(np.float32) / 255.0
    mx, mn = im.max(axis=2), im.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    lum = 0.2126 * im[..., 0] + 0.7152 * im[..., 1] + 0.0722 * im[..., 2]
    density = np.clip(1.0 - lum, 0, 1)
    colored = np.clip((sat - 0.18) / 0.25, 0, 1)
    spot_density = np.clip(colored * (1.0 - mn) * 1.15, 0, 1)
    black_density = density * (1 - colored)
    spot = np.array(SPOT, dtype=np.float32) / 255.0
    out = np.ones_like(im)
    out = out * (1 - spot_density[..., None]) + spot[None, None, :] * spot_density[..., None]
    out = out * (1 - black_density[..., None])
    Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8)).save(dest, optimize=True)
    return dest
