-- Rewrites the retention policy:
--   - Untouched articles auto-archive after 24h (was 48h).
--   - Archived articles' cached full text is cleared after 7 days (unchanged).
--   - Archived articles' metadata (the feed_items row itself) is cleared
--     after 30 days since archived — replaces the old 45-day
--     hard-delete-unengaged job entirely.
--   - Items in Read ('reading') or Save ('saved') are never auto-archived
--     or deleted — purge_expired_article_content's exclusion is widened
--     from 'saved' only to 'saved' or 'reading' to close that gap.

CREATE OR REPLACE FUNCTION public.auto_archive_stale_articles(dry_run boolean DEFAULT false)
 RETURNS TABLE(archived_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  cnt bigint;
begin
  if dry_run then
    select count(*) into cnt
    from auth.users u
    cross join public.feed_items fi
    where fi.published_at < now() - interval '24 hours'
      and not exists (
        select 1 from public.article_states a
        where a.user_id = u.id and a.feed_item_id = fi.id
      );
  else
    with candidates as (
      select u.id as user_id, fi.id as feed_item_id
      from auth.users u
      cross join public.feed_items fi
      where fi.published_at < now() - interval '24 hours'
        and not exists (
          select 1 from public.article_states a
          where a.user_id = u.id and a.feed_item_id = fi.id
        )
    ),
    inserted as (
      insert into public.article_states (user_id, feed_item_id, state, archived_at)
      select user_id, feed_item_id, 'archived', now() from candidates
      returning 1
    )
    select count(*) into cnt from inserted;
  end if;
  return query select cnt;
end;
$function$;

CREATE OR REPLACE FUNCTION public.purge_expired_article_content(dry_run boolean DEFAULT false)
 RETURNS TABLE(purged_count bigint)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  cnt bigint;
begin
  if dry_run then
    select count(distinct a.feed_item_id) into cnt
    from public.article_states a
    where a.state = 'archived'
      and a.archived_at < now() - interval '7 days'
      and not exists (
        select 1 from public.article_states s
        where s.feed_item_id = a.feed_item_id and (s.state = 'saved' or s.state = 'reading')
      )
      and exists (
        select 1 from public.article_content ac where ac.feed_item_id = a.feed_item_id
      );
  else
    with expired as (
      select distinct a.feed_item_id
      from public.article_states a
      where a.state = 'archived'
        and a.archived_at < now() - interval '7 days'
        and not exists (
          select 1 from public.article_states s
          where s.feed_item_id = a.feed_item_id and (s.state = 'saved' or s.state = 'reading')
        )
    ),
    deleted as (
      delete from public.article_content ac
      using expired e
      where ac.feed_item_id = e.feed_item_id
      returning 1
    )
    select count(*) into cnt from deleted;
  end if;
  return query select cnt;
end;
$function$;

DROP FUNCTION IF EXISTS public.purge_unengaged_feed_items(boolean);

CREATE FUNCTION public.purge_archived_article_metadata(dry_run boolean DEFAULT false)
 RETURNS TABLE(purged_count bigint)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  cnt bigint;
begin
  if dry_run then
    select count(*) into cnt
    from public.feed_items fi
    where exists (
        select 1 from public.article_states a
        where a.feed_item_id = fi.id
          and a.state = 'archived'
          and a.archived_at < now() - interval '30 days'
      )
      and not exists (
        select 1 from public.article_states s
        where s.feed_item_id = fi.id
          and (s.state = 'saved' or s.state = 'reading')
      );
  else
    with stale as (
      select fi.id
      from public.feed_items fi
      where exists (
          select 1 from public.article_states a
          where a.feed_item_id = fi.id
            and a.state = 'archived'
            and a.archived_at < now() - interval '30 days'
        )
        and not exists (
          select 1 from public.article_states s
          where s.feed_item_id = fi.id
            and (s.state = 'saved' or s.state = 'reading')
        )
    ),
    deleted as (
      delete from public.feed_items fi
      using stale s
      where fi.id = s.id
      returning 1
    )
    select count(*) into cnt from deleted;
  end if;
  return query select cnt;
end;
$function$;
