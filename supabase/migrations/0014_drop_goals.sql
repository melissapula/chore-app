-- ============================================================================
-- Chore App — 0014 drop the dead "goals" model (audit cleanup #13)
--
-- Step 8 replaced the pre-quests "goals" feature with `quests`. The goals table,
-- its FK on ledger_entries, and — importantly — the still-LIVE
-- `ledger_insert_kid_allocation` RLS policy (a kid write-path on the money
-- ledger that nothing uses anymore) were left behind. Remove them.
-- ============================================================================

set search_path = chore, public;

-- Live security surface first: kids could insert goal_allocation ledger rows.
drop policy if exists ledger_insert_kid_allocation on chore.ledger_entries;

-- Dead FK column on the ledger (quests use quest_id).
alter table chore.ledger_entries drop column if exists goal_id;

-- The table itself (cascade drops its goals_select / goals_write_own policies).
drop table if exists chore.goals cascade;

-- The enum only the goals table used.
drop type if exists chore.goal_kind;

-- Note: the 'goal_allocation' value in the ledger_reason enum is intentionally
-- left in place — Postgres can't cleanly drop an enum value, and it's now inert
-- (no policy or code writes it).
