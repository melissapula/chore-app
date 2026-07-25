-- ============================================================================
-- Chore App — 0006 household invites (add a co-parent)
-- A second parent joins an existing household with a single-use invite code.
--
-- Why RPCs (not the REST API + RLS): the joining parent is authenticated but has
-- NO chore.users row yet, so RLS helpers (app_household_id / app_is_parent) see
-- them as belonging to nothing — they can't even SELECT the household by code.
-- So joining runs through a SECURITY DEFINER function that validates the code
-- and inserts their users row, exactly like bootstrap_household (migration 0002).
--
-- The code lives on the household, is generated on demand by an existing parent,
-- and is CONSUMED on a successful join (single-use). Regenerating rotates it,
-- which invalidates any outstanding code.
-- ============================================================================

set search_path = chore, public;

alter table chore.households add column join_code text;

-- Codes are unique while set; cleared (null) when consumed or unused.
create unique index households_join_code_key
  on chore.households (join_code)
  where join_code is not null;

-- ---------------------------------------------------------------------------
-- A parent mints (or rotates) their household's invite code. Returns the code.
-- 8 uppercase hex chars — unambiguous (no O/I/L letters) and easy to read aloud.
-- ---------------------------------------------------------------------------
create or replace function chore.regenerate_join_code()
returns text
language plpgsql security definer set search_path = '' as $$
declare
  code text;
begin
  if not chore.app_is_parent() then
    raise exception 'only a parent can create an invite';
  end if;

  code := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));

  update chore.households
     set join_code = code
   where id = chore.app_household_id();

  return code;
end;
$$;

-- ---------------------------------------------------------------------------
-- A signed-in user with no household joins one as a PARENT using a valid code.
-- Mirrors bootstrap_household's chicken-and-egg handling. Single-use: the code
-- is cleared on success.
-- ---------------------------------------------------------------------------
create or replace function chore.join_household(
  invite_code  text,
  display_name text,
  avatar_emoji text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  normalized text;
  target     uuid;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated';
  end if;
  if exists (select 1 from chore.users where id = auth.uid()) then
    raise exception 'user already belongs to a household';
  end if;

  -- Forgive spaces/dashes/case in whatever the parent typed.
  normalized := upper(regexp_replace(invite_code, '[^a-zA-Z0-9]', '', 'g'));

  select id into target
    from chore.households
   where join_code = normalized;

  if target is null then
    raise exception 'invalid or expired invite code';
  end if;

  insert into chore.users (id, household_id, display_name, role, avatar_emoji)
  values (auth.uid(), target, display_name, 'parent', avatar_emoji);

  -- Consume the code so it can't be reused.
  update chore.households set join_code = null where id = target;

  return target;
end;
$$;
