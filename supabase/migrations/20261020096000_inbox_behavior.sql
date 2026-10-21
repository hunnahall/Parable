-- Inbox behavior (roadmap step 8, 2026-10-20).

-- 1. Seen stories. A story the reader has had on screen for about a second
-- gets a row here, and the Inbox dims it while seen_at is at or after the
-- story's latest activity. A new source arriving later moves that activity
-- past seen_at, so the story lights up again. Per story, so seeing it in one
-- category counts in every category.
create table if not exists public.story_views (
  user_id uuid not null references auth.users (id) on delete cascade,
  story_id uuid not null,
  seen_at timestamptz not null default now(),
  primary key (user_id, story_id)
);

alter table public.story_views enable row level security;

create policy "Users manage their own story views" on public.story_views
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 2. story_feed reports when the caller last saw each story.
drop function if exists public.story_feed(text, text, integer);
create function public.story_feed(
  p_view text,
  p_query text default null,
  p_limit integer default 600
)
returns table (story_id uuid, last_activity_at timestamptz, seen_at timestamptz, items jsonb)
language sql
stable
set search_path = public
as $$
  with visible as (
    select
      fi.id, fi.story_id, fi.feed_id, fi.title, fi.title_en, fi.link,
      fi.published_at, fi.created_at, fi.image_url, fi.summary_ai,
      coalesce(s.title, f.title) as feed_title,
      s.category_id,
      a.archived_at
    from public.feed_items fi
    join public.subscriptions s on s.feed_id = fi.feed_id and s.user_id = (select auth.uid())
    join public.feeds f on f.id = fi.feed_id
    left join public.article_states a
      on a.feed_item_id = fi.id and a.user_id = (select auth.uid())
    where case p_view
      when 'inbox' then a.state is null
      when 'archive' then a.state = 'archived'
      else false
    end
  ),
  grouped as (
    select
      v.story_id,
      max(v.created_at) as last_activity_at,
      bool_or(p_query is null or coalesce(v.title_en, v.title) ilike '%' || p_query || '%') as matches,
      jsonb_agg(
        jsonb_build_object(
          'id', v.id, 'feed_id', v.feed_id, 'feed_title', v.feed_title,
          'category_id', v.category_id,
          'title', coalesce(v.title_en, v.title), 'link', v.link,
          'published_at', v.published_at, 'created_at', v.created_at,
          'image_url', v.image_url, 'summary', v.summary_ai, 'archived_at', v.archived_at
        )
        order by v.created_at desc
      ) as items
    from visible v
    group by v.story_id
  )
  select g.story_id, g.last_activity_at, sv.seen_at, g.items
  from grouped g
  left join public.story_views sv
    on sv.story_id = g.story_id and sv.user_id = (select auth.uid())
  where g.matches
  order by g.last_activity_at desc, g.story_id desc
  limit p_limit;
$$;

grant execute on function public.story_feed(text, text, integer) to authenticated;
revoke execute on function public.story_feed(text, text, integer) from anon, public;

create or replace function public.inbox_story_count()
returns bigint
language sql
stable
set search_path = public
as $$
  select count(*) from public.story_feed('inbox', null, 100000);
$$;

grant execute on function public.inbox_story_count() to authenticated;
revoke execute on function public.inbox_story_count() from anon, public;

-- 3. Retention: a view only matters while its story can still be in the
-- Inbox (12h) or Archive (24h after archiving), so it's forgotten 48h after
-- it was last written.
create or replace function public.purge_story_views(dry_run boolean default false)
returns table (deleted_count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  affected bigint;
begin
  select count(*) into affected
  from public.story_views
  where seen_at < now() - interval '48 hours';

  if not dry_run then
    delete from public.story_views
    where seen_at < now() - interval '48 hours';
  end if;

  return query select affected;
end;
$$;

revoke all on function public.purge_story_views(boolean)
  from public, anon, authenticated;
