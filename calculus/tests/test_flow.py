"""The whole family loop, with the handwriting reader and Jev simulated:
sign up with a child -> first pages made and emailed (with a scan code) -> a phone opens the scan
link without signing in -> photos checked -> the next pages are made by themselves."""
import json
import time

import pytest
from fastapi.testclient import TestClient

from adaptcalc import accounts, evidence, flow, paths, pipeline, transcribe, web

H = {"X-Requested-With": "book"}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "LEARNERS", tmp_path / "learners")
    monkeypatch.setattr(paths, "ACCOUNTS_DB", tmp_path / "accounts.db")
    monkeypatch.setattr(paths, "DATA", tmp_path)
    monkeypatch.setenv("ADAPTCALC_ACCESS_CODES", "PILOT-1")
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
    monkeypatch.setenv("TYPESAFE_API_KEY", "test")  # photo checking "configured"; Jev itself is simulated
    monkeypatch.setenv("PUBLIC_URL", "https://book.example")
    web._RATE.clear()
    flow.ACTIVITY.clear()
    return TestClient(web.app)


class RightAnswers:
    """Reads every problem on the packet as answered correctly (from its key)."""
    backend = "claude-vision"

    def __init__(self, pid):
        self.pid = pid

    def transcribe(self, photo, context=""):
        from adaptcalc.learner import LearnerDB
        from adaptcalc.templates import typ_to_plain

        probs = []
        for p in LearnerDB().problems(self.pid):  # in the job's thread and learner scope
            k = p["data"]["key"]
            ans = k["value"] if k["kind"] == "choice" else typ_to_plain(p["data"]["key_display"])
            probs.append({"number": p["number"], "skipped": False, "final_answer": ans,
                          "lines": [{"text": ans, "sympy": ans, "continues": False, "crossed_out": False, "boxed": True}]})
        return transcribe.validate({"packet_code": None, "problems": probs, "notes": ""})


def wait_idle(client, lid, seconds=120):
    for _ in range(seconds * 5):
        b = client.get(f"/api/l/{lid}/mybook").json()
        if not b["now"]["activity"]:
            return b
        time.sleep(0.2)
    raise AssertionError("still busy")


def test_sign_up_with_a_child_and_the_book_runs_itself(client, tmp_path, monkeypatch):
    r = client.post("/api/auth/signup", headers=H, json={"email": "pat@example.com", "password": "correct horse 1",
                                                         "name": "Pat", "code": "PILOT-1", "child": "Maya", "grade": "2"})
    lid = r.json()["learner"]
    assert lid
    b = wait_idle(client, lid)
    assert b["name"] == "Maya" and b["course"]["id"] == "elementary"
    assert "open" in b["now"], [(j["status"], j["error"], j["result"]) for j in web._JOBS.values()]
    op = b["now"]["open"]
    assert op and op["kind"] == "diagnostic" and op["scan"].startswith("https://book.example/s/")
    imgs = [x for x in b["leaves"] if x["t"] == "img"]
    assert b["leaves"][0]["t"] == "cover" and imgs and b["today"] == b["leaves"].index(imgs[0])
    assert client.get(imgs[0]["src"]).headers["content-type"] == "image/webp"
    # the pages arrived by email, PDF attached, and they carry the scan code instead of "write the code"
    mails = [json.loads(f.read_text()) for f in sorted((tmp_path / "outbox").glob("*.json"))]
    assert any("Maya’s first pages are ready" in m["subject"] and m.get("attachments") for m in mails)
    src = (paths.BUILD / f"{op['packet']}.typ").read_text()
    assert "qr:" in src and "Maya" in src and "Write the code" not in src

    # a phone opens the scan link: no session needed
    phone = TestClient(web.app)
    scan = op["scan"].replace("https://book.example", "")
    _, _, s_lid, pid, sig = scan.split("/")
    assert phone.get(scan).status_code == 200
    st = phone.get(f"/api/s/{s_lid}/{pid}/{sig}").json()
    assert st["name"] == "Maya" and st["status"] == "open"
    assert phone.get(f"/api/s/{s_lid}/{pid}/{'0' * 20}").status_code == 404  # a forged signature opens nothing
    assert phone.get(f"/api/l/{lid}/mybook").status_code == 401           # and the scan link is not a session

    reader = RightAnswers(pid)
    monkeypatch.setattr(transcribe, "default_transcriber", lambda *a, **k: reader)
    monkeypatch.setattr(evidence, "gather", lambda public, tp, check, library, log=None, client=None: {"decision": {
        "misconception": None, "misconception_root": None, "attempts": 1, "crossed_out_runs": 0, "substeps": {},
        "substeps_written_fraction": 1.0, "strategy": next(iter(public["strategies"]))}})
    job = phone.post(f"/api/s/{s_lid}/{pid}/{sig}/photos", headers=H,
                     files={"photo": ("page1.jpg", _jpeg(), "image/jpeg")}).json()["job"]
    for _ in range(300):
        j = phone.get(f"/api/s/{s_lid}/{pid}/{sig}/jobs/{job}").json()
        if j["status"] in ("done", "error"):
            break
        time.sleep(0.2)
    assert j["status"] == "done", j["error"]
    res = j["result"]
    assert res["done"] and res["summary"]["right"] == res["summary"]["problems"]
    # every page checked: the next pages are made without anyone asking
    b = wait_idle(client, lid)
    assert b["now"]["open"]["packet"] != pid
    assert b["now"]["last"]["right"] == res["summary"]["right"]
    kinds = [x["t"] for x in b["leaves"]]
    assert "returned" in kinds and kinds.index("returned") < max(i for i, k in enumerate(kinds) if k == "img")
    ret = next(x for x in b["leaves"] if x["t"] == "returned")
    assert client.get(ret["report"]["photo_url"]).headers["content-type"] == "image/jpeg"
    mails = [json.loads(f.read_text()) for f in sorted((tmp_path / "outbox").glob("*.json"))]
    assert any("Maya’s next pages are ready" in m["subject"] for m in mails)


