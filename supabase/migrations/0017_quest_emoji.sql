-- ============================================================================
-- Chore App — 0017 fun quest icons (kid delight)
--
-- Let a kid pick an emoji for what they're saving toward ("🎮 New video game"),
-- so the quest list has a bit of personality. Optional; nullable.
-- ============================================================================

set search_path = chore, public;

alter table chore.quests add column if not exists emoji text;

comment on column chore.quests.emoji is 'Optional fun icon a kid picks for the quest/reward.';
