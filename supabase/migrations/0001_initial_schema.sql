-- ============================================================================
-- Chore App — 0001 initial schema
-- Multi-tenant family chore tracker. Every table carries household_id for
-- tenant isolation; RLS policies live in 0002_rls_policies.sql.
-- Mirrors SPEC.md §4 (data model). SPEC.md is the source of truth.
-- ============================================================================

create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type user_role       as enum ('parent', 'kid');
create type chore_type      as enum ('paid', 'required');
create type recurrence_kind as enum ('once', 'daily', 'weekly', 'custom');
create type due_kind        as enum ('end_of_day', 'end_of_week');

-- One state enum spanning both flows (SPEC §4, chore_instances.state):
--   paid:     OPEN, CLAIMED, IN_PROGRESS, SUBMITTED, APPROVED
--   required: ASSIGNED, SUBMITTED, CONFIRMED, MISSED
create type instance_state as enum (
  'OPEN', 'CLAIMED', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED',
  'ASSIGNED', 'CONFIRMED', 'MISSED'
);

create type ledger_reason as enum (
  'chore_approved', 'goal_allocation', 'parent_adjustment', 'payout'
);

create type gate_status as enum ('met', 'unmet', 'parent_released', 'parent_held');
create type goal_kind   as enum ('weekly', 'savings');

