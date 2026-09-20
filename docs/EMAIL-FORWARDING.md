# Forwarding school email to Axolotl — setup and verification

This is what makes the product's core promise real: a parent forwards school mail to their own
address, and it becomes one short list of work instead of a firehose. Without this, the triage
pipeline is unreachable by a real parent.

## How it works

```
parent forwards school mail
        │
        ▼
<local-part>@<INBOUND_DOMAIN>          ← one address per family, issued at onboarding
        │
        ▼  your inbound provider POSTs the parsed message as JSON
POST /webhooks/inbound-email           ← header: x-inbound-secret
        │
        ├─ verify secret (timing-safe; FAILS CLOSED when unset)  → 401
        ├─ ACK 200 immediately, triage in the background
        │
        ▼
handleInboundEmail
        ├─ resolve the family by the address's local part   → dropped 'unknown recipient'
        ├─ guard: monitoring consent, sender-domain allowlist, SPF/DKIM/DMARC
        ├─ dedupe on Message-ID (a retry is a no-op)
        ├─ classify: summary + action_type + urgency + deadline + needs_action
        └─ store the SUMMARY only — never the raw body, never logged
                │
                ├─ urgency=now → surfaced immediately
                └─ everything else → batched into one digest ("do 1")
```

## What a human sets up

1. **A subdomain for per-family addresses.** Use a dedicated subdomain (`in.yourdomain.com`) rather
   than the apex, so a misconfiguration cannot affect normal mail. This becomes `INBOUND_DOMAIN`.
   It must be a domain you control and can receive on.

2. **An inbound email provider that can POST JSON.** Anything that gives you an inbound webhook
   works (Cloudflare Email Workers, Postmark inbound, SendGrid inbound parse, Mailgun routes, a
   small worker of your own). It must:
   - receive mail for the **entire** `INBOUND_DOMAIN` (a catch-all, because addresses are generated
     per family);
   - POST to `https://<your-host>/webhooks/inbound-email` with the header
     `x-inbound-secret: <the shared secret>`;
   - send a JSON body with these fields:

   | Field | Required | Notes |
   |---|---|---|
   | `to` | yes | The full forwarded-to address. The local part identifies the family. |
   | `from` | yes | Used for the sender-domain allowlist. |
   | `subject`, `text` | at least one | `html` is accepted and stripped if `text` is absent. |
   | `message_id` | strongly recommended | The idempotency key. Without it, a provider retry can duplicate. |
   | `auth_results` | **yes** | The SPF/DKIM/DMARC verdicts. **If this is missing the guard rejects the message as "auth failed"** — the single most common setup mistake. Pass the `Authentication-Results` header through, or the provider's own verdict fields. |

3. **Set the environment variables on the service:**
   - `INBOUND_DOMAIN` — e.g. `in.yourdomain.com`. **Until this is set, no address is issued at all**;
     provisioning deliberately refuses to invent one, and the onboarding copy stays silent rather
     than handing out an address that would drop everything.
   - `INBOUND_WEBHOOK_SECRET` — a long random string, shared with the provider. **With this unset the
     route fails closed (401 on everything)**, which is the correct default but means nothing arrives.

4. **Nothing else.** The per-family address is provisioned automatically once the family has
   finished onboarding, and the parent is told their address exactly once. The school's sending
   domain is captured during onboarding (we ask what address their school sends from), because the
   sender guard is strict and an empty allowlist means nothing gets through.

## Verifying it end to end

```bash
# 1. The route must fail closed with no secret and reject a wrong one.
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<host>/webhooks/inbound-email   # expect 401
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<host>/webhooks/inbound-email \
  -H 'x-inbound-secret: wrong'                                                          # expect 401

# 2. With the right secret (the shape a provider would send):
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<host>/webhooks/inbound-email \
  -H "x-inbound-secret: $INBOUND_WEBHOOK_SECRET" -H 'content-type: application/json' \
  -d '{"to":"<family-local-part>@<INBOUND_DOMAIN>","from":"office@<school-domain>",
       "subject":"Picture day Thursday","text":"Class photos Thursday morning.",
       "message_id":"<verify-1@you>","auth_results":{"spf":"pass","dkim":"pass","dmarc":"pass"}}'
# expect 200
```

Then check the logs for `[email] triaged <id> (<urgency>)`. A `dropped` line carries the reason —
that is the fastest diagnosis path, because every guard returns a non-throwing status.

**The real test** is a real forward: text the agent, ask for your forwarding address, send a school
email to it, and watch for the digest. The route ACKs before triaging, so a 200 is not proof of
triage — the log line is.

## When it does not work

| Symptom | Cause |
|---|---|
| 401 on everything | `INBOUND_WEBHOOK_SECRET` unset, or the provider sends a different header value |
| `dropped: unknown recipient` | Wrong local part, or the family had not finished onboarding when the address was issued |
| `dropped: sender domain not allowed` | The school's domain is not on the family's allowlist. The parent needs to tell the agent the address their school sends from (onboarding asks). |
| `dropped: auth failed` | `auth_results` missing or not passed through by the provider. We do not accept unauthenticated mail, deliberately. |
| `duplicate` | Expected: the same `message_id` was already triaged. Not an error. |
| No address issued | `INBOUND_DOMAIN` is unset on the deployment. |
| Address issued, nothing arrives | The provider is not catching the whole subdomain (needs a catch-all, not a fixed mailbox). |

## Privacy properties that come with this design

- Only the **summary** and what needs doing are stored. The raw body and HTML are never persisted and
  never logged.
- Sender domains are allowlisted per family, so a random sender cannot inject into the pipeline.
- The route never reveals whether an address exists: unknown recipients and bad secrets produce the
  same shape of response, and the endpoint always answers quickly.
- Triaged summaries are retained **60 days** and then pruned. See `docs/RETENTION.md`.
- The email body is **untrusted data**. The classifier is instructed never to follow instructions
  inside it, and the action layer refuses any recipient or URL that only ever appeared inside a
  message (see `docs/RELEASE-PLAN.md` workstream 4).
