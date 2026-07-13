-- ============================================================================
-- ChoreQuest — 0004 avatar_url
-- Lets a user set an uploaded image avatar in addition to (or instead of) the
-- emoji one. Images are downscaled client-side to a small JPEG and stored as a
-- data URL in this text column — fine at family scale (a handful of users, tiny
-- images). Graduate to Supabase Storage later if avatars grow or multiply.
--
-- No RPC change needed: bootstrap_household still sets avatar_emoji; the client
-- writes avatar_url with a normal self-update (RLS users_update already allows
-- id = auth.uid()).
-- ============================================================================

set search_path = chore, public;

alter table chore.users add column if not exists avatar_url text;
