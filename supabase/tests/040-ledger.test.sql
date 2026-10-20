-- ledger_entries is append-only, and only parents append. A kid sees only their
-- own rows. 0014 dropped the kid insert path (goal allocations); no policy
-- allows update or delete for anyone.
begin;
\ir helpers/setup.psql

select plan(13);
select tests.seed();

-- A kid ---------------------------------------------------------------------
select tests.act_as(tests.id_of('kid_a1'));

select is(
  (select count(*)::int from chore.ledger_entries),
  2,
  'a kid sees exactly one ledger row: their own');

select is_empty(
  $$ select 1 from chore.ledger_entries where kid_id = tests.id_of('kid_a2') $$,
  'a kid cannot see a sibling''s ledger rows');

select throws_ok(
  $$ insert into chore.ledger_entries (household_id, kid_id, delta_cents, reason)
     values (tests.id_of('house_a'), tests.id_of('kid_a1'), 500, 'parent_adjustment') $$,
  '42501', null,
  'a kid cannot credit themselves');

select throws_ok(
  $$ insert into chore.ledger_entries (household_id, kid_id, delta_cents, reason)
     values (tests.id_of('house_a'), tests.id_of('kid_a1'), -10, 'goal_allocation') $$,
  '42501', null,
  '0014: the old kid goal-allocation insert path is gone');

select is(
  tests.affected_rows($$ update chore.ledger_entries set delta_cents = 99999 where kid_id = tests.id_of('kid_a1') $$),
  0,
  'a kid cannot edit their own ledger row');

select is(
  tests.affected_rows($$ delete from chore.ledger_entries where kid_id = tests.id_of('kid_a1') $$),
  0,
  'a kid cannot delete their own ledger row');

-- A parent ------------------------------------------------------------------
select tests.act_as(tests.id_of('parent_a'));

select is(
  (select count(*)::int from chore.ledger_entries),
  2,
  'a parent sees every ledger row in their household and none from another');

select lives_ok(
  $$ insert into chore.ledger_entries (household_id, kid_id, delta_cents, reason)
     values (tests.id_of('house_a'), tests.id_of('kid_a1'), 50, 'parent_adjustment') $$,
  'a parent can append an adjustment in their household');

select throws_ok(
  $$ insert into chore.ledger_entries (household_id, kid_id, delta_cents, reason)
     values (tests.id_of('house_b'), tests.id_of('kid_b1'), 50, 'parent_adjustment') $$,
  '42501', null,
  'a parent cannot append to another household''s ledger');

select is(
  tests.affected_rows($$ update chore.ledger_entries set delta_cents = 0 $$),
  0,
  'a parent cannot edit ledger rows (append-only)');

select is(
  tests.affected_rows($$ delete from chore.ledger_entries $$),
  0,
  'a parent cannot delete ledger rows (append-only)');

-- The denied writes left the ledger alone ------------------------------------
select tests.reset_actor();

select is(
  (select sum(delta_cents)::int from chore.ledger_entries where kid_id = tests.id_of('kid_a1')),
  150,
  'kid A1''s balance is the seeded 100 plus the parent''s 50');

select is(
  (select count(*)::int from chore.ledger_entries where household_id = tests.id_of('house_a')),
  3,
  'household A has its two seeded rows plus the parent''s one');

select * from finish();
rollback;
