-- chore_instances and chores write rules. C2 (0011): a kid has no direct write
-- path to chore_instances at all (their transitions go through the RPCs, tested
-- separately); only a parent of the same household writes either table.
begin;
\ir helpers/setup.psql

select plan(18);
select tests.seed();

-- A kid ---------------------------------------------------------------------
select tests.act_as(tests.id_of('kid_a1'));

select is(
  tests.affected_rows($$ update chore.chore_instances
                           set state = 'APPROVED', value_cents_snapshot = 999999
                         where id = tests.id_of('inst_a') $$),
  0,
  'C2: a kid cannot update an instance directly (no self-approve, no inflated value)');

select throws_ok(
  $$ insert into chore.chore_instances (household_id, chore_id, state)
     values (tests.id_of('house_a'), tests.id_of('chore_a'), 'OPEN') $$,
  '42501', null,
  'a kid cannot create an instance');

select is(
  tests.affected_rows($$ delete from chore.chore_instances where id = tests.id_of('inst_a') $$),
  0,
  'a kid cannot delete an instance');

select throws_ok(
  $$ insert into chore.chores (household_id, title, chore_type, value_cents)
     values (tests.id_of('house_a'), 'Free money', 'paid', 100000) $$,
  '42501', null,
  'a kid cannot create a chore template');

select is(
  tests.affected_rows($$ update chore.chores set value_cents = 100000 where id = tests.id_of('chore_a') $$),
  0,
  'a kid cannot edit a chore template');

select is(
  tests.affected_rows($$ delete from chore.chores where id = tests.id_of('chore_a') $$),
  0,
  'a kid cannot delete a chore template');

-- Another household's parent -------------------------------------------------
select tests.act_as(tests.id_of('parent_b'));

select is(
  tests.affected_rows($$ update chore.chore_instances set state = 'APPROVED' where id = tests.id_of('inst_a') $$),
  0,
  'a parent cannot update another household''s instance');

select is(
  tests.affected_rows($$ delete from chore.chore_instances where id = tests.id_of('inst_a') $$),
  0,
  'a parent cannot delete another household''s instance');

select is(
  tests.affected_rows($$ update chore.chores set title = 'Hacked' where id = tests.id_of('chore_a') $$),
  0,
  'a parent cannot edit another household''s chore template');

select is(
  tests.affected_rows($$ delete from chore.chores where id = tests.id_of('chore_a') $$),
  0,
  'a parent cannot delete another household''s chore template');

-- The denied writes left the rows alone --------------------------------------
select tests.reset_actor();

select is(
  (select state::text from chore.chore_instances where id = tests.id_of('inst_a')),
  'OPEN',
  'instance A is still OPEN');

select is(
  (select value_cents_snapshot from chore.chore_instances where id = tests.id_of('inst_a')),
  150,
  'instance A still carries its original value');

select is(
  (select title from chore.chores where id = tests.id_of('chore_a')),
  'Rake leaves',
  'chore A is unchanged and not deleted');

select is(
  (select value_cents from chore.chores where id = tests.id_of('chore_a')),
  150,
  'chore A still carries its original value');

-- The household's own parent ------------------------------------------------
select tests.act_as(tests.id_of('parent_a'));

select is(
  tests.affected_rows($$ update chore.chore_instances set value_cents_snapshot = 200 where id = tests.id_of('inst_a') $$),
  1,
  'a parent can update their household''s instance');

select lives_ok(
  $$ insert into chore.chore_instances (household_id, chore_id, state)
     values (tests.id_of('house_a'), tests.id_of('chore_a'), 'OPEN') $$,
  'a parent can create an instance in their household');

select is(
  tests.affected_rows($$ update chore.chores set title = 'Rake all the leaves' where id = tests.id_of('chore_a') $$),
  1,
  'a parent can edit their household''s chore template');

select is(
  tests.affected_rows($$ delete from chore.chore_instances
                          where chore_id = tests.id_of('chore_a') and id <> tests.id_of('inst_a') $$),
  1,
  'a parent can delete an instance in their household');

select * from finish();
rollback;
