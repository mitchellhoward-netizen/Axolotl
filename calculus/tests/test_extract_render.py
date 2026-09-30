"""Needs the fetched OpenStax source (python -m adaptcalc extract fetches it)."""
import json

from adaptcalc import extract, paths, render


def test_skill_graph_is_complete_and_acyclic():
    doc, mis = extract.build(write=False)
    ids = {s["id"] for s in doc["skills"]}
    assert len(ids) >= 35
    order = doc["topological_order"]
    pos = {s: i for i, s in enumerate(order)}
    for s in doc["skills"]:
        assert all(pos[p] < pos[s["id"]] for p in s["prerequisites"])
        assert s["templates"], s["id"]
        if s["kind"] == "chapter":
            assert s["anchors"] or s["exercised_in"]["count"]
    assert set(mis["misconceptions"]) == ids


def test_committed_json_matches_a_fresh_extraction():
    doc, mis = extract.build(write=False)
    on_disk = json.loads(paths.SKILLS_JSON.read_text())
    assert on_disk["skills"] == json.loads(json.dumps(doc["skills"], ensure_ascii=False))


def test_canonical_section_renders_verbatim():
    mod = next(m for m in extract.load_chapter() if m.number == "2.3")
    ctx = render.Ctx()
    src = render.doc_head("t", "2.3", "T") + render.blocks(mod.blocks, ctx)
    out = render.compile_typst(src, paths.OUT / "test-verbatim-2.3.pdf")
    audit = render.verbatim_audit(out, ctx.runs)
    assert audit["ok"], audit["missing"][:5]
