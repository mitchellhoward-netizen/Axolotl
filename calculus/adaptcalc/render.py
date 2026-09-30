"""Render packets: Typst -> two-color PDF.

Canonical text is emitted verbatim from the IR: every run of source text
becomes a Typst string literal (#"..."), so no character is reinterpreted as
markup. Only selected boxes, template problems and gated transitions vary.
After compiling, `verbatim_audit` extracts the PDF text and confirms every
canonical text run is present.
"""
from __future__ import annotations

import json
import re
import shutil
from dataclasses import dataclass, field
from pathlib import Path

import pymupdf as fitz
import sympy as sp
import typst

from . import assets, cnxml, paths, source

TEMPLATE_IMPORT = '#import "/typst/textbook.typ": *\n#import "@preview/cetz:0.3.4"\n'


def esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')


def norm_ws(s: str) -> str:
    return re.sub(r"\s+", " ", s)


@dataclass
class Ctx:
    select: callable = lambda b: True           # which boxes/examples/checkpoints to print
    before: dict = field(default_factory=dict)  # block id -> list of typst snippets to insert before it
    runs: list = field(default_factory=list)    # canonical text runs printed (for the audit)
    omitted: list = field(default_factory=list)
    printed_ids: list = field(default_factory=list)
    solutions: list = field(default_factory=list)  # checkpoint solutions moved to the key
    images: bool = True                              # False: captions only (compile checks)


# ---------------------------------------------------------------------------
# inline

def inl(items: list[dict], ctx: Ctx, record: bool = True) -> str:
    out = []
    for i in items or []:
        k = i["k"]
        if k == "text":
            s = norm_ws(i["s"])
            if s:
                out.append(f'#"{esc(s)}"')
                if record and s.strip():
                    ctx.runs.append(s.strip())
        elif k == "math":
            out.append(f"${i['typ']}$" if not i.get("display") else f"$ {i['typ']} $")
        elif k == "em":
            inner = inl(i["c"], ctx, record)
            style = i.get("style")
            out.append(f"#emph[{inner}]" if style == "italics" else f"#strong[{inner}]" if style == "bold" else inner)
        elif k == "term":
            out.append(f"#strong[{inl(i['c'], ctx, record)}]")
        elif k == "sup":
            out.append(f"#super[{inl(i['c'], ctx, record)}]")
        elif k == "sub":
            out.append(f"#sub[{inl(i['c'], ctx, record)}]")
        elif k == "ref":
            out.append(f'#"{esc(i["s"])}"')
        elif k == "br":
            out.append("#linebreak()")
    return "".join(out)


# ---------------------------------------------------------------------------
# blocks

def image_markup(name: str, splash: bool = False) -> str:
    p = assets.duotone(name)
    rel = "/" + str(p.relative_to(paths.ROOT))
    from PIL import Image

    w, h = Image.open(p).size
    width = "100%" if splash else ("82%" if w / h > 1.9 else "52%" if w / h > 1.1 else "40%")
    return f'image("{rel}", width: {width})'


def blocks(bs: list[dict], ctx: Ctx, in_solution: bool = False) -> str:
    return "\n".join(filter(None, (block(b, ctx, in_solution) for b in bs)))


