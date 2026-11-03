-- Retention runs inside the database. Until 2026-11-03 the hourly cron job
-- called /api/cron/retention over HTTP, and that route made seven
-- sequential calls back here, across the country (Vercel iad1, database
-- us-west-2). A cold function couldn't answer inside pg_net's 5-second
-- wait, so every other hour timed out. Now pg_cron calls this function
-- directly: no HTTP, no Vercel function, no service key.
--
-- Same seven stages in the same order as before (see
-- src/lib/feeds/retention.ts, which now calls this for manual and dry
-- runs). Returns the same counts the route returned.
create or replace function public.run_retention(dry_run boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  stale bigint;
  expired bigint;
  reclaimed bigint;
  guids bigint;
  views bigint;
  filtered bigint;
  counts bigint;
begin
  -- One statement per stage, so they run in this order: reclaiming
  -- depends on the two tombstone stages before it.
  select deleted_count into stale from public.purge_stale_inbox_articles(dry_run);
  select deleted_count into expired from public.purge_expired_archived_articles(dry_run);
  select reclaimed_count into reclaimed from public.reclaim_orphaned_feed_items(dry_run);
  select deleted_count into guids from public.purge_ingested_guids(dry_run);
  select deleted_count into views from public.purge_story_views(dry_run);
  select deleted_count into filtered from public.purge_filtered_titles(dry_run);
  select deleted_count into counts from public.purge_feed_counts(dry_run);
  return jsonb_build_object(
    'dryRun', dry_run,
    'staleInboxCount', stale,
    'expiredArchivedCount', expired,
    'reclaimedCount', reclaimed,
    'purgedGuidCount', guids,
    'purgedStoryViewCount', views,
    'purgedFilteredTitleCount', filtered,
    'purgedFeedCountCount', counts
  );
end;
$$;

-- Service role only, like the stages it runs: PostgREST exposes every
-- public function, and this one deletes for every account.
revoke all on function public.run_retention(boolean) from public, anon, authenticated;
grant execute on function public.run_retention(boolean) to service_role;

-- The hourly job calls the function instead of the app. Same name, so
-- this replaces the HTTP version in place.
select cron.schedule(
  'retention',
  '10 * * * *',
  $$
  select public.run_retention()
  -- Skipped while automatic updates are paused (Settings).
  where not public.automatic_updates_paused();
  $$
);
