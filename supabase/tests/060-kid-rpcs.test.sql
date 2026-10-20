-- Kid transition RPCs (0011, 0021): claim_instance, start_instance,
-- submit_instance, mark_done_instance. They are a kid's only write path to
-- chore_instances (C2), so each must re-authorize the caller and validate the
-- current state itself. Error messages are quoted exactly from the function
-- bodies; `raise exception` without a SQLSTATE is P0001.
begin;
\ir helpers/setup.psql

select plan(35);
select tests.seed();

-- Extra fixtures, as postgres. The seed's inst_a is an OPEN paid instance with
-- no eligibility list; the household defaults are a 1440-minute start timer and
-- a 120-minute finish timer.
insert into chore.chores (id, household_id, title, chore_type, value_cents, eligible_kid_ids)
values (tests.id_of('chore_elig_a'), tests.id_of('house_a'), 'Walk the dog', 'paid', 200,
        array[tests.id_of('kid_a2')]);

insert into chore.chores (id, household_id, title, chore_type, assigned_kid_id, due_type)
values (tests.id_of('chore_req_a'), tests.id_of('house_a'), 'Make bed', 'required',
        tests.id_of('kid_a1'), 'end_of_day');

insert into chore.chore_instances
  (id, household_id, chore_id, state, value_cents_snapshot, assigned_to, due_date)
values
  (tests.id_of('inst_elig_a'), tests.id_of('house_a'), tests.id_of('chore_elig_a'), 'OPEN', 200, null, null),
  (tests.id_of('inst_a2'),     tests.id_of('house_a'), tests.id_of('chore_a'),      'OPEN', 150, null, null),
  (tests.id_of('req_a'),       tests.id_of('house_a'), tests.id_of('chore_req_a'),  'ASSIGNED', 0,
   tests.id_of('kid_a1'), now() + interval '1 day'),
  (tests.id_of('req_a2'),      tests.id_of('house_a'), tests.id_of('chore_req_a'),  'ASSIGNED', 0,
   tests.id_of('kid_a1'), now() + interval '1 day');

-- Signed out -----------------------------------------------------------------
select tests.act_as_anon();

select throws_ok($$ select chore.claim_instance(tests.id_of('inst_a')) $$,
  'P0001', 'not a household member', 'anon cannot claim');
select throws_ok($$ select chore.start_instance(tests.id_of('inst_a')) $$,
  'P0001', 'not a household member', 'anon cannot start');
select throws_ok($$ select chore.submit_instance(tests.id_of('inst_a')) $$,
  'P0001', 'not a household member', 'anon cannot submit');
select throws_ok($$ select chore.mark_done_instance(tests.id_of('req_a')) $$,
  'P0001', 'not a household member', 'anon cannot mark done');

-- claim_instance: rejections ------------------------------------------------
select tests.act_as(tests.id_of('kid_a1'));

select throws_ok($$ select chore.claim_instance(tests.id_of('no_such_instance')) $$,
  'P0001', 'instance not found', 'claim: an unknown instance is rejected');
select throws_ok($$ select chore.claim_instance(tests.id_of('inst_b')) $$,
  'P0001', 'instance belongs to another household',
  'claim: another household''s instance is rejected');
select throws_ok($$ select chore.claim_instance(tests.id_of('req_a')) $$,
  'P0001', 'only paid chores are claimable', 'claim: a required instance is rejected');
select throws_ok($$ select chore.claim_instance(tests.id_of('inst_elig_a')) $$,
  'P0001', 'this chore is not available to you',
  'claim: a kid missing from the eligibility list is rejected');

-- claim_instance: happy path -------------------------------------------------
select lives_ok($$ select chore.claim_instance(tests.id_of('inst_a')) $$,
  'claim: a kid claims an OPEN paid instance');

select tests.reset_actor();

select results_eq(
  $$ select state::text, claimed_by from chore.chore_instances where id = tests.id_of('inst_a') $$,
  $$ values ('CLAIMED', tests.id_of('kid_a1')) $$,
  'claim: the instance is CLAIMED by the caller');
select is(
  (select start_deadline from chore.chore_instances where id = tests.id_of('inst_a')),
  now() + interval '1440 minutes',
  'claim: start_deadline is now + the household start timer');

select tests.act_as(tests.id_of('kid_a2'));

select throws_ok($$ select chore.claim_instance(tests.id_of('inst_a')) $$,
  'P0001', 'someone else just claimed this chore',
  'claim: a sibling cannot claim a live claim');

-- start_instance: rejections -------------------------------------------------
select throws_ok($$ select chore.start_instance(tests.id_of('inst_a')) $$,
  'P0001', 'only the kid who claimed it can start it', 'start: only the claimer can start');
select throws_ok($$ select chore.start_instance(tests.id_of('inst_b')) $$,
  'P0001', 'instance belongs to another household',
  'start: another household''s instance is rejected');
select throws_ok($$ select chore.start_instance(tests.id_of('inst_elig_a')) $$,
  'P0001', 'instance is OPEN, expected CLAIMED', 'start: a non-CLAIMED instance is rejected');

-- 0021: a lapsed claim -------------------------------------------------------
-- Backdate the stored deadline instead of waiting on the clock.
select tests.reset_actor();
update chore.chore_instances
   set start_deadline = now() - interval '1 minute'
 where id = tests.id_of('inst_a');

