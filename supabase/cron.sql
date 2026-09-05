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

-- Fetches new items for every feed, then for each one translates the
-- title, applies the keyword filters, reads the article, and writes a
-- two-sentence summary — see src/lib/feeds/ingest.ts. Every 4 hours:
-- frequent enough to keep feeds fresh without needing to fire on the hour.
-- A run that can't finish inside its budget stops starting new items and
-- lets the next run pick up the rest (RUN_BUDGET_MS in ingest.ts), so a
-- large backlog drains across several cycles rather than timing out.
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

-- Parable's whole retention policy in one job: unfiled Inbox articles are
-- deleted 12h after they arrive, archived ones 24h after they're archived,
-- and shared feed_items rows are reclaimed once nobody wants them — see
-- src/lib/feeds/retention.ts and the three functions it calls.
--
-- Hourly, not daily. The old policy's windows were 24h/7d/30d, where a
-- once-a-day sweep was plenty of resolution; at 12h and 24h a daily sweep
-- would mean an article's real lifetime varied by up to a full day
-- depending on when it happened to arrive relative to the cron. Offset to
-- :10 so it never fires in the same instant as ingest-feeds on the hours
-- they share.
--
-- Replaces auto-archive-articles, purge-article-content and
-- purge-archived-metadata. Unschedule those once, they are not part of
-- this file's steady-state schedule:
--
--   select cron.unschedule('auto-archive-articles');
--   select cron.unschedule('purge-article-content');
--   select cron.unschedule('purge-archived-metadata');
select cron.schedule(
  'retention',
  '10 * * * *',
  $$
  select net.http_post(
    url := 'https://parable-rss.vercel.app/api/cron/retention',
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
-- To remove a job: select cron.unschedule('retention');
