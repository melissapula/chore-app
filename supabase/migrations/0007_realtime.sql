-- ============================================================================
-- Chore App — 0007 realtime (SPEC §7, build step 7)
-- Turn on Supabase Realtime (Postgres Changes) for the live chore pool and the
-- ledger, so the kid Quest Board and the parent pool update INSTANTLY instead of
-- polling every few seconds. The claim/race mechanic feels live.
--
-- RLS still governs which rows a subscriber receives — a kid only gets changes
-- to their own household's instances / their own ledger, exactly like a SELECT.
-- The per-minute cron sweep runs as the service role, so its state changes
-- (expired claims → OPEN, overdue required → MISSED) also broadcast to clients.
--
-- `supabase_realtime` is the default publication Supabase's Realtime server
-- listens on; adding a table opts it in.
-- ============================================================================

alter publication supabase_realtime add table chore.chore_instances;
alter publication supabase_realtime add table chore.ledger_entries;
