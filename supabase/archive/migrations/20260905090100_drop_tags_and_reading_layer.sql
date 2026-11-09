-- Parable is a summarizer now, not a reader. Three things go at once
-- because they're all consequences of the same change:
--
--   * Tags are removed in favour of folders (see the previous migration).
--   * The Read queue and the reading view are gone — articles link out to
--     the publisher, so there is no 'reading' state and no cached body.
--   * Every article gets a two-sentence summary at ingest, so the
--     per-subscription opt-in and the raw feed description it used to fall
--     back to are both dead weight.

alter table public.article_states drop column if exists tags;

-- Anything still sitting in the Read queue was something the user meant to
-- keep, so it lands in Save rather than being dropped on the floor.
update public.article_states set state = 'saved' where state = 'reading';

alter table public.article_states drop constraint if exists article_states_state_check;

alter table public.article_states
  add constraint article_states_state_check
  check (state = any (array['saved', 'archived', 'deleted']));

-- The extracted body is now read once during ingest, summarized, and
-- discarded. Nothing stores it, so nothing needs this cache.
drop table if exists public.article_content;

-- Summaries are unconditional; the per-subscription toggle is gone.
alter table public.subscriptions drop column if exists summarize_articles;

-- search_vector is a generated column referencing summary/summary_en, so
-- it has to be rebuilt before those columns can be dropped. summary_ai is
-- the only summary that exists now.
alter table public.feed_items drop column if exists search_vector;

alter table public.feed_items drop column if exists summary;
alter table public.feed_items drop column if exists summary_en;

alter table public.feed_items
  add column search_vector tsvector
  generated always as (
    setweight(to_tsvector('simple', coalesce(title_en, title, '')), 'A')
    || setweight(to_tsvector('simple', coalesce(summary_ai, '')), 'B')
  ) stored;

create index if not exists feed_items_search_vector_idx
  on public.feed_items using gin (search_vector);

-- Long-dead columns, cleared out while the table is already being altered.
alter table public.feeds drop column if exists translate_enabled;
alter table public.feed_items drop column if exists translate_enabled;
alter table public.user_preferences drop column if exists theme;
