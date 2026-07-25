-- ============================================================================
-- Chore App — 0005 kid username (name + PIN login)
-- Kids sign in with a username + PIN instead of email OTP (no inbox needed).
-- The backend admin-creates each kid a real auth.users row with a synthesized
-- email (`<username>@choreq.local`) and a PIN-derived password; the frontend
-- re-derives the same email/password from what the kid types, so we only need
-- to remember the username here. Parents keep their real email + OTP.
--
-- username is nullable (parents have none) and unique per-app, case-insensitive
-- (auth emails are unique anyway, but the friendly lookup keys off this column).
-- ============================================================================

set search_path = chore, public;

alter table chore.users add column username text;

create unique index users_username_key
  on chore.users (lower(username))
  where username is not null;
