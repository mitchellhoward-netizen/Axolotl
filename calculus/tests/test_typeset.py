"""Every template's prompt, answer and worked solution typesets (Typst compiles), for both courses."""
import pytest

from adaptcalc import extract, paths, render, templates


@pytest.mark.parametrize("course", ["algebra1", "calc_limits", "prealgebra", "elementary"])
def test_every_template_typesets(course, tmp_path):
    with paths.use_course(course):
        src = [render.doc_head("typeset check", "check", "T")]
        n = 0
        for tid in templates.for_course():
            for seed in (1, 7):
                p = templates.generate(tid, seed).to_json()
                if (p.get("figure") or {}).get("type") != "draw":  # drawn figures are checked; graphs are slow
                    p["figure"] = None
                n += 1
                src.append(render.problem_markup(n, p))
                src.append(f"$ {p['key_display']} $\n")
                if p.get("solution"):
                    src.append(f"#worked({n}, (" + ", ".join(f"[${ln}$]" for ln in p["solution"]) + ",))\n")
                    src.append(render.problem_markup(n, p | {"faded": 1}))
        render.compile_typst("\n".join(src), tmp_path / "typeset.pdf")
        assert (tmp_path / "typeset.pdf").stat().st_size > 1000


def test_figure_names_do_not_shadow_typst_symbols(tmp_path):
    """Figures are imported into every packet; a figure named like a math symbol (angle, dots)
    would break the book text that uses that symbol (angle.l, dots.h)."""
    import re

    import typst

    names = re.findall(r"^#let ([a-z][a-z0-9-]*)\(", (paths.ROOT / "typst" / "figures.typ").read_text(), re.M)
    assert names
    clashes = []
    for n in names:
        f = tmp_path / "s.typ"
        f.write_text(f"#sym.{n}\n")
        try:
            typst.compile(str(f))
            clashes.append(n)
        except Exception:  # noqa: BLE001
            pass
    assert clashes == []


def test_the_elementary_book_typesets_verbatim(tmp_path):
    """Every section of the authored K-5 book compiles, and every word of it is in the PDF."""
    from adaptcalc import authored

    mods = authored.load("mk5")
    assert len(mods) == 60
    ctx = render.Ctx()
    src = [render.doc_head("book check", "check", "T", attribution_text="check")]
    for m in mods:
        src.append(f'#section-head("{m.number}", "{render.esc(m.title)}")\n' + render.blocks(m.blocks, ctx))
    out = render.compile_typst("\n".join(src), tmp_path / "book.pdf")
    audit = render.verbatim_audit(out, ctx.runs)
    assert audit["ok"], audit["missing"][:5]
