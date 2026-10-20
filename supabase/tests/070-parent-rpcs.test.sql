-- Parent and onboarding RPCs: approve_paid_instance (H2, 0012), redeem_quest
-- (0012), start_guild_quest (0023), regenerate_join_code / join_household
-- (0022) and bootstrap_household (0002). Error messages are quoted exactly from
-- the function bodies, including the stray space in approve's state message.
begin;
\ir helpers/setup.psql

select plan(46);
select tests.seed();

-- Extra fixtures, as postgres. inst_a and inst_b become SUBMITTED paid work
-- (value 150); req_sub_a is a required instance that reached SUBMITTED, the H2
-- case. newbie, newbie2 and founder are signed-up Auth users with no
-- chore.users row yet, the shape join/bootstrap expect.
update chore.chore_instances
   set state = 'SUBMITTED', claimed_by = tests.id_of('kid_a1'), submitted_at = now()
 where id = tests.id_of('inst_a');
update chore.chore_instances
   set state = 'SUBMITTED', claimed_by = tests.id_of('kid_b1'), submitted_at = now()
 where id = tests.id_of('inst_b');

insert into chore.chores (id, household_id, title, chore_type, assigned_kid_id, due_type)
values (tests.id_of('chore_req_a'), tests.id_of('house_a'), 'Make bed', 'required',
        tests.id_of('kid_a1'), 'end_of_day');

insert into chore.chore_instances
  (id, household_id, chore_id, state, value_cents_snapshot, assigned_to)
values
  (tests.id_of('req_sub_a'),   tests.id_of('house_a'), tests.id_of('chore_req_a'), 'SUBMITTED', 0,
   tests.id_of('kid_a1')),
  (tests.id_of('inst_open_a'), tests.id_of('house_a'), tests.id_of('chore_a'),     'OPEN', 150, null);

insert into auth.users (id, email, aud, role)
select tests.id_of(n), n || '@pgtap.local', 'authenticated', 'authenticated'
  from unnest(array['newbie', 'newbie2', 'founder']) as n;

-- approve_paid_instance ------------------------------------------------------
select tests.act_as_anon();

select throws_ok($$ select chore.approve_paid_instance(tests.id_of('inst_a')) $$,
  'P0001', 'not a household member', 'approve: anon is rejected');

select tests.act_as(tests.id_of('kid_a1'));

select throws_ok($$ select chore.approve_paid_instance(tests.id_of('inst_a')) $$,
  'P0001', 'only a parent can approve', 'approve: a kid cannot approve their own work');

select tests.act_as(tests.id_of('parent_b'));

select throws_ok($$ select chore.approve_paid_instance(tests.id_of('inst_a')) $$,
  'P0001', 'instance belongs to another household',
  'approve: another household''s parent is rejected');

select tests.act_as(tests.id_of('parent_a'));

select throws_ok($$ select chore.approve_paid_instance(tests.id_of('no_such_instance')) $$,
  'P0001', 'instance not found', 'approve: an unknown instance is rejected');
select throws_ok($$ select chore.approve_paid_instance(tests.id_of('req_sub_a')) $$,
  'P0001', 'approve is for paid chores; use confirm for required chores',
  'H2: a SUBMITTED required instance cannot be approved');
select throws_ok($$ select chore.approve_paid_instance(tests.id_of('inst_open_a')) $$,
  'P0001', 'instance is OPEN , expected SUBMITTED', 'approve: a non-SUBMITTED instance is rejected');
select lives_ok($$ select chore.approve_paid_instance(tests.id_of('inst_a')) $$,
  'approve: a parent approves their household''s SUBMITTED paid instance');
select throws_ok($$ select chore.approve_paid_instance(tests.id_of('inst_a')) $$,
  'P0001', 'instance is APPROVED , expected SUBMITTED', 'approve: cannot approve twice');

select tests.reset_actor();

select results_eq(
  $$ select state::text, approved_by from chore.chore_instances where id = tests.id_of('inst_a') $$,
  $$ values ('APPROVED', tests.id_of('parent_a')) $$,
  'approve: the instance is APPROVED by the caller');
select results_eq(
  $$ select kid_id, delta_cents, reason::text from chore.ledger_entries
      where chore_instance_id = tests.id_of('inst_a') $$,
  $$ values (tests.id_of('kid_a1'), 150, 'chore_approved') $$,
  'approve: exactly one ledger credit, to the claimer, for the snapshot value');
select is(
  (select state::text from chore.chore_instances where id = tests.id_of('req_sub_a')),
  'SUBMITTED',
  'H2: the required instance is still SUBMITTED');
