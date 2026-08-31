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
-- Deployed URL for the retention jobs below.
--
-- ingest-feeds is deliberately NOT scheduled here. It's triggered instead
-- by .github/workflows/cron.yml, which builds and runs the app inside the
-- Actions runner and calls its own localhost — that keeps it off Vercel's
-- Serverless Function duration cap entirely (Hobby: 10s, fixed, regardless
-- of the route's own maxDuration). Calling the deployed /api/ingest-feeds
-- from here would put it back behind that cap, since pg_net's http_post
-- still lands on the same Vercel function no matter what triggers it. The
-- retention routes below are cheap DB-only queries, well under any cap
-- Vercel would impose, so triggering them here instead of from GitHub
-- Actions is a clean simplification, not a workaround.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Sweeps every unread article (no article_states row yet) older than 48h
-- into 'archived' for every user — see auto_archive_stale_articles() in the
-- database and src/lib/feeds/retention.ts. Hourly keeps the lag between
-- "should be archived" and "is archived" small; cheap enough not to
-- meaningfully compete with the (separately scheduled) ingest-feeds run.
select cron.schedule(
  'auto-archive-articles',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://parable-rss.vercel.app/api/cron/auto-archive-articles',
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
    url := 'https://parable-rss.vercel.app/api/cron/purge-article-content',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'parable_cron_secret')
    )
  );
  $$
);

-- Hard-deletes feed_items rows published 45+ days ago that were never
-- saved, foldered, read, or tagged/noted — see purge_unengaged_feed_items()
-- and src/lib/feeds/retention.ts::runPurgeUnengagedFeedItems. Saved or
-- foldered articles are kept forever; read/tagged-but-not-saved-or-
-- foldered articles are also excluded and keep following the
-- auto-archive-articles / purge-article-content rules above indefinitely.
-- This is the one job that bounds feed_items' long-term storage growth.
-- Daily is plenty since the 45-day window moves slowly; scheduled clear
-- of the other jobs.
select cron.schedule(
  'purge-unengaged-articles',
  '30 5 * * *',
  $$
  select net.http_post(
    url := 'https://parable-rss.vercel.app/api/cron/purge-unengaged-articles',
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
-- To remove a job: select cron.unschedule('auto-archive-articles');
