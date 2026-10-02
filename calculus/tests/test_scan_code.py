"""Pages made before the scan code existed get one when the book is opened."""
import pymupdf
import pytest
from fastapi.testclient import TestClient

from adaptcalc import accounts, flow, paths, render, web
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


def kid(client):
    client.post("/api/auth/signup", headers=H, json={"email": "pat@example.com", "password": "correct horse 1",
                                                     "name": "Pat", "code": "PILOT-1"})
    return client.post("/api/learners", headers=H, json={"name": "Maya", "grade": "K", "make": False}).json()["id"]


def first_page(pdf):
    with pymupdf.open(pdf) as doc:
        return doc[0].get_text(), len(doc[0].get_images())


@pytest.mark.parametrize("kind", ["diagnostic", "lesson"])
def test_old_pages_get_a_scan_code(client, monkeypatch, kind):
    lid = kid(client)
    assert render.SCAN_LINK.get() is None  # made the old way: a code to write, no scan code
    with paths.use_learner(accounts.learner_dir(lid), "elementary"):
        db = LearnerDB()
        if kind == "lesson":
            monkeypatch.setattr(flow.diagnostic, "summary", lambda db: {"asked": 99, "answered": 0})
        made = flow.next_pages(db, use_jev=False)
        pdf = db.packet(made["packet"])["pdf"]
        before, _ = first_page(pdf)
    assert flow.OLD_CODE_BOX in before
    client.get(f"/api/l/{lid}/mybook")
    after, images = first_page(pdf)
    assert flow.OLD_CODE_BOX not in after and "GROWN-UPS" in after.upper() and images >= (0 if kind == "diagnostic" else 1)
    # the problems themselves are unchanged
    gone = set(flow.OLD_CODE_BOX.split()) | {made["packet"]}
    if kind == "diagnostic":  # set again in the current design: the 'write the code' line goes too
        gone |= set("Write the code at the top of every page you photograph.".split())
        assert "Write the code" not in after
    assert set(before.split()) - gone <= set(after.split())
    # and it is done once
    with paths.use_learner(accounts.learner_dir(lid), "elementary"):
        assert not flow.ensure_scan_code(web.acc(), LearnerDB(), "http://x", lid, made["packet"])
