-- Parable's whole database schema, read from the live project
-- (zcmshidmknpqfvzdakoh) on 2026-11-08 with pg_get_functiondef,
-- pg_get_constraintdef, pg_indexes, pg_policies and pg_get_triggerdef.
--
-- This is the file to rebuild from. The files in migrations/ record how
-- the schema got here, but they aren't a replay: the live project's
-- migration history starts on 2026-08-16 (the first 32 migrations predate
-- this folder), the live versions are apply times rather than these file
-- names, and step 13 is two live migrations (feed_numbers, then
-- feed_numbers_counting_start) but one file here.
--
-- To rebuild: create a Supabase project, run this file, then cron.sql
-- (after storing CRON_SECRET in Vault, see there). Supabase's default
-- grants on tables (anon, authenticated, service_role) are assumed; RLS
-- below is what limits them. Regenerate this file after any migration.

-- Extensions ---------------------------------------------------------------

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists vector with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- Tables -------------------------------------------------------------------

-- The shared catalog: one row per feed URL. Written only by the service role.
create table public.feeds (
  id uuid default gen_random_uuid() not null,
  url text not null,
  title text,
  site_url text,
  last_fetched_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  last_error text,
  is_scraped boolean default false not null,
  consecutive_failures integer default 0 not null,
  deleted_at timestamp with time zone
);

-- One row per article, shared by every subscriber. Deleted by retention.
create table public.feed_items (
  id uuid default gen_random_uuid() not null,
  feed_id uuid not null,
  guid text not null,
  title text,
  link text,
  published_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  original_language text,
  title_en text,
  summary_ai text,
  image_url text,
  title_embedding extensions.vector(512),
  search_vector tsvector generated always as (to_tsvector('simple'::regconfig, COALESCE(title_en, title, ''::text))) stored,
  story_id uuid not null
);

create table public.feed_item_texts (
  feed_item_id uuid not null,
  text text default ''::text not null,
  kind text not null,
  text_en text,
  extracted_at timestamp with time zone default now() not null,
  word_count integer generated always as (COALESCE(array_length(regexp_split_to_array(btrim(text), '\s+'::text), 1), 0)) stored
);

create table public.ingested_guids (
  feed_id uuid not null,
  guid text not null,
  first_seen_at timestamp with time zone default now() not null,
  last_seen_at timestamp with time zone default now() not null
);

-- summaries_reused and summaries_repaired are unused since titles-only
-- ingest (2026-10-20) and always 0.
create table public.ingest_runs (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  duration_ms integer not null,
  feeds_processed integer default 0 not null,
  feeds_failed integer default 0 not null,
  items_inserted integer default 0 not null,
  summaries_reused integer default 0 not null,
  summaries_repaired integer default 0 not null,
  translate_calls integer default 0 not null,
  translate_input_tokens integer default 0 not null,
  translate_output_tokens integer default 0 not null,
  translate_reasoning_tokens integer default 0 not null,
  summarize_calls integer default 0 not null,
  summarize_input_tokens integer default 0 not null,
  summarize_output_tokens integer default 0 not null,
  summarize_reasoning_tokens integer default 0 not null,
  embed_calls integer default 0 not null,
  embed_input_tokens integer default 0 not null,
  duplicates_found integer default 0 not null,
  texts_stored integer default 0 not null
);

create table public.ai_usage (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  feed_item_id uuid,
  kind text not null,
  input_tokens integer default 0 not null,
  output_tokens integer default 0 not null,
  reasoning_tokens integer default 0 not null,
  first_text_ms integer,
  created_at timestamp with time zone default now() not null
);

-- Project-wide settings. Today one key: automatic_updates_paused (jsonb
-- true or false; missing means false).
create table public.app_settings (
  key text not null,
  value jsonb not null,
  updated_at timestamp with time zone default now() not null,
  updated_by uuid
);

create table public.feed_daily_counts (
  feed_id uuid not null,
  day date not null,
  articles integer default 0 not null
);

create table public.feed_opens (
  user_id uuid not null,
  feed_id uuid not null,
  day date not null,
  opens integer default 0 not null
);

create table public.categories (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  name text not null,
  "position" integer default 0 not null,
  created_at timestamp with time zone default now() not null
);

create table public.subscriptions (
  user_id uuid not null,
  feed_id uuid not null,
  created_at timestamp with time zone default now() not null,
  title text,
  category_id uuid
);

create table public.folders (
  id uuid default gen_random_uuid() not null,
  name text not null,
  parent_id uuid,
  created_at timestamp with time zone default now() not null,
  user_id uuid not null
);

