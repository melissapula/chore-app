-- Tenant isolation: nobody in household A can read household B's rows in any
-- chore table, and a signed-out (anon) caller reads nothing at all.
--
-- An empty result proves nothing on its own, so this file first checks, as
-- postgres, that B's rows exist, and checks that A's actors do see their own
-- rows (proof that tests.act_as() really signed them in).
begin;
\ir helpers/setup.psql

select plan(43);
select tests.seed();

-- B's rows exist, so the empty results below mean "hidden", not "missing".
select isnt_empty($$ select 1 from chore.households where id = tests.id_of('house_b') $$,
  'seed: household B exists');
select isnt_empty($$ select 1 from chore.users where household_id = tests.id_of('house_b') $$,
  'seed: B has users');
select isnt_empty($$ select 1 from chore.chores where household_id = tests.id_of('house_b') $$,
  'seed: B has chores');
select isnt_empty($$ select 1 from chore.chore_instances where household_id = tests.id_of('house_b') $$,
  'seed: B has chore instances');
select isnt_empty($$ select 1 from chore.ledger_entries where household_id = tests.id_of('house_b') $$,
  'seed: B has ledger entries');
select isnt_empty($$ select 1 from chore.weekly_gates where household_id = tests.id_of('house_b') $$,
  'seed: B has weekly gates');
select isnt_empty($$ select 1 from chore.notes where household_id = tests.id_of('house_b') $$,
  'seed: B has notes');
select isnt_empty($$ select 1 from chore.push_subscriptions where household_id = tests.id_of('house_b') $$,
  'seed: B has push subscriptions');
select isnt_empty($$ select 1 from chore.quests where household_id = tests.id_of('house_b') $$,
  'seed: B has quests');
select isnt_empty($$ select 1 from chore.chore_requests where household_id = tests.id_of('house_b') $$,
  'seed: B has chore requests');

-- A's parent ----------------------------------------------------------------
select tests.act_as(tests.id_of('parent_a'));

select isnt_empty($$ select 1 from chore.households where id = tests.id_of('house_a') $$,
  'parent A sees their own household (actor is signed in)');

select is_empty($$ select 1 from chore.households where id = tests.id_of('house_b') $$,
  'parent A cannot see household B');
select is_empty($$ select 1 from chore.users where household_id = tests.id_of('house_b') $$,
  'parent A cannot see B''s users');
select is_empty($$ select 1 from chore.chores where household_id = tests.id_of('house_b') $$,
  'parent A cannot see B''s chores');
select is_empty($$ select 1 from chore.chore_instances where household_id = tests.id_of('house_b') $$,
  'parent A cannot see B''s chore instances');
select is_empty($$ select 1 from chore.ledger_entries where household_id = tests.id_of('house_b') $$,
  'parent A cannot see B''s ledger entries');
select is_empty($$ select 1 from chore.weekly_gates where household_id = tests.id_of('house_b') $$,
  'parent A cannot see B''s weekly gates');
select is_empty($$ select 1 from chore.notes where household_id = tests.id_of('house_b') $$,
  'parent A cannot see B''s notes');
select is_empty($$ select 1 from chore.push_subscriptions where household_id = tests.id_of('house_b') $$,
  'parent A cannot see B''s push subscriptions');
select is_empty($$ select 1 from chore.quests where household_id = tests.id_of('house_b') $$,
  'parent A cannot see B''s quests');
select is_empty($$ select 1 from chore.chore_requests where household_id = tests.id_of('house_b') $$,
  'parent A cannot see B''s chore requests');

-- A kid in A ----------------------------------------------------------------
select tests.act_as(tests.id_of('kid_a1'));

select isnt_empty($$ select 1 from chore.chores where household_id = tests.id_of('house_a') $$,
  'kid A1 sees their household''s chores (actor is signed in)');
select isnt_empty($$ select 1 from chore.push_subscriptions where user_id = tests.id_of('kid_a1') $$,
  'kid A1 sees their own push subscription');

select is_empty($$ select 1 from chore.households where id = tests.id_of('house_b') $$,
  'kid A1 cannot see household B');
select is_empty($$ select 1 from chore.users where household_id = tests.id_of('house_b') $$,
  'kid A1 cannot see B''s users');
select is_empty($$ select 1 from chore.chores where household_id = tests.id_of('house_b') $$,
  'kid A1 cannot see B''s chores');
select is_empty($$ select 1 from chore.chore_instances where household_id = tests.id_of('house_b') $$,
  'kid A1 cannot see B''s chore instances');
select is_empty($$ select 1 from chore.ledger_entries where household_id = tests.id_of('house_b') $$,
  'kid A1 cannot see B''s ledger entries');
select is_empty($$ select 1 from chore.weekly_gates where household_id = tests.id_of('house_b') $$,
  'kid A1 cannot see B''s weekly gates');
select is_empty($$ select 1 from chore.notes where household_id = tests.id_of('house_b') $$,
  'kid A1 cannot see B''s notes');
select is_empty($$ select 1 from chore.push_subscriptions where household_id = tests.id_of('house_b') $$,
  'kid A1 cannot see B''s push subscriptions');
select is_empty($$ select 1 from chore.quests where household_id = tests.id_of('house_b') $$,
  'kid A1 cannot see B''s quests');
select is_empty($$ select 1 from chore.chore_requests where household_id = tests.id_of('house_b') $$,
  'kid A1 cannot see B''s chore requests');

-- Signed out (anon) ---------------------------------------------------------
-- anon holds table grants (0002), so it reaches the policies and sees nothing
-- because app_household_id() is null without a user.
select tests.act_as_anon();

select is_empty($$ select 1 from chore.households $$, 'anon sees no households');
select is_empty($$ select 1 from chore.users $$, 'anon sees no users');
select is_empty($$ select 1 from chore.chores $$, 'anon sees no chores');
select is_empty($$ select 1 from chore.chore_instances $$, 'anon sees no chore instances');
select is_empty($$ select 1 from chore.ledger_entries $$, 'anon sees no ledger entries');
select is_empty($$ select 1 from chore.weekly_gates $$, 'anon sees no weekly gates');
select is_empty($$ select 1 from chore.notes $$, 'anon sees no notes');
select is_empty($$ select 1 from chore.push_subscriptions $$, 'anon sees no push subscriptions');
select is_empty($$ select 1 from chore.quests $$, 'anon sees no quests');
select is_empty($$ select 1 from chore.chore_requests $$, 'anon sees no chore requests');

select * from finish();
rollback;