def test_grade_sets_the_course(client):
    client.post("/api/auth/signup", headers=H, json={"email": "a@example.com", "password": "correct horse 1",
                                                     "name": "A", "code": "PILOT-1"})
    for grade, course in (("K", "elementary"), ("6", "prealgebra"), ("9", "algebra1")):
        lid = client.post("/api/learners", headers=H, json={"name": f"Kid{grade}", "grade": grade, "make": False}).json()["id"]
        assert accounts.Accounts().learner_by_id(lid)["course"] == course


def _jpeg():
    import io

    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (60, 80), "white").save(buf, "JPEG")
    return buf.getvalue()


def test_a_problem_on_another_sheet_is_not_marked_skipped(client, monkeypatch):
    """Found live: a photo of sheet 1 must not record the problems printed on sheet 2 as skipped
    (that closed the set before sheet 2 was sent, and its work was thrown away)."""
    r = client.post("/api/auth/signup", headers=H, json={"email": "q@example.com", "password": "correct horse 1",
                                                         "name": "Q", "code": "PILOT-1", "child": "Ivy", "grade": "3"})
    lid = r.json()["learner"]
    b = wait_idle(client, lid)
    pid = b["now"]["open"]["packet"]
    with paths.use_learner(accounts.learner_dir(lid), "elementary"):
        from adaptcalc.learner import LearnerDB
        n = len(LearnerDB().problems(pid))
    last = n

    class Sheet1(RightAnswers):
        def transcribe(self, photo, context=""):
            doc = super().transcribe(photo, context)
            for p in doc["problems"]:
                if p["number"] == last:  # not in this photo: the reader (wrongly) calls it skipped
                    p.update({"skipped": True, "lines": [], "final_answer": None})
            return doc

    monkeypatch.setattr(pipeline, "problem_pages", lambda pdf: {k: (2 if k == last else 1) for k in range(1, n + 1)})
    monkeypatch.setattr(transcribe, "default_transcriber", lambda *a, **k: Sheet1(pid))
    monkeypatch.setattr(evidence, "gather", lambda public, tp, check, library, log=None, client=None: {"decision": {
        "misconception": None, "misconception_root": None, "attempts": 1, "crossed_out_runs": 0, "substeps": {},
        "substeps_written_fraction": 1.0, "strategy": next(iter(public["strategies"]))}})
    job = client.post(f"/api/l/{lid}/photos?packet={pid}", headers=H, files={"photo": ("s1.jpg", _jpeg(), "image/jpeg")}).json()["job"]
    for _ in range(300):
        j = client.get(f"/api/jobs/{job}").json()
        if j["status"] in ("done", "error"):
            break
        time.sleep(0.2)
    assert j["status"] == "done", j["error"]
    assert not j["result"]["done"] and j["result"]["summary"]["checked"] == n - 1
    assert client.get(f"/api/l/{lid}/mybook").json()["now"]["open"]["packet"] == pid  # still open for sheet 2


def test_problem_pages_reads_the_printed_sheets(tmp_path):
    """The real mapping, from a real set of pages: problems after the work box, by sheet."""
    from adaptcalc import diagnostic, packets
    from adaptcalc.learner import LearnerDB

    with paths.use_learner(tmp_path / "kid", "elementary"):
        db = LearnerDB()
        pid = diagnostic.create_round(db)
        r = packets.render_diagnostic(db, pid)
        where = pipeline.problem_pages(str(r["pdf"]))
        assert sorted(where) == [p["number"] for p in db.problems(pid)]
        assert set(where.values()) <= {1, 2, 3}
