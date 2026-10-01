"""Subscriptions through Stripe, set up from one secret key.

Set STRIPE_SECRET_KEY (test or live). On start the app creates, once per key mode, what it needs
and remembers it (accounts settings table):
  - a product "Marginalia family plan" and a monthly price (STRIPE_PRICE_CENTS, default 2900 = $29);
  - a webhook endpoint at <public URL>/stripe/webhook and its signing secret;
  - a customer-portal configuration (update card, see invoices, cancel).
STRIPE_PRICE_ID / STRIPE_WEBHOOK_SECRET override the created ones. TRIAL_DAYS (default 14) is the
free trial for a family's first subscription.

Access: with billing on, a family may make packets and send in work while its subscription is
trialing or active; the owner and pilot families (codes starting COMP-) always may. Reading
the book, keys and reports never needs a subscription.

The Stripe API is called over HTTPS with form-encoded parameters (no SDK). Webhooks are verified
with the Stripe-Signature scheme (HMAC-SHA256 over "<timestamp>.<payload>", 5-minute tolerance).
"""
from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.stripe.com/v1"
EVENTS = ["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated",
          "customer.subscription.deleted", "invoice.payment_failed", "invoice.paid"]
STATUS = {"trialing": "trialing", "active": "active", "past_due": "past_due", "unpaid": "past_due",
          "canceled": "canceled", "incomplete": "none", "incomplete_expired": "none", "paused": "past_due"}


class BillingError(Exception):
    pass


def enabled() -> bool:
    return bool(os.environ.get("STRIPE_SECRET_KEY"))


def mode() -> str:
    return "live" if os.environ.get("STRIPE_SECRET_KEY", "").startswith(("sk_live", "rk_live")) else "test"


def trial_days() -> int:
    return int(os.environ.get("TRIAL_DAYS", "14"))


def _flatten(params: dict, prefix: str = "") -> list[tuple[str, str]]:
    out = []
    for k, v in params.items():
        key = f"{prefix}[{k}]" if prefix else str(k)
        if isinstance(v, dict):
            out += _flatten(v, key)
        elif isinstance(v, (list, tuple)):
            for i, item in enumerate(v):
                if isinstance(item, dict):
                    out += _flatten(item, f"{key}[{i}]")
                else:
                    out.append((f"{key}[{i}]", str(item)))
        elif isinstance(v, bool):
            out.append((key, "true" if v else "false"))
        elif v is not None:
            out.append((key, str(v)))
    return out


def api(method: str, path: str, params: dict | None = None) -> dict:
    """One Stripe API call. Raises BillingError with Stripe's message on failure."""
    data = urllib.parse.urlencode(_flatten(params or {})).encode() if params and method != "GET" else None
    url = API + path + (("?" + urllib.parse.urlencode(_flatten(params))) if params and method == "GET" else "")
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": f"Bearer {os.environ['STRIPE_SECRET_KEY']}", "Stripe-Version": "2024-06-20",
        "Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read()).get("error", {}).get("message", "")
        except Exception:  # noqa: BLE001
            msg = ""
        raise BillingError(f"Stripe: {msg or e.reason}") from e


# ---------------------------------------------------------------------------
# setup

def _key(name: str) -> str:
    return f"stripe_{mode()}_{name}"


def price_id(acc) -> str:
    return os.environ.get("STRIPE_PRICE_ID") or acc.setting(_key("price")) or ""


def webhook_secret(acc) -> str:
    return os.environ.get("STRIPE_WEBHOOK_SECRET") or acc.setting(_key("webhook_secret")) or ""


def ensure_setup(acc, base_url: str | None) -> dict:
    """Create the product/price, the webhook endpoint and the portal configuration if missing."""
    if not enabled():
        return {"enabled": False}
    done = {}
    if not price_id(acc):
        prod = api("POST", "/products", {"name": "Marginalia family plan",
                                         "description": "Every learner in the family: lessons, checked work, reports."})
        price = api("POST", "/prices", {"product": prod["id"], "currency": os.environ.get("STRIPE_CURRENCY", "usd"),
                                        "unit_amount": int(os.environ.get("STRIPE_PRICE_CENTS", "2900")),
                                        "recurring": {"interval": "month"}})
        acc.set_setting(_key("price"), price["id"])
        done["price"] = price["id"]
    if not webhook_secret(acc) and base_url and base_url.startswith("https://"):
        hook = api("POST", "/webhook_endpoints", {"url": f"{base_url}/stripe/webhook", "enabled_events": EVENTS,
                                                  "description": "Marginalia subscriptions"})
        acc.set_setting(_key("webhook_secret"), hook["secret"])
        acc.set_setting(_key("webhook_id"), hook["id"])
        done["webhook"] = hook["id"]
    if not acc.setting(_key("portal")):
        try:
            conf = api("POST", "/billing_portal/configurations", {
                "business_profile": {"headline": "Manage your Marginalia subscription"},
                "features": {"payment_method_update": {"enabled": True}, "invoice_history": {"enabled": True},
                             "subscription_cancel": {"enabled": True, "mode": "at_period_end"},
                             "customer_update": {"enabled": True, "allowed_updates": ["email"]}}})
            acc.set_setting(_key("portal"), conf["id"])
            done["portal"] = conf["id"]
        except BillingError as e:
            print(f"billing portal configuration: {e}")
    return {"enabled": True, "mode": mode(), "created": done}


