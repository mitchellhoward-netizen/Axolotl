"""Make a phone-photo-like image of handwritten work, for exercising the photo pipeline.

This is a *test fixture generator*, not part of the learning loop: it draws a
page of work in a handwriting font (2D fractions, square roots, exponents),
with the conventions the pipeline expects (packet code at the top, numbered
problems, one step per line, crossed-out lines, boxed answers), then applies
paper texture, perspective, uneven lighting, noise and JPEG compression.

The pipeline never sees this script's content: the transcription step reads
only the resulting image.

    python tools/make_sample_photo.py out.jpg
"""
from __future__ import annotations

import math
import random
import sys
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONT_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/caveat/Caveat%5Bwght%5D.ttf"
FONT = ROOT / ".cache" / "fonts" / "hand.ttf"
INK = (28, 38, 96)
rng = random.Random(7)


def font(size):
    if not FONT.exists():
        FONT.parent.mkdir(parents=True, exist_ok=True)
        FONT.write_bytes(urllib.request.urlopen(FONT_URL, timeout=60).read())
    return ImageFont.truetype(str(FONT), size)


# --- tiny 2D math layout: every node renders to (image, baseline) ---------------------

class T:  # text
    def __init__(self, s, size=64):
        self.s, self.size = s, size

    def render(self):
        f = font(self.size)
        asc, desc = f.getmetrics()
        w = int(f.getlength(self.s)) + 6
        im = Image.new("L", (max(w, 1), asc + desc + 6), 0)
        d = ImageDraw.Draw(im)
        x = 2
        for ch in self.s:  # per-glyph jitter reads as handwriting
            d.text((x + rng.uniform(-0.8, 0.8), 3 + rng.uniform(-1.5, 1.5)), ch, font=f, fill=255)
            x += f.getlength(ch) + rng.uniform(-0.5, 0.8)
        return im, asc + 3


class Row:
    def __init__(self, *items, gap=4):
        self.items, self.gap = items, gap

    def render(self):
        parts = [i.render() if not isinstance(i, str) else T(i).render() for i in self.items]
        up = max(b for _, b in parts)
        down = max(im.height - b for im, b in parts)
        w = sum(im.width for im, _ in parts) + self.gap * (len(parts) - 1)
        out = Image.new("L", (w, up + down), 0)
        x = 0
        for im, b in parts:
            out.paste(im, (x, up - b), im)
            x += im.width + self.gap
        return out, up


