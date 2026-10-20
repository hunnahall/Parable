-- Titles-only ingest (roadmap step 3, 2026-10-20). Ingest translates
-- titles, filters, groups and stores each article's text; it writes no
-- summary. Summaries and the translated reader view are made on request
-- from the stored text.

-- 1. Article text, one row per article. A separate table keeps the list
-- queries light. The cascade deletes the text with its article, so an
-- archived article keeps its text for as long as the article exists.
create table if not exists public.feed_item_texts (
  feed_item_id uuid primary key references public.feed_items(id) on delete cascade,
  -- Cleaned plain text in the source language.
  text text not null default '',
  -- full: the article; teaser: only a preview could be fetched (paywall,
  -- bot blocking); none: nothing usable.
  kind text not null check (kind in ('full', 'teaser', 'none')),
  -- The English reader view, written the first time someone opens it.
  text_en text,
  extracted_at timestamptz not null default now()
);

alter table public.feed_item_texts enable row level security;

-- Readable wherever the article itself is (feed_items' own policy applies
-- inside the subquery). Only the service role writes.
create policy "Users read text of articles they can see" on public.feed_item_texts
  for select to authenticated
  using (exists (select 1 from public.feed_items fi where fi.id = feed_item_id));

-- 2. Duplicate detection matches any recent article, not only summarized
-- ones; otherwise grouping stops working once nothing is summarized at
-- ingest. Return types change, so drop and recreate.
drop function if exists public.find_similar_recent_feed_item(extensions.vector, double precision, timestamptz);

create function public.find_similar_recent_feed_item(
  p_embedding extensions.vector(512),
  p_max_distance double precision,
  p_since timestamptz
)
returns table (id uuid, title text, title_en text, distance double precision)
language sql
stable
set search_path = public, extensions
as $$
  select
    fi.id,
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
returns table (id uuid, link text, title text, title_en text)
language sql
stable
security definer
set search_path = public
as $$
  select fi.id, fi.link, fi.title, fi.title_en
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

-- 3. Search is by translated title only.
alter table public.feed_items drop column if exists search_vector;
alter table public.feed_items
  add column search_vector tsvector
  generated always as (to_tsvector('simple', coalesce(title_en, title, ''))) stored;
create index if not exists feed_items_search_vector_idx
  on public.feed_items using gin (search_vector);

-- 4. Automatic filing rules are gone: saving is always the user's call.
drop table if exists public.filter_rules;

-- 5. Ingest's seen-set remembers a guid for 72 hours after it was last
-- seen in its feed, not after it was first seen. Feeds without dates (and
-- Build a Feed pages) are accepted by arrival time, so a story that sat on
-- a page for more than 72 hours used to come back as new.
alter table public.ingested_guids
  add column if not exists last_seen_at timestamptz not null default now();
update public.ingested_guids set last_seen_at = first_seen_at;
create index if not exists ingested_guids_last_seen_at_idx
  on public.ingested_guids (last_seen_at);

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
  where last_seen_at < now() - interval '72 hours';

  if not dry_run then
    delete from public.ingested_guids
    where last_seen_at < now() - interval '72 hours';
  end if;

  return query select affected;
end;
$$;

revoke all on function public.purge_ingested_guids(boolean)
  from public, anon, authenticated;

-- 6. Run records count duplicates found and texts stored. The summary
-- columns stay for history; new runs leave them at 0.
alter table public.ingest_runs
  add column if not exists duplicates_found integer not null default 0,
  add column if not exists texts_stored integer not null default 0;
