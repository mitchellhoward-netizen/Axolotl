"""A problem the checker cannot handle never stops the rest of the page from being checked."""
import pytest

from adaptcalc import answers, evidence, flow, paths, pipeline, stepcheck, transcribe
from adaptcalc.learner import LearnerDB


@pytest.mark.parametrize("form,written,ok", [
    ("factored", "x*(1+1/x)", False),                 # once crashed the whole photo
    ("factored_completely", "x**2*(1+1/x)", False),
    ("factored_completely", "x*(x+1)", True),
])
def test_factoring_checks_take_any_expression(form, written, ok):
    assert answers.grade({"kind": "expr", "value": "x**2+x", "form": form}, written)[0] is ok


class Reader:
    backend = "claude-vision"

    def __init__(self, pid):
        self.pid = pid

    def transcribe(self, photo, context=""):
        probs = [{"number": p["number"], "skipped": False, "final_answer": "1",
                  "lines": [{"text": "1", "sympy": "1", "continues": False, "crossed_out": False, "boxed": True}]}
                 for p in LearnerDB().problems(self.pid)]
        return transcribe.validate({"packet_code": None, "problems": probs, "notes": ""})


def test_one_problem_failing_leaves_the_rest_checked(tmp_path, monkeypatch):
    d = tmp_path / "kid"
    d.mkdir()
    (d / "profile.json").write_text('{"name": "Maya", "course": "elementary", "start": "gK"}')
    real = stepcheck.check

    def flaky(tp, key):
        if tp["number"] == 2:
            raise RuntimeError("the checker could not handle this")
        return real(tp, key)
    monkeypatch.setattr(stepcheck, "check", flaky)
    monkeypatch.setattr(evidence, "gather", lambda *a, **k: {"decision": {
        "misconception": None, "misconception_root": None, "attempts": 1, "crossed_out_runs": 0, "substeps": {},
        "substeps_written_fraction": 1.0, "strategy": "unsure"}})
    with paths.use_learner(d, "elementary"):
        db = LearnerDB()
        pid = flow.next_pages(db, use_jev=False)["packet"]
        photo = tmp_path / "page.jpg"
        photo.write_bytes(b"not read: the transcriber is a stand-in")
        rep = pipeline.process_photo(db, photo, transcriber=Reader(pid), packet=pid, move=False)
        st = {p["number"]: p["status"] for p in rep["problems"]}
        assert st[2] == "not checked" and all(v == "graded" for n, v in st.items() if n != 2)
        assert not db.is_graded(f"{pid}-02") and db.is_graded(f"{pid}-01")
