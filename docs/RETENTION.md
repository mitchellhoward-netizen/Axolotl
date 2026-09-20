# Retention, review links, and pilot guardrails

Workstreams #5, #6 and #7 of `docs/RELEASE-PLAN.md`. The retention table itself lives in
`docs/PRIVACY-AND-COMPLIANCE.md` §3, which is the published policy; this file is how the system
actually honours it, plus the configuration a human sets before a pilot.

---

## 1. Retention is enforced, not just published (#5)

`docs/PRIVACY-AND-COMPLIANCE.md` publishes a schedule. Until `scripts/prune-retention.ts` existed,
**nothing enforced it** — a published window with no job behind it is a false claim that a parent,
a district, or a regulator can check. The numbers here are the published ones and must not drift
from that file.

| Data | Published window | Enforced by |
|---|---|---|
| Conversation messages (`message.created_at`) | **90 days** | `npm run prune:retention -- --apply` |
| Triaged school email (`incoming_email.received_at`) | **60 days** | same job |
| Application logs | 30 days | host retention (Railway), PII-redacted at write time |
| Browser session recordings | not collected | `BROWSERBASE_RECORD_SESSIONS` is off by default |
| Consent + deletion audit rows | 7 years | **deliberately never pruned** — see §1.2 |
| Family profile, cases, memory, students | while the account is active | leaves via deletion (`/reset`), not by ageing out |

### 1.1 Running it

```bash
npm run prune:retention                 # DRY RUN: prints what would be deleted, changes nothing
npm run prune:retention -- --apply      # actually deletes
npm run prune:retention -- --apply --json
```

**Dry-run is the default.** Retention deletes real family data, so the destructive mode is explicit;
the cron line below carries `--apply`. Requires the service env (`SUPABASE_URL` + a service key), so
on the deployed service that means:

```bash
railway run --service get-axolotl-agent -- npm run prune:retention -- --apply
```

**Cron.** Daily, off-peak, with the output kept:

```cron
17 4 * * *  cd /srv/chuy && railway run --service get-axolotl-agent -- npm run prune:retention -- --apply >> /var/log/axolotl-retention.log 2>&1
```

The job is **idempotent**: it deletes by age, so a second run immediately afterwards deletes 0 rows.
That is also the simplest verification — run it twice and confirm the second run reports zeros.

### 1.2 What it keeps, and why

- **`consent_event` — kept forever (7 years).** It is the audit trail of what a parent approved and
  the record that a deletion happened. It holds ids, counts, dates and action names, **never family
  content**. Deleting it would destroy the evidence that we never acted without consent.
- **`family_inbox`** — the forwarding address and its monitoring consent, which live as long as the
  account does.
- **`guardian`, `student`, `family_profile`, `case_record`, `family_memory`** — these leave through
  **deletion** (`/reset` → `deleteFamilyData`), never by ageing out. A retention sweep must never be
  the thing that half-deletes a family: ageing data out is not the same act as honouring "delete my
  family's data", and mixing them would make both unverifiable.
- **Backups** — encrypted, purged on their own cycle, never restored except for disaster recovery.
- **Provider safety copies** — we cannot delete these; they expire on the provider's window. This is
  disclosed in the privacy policy rather than papered over.

`db/retention.sql` adds the index the sweep needs (`message_created_at_idx`) and records the
never-prune list next to the code, so a later tidy-up cannot silently widen the job.

### 1.3 Verifying it

1. `npm run prune:retention` (dry run) — the counts must be plausible, and the cut-off dates printed
   must be today minus 90 and 60 days.
2. `npm run prune:retention -- --apply`, then run it again: the second run must delete **0** rows.
3. `npm run test:retention` — the predicate at fixed dates (89 kept / 91 deleted, 59 kept / 61
   deleted, and the exact boundary **kept**, because rounding toward keeping data is the safe
   direction).
4. Spot-check in SQL that `consent_event` row count is unchanged.

---

## 2. Review links survive a deploy (#6)

When a Skyvern fill finishes, the vendor hands back a **signed artifact URL** (~24h). We text the
parent our own URL, `${base}/review/<token>`, and the route at `src/integrations/web.ts` resolves the
token and fetches the artifact server-side with our Skyvern key — the key and the signed URL never
reach the thread.

**The bug:** the token→artifact mapping lived **in memory**, so every redeploy broke live links and
the parent was told the preview had "expired" for no reason.

