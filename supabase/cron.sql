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
-- Deployed URL for every job below.
--
-- ingest-feeds runs here too, directly against the deployed URL, same as
-- the retention jobs — it used to be routed through a separate GitHub
-- Actions workflow to dodge what was believed to be a hard 10s Vercel
-- Hobby function-duration cap. That premise was wrong for this project:
-- Vercel enables Fluid Compute by default for every project created after
-- April 23, 2025 (this one was created new, well after that), which raises
-- Hobby's function duration to 300s — confirmed both via `vercel project
-- inspect` and directly in the dashboard (Settings → Functions). The
-- /api/ingest-feeds route's own `maxDuration = 300` fits that ceiling
-- exactly, so it can run as a normal Vercel function like everything else.
--
-- One real, unrelated gotcha: net.http_post's own `timeout_milliseconds`
-- defaults to 5000ms — nothing to do with Vercel, just how long Postgres
-- itself will wait for a response before giving up. The retention jobs
-- below never noticed since they're sub-second DB queries, but a full
-- ingest run needs far longer, so ingest-feeds passes `timeout_milliseconds
-- := 300000` explicitly to match Vercel's own ceiling — confirmed this
-- isn't clamped when calling net.http_post directly (as this file already
-- does), only the Supabase dashboard's cron-job wizard enforces 5s.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Fetches new items for every feed, translates/summarizes/scrapes as
-- configured — see src/lib/feeds/ingest.ts. Every 4 hours: frequent enough
-- to keep feeds reasonably fresh without needing to fire on the hour.
-- Independent of the "Run ingest now" button (src/lib/feeds/actions.ts),
-- which still runs on demand regardless of this schedule.
select cron.schedule(
  'ingest-feeds',
  '0 */4 * * *',
  $$
  select net.http_post(
    url := 'https://parable-rss.vercel.app/api/ingest-feeds',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'parable_cron_secret')
    ),
    timeout_milliseconds := 300000
  );
  $$
);

-- Sweeps every unread article (no article_states row yet) older than 24h
-- into 'archived' for every user — see auto_archive_stale_articles() in the
-- database and src/lib/feeds/retention.ts. Every 4 hours, offset 20
-- minutes after ingest-feeds so the two don't fire in the same instant.
select cron.schedule(
  'auto-archive-articles',
  '20 */4 * * *',
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
-- an article was archived, excluding anything any user has saved or is
-- reading — see purge_expired_article_content(). Metadata (feed_items,
-- tags, folders, summary_ai) is untouched; only the content cache is
-- deleted. Scheduled well clear of the other jobs so nothing overlaps.
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

-- purge-unengaged-articles (hard-deleted feed_items 45+ days after
-- publish, regardless of archive state) was retired 2026-09-02 in favor of
-- purge-archived-metadata below — run once, not part of this file's
-- steady-state schedule:
--
--   select cron.unschedule('purge-unengaged-articles');

-- Hard-deletes feed_items rows for articles that have sat in Archive 30+
-- days — see purge_archived_article_metadata() and
-- src/lib/feeds/retention.ts::runPurgeArchivedArticleMetadata. Items in
-- Read or Save are never touched by this, unconditionally — that's the
-- one hard exemption. This is the app's only long-term bound on
-- feed_items' storage growth. Daily is plenty since the 30-day window
-- moves slowly; scheduled clear of the other jobs.
select cron.schedule(
  'purge-archived-metadata',
  '45 5 * * *',
  $$
  select net.http_post(
    url := 'https://parable-rss.vercel.app/api/cron/purge-archived-metadata',
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
