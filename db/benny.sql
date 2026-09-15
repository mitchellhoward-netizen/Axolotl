-- Apply explicitly to the intended database after review. The app never migrates.
-- Separate from the fictional benefits_lab schema and legacy family stores.
BEGIN;
CREATE SCHEMA IF NOT EXISTS benny;
REVOKE ALL ON SCHEMA benny FROM PUBLIC;
CREATE TABLE IF NOT EXISTS benny.accounts (
  owner text PRIMARY KEY,
  sealed text NOT NULL
);
CREATE TABLE IF NOT EXISTS benny.inbox (
  owner text NOT NULL REFERENCES benny.accounts(owner),
  message_hash text NOT NULL,
  PRIMARY KEY (owner, message_hash)
);
CREATE TABLE IF NOT EXISTS benny.links (
  token_hash text PRIMARY KEY,
  owner text NOT NULL REFERENCES benny.accounts(owner),
  expires_at bigint NOT NULL,
  sealed text NOT NULL
);
CREATE TABLE IF NOT EXISTS benny.documents (
  id uuid PRIMARY KEY,
  owner text NOT NULL REFERENCES benny.accounts(owner),
  sealed text NOT NULL
);
REVOKE ALL ON ALL TABLES IN SCHEMA benny FROM PUBLIC;
ALTER TABLE benny.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE benny.inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE benny.links ENABLE ROW LEVEL SECURITY;
ALTER TABLE benny.documents ENABLE ROW LEVEL SECURITY;
-- No public/client policies. Use a dedicated server role; never expose it to clients.
COMMIT;
