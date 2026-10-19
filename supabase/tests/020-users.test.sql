-- users write rules. C1 (0011): a member can edit their own profile but not
-- their role or household. 0019: nobody inserts a users row directly.
begin;
\ir helpers/setup.psql

select plan(13);
select tests.seed();

-- Signed in to Auth but not in any household yet: the 0019 attacker.
insert into auth.users (id, email, aud, role)
values (tests.id_of('stranger'), 'stranger@pgtap.local', 'authenticated', 'authenticated');

-- A kid on their own row ----------------------------------------------------
select tests.act_as(tests.id_of('kid_a1'));

select throws_ok(
  $$ update chore.users set role = 'parent' where id = tests.id_of('kid_a1') $$,
  '42501', null,
  'C1: a kid cannot promote themselves to parent');

select throws_ok(
  $$ update chore.users set household_id = tests.id_of('house_b') where id = tests.id_of('kid_a1') $$,
  '42501', null,
  'C1: a kid cannot move themselves to another household');

select lives_ok(
  $$ update chore.users set display_name = 'Renamed' where id = tests.id_of('kid_a1') $$,
  'a kid can edit their own display name');

select is(
  (select display_name from chore.users where id = tests.id_of('kid_a1')),
  'Renamed',
  'the kid''s new display name is saved');

select is(
  tests.affected_rows($$ update chore.users set display_name = 'Hacked' where id = tests.id_of('kid_a2') $$),
  0,
  'a kid cannot edit a sibling''s row');

-- No household yet ----------------------------------------------------------
select tests.act_as(tests.id_of('stranger'));

select throws_ok(
  $$ insert into chore.users (id, household_id, display_name, role)
     values (tests.id_of('stranger'), tests.id_of('house_a'), 'Intruder', 'parent') $$,
  '42501', null,
  '0019: a signed-in user cannot insert themselves as a parent of a household');

-- Parents -------------------------------------------------------------------
select tests.act_as(tests.id_of('parent_a'));

select throws_ok(
  $$ update chore.users set household_id = tests.id_of('house_b') where id = tests.id_of('kid_a1') $$,
  '42501', null,
  'a parent cannot move a member to another household');

select lives_ok(
  $$ update chore.users set display_name = 'Renamed by parent' where id = tests.id_of('kid_a1') $$,
  'a parent can edit a member of their own household');

select is(
  (select display_name from chore.users where id = tests.id_of('kid_a1')),
  'Renamed by parent',
  'the parent''s edit is saved');

select tests.act_as(tests.id_of('parent_b'));

select is(
  tests.affected_rows($$ update chore.users set display_name = 'Hacked' where id = tests.id_of('kid_a2') $$),
  0,
  'a parent cannot edit a member of another household');

-- The denied writes left the rows alone --------------------------------------
select tests.reset_actor();

select is(
  (select role::text from chore.users where id = tests.id_of('kid_a1')),
  'kid',
  'kid A1 is still a kid');

select is(
  (select household_id from chore.users where id = tests.id_of('kid_a1')),
  tests.id_of('house_a'),
  'kid A1 is still in household A');

select is(
  (select display_name from chore.users where id = tests.id_of('kid_a2')),
  'Kid A2',
  'kid A2''s name is unchanged');

select * from finish();
rollback;
