"""Email (password reset, welcome, weekly notes) and Stripe billing, with Stripe simulated."""
import hashlib
import hmac
import json
import time

import pytest
from fastapi.testclient import TestClient

from adaptcalc import accounts, billing, paths, web

H = {"X-Requested-With": "book"}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "LEARNERS", tmp_path / "learners")
    monkeypatch.setattr(paths, "ACCOUNTS_DB", tmp_path / "accounts.db")
    monkeypatch.setattr(paths, "DATA", tmp_path)
    monkeypatch.setenv("ADAPTCALC_ACCESS_CODES", "PILOT-1,COMP-FRIENDS")
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
    monkeypatch.setenv("PUBLIC_URL", "https://book.example")
    web._RATE.clear()
    return TestClient(web.app)


def outbox(tmp_path, wait=True):
    for _ in range(50):
        files = sorted((tmp_path / "outbox").glob("*.json")) if (tmp_path / "outbox").exists() else []
        if files or not wait:
            return [json.loads(f.read_text()) for f in files]
        time.sleep(0.1)
    return []


def signup(c, email="parent@example.com", code="PILOT-1"):
    return c.post("/api/auth/signup", headers=H, json={"email": email, "password": "correct horse 1", "name": "Pat", "code": code})


def test_welcome_and_password_reset(client, tmp_path):
    signup(client)
    mails = outbox(tmp_path)
    assert mails and mails[0]["to"] == ["parent@example.com"] and "ready" in mails[0]["subject"]
    assert mails[0]["from"].startswith("Marginalia <")
    client.post("/api/auth/signout", headers=H)
    # unknown email: same answer, no mail
    n = len(outbox(tmp_path, wait=False))
    assert client.post("/api/auth/forgot", headers=H, json={"email": "nobody@example.com"}).json()["ok"]
    time.sleep(0.3)
    assert len(outbox(tmp_path, wait=False)) == n
    client.post("/api/auth/forgot", headers=H, json={"email": "parent@example.com"})
    for _ in range(50):
        mails = [m for m in outbox(tmp_path) if "Reset" in m["subject"]]
        if mails:
            break
        time.sleep(0.1)
    link = next(w for w in mails[0]["text"].split() if w.startswith("https://book.example/reset?token="))
    token = link.split("token=")[1]
    assert client.post("/api/auth/reset", headers=H, json={"token": token, "password": "short"}).status_code == 400
    assert client.post("/api/auth/reset", headers=H, json={"token": token, "password": "a brand new password"}).status_code == 200
    assert client.get("/api/me").status_code == 200
    assert client.post("/api/auth/reset", headers=H, json={"token": token, "password": "another new password"}).status_code == 400
    client.post("/api/auth/signout", headers=H)
    ok = client.post("/api/auth/signin", headers=H, json={"email": "parent@example.com", "password": "a brand new password"})
    assert ok.status_code == 200


def test_weekly_note_only_in_weeks_with_work(client, tmp_path):
    signup(client)
    lid = client.post("/api/learners", headers=H, json={"name": "Maya", "course": "algebra1"}).json()["id"]
    a = accounts.Accounts()
    assert web.send_weekly(a) == 0  # no work yet
    with paths.use_learner(accounts.learner_dir(lid), "algebra1"):
        from adaptcalc import templates
        from adaptcalc.learner import LearnerDB
        d = LearnerDB()
        d.add_packet("L1", "lesson", None, {})
        p = templates.generate("lin_both_sides.solve", 1).to_json()
        prid = d.add_problem("L1", 1, p)
        d.record_attempt(d.problem(prid) | {"id": prid}, {"correct": True, "credit": 1.0})
    assert web.send_weekly(a) == 1
    note = [m for m in outbox(tmp_path) if "This week" in m["subject"]][0]
    assert "Maya" in note["text"] and "1 problems checked, 1 correct" in note["text"] and "/records" in note["text"]
    assert web.send_weekly(a) == 0  # not again within the week
    client.post("/api/account/weekly", headers=H, json={"on": False})
    assert web.send_weekly(a, force=True) == 0