create table public.article_states (
  user_id uuid not null,
  feed_item_id uuid not null,
  state text not null,
  updated_at timestamp with time zone default now() not null,
  note text,
  archived_at timestamp with time zone
);

create table public.article_folders (
  feed_item_id uuid not null,
  folder_id uuid not null,
  user_id uuid not null,
  created_at timestamp with time zone default now() not null
);

create table public.read_items (
  user_id uuid not null,
  feed_item_id uuid not null,
  read_at timestamp with time zone default now() not null
);

create table public.story_views (
  user_id uuid not null,
  story_id uuid not null,
  seen_at timestamp with time zone default now() not null
);

create table public.filtered_titles (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  feed_id uuid,
  title text not null,
  link text,
  keyword text not null,
  filtered_at timestamp with time zone default now() not null
);

-- language, auto_delete_enabled: unused by the app (English is the only
-- target; filters are on whenever there are keywords).
create table public.user_preferences (
  user_id uuid not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  sidebar_collapsed boolean default false not null,
  language text default 'en'::text not null,
  auto_delete_enabled boolean default false not null,
  auto_delete_keywords text[] default '{}'::text[] not null,
  theme text default 'system'::text not null,
  inbox_view text default 'list'::text not null
);

-- Keys and checks ------------------------------------------------------------

alter table only public.ai_usage add constraint ai_usage_pkey PRIMARY KEY (id);
alter table only public.app_settings add constraint app_settings_pkey PRIMARY KEY (key);
alter table only public.article_folders add constraint article_folders_pkey PRIMARY KEY (feed_item_id, user_id, folder_id);
alter table only public.article_states add constraint article_states_pkey PRIMARY KEY (user_id, feed_item_id);
alter table only public.categories add constraint categories_pkey PRIMARY KEY (id);
alter table only public.feed_daily_counts add constraint feed_daily_counts_pkey PRIMARY KEY (feed_id, day);
alter table only public.feed_item_texts add constraint feed_item_texts_pkey PRIMARY KEY (feed_item_id);
alter table only public.feed_items add constraint feed_items_pkey PRIMARY KEY (id);
alter table only public.feed_opens add constraint feed_opens_pkey PRIMARY KEY (user_id, feed_id, day);
alter table only public.feeds add constraint feeds_pkey PRIMARY KEY (id);
alter table only public.filtered_titles add constraint filtered_titles_pkey PRIMARY KEY (id);
alter table only public.folders add constraint folders_pkey PRIMARY KEY (id);
alter table only public.ingest_runs add constraint ingest_runs_pkey PRIMARY KEY (id);
alter table only public.ingested_guids add constraint ingested_guids_pkey PRIMARY KEY (feed_id, guid);
alter table only public.read_items add constraint read_items_pkey PRIMARY KEY (user_id, feed_item_id);
alter table only public.story_views add constraint story_views_pkey PRIMARY KEY (user_id, story_id);
alter table only public.subscriptions add constraint subscriptions_pkey PRIMARY KEY (user_id, feed_id);
alter table only public.user_preferences add constraint user_preferences_pkey PRIMARY KEY (user_id);
alter table only public.feed_items add constraint feed_items_feed_id_guid_key UNIQUE (feed_id, guid);

alter table only public.ai_usage add constraint ai_usage_kind_check CHECK ((kind = ANY (ARRAY['summary'::text, 'reader'::text])));
alter table only public.article_states add constraint article_states_state_check CHECK ((state = ANY (ARRAY['saved'::text, 'archived'::text, 'deleted'::text])));
alter table only public.feed_item_texts add constraint feed_item_texts_kind_check CHECK ((kind = ANY (ARRAY['full'::text, 'teaser'::text, 'none'::text])));
alter table only public.user_preferences add constraint user_preferences_inbox_view_check CHECK ((inbox_view = ANY (ARRAY['list'::text, 'front'::text])));
alter table only public.user_preferences add constraint user_preferences_theme_check CHECK ((theme = ANY (ARRAY['system'::text, 'dark'::text, 'light'::text])));

