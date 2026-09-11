# Idempotency & single-instance (Block 0.3)

The agent is a **long-lived single process**: it holds a persistent iMessage
connection plus background timers (proactive follow-ups, the Skyvern fallback
poller). Running two instances against the same line makes both answer the same
message. Two layers keep that from happening:

## Single instance

- `railway.json` pins `deploy.numReplicas = 1`.
- `src/index.ts` takes a `.agent.lock` pidfile and **refuses to start** if another
  live instance holds it (stale pidfiles from a crash are taken over).
- On deploy, Railway replaces the old container; there is a brief window where
  both could be alive. The runtime lock plus the idempotency keys below make that
  window safe: a duplicate delivery is dropped, never double-acted.

## Idempotency keys (a second delivery is a no-op)

| Inbound path | Dedupe key | Where | Durable? |
|---|---|---|---|
| iMessage message | message `id` | `integrations/dedupe.ts` → `processed_message` PK | yes (Supabase) |
| Skyvern fill webhook | `run_id` | `integrations/skyvern.ts` in-flight + delivered sets | no (in-memory) |
| Inbound email webhook | `Message-ID` | `incoming_email.message_id` unique | yes (Supabase) |
| Portal connect finalize | `connection.id` + `status` | `connections/parentPortal.ts` | yes (Supabase) |
| Proactive follow-ups | follow-up `caseId` + daily cap | `agent/followup.ts` | partial |

**Rule for new handlers:** every webhook/queue consumer must derive a stable key
from the payload and check it before acting. A handler that mutates state (sends,
submits, connects, purges) must be safe to run twice.

## Known gap

The Skyvern fill de-dupe is in-memory, so a redeploy mid-fill loses the pending
row (the later webhook is dropped, logged). Persisting pending fills is the
tracked follow-up (`FIX-FORMFILL-STATE.md`).
