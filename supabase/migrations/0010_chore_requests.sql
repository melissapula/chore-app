-- ============================================================================
-- Chore App — 0010 kid-initiated chore requests (SPEC §4e, build step 9)
-- A kid pitches a chore ("can raking be a task I can do?"). It's a lightweight
-- proposal the parent turns into a real chore (stamping chore_id back) or
-- declines. Parents get notified of new requests; kids when theirs resolves.
-- ============================================================================

set search_path = chore, public;

create type request_status as enum ('pending', 'approved', 'declined');

create table chore.chore_requests (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references chore.households (id) on delete cascade,
  requested_by  uuid not null references chore.users (id) on delete cascade,
  title         text not null,
  note          text,
  suggested_xp  int,
  status        request_status not null default 'pending',
  resolved_by   uuid references chore.users (id) on delete set null,
  chore_id      uuid references chore.chores (id) on delete set null,
  resolved_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index chore_requests_household_idx
  on chore.chore_requests (household_id);
create index chore_requests_requester_idx
  on chore.chore_requests (requested_by);

alter table chore.chore_requests enable row level security;

-- Kid sees & creates their own; parent sees all and resolves (SPEC §7).
create policy chore_requests_select on chore.chore_requests
  for select using (
    household_id = chore.app_household_id()
    and (chore.app_is_parent() or requested_by = auth.uid())
  );

create policy chore_requests_insert_kid on chore.chore_requests
  for insert with check (
    household_id = chore.app_household_id() and requested_by = auth.uid()
  );

create policy chore_requests_resolve_parent on chore.chore_requests
  for update using (
    household_id = chore.app_household_id() and chore.app_is_parent()
  )
  with check (
    household_id = chore.app_household_id() and chore.app_is_parent()
  );

grant all on chore.chore_requests to anon, authenticated, service_role;