def block(b: dict, ctx: Ctx, in_solution: bool = False) -> str:
    t = b["t"]
    pre = ""
    if b.get("id") in ctx.before:
        pre = "\n".join(ctx.before[b["id"]]) + "\n"
    if b.get("id"):
        ctx.printed_ids.append(b["id"])
    if t == "para":
        title = f"#strong[{inl(b['title'], ctx)}] " if b.get("title") else ""
        body = inl(b["inl"], ctx)
        return pre + (f"{title}{body}\n" if (title or body) else "")
    if t == "equation":
        return pre + f"$ {b['math']['typ']} $\n"
    if t == "list":
        items = [f"[{blocks(it, ctx, in_solution)}]" for it in b["items"]]
        title = f"#strong[{inl(b['title'], ctx)}]\n" if b.get("title") else ""
        if b["ordered"] and all(circled_start(it) for it in b["items"]):
            # the items already carry their own letters (ⓐ, ⓑ, ...): don't number them twice
            return pre + title + "#list(marker: none, indent: 0.4em, " + ", ".join(items) + ")\n"
        if b["ordered"]:
            num = {"lower-alpha": "a.", "lower-roman": "i.", "upper-alpha": "A.", "upper-roman": "I."}.get(b["style"], "1.")
            return pre + title + f"#enum(numbering: \"{num}\", " + ", ".join(items) + ")\n"
        return pre + title + "#list(" + ", ".join(items) + ")\n"
    if t == "figure":
        imgs = ", ".join(image_markup(n, b.get("splash")) for n in b["images"]) if ctx.images else ""
        cap = f"[{inl(b['caption'], ctx)}]" if b["caption"] else "none"
        label = f'"{b["label"]}"' if b.get("label") else "none"
        return pre + f"#fig(({imgs + ',' if imgs else ''}), {label}, {cap})\n"
    if t == "table":
        return pre + table_markup(b, ctx)
    if t == "box":
        if not ctx.select(b):
            ctx.omitted.append(b.get("label") or cnxml.plain(b["title"]) or b["kind"])
            return pre
        kind = b["kind"]
        body = blocks(b["blocks"], ctx, in_solution)
        title = inl(b["title"], ctx)
        if kind == "definition":
            return pre + f"#definition([{title}], [{body}])\n"
        if kind == "theorem":
            return pre + f"#theorem([{title}], [{body}])\n"
        if kind == "problem-solving":
            return pre + f"#strategy([{title}], [{body}])\n"
        if kind == "checkpoint":
            return pre + f"#checkpoint(\"{b.get('label') or 'Try It'}\", [{body}])\n"
        if kind == "howto":
            return pre + f"#howto([{title}], [{body}])\n"
        if kind == "qa":
            return pre + f"#qa([{title} {body}])\n"
        return pre + f"#note-box({'[' + title + ']' if title else 'none'}, [{body}])\n"
    if t == "example":
        if not ctx.select(b):
            ctx.omitted.append(b.get("label"))
            return pre
        prob = blocks(b["problem"], ctx)
        sol = blocks(b["solution"], ctx, True)
        after = blocks(b["after"], ctx)
        return pre + f"#example(\"{b['label']}\", [{inl(b['title'], ctx)}], [{prob}], [{sol}], [{after}])\n"
    if t == "exercise":
        prob = blocks(b["problem"], ctx)
        if b["solution"]:
            # the book prints checkpoint answers at the back; they go to the packet's key
            sctx = Ctx()
            ctx.solutions.append(blocks(b["solution"], sctx))
        return pre + prob
    if t == "section":
        cls = b.get("class", "")
        if cls == "section-exercises":
            ctx.omitted.append("Section Exercises (replaced by the practice set)")
            return pre
        title = inl(b["title"], ctx)
        return pre + f"#subsection([{title}])\n" + blocks(b["blocks"], ctx)
    return pre


def circled_start(item_blocks: list[dict]) -> bool:
    text = " ".join(cnxml.block_plain(x) for x in item_blocks).strip()
    return bool(text) and "\u24b6" <= text[0] <= "\u24e9"


def table_markup(b: dict, ctx: Ctx) -> str:
    rows = b["rows"]
    if not rows:
        return ""
    ncols = max(sum(1 for _ in r) for r in rows[:1]) if rows else 1
    ncols = max(ncols, max(len(r) for r in rows))
    cells = []
    for ri, r in enumerate(rows):
        for c in r:
            content = inl(c["inl"], ctx)
            fill = ", fill: tint1" if ri < b["header_rows"] else ""
            span = f"rowspan: {c['morerows'] + 1}, " if c["morerows"] else ""
            cells.append(f"table.cell({span}inset: 5pt{fill})[#set text(size: 9pt); {content}]")
    stroke = "stroke: none, " if b.get("unstyled") else ""
    label = f'#text(font: sans, size: 9pt, weight: "bold", fill: spot)[{b["label"]}]\n' if b.get("label") else ""
    breakable = "true" if len(rows) > 12 else "false"  # long tables continue on the next page
    return (f"#block(breakable: {breakable}, above: 0.8em, below: 1em)[{label}#align(center, table(columns: {ncols}, {stroke}"
            + ", ".join(cells) + "))]\n")


# ---------------------------------------------------------------------------
# problems

def graph_markup(fig: dict) -> str:
    xs = sp.Symbol("x")
    pts_all = []
    curves = []
    for pc in fig["pieces"]:
        f = sp.lambdify(xs, sp.sympify(pc["expr"]), "math")
        a, b = pc["from"], pc["to"]
        n = 60
        pts = [(a + (b - a) * i / n, float(f(a + (b - a) * i / n))) for i in range(n + 1)]
        curves.append(pts)
        pts_all += pts
    ys = [y for _, y in pts_all] + [d["y"] for d in fig["dots"]] + [0]
    ymin, ymax = max(min(ys) - 1, -8), min(max(ys) + 1, 8)
    curves = [[(x, max(min(y, ymax), ymin)) for x, y in c] for c in curves]
    xmin, xmax = fig["xmin"] - 0.5, fig["xmax"] + 0.5
    out = ["#cetz.canvas(length: 0.5cm, {", "import cetz.draw: *"]
    for i in range(int(xmin) + 1, int(xmax) + 1):
        out.append(f"line(({i}, {ymin}), ({i}, {ymax}), stroke: 0.3pt + tint1)")
    for j in range(int(ymin) + 1, int(ymax) + 1):
        out.append(f"line(({xmin}, {j}), ({xmax}, {j}), stroke: 0.3pt + tint1)")
    out.append(f"line(({xmin}, 0), ({xmax}, 0), stroke: 0.7pt, mark: (end: \">\", fill: black, size: 0.25))")
    out.append(f"line((0, {ymin}), (0, {ymax}), stroke: 0.7pt, mark: (end: \">\", fill: black, size: 0.25))")
    out.append(f"content(({xmax}, -0.5), text(size: 8pt)[$x$])")
    out.append(f"content((0.5, {ymax}), text(size: 8pt)[$y$])")
    for i in range(int(xmin) + 1, int(xmax) + 1):
        if i:
            out.append(f"line(({i}, -0.12), ({i}, 0.12), stroke: 0.6pt)")
            out.append(f"content(({i}, -0.55), text(size: 6.5pt)[${i}$])")
    for j in range(int(ymin) + 1, int(ymax) + 1):
        if j:
            out.append(f"line((-0.12, {j}), (0.12, {j}), stroke: 0.6pt)")
            out.append(f"content((-0.55, {j}), text(size: 6.5pt)[${j}$])")
    for c in curves:
        coords = ", ".join(f"({x:.3f}, {y:.3f})" for x, y in c)
        out.append(f"line({coords}, stroke: 1.3pt + spot)")
    for h in fig["holes"]:
        out.append(f"circle(({h['x']}, {h['y']}), radius: 0.16, fill: white, stroke: 1pt + spot)")
    for d in fig["dots"]:
        out.append(f"circle(({d['x']}, {d['y']}), radius: 0.16, fill: spot, stroke: none)")
    out.append("})")
    return "\n".join(out)


