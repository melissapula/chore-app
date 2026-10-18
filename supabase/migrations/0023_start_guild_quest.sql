-- ============================================================================
-- Chore App — 0023 atomic guild-quest start
--
-- Starting a guild quest archived the active one and inserted the new one as
-- two PostgREST requests, which are two transactions. If the insert failed
-- after the archive committed, the household was left with no active guild
-- quest. start_guild_quest() does both in one transaction, and takes a
-- per-household advisory lock so two simultaneous starts run one after the
-- other (the second archives the first) instead of the second tripping
-- quests_one_active_guild (0012) with a 409.
--
-- Additive: a new function only, no table changes. Old code never calls it.
-- ============================================================================

set search_path = chore, public;

create or replace function chore.start_guild_quest(
  p_title     text,
  p_reward    text,
  p_target_xp int
) returns chore.quests
language plpgsql security definer set search_path = '' as $$
declare
  q                chore.quests;
  caller_household uuid;
  caller_is_parent boolean;
begin
  select household_id, (role = 'parent')
    into caller_household, caller_is_parent
    from chore.users where id = auth.uid();
  if caller_household is null then
    raise exception 'not a household member';
  end if;
  if not caller_is_parent then
    raise exception 'only a parent can start a guild quest';
  end if;

  -- Taken before the UPDATE: under READ COMMITTED each statement gets a fresh
  -- snapshot, so a start that waited here sees the quest the first one inserted.
  perform pg_advisory_xact_lock(hashtextextended('guild:' || caller_household::text, 0));

  update chore.quests
     set status = 'archived'
   where household_id = caller_household
     and scope = 'guild'
     and status = 'active';

  insert into chore.quests (household_id, scope, kid_id, title, reward, target_xp, status)
  values (caller_household, 'guild', null, p_title, p_reward, p_target_xp, 'active')
  returning * into q;

  return q;
end;
$$;

grant execute on function chore.start_guild_quest(text, text, int) to authenticated, service_role;
