-- Ingest's memory of which (feed, guid) pairs it has already processed,
-- kept in its own table because feed_items is deliberately short-lived.
--
-- reclaim_orphaned_feed_items hard-deletes a feed_items row 12h after
-- ingest, cascading the per-user tombstone away with it. processFeed's
-- only "have I seen this?" check was a query against that same table, so
-- an article still listed in its feed's XML and still inside runIngest's
-- 24h MAX_ITEM_AGE_HOURS cutoff looked brand new again the moment its row
-- was reclaimed: re-translated, re-embedded, re-fetched and re-summarized,
-- and back in the Inbox the reader had already let expire. Up to twice the
-- API cost of the entire pipeline, for output nobody asked for.
--
-- Scraped feeds had it worse. processFeed skips the published-date filter
-- for them entirely (detectArticles rarely finds a reliable date), so the
-- loop had no upper bound at all — a story that stayed on the tracked page
-- was re-summarized every single ingest cycle, indefinitely.
--
-- This table outlives the article row and answers that question instead.

create table if not exists public.ingested_guids (
  feed_id uuid not null references public.feeds(id) on delete cascade,
  guid text not null,
  first_seen_at timestamptz not null default now(),
  primary key (feed_id, guid)
);

-- The purge below filters on this column alone; the primary key already
-- covers the (feed_id, guid) lookup processFeed does.
create index if not exists ingested_guids_first_seen_at_idx
  on public.ingested_guids (first_seen_at);

-- Written and read only by ingest, which runs as the service role. RLS on
-- with no policies at all is the lockdown: the service role bypasses RLS,
-- and every other caller sees an empty table. Same posture as the
-- retention RPCs — nothing here belongs to a user.
alter table public.ingested_guids enable row level security;

-- Seed from whatever is currently live so enabling this doesn't re-ingest
-- the existing inbox on the next run. Bounded to the same 72h window the
-- purge below uses: older rows are past their usefulness, and seeding them
-- would suppress articles a user re-subscribing to an old feed should
-- still receive.
insert into public.ingested_guids (feed_id, guid, first_seen_at)
select feed_id, guid, created_at
from public.feed_items
where created_at > now() - interval '72 hours'
on conflict (feed_id, guid) do nothing;

-- Stage 4 of retention (see src/lib/feeds/retention.ts).
--
-- 72 hours: long enough to cover the gap between a feed_items row being
-- reclaimed (12h) and its article aging out of runIngest's 24h cutoff,
-- with room for feeds that publish with a lag or backfill. Short enough
-- that unsubscribing and re-subscribing to a feed a few days later still
-- delivers its current articles, instead of an inbox that stays empty
-- until that feed publishes something genuinely new.
--
-- Scraped feeds have no date cutoff to fall back on, so for them this
-- window *is* the bound: a story sitting on the tracked page is
-- re-summarized every 72h rather than every cycle. Uniform rather than
-- per-feed-type on purpose — one number, one branch fewer, and the
-- difference between 72h and "forever" is the part that mattered.
create or replace function public.purge_ingested_guids(dry_run boolean default false)
returns table (deleted_count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  affected bigint;
begin
  select count(*) into affected
  from public.ingested_guids
  where first_seen_at < now() - interval '72 hours';

  if not dry_run then
    delete from public.ingested_guids
    where first_seen_at < now() - interval '72 hours';
  end if;

  return query select affected;
end;
$$;

-- Same reasoning as 20260903190000 and 20260905090300: PostgREST exposes
-- every public-schema function at /rest/v1/rpc/<name> and Postgres grants
-- EXECUTE to public by default. Wiping this table would make ingest
-- re-summarize every live article, so it is service-role only.
revoke all on function public.purge_ingested_guids(boolean)
  from public, anon, authenticated;
