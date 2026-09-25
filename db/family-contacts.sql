-- The people a family relies on for school logistics (src/integrations/family-contacts.ts):
-- grandma, the sitter, a partner, the parents they trade pickups with. The parent adds them;
-- `rank` is their backup order ("Grandma is first on your backup list").
--
-- Axolotl only texts one of these people after the parent approves the exact message with a
-- strict YES (the consent gate in src/agent/steps/executor.ts). Each send opens a relay so
-- the contact's reply reaches the parent instead of being mistaken for a new parent.
create table if not exists family_contact (
  family_id   text not null,
  phone       text not null,           -- E.164, e.g. +15555550142
  name        text not null,           -- what the parent calls them: "Grandma", "Dana"
  relation    text,                    -- grandparent, sitter, partner, parent friend, ...
  rank        integer,                 -- backup order, 1 = first to ask
  created_at  timestamptz not null default now(),
  primary key (family_id, phone)
);

create index if not exists family_contact_family_idx on family_contact (family_id);

-- An open relay: we texted this contact for this family, so their reply goes back to the
-- parent's conversation. One live relay per contact phone; a newer send replaces it.
create table if not exists contact_relay (
  contact_phone    text primary key,
  family_id        text not null,
  conversation_id  text not null,      -- the parent's iMessage conversation (space id)
  line_phone       text,               -- which Axolotl line sent it, for multi-line setups
  contact_name     text not null,
  expires_at       timestamptz not null
);

create index if not exists contact_relay_expires_idx on contact_relay (expires_at);

alter table family_contact enable row level security;
alter table contact_relay enable row level security;
-- No policies: service_role only.
