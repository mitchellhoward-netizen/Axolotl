#!/usr/bin/env python3
"""Measure the website phone mockup straight from the real markup, in every language.

The frame is a fixed 390:844 aspect ratio, so it CANNOT grow. If the thread
content is taller than the thread band, something clips. On 2026-09-21 the live
page shipped 793.2px of content into a 530.5px band with `justify-content:
flex-end` plus a top mask: the overflow was clipped off the top and the mask
painted the top 26px transparent over white, which read as a "clipped bubble
above a dead white gap".

This script parses the real markup, wraps the real copy in the real font
(SF Pro, via PIL), and reports content height against the band, so a copy edit
can be checked before it is committed. Run it after touching the demo:

    python3 tools/measure-demo.py

It measures EVERY page listed in PAGES, not just English. The pages share one
stylesheet but carry their own copy and their own markup, so fixing one leaves
the others clipping: on the same day the Spanish page still held 778.8px in that
530.5px band with 9 items, and an English-only version of this script reported
ok. It also fails when the pages stop mirroring each other structurally (a bubble
or a form row added to one page and not the other).

Overflow is not a clip: site.css gives the thread `overflow-y: auto`, so copy that
outgrows the band scrolls, exactly as the pre-Benny site did. That valve is why the tool
checks the stylesheet as well: overflow is only a failure when the thread has stopped
being scrollable, because that is the combination that hides content.

Exit code is 1 when a page overflows while the thread is not scrollable, or when the
pages have stopped mirroring each other.
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
STYLESHEET = "public/site.css"
WIDTHS = (280, 300, 320, 335, 350)
# Every page that carries the demo. The pages differ only in language, so they must
# stay structurally identical; PAGES[0] is the reference the others are compared to.
PAGES = ("public/index.html", "public/es.html")


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
    found = re.search(r'<ol class="demo-thread">(.*?)</ol>', src, re.S)
    if not found:
        raise SystemExit(f'{path}: no <ol class="demo-thread"> found — the demo section is missing.')
    block = found.group(1)
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
    # The ratio lives on the SCREEN, which the phone's 11px padding insets on every side,
    # so the screen is (width - 22) wide and that width times 844/390 tall. Deriving the
    # band this way is what makes it correct: the previous model assumed the ratio was on
    # the phone's border box, which is exactly the mistake that let the content size the
    # phone and push the composer out of the bottom.
    screen_w = width - 2 * PHONE_PAD
    screen_h = screen_w * FRAME_RATIO
    band = screen_h - (BANDS if width >= 320 else BANDS_NARROW)
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


def thread_scrolls(path=STYLESHEET):
    """The safety valve, read from the stylesheet rather than assumed.

    Copy that outgrows the band is only safe while the thread can scroll. If someone
    puts `overflow: hidden` back, overflow silently becomes a clip again, which is the
    failure this whole file exists to catch.
    """
    css = open(path, encoding="utf-8").read()
    rule = re.search(r"\.demo-thread\s*\{([^}]*)\}", css)
    if not rule:
        return False, f"no .demo-thread rule in {path}"
    return re.search(r"overflow-y:\s*(auto|scroll)", rule.group(1)) is not None, rule.group(1)


def signature(items):
    """Structure only, never the copy: what the language pages must have in common."""
    return tuple((kind, len(payload[0]) if kind == "shot" else None) for kind, payload in items)


def describe(items):
    return " ".join(
        f"{kind}({len(payload[0])} rows)" if kind == "shot" else kind for kind, payload in items
    )


def main():
    pages = {}
    for path in PAGES:
        try:
            pages[path] = parse(path)
        except FileNotFoundError:
            print(f"FAIL: {path} not found.")
            return 1
    ok = True
    scrolls, thread_rule = thread_scrolls()
    scrolled_at = []

    # The pages are translations of one another: same messages, same order, same card.
    reference = pages[PAGES[0]]
    for path in PAGES[1:]:
        if signature(pages[path]) != signature(reference):
            print(f"FAIL: {path} no longer mirrors {PAGES[0]}")
            print(f"  {PAGES[0]}: {describe(reference)}")
            print(f"  {path}: {describe(pages[path])}")
            ok = False

    for path in PAGES:
        items = pages[path]
        print(f"{path}: {len(items)} items "
              f"({sum(1 for k, _ in items if k in ('in', 'out'))} bubbles, "
              f"{sum(1 for k, _ in items if k == 'shot')} card)")
        for w in WIDTHS:
            content, band, _ = measure(w, items)
            slack = band - content
            if slack >= 0:
                verdict = "ok"
            elif scrolls:
                verdict = "scrolls"
                scrolled_at.append(f"{path}@{w}px")
            else:
                verdict = "CLIPS"
                ok = False
            print(f"  frame {w:>3}px   content {content:6.1f}   band {band:6.1f}   "
                  f"slack {slack:+7.1f}   {verdict}")
        print()

    if not ok:
        print("FAIL: a page clips (overflows with a non-scrolling thread), or the pages "
              "have stopped mirroring each other.")
        if not scrolls:
            print(f"  the thread cannot scroll: {thread_rule}")
        return 1
    print(f"ok: all {len(PAGES)} pages fit at every supported width.")
    if scrolled_at:
        print(f"    note: the thread scrolls rather than clips at {', '.join(scrolled_at)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
