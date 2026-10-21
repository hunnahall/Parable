-- Inbox rows show a read time and the article's language (roadmap R5, R6).
--
-- 1. Word count of the stored text. A generated column, so every row,
-- including those already stored, has it without a change to ingest.
alter table public.feed_item_texts
  add column if not exists word_count integer
  generated always as (coalesce(array_length(regexp_split_to_array(btrim(text), '\s+'), 1), 0)) stored;

-- 2. story_feed returns each source's word count (only when the full text
-- was fetched; a teaser's length says nothing about the article) and its
-- detected language. Same signature, so callers and inbox_story_count are
-- unchanged.
create or replace function public.story_feed(
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
      fi.original_language,
      case when t.kind = 'full' then t.word_count end as word_count,
      coalesce(s.title, f.title) as feed_title,
      s.category_id,
      a.archived_at
    from public.feed_items fi
    join public.subscriptions s on s.feed_id = fi.feed_id and s.user_id = (select auth.uid())
    join public.feeds f on f.id = fi.feed_id
    left join public.feed_item_texts t on t.feed_item_id = fi.id
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
          'image_url', v.image_url, 'summary', v.summary_ai, 'archived_at', v.archived_at,
          'word_count', v.word_count, 'language', v.original_language
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
