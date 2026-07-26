-- ============================================================================
-- Chore App — 0016 add read-path indexes (audit Low)
--
-- Fine at a family's handful of rows today; cheap insurance for the hot reads.
-- ============================================================================

set search_path = chore, public;

-- Kid balance + XP history: filtered by kid_id, ordered by created_at.
create index if not exists ledger_entries_kid_created_idx
  on chore.ledger_entries (kid_id, created_at desc);

-- notes RLS filters on recipient_id / author_id.
create index if not exists notes_recipient_idx on chore.notes (recipient_id);
create index if not exists notes_author_idx on chore.notes (author_id);
