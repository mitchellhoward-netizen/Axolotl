-- Retention support (workstream #5). Run in the Supabase SQL editor.
--
-- docs/PRIVACY-AND-COMPLIANCE.md publishes two windows that a job now enforces:
--   message.created_at        older than 90 days
--   incoming_email.received_at older than 60 days
-- see scripts/prune-retention.ts and docs/RETENTION.md.
--
-- `incoming_email` already has incoming_email_received_idx (received_at desc) from
-- db/email-triage.sql. `message` only has (conversation_id, created_at), which cannot serve a
-- prune that ignores the conversation, so add a bare created_at index or the sweep does a
-- sequential scan over the whole history every night.

create index if not exists message_created_at_idx on message (created_at);

-- Deliberately NOT pruned, and recorded here so nobody "tidies up" the schedule later:
--   consent_event   — the audit trail of what a parent approved, plus the deletion receipts.
--                     It carries ids, counts, dates and action names, never family content.
--   family_inbox    — the forwarding address and its consent; lives as long as the account.
--   guardian / student / family_profile / case_record / family_memory
--                   — these leave via deletion (/reset -> deleteFamilyData), never by ageing
--                     out. A retention sweep must never be the thing that half-deletes a family.