def display_inline(markup: str) -> str:
    """Problem statements use display-style math inline, as printed exercise sets do."""
    return re.sub(r"\$\s*(.+?)\s*\$", lambda m: f"$display(#${m.group(1)}$)$", markup)


def problem_markup(num: int, p: dict) -> str:
    body = display_inline(p["prompt"])
    if p.get("options"):
        body += "\n" + " #h(1.2em) ".join(f"({lab}) ${tp}$" for lab, tp in p["options"])
    fig = "none"
    f = p.get("figure")
    if f and f["type"] == "table":
        cells = [f"[{h}]" for h in f["header"]] + [f"[${c}$]" for r in f["rows"] for c in r]
        fig = ("align(center, table(columns: 2, align: right, inset: 4pt, fill: (x, y) => if y == 0 { tint1 }, "
               + ", ".join(f"text(size: 9pt, {c})" for c in cells) + "))")
    elif f and f["type"] == "graph":
        fig = "align(center)[" + graph_markup(f) + "]"
    return f"#problem({num}, [{body}], space: {p.get('work_lines', 6)}, figure: {fig})\n"


# ---------------------------------------------------------------------------
# compile + audit

BODY_CLIP = (0, 0.9 * 72, 8.5 * 72, 11 * 72 - 0.85 * 72)  # exclude running header and footer


def compile_typst(src: str, out_pdf: Path) -> Path:
    assets.ensure_fonts()
    out_pdf.parent.mkdir(parents=True, exist_ok=True)
    paths.BUILD.mkdir(parents=True, exist_ok=True)
    typ_path = paths.BUILD / (out_pdf.stem + ".typ")
    typ_path.write_text(src, encoding="utf-8")
    pdf = typst.compile(str(typ_path), root=str(paths.ROOT), font_paths=[str(paths.FONT_DIR)])
    out_pdf.write_bytes(pdf)
    return out_pdf


def pdf_text(pdf: Path) -> str:
    doc = fitz.open(pdf)
    parts = [pg.get_text("text", clip=fitz.Rect(*BODY_CLIP)) for pg in doc]
    t = " ".join(parts)
    for a, b in {"ﬁ": "fi", "ﬂ": "fl", "ﬀ": "ff", "ﬃ": "ffi", "ﬄ": "ffl", "­": ""}.items():
        t = t.replace(a, b)
    return norm_ws(t)


def verbatim_audit(pdf: Path, runs: list[str]) -> dict:
    text = pdf_text(pdf)
    squashed = text.replace(" ", "")
    missing = []
    for r in runs:
        rr = norm_ws(r).strip()
        if len(rr) < 2:
            continue
        if rr in text or rr.replace(" ", "") in squashed:
            continue
        missing.append(rr)
    return {"runs": len(runs), "missing": missing, "ok": not missing}


def attribution() -> str:
    return "OpenStax Calculus Vol. 1 (CC BY-NC-SA 4.0), adapted for personal study"


def doc_head(title: str, running: str, code: str, attribution_text: str | None = None,
             kicker: str | None = None) -> str:
    k = f', kicker: [#smallcaps[#"{esc(kicker)}"]]' if kicker else ""
    return (TEMPLATE_IMPORT +
            f'#show: book.with(title: "{esc(title)}", running: [{esc(running)}], code: "{code}", '
            f'attribution: "{esc(attribution_text or attribution())}"{k})\n')


def book_attribution(book: str) -> str:
    from .source import BOOKS

    b = BOOKS[book]
    return f"OpenStax {b.title} ({b.license}), adapted for personal study"


def write_json(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, indent=2, default=str), encoding="utf-8")


def copy_to(dest_dir: Path, *files: Path) -> None:
    dest_dir.mkdir(parents=True, exist_ok=True)
    for f in files:
        shutil.copy2(f, dest_dir / f.name)


def source_note() -> str:
    return f"Canonical text from {source.BOOK_URL}"
