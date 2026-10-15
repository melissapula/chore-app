-- ============================================================================
-- Chore App — 0019 drop users_insert_self
--
-- `users_insert_self` (0002) let any signed-in user insert their own users row
-- with only `id = auth.uid()` checked — role and household_id were free. A user
-- with no row yet could therefore insert themselves as a PARENT of any household
-- whose id they knew.
--
-- Nothing legitimate uses it: both onboarding paths (`bootstrap_household`,
-- `join_household`) are SECURITY DEFINER and insert the row themselves, and kids
-- are created by the backend with the service role. With the policy gone, RLS
-- denies every direct insert into chore.users.
-- ============================================================================

drop policy if exists users_insert_self on chore.users;