class Frac:
    def __init__(self, num, den, size=50):
        self.num = num if not isinstance(num, str) else T(num, size)
        self.den = den if not isinstance(den, str) else T(den, size)

    def render(self):
        (a, _), (b, _) = self.num.render(), self.den.render()
        w = max(a.width, b.width) + 16
        h = a.height + b.height + 14
        out = Image.new("L", (w, h), 0)
        out.paste(a, ((w - a.width) // 2, 0), a)
        out.paste(b, ((w - b.width) // 2, a.height + 12), b)
        d = ImageDraw.Draw(out)
        y = a.height + 5 + rng.uniform(-1, 1)
        d.line([(2, y), (w - 2, y + rng.uniform(-2, 2))], fill=255, width=4)
        return out, a.height + 20


class Sqrt:
    def __init__(self, body):
        self.body = body if not isinstance(body, str) else T(body, 56)

    def render(self):
        b, bb = self.body.render()
        w, h = b.width + 34, b.height + 10
        out = Image.new("L", (w, h), 0)
        out.paste(b, (30, 10), b)
        d = ImageDraw.Draw(out)
        d.line([(2, h * 0.6), (10, h * 0.55), (18, h - 4), (28, 4), (w - 2, 5 + rng.uniform(-2, 2))], fill=255, width=4)
        return out, bb + 10


class Sup:
    def __init__(self, base, exp):
        self.base = base if not isinstance(base, str) else T(base)
        self.exp = exp if not isinstance(exp, str) else T(exp, 40)

    def render(self):
        (b, bb), (e, _) = self.base.render(), self.exp.render()
        out = Image.new("L", (b.width + e.width, b.height + 4), 0)
        out.paste(b, (0, 4), b)
        out.paste(e, (b.width - 6, 0), e)
        return out, bb + 4


# --- page ---------------------------------------------------------------------------------

def page(lines, size=(1700, 2200)):
    """lines: list of (node, {"indent", "cross", "box", "gap"})"""
    W, H = size
    paper = Image.new("RGB", (W, H), (247, 244, 236))
    d = ImageDraw.Draw(paper)
    for y in range(190, H - 60, 78):  # ruled lines
        d.line([(0, y), (W, y)], fill=(176, 196, 222), width=2)
    d.line([(150, 0), (150, H)], fill=(222, 150, 150), width=3)
    ink = Image.new("L", (W, H), 0)
    y, col = 70, 0
    for node, opt in lines:
        im, base = node.render()
        ang = rng.uniform(-0.8, 0.8)
        im = im.rotate(ang, expand=True, resample=Image.BICUBIC)
        if opt.get("newcol"):
            y, col = 210, 860
        x = 180 + col + opt.get("indent", 0) + rng.randint(-6, 6)
        y += opt.get("gap", 0)
        ink.paste(im, (x, y), im)
        di = ImageDraw.Draw(ink)
        if opt.get("box"):
            bx0, by0, bx1, by1 = x - 12, y - 6, x + im.width + 12, y + im.height + 6
            pts = [(bx0 + rng.uniform(-4, 4), by0 + rng.uniform(-4, 4)), (bx1 + rng.uniform(-4, 4), by0 + rng.uniform(-4, 4)),
                   (bx1 + rng.uniform(-4, 4), by1 + rng.uniform(-4, 4)), (bx0 + rng.uniform(-4, 4), by1 + rng.uniform(-4, 4)),
                   (bx0 + 8, by0 + rng.uniform(-3, 3))]
            di.line(pts, fill=255, width=4, joint="curve")
        if opt.get("cross"):
            mid = y + im.height * 0.5
            pts = [(x - 10 + i * 12, mid + 7 * math.sin(i * 0.9) + rng.uniform(-2, 2)) for i in range((im.width + 20) // 12)]
            di.line(pts, fill=255, width=5)
        y += max(im.height, 70) + 12
    paper_np = np.asarray(paper).astype(np.float32)
    a = (np.asarray(ink.filter(ImageFilter.GaussianBlur(0.8))).astype(np.float32) / 255.0)[..., None]
    out = paper_np * (1 - a) + np.array(INK, np.float32) * a
    return Image.fromarray(out.clip(0, 255).astype(np.uint8))


def photograph(img: Image.Image) -> Image.Image:
    W, H = img.size
    # perspective: the phone is held slightly off-axis
    src = [(0, 0), (W, 0), (W, H), (0, H)]
    dst = [(60, 40), (W - 20, 90), (W - 70, H - 30), (30, H - 80)]
    coeffs = _persp(dst, src)
    canvas = Image.new("RGB", (W, H), (70, 64, 58))
    warped = img.transform((W, H), Image.PERSPECTIVE, coeffs, Image.BICUBIC, fillcolor=(70, 64, 58))
    canvas.paste(warped)
    arr = np.asarray(canvas).astype(np.float32)
    yy, xx = np.mgrid[0:H, 0:W]
    light = 1.0 - 0.22 * ((xx / W - 0.3) ** 2 + (yy / H - 0.25) ** 2) - 0.06 * (yy / H)
    arr = arr * light[..., None]
    arr += np.random.default_rng(3).normal(0, 4.0, arr.shape)
    out = Image.fromarray(arr.clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
    return out.resize((W * 3 // 4, H * 3 // 4), Image.LANCZOS)


def _persp(pa, pb):
    m = []
    for p1, p2 in zip(pa, pb):
        m.append([p1[0], p1[1], 1, 0, 0, 0, -p2[0] * p1[0], -p2[0] * p1[1]])
        m.append([0, 0, 0, p1[0], p1[1], 1, -p2[1] * p1[0], -p2[1] * p1[1]])
    A = np.array(m, dtype=float)
    B = np.array(pb, dtype=float).reshape(8)
    return np.linalg.solve(A, B).tolist()


def d1_work():
    """Work on Diagnostic round D1 (problems 1-5 and 10), as a student might write it."""
    L = []
    L.append((T("D1", 80), {"indent": 1150}))
    # 1. slope of the line through (2, f(2)) and (3, f(3)), f(x) = x^2 - 3
    L.append((Row(T("1.", 64), T("f(2) = 4 - 3 = 1")), {"gap": 10}))
    L.append((T("f(3) = 9 - 3 = 6"), {"indent": 70}))
    L.append((Row("m =", Frac("6 - 1", "3 - 2")), {"indent": 70}))
    L.append((T("= 5"), {"indent": 110, "box": True}))
    # 2. rationalize 1/(sqrt(x) - 4)   (conjugate product expanded incorrectly)
    L.append((Row(T("2.", 64), Frac("1", Row(Sqrt("x"), T("- 4", 50))), T("·"),
                  Frac(Row(Sqrt("x"), T("+ 4", 50)), Row(Sqrt("x"), T("+ 4", 50)))), {"gap": 24}))
    L.append((Row("=", Frac(Row(Sqrt("x"), T("+ 4", 50)), "x - 4")), {"indent": 70, "box": True}))
    # 3. simplify (1/x - 1/4)/(x - 4): a false start crossed out, then a restart
    L.append((Row(T("3.", 64), Frac(Row(Frac("1", "x", 40), T("-", 50), Frac("1", "4", 40)), "x - 4"),
                  T("="), T("("), Frac("1", "x", 40), T("-", 50), Frac("1", "4", 40), T(")(x - 4)")),
              {"gap": 24, "cross": True}))
    L.append((Row(Frac(Row(Frac("1", "x", 40), T("-", 50), Frac("1", "4", 40)), "x - 4"), T("="),
                  Frac(Frac("4 - x", "4x", 40), "x - 4")), {"indent": 70}))
    L.append((Row("=", Frac("-(x - 4)", "4x(x - 4)")), {"indent": 70}))
    L.append((Row("=", Frac("-1", "4x")), {"indent": 70, "box": True}))
    # 4. where is (x - 4)/(x^2 + 11x + 30) undefined
    L.append((Row(T("4.", 64), Sup("x", "2"), T("+ 11x + 30 = 0")), {"newcol": True}))
    L.append((T("(x + 5)(x + 6) = 0"), {"indent": 70}))
    L.append((T("x = -5, -6"), {"indent": 70, "box": True}))
    # 5. skipped
    L.append((Row(T("5.", 64), T("skip")), {"gap": 20}))
    # 10. limit laws with lim f = -4, lim g = 3
    L.append((Row(T("10.", 64), T("="), Frac("4(-4) - 3", "(-4)(3)")), {"gap": 20}))
    L.append((Row("=", Frac("-19", "-12"), T("="), Frac("19", "12")), {"indent": 90, "box": True}))
    return L


def d1_work_page2():
    """Problems 6-9 of D1 on a second page (problem 9 uses left endpoints by mistake)."""
    L = [(T("D1", 80), {"indent": 1150})]
    # 6. simplify sin^2(x)/(1 - cos(x))
    L.append((Row(T("6.", 64), Frac(Row(Sup("sin", "2"), T("x", 50)), "1 - cos x"), T("="),
                  Frac(Row(T("1 -", 50), Sup("cos", "2"), T("x", 50)), "1 - cos x")), {"gap": 10}))
    L.append((Row("=", Frac("(1 - cos x)(1 + cos x)", "1 - cos x")), {"indent": 70}))
    L.append((T("= 1 + cos x"), {"indent": 70, "box": True}))
    # 7. secant slope for f(x) = x^2 + 1 through P(1, f(1)), Q(2, f(2))
    L.append((Row(T("7.", 64), T("f(1) = 2,  f(2) = 5")), {"gap": 24}))
    L.append((Row("m =", Frac("5 - 2", "2 - 1"), T("= 3")), {"indent": 70, "box": True}))
    # 8. average velocity of s(t) = -16t^2 + 48t over [2, 5/2]
    L.append((Row(T("8.", 64), T("s(2) = -64 + 96 = 32")), {"newcol": True}))
    L.append((Row(T("s("), Frac("5", "2", 40), T(") = -100 + 120 = 20")), {"indent": 70}))
    L.append((Row("v =", Frac("20 - 32", Row(Frac("5", "2", 40), T("- 2", 50))), T("="),
                  Frac("-12", Frac("1", "2", 40))), {"indent": 70}))
    L.append((T("= -24 ft/s"), {"indent": 110, "box": True}))
    # 9. area under x^2 on [0, 2], 2 rectangles, right endpoints asked; left endpoints used
    L.append((Row(T("9.", 64), T("width = 1")), {"gap": 24}))
    L.append((T("A = 1·f(0) + 1·f(1)"), {"indent": 70}))
    L.append((T("= 0 + 1 = 1"), {"indent": 70, "box": True}))
    return L


if __name__ == "__main__":
    dest = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "samples" / "d1-page1.jpg")
    which = sys.argv[2] if len(sys.argv) > 2 else "page1"
    dest.parent.mkdir(parents=True, exist_ok=True)
    photograph(page(d1_work() if which == "page1" else d1_work_page2())).save(dest, quality=82)
    print(dest)
