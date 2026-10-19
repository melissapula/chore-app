-- Role rules for the remaining tables: notes, quests, chore_requests,
-- push_subscriptions (incl. the 0020 endpoint CHECK), weekly_gates and
-- households. The seed gives each household one note (parent to kid 1), a
-- personal quest per kid, one guild quest, a request from kid 1, and a push
-- subscription for kid 1.
begin;
\ir helpers/setup.psql

select plan(33);
select tests.seed();

-- notes ---------------------------------------------------------------------
select tests.act_as(tests.id_of('kid_a1'));

select isnt_empty($$ select 1 from chore.notes $$,
  'the note''s recipient can read it');

select tests.act_as(tests.id_of('parent_a'));

select isnt_empty($$ select 1 from chore.notes $$,
  'a parent can read the household''s notes');

select tests.act_as(tests.id_of('kid_a2'));

select is_empty($$ select 1 from chore.notes $$,
  'a sibling who is neither author nor recipient cannot read the note');

select throws_ok(
  $$ insert into chore.notes (household_id, author_id, recipient_id, body)
     values (tests.id_of('house_a'), tests.id_of('kid_a1'), tests.id_of('parent_a'), 'Forged') $$,
  '42501', null,
  'a kid cannot post a note as someone else');

select lives_ok(
  $$ insert into chore.notes (household_id, author_id, recipient_id, body)
     values (tests.id_of('house_a'), tests.id_of('kid_a2'), tests.id_of('parent_a'), 'Done!') $$,
  'a kid can post a note as themselves');

-- quests --------------------------------------------------------------------
select tests.act_as(tests.id_of('kid_a1'));

select is_empty($$ select 1 from chore.quests where id = tests.id_of('quest_a2') $$,
  'a kid cannot see a sibling''s personal quest');

select isnt_empty($$ select 1 from chore.quests where id = tests.id_of('guild_a') $$,
  'a kid can see the household''s guild quest');

select is(
  tests.affected_rows($$ update chore.quests set title = 'Hacked' where id = tests.id_of('guild_a') $$),
  0,
  'a kid cannot edit the guild quest');

select is(
  tests.affected_rows($$ update chore.quests set target_xp = 1 where id = tests.id_of('quest_a2') $$),
  0,
  'a kid cannot edit a sibling''s quest');

select throws_ok(
  $$ insert into chore.quests (household_id, scope, kid_id, title, target_xp)
     values (tests.id_of('house_a'), 'personal', tests.id_of('kid_a2'), 'Planted', 100) $$,
  '42501', null,
  'a kid cannot create a quest for a sibling');

select throws_ok(
  $$ insert into chore.quests (household_id, scope, kid_id, title, target_xp)
     values (tests.id_of('house_a'), 'guild', null, 'Kid-made guild quest', 100) $$,
  '42501', null,
  'a kid cannot create a guild quest');

select lives_ok(
  $$ insert into chore.quests (household_id, scope, kid_id, title, target_xp)
     values (tests.id_of('house_a'), 'personal', tests.id_of('kid_a1'), 'Skateboard', 2000) $$,
  'a kid can create their own personal quest');

-- chore_requests ------------------------------------------------------------
select lives_ok(
  $$ insert into chore.chore_requests (household_id, requested_by, title)
     values (tests.id_of('house_a'), tests.id_of('kid_a1'), 'Walk the dog') $$,
  'a kid can request a chore as themselves');

select throws_ok(
  $$ insert into chore.chore_requests (household_id, requested_by, title)
     values (tests.id_of('house_a'), tests.id_of('kid_a2'), 'Forged request') $$,
  '42501', null,
  'a kid cannot request a chore as a sibling');

select is(
  tests.affected_rows($$ update chore.chore_requests set status = 'approved'
                          where requested_by = tests.id_of('kid_a1') $$),
  0,
  'a kid cannot approve their own request');

-- push_subscriptions --------------------------------------------------------
select throws_ok(
  $$ insert into chore.push_subscriptions (user_id, household_id, endpoint, p256dh, auth)
     values (tests.id_of('kid_a1'), tests.id_of('house_a'), 'https://evil.example/x', 'key', 'secret') $$,
  '23514', null,
  '0020: an endpoint off the known push services is rejected');

select lives_ok(
  $$ insert into chore.push_subscriptions (user_id, household_id, endpoint, p256dh, auth)
     values (tests.id_of('kid_a1'), tests.id_of('house_a'),
             'https://fcm.googleapis.com/fcm/send/kid_a1-tablet', 'key', 'secret') $$,
  'an FCM endpoint is accepted');

select throws_ok(
  $$ insert into chore.push_subscriptions (user_id, household_id, endpoint, p256dh, auth)
     values (tests.id_of('kid_a2'), tests.id_of('house_a'),
             'https://fcm.googleapis.com/fcm/send/planted', 'key', 'secret') $$,
  '42501', null,
  'a user cannot add a push subscription for someone else');

-- weekly_gates (kid) --------------------------------------------------------
select is(
  (select count(*)::int from chore.weekly_gates),
  1,
  'a kid sees only their own weekly gate');

select is(
  tests.affected_rows($$ update chore.weekly_gates set required_done = 99 $$),
  0,
  'a kid cannot edit their weekly gate');

-- households (kid) ----------------------------------------------------------
select is(
  tests.affected_rows($$ update chore.households set default_start_timer_mins = 1 $$),
  0,
  'a kid cannot edit household settings');

-- The parent's side ---------------------------------------------------------
select tests.act_as(tests.id_of('parent_a'));

select is_empty($$ select 1 from chore.push_subscriptions $$,
  'push subscriptions are private to their owner, even from a parent');

select is(
  tests.affected_rows($$ update chore.chore_requests set status = 'declined'
                          where title = 'Wash the car' $$),
  1,
  'a parent can resolve a request in their household');

select throws_ok(
  $$ insert into chore.weekly_gates (household_id, kid_id, week_start)
     values (tests.id_of('house_a'), tests.id_of('kid_a1'), '2026-10-19') $$,
  '42501', null,
  'a parent cannot insert a weekly gate (service role only, by design)');

select is(
  tests.affected_rows($$ update chore.weekly_gates set status = 'parent_released' $$),
  2,
  'a parent can decide every weekly gate in their household');

select is(
  tests.affected_rows($$ update chore.households set name = 'The A Team' where id = tests.id_of('house_a') $$),
  1,
  'a parent can edit their own household');

select is(
  tests.affected_rows($$ update chore.households set name = 'Hacked' where id = tests.id_of('house_b') $$),
  0,
  'a parent cannot edit another household');

-- The denied writes left the rows alone --------------------------------------
select tests.reset_actor();

select is(
  (select title from chore.quests where id = tests.id_of('guild_a')),
  'Pizza night',
  'the guild quest is unchanged');

select is(
  (select target_xp from chore.quests where id = tests.id_of('quest_a2')),
  3000,
  'the sibling''s quest is unchanged');

select is(
  (select status::text from chore.chore_requests where title = 'Walk the dog'),
  'pending',
  'the kid''s own request is still pending');

select is(
  (select required_done from chore.weekly_gates where kid_id = tests.id_of('kid_a1')),
  0,
  'kid A1''s weekly gate count is unchanged');

select is(
  (select default_start_timer_mins from chore.households where id = tests.id_of('house_a')),
  1440,
  'household A''s timer default is unchanged');

select is(
  (select name from chore.households where id = tests.id_of('house_b')),
  'House B',
  'household B is unchanged');

select * from finish();
rollback;
