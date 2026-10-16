-- ============================================================================
-- Chore App — 0020 restrict push subscription endpoints to real push services
--
-- The backend POSTs a notification to each subscription's `endpoint`. Users can
-- write push_subscriptions directly through PostgREST (RLS: own rows), so an
-- API-only check isn't enough — without this, a user could store any URL
-- (localhost, cloud metadata, …) and make the server call it.
--
-- Allowed: FCM (Chrome, Edge-Android, Samsung, Brave), Mozilla autopush
-- (Firefox), Apple (Safari), WNS (Edge on Windows). The trailing `/` pins the
-- end of the host, so no port or `user@host` tricks. Keep in sync with
-- backend/src/push/push-endpoint.ts.
--
-- NOT VALID: enforced for every new insert/update, without failing on rows
-- already stored. The backend also skips non-matching rows at send time.
-- ============================================================================

alter table chore.push_subscriptions
  add constraint push_subscriptions_endpoint_host check (
    endpoint ~ '^https://(fcm\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|web\.push\.apple\.com|([a-z0-9-]+\.)+notify\.windows\.com)/'
  ) not valid;