select tests.act_as(tests.id_of('kid_a1'));

select throws_ok($$ select chore.start_instance(tests.id_of('inst_a')) $$,
  'P0001', 'the start timer ran out — claim it again',
  '0021: the claimer cannot start once the start timer has run out');

select tests.act_as(tests.id_of('kid_a2'));

select lives_ok($$ select chore.claim_instance(tests.id_of('inst_a')) $$,
  '0021: a sibling can claim a lapsed claim');

select tests.reset_actor();

select results_eq(
  $$ select claimed_by, start_deadline from chore.chore_instances where id = tests.id_of('inst_a') $$,
  $$ values (tests.id_of('kid_a2'), now() + interval '1440 minutes') $$,
  '0021: the re-claim belongs to the sibling with a fresh start timer');

select tests.act_as(tests.id_of('kid_a1'));

select throws_ok($$ select chore.start_instance(tests.id_of('inst_a')) $$,
  'P0001', 'only the kid who claimed it can start it',
  '0021: the old claimer can no longer start it');

-- start_instance: happy path -------------------------------------------------
select tests.act_as(tests.id_of('kid_a2'));

select lives_ok($$ select chore.start_instance(tests.id_of('inst_a')) $$,
  'start: the claimer starts their claim');

select tests.reset_actor();

select results_eq(
  $$ select state::text, finish_deadline from chore.chore_instances where id = tests.id_of('inst_a') $$,
  $$ values ('IN_PROGRESS', now() + interval '120 minutes') $$,
  'start: the instance is IN_PROGRESS with finish_deadline = now + the household finish timer');

-- submit_instance ------------------------------------------------------------
select tests.act_as(tests.id_of('kid_a1'));

select throws_ok($$ select chore.submit_instance(tests.id_of('inst_a')) $$,
  'P0001', 'only the kid working on it can submit it', 'submit: only the claimer can submit');

select tests.act_as(tests.id_of('kid_a2'));

select throws_ok($$ select chore.submit_instance(tests.id_of('inst_b')) $$,
  'P0001', 'instance belongs to another household',
  'submit: another household''s instance is rejected');
select throws_ok($$ select chore.submit_instance(tests.id_of('inst_elig_a')) $$,
  'P0001', 'instance is OPEN, expected IN_PROGRESS',
  'submit: a non-IN_PROGRESS instance is rejected');
select lives_ok($$ select chore.submit_instance(tests.id_of('inst_a')) $$,
  'submit: the claimer submits their work');

select tests.reset_actor();

select results_eq(
  $$ select state::text, submitted_at from chore.chore_instances where id = tests.id_of('inst_a') $$,
  $$ values ('SUBMITTED', now()) $$,
  'submit: the instance is SUBMITTED and stamped');

select tests.act_as(tests.id_of('kid_a2'));

select throws_ok($$ select chore.submit_instance(tests.id_of('inst_a')) $$,
  'P0001', 'instance is SUBMITTED, expected IN_PROGRESS', 'submit: cannot submit twice');

-- mark_done_instance ---------------------------------------------------------
select tests.act_as(tests.id_of('kid_a1'));

select throws_ok($$ select chore.mark_done_instance(tests.id_of('inst_a2')) $$,
  'P0001', 'not a required chore', 'mark done: a paid instance is rejected');

select tests.act_as(tests.id_of('kid_a2'));

select throws_ok($$ select chore.mark_done_instance(tests.id_of('req_a')) $$,
  'P0001', 'this chore is assigned to someone else',
  'mark done: only the assigned kid can mark it done');

select tests.act_as(tests.id_of('kid_b1'));

select throws_ok($$ select chore.mark_done_instance(tests.id_of('req_a')) $$,
  'P0001', 'instance belongs to another household',
  'mark done: another household''s instance is rejected');

select tests.act_as(tests.id_of('kid_a1'));

select lives_ok($$ select chore.mark_done_instance(tests.id_of('req_a')) $$,
  'mark done: the assigned kid marks it done');

select tests.reset_actor();

select results_eq(
  $$ select state::text, submitted_at from chore.chore_instances where id = tests.id_of('req_a') $$,
  $$ values ('SUBMITTED', now()) $$,
  'mark done: the instance is SUBMITTED and stamped');

select tests.act_as(tests.id_of('kid_a1'));

select throws_ok($$ select chore.mark_done_instance(tests.id_of('req_a')) $$,
  'P0001', 'instance is SUBMITTED, expected ASSIGNED', 'mark done: cannot mark done twice');

-- A parent calling the kid RPCs ----------------------------------------------
-- Pins today's behavior, not a design decision: claim_instance checks household,
-- type, state and eligibility but not role, so a parent can claim an
-- unrestricted paid chore. mark_done_instance is bound to the assignee, so a
-- parent can't mark a kid's chore done.
select tests.act_as(tests.id_of('parent_a'));

select lives_ok($$ select chore.claim_instance(tests.id_of('inst_a2')) $$,
  'today: claim_instance has no role check, so a parent can claim');
select throws_ok($$ select chore.mark_done_instance(tests.id_of('req_a2')) $$,
  'P0001', 'this chore is assigned to someone else',
  'a parent cannot mark a kid''s required chore done');

select * from finish();
rollback;
