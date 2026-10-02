"""Records that keep themselves, notes for the grown-up, where the child starts, chapters finished."""
import pytest
from fastapi.testclient import TestClient

from adaptcalc import accounts, flow, paths, records, templates, web
from adaptcalc.learner import LearnerDB

H = {"X-Requested-With": "book"}
K = ["k_count", "k_numerals", "k_compare", "k_addsub", "k_make10", "k_teens", "k_count100", "k_shapes"]


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


def practice(db, pid, skills, per=4, wrong=()):
    """A lesson set on these skills, every problem checked (right unless listed in `wrong`)."""
    db.add_packet(pid, "lesson", None, {"focus": skills})
    n = 0
    for s in skills:
        tid = templates.for_skill(s)[0].id
        for j in range(per):
            n += 1
            p = templates.generate(tid, 100 * n + j).to_json()
            prid = db.add_problem(pid, n, p)
            right = (s, j) not in wrong
            db.record_attempt(db.problem(prid) | {"id": prid}, {"correct": right, "credit": 1.0 if right else 0.0})


def kid(client, name="Maya", grade="K"):
    client.post("/api/auth/signup", headers=H, json={"email": f"{name.lower()}@example.com", "password": "correct horse 1",
                                                     "name": "Pat", "code": "PILOT-1"})
    return client.post("/api/learners", headers=H, json={"name": name, "grade": grade, "make": False}).json()["id"]


def test_the_record_keeps_itself(client, tmp_path):
    lid = kid(client)
    with paths.use_learner(accounts.learner_dir(lid), "elementary"):
        db = LearnerDB()
        practice(db, "L1", K, per=5)  # every kindergarten skill, learned through lessons
        r = records.build(db, "Maya", records.skill_groups())
        assert r["totals"]["days"] == 1 and r["totals"]["problems"] == 40 and r["totals"]["accuracy"] == 100
        assert r["totals"]["learned"] == 8 and r["totals"]["known"] == 0
        assert r["log"][0]["minutes"] >= 40 * 1.5 and "Count objects to 20" in r["log"][0]["what"]
        assert r["complete"] == ["Kindergarten"] and "completing Kindergarten" in r["summary"]
        assert r["pace"]["current"] == "Grade 1"
        ms = flow.milestones(db)
        assert [m["chapter"] for m in ms] == ["Kindergarten"]
    csv = client.get(f"/l/{lid}/records.csv")
    assert csv.headers["content-type"].startswith("text/csv") and "Date,Subject,Minutes (estimated)" in csv.text
    assert ",Mathematics," in csv.text
    pdf = client.get(f"/l/{lid}/records.pdf")
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
    assert client.get(f"/l/{lid}/certificate/0.pdf").content[:4] == b"%PDF"
    assert client.get(f"/l/{lid}/certificate/1.pdf").status_code == 404
    b = client.get(f"/api/l/{lid}/mybook").json()
    m = next(x for x in b["leaves"] if x["t"] == "milestone")
    assert m["chapter"] == "Kindergarten" and m["certificate"].endswith("/certificate/0.pdf")
    assert client.get(f"/learn/{lid}/records").status_code == 200
    # another family sees none of it
    other = TestClient(web.app)
    other.post("/api/auth/signup", headers=H, json={"email": "o@example.com", "password": "correct horse 1", "name": "O", "code": "PILOT-1"})
    assert other.get(f"/l/{lid}/records.pdf").status_code == 404


def test_known_at_the_start_is_not_counted_as_learned(client):
    lid = kid(client, "Ivy", "2")
    with paths.use_learner(accounts.learner_dir(lid), "elementary"):
        db = LearnerDB()
        db.set_mastery({"k_count": 0.97, "k_numerals": 0.96}, "diagnostic posterior", None, source="diagnostic")
        db.mark_placed({"k_count": 0.97, "k_numerals": 0.96})
        r = records.build(db, "Ivy", records.skill_groups())
        assert r["totals"]["known"] == 2 and r["totals"]["learned"] == 0
        assert not flow.milestones(db)


def test_the_note_for_the_grown_up_comes_from_the_book_and_the_childs_own_mistakes(client):
    lid = kid(client, "Leo", "K")
    with paths.use_learner(accounts.learner_dir(lid), "elementary"):
        db = LearnerDB()
        db.add_packet("L1", "lesson", None, {"focus": ["k_make10"]})
        tid = templates.for_skill("k_make10")[0].id
        db.add_problem("L1", 1, templates.generate(tid, 1).to_json())
        n = flow.teaching_note(db, "L1", "Leo")
        assert n["how"].startswith("Ten is the most important number")  # the book's own note for the grown-up
        assert n["watch"] and not any(w["seen"] for w in n["watch"])
        assert "Make 10" in n["about"] and n["minutes"] >= 10
        # after a mistake of this kind, it is the first thing to watch for
        prid = "L1-01"
        db.record_attempt(db.problem(prid) | {"id": prid}, {"correct": False, "credit": 0.0, "misconception_root": "k_make10",
                                                            "evidence": {"decision": {"misconception": "k_make10.partner_wrong",
                                                                                      "misconception_root": "k_make10"}}})
        n = flow.teaching_note(db, "L1", "Leo")
        assert n["watch"][0]["seen"] and "9 or 11" in n["watch"][0]["text"]
        paras = flow.note_text(n, "Leo")
        assert any("Leo did this last time" in p for p in paras)


def test_where_the_child_starts_is_kept_when_the_first_pages_are_done(client):
    lid = kid(client, "Ana", "3")
    with paths.use_learner(accounts.learner_dir(lid), "elementary"):
        db = LearnerDB()
        snap = flow.save_placement(db)
        assert snap["start"] and snap["start"]["section"] and len(snap["chapters"]) == 6
        assert flow.placement()["start"] == snap["start"]
        db.add_packet("L1", "lesson", None, {"focus": [db.frontier()[0]]})
    b = client.get(f"/api/l/{lid}/mybook").json()
    assert any(x["t"] == "placement" for x in b["leaves"])
