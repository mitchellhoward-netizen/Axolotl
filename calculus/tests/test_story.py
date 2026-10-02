"""The story through the book: written for the child, printed under the heading, never carrying math."""
import pytest
from fastapi.testclient import TestClient

from adaptcalc import accounts, flow, paths, render, story, web
from adaptcalc.learner import LearnerDB

H = {"X-Requested-With": "book"}

PART = {"story_title": "Maya and the Lighthouse", "premise": "Maya keeps a lighthouse with her dog Biscuit.",
        "part_title": "The Storm Is Coming",
        "paragraphs": ["Maya and Biscuit climbed the lighthouse stairs. The sky was dark and the sea was loud.",
                       "Little boats were heading home. Maya had to count them carefully, so nobody would be left out in the storm.",
                       "Biscuit barked at the window. Something was glowing far out on the water. What could it be?"]}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "LEARNERS", tmp_path / "learners")
    monkeypatch.setattr(paths, "ACCOUNTS_DB", tmp_path / "accounts.db")
    monkeypatch.setattr(paths, "DATA", tmp_path)
    monkeypatch.setenv("ADAPTCALC_ACCESS_CODES", "PILOT-1")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-not-used")  # the model is replaced below
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
    web._RATE.clear()
    flow.ACTIVITY.clear()
    return TestClient(web.app)


def kid(client, loves="the sea and our dog Biscuit"):
    client.post("/api/auth/signup", headers=H, json={"email": "pat@example.com", "password": "correct horse 1",
                                                     "name": "Pat", "code": "PILOT-1"})
    return client.post("/api/learners", headers=H, json={"name": "Maya", "grade": "K", "make": False,
                                                         "loves": loves}).json()["id"]


def make_pages(lid):
    told = render.STORY.set(story.for_pages)
    try:
        with paths.use_learner(accounts.learner_dir(lid), "elementary"):
            made = flow.next_pages(LearnerDB(), use_jev=False)
            return made, render.pdf_text(paths.OUT / f"{made['packet']}.pdf")
    finally:
        render.STORY.reset(told)


def test_the_pages_open_with_a_story_the_child_is_in(client, monkeypatch):
    asked = []
    monkeypatch.setattr(story, "_claude", lambda req, client=None: asked.append(req) or PART)
    lid = kid(client)
    made, text = make_pages(lid)
    assert "Maya and the Lighthouse" in " ".join(text.split()).title() or "MAYA AND THE LIGHTHOUSE" in text
    assert "count them carefully" in " ".join(text.split())
    assert "READ IT TOGETHER" in text  # kindergarten: read aloud
    assert "the sea and our dog Biscuit" in asked[0] and '"part number": 1' in asked[0]
    with paths.use_learner(accounts.learner_dir(lid), "elementary"):
        assert story.part_for(made["packet"])["n"] == 1
        # the same pages set again reuse their part; the model is not asked twice
        story.write_part(made["packet"], "diagnostic", [])
    assert len(asked) == 1
    now = client.get(f"/api/l/{lid}/mybook").json()["now"]
    assert now["story"]["title"] == "Maya and the Lighthouse" and now["open"]["story"]["title"] == "The Storm Is Coming"


def test_a_story_never_carries_numbers(client, monkeypatch):
    with_numbers = PART | {"paragraphs": ["Maya saw three boats, then two more, so five in all."] + PART["paragraphs"][1:]}
    replies = [with_numbers, PART]
    asked = []
    monkeypatch.setattr(story, "_claude", lambda req, client=None: asked.append(req) or replies.pop(0))
    lid = kid(client)
    made, text = make_pages(lid)
    assert "three boats" not in text and "count them carefully" in " ".join(text.split())
    assert "could not be printed" in asked[1] and '"three"' in asked[1]
    lv = story.LEVELS["young"]
    assert story.problems(PART, lv) == []
    assert any("12" in b for b in story.problems(PART | {"paragraphs": ["There were 12 ships."] * 4}, lv))
    assert story.problems(PART | {"paragraphs": ["Someone came at last."] * 50}, lv)  # far too long


def test_no_story_when_it_fails_or_is_off(client, monkeypatch):
    def broken(req, client=None):
        raise RuntimeError("model unavailable")
    monkeypatch.setattr(story, "_claude", broken)
    lid = kid(client)
    made, text = make_pages(lid)  # the pages are still made
    assert made and "READ IT TOGETHER" not in text
    r = client.post(f"/api/l/{lid}/story", headers=H, json={"on": False, "loves": "  horses   and\nrockets "}).json()
    assert r["on"] is False and r["loves"] == "horses and rockets"
    monkeypatch.setattr(story, "_claude", lambda req, client=None: pytest.fail("story is off"))
    with paths.use_learner(accounts.learner_dir(lid), "elementary"):
        assert story.for_pages("D9", "diagnostic", []) == ""


def test_stories_are_off_unless_the_family_chooses_them(client):
    kid(client)  # gave what the child loves: stories on
    with paths.use_learner(paths.LEARNERS / "x", "elementary"):
        (paths.LEARNERS / "x").mkdir(parents=True, exist_ok=True)
        story.save_profile(name="Sam", course="elementary", start="g3")
        assert not story.enabled()  # the textbook is the content; a story is a choice
        story.save_profile(story=True)
        assert story.enabled()
        story.save_profile(course="algebra1", start="partway")
        assert story.level()["voice"].startswith("for a teenager")
