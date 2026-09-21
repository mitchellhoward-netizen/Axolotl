#!/usr/bin/env python3
"""Measure the website phone mockup straight from public/index.html.

The frame is a fixed 390:844 aspect ratio, so it CANNOT grow. If the thread
content is taller than the thread band, something clips. On 2026-xx the live
page shipped 748.8px of content into a 530.5px band with `justify-content:
flex-end` plus a top mask: the overflow was clipped off the top and the mask
painted the top 26px transparent over white, which read as a "clipped bubble
above a dead white gap".

This script parses the real markup, wraps the real copy in the real font
(SF Pro, via PIL), and reports content height against the band, so a copy edit
can be checked before it is committed. Run it after touching the demo:

    python3 tools/measure-demo.py

Exit code is 1 when the content does not fit at any supported width.
"""

import html
import re
import sys

from PIL import ImageFont

# ── frame geometry (mirrors public/site.css) ────────────────────────────────
FRAME_RATIO = 844 / 390
PHONE_PAD = 11
THREAD_PAD_X, THREAD_PAD_TOP = 14, 10
BAND_STATUS, BAND_CONTACT, BAND_COMPOSER, BAND_HOME = 24, 48, 48, 20
BANDS = BAND_STATUS + BAND_CONTACT + BAND_COMPOSER + BAND_HOME
# Below a 360px viewport the frame is under its 320px design width and site.css drops
# the two decorative bands (composer, home indicator) so the thread keeps their 68px.
BANDS_NARROW = BAND_STATUS + BAND_CONTACT
GAP = 6
META = 17.8

BUBBLE_MAX = 0.88
BUBBLE_PAD_X, BUBBLE_PAD_Y = 14, 8
BUBBLE_FS, BUBBLE_LH = 15.5, 1.28

SHOT_MAX = 0.92
SHOT_PAD, SHOT_BORDER = 8, 1
LABEL_FS, LABEL_LH, LABEL_MB = 10, 1.2, 6
FORM_PAD_Y, FORM_GAP = 7, 5
ROW_FS, ROW_LH, ROW_PB, ROW_BORDER = 11.5, 1.3, 4, 1
CAP_FS, CAP_LH, CAP_MT = 11.5, 1.3, 7

FONT_PATH = "/System/Library/Fonts/SFNS.ttf"
WIDTHS = (280, 300, 320, 335, 350)


def font(size):
    return ImageFont.truetype(FONT_PATH, size)


def wrap_lines(text, f, maxw):
    lines, cur = [], ""
    for word in text.split():
        trial = f"{cur} {word}".strip()
        if f.getlength(trial) <= maxw or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def n_lines(text, size, maxw):
    return len(wrap_lines(text, font(size), maxw))


def bubble_h(text, maxw):
    return n_lines(text, BUBBLE_FS, maxw) * BUBBLE_FS * BUBBLE_LH + 2 * BUBBLE_PAD_Y


def shot_h(rows, label, caption, thread_inner):
    outer = SHOT_MAX * thread_inner
    form_inner = outer - 2 * (SHOT_PAD + SHOT_BORDER)
    h = 2 * (SHOT_PAD + SHOT_BORDER)
    h += n_lines(label, LABEL_FS, outer - 2 * SHOT_PAD) * LABEL_FS * LABEL_LH + LABEL_MB
    inner = 2 * FORM_PAD_Y + (len(rows) - 1) * FORM_GAP
    for i, (k, v) in enumerate(rows):
        last = i == len(rows) - 1
        rh = max(n_lines(k, ROW_FS, form_inner), n_lines(v, ROW_FS, form_inner * 0.6))
        inner += rh * ROW_FS * ROW_LH + (0 if last else ROW_PB + ROW_BORDER)
    h += inner
    if caption:
        h += CAP_MT + n_lines(caption, CAP_FS, outer - 2 * SHOT_PAD) * CAP_FS * CAP_LH
    return h


# ── parse the real markup ───────────────────────────────────────────────────
def text_of(fragment):
    fragment = re.sub(r"<span class=\"sr-only\">.*?</span>", "", fragment, flags=re.S)
    fragment = re.sub(r"<[^>]+>", " ", fragment)
    return re.sub(r"\s+", " ", html.unescape(fragment)).strip()


def parse(path="public/index.html"):
    src = open(path, encoding="utf-8").read()
    block = re.search(r'<ol class="demo-thread">(.*?)</ol>', src, re.S).group(1)
    items = []
    for li in re.findall(r"<li\b.*?</li>", block, re.S):
        if 'class="demo-meta"' in li:
            items.append(("meta", None))
        elif 'class="demo-bubble in"' in li:
            items.append(("in", text_of(li)))
        elif 'class="demo-bubble out"' in li:
            items.append(("out", text_of(li)))
        elif 'class="demo-shot"' in li:
            label = text_of(re.search(r'class="demo-shot-label">(.*?)</p>', li, re.S).group(1))
            cap = re.search(r'class="demo-shot-caption">(.*?)</p>', li, re.S)
            rows = [(text_of(k), text_of(v)) for k, v in
                    re.findall(r"<span>(.*?)</span><b>(.*?)</b>", li, re.S)]
            items.append(("shot", (rows, label, text_of(cap.group(1)) if cap else None)))
        else:
            raise SystemExit(f"unrecognised <li> in the demo thread: {li[:80]}")
    return items


def measure(width, items):
    inner_h = width * FRAME_RATIO - 2 * PHONE_PAD
    band = inner_h - (BANDS if width >= 320 else BANDS_NARROW)
    thread_inner = width - 2 * PHONE_PAD - 2 * THREAD_PAD_X
    bubble_w = BUBBLE_MAX * thread_inner - 2 * BUBBLE_PAD_X
    total, detail = THREAD_PAD_TOP, []
    for kind, payload in items:
        if kind == "meta":
            h = META
        elif kind in ("in", "out"):
            h = bubble_h(payload, bubble_w)
        else:
            h = shot_h(payload[0], payload[1], payload[2], thread_inner)
        detail.append((kind, h, payload if kind == "meta" else ""))
        total += h
    total += GAP * (len(items) - 1)
    return total, band, detail


def main():
    items = parse()
    print(f"demo thread: {len(items)} items "
          f"({sum(1 for k, _ in items if k in 'in out'.split())} bubbles, "
          f"{sum(1 for k, _ in items if k == 'shot')} card)\n")
    ok = True
    for w in WIDTHS:
        content, band, _ = measure(w, items)
        slack = band - content
        fits = slack >= 0
        ok &= fits
        print(f"  frame {w:>3}px   content {content:6.1f}   band {band:6.1f}   "
              f"slack {slack:+7.1f}   {'ok' if fits else 'CLIPS'}")
    if not ok:
        print("\nFAIL: the thread clips at one or more supported widths.")
        return 1
    print("\nok: fits at every supported width.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
