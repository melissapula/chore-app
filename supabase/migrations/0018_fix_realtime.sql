-- ============================================================================
-- Chore App — 0018 fix realtime delivery
--
-- A live test proved the kid dashboard's realtime subscription to
-- chore.ledger_entries never receives events even though the channel SUBSCRIBEs
-- and RLS would allow them — i.e. the live tables were never actually added to
-- the `supabase_realtime` publication (migration 0007 didn't take). Re-add them
-- idempotently here.
--
-- Also set REPLICA IDENTITY FULL so Realtime has the whole row to evaluate RLS
-- on UPDATE/DELETE events (chore_instances state changes are UPDATEs, and the
-- RLS policy keys on household_id, which isn't the primary key). INSERTs already
-- carry the full row, so ledger_entries would work without it, but we set both
-- for consistency.
--
-- No frontend change needed: supabase-js v2 already calls realtime.setAuth() on
-- token change, so the browser client's realtime connection is authenticated.
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'chore' and tablename = 'chore_instances'
  ) then
    alter publication supabase_realtime add table chore.chore_instances;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'chore' and tablename = 'ledger_entries'
  ) then
    alter publication supabase_realtime add table chore.ledger_entries;
  end if;
end $$;

alter table chore.chore_instances replica identity full;
alter table chore.ledger_entries  replica identity full;