alter table only public.ai_usage add constraint ai_usage_feed_item_id_fkey FOREIGN KEY (feed_item_id) REFERENCES public.feed_items(id) ON DELETE SET NULL;
alter table only public.ai_usage add constraint ai_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table only public.app_settings add constraint app_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table only public.article_folders add constraint article_folders_feed_item_id_fkey FOREIGN KEY (feed_item_id) REFERENCES public.feed_items(id) ON DELETE CASCADE;
alter table only public.article_folders add constraint article_folders_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.folders(id) ON DELETE CASCADE;
alter table only public.article_folders add constraint article_folders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table only public.article_states add constraint article_states_feed_item_id_fkey FOREIGN KEY (feed_item_id) REFERENCES public.feed_items(id) ON DELETE CASCADE;
alter table only public.article_states add constraint article_states_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table only public.categories add constraint categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table only public.feed_daily_counts add constraint feed_daily_counts_feed_id_fkey FOREIGN KEY (feed_id) REFERENCES public.feeds(id) ON DELETE CASCADE;
alter table only public.feed_item_texts add constraint feed_item_texts_feed_item_id_fkey FOREIGN KEY (feed_item_id) REFERENCES public.feed_items(id) ON DELETE CASCADE;
alter table only public.feed_items add constraint feed_items_feed_id_fkey FOREIGN KEY (feed_id) REFERENCES public.feeds(id) ON DELETE CASCADE;
alter table only public.feed_opens add constraint feed_opens_feed_id_fkey FOREIGN KEY (feed_id) REFERENCES public.feeds(id) ON DELETE CASCADE;
alter table only public.feed_opens add constraint feed_opens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table only public.filtered_titles add constraint filtered_titles_feed_id_fkey FOREIGN KEY (feed_id) REFERENCES public.feeds(id) ON DELETE SET NULL;
alter table only public.filtered_titles add constraint filtered_titles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table only public.folders add constraint folders_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.folders(id) ON DELETE CASCADE;
alter table only public.folders add constraint folders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table only public.ingested_guids add constraint ingested_guids_feed_id_fkey FOREIGN KEY (feed_id) REFERENCES public.feeds(id) ON DELETE CASCADE;
alter table only public.read_items add constraint read_items_feed_item_id_fkey FOREIGN KEY (feed_item_id) REFERENCES public.feed_items(id) ON DELETE CASCADE;
alter table only public.read_items add constraint read_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table only public.story_views add constraint story_views_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table only public.subscriptions add constraint subscriptions_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;
alter table only public.subscriptions add constraint subscriptions_feed_id_fkey FOREIGN KEY (feed_id) REFERENCES public.feeds(id) ON DELETE CASCADE;
alter table only public.subscriptions add constraint subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table only public.user_preferences add constraint user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Indexes ------------------------------------------------------------------

CREATE INDEX ai_usage_created_at_idx ON public.ai_usage USING btree (created_at);
CREATE INDEX article_folders_folder_id_idx ON public.article_folders USING btree (folder_id);
CREATE INDEX article_folders_user_folder_idx ON public.article_folders USING btree (user_id, folder_id);
CREATE INDEX article_folders_user_id_idx ON public.article_folders USING btree (user_id);
CREATE INDEX article_states_feed_item_id_state_idx ON public.article_states USING btree (feed_item_id, state);
CREATE UNIQUE INDEX categories_user_name_unique ON public.categories USING btree (user_id, lower(name));
CREATE INDEX categories_user_position_idx ON public.categories USING btree (user_id, "position");
CREATE INDEX feed_items_created_at_idx ON public.feed_items USING btree (created_at);
CREATE INDEX feed_items_feed_id_published_at_idx ON public.feed_items USING btree (feed_id, published_at DESC);
CREATE INDEX feed_items_published_at_idx ON public.feed_items USING btree (published_at);
CREATE INDEX feed_items_search_vector_idx ON public.feed_items USING gin (search_vector);
CREATE INDEX feed_items_story_id_idx ON public.feed_items USING btree (story_id);
CREATE INDEX feed_items_title_embedding_idx ON public.feed_items USING hnsw (title_embedding extensions.vector_cosine_ops);
CREATE UNIQUE INDEX feeds_url_active_unique ON public.feeds USING btree (url) WHERE (deleted_at IS NULL);
CREATE INDEX filtered_titles_user_time_idx ON public.filtered_titles USING btree (user_id, filtered_at DESC);
CREATE INDEX folders_parent_id_idx ON public.folders USING btree (parent_id);
CREATE INDEX folders_user_id_idx ON public.folders USING btree (user_id);
CREATE UNIQUE INDEX folders_user_name_parent_unique ON public.folders USING btree (user_id, parent_id, name) NULLS NOT DISTINCT;
CREATE INDEX ingest_runs_created_at_idx ON public.ingest_runs USING btree (created_at DESC);
CREATE INDEX ingested_guids_first_seen_at_idx ON public.ingested_guids USING btree (first_seen_at);
CREATE INDEX ingested_guids_last_seen_at_idx ON public.ingested_guids USING btree (last_seen_at);
CREATE INDEX read_items_feed_item_id_idx ON public.read_items USING btree (feed_item_id);
CREATE INDEX subscriptions_category_idx ON public.subscriptions USING btree (category_id);
CREATE INDEX subscriptions_feed_id_idx ON public.subscriptions USING btree (feed_id);
CREATE INDEX subscriptions_user_id_idx ON public.subscriptions USING btree (user_id);