select is(
  (select count(*)::int from chore.ledger_entries where chore_instance_id = tests.id_of('req_sub_a')),
  0,
  'H2: no phantom ledger row for the required instance');

-- redeem_quest ---------------------------------------------------------------
-- The seed gives kid_a2 a balance of 200; quest_a2 costs 3000.
select tests.act_as_anon();

select throws_ok($$ select chore.redeem_quest(tests.id_of('quest_a2')) $$,
  'P0001', 'not a household member', 'redeem: anon is rejected');

select tests.act_as(tests.id_of('kid_a2'));

select throws_ok($$ select chore.redeem_quest(tests.id_of('quest_a2')) $$,
  'P0001', 'only a parent can redeem a quest', 'redeem: a kid cannot redeem their own quest');

select tests.act_as(tests.id_of('parent_b'));

select throws_ok($$ select chore.redeem_quest(tests.id_of('quest_a2')) $$,
  'P0001', 'quest belongs to another household', 'redeem: another household''s parent is rejected');

select tests.act_as(tests.id_of('parent_a'));

select throws_ok($$ select chore.redeem_quest(tests.id_of('no_such_quest')) $$,
  'P0001', 'quest not found', 'redeem: an unknown quest is rejected');
select throws_ok($$ select chore.redeem_quest(tests.id_of('guild_a')) $$,
  'P0001', 'only personal quests are redeemable', 'redeem: a guild quest is rejected');
select throws_ok($$ select chore.redeem_quest(tests.id_of('quest_a2')) $$,
  'P0001', 'not enough XP (200 of 3000)', 'redeem: insufficient spendable XP is rejected');

-- Top kid_a2 up to exactly the quest's cost: an exact balance is enough.
select tests.reset_actor();
insert into chore.ledger_entries (household_id, kid_id, delta_cents, reason)
values (tests.id_of('house_a'), tests.id_of('kid_a2'), 2800, 'parent_adjustment');

select tests.act_as(tests.id_of('parent_a'));

select lives_ok($$ select chore.redeem_quest(tests.id_of('quest_a2')) $$,
  'redeem: a parent redeems a quest the kid can exactly afford');
select throws_ok($$ select chore.redeem_quest(tests.id_of('quest_a2')) $$,
  'P0001', 'quest is redeemed', 'redeem: cannot redeem twice');

select tests.reset_actor();

select results_eq(
  $$ select status::text, redeemed_at from chore.quests where id = tests.id_of('quest_a2') $$,
  $$ values ('redeemed', now()) $$,
  'redeem: the quest is marked redeemed');
select results_eq(
  $$ select kid_id, delta_cents, reason::text from chore.ledger_entries
      where quest_id = tests.id_of('quest_a2') $$,
  $$ values (tests.id_of('kid_a2'), -3000, 'quest_redeemed') $$,
  'redeem: exactly one debit for the quest''s cost, linked to the quest');
select is(
  (select sum(delta_cents)::int from chore.ledger_entries where kid_id = tests.id_of('kid_a2')),
  0,
  'redeem: the kid''s spendable balance drops by the cost');

-- start_guild_quest ----------------------------------------------------------
select tests.act_as_anon();

select throws_ok($$ select chore.start_guild_quest('Movie night', 'Popcorn', 8000) $$,
  'P0001', 'not a household member', 'guild: anon is rejected');

select tests.act_as(tests.id_of('kid_a1'));

select throws_ok($$ select chore.start_guild_quest('Movie night', 'Popcorn', 8000) $$,
  'P0001', 'only a parent can start a guild quest', 'guild: a kid cannot start a guild quest');

select tests.act_as(tests.id_of('parent_a'));

select lives_ok($$ select chore.start_guild_quest('Movie night', 'Popcorn', 8000) $$,
  'guild: a parent starts a guild quest while one is active');

select tests.reset_actor();

select is(
  (select status::text from chore.quests where id = tests.id_of('guild_a')),
  'archived',
  'guild: the previously active guild quest is archived');
select results_eq(
  $$ select title from chore.quests
      where household_id = tests.id_of('house_a') and scope = 'guild' and status = 'active' $$,
  $$ values ('Movie night') $$,
  'guild: exactly one active guild quest, the new one');
select is(
  (select status::text from chore.quests where id = tests.id_of('guild_b')),
  'active',
  'guild: another household''s guild quest is untouched');

-- regenerate_join_code / join_household (0022) -------------------------------
select tests.act_as_anon();

