import base64

from fastapi.testclient import TestClient

from adaptcalc import paths, web


def test_state_and_page(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "DB_PATH", tmp_path / "learner.db")
    c = TestClient(web.app)
    assert "Check my work" in c.get("/").text
    s = c.get("/api/state").json()
    assert len(s["skills"]) == 40 and s["diagnostic"]["asked"] == 0
    assert all(0 < k["p"] < 1 for k in s["skills"])
    assert c.get("/packets/..%2Fstate.pdf").status_code == 404


def test_password(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "DB_PATH", tmp_path / "learner.db")
    monkeypatch.setenv("ADAPTCALC_PASSWORD", "limits")
    c = TestClient(web.app)
    assert c.get("/api/state").status_code == 401
    good = base64.b64encode(b"me:limits").decode()
    assert c.get("/api/state", headers={"Authorization": f"Basic {good}"}).status_code == 200


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
