"""Teaching starts soon: placement stops when the material is clearly new, after two sets at most,
or when the grown-up says so."""
import pytest
from fastapi.testclient import TestClient

from adaptcalc import accounts, flow, paths, web
from adaptcalc.learner import LearnerDB

H = {"X-Requested-With": "book"}


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
    return TestClient(web.app)


def kid(client, grade="3"):
    client.post("/api/auth/signup", headers=H, json={"email": "pat@example.com", "password": "correct horse 1",
                                                     "name": "Pat", "code": "PILOT-1"})
    return client.post("/api/learners", headers=H, json={"name": "Ana", "grade": grade, "make": False}).json()["id"]


def answer_round(db, pid, right):
    for i, p in enumerate(db.problems(pid)):
        ok = i < right
        db.record_attempt(p | {"id": p["id"]}, {"correct": ok, "credit": 1.0 if ok else 0.0, "misconception_root": None})


def test_a_round_of_mostly_skips_starts_the_lessons(client):
    lid = kid(client)
    with paths.use_learner(accounts.learner_dir(lid), "elementary"):
        db = LearnerDB()
        first = flow.next_pages(db, use_jev=False)
        assert first["kind"] == "diagnostic"
        answer_round(db, first["packet"], right=1)  # 1 right, the rest skipped or wrong
        assert flow.placement_settled(db)
        nxt = flow.next_pages(db, use_jev=False)
        assert nxt["kind"] in ("lesson", "refresh")


def test_two_rounds_at_most(client):
    lid = kid(client)
    with paths.use_learner(accounts.learner_dir(lid), "elementary"):
        db = LearnerDB()
        for _ in range(2):
            made = flow.next_pages(db, use_jev=False)
            assert made["kind"] == "diagnostic"
            answer_round(db, made["packet"], right=99)  # all right: placement would otherwise go on
        assert flow.next_pages(db, use_jev=False)["kind"] in ("lesson", "refresh")


def test_start_the_first_lesson_now(client, monkeypatch):
    lid = kid(client)
    monkeypatch.setattr(web, "kick", lambda *a, **k: "job")
    with paths.use_learner(accounts.learner_dir(lid), "elementary"):
        db = LearnerDB()
        pid = flow.next_pages(db, use_jev=False)["packet"]
    now = client.get(f"/api/l/{lid}/mybook").json()["now"]
    assert now["open"]["first_round"] and now["open"]["plan"]["work_from"] == 1
    assert client.post(f"/api/l/{lid}/start-lessons", headers=H).json() == {"job": "job"}
    with paths.use_learner(accounts.learner_dir(lid), "elementary"):
        db = LearnerDB()
        assert db.packet(pid)["status"] == "set_aside" and flow.placement_settled(db)
        lesson = flow.next_pages(db, use_jev=False)
        assert lesson["kind"] in ("lesson", "refresh")
    plan = client.get(f"/api/l/{lid}/mybook").json()["now"]["open"]["plan"]
    assert 1 < plan["work_from"] <= plan["pages"]  # read first, then the practice pages
