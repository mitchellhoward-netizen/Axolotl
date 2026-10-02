"""Work from the family's own book: read, solved without the child's answer, verified, marked, counted."""
import time

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from adaptcalc import accounts, flow, outside, paths, story, web
from adaptcalc.learner import LearnerDB

H = {"X-Requested-With": "book"}


def line(t, sympy="", boxed=False):
    return {"text": t, "sympy": sympy, "continues": False, "crossed_out": False, "boxed": boxed}


PAGE = {"book": "Saxon Math K", "notes": "", "problems": [
    {"label": "1", "statement": "3 + 4 =", "lines": [line("7", "7", True)], "final_answer": "7", "skipped": False,
     "position": {"x": 0.1, "y": 0.1}},
    {"label": "2", "statement": "9 - 5 =", "lines": [line("3", "3", True)], "final_answer": "3", "skipped": False,
     "position": {"x": 0.1, "y": 0.3}},
    {"label": "3", "statement": "Circle the bigger number: 6 or 9", "lines": [line("9")], "final_answer": "9",
     "skipped": False, "position": {"x": 0.1, "y": 0.5}},
    {"label": "4", "statement": "Ten and 4 more is", "lines": [line("14")], "final_answer": "14", "skipped": False,
     "position": {"x": 0.1, "y": 0.7}},
    {"label": "5", "statement": "What time does the clock show? [a clock at 3 o'clock]", "lines": [line("3 o'clock")],
     "final_answer": "3 o'clock", "skipped": False, "position": {"x": 0.1, "y": 0.9}},
]}


def sol(label, skill, kind, answer, check="", sure=True, var=""):
    return {"label": label, "skill": skill, "kind": kind, "answer": answer, "check": check, "var": var, "sure": sure}


FIRST = {"1": sol("1", "k_addsub", "value", "7", "3 + 4"),
         "2": sol("2", "k_addsub", "value", "4", "9 - 5"),
         "3": sol("3", "k_compare", "choice", "9"),
         "4": sol("4", "k_teens", "value", "15", "10 + 4"),   # a wrong answer that SymPy catches: never used
         "5": sol("5", "other", "choice", "3 o'clock")}
SECOND = {"3": sol("3", "k_compare", "choice", "9"), "4": sol("4", "k_teens", "value", "14"),
          "5": sol("5", "other", "choice", "3 o’clock")}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "LEARNERS", tmp_path / "learners")
    monkeypatch.setattr(paths, "ACCOUNTS_DB", tmp_path / "accounts.db")
    monkeypatch.setattr(paths, "DATA", tmp_path)
    monkeypatch.setenv("ADAPTCALC_ACCESS_CODES", "PILOT-1")
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
    web._RATE.clear()
    flow.ACTIVITY.clear()
    calls = []
    monkeypatch.setattr(outside, "read_page", lambda photo, client=None: PAGE)
    monkeypatch.setattr(outside, "solve", lambda st, client=None: (calls.append([s["label"] for s in st]),
                                                                    FIRST if len(calls) == 1 else SECOND)[1])
    c = TestClient(web.app)
    c.calls = calls
    return c


def kid(client, book=""):
    client.post("/api/auth/signup", headers=H, json={"email": "pat@example.com", "password": "correct horse 1",
                                                     "name": "Pat", "code": "PILOT-1"})
    return client.post("/api/learners", headers=H, json={"name": "Maya", "grade": "K", "make": False,
                                                         "book": book}).json()["id"]


def photo(tmp_path):
    f = tmp_path / "page.jpg"
    Image.new("RGB", (850, 1100), "white").save(f)
    return f


