-- Supabase Cron jobs that trigger Parable's ingestion routes on a schedule.
--
-- Prerequisite (run once, NOT part of this file — it contains a real
-- secret and should never be committed): store the app's CRON_SECRET in
-- Supabase Vault so these jobs can reference it by name instead of by
-- value.
--
--   select vault.create_secret(
--     'paste-your-actual-CRON_SECRET-value-here',
--     'parable_cron_secret',
--     'Auth header value for Supabase Cron calling Parable API routes'
--   );
--
-- Before running the schedule calls below, replace <YOUR_DEPLOYED_URL>
-- with the app's real deployed URL (e.g. https://parable-yourname.vercel.app).
-- These jobs call out over the network, so they only work once the app is
-- deployed somewhere Supabase's Postgres can reach — not localhost.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- RSS feeds change frequently enough that a 30-minute interval is a
-- reasonable balance between freshness and load on OpenAI (each new
-- article triggers a translate + summarize call).
select cron.schedule(
  'ingest-feeds',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := '<YOUR_DEPLOYED_URL>/api/ingest-feeds',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'parable_cron_secret')
    )
  );
  $$
);

-- FRED series are daily at their most frequent (many are monthly or
-- quarterly), so once a day comfortably catches new readings without
-- hammering the FRED API for no reason.
select cron.schedule(
  'fetch-indicators',
  '0 6 * * *',
  $$
  select net.http_post(
    url := '<YOUR_DEPLOYED_URL>/api/cron/fetch-indicators',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'parable_cron_secret')
    )
  );
  $$
);

-- Articles older than 14 days are pruned (saved ones are exempt — see
-- prune_feed_items() in the database and src/lib/feeds/retention.ts) to
-- keep the corpus bounded. Scheduled well clear of ingest-feeds' 30-minute
-- cadence and fetch-indicators' run so the three jobs don't overlap.
select cron.schedule(
  'prune-feed-items',
  '0 5 * * *',
  $$
  select net.http_post(
    url := '<YOUR_DEPLOYED_URL>/api/cron/prune-feed-items',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'parable_cron_secret')
    )
  );
  $$
);

-- To change a schedule later: re-run the matching cron.schedule() call
-- above with a new cron expression (same job name updates it in place).
-- To remove a job: select cron.unschedule('ingest-feeds');