-- Functions ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.automatic_updates_paused()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select value = 'true'::jsonb from public.app_settings where key = 'automatic_updates_paused'),
    false
  );
$function$;

-- Trigger: each new article adds 1 to its feed's count for the day.
CREATE OR REPLACE FUNCTION public.count_feed_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.feed_daily_counts (feed_id, day, articles)
  values (new.feed_id, (new.created_at at time zone 'utc')::date, 1)
  on conflict (feed_id, day) do update
    set articles = public.feed_daily_counts.articles + 1;
  return null;
end;
$function$;

-- Trigger: each first open of an article adds 1 to the reader's opens for
-- its feed that day.
CREATE OR REPLACE FUNCTION public.count_feed_open()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.feed_opens (user_id, feed_id, day, opens)
  select new.user_id, fi.feed_id, (now() at time zone 'utc')::date, 1
  from public.feed_items fi
  where fi.id = new.feed_item_id
  on conflict (user_id, feed_id, day) do update
    set opens = public.feed_opens.opens + 1;
  return null;
end;
$function$;

-- Used by the Saved list (src/lib/articles/list.ts) and full reset.
CREATE OR REPLACE FUNCTION public.feed_items_excluding_states(p_user_id uuid, p_exclude_states text[])
 RETURNS SETOF feed_items
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select fi.* from feed_items fi
  where (
      exists (
        select 1 from subscriptions s
         where s.feed_id = fi.feed_id and s.user_id = p_user_id
      )
      or exists (
        select 1 from article_states a
         where a.feed_item_id = fi.id and a.user_id = p_user_id
      )
    )
    and not exists (
      select 1 from article_states a
       where a.feed_item_id = fi.id
         and a.user_id = p_user_id
         and a.state = any(p_exclude_states)
    )
$function$;

CREATE OR REPLACE FUNCTION public.feed_items_with_state(p_user_id uuid, p_state text)
 RETURNS SETOF feed_items
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select fi.* from feed_items fi
  where exists (
    select 1 from article_states a
     where a.feed_item_id = fi.id and a.user_id = p_user_id and a.state = p_state
  )
$function$;