def price_display(acc) -> str | None:
    """'$29 a month', read once from Stripe and remembered."""
    if not enabled() or not price_id(acc):
        return None
    cached = acc.setting(_key("price_display"))
    if cached:
        return cached
    try:
        p = api("GET", f"/prices/{price_id(acc)}")
        amt = p["unit_amount"] / 100
        cur = {"usd": "$", "eur": "€", "gbp": "£"}.get(p["currency"], p["currency"].upper() + " ")
        txt = f"{cur}{amt:g} a {p['recurring']['interval']}"
        acc.set_setting(_key("price_display"), txt)
        return txt
    except (BillingError, KeyError):
        return None


# ---------------------------------------------------------------------------
# checkout and portal

def checkout_url(acc, fam: dict, base_url: str) -> str:
    params = {"mode": "subscription", "line_items": [{"price": price_id(acc), "quantity": 1}],
              "client_reference_id": fam["id"], "allow_promotion_codes": True,
              "success_url": f"{base_url}/home?billing=done", "cancel_url": f"{base_url}/home?billing=cancel",
              "metadata": {"family": fam["id"]}, "subscription_data": {"metadata": {"family": fam["id"]}}}
    if fam.get("stripe_customer"):
        params["customer"] = fam["stripe_customer"]
    else:
        params["customer_email"] = fam["email"]
    if not fam.get("stripe_subscription") and trial_days() > 0:
        params["subscription_data"]["trial_period_days"] = trial_days()
    return api("POST", "/checkout/sessions", params)["url"]


def portal_url(acc, fam: dict, base_url: str) -> str:
    if not fam.get("stripe_customer"):
        raise BillingError("There is no subscription to manage yet.")
    params = {"customer": fam["stripe_customer"], "return_url": f"{base_url}/home"}
    conf = acc.setting(_key("portal"))
    if conf:
        params["configuration"] = conf
    return api("POST", "/billing_portal/sessions", params)["url"]


# ---------------------------------------------------------------------------
# webhooks

def verify(payload: bytes, header: str, secret: str, tolerance: int = 300, now: float | None = None) -> dict:
    """The event, if the Stripe-Signature header is valid for this payload; else BillingError."""
    if not secret:
        raise BillingError("webhook secret not configured")
    parts = {}
    for item in (header or "").split(","):
        k, _, v = item.strip().partition("=")
        parts.setdefault(k, []).append(v)
    try:
        ts = int(parts["t"][0])
    except (KeyError, ValueError) as e:
        raise BillingError("bad signature header") from e
    expected = hmac.new(secret.encode(), f"{ts}.".encode() + payload, hashlib.sha256).hexdigest()
    if not any(hmac.compare_digest(expected, v) for v in parts.get("v1", [])):
        raise BillingError("signature mismatch")
    if abs((now or time.time()) - ts) > tolerance:
        raise BillingError("signature too old")
    return json.loads(payload)


def _apply_subscription(acc, sub: dict) -> dict | None:
    fid = (sub.get("metadata") or {}).get("family")
    fam = acc.family(fid) if fid else None
    fam = fam or acc.family_by("stripe_customer", sub.get("customer") or "")
    if not fam:
        return None
    plan = STATUS.get(sub.get("status"), "none")
    if fam.get("plan") == "comp":
        plan = "comp"  # a pilot family keeps free access even if it also subscribes
    end = sub.get("current_period_end") or sub.get("trial_end")
    acc.update_family(fam["id"], plan=plan, stripe_customer=sub.get("customer"), stripe_subscription=sub.get("id"),
                      plan_until=dt.datetime.fromtimestamp(end, dt.timezone.utc).isoformat(timespec="seconds") if end else None)
    return acc.family(fam["id"]) | {"_changed": fam.get("plan") != plan}


def handle(acc, event: dict) -> dict:
    """Apply one webhook event to the family it concerns. Returns what changed (for logs/tests)."""
    typ, obj = event.get("type"), (event.get("data") or {}).get("object") or {}
    fam = None
    if typ == "checkout.session.completed":
        fid = obj.get("client_reference_id") or (obj.get("metadata") or {}).get("family")
        if fid and acc.family(fid):
            acc.update_family(fid, stripe_customer=obj.get("customer"), stripe_subscription=obj.get("subscription"))
            if obj.get("subscription"):
                fam = _apply_subscription(acc, api("GET", f"/subscriptions/{obj['subscription']}"))
    elif typ and typ.startswith("customer.subscription."):
        fam = _apply_subscription(acc, obj)
    elif typ == "invoice.payment_failed":
        f = acc.family_by("stripe_customer", obj.get("customer") or "")
        if f and f.get("plan") != "comp":
            acc.update_family(f["id"], plan="past_due")
            fam = acc.family(f["id"]) | {"_changed": f.get("plan") != "past_due"}
    return {"type": typ, "family": fam["id"] if fam else None, "plan": fam["plan"] if fam else None,
            "changed": bool(fam and fam.get("_changed")), "email": fam["email"] if fam else None}
