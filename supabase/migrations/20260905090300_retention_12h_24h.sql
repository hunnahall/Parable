-- Retention, rewritten for the summarizer model. The Inbox is a triage
-- surface, not an archive: an article you never touch is gone in 12 hours,
-- and one you archive is gone 24 hours after that.
--
-- Both windows are measured from feed_items.created_at (when Parable first
-- saw the article), not published_at. A feed that publishes with a lag or
-- backfills its history would otherwise deliver articles already past
-- their window, and they'd be swept before anyone had a chance to read
-- them.
--
-- The old three-stage 24h-archive / 7d-content / 30d-metadata policy is
-- replaced entirely. purge_expired_article_content is dropped outright —
-- article_content no longer exists (see the previous migration).

drop function if exists public.auto_archive_stale_articles(boolean);
drop function if exists public.purge_expired_article_content(boolean);
drop function if exists public.purge_archived_article_metadata(boolean);

-- Stage 1. An unfiled article (no article_states row at all) that has been
-- in the Inbox 12 hours gets a per-user 'deleted' tombstone. Not a shared
-- delete: another subscriber may still have it saved, and their window is
-- their own.
create or replace function public.purge_stale_inbox_articles(dry_run boolean default false)
returns table (deleted_count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  affected bigint;
begin
  create temp table _stale on commit drop as
  select s.user_id, fi.id as feed_item_id
  from public.subscriptions s
  join public.feed_items fi on fi.feed_id = s.feed_id
  where fi.created_at < now() - interval '12 hours'
    and not exists (
      select 1 from public.article_states a
      where a.feed_item_id = fi.id and a.user_id = s.user_id
    );

  select count(*) into affected from _stale;

  if not dry_run then
    insert into public.article_states (user_id, feed_item_id, state, archived_at)
    select user_id, feed_item_id, 'deleted', now() from _stale
    on conflict (user_id, feed_item_id) do nothing;
  end if;

  return query select affected;
end;
$$;

-- Stage 2. An archived article gets 24 more hours, measured from when it
-- was archived, then becomes a tombstone too.
create or replace function public.purge_expired_archived_articles(dry_run boolean default false)
returns table (deleted_count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  affected bigint;
begin
  select count(*) into affected
  from public.article_states
  where state = 'archived'
    and archived_at is not null
    and archived_at < now() - interval '24 hours';

  if not dry_run then
    update public.article_states
    set state = 'deleted', archived_at = now()
    where state = 'archived'
      and archived_at is not null
      and archived_at < now() - interval '24 hours';
  end if;

  return query select affected;
end;
$$;

-- Stage 3. The only thing that deletes a shared row, and the app's only
-- bound on feed_items storage growth. A row is reclaimable once nobody has
-- it saved and every subscriber has let go of it — either by tombstoning
-- it above or by unsubscribing from the feed entirely.
--
-- The created_at guard is load-bearing: a freshly-ingested article has no
-- article_states rows at all, which would otherwise satisfy "nobody wants
-- this" and delete it before anyone saw it. 12 hours matches stage 1, so a
-- row only becomes eligible after that stage has had its chance to
-- tombstone it.
create or replace function public.reclaim_orphaned_feed_items(dry_run boolean default false)
returns table (reclaimed_count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  affected bigint;
begin
  create temp table _orphaned on commit drop as
  select fi.id
  from public.feed_items fi
  where fi.created_at < now() - interval '12 hours'
    -- Nobody is keeping it.
    and not exists (
      select 1 from public.article_states a
      where a.feed_item_id = fi.id and a.state = 'saved'
    )
    -- And no subscriber is still undecided about it.
    and not exists (
      select 1
      from public.subscriptions s
      where s.feed_id = fi.feed_id
        and not exists (
          select 1 from public.article_states a
          where a.feed_item_id = fi.id
            and a.user_id = s.user_id
            and a.state = 'deleted'
        )
    );

  select count(*) into affected from _orphaned;

  if not dry_run then
    -- Cascades to article_states / article_folders / read_items.
    delete from public.feed_items fi using _orphaned o where fi.id = o.id;
  end if;

  return query select affected;
end;
$$;

-- PostgREST exposes every public-schema function at /rest/v1/rpc/<name>,
-- and Postgres grants EXECUTE to public by default. These are SECURITY
-- DEFINER and delete other people's articles, so anyone holding the
-- publishable key could wipe every user's inbox. Same lockdown as
-- 20260903190000; retention runs only as the service role, from
-- src/lib/feeds/retention.ts.
revoke all on function public.purge_stale_inbox_articles(boolean)
  from public, anon, authenticated;
revoke all on function public.purge_expired_archived_articles(boolean)
  from public, anon, authenticated;
revoke all on function public.reclaim_orphaned_feed_items(boolean)
  from public, anon, authenticated;