def test_a_page_from_their_own_book_is_checked_and_counted(client, tmp_path):
    lid = kid(client, "Saxon Math K")
    with paths.use_learner(accounts.learner_dir(lid), "elementary"):
        db = LearnerDB()
        rep = outside.check_page(db, photo(tmp_path))
        st = {p["label"]: p for p in rep["problems"]}
        assert st["1"]["status"] == "graded" and st["1"]["correct"] and st["1"]["how"] == "computed"
        assert st["2"]["status"] == "graded" and not st["2"]["correct"]
        assert st["3"]["correct"] and st["3"]["how"] == "solved twice"
        assert st["4"]["status"] == "not checked"  # the model's answer disagreed with the arithmetic
        assert st["5"]["status"] == "graded" and st["5"]["counted"] is False  # not this course: marked only
        # the child's work was never part of what was solved; only unsure problems were solved again
        assert client.calls == [["1", "2", "3", "4", "5"], ["3", "4", "5"]]
        att = db.attempts("outside")
        assert sorted(a["pdata"]["skill"] for a in att) == ["k_addsub", "k_addsub", "k_compare"]
        assert db.packet("B1")["status"] == "graded" and not db.open_packet()
        assert outside.gaps(db) == ["k_addsub"]
    b = client.get(f"/api/l/{lid}/mybook").json()
    marked = next(x for x in b["leaves"] if x["t"] == "marked" and x["packet"] == "B1")
    assert {m["n"]: m["v"] for m in marked["marks"]} == {1: "yes", 2: "no", 3: "yes", 5: "yes"}
    ret = next(x for x in b["leaves"] if x["t"] == "returned" and x["packet"] == "B1")["report"]
    assert ret["outside"] and ret["book"] == "Saxon Math K"
    assert next(p for p in ret["problems"] if p["number"] == 4)["status"] == "not checked"
    assert b["now"]["book"] == {"main": "own", "title": "Saxon Math K"}
    # the records count it
    r = client.get(f"/api/l/{lid}/records").json()
    assert r["totals"]["problems"] == 3 and r["totals"]["right"] == 2


def test_when_their_book_is_the_main_book_our_pages_only_fill_gaps(client, tmp_path, monkeypatch):
    lid = kid(client, "Saxon Math K")
    full = {"asked": 99, "answered": 0}
    monkeypatch.setattr(flow.diagnostic, "summary", lambda db: full)
    with paths.use_learner(accounts.learner_dir(lid), "elementary"):
        db = LearnerDB()
        assert flow.next_pages(db, use_jev=False) is None  # nothing shaky yet: no pages
        outside.check_page(db, photo(tmp_path))
        made = flow.next_pages(db, use_jev=False)
        assert made["kind"] == "refresh" and db.packet(made["packet"])["kind"] == "refresh"
        assert "k_addsub" in db.packet(made["packet"])["meta"]


def test_choosing_the_book(client):
    lid = kid(client)
    assert client.get(f"/api/l/{lid}/mybook").json()["now"]["book"] == {"main": "ours", "title": ""}
    r = client.post(f"/api/l/{lid}/book", headers=H, json={"main": "own", "book": "  Singapore   3A "}).json()
    assert r == {"main": "own", "title": "Singapore 3A"}
    with paths.use_learner(accounts.learner_dir(lid), "elementary"):
        assert outside.own_book() and story.profile()["book"] == "Singapore 3A"
    assert client.post(f"/api/l/{lid}/book", headers=H, json={"main": "ours"}).json()["main"] == "ours"


def test_the_upload_endpoint(client, tmp_path, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-not-used")
    lid = kid(client)
    with open(photo(tmp_path), "rb") as f:
        r = client.post(f"/api/l/{lid}/outside", headers=H, files={"photo": ("page.jpg", f, "image/jpeg")})
    assert r.status_code == 200, r.text
    jid = r.json()["job"]
    for _ in range(100):
        j = client.get(f"/api/jobs/{jid}", headers=H).json()
        if j["status"] in ("done", "error"):
            break
        time.sleep(0.1)
    assert j["status"] == "done", j
    assert sum(1 for p in j["result"]["problems"] if p["status"] == "graded") == 4
