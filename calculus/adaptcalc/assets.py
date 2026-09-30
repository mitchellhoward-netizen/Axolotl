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
