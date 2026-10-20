-- Story grouping (roadmap step 6, 2026-10-20).

-- 1. Stories. Each article carries a fixed story id, set by ingest when
-- the story's first article arrives (existing rows take their own id, or
-- their duplicate_of article's). A new article that matches a recent one joins its
-- story instead of chaining to a single nearest neighbor (duplicate_of).
-- No stories table: a story is just the articles sharing an id.
alter table public.feed_items add column if not exists story_id uuid;

update public.feed_items fi
set story_id = coalesce(
  (select d.story_id from public.feed_items d where d.id = fi.duplicate_of),
  (select d.id from public.feed_items d where d.id = fi.duplicate_of),
  fi.id
)
where fi.story_id is null;

alter table public.feed_items alter column story_id set not null;
create index if not exists feed_items_story_id_idx on public.feed_items (story_id);

alter table public.feed_items drop column if exists duplicate_of;

-- The duplicate lookups return the match's story.
drop function if exists public.find_similar_recent_feed_item(extensions.vector, double precision, timestamptz);
create function public.find_similar_recent_feed_item(
  p_embedding extensions.vector(512),
  p_max_distance double precision,
  p_since timestamptz
)
returns table (id uuid, story_id uuid, title text, title_en text, distance double precision)
language sql
stable
set search_path = public, extensions
as $$
  select
    fi.id,
    fi.story_id,
    fi.title,
    fi.title_en,
    (fi.title_embedding <=> p_embedding)::double precision as distance
  from public.feed_items fi
  where fi.title_embedding is not null
    and fi.created_at >= p_since
    and (fi.title_embedding <=> p_embedding) <= p_max_distance
  order by fi.title_embedding <=> p_embedding
  limit 1;
$$;
revoke all on function public.find_similar_recent_feed_item(
  extensions.vector, double precision, timestamptz
) from public, anon, authenticated;

drop function if exists public.find_exact_recent_feed_items(text[], text[], timestamptz);
create function public.find_exact_recent_feed_items(
  p_links text[],
  p_titles text[],
  p_since timestamptz
)
returns table (id uuid, story_id uuid, link text, title text, title_en text)
language sql
stable
security definer
set search_path = public
as $$
  select fi.id, fi.story_id, fi.link, fi.title, fi.title_en
  from public.feed_items fi
  where fi.created_at >= p_since
    and (
      (fi.link is not null and fi.link = any(p_links))
      or fi.title_en = any(p_titles)
      or fi.title = any(p_titles)
    );
$$;
revoke all on function public.find_exact_recent_feed_items(text[], text[], timestamptz)
  from public, anon, authenticated;

-- 2. The Inbox and Archive read stories through one function. RLS applies
-- (security invoker): only articles from the caller's own subscriptions
-- count. Inbox: articles with no state of the caller's. Archive: articles
-- the caller archived. A story's activity time is its newest such article,
-- so a new source moves it back to the top and undated articles sort by
-- arrival.
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
