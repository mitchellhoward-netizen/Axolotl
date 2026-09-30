"""Refresh-then-test packets for rusty foundation skills (needs the fetched OpenStax books)."""
from adaptcalc import extract, packets


def _all_new(name, q):
    return {"type": "noul", "noul": 0.05}


def test_foundation_lessons_resolve_to_book_subsections():
    sk = extract.skills()
    for sid, s in sk.items():
        if s["kind"] == "foundation":
            assert s["lesson"], sid
            assert any(a["type"] == "example" for a in s["anchors"]), sid


def test_shaky_foundations_get_a_refresh_before_the_chapter(db, fake_jev):
    # nothing mastered yet: the deepest foundation on the frontier comes first
    focus = packets.choose_refresh(db)
    assert focus and extract.skills()[focus[0]]["kind"] == "foundation"
    assert not set(focus) & {s for s, v in extract.skills().items() if v["kind"] == "chapter"}
    r = packets.next_lesson(db, jev_client=fake_jev(_all_new))
    assert r["kind"] == "refresh" and r["pid"].startswith("R")
    assert r["audit"]["ok"], r["audit"]["missing"][:3]            # canonical text printed verbatim
    assert all(d["accepted"] for d in r["decisions"])            # every generated line passed the gate
    assert len(db.problems(r["pid"])) >= 1


def test_refresh_falls_back_to_the_books_try_it(db, fake_jev):
    def everything_new(name, q):
        return {"type": "noul", "noul": 0.95}                     # Jev rejects every generated snippet
    r = packets.build_refresh(db, ["alg_factor"], jev_client=fake_jev(everything_new))
    assert not any(d["accepted"] for d in r["decisions"])
    probs = db.problems(r["pid"])
    assert probs and all(p["data"].get("canonical_fallback") for p in probs)
