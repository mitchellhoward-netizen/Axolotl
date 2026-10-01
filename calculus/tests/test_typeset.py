"""Every template's prompt, answer and worked solution typesets (Typst compiles), for both courses."""
import pytest

from adaptcalc import extract, paths, render, templates


@pytest.mark.parametrize("course", ["algebra1", "calc_limits"])
def test_every_template_typesets(course, tmp_path):
    with paths.use_course(course):
        src = [render.doc_head("typeset check", "check", "T")]
        n = 0
        for tid in templates.for_course():
            for seed in (1, 7):
                p = templates.generate(tid, seed).to_json()
                n += 1
                src.append(render.problem_markup(n, p | {"figure": None}))
                src.append(f"$ {p['key_display']} $\n")
                if p.get("solution"):
                    src.append(f"#worked({n}, (" + ", ".join(f"[${ln}$]" for ln in p["solution"]) + ",))\n")
                    src.append(render.problem_markup(n, p | {"figure": None, "faded": 1}))
        render.compile_typst("\n".join(src), tmp_path / "typeset.pdf")
        assert (tmp_path / "typeset.pdf").stat().st_size > 1000