select throws_ok($$ select chore.regenerate_join_code() $$,
  'P0001', 'only a parent can create an invite', 'invite: anon cannot mint a code');
select throws_ok($$ select chore.join_household('ANYCODE1', 'Stranger') $$,
  'P0001', 'must be authenticated', 'join: anon is rejected');

select tests.act_as(tests.id_of('kid_a1'));

select throws_ok($$ select chore.regenerate_join_code() $$,
  'P0001', 'only a parent can create an invite', 'invite: a kid cannot mint a code');

select tests.act_as(tests.id_of('parent_a'));

select lives_ok($$ select chore.regenerate_join_code() $$, 'invite: a parent mints a code');

-- Keep the minted code in a transaction-local setting, readable whichever
-- actor is current (house A is invisible to newbie under RLS).
select tests.reset_actor();
select set_config('tests.join_code', join_code, true)
  from chore.households where id = tests.id_of('house_a');

select is(
  (select join_code_expires_at from chore.households where id = tests.id_of('house_a')),
  now() + interval '24 hours',
  '0022: a minted code expires 24 hours from now');

select tests.act_as(tests.id_of('kid_a1'));

select throws_ok($$ select chore.join_household(current_setting('tests.join_code'), 'Kid A1') $$,
  'P0001', 'user already belongs to a household', 'join: an existing member cannot join');

-- Expired: backdate the stored expiry instead of waiting on the clock.
select tests.reset_actor();
update chore.households set join_code_expires_at = now() - interval '1 minute'
 where id = tests.id_of('house_a');

select tests.act_as(tests.id_of('newbie'));

select throws_ok($$ select chore.join_household(current_setting('tests.join_code'), 'Newbie') $$,
  'P0001', 'invalid or expired invite code', '0022: an expired code is rejected');

-- A code minted before 0022 has no expiry at all, and is rejected too.
select tests.reset_actor();
update chore.households set join_code_expires_at = null where id = tests.id_of('house_a');

select tests.act_as(tests.id_of('newbie'));

select throws_ok($$ select chore.join_household(current_setting('tests.join_code'), 'Newbie') $$,
  'P0001', 'invalid or expired invite code', '0022: a code with no expiry is rejected');

select tests.reset_actor();
update chore.households set join_code_expires_at = now() + interval '1 hour'
 where id = tests.id_of('house_a');

select tests.act_as(tests.id_of('newbie'));

-- Typed loosely (lower case, a dash in the middle) on purpose: join normalizes it.
select lives_ok(
  $$ select chore.join_household(
       lower(left(current_setting('tests.join_code'), 4) || '-' || right(current_setting('tests.join_code'), 4)),
       'Newbie') $$,
  'join: a signed-up user joins with a valid code, typed loosely');

select tests.act_as(tests.id_of('newbie2'));

select throws_ok($$ select chore.join_household(current_setting('tests.join_code'), 'Newbie 2') $$,
  'P0001', 'invalid or expired invite code', 'join: a code works once');

select tests.reset_actor();

select results_eq(
  $$ select household_id, role::text from chore.users where id = tests.id_of('newbie') $$,
  $$ values (tests.id_of('house_a'), 'parent') $$,
  'join: the joiner is a parent of the inviting household');
select results_eq(
  $$ select join_code, join_code_expires_at from chore.households where id = tests.id_of('house_a') $$,
  $$ values (null::text, null::timestamptz) $$,
  'join: the code and its expiry are cleared once used');

-- bootstrap_household --------------------------------------------------------
select tests.act_as_anon();

select throws_ok($$ select chore.bootstrap_household('Anon House', 'Anon') $$,
  'P0001', 'must be authenticated', 'bootstrap: anon is rejected');

select tests.act_as(tests.id_of('kid_a1'));

select throws_ok($$ select chore.bootstrap_household('Kid House', 'Kid A1') $$,
  'P0001', 'user already belongs to a household', 'bootstrap: an existing member is rejected');

select tests.act_as(tests.id_of('founder'));

select lives_ok($$ select chore.bootstrap_household('New House', 'Founder') $$,
  'bootstrap: a signed-up user with no household creates one');
select throws_ok($$ select chore.bootstrap_household('Second House', 'Founder') $$,
  'P0001', 'user already belongs to a household', 'bootstrap: cannot bootstrap twice');

select tests.reset_actor();

select results_eq(
  $$ select h.name, u.role::text
       from chore.users u join chore.households h on h.id = u.household_id
      where u.id = tests.id_of('founder') $$,
  $$ values ('New House', 'parent') $$,
  'bootstrap: the founder is the parent of the new household');

select * from finish();
rollback;
