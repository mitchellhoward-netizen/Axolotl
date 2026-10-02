"""Spoken check-ins: one problem explained out loud, judged, weighed lightly, never a verdict alone."""
import pytest
from fastapi.testclient import TestClient

from adaptcalc import accounts, checkin, flow, paths, web
from adaptcalc.learner import LearnerDB, config
from test_records import practice

H = {"X-Requested-With": "book"}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "LEARNERS", tmp_path / "learners")
    monkeypatch.setattr(paths, "ACCOUNTS_DB", tmp_path / "accounts.db")
    monkeypatch.setattr(paths, "DATA", tmp_path)
    monkeypatch.setenv("ADAPTCALC_ACCESS_CODES", "PILOT-1")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-not-used")
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
    web._RATE.clear()
    flow.ACTIVITY.clear()
    return TestClient(web.app)


def kid(client, wrong=(("k_numerals", 1),)):
    client.post("/api/auth/signup", headers=H, json={"email": "pat@example.com", "password": "correct horse 1",
                                                     "name": "Pat", "code": "PILOT-1"})
    lid = client.post("/api/learners", headers=H, json={"name": "Maya", "grade": "K", "make": False}).json()["id"]
    with paths.use_learner(accounts.learner_dir(lid), "elementary"):
        practice(LearnerDB(), "L1", ["k_count", "k_numerals"], per=2, wrong=set(wrong))
    return lid


def judge(understanding, misconception=""):
    asked = []

    def fake(req, client=None):
        asked.append(req)
        return {"understanding": understanding, "misconception": misconception,
                "note": "Maya counted each one once, touching as she went.", "quote": "I touched each one"}
    fake.asked = asked
    return fake


def test_the_book_asks_about_one_problem_and_weighs_the_answer(client, monkeypatch):
    lid = kid(client, wrong=())
    now = client.get(f"/api/l/{lid}/mybook").json()["now"]
    want = now["checkin"]
    assert want["packet"] == "L1" and "How did you get your answer" in want["ask"] and "Maya" in want["how"]
    fake = judge("explains")
    monkeypatch.setattr(checkin, "_claude", fake)
    with paths.use_learner(accounts.learner_dir(lid), "elementary"):
        skill = LearnerDB().problem(f"L1-{want['number']:02d}")["data"]["skill"]
        before = LearnerDB().mastery()[skill]
    r = client.post(f"/api/l/{lid}/checkin", headers=H,
                    json={"packet": "L1", "said": "I touched each one and said the numbers"}).json()
    assert r["understanding"] == "explains" and r["quote"] == "I touched each one"
    assert "I touched each one and said the numbers" in fake.asked[0] and '"the written answer was right": true' in fake.asked[0]
    with paths.use_learner(accounts.learner_dir(lid), "elementary"):
        after = LearnerDB().mastery()[skill]
        thr = config()["learner"]["mastery_threshold"]
        assert after > before and (before >= thr or after < thr)  # never carried over the line by words alone
    # asked once: the book no longer asks, and a second answer is not weighed again
    assert client.get(f"/api/l/{lid}/mybook").json()["now"]["checkin"] is None
    assert client.post(f"/api/l/{lid}/checkin", headers=H, json={"packet": "L1", "said": "again and again"}).json() == r
    assert len(fake.asked) == 1


def test_a_misunderstanding_never_takes_a_mastered_skill_away(client, monkeypatch):
    lid = kid(client)
    with paths.use_learner(accounts.learner_dir(lid), "elementary"):
        db = LearnerDB()
        db.set_mastery({"k_count": 0.99}, "test", None, source="practice")
        b, a = checkin.weigh(db, "k_count", True, "misconception", "L1-01")
        assert a == b == 0.99
        assert db.conn.execute("SELECT next_review FROM skills WHERE id='k_count'").fetchone()[0]  # back for review soon
        db.set_mastery({"k_numerals": 0.5}, "test", None, source="practice")
        _, a = checkin.weigh(db, "k_numerals", True, "misconception", "L1-03")
        assert a < 0.5
        _, a = checkin.weigh(db, "k_numerals", False, "explains", "L1-04")  # a slip: softened a little
        assert a > 0.425


def test_saying_little_changes_nothing(client, monkeypatch):
    lid = kid(client)
    monkeypatch.setattr(checkin, "_claude", lambda req, client=None: pytest.fail("not asked for so little"))
    with paths.use_learner(accounts.learner_dir(lid), "elementary"):
        db = LearnerDB()
        m = db.mastery()
        want = checkin.pending(db, "L1", "Maya")
        r = checkin.record(db, "L1", want["number"], "um", "Maya")
        assert r["understanding"] == "unclear" and db.mastery() == m


def test_the_scan_page_asks_too(client, monkeypatch):
    lid = kid(client)
    with paths.use_learner(accounts.learner_dir(lid), "elementary"):
        assert checkin.choose(LearnerDB(), "L1")["number"] == 4  # the wrong answer with no reason seen on paper
    a = web.acc()
    sig = flow.sign(a, lid, "L1")
    st = client.get(f"/api/s/{lid}/L1/{sig}").json()
    assert st["checkin"]["packet"] == "L1" and st["checked_in"] is None
    monkeypatch.setattr(checkin, "_claude", judge("procedure_only"))
    r = client.post(f"/api/s/{lid}/L1/{sig}/checkin", headers=H, json={"said": "first I did this then that"}).json()
    assert r["understanding"] == "procedure_only"
    assert client.get(f"/api/s/{lid}/L1/{sig}").json()["checked_in"]["note"]