class FakeStripe:
    def __init__(self):
        self.calls = []
        self.subs = {}

    def __call__(self, method, path, params=None):
        self.calls.append((method, path, params))
        if path == "/products":
            return {"id": "prod_1"}
        if path == "/prices":
            return {"id": "price_1"}
        if path.startswith("/prices/"):
            return {"unit_amount": 2900, "currency": "usd", "recurring": {"interval": "month"}}
        if path == "/webhook_endpoints":
            return {"id": "we_1", "secret": "whsec_test"}
        if path == "/billing_portal/configurations":
            return {"id": "bpc_1"}
        if path == "/checkout/sessions":
            return {"url": "https://checkout.stripe.test/s/1"}
        if path == "/billing_portal/sessions":
            return {"url": "https://billing.stripe.test/p/1"}
        if path.startswith("/subscriptions/"):
            return self.subs[path.split("/")[-1]]
        raise AssertionError(path)


def signed(payload: dict, secret="whsec_test", ts=None):
    body = json.dumps(payload).encode()
    ts = ts or int(time.time())
    sig = hmac.new(secret.encode(), f"{ts}.".encode() + body, hashlib.sha256).hexdigest()
    return body, f"t={ts},v1={sig}"


def test_billing_setup_checkout_webhook_and_gating(client, tmp_path, monkeypatch):
    fake = FakeStripe()
    monkeypatch.setattr(billing, "api", fake)
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_123")
    a = accounts.Accounts()
    out = billing.ensure_setup(a, "https://book.example")
    assert out["created"] == {"price": "price_1", "webhook": "we_1", "portal": "bpc_1"}
    assert billing.ensure_setup(a, "https://book.example")["created"] == {}  # once per key mode
    hook = next(p for m, path, p in fake.calls if path == "/webhook_endpoints")
    assert hook["url"] == "https://book.example/stripe/webhook"

    signup(client)
    me = client.get("/api/me").json()
    assert me["billing"]["enabled"] and not me["billing"]["access"] and me["billing"]["price"] == "$29 a month"
    lid = client.post("/api/learners", headers=H, json={"name": "Sam", "course": "algebra1"}).json()["id"]
    assert client.post(f"/api/l/{lid}/diagnostic/next", headers=H).status_code == 402
    assert client.get(f"/api/l/{lid}/state").status_code == 200  # reading is never gated

    url = client.post("/api/billing/checkout", headers=H).json()["url"]
    assert url.startswith("https://checkout.stripe.test")
    session = next(p for m, path, p in fake.calls if path == "/checkout/sessions")
    fid = me_id = a.family_by("email", "parent@example.com")["id"]
    assert session["client_reference_id"] == fid and session["subscription_data"]["trial_period_days"] == 14

    fake.subs["sub_1"] = {"id": "sub_1", "customer": "cus_1", "status": "trialing", "metadata": {"family": me_id},
                          "current_period_end": int(time.time()) + 14 * 86400}
    body, sig = signed({"type": "checkout.session.completed",
                        "data": {"object": {"client_reference_id": fid, "customer": "cus_1", "subscription": "sub_1"}}})
    assert client.post("/stripe/webhook", content=body, headers={"stripe-signature": sig}).json()["plan"] == "trialing"
    assert client.get("/api/me").json()["billing"]["access"]
    assert client.post(f"/api/l/{lid}/diagnostic/next", headers=H).status_code == 200
    assert client.post("/api/billing/portal", headers=H).json()["url"].startswith("https://billing.stripe.test")

    # a forged or stale event is refused
    body2, _ = signed({"type": "customer.subscription.deleted", "data": {"object": {"id": "sub_1", "customer": "cus_1", "status": "canceled"}}})
    assert client.post("/stripe/webhook", content=body2, headers={"stripe-signature": "t=1,v1=bad"}).status_code == 400
    _, old = signed({"x": 1}, ts=int(time.time()) - 3600)
    assert client.post("/stripe/webhook", content=body2, headers={"stripe-signature": old}).status_code == 400

    body3, sig3 = signed({"type": "customer.subscription.deleted",
                          "data": {"object": {"id": "sub_1", "customer": "cus_1", "status": "canceled", "metadata": {}}}})
    assert client.post("/stripe/webhook", content=body3, headers={"stripe-signature": sig3}).json()["plan"] == "canceled"
    assert not client.get("/api/me").json()["billing"]["access"]
    assert any("subscription" in m["subject"].lower() for m in outbox(tmp_path))


def test_pilot_codes_give_free_access(client, monkeypatch):
    monkeypatch.setattr(billing, "api", FakeStripe())
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_123")
    signup(client, code="COMP-FRIENDS")
    b = client.get("/api/me").json()["billing"]
    assert b["plan"] == "comp" and b["access"]
