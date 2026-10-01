import time

import pytest
from fastapi.testclient import TestClient

from adaptcalc import accounts, paths, web

H = {"X-Requested-With": "book"}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "LEARNERS", tmp_path / "learners")
    monkeypatch.setattr(paths, "ACCOUNTS_DB", tmp_path / "accounts.db")
    monkeypatch.setenv("ADAPTCALC_ACCESS_CODES", "PILOT-1")
    web._RATE.clear()  # sign-up is rate limited per address; every test starts fresh
    return TestClient(web.app)


def signup(c, email="parent@example.com", code="PILOT-1"):
    return c.post("/api/auth/signup", headers=H, json={"email": email, "password": "correct horse 1", "name": "Pat", "code": code})


def wait(c, job):
    for _ in range(200):
        j = c.get(f"/api/jobs/{job}").json()
        if j["status"] in ("done", "error"):
            return j
        time.sleep(0.2)
    raise AssertionError("job did not finish")


def test_sign_up_is_rate_limited(client):
    for i in range(5):
        signup(client, email=f"p{i}@example.com")
    assert signup(client, email="p9@example.com").status_code == 429


def test_pages_and_sign_in_required(client):
    assert "The textbook that reads your work" in client.get("/").text
    assert "Privacy notice" in client.get("/privacy").text
    r = client.get("/home", follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == "/signin"
    assert client.get("/api/me").status_code == 401


def test_signup_needs_a_code_and_writes_need_the_header(client):
    assert signup(client, code="WRONG").status_code == 400
    assert client.post("/api/auth/signup", json={"email": "a@b.co", "password": "x" * 12, "code": "PILOT-1"}).status_code == 403
    assert signup(client).status_code == 200
    assert client.get("/api/me").json()["family"]["email"] == "parent@example.com"
    client.post("/api/auth/signout", headers=H)
    assert client.get("/api/me").status_code == 401
    bad = client.post("/api/auth/signin", headers=H, json={"email": "parent@example.com", "password": "nope nope nope"})
    assert bad.status_code == 400
    ok = client.post("/api/auth/signin", headers=H, json={"email": "parent@example.com", "password": "correct horse 1"})
    assert ok.status_code == 200 and client.get("/api/me").status_code == 200


def test_learner_book_diagnostic_and_isolation(client, tmp_path):
    signup(client)
    me = client.get("/api/me").json()
    ids = [c["id"] for c in me["courses"]]
    assert "algebra1" in ids and "calc_limits" not in ids  # personal-study course is not offered to families
    assert client.post("/api/learners", headers=H, json={"name": "Maya", "course": "calc_limits"}).status_code == 400
    lid = client.post("/api/learners", headers=H, json={"name": "Maya", "course": "algebra1", "start": "arithmetic"}).json()["id"]
    s = client.get(f"/api/l/{lid}/state").json()
    assert s["course"]["id"] == "algebra1" and s["diagnostic"]["asked"] == 0 and len(s["skills"]) == 75
    job = client.post(f"/api/l/{lid}/diagnostic/next", headers=H).json()["job"]
    j = wait(client, job)
    assert j["status"] == "done", j
    pdf = client.get(j["result"]["pdf"])
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
    assert (tmp_path / "learners" / lid / "out" / "D1.pdf").exists()
    # another family cannot see this learner
    other = TestClient(web.app)
    signup(other, email="other@example.com")
    assert other.get(f"/api/l/{lid}/state").status_code == 404
    assert other.get(j["result"]["pdf"]).status_code == 404
    assert other.get(f"/api/jobs/{job}").status_code == 404


def test_progress_set_aside_ask_and_delete(client, tmp_path):
    signup(client)
    lid = client.post("/api/learners", headers=H, json={"name": "Sam", "course": "algebra1"}).json()["id"]
    with paths.use_learner(accounts.learner_dir(lid), "algebra1"):
        from adaptcalc.learner import LearnerDB
        LearnerDB().add_packet("L3", "lesson", None, {})
    p = client.get(f"/api/l/{lid}/progress").json()
    assert p["total"] == sum(len(g["skills"]) for g in p["groups"]) and len(p["days"]) == 14
    assert p["groups"][0]["name"].startswith("Chapter 1")
    assert client.post(f"/api/l/{lid}/packets/L3/set-aside", headers=H).json()["status"] == "set_aside"
    assert client.post(f"/api/l/{lid}/packets/L3/set-aside", headers=H).status_code == 409
    assert client.post(f"/api/l/{lid}/ask", headers=H, json={"problem_id": "D9-01", "question": "why?"}).status_code == 404
    assert client.post(f"/api/l/{lid}/ask", headers=H, json={"problem_id": "D9-01", "question": ""}).status_code == 400
    assert client.get("/api/account/export").json()["learners"][0]["name"] == "Sam"
    assert client.post("/api/account/delete", headers=H, json={"password": "correct horse 1", "confirm": "nope"}).status_code == 400
    assert client.post("/api/account/delete", headers=H, json={"password": "correct horse 1", "confirm": "DELETE"}).status_code == 200
    assert not (tmp_path / "learners" / lid).exists()
    assert client.get("/api/me").status_code == 401


def test_daily_limits(client, monkeypatch):
    signup(client)
    lid = client.post("/api/learners", headers=H, json={"name": "Ana", "course": "algebra1"}).json()["id"]
    a = accounts.Accounts()
    for _ in range(3):
        a.use(lid, "questions", 3)
    with pytest.raises(accounts.AuthError):
        a.use(lid, "questions", 3)


def test_passwords_are_hashed_and_sessions_are_not_stored_in_clear(client, tmp_path):
    signup(client)
    import sqlite3
    conn = sqlite3.connect(tmp_path / "accounts.db")
    pw = conn.execute("SELECT pw FROM families").fetchone()[0]
    assert pw.startswith("scrypt$") and "correct horse" not in pw
    tok = client.cookies.get(web.COOKIE)
    assert tok and not conn.execute("SELECT 1 FROM sessions WHERE token_hash=?", (tok,)).fetchone()


def test_phone_photos_are_converted_for_claude(tmp_path):
    import io

    import pillow_heif
    from PIL import Image

    from adaptcalc import transcribe

    pillow_heif.register_heif_opener()
    src = tmp_path / "IMG_0001.HEIC"
    Image.new("RGB", (4032, 3024), "white").save(src)
    media, data = transcribe.prepare_image(src)
    out = Image.open(io.BytesIO(data))
    assert media == "image/jpeg" and out.format == "JPEG"
    assert max(out.size) <= transcribe.MAX_SIDE and len(data) <= transcribe.MAX_BYTES
