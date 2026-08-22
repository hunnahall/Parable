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

-- Sweeps every unread article (no article_states row yet) older than 48h
-- into 'archived' for every user — see auto_archive_stale_articles() in the
-- database and src/lib/feeds/retention.ts. Hourly keeps the lag between
-- "should be archived" and "is archived" small without meaningfully
-- competing with ingest-feeds' 30-minute cadence.
select cron.schedule(
  'auto-archive-articles',
  '0 * * * *',
  $$
  select net.http_post(
    url := '<YOUR_DEPLOYED_URL>/api/cron/auto-archive-articles',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'parable_cron_secret')
    )
  );
  $$
);

-- Purges cached full article content (article_content rows) 7 days after
-- an article was archived, excluding anything any user has saved — see
-- purge_expired_article_content(). Metadata (feed_items, tags, folders,
-- summary_ai) is untouched; only the content cache is deleted. Scheduled
-- well clear of the other jobs so nothing overlaps.
select cron.schedule(
  'purge-article-content',
  '15 5 * * *',
  $$
  select net.http_post(
    url := '<YOUR_DEPLOYED_URL>/api/cron/purge-article-content',
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