-- ---------------------------------------------------------------------------
-- households — the tenant boundary
-- ---------------------------------------------------------------------------
create table households (
  id                         uuid primary key default gen_random_uuid(),
  name                       text not null,
  default_start_timer_mins   int  not null default 1440,  -- 24h
  default_finish_timer_mins  int  not null default 120,   -- 2h
  created_at                 timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- users — maps 1:1 to a Supabase Auth user (id = auth.users.id)
-- ---------------------------------------------------------------------------
create table users (
  id            uuid primary key references auth.users (id) on delete cascade,
  household_id  uuid not null references households (id) on delete cascade,
  display_name  text not null,
  role          user_role not null,
  avatar_emoji  text,
  -- kids only; used ONLY to power the risky-chore warning, never to gate eligibility
  birthdate     date,
  created_at    timestamptz not null default now()
);
create index users_household_idx on users (household_id);

-- ---------------------------------------------------------------------------
-- chores — templates. Each occurrence becomes a chore_instance.
-- ---------------------------------------------------------------------------
create table chores (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references households (id) on delete cascade,
  title              text not null,
  icon_emoji         text,
  chore_type         chore_type not null,
  value_cents        int not null default 0,            -- 0 for required
  est_minutes        int,                               -- powers "fastest path" bundles
  category           text,
  recurrence         recurrence_kind not null default 'once',
  recurrence_config  jsonb,                             -- days of week, etc.
  start_timer_mins   int,                               -- null = household default (paid only)
  finish_timer_mins  int,                               -- null = household default (paid only)
  gates_pay          boolean not null default false,    -- required only: holds week's pay if missed
  is_risky           boolean not null default false,    -- soft warning before assigning to a young kid
  assigned_kid_id    uuid references users (id) on delete set null,  -- required: the owning kid
  eligible_kid_ids   uuid[],                            -- paid: which kids may claim; null = all
  due_type           due_kind,                          -- required: end_of_day | end_of_week
  active             boolean not null default true,
  created_at         timestamptz not null default now(),

  -- Guardrails that encode the two flows:
  constraint required_has_value_zero
    check (chore_type <> 'required' or value_cents = 0),
  constraint required_has_assignee
    check (chore_type <> 'required' or assigned_kid_id is not null),
  constraint required_has_due_type
    check (chore_type <> 'required' or due_type is not null)
);
create index chores_household_idx on chores (household_id);
create index chores_assigned_kid_idx on chores (assigned_kid_id);

-- ---------------------------------------------------------------------------
-- chore_instances — the live, claimable / assignable items
-- Timers are STORED DEADLINES (SPEC §4), compared to now() by the cron sweep.
-- ---------------------------------------------------------------------------
create table chore_instances (
  id                   uuid primary key default gen_random_uuid(),
  household_id         uuid not null references households (id) on delete cascade,
  chore_id             uuid not null references chores (id) on delete cascade,
  state                instance_state not null,

  -- paid flow
  claimed_by           uuid references users (id) on delete set null,
  claimed_at           timestamptz,
  start_deadline       timestamptz,   -- claimed_at + start_timer (authoritative)
  started_at           timestamptz,
  finish_deadline      timestamptz,   -- started_at + finish_timer (authoritative)

  -- required flow
  assigned_to          uuid references users (id) on delete set null,
  due_date             timestamptz,   -- end of day/week (authoritative)

  -- shared
  gates_pay            boolean not null default false,  -- snapshot from template
  submitted_at         timestamptz,
  approved_at          timestamptz,   -- approved (paid) / confirmed (required)
  approved_by          uuid references users (id) on delete set null,
  value_cents_snapshot int not null default 0,          -- value locked at creation
  created_at           timestamptz not null default now()
);
create index instances_household_idx  on chore_instances (household_id);
create index instances_chore_idx      on chore_instances (chore_id);
create index instances_state_idx      on chore_instances (state);
create index instances_claimed_by_idx on chore_instances (claimed_by);
create index instances_assigned_idx   on chore_instances (assigned_to);
-- cron sweep hot paths: find expiring deadlines fast
create index instances_start_deadline_idx  on chore_instances (start_deadline)
  where state = 'CLAIMED';
create index instances_finish_deadline_idx on chore_instances (finish_deadline)
  where state = 'IN_PROGRESS';
create index instances_due_date_idx on chore_instances (due_date)
  where state = 'ASSIGNED';

-- ---------------------------------------------------------------------------
-- ledger_entries — append-only. Balance = sum(delta_cents) per kid.
-- ---------------------------------------------------------------------------
create table ledger_entries (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references households (id) on delete cascade,
  kid_id             uuid not null references users (id) on delete cascade,
  delta_cents        int not null,                      -- + earned, - allocation/payout
  reason             ledger_reason not null,
  chore_instance_id  uuid references chore_instances (id) on delete set null,
  goal_id            uuid,                              -- fk added after goals table
  note               text,
  created_at         timestamptz not null default now()
);
create index ledger_household_idx on ledger_entries (household_id);
create index ledger_kid_idx       on ledger_entries (kid_id);

-- ---------------------------------------------------------------------------
-- weekly_gates — one row per kid per week (SPEC §4)
-- ---------------------------------------------------------------------------
create table weekly_gates (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references households (id) on delete cascade,
  kid_id         uuid not null references users (id) on delete cascade,
  week_start     date not null,
  required_total int not null default 0,   -- # of pay-gating required chores that week
  required_done  int not null default 0,   -- # completed
  status         gate_status not null default 'unmet',
  earned_cents   int not null default 0,   -- paid earnings that week (parent's decision view)
  decided_by     uuid references users (id) on delete set null,
  decided_at     timestamptz,
  created_at     timestamptz not null default now(),
  unique (kid_id, week_start)
);
create index weekly_gates_household_idx on weekly_gates (household_id);

-- ---------------------------------------------------------------------------
-- goals — weekly + savings share one table (SPEC §4)
-- ---------------------------------------------------------------------------
create table goals (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references households (id) on delete cascade,
  kid_id           uuid not null references users (id) on delete cascade,
  type             goal_kind not null,
  title            text not null,
  target_cents     int not null,
  deadline         date,
  allocated_cents  int not null default 0,  -- sum of ledger allocations toward this goal
  created_at       timestamptz not null default now()
);
create index goals_household_idx on goals (household_id);
create index goals_kid_idx       on goals (kid_id);

-- deferred fk: ledger_entries.goal_id -> goals.id
alter table ledger_entries
  add constraint ledger_goal_fk
  foreign key (goal_id) references goals (id) on delete set null;

-- ---------------------------------------------------------------------------
-- notes — parent <-> kid thread (SPEC §4)
-- ---------------------------------------------------------------------------
create table notes (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references households (id) on delete cascade,
  chore_instance_id  uuid references chore_instances (id) on delete cascade,
  author_id          uuid not null references users (id) on delete cascade,
  recipient_id       uuid references users (id) on delete set null,
  body               text not null,
  created_at         timestamptz not null default now()
);
create index notes_household_idx on notes (household_id);
create index notes_instance_idx  on notes (chore_instance_id);
