-- ============================================================================
-- Chore App — 0015 gamified chore names (audit #11, SPEC §4)
--
-- SPEC §4: a chore has a plain `title` (canonical — used in lists/search) and an
-- optional `quest_title` (the fun, quest-flavored name kids see; falls back to
-- title). The column was never added, so the gamified name was being stored AS
-- the title and the plain name discarded. Add the column; the app now stores
-- plain→title and gamified→quest_title.
-- ============================================================================

set search_path = chore, public;

alter table chore.chores add column if not exists quest_title text;

comment on column chore.chores.quest_title is
  'Gamified, kid-facing chore name (SPEC §4). Falls back to title when null.';
