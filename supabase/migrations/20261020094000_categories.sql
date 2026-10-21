-- Categories (roadmap step 7, 2026-10-20).
-- One category per feed, per user, in the user's order. Replaces feed folders:
-- folders now hold saved articles only. Additive: the old feed_folders table is
-- dropped by 20261020095000_drop_feed_folders after the new code is deployed.

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists categories_user_name_unique on public.categories (user_id, lower(name));
create index if not exists categories_user_position_idx on public.categories (user_id, position);

alter table public.categories enable row level security;

create policy "Users manage their own categories" on public.categories
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- A feed's category lives on the subscription (it's per user). Deleting a
-- category leaves its feeds uncategorized.
alter table public.subscriptions
  add column if not exists category_id uuid references public.categories (id) on delete set null;
create index if not exists subscriptions_category_idx on public.subscriptions (category_id);

-- story_feed now reports each source's category, so the Inbox can show a
-- story under every category its feeds belong to.
create or replace function public.story_feed(
  p_view text,
  p_query text default null,
  p_limit integer default 600
)
returns table (story_id uuid, last_activity_at timestamptz, items jsonb)
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
  select g.story_id, g.last_activity_at, g.items
  from grouped g
  where g.matches
  order by g.last_activity_at desc, g.story_id desc
  limit p_limit;
$$;