-- The Feeds page's articles a day and opens, per subscribed feed.
CREATE OR REPLACE FUNCTION public.feed_numbers()
 RETURNS TABLE(feed_id uuid, articles bigint, opens bigint, days numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with spans as (
    select
      s.feed_id,
      greatest(
        s.created_at,
        now() - interval '7 days',
        (select min(c.day) from public.feed_daily_counts c)::timestamptz
      ) as since
    from public.subscriptions s
    where s.user_id = (select auth.uid())
  )
  select
    sp.feed_id,
    coalesce((
      select sum(c.articles) from public.feed_daily_counts c
      where c.feed_id = sp.feed_id and c.day >= (sp.since at time zone 'utc')::date
    ), 0)::bigint,
    coalesce((
      select sum(o.opens) from public.feed_opens o
      where o.user_id = (select auth.uid()) and o.feed_id = sp.feed_id
        and o.day >= (sp.since at time zone 'utc')::date
    ), 0)::bigint,
    greatest(extract(epoch from now() - sp.since) / 86400, 1)::numeric
  from spans sp;
$function$;

-- Ingest's free duplicate check: same link or title in the window.
CREATE OR REPLACE FUNCTION public.find_exact_recent_feed_items(p_links text[], p_titles text[], p_since timestamp with time zone)
 RETURNS TABLE(id uuid, story_id uuid, link text, title text, title_en text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select fi.id, fi.story_id, fi.link, fi.title, fi.title_en
  from public.feed_items fi
  where fi.created_at >= p_since
    and (
      (fi.link is not null and fi.link = any(p_links))
      or fi.title_en = any(p_titles)
      or fi.title = any(p_titles)
    );
$function$;

-- Ingest's vector duplicate check: nearest English title within distance.
CREATE OR REPLACE FUNCTION public.find_similar_recent_feed_item(p_embedding extensions.vector, p_max_distance double precision, p_since timestamp with time zone)
 RETURNS TABLE(id uuid, story_id uuid, title text, title_en text, distance double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
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
$function$;

-- The Inbox and Archive: the caller's articles grouped into stories.
CREATE OR REPLACE FUNCTION public.story_feed(p_view text, p_query text DEFAULT NULL::text, p_limit integer DEFAULT 600)
 RETURNS TABLE(story_id uuid, last_activity_at timestamp with time zone, seen_at timestamp with time zone, items jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
$function$;

-- Unused by the app since 2026-10-22 (the counts come from story_feed's
-- rows); kept in the live project.
CREATE OR REPLACE FUNCTION public.inbox_category_counts()
 RETURNS TABLE(category_id uuid, stories bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select (src->>'category_id')::uuid, count(distinct f.story_id)
  from public.story_feed('inbox', null, 100000) f
  cross join lateral jsonb_array_elements(f.items) src
  where src->>'category_id' is not null
  group by 1;
$function$;

CREATE OR REPLACE FUNCTION public.inbox_story_count()
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select count(*) from public.story_feed('inbox', null, 100000);
$function$;

-- Retention, stage 1: untouched articles past 12h become tombstones.
CREATE OR REPLACE FUNCTION public.purge_stale_inbox_articles(dry_run boolean DEFAULT false)
 RETURNS TABLE(deleted_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- Retention, stage 2: archived articles past 24h become tombstones.
CREATE OR REPLACE FUNCTION public.purge_expired_archived_articles(dry_run boolean DEFAULT false)
 RETURNS TABLE(deleted_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- Retention, stage 3: delete the shared row once nobody saved it and every
-- subscriber tombstoned it.
CREATE OR REPLACE FUNCTION public.reclaim_orphaned_feed_items(dry_run boolean DEFAULT false)
 RETURNS TABLE(reclaimed_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  affected bigint;
begin
  create temp table _orphaned on commit drop as
  select fi.id
  from public.feed_items fi
  where fi.created_at < now() - interval '12 hours'
    and not exists (
      select 1 from public.article_states a
      where a.feed_item_id = fi.id and a.state = 'saved'
    )
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
    delete from public.feed_items fi using _orphaned o where fi.id = o.id;
  end if;

  return query select affected;
end;
$function$;

-- Retention, stage 4.
CREATE OR REPLACE FUNCTION public.purge_ingested_guids(dry_run boolean DEFAULT false)
 RETURNS TABLE(deleted_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- Retention, stage 5.
CREATE OR REPLACE FUNCTION public.purge_story_views(dry_run boolean DEFAULT false)
 RETURNS TABLE(deleted_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- Retention, stage 6.
CREATE OR REPLACE FUNCTION public.purge_filtered_titles(dry_run boolean DEFAULT false)
 RETURNS TABLE(deleted_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  affected bigint;
begin
  select count(*) into affected
  from public.filtered_titles
  where filtered_at < now() - interval '48 hours';

  if not dry_run then
    delete from public.filtered_titles
    where filtered_at < now() - interval '48 hours';
  end if;

  return query select affected;
end;
$function$;

-- Retention, stage 7.
CREATE OR REPLACE FUNCTION public.purge_feed_counts(dry_run boolean DEFAULT false)
 RETURNS TABLE(deleted_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  affected bigint;
  cutoff date := (now() at time zone 'utc')::date - 30;
begin
  select
    (select count(*) from public.feed_daily_counts where day < cutoff)
    + (select count(*) from public.feed_opens where day < cutoff)
  into affected;

  if not dry_run then
    delete from public.feed_daily_counts where day < cutoff;
    delete from public.feed_opens where day < cutoff;
  end if;

  return query select affected;
end;
$function$;

-- All seven retention stages in order; the hourly cron job calls this.
CREATE OR REPLACE FUNCTION public.run_retention(dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  stale bigint;
  expired bigint;
  reclaimed bigint;
  guids bigint;
  views bigint;
  filtered bigint;
  counts bigint;
begin
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
$function$;

-- Who may call what. PostgREST exposes every public function at
-- /rest/v1/rpc/<name>, so the security definer functions (retention above
-- all: it could wipe every Inbox) run only as the service role.
revoke execute on function
  public.automatic_updates_paused(),
  public.count_feed_item(),
  public.count_feed_open(),
  public.find_exact_recent_feed_items(text[], text[], timestamp with time zone),
  public.find_similar_recent_feed_item(extensions.vector, double precision, timestamp with time zone),
  public.purge_stale_inbox_articles(boolean),
  public.purge_expired_archived_articles(boolean),
  public.reclaim_orphaned_feed_items(boolean),
  public.purge_ingested_guids(boolean),
  public.purge_story_views(boolean),
  public.purge_filtered_titles(boolean),
  public.purge_feed_counts(boolean),
  public.run_retention(boolean)
from public, anon, authenticated;

revoke execute on function
  public.feed_numbers(),
  public.story_feed(text, text, integer),
  public.inbox_category_counts(),
  public.inbox_story_count()
from public, anon;

-- Triggers -----------------------------------------------------------------

CREATE TRIGGER feed_items_count AFTER INSERT ON public.feed_items FOR EACH ROW EXECUTE FUNCTION public.count_feed_item();
CREATE TRIGGER read_items_count AFTER INSERT ON public.read_items FOR EACH ROW EXECUTE FUNCTION public.count_feed_open();

-- Row level security ---------------------------------------------------------
-- Tables with RLS and no policy for a role are closed to it. Writes to
-- feeds, feed_items, feed_item_texts, ingested_guids, ingest_runs, ai_usage
-- and app_settings go through the service role, which bypasses RLS;
-- feed_daily_counts and feed_opens are written by the triggers above.

alter table public.ai_usage enable row level security;
alter table public.app_settings enable row level security;
alter table public.article_folders enable row level security;
alter table public.article_states enable row level security;
alter table public.categories enable row level security;
alter table public.feed_daily_counts enable row level security;
alter table public.feed_item_texts enable row level security;
alter table public.feed_items enable row level security;
alter table public.feed_opens enable row level security;
alter table public.feeds enable row level security;
alter table public.filtered_titles enable row level security;
alter table public.folders enable row level security;
alter table public.ingest_runs enable row level security;
alter table public.ingested_guids enable row level security;
alter table public.read_items enable row level security;
alter table public.story_views enable row level security;
alter table public.subscriptions enable row level security;
alter table public.user_preferences enable row level security;

create policy "Signed-in users read AI usage" on public.ai_usage as permissive for select to authenticated using (true);
create policy "Signed-in users read app settings" on public.app_settings as permissive for select to authenticated using (true);
create policy "Users manage their own article folders" on public.article_folders as permissive for all to authenticated using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));
create policy "Users manage their own article states" on public.article_states as permissive for all to authenticated using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));
create policy "Users manage their own categories" on public.categories as permissive for all to authenticated using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));
create policy "Signed-in users read feed counts" on public.feed_daily_counts as permissive for select to authenticated using (true);
create policy "Users read text of articles they can see" on public.feed_item_texts as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM feed_items fi
  WHERE (fi.id = feed_item_texts.feed_item_id))));
create policy "Users read articles from feeds they subscribe to" on public.feed_items as permissive for select to authenticated using (((EXISTS ( SELECT 1
   FROM subscriptions s
  WHERE ((s.feed_id = feed_items.feed_id) AND (s.user_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM article_states a
  WHERE ((a.feed_item_id = feed_items.id) AND (a.user_id = ( SELECT auth.uid() AS uid)))))));
create policy "Users delete their own feed opens" on public.feed_opens as permissive for delete to authenticated using ((( SELECT auth.uid() AS uid) = user_id));
create policy "Users read their own feed opens" on public.feed_opens as permissive for select to authenticated using ((( SELECT auth.uid() AS uid) = user_id));
create policy "Signed-in users read the feed catalog" on public.feeds as permissive for select to authenticated using (true);
create policy "Users log their own filtered titles" on public.filtered_titles as permissive for insert to authenticated with check ((( SELECT auth.uid() AS uid) = user_id));
create policy "Users read their own filtered titles" on public.filtered_titles as permissive for select to authenticated using ((( SELECT auth.uid() AS uid) = user_id));
create policy "Users manage their own folders" on public.folders as permissive for all to authenticated using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));
create policy "ingest_runs readable by authenticated" on public.ingest_runs as permissive for select to authenticated using (true);
create policy "Users manage their own read items" on public.read_items as permissive for all to authenticated using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));
create policy "Users manage their own story views" on public.story_views as permissive for all to authenticated using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));
create policy "Users manage their own subscriptions" on public.subscriptions as permissive for all to authenticated using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));
create policy "Users manage their own preferences" on public.user_preferences as permissive for all to authenticated using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));
