-- Structural tripwire: every chore table has RLS on, and each table's policy set
-- is pinned by name. Adding or dropping a table or policy fails this file until
-- it is updated on purpose, which is the point (CLAUDE.md, Conventions).
begin;
\ir helpers/setup.psql

select plan(15);

select is_empty(
  $$ select c.relname from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'chore' and c.relkind in ('r', 'p') and not c.relrowsecurity $$,
  'every chore table has row level security enabled'
);

select tables_are('chore', array[
  'households', 'users', 'chores', 'chore_instances', 'ledger_entries',
  'weekly_gates', 'notes', 'push_subscriptions', 'quests', 'chore_requests'
], 'chore has exactly the ten known tables');

select policies_are('chore', 'households',
  array['households_select', 'households_update'],
  'households policies');

-- No insert policy (0019 dropped users_insert_self). users_update split by C1 (0011).
select policies_are('chore', 'users',
  array['users_select', 'users_update_self', 'users_update_parent'],
  'users policies');

select policies_are('chore', 'chores',
  array['chores_select', 'chores_write_parent'],
  'chores policies');

-- instances_update replaced by the parent-only policy (C2, 0011).
select policies_are('chore', 'chore_instances',
  array['instances_select', 'instances_write_parent', 'instances_delete_parent',
        'instances_update_parent'],
  'chore_instances policies');

-- No kid insert (0014 dropped ledger_insert_kid_allocation); no update or delete.
select policies_are('chore', 'ledger_entries',
  array['ledger_select', 'ledger_insert_parent'],
  'ledger_entries policies');

-- No insert policy: release/hold rows are upserted by the service role.
select policies_are('chore', 'weekly_gates',
  array['weekly_gates_select', 'weekly_gates_update_parent'],
  'weekly_gates policies');

select policies_are('chore', 'notes',
  array['notes_select', 'notes_insert'],
  'notes policies');

select policies_are('chore', 'push_subscriptions',
  array['push_subscriptions_own'],
  'push_subscriptions policies');

select policies_are('chore', 'quests',
  array['quests_select', 'quests_kid_own', 'quests_parent_all'],
  'quests policies');

select policies_are('chore', 'chore_requests',
  array['chore_requests_select', 'chore_requests_insert_kid',
        'chore_requests_resolve_parent'],
  'chore_requests policies');

-- The names above could be reused for a looser rule, so pin the commands too.
select is_empty(
  $$ select policyname from pg_catalog.pg_policies
      where schemaname = 'chore' and tablename = 'users' and cmd in ('INSERT', 'ALL') $$,
  'no policy lets anyone insert into users directly'
);

select is_empty(
  $$ select policyname from pg_catalog.pg_policies
      where schemaname = 'chore' and tablename = 'ledger_entries'
        and cmd in ('UPDATE', 'DELETE', 'ALL') $$,
  'no policy lets anyone update or delete ledger entries'
);

select is_empty(
  $$ select policyname from pg_catalog.pg_policies
      where schemaname = 'chore' and tablename = 'weekly_gates' and cmd in ('INSERT', 'ALL') $$,
  'no policy lets anyone insert weekly_gates rows'
);

select * from finish();
rollback;