**The fix, and why it is not a database table.** The route resolves tokens **synchronously**
(`const artifactUrl = resolveReviewToken(token)`) and belongs to another workstream, so it must keep
working unchanged. A database read cannot be synchronous, and resolving from a cache filled after
boot leaves a window right after every deploy where a *valid* link reports expired — the exact bug.
So the token now carries its own mapping as **sealed ciphertext** (AES-256-GCM, purpose-bound, via
`src/lib/secret-box.ts`):

- a redeploy cannot break a live link, because nothing needs re-reading;
- **we never store the vendor's signed artifact URL**, so no bearer credential sits in the database,
  a backup, or a replica (a table would have been strictly worse for privacy);
- resolution stays synchronous and cheap, so the route is untouched;
- the expiry travels inside the token, so the honest **410** still fires on time.

**Trade-off, stated plainly:** a review URL is now ~300 characters rather than ~45, because the
sealed payload contains the signed URL. It renders fine in iMessage.

**Degradation:** with no `SECRETS_ENC_KEY` the module falls back to the old memory-only behaviour
(a short token), so a misconfigured environment loses durability instead of losing the screenshot.
It logs one warning per process when that happens.

**Key rotation invalidates outstanding links** (they resolve to nothing and the parent sees the
honest 410). That is correct: a link sealed under a retired key must not resolve. Rotate the key and
expect in-flight previews to need re-sending.

`npm run test:retention` proves the round trip, the restart case (mint → drop all in-memory state →
still resolves), the expiry, a tampered token, a token from an old key, and that the vendor URL is
**not** readable inside the link.

---

## 3. Pilot guardrails (#7) — the configuration a human sets

The guard's behaviour lives in `src/lib/inbound-guard.ts` and is unchanged by this workstream. This
is the release configuration. All values are read lazily from env, so a change needs a restart
(Railway redeploys on a variable change).

| Variable | Pilot value | Default if unset | What it does |
|---|---|---|---|
| `AGENT_ALLOWLIST` | **the pilot numbers**, comma-separated, e.g. `+18315550100,+18315550101` | **unset = the line is OPEN to any number** | Only listed handles get a reply; everyone else is refused with a short polite message and one notice per hour |
| `TESTWORLD_ENABLED` | **`false`** | unset = off | Serves the fake district on the public host for rehearsals. Must be off at launch |
| `INBOUND_PER_MINUTE` | `8` (default is fine) | 8 | Per-sender flood limit |
| `INBOUND_PER_DAY` | `200` (cap per family) | 200 | Per-sender daily ceiling — the per-family cost ceiling |
| `INBOUND_GLOBAL_PER_DAY` | `2000` | 2000 | Whole-line daily ceiling, so one abusive number cannot spend everyone's budget |
| `REQUIRE_VERIFICATION` | leave unset (**on**) | on | Phone ownership proven by code before anything else |
| `REVIEW_LINK_TTL_MS` | leave unset | 24h | Must not exceed the vendor's artifact lifetime |
| `SECRETS_ENC_KEY` | **must be set** | unset | Seals Gmail tokens and review links. Without it, review links lose durability |

Handles are normalised, so `+1 (831) 555-0100` and `+18315550100` are the same number.

**A refused number gets exactly one message per hour**, so the limiter can never become a message
loop. The refusal text mentions STOP, which is the honest thing to offer someone who texted a
number they were not invited to.

**After setting them, verify:**

1. `railway variables --service get-axolotl-agent` shows the intended values (and `SECRETS_ENC_KEY`
   present).
2. Text from a number **not** on the allowlist → refused, and the log line
   `[guard] refused inbound (not_invited)` appears once, not per message.
3. Text from an allowlisted number → onboarding begins normally.
4. `curl -o /dev/null -w '%{http_code}' https://<host>/world/anything` → **404** (the test world is
   off), while `/health/ready` still answers.
5. Send a burst of 10 messages quickly → the 9th is rate-limited with the "give me a moment"
   message, not silence.
6. `npm run prune:retention` (dry run) reports plausible counts — the ceiling values and the prune
   both read the same env, so this also confirms the job can reach the database.

**The open-line decision is the human's** (`docs/RELEASE-PLAN.md` §B.6): until `AGENT_ALLOWLIST` is
populated, anyone who finds the number gets an agent and paid browser sessions. Populate it before
telling anyone the number.
