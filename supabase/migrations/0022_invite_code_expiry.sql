-- ============================================================================
-- Chore App — 0022 invite-code expiry
--
-- A co-parent invite code (0006) was valid until used or rotated, so a code
-- that leaked stayed redeemable indefinitely. Codes now expire 24 hours after
-- they're minted:
--
--   - regenerate_join_code: stamps join_code_expires_at = now() + 24 hours.
--   - join_household: only accepts a code whose expiry is still in the future,
--     and clears both columns when it consumes the code.
--
-- Codes minted before this migration have a null expiry, so they're rejected
-- (intended: the parent mints a new one). The error text is unchanged.
-- Signatures and return types are unchanged, so callers need no update.
-- ============================================================================

set search_path = chore, public;

alter table chore.households add column join_code_expires_at timestamptz;

-- A parent mints (or rotates) their household's invite code. Same as 0006 plus
-- the expiry stamp.
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
     set join_code = code,
         join_code_expires_at = now() + interval '24 hours'
   where id = chore.app_household_id();

  return code;
end;
$$;

-- A signed-in user with no household joins one as a PARENT using a valid code.
-- Same as 0006 plus the expiry check; consuming the code clears its expiry too.
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
   where join_code = normalized
     and join_code_expires_at > now();

  if target is null then
    raise exception 'invalid or expired invite code';
  end if;

  insert into chore.users (id, household_id, display_name, role, avatar_emoji)
  values (auth.uid(), target, display_name, 'parent', avatar_emoji);

  -- Consume the code so it can't be reused.
  update chore.households
     set join_code = null,
         join_code_expires_at = null
   where id = target;

  return target;
end;
$$;
