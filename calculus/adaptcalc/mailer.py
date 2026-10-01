"""Email through Resend (the same account the Axolotl agent uses).

RESEND_API_KEY and EMAIL_FROM are referenced from the main service on Railway. The book sends as
"Marginalia <the same address>". Without a key, messages are written to DATA/outbox/ instead (for
development and tests), so every flow still works end to end.
"""
from __future__ import annotations

import json
import os
import re
import time
import urllib.request
from email.utils import parseaddr

from . import paths

BRAND = "Marginalia"


def sender() -> str:
    explicit = os.environ.get("MAIL_FROM")
    if explicit:
        return explicit
    _, addr = parseaddr(os.environ.get("EMAIL_FROM", ""))
    return f"{BRAND} <{addr}>" if addr else f"{BRAND} <noreply@example.com>"


def configured() -> bool:
    return bool(os.environ.get("RESEND_API_KEY") and (os.environ.get("EMAIL_FROM") or os.environ.get("MAIL_FROM")))


def outbox():
    return paths.DATA / "outbox"


def send(to: str, subject: str, text: str, html: str | None = None, attachments: list[dict] | None = None) -> dict:
    """Send one email. Returns {"sent": bool, "id": ...}; never raises for delivery problems.
    attachments: [{"filename", "path"}] (files are read and base64-encoded for Resend)."""
    import base64
    from pathlib import Path

    msg = {"from": sender(), "to": [to], "subject": subject, "text": text}
    if html:
        msg["html"] = html
    if attachments:
        msg["attachments"] = [{"filename": x["filename"], "content": base64.b64encode(Path(x["path"]).read_bytes()).decode()}
                              for x in attachments if Path(x["path"]).exists()]
    if not configured():
        outbox().mkdir(parents=True, exist_ok=True)
        f = outbox() / f"{int(time.time() * 1000)}-{re.sub(r'[^a-z0-9]', '_', to.lower())[:40]}.json"
        kept = {k: v for k, v in msg.items() if k != "attachments"}
        if msg.get("attachments"):
            kept["attachments"] = [{"filename": x["filename"], "bytes": len(x["content"]) * 3 // 4} for x in msg["attachments"]]
        f.write_text(json.dumps(kept, indent=1), encoding="utf-8")
        return {"sent": False, "outbox": str(f)}
    req = urllib.request.Request("https://api.resend.com/emails", data=json.dumps(msg).encode(), method="POST",
                                 headers={"Authorization": f"Bearer {os.environ['RESEND_API_KEY']}",
                                          "Content-Type": "application/json", "User-Agent": "marginalia/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return {"sent": True, "id": json.loads(r.read() or b"{}").get("id")}
    except Exception as e:  # noqa: BLE001 - email trouble must not break sign-up or billing
        print(f"email to {to} failed: {e}")
        return {"sent": False, "error": str(e)[:200]}


# ---------------------------------------------------------------------------
# Messages. Plain text first (it is what most mail clients show in previews), with a simple
# HTML version in the book's colors.

def _html(title: str, paras: list[str], button: tuple[str, str] | None = None, foot: str = "") -> str:
    import html as h

    body = "".join(f'<p style="margin:0 0 14px">{p}</p>' for p in paras)
    btn = (f'<p style="margin:22px 0"><a href="{h.escape(button[1])}" style="background:#0d5e6b;color:#fbf7ee;'
           f'padding:11px 18px;text-decoration:none;font-family:Georgia,serif;letter-spacing:.05em">{h.escape(button[0])}</a></p>'
           if button else "")
    return (f'<div style="background:#f3ecdd;padding:28px 12px"><div style="max-width:560px;margin:0 auto;background:#fbf7ee;'
            f'border:1px solid #d9cdb5;padding:28px 30px;font-family:Georgia,serif;color:#27231d;font-size:16px;line-height:1.55">'
            f'<div style="color:#0d5e6b;letter-spacing:.14em;font-size:12px;text-transform:uppercase">❦ {BRAND}</div>'
            f'<h1 style="font-weight:normal;font-size:26px;margin:8px 0 16px">{h.escape(title)}</h1>{body}{btn}'
            f'<p style="color:#8a7f6c;font-size:13px;margin-top:24px">{foot}</p></div></div>')


def welcome(to: str, name: str, base: str) -> dict:
    hi = f"Hello {name}," if name else "Hello,"
    text = (f"{hi}\n\nYour Marginalia account is ready. Add a child (a first name and grade is all it takes) and "
            f"their first pages start being written straight away. Print them, and when your child is done, point your "
            f"phone's camera at the code on the first page. Every step gets checked, and the next pages arrive by email.\n\n"
            f"Open your books: {base}/home\n\nIf you didn't create this account, reply to this email and we'll remove it.")
    html = _html("Your books are ready", [hi, "Your Marginalia account is ready. Add a learner, print the first diagnostic round, "
                 "and send in a photo of the work when it’s done. Every step gets checked, and the next pages are set from what the work shows."],
                 ("Open your books", f"{base}/home"), "If you didn’t create this account, reply and we’ll remove it.")
    return send(to, "Your Marginalia books are ready", text, html)


def reset(to: str, link: str) -> dict:
    text = (f"Someone asked to reset the password for this Marginalia account. If it was you, open this link within an hour:\n\n"
            f"{link}\n\nIf it wasn't you, ignore this email; the password stays the same.")
    html = _html("Reset your password", ["Someone asked to reset the password for this Marginalia account. If it was you, "
                 "choose a new one within the next hour."], ("Choose a new password", link),
                 "If it wasn’t you, ignore this email; the password stays the same.")
    return send(to, "Reset your Marginalia password", text, html)


def receipt_note(to: str, status: str, base: str) -> dict:
    words = {"active": "Your subscription is active. Thank you.",
             "trialing": "Your free trial has started. You won’t be charged until it ends, and you can cancel any time.",
             "canceled": "Your subscription has ended. Your learners’ books stay here; you can restart any time.",
             "past_due": "Your last payment didn’t go through. Update the card to keep making new packets."}
    line = words.get(status, f"Your subscription status is now: {status}.")
    return send(to, "Your Marginalia subscription", f"{line}\n\nManage it here: {base}/home",
                _html("Your subscription", [line], ("Manage billing", f"{base}/home")))


def weekly(to: str, family_name: str, learners: list[dict], base: str) -> dict:
    lines, paras = [], []
    for lr in learners:
        s = (f"{lr['name']} ({lr['course']}): {lr['problems_week']} problems checked this week, "
             f"{lr['correct_week']} correct; {lr['mastered']} of {lr['total']} skills learned.")
        if lr.get("next"):
            s += f" Next up: {lr['next']}."
        if lr.get("mistake"):
            s += f" A mistake that came up more than once: {lr['mistake']}"
        lines.append(s)
        paras.append(s)
    text = "This week in your books:\n\n" + "\n\n".join(lines) + f"\n\nFull reports: {base}/home\n\nTo stop these weekly notes, turn them off on the Learners page."
    html = _html("This week in your books", paras, ("See the full reports", f"{base}/home"),
                 "To stop these weekly notes, turn them off on the Learners page.")
    return send(to, "This week in your Marginalia books", text, html)
