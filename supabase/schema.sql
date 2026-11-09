-- Baseline for the `parable` schema in the shared Covenant Works project,
-- generated on 2026-11-08 from the old project's `public` schema with
-- `public.` renamed to `parable.`.
create schema if not exists parable;
grant usage on schema parable to anon, authenticated, service_role;
alter default privileges for role postgres in schema parable grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema parable grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema parable grant all on functions to anon, authenticated, service_role;
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: automatic_updates_paused(); Type: FUNCTION; Schema: parable; Owner: -
--

CREATE FUNCTION parable.automatic_updates_paused() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'parable'
    AS $$
  select coalesce(
    (select value = 'true'::jsonb from parable.app_settings where key = 'automatic_updates_paused'),
    false
  );
$$;


--
-- Name: count_feed_item(); Type: FUNCTION; Schema: parable; Owner: -
--

CREATE FUNCTION parable.count_feed_item() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'parable'
    AS $$
begin
  insert into parable.feed_daily_counts (feed_id, day, articles)
  values (new.feed_id, (new.created_at at time zone 'utc')::date, 1)
  on conflict (feed_id, day) do update
    set articles = parable.feed_daily_counts.articles + 1;
  return null;
end;
$$;


--
-- Name: count_feed_open(); Type: FUNCTION; Schema: parable; Owner: -
--

CREATE FUNCTION parable.count_feed_open() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'parable'
    AS $$
begin
  insert into parable.feed_opens (user_id, feed_id, day, opens)
  select new.user_id, fi.feed_id, (now() at time zone 'utc')::date, 1
  from parable.feed_items fi
  where fi.id = new.feed_item_id
  on conflict (user_id, feed_id, day) do update
    set opens = parable.feed_opens.opens + 1;
  return null;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: feed_items; Type: TABLE; Schema: parable; Owner: -
--

CREATE TABLE parable.feed_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    feed_id uuid NOT NULL,
    guid text NOT NULL,
    title text,
    link text,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    original_language text,
    title_en text,
    summary_ai text,
    image_url text,
    title_embedding extensions.vector(512),
    search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, COALESCE(title_en, title, ''::text))) STORED,
    story_id uuid NOT NULL
);


--
-- Name: feed_items_excluding_states(uuid, text[]); Type: FUNCTION; Schema: parable; Owner: -
--

CREATE FUNCTION parable.feed_items_excluding_states(p_user_id uuid, p_exclude_states text[]) RETURNS SETOF parable.feed_items
    LANGUAGE sql STABLE
    SET search_path TO 'parable'
    AS $$
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
$$;


--
-- Name: feed_items_with_state(uuid, text); Type: FUNCTION; Schema: parable; Owner: -
--

CREATE FUNCTION parable.feed_items_with_state(p_user_id uuid, p_state text) RETURNS SETOF parable.feed_items
    LANGUAGE sql STABLE
    SET search_path TO 'parable'
    AS $$
  select fi.* from feed_items fi
  where exists (
    select 1 from article_states a
     where a.feed_item_id = fi.id and a.user_id = p_user_id and a.state = p_state
  )
$$;


--
-- Name: feed_numbers(); Type: FUNCTION; Schema: parable; Owner: -
--

CREATE FUNCTION parable.feed_numbers() RETURNS TABLE(feed_id uuid, articles bigint, opens bigint, days numeric)
    LANGUAGE sql STABLE
    SET search_path TO 'parable'
    AS $$
  with spans as (
    select
      s.feed_id,
      greatest(
        s.created_at,
        now() - interval '7 days',
        (select min(c.day) from parable.feed_daily_counts c)::timestamptz
      ) as since
    from parable.subscriptions s
    where s.user_id = (select auth.uid())
  )
  select
    sp.feed_id,
    coalesce((
      select sum(c.articles) from parable.feed_daily_counts c
      where c.feed_id = sp.feed_id and c.day >= (sp.since at time zone 'utc')::date
    ), 0)::bigint,
    coalesce((
      select sum(o.opens) from parable.feed_opens o
      where o.user_id = (select auth.uid()) and o.feed_id = sp.feed_id
        and o.day >= (sp.since at time zone 'utc')::date
    ), 0)::bigint,
    greatest(extract(epoch from now() - sp.since) / 86400, 1)::numeric
  from spans sp;
$$;


--
-- Name: find_exact_recent_feed_items(text[], text[], timestamp with time zone); Type: FUNCTION; Schema: parable; Owner: -
--

CREATE FUNCTION parable.find_exact_recent_feed_items(p_links text[], p_titles text[], p_since timestamp with time zone) RETURNS TABLE(id uuid, story_id uuid, link text, title text, title_en text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'parable'
    AS $$
  select fi.id, fi.story_id, fi.link, fi.title, fi.title_en
  from parable.feed_items fi
  where fi.created_at >= p_since
    and (
      (fi.link is not null and fi.link = any(p_links))
      or fi.title_en = any(p_titles)
      or fi.title = any(p_titles)
    );
$$;


--
-- Name: find_similar_recent_feed_item(extensions.vector, double precision, timestamp with time zone); Type: FUNCTION; Schema: parable; Owner: -
--

CREATE FUNCTION parable.find_similar_recent_feed_item(p_embedding extensions.vector, p_max_distance double precision, p_since timestamp with time zone) RETURNS TABLE(id uuid, story_id uuid, title text, title_en text, distance double precision)
    LANGUAGE sql STABLE
    SET search_path TO 'parable', 'extensions'
    AS $$
  select
    fi.id,
    fi.story_id,
    fi.title,
    fi.title_en,
    (fi.title_embedding <=> p_embedding)::double precision as distance
  from parable.feed_items fi
  where fi.title_embedding is not null
    and fi.created_at >= p_since
    and (fi.title_embedding <=> p_embedding) <= p_max_distance
  order by fi.title_embedding <=> p_embedding
  limit 1;
$$;


--
-- Name: inbox_category_counts(); Type: FUNCTION; Schema: parable; Owner: -
--

CREATE FUNCTION parable.inbox_category_counts() RETURNS TABLE(category_id uuid, stories bigint)
    LANGUAGE sql STABLE
    SET search_path TO 'parable'
    AS $$
  select (src->>'category_id')::uuid, count(distinct f.story_id)
  from parable.story_feed('inbox', null, 100000) f
  cross join lateral jsonb_array_elements(f.items) src
  where src->>'category_id' is not null
  group by 1;
$$;


--
-- Name: inbox_story_count(); Type: FUNCTION; Schema: parable; Owner: -
--

CREATE FUNCTION parable.inbox_story_count() RETURNS bigint
    LANGUAGE sql STABLE
    SET search_path TO 'parable'
    AS $$
  select count(*) from parable.story_feed('inbox', null, 100000);
$$;


--
-- Name: purge_expired_archived_articles(boolean); Type: FUNCTION; Schema: parable; Owner: -
--

CREATE FUNCTION parable.purge_expired_archived_articles(dry_run boolean DEFAULT false) RETURNS TABLE(deleted_count bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'parable'
    AS $$
declare
  affected bigint;
begin
  select count(*) into affected
  from parable.article_states
  where state = 'archived'
    and archived_at is not null
    and archived_at < now() - interval '24 hours';

  if not dry_run then
    update parable.article_states
    set state = 'deleted', archived_at = now()
    where state = 'archived'
      and archived_at is not null
      and archived_at < now() - interval '24 hours';
  end if;

  return query select affected;
end;
$$;


--
-- Name: purge_feed_counts(boolean); Type: FUNCTION; Schema: parable; Owner: -
--

CREATE FUNCTION parable.purge_feed_counts(dry_run boolean DEFAULT false) RETURNS TABLE(deleted_count bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'parable'
    AS $$
declare
  affected bigint;
  cutoff date := (now() at time zone 'utc')::date - 30;
begin
  select
    (select count(*) from parable.feed_daily_counts where day < cutoff)
    + (select count(*) from parable.feed_opens where day < cutoff)
  into affected;

  if not dry_run then
    delete from parable.feed_daily_counts where day < cutoff;
    delete from parable.feed_opens where day < cutoff;
  end if;

  return query select affected;
end;
$$;


--
-- Name: purge_filtered_titles(boolean); Type: FUNCTION; Schema: parable; Owner: -
--

CREATE FUNCTION parable.purge_filtered_titles(dry_run boolean DEFAULT false) RETURNS TABLE(deleted_count bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'parable'
    AS $$
declare
  affected bigint;
begin
  select count(*) into affected
  from parable.filtered_titles
  where filtered_at < now() - interval '48 hours';

  if not dry_run then
    delete from parable.filtered_titles
    where filtered_at < now() - interval '48 hours';
  end if;

  return query select affected;
end;
$$;


--
-- Name: purge_ingested_guids(boolean); Type: FUNCTION; Schema: parable; Owner: -
--

CREATE FUNCTION parable.purge_ingested_guids(dry_run boolean DEFAULT false) RETURNS TABLE(deleted_count bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'parable'
    AS $$
declare
  affected bigint;
begin
  select count(*) into affected
  from parable.ingested_guids
  where last_seen_at < now() - interval '72 hours';

  if not dry_run then
    delete from parable.ingested_guids
    where last_seen_at < now() - interval '72 hours';
  end if;

  return query select affected;
end;
$$;


--
-- Name: purge_stale_inbox_articles(boolean); Type: FUNCTION; Schema: parable; Owner: -
--

CREATE FUNCTION parable.purge_stale_inbox_articles(dry_run boolean DEFAULT false) RETURNS TABLE(deleted_count bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'parable'
    AS $$
declare
  affected bigint;
begin
  create temp table _stale on commit drop as
  select s.user_id, fi.id as feed_item_id
  from parable.subscriptions s
  join parable.feed_items fi on fi.feed_id = s.feed_id
  where fi.created_at < now() - interval '12 hours'
    and not exists (
      select 1 from parable.article_states a
      where a.feed_item_id = fi.id and a.user_id = s.user_id
    );

  select count(*) into affected from _stale;

  if not dry_run then
    insert into parable.article_states (user_id, feed_item_id, state, archived_at)
    select user_id, feed_item_id, 'deleted', now() from _stale
    on conflict (user_id, feed_item_id) do nothing;
  end if;

  return query select affected;
end;
$$;


--
-- Name: purge_story_views(boolean); Type: FUNCTION; Schema: parable; Owner: -
--

CREATE FUNCTION parable.purge_story_views(dry_run boolean DEFAULT false) RETURNS TABLE(deleted_count bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'parable'
    AS $$
declare
  affected bigint;
begin
  select count(*) into affected
  from parable.story_views
  where seen_at < now() - interval '48 hours';

  if not dry_run then
    delete from parable.story_views
    where seen_at < now() - interval '48 hours';
  end if;

  return query select affected;
end;
$$;


--
-- Name: reclaim_orphaned_feed_items(boolean); Type: FUNCTION; Schema: parable; Owner: -
--

CREATE FUNCTION parable.reclaim_orphaned_feed_items(dry_run boolean DEFAULT false) RETURNS TABLE(reclaimed_count bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'parable'
    AS $$
declare
  affected bigint;
begin
  create temp table _orphaned on commit drop as
  select fi.id
  from parable.feed_items fi
  where fi.created_at < now() - interval '12 hours'
    and not exists (
      select 1 from parable.article_states a
      where a.feed_item_id = fi.id and a.state = 'saved'
    )
    and not exists (
      select 1
      from parable.subscriptions s
      where s.feed_id = fi.feed_id
        and not exists (
          select 1 from parable.article_states a
          where a.feed_item_id = fi.id
            and a.user_id = s.user_id
            and a.state = 'deleted'
        )
    );

  select count(*) into affected from _orphaned;

  if not dry_run then
    delete from parable.feed_items fi using _orphaned o where fi.id = o.id;
  end if;

  return query select affected;
end;
$$;


--
-- Name: run_retention(boolean); Type: FUNCTION; Schema: parable; Owner: -
--

CREATE FUNCTION parable.run_retention(dry_run boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'parable'
    AS $$
declare
  stale bigint;
  expired bigint;
  reclaimed bigint;
  guids bigint;
  views bigint;
  filtered bigint;
  counts bigint;
begin
  select deleted_count into stale from parable.purge_stale_inbox_articles(dry_run);
  select deleted_count into expired from parable.purge_expired_archived_articles(dry_run);
  select reclaimed_count into reclaimed from parable.reclaim_orphaned_feed_items(dry_run);
  select deleted_count into guids from parable.purge_ingested_guids(dry_run);
  select deleted_count into views from parable.purge_story_views(dry_run);
  select deleted_count into filtered from parable.purge_filtered_titles(dry_run);
  select deleted_count into counts from parable.purge_feed_counts(dry_run);
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
$$;


--
-- Name: story_feed(text, text, integer); Type: FUNCTION; Schema: parable; Owner: -
--

CREATE FUNCTION parable.story_feed(p_view text, p_query text DEFAULT NULL::text, p_limit integer DEFAULT 600) RETURNS TABLE(story_id uuid, last_activity_at timestamp with time zone, seen_at timestamp with time zone, items jsonb)
    LANGUAGE sql STABLE
    SET search_path TO 'parable'
    AS $$
  with visible as (
    select
      fi.id, fi.story_id, fi.feed_id, fi.title, fi.title_en, fi.link,
      fi.published_at, fi.created_at, fi.image_url, fi.summary_ai,
      fi.original_language,
      case when t.kind = 'full' then t.word_count end as word_count,
      coalesce(s.title, f.title) as feed_title,
      s.category_id,
      a.archived_at
    from parable.feed_items fi
    join parable.subscriptions s on s.feed_id = fi.feed_id and s.user_id = (select auth.uid())
    join parable.feeds f on f.id = fi.feed_id
    left join parable.feed_item_texts t on t.feed_item_id = fi.id
    left join parable.article_states a
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
  left join parable.story_views sv
    on sv.story_id = g.story_id and sv.user_id = (select auth.uid())
  where g.matches
  order by g.last_activity_at desc, g.story_id desc
  limit p_limit;
$$;


--
-- Name: ai_usage; Type: TABLE; Schema: parable; Owner: -
--

CREATE TABLE parable.ai_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    feed_item_id uuid,
    kind text NOT NULL,
    input_tokens integer DEFAULT 0 NOT NULL,
    output_tokens integer DEFAULT 0 NOT NULL,
    reasoning_tokens integer DEFAULT 0 NOT NULL,
    first_text_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_usage_kind_check CHECK ((kind = ANY (ARRAY['summary'::text, 'reader'::text])))
);


--
-- Name: app_settings; Type: TABLE; Schema: parable; Owner: -
--

CREATE TABLE parable.app_settings (
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


--
-- Name: article_folders; Type: TABLE; Schema: parable; Owner: -
--

CREATE TABLE parable.article_folders (
    feed_item_id uuid NOT NULL,
    folder_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: article_states; Type: TABLE; Schema: parable; Owner: -
--

CREATE TABLE parable.article_states (
    user_id uuid NOT NULL,
    feed_item_id uuid NOT NULL,
    state text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    note text,
    archived_at timestamp with time zone,
    CONSTRAINT article_states_state_check CHECK ((state = ANY (ARRAY['saved'::text, 'archived'::text, 'deleted'::text])))
);


--
-- Name: categories; Type: TABLE; Schema: parable; Owner: -
--

CREATE TABLE parable.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: feed_daily_counts; Type: TABLE; Schema: parable; Owner: -
--

CREATE TABLE parable.feed_daily_counts (
    feed_id uuid NOT NULL,
    day date NOT NULL,
    articles integer DEFAULT 0 NOT NULL
);


--
-- Name: feed_item_texts; Type: TABLE; Schema: parable; Owner: -
--

CREATE TABLE parable.feed_item_texts (
    feed_item_id uuid NOT NULL,
    text text DEFAULT ''::text NOT NULL,
    kind text NOT NULL,
    text_en text,
    extracted_at timestamp with time zone DEFAULT now() NOT NULL,
    word_count integer GENERATED ALWAYS AS (COALESCE(array_length(regexp_split_to_array(btrim(text), '\s+'::text), 1), 0)) STORED,
    CONSTRAINT feed_item_texts_kind_check CHECK ((kind = ANY (ARRAY['full'::text, 'teaser'::text, 'none'::text])))
);


--
-- Name: feed_opens; Type: TABLE; Schema: parable; Owner: -
--

CREATE TABLE parable.feed_opens (
    user_id uuid NOT NULL,
    feed_id uuid NOT NULL,
    day date NOT NULL,
    opens integer DEFAULT 0 NOT NULL
);


--
-- Name: feeds; Type: TABLE; Schema: parable; Owner: -
--

CREATE TABLE parable.feeds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    url text NOT NULL,
    title text,
    site_url text,
    last_fetched_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_error text,
    is_scraped boolean DEFAULT false NOT NULL,
    consecutive_failures integer DEFAULT 0 NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: filtered_titles; Type: TABLE; Schema: parable; Owner: -
--

CREATE TABLE parable.filtered_titles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    feed_id uuid,
    title text NOT NULL,
    link text,
    keyword text NOT NULL,
    filtered_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: folders; Type: TABLE; Schema: parable; Owner: -
--

CREATE TABLE parable.folders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    parent_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid NOT NULL
);


--
-- Name: ingest_runs; Type: TABLE; Schema: parable; Owner: -
--

CREATE TABLE parable.ingest_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    duration_ms integer NOT NULL,
    feeds_processed integer DEFAULT 0 NOT NULL,
    feeds_failed integer DEFAULT 0 NOT NULL,
    items_inserted integer DEFAULT 0 NOT NULL,
    summaries_reused integer DEFAULT 0 NOT NULL,
    summaries_repaired integer DEFAULT 0 NOT NULL,
    translate_calls integer DEFAULT 0 NOT NULL,
    translate_input_tokens integer DEFAULT 0 NOT NULL,
    translate_output_tokens integer DEFAULT 0 NOT NULL,
    translate_reasoning_tokens integer DEFAULT 0 NOT NULL,
    summarize_calls integer DEFAULT 0 NOT NULL,
    summarize_input_tokens integer DEFAULT 0 NOT NULL,
    summarize_output_tokens integer DEFAULT 0 NOT NULL,
    summarize_reasoning_tokens integer DEFAULT 0 NOT NULL,
    embed_calls integer DEFAULT 0 NOT NULL,
    embed_input_tokens integer DEFAULT 0 NOT NULL,
    duplicates_found integer DEFAULT 0 NOT NULL,
    texts_stored integer DEFAULT 0 NOT NULL
);


--
-- Name: ingested_guids; Type: TABLE; Schema: parable; Owner: -
--

CREATE TABLE parable.ingested_guids (
    feed_id uuid NOT NULL,
    guid text NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: read_items; Type: TABLE; Schema: parable; Owner: -
--

CREATE TABLE parable.read_items (
    user_id uuid NOT NULL,
    feed_item_id uuid NOT NULL,
    read_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: story_views; Type: TABLE; Schema: parable; Owner: -
--

CREATE TABLE parable.story_views (
    user_id uuid NOT NULL,
    story_id uuid NOT NULL,
    seen_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: subscriptions; Type: TABLE; Schema: parable; Owner: -
--

CREATE TABLE parable.subscriptions (
    user_id uuid NOT NULL,
    feed_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    title text,
    category_id uuid
);


--
-- Name: user_preferences; Type: TABLE; Schema: parable; Owner: -
--

CREATE TABLE parable.user_preferences (
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sidebar_collapsed boolean DEFAULT false NOT NULL,
    language text DEFAULT 'en'::text NOT NULL,
    auto_delete_enabled boolean DEFAULT false NOT NULL,
    auto_delete_keywords text[] DEFAULT '{}'::text[] NOT NULL,
    theme text DEFAULT 'system'::text NOT NULL,
    inbox_view text DEFAULT 'list'::text NOT NULL,
    CONSTRAINT user_preferences_inbox_view_check CHECK ((inbox_view = ANY (ARRAY['list'::text, 'front'::text]))),
    CONSTRAINT user_preferences_theme_check CHECK ((theme = ANY (ARRAY['system'::text, 'dark'::text, 'light'::text])))
);


--
-- Name: ai_usage ai_usage_pkey; Type: CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.ai_usage
    ADD CONSTRAINT ai_usage_pkey PRIMARY KEY (id);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);


--
-- Name: article_folders article_folders_pkey; Type: CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.article_folders
    ADD CONSTRAINT article_folders_pkey PRIMARY KEY (feed_item_id, user_id, folder_id);


--
-- Name: article_states article_states_pkey; Type: CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.article_states
    ADD CONSTRAINT article_states_pkey PRIMARY KEY (user_id, feed_item_id);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: feed_daily_counts feed_daily_counts_pkey; Type: CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.feed_daily_counts
    ADD CONSTRAINT feed_daily_counts_pkey PRIMARY KEY (feed_id, day);


--
-- Name: feed_item_texts feed_item_texts_pkey; Type: CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.feed_item_texts
    ADD CONSTRAINT feed_item_texts_pkey PRIMARY KEY (feed_item_id);


--
-- Name: feed_items feed_items_feed_id_guid_key; Type: CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.feed_items
    ADD CONSTRAINT feed_items_feed_id_guid_key UNIQUE (feed_id, guid);


--
-- Name: feed_items feed_items_pkey; Type: CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.feed_items
    ADD CONSTRAINT feed_items_pkey PRIMARY KEY (id);


--
-- Name: feed_opens feed_opens_pkey; Type: CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.feed_opens
    ADD CONSTRAINT feed_opens_pkey PRIMARY KEY (user_id, feed_id, day);


--
-- Name: feeds feeds_pkey; Type: CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.feeds
    ADD CONSTRAINT feeds_pkey PRIMARY KEY (id);


--
-- Name: filtered_titles filtered_titles_pkey; Type: CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.filtered_titles
    ADD CONSTRAINT filtered_titles_pkey PRIMARY KEY (id);


--
-- Name: folders folders_pkey; Type: CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.folders
    ADD CONSTRAINT folders_pkey PRIMARY KEY (id);


--
-- Name: ingest_runs ingest_runs_pkey; Type: CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.ingest_runs
    ADD CONSTRAINT ingest_runs_pkey PRIMARY KEY (id);


--
-- Name: ingested_guids ingested_guids_pkey; Type: CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.ingested_guids
    ADD CONSTRAINT ingested_guids_pkey PRIMARY KEY (feed_id, guid);


--
-- Name: read_items read_items_pkey; Type: CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.read_items
    ADD CONSTRAINT read_items_pkey PRIMARY KEY (user_id, feed_item_id);


--
-- Name: story_views story_views_pkey; Type: CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.story_views
    ADD CONSTRAINT story_views_pkey PRIMARY KEY (user_id, story_id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (user_id, feed_id);


--
-- Name: user_preferences user_preferences_pkey; Type: CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.user_preferences
    ADD CONSTRAINT user_preferences_pkey PRIMARY KEY (user_id);


--
-- Name: ai_usage_created_at_idx; Type: INDEX; Schema: parable; Owner: -
--

CREATE INDEX ai_usage_created_at_idx ON parable.ai_usage USING btree (created_at);


--
-- Name: article_folders_folder_id_idx; Type: INDEX; Schema: parable; Owner: -
--

CREATE INDEX article_folders_folder_id_idx ON parable.article_folders USING btree (folder_id);


--
-- Name: article_folders_user_folder_idx; Type: INDEX; Schema: parable; Owner: -
--

CREATE INDEX article_folders_user_folder_idx ON parable.article_folders USING btree (user_id, folder_id);


--
-- Name: article_folders_user_id_idx; Type: INDEX; Schema: parable; Owner: -
--

CREATE INDEX article_folders_user_id_idx ON parable.article_folders USING btree (user_id);


--
-- Name: article_states_feed_item_id_state_idx; Type: INDEX; Schema: parable; Owner: -
--

CREATE INDEX article_states_feed_item_id_state_idx ON parable.article_states USING btree (feed_item_id, state);


--
-- Name: categories_user_name_unique; Type: INDEX; Schema: parable; Owner: -
--

CREATE UNIQUE INDEX categories_user_name_unique ON parable.categories USING btree (user_id, lower(name));


--
-- Name: categories_user_position_idx; Type: INDEX; Schema: parable; Owner: -
--

CREATE INDEX categories_user_position_idx ON parable.categories USING btree (user_id, "position");


--
-- Name: feed_items_created_at_idx; Type: INDEX; Schema: parable; Owner: -
--

CREATE INDEX feed_items_created_at_idx ON parable.feed_items USING btree (created_at);


--
-- Name: feed_items_feed_id_published_at_idx; Type: INDEX; Schema: parable; Owner: -
--

CREATE INDEX feed_items_feed_id_published_at_idx ON parable.feed_items USING btree (feed_id, published_at DESC);


--
-- Name: feed_items_published_at_idx; Type: INDEX; Schema: parable; Owner: -
--

CREATE INDEX feed_items_published_at_idx ON parable.feed_items USING btree (published_at);


--
-- Name: feed_items_search_vector_idx; Type: INDEX; Schema: parable; Owner: -
--

CREATE INDEX feed_items_search_vector_idx ON parable.feed_items USING gin (search_vector);


--
-- Name: feed_items_story_id_idx; Type: INDEX; Schema: parable; Owner: -
--

CREATE INDEX feed_items_story_id_idx ON parable.feed_items USING btree (story_id);


--
-- Name: feed_items_title_embedding_idx; Type: INDEX; Schema: parable; Owner: -
--

CREATE INDEX feed_items_title_embedding_idx ON parable.feed_items USING hnsw (title_embedding extensions.vector_cosine_ops);


--
-- Name: feeds_url_active_unique; Type: INDEX; Schema: parable; Owner: -
--

CREATE UNIQUE INDEX feeds_url_active_unique ON parable.feeds USING btree (url) WHERE (deleted_at IS NULL);


--
-- Name: filtered_titles_user_time_idx; Type: INDEX; Schema: parable; Owner: -
--

CREATE INDEX filtered_titles_user_time_idx ON parable.filtered_titles USING btree (user_id, filtered_at DESC);


--
-- Name: folders_parent_id_idx; Type: INDEX; Schema: parable; Owner: -
--

CREATE INDEX folders_parent_id_idx ON parable.folders USING btree (parent_id);


--
-- Name: folders_user_id_idx; Type: INDEX; Schema: parable; Owner: -
--

CREATE INDEX folders_user_id_idx ON parable.folders USING btree (user_id);


--
-- Name: folders_user_name_parent_unique; Type: INDEX; Schema: parable; Owner: -
--

CREATE UNIQUE INDEX folders_user_name_parent_unique ON parable.folders USING btree (user_id, parent_id, name) NULLS NOT DISTINCT;


--
-- Name: ingest_runs_created_at_idx; Type: INDEX; Schema: parable; Owner: -
--

CREATE INDEX ingest_runs_created_at_idx ON parable.ingest_runs USING btree (created_at DESC);


--
-- Name: ingested_guids_first_seen_at_idx; Type: INDEX; Schema: parable; Owner: -
--

CREATE INDEX ingested_guids_first_seen_at_idx ON parable.ingested_guids USING btree (first_seen_at);


--
-- Name: ingested_guids_last_seen_at_idx; Type: INDEX; Schema: parable; Owner: -
--

CREATE INDEX ingested_guids_last_seen_at_idx ON parable.ingested_guids USING btree (last_seen_at);


--
-- Name: read_items_feed_item_id_idx; Type: INDEX; Schema: parable; Owner: -
--

CREATE INDEX read_items_feed_item_id_idx ON parable.read_items USING btree (feed_item_id);


--
-- Name: subscriptions_category_idx; Type: INDEX; Schema: parable; Owner: -
--

CREATE INDEX subscriptions_category_idx ON parable.subscriptions USING btree (category_id);


--
-- Name: subscriptions_feed_id_idx; Type: INDEX; Schema: parable; Owner: -
--

CREATE INDEX subscriptions_feed_id_idx ON parable.subscriptions USING btree (feed_id);


--
-- Name: subscriptions_user_id_idx; Type: INDEX; Schema: parable; Owner: -
--

CREATE INDEX subscriptions_user_id_idx ON parable.subscriptions USING btree (user_id);


--
-- Name: feed_items feed_items_count; Type: TRIGGER; Schema: parable; Owner: -
--

CREATE TRIGGER feed_items_count AFTER INSERT ON parable.feed_items FOR EACH ROW EXECUTE FUNCTION parable.count_feed_item();


--
-- Name: read_items read_items_count; Type: TRIGGER; Schema: parable; Owner: -
--

CREATE TRIGGER read_items_count AFTER INSERT ON parable.read_items FOR EACH ROW EXECUTE FUNCTION parable.count_feed_open();


--
-- Name: ai_usage ai_usage_feed_item_id_fkey; Type: FK CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.ai_usage
    ADD CONSTRAINT ai_usage_feed_item_id_fkey FOREIGN KEY (feed_item_id) REFERENCES parable.feed_items(id) ON DELETE SET NULL;


--
-- Name: ai_usage ai_usage_user_id_fkey; Type: FK CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.ai_usage
    ADD CONSTRAINT ai_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: app_settings app_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.app_settings
    ADD CONSTRAINT app_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: article_folders article_folders_feed_item_id_fkey; Type: FK CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.article_folders
    ADD CONSTRAINT article_folders_feed_item_id_fkey FOREIGN KEY (feed_item_id) REFERENCES parable.feed_items(id) ON DELETE CASCADE;


--
-- Name: article_folders article_folders_folder_id_fkey; Type: FK CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.article_folders
    ADD CONSTRAINT article_folders_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES parable.folders(id) ON DELETE CASCADE;


--
-- Name: article_folders article_folders_user_id_fkey; Type: FK CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.article_folders
    ADD CONSTRAINT article_folders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: article_states article_states_feed_item_id_fkey; Type: FK CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.article_states
    ADD CONSTRAINT article_states_feed_item_id_fkey FOREIGN KEY (feed_item_id) REFERENCES parable.feed_items(id) ON DELETE CASCADE;


--
-- Name: article_states article_states_user_id_fkey; Type: FK CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.article_states
    ADD CONSTRAINT article_states_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: categories categories_user_id_fkey; Type: FK CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.categories
    ADD CONSTRAINT categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: feed_daily_counts feed_daily_counts_feed_id_fkey; Type: FK CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.feed_daily_counts
    ADD CONSTRAINT feed_daily_counts_feed_id_fkey FOREIGN KEY (feed_id) REFERENCES parable.feeds(id) ON DELETE CASCADE;


--
-- Name: feed_item_texts feed_item_texts_feed_item_id_fkey; Type: FK CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.feed_item_texts
    ADD CONSTRAINT feed_item_texts_feed_item_id_fkey FOREIGN KEY (feed_item_id) REFERENCES parable.feed_items(id) ON DELETE CASCADE;


--
-- Name: feed_items feed_items_feed_id_fkey; Type: FK CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.feed_items
    ADD CONSTRAINT feed_items_feed_id_fkey FOREIGN KEY (feed_id) REFERENCES parable.feeds(id) ON DELETE CASCADE;


--
-- Name: feed_opens feed_opens_feed_id_fkey; Type: FK CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.feed_opens
    ADD CONSTRAINT feed_opens_feed_id_fkey FOREIGN KEY (feed_id) REFERENCES parable.feeds(id) ON DELETE CASCADE;


--
-- Name: feed_opens feed_opens_user_id_fkey; Type: FK CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.feed_opens
    ADD CONSTRAINT feed_opens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: filtered_titles filtered_titles_feed_id_fkey; Type: FK CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.filtered_titles
    ADD CONSTRAINT filtered_titles_feed_id_fkey FOREIGN KEY (feed_id) REFERENCES parable.feeds(id) ON DELETE SET NULL;


--
-- Name: filtered_titles filtered_titles_user_id_fkey; Type: FK CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.filtered_titles
    ADD CONSTRAINT filtered_titles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: folders folders_parent_id_fkey; Type: FK CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.folders
    ADD CONSTRAINT folders_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES parable.folders(id) ON DELETE CASCADE;


--
-- Name: folders folders_user_id_fkey; Type: FK CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.folders
    ADD CONSTRAINT folders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: ingested_guids ingested_guids_feed_id_fkey; Type: FK CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.ingested_guids
    ADD CONSTRAINT ingested_guids_feed_id_fkey FOREIGN KEY (feed_id) REFERENCES parable.feeds(id) ON DELETE CASCADE;


--
-- Name: read_items read_items_feed_item_id_fkey; Type: FK CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.read_items
    ADD CONSTRAINT read_items_feed_item_id_fkey FOREIGN KEY (feed_item_id) REFERENCES parable.feed_items(id) ON DELETE CASCADE;


--
-- Name: read_items read_items_user_id_fkey; Type: FK CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.read_items
    ADD CONSTRAINT read_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: story_views story_views_user_id_fkey; Type: FK CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.story_views
    ADD CONSTRAINT story_views_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_category_id_fkey; Type: FK CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.subscriptions
    ADD CONSTRAINT subscriptions_category_id_fkey FOREIGN KEY (category_id) REFERENCES parable.categories(id) ON DELETE SET NULL;


--
-- Name: subscriptions subscriptions_feed_id_fkey; Type: FK CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.subscriptions
    ADD CONSTRAINT subscriptions_feed_id_fkey FOREIGN KEY (feed_id) REFERENCES parable.feeds(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.subscriptions
    ADD CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_preferences user_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: parable; Owner: -
--

ALTER TABLE ONLY parable.user_preferences
    ADD CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: ai_usage Signed-in users read AI usage; Type: POLICY; Schema: parable; Owner: -
--

CREATE POLICY "Signed-in users read AI usage" ON parable.ai_usage FOR SELECT TO authenticated USING (true);


--
-- Name: app_settings Signed-in users read app settings; Type: POLICY; Schema: parable; Owner: -
--

CREATE POLICY "Signed-in users read app settings" ON parable.app_settings FOR SELECT TO authenticated USING (true);


--
-- Name: feed_daily_counts Signed-in users read feed counts; Type: POLICY; Schema: parable; Owner: -
--

CREATE POLICY "Signed-in users read feed counts" ON parable.feed_daily_counts FOR SELECT TO authenticated USING (true);


--
-- Name: feeds Signed-in users read the feed catalog; Type: POLICY; Schema: parable; Owner: -
--

CREATE POLICY "Signed-in users read the feed catalog" ON parable.feeds FOR SELECT TO authenticated USING (true);


--
-- Name: feed_opens Users delete their own feed opens; Type: POLICY; Schema: parable; Owner: -
--

CREATE POLICY "Users delete their own feed opens" ON parable.feed_opens FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: filtered_titles Users log their own filtered titles; Type: POLICY; Schema: parable; Owner: -
--

CREATE POLICY "Users log their own filtered titles" ON parable.filtered_titles FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: article_folders Users manage their own article folders; Type: POLICY; Schema: parable; Owner: -
--

CREATE POLICY "Users manage their own article folders" ON parable.article_folders TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: article_states Users manage their own article states; Type: POLICY; Schema: parable; Owner: -
--

CREATE POLICY "Users manage their own article states" ON parable.article_states TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: categories Users manage their own categories; Type: POLICY; Schema: parable; Owner: -
--

CREATE POLICY "Users manage their own categories" ON parable.categories TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: folders Users manage their own folders; Type: POLICY; Schema: parable; Owner: -
--

CREATE POLICY "Users manage their own folders" ON parable.folders TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: user_preferences Users manage their own preferences; Type: POLICY; Schema: parable; Owner: -
--

CREATE POLICY "Users manage their own preferences" ON parable.user_preferences TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: read_items Users manage their own read items; Type: POLICY; Schema: parable; Owner: -
--

CREATE POLICY "Users manage their own read items" ON parable.read_items TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: story_views Users manage their own story views; Type: POLICY; Schema: parable; Owner: -
--

CREATE POLICY "Users manage their own story views" ON parable.story_views TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: subscriptions Users manage their own subscriptions; Type: POLICY; Schema: parable; Owner: -
--

CREATE POLICY "Users manage their own subscriptions" ON parable.subscriptions TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: feed_items Users read articles from feeds they subscribe to; Type: POLICY; Schema: parable; Owner: -
--

CREATE POLICY "Users read articles from feeds they subscribe to" ON parable.feed_items FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM parable.subscriptions s
  WHERE ((s.feed_id = feed_items.feed_id) AND (s.user_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM parable.article_states a
  WHERE ((a.feed_item_id = feed_items.id) AND (a.user_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: feed_item_texts Users read text of articles they can see; Type: POLICY; Schema: parable; Owner: -
--

CREATE POLICY "Users read text of articles they can see" ON parable.feed_item_texts FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM parable.feed_items fi
  WHERE (fi.id = feed_item_texts.feed_item_id))));


--
-- Name: feed_opens Users read their own feed opens; Type: POLICY; Schema: parable; Owner: -
--

CREATE POLICY "Users read their own feed opens" ON parable.feed_opens FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: filtered_titles Users read their own filtered titles; Type: POLICY; Schema: parable; Owner: -
--

CREATE POLICY "Users read their own filtered titles" ON parable.filtered_titles FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: ai_usage; Type: ROW SECURITY; Schema: parable; Owner: -
--

ALTER TABLE parable.ai_usage ENABLE ROW LEVEL SECURITY;

--
-- Name: app_settings; Type: ROW SECURITY; Schema: parable; Owner: -
--

ALTER TABLE parable.app_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: article_folders; Type: ROW SECURITY; Schema: parable; Owner: -
--

ALTER TABLE parable.article_folders ENABLE ROW LEVEL SECURITY;

--
-- Name: article_states; Type: ROW SECURITY; Schema: parable; Owner: -
--

ALTER TABLE parable.article_states ENABLE ROW LEVEL SECURITY;

--
-- Name: categories; Type: ROW SECURITY; Schema: parable; Owner: -
--

ALTER TABLE parable.categories ENABLE ROW LEVEL SECURITY;

--
-- Name: feed_daily_counts; Type: ROW SECURITY; Schema: parable; Owner: -
--

ALTER TABLE parable.feed_daily_counts ENABLE ROW LEVEL SECURITY;

--
-- Name: feed_item_texts; Type: ROW SECURITY; Schema: parable; Owner: -
--

ALTER TABLE parable.feed_item_texts ENABLE ROW LEVEL SECURITY;

--
-- Name: feed_items; Type: ROW SECURITY; Schema: parable; Owner: -
--

ALTER TABLE parable.feed_items ENABLE ROW LEVEL SECURITY;

--
-- Name: feed_opens; Type: ROW SECURITY; Schema: parable; Owner: -
--

ALTER TABLE parable.feed_opens ENABLE ROW LEVEL SECURITY;

--
-- Name: feeds; Type: ROW SECURITY; Schema: parable; Owner: -
--

ALTER TABLE parable.feeds ENABLE ROW LEVEL SECURITY;

--
-- Name: filtered_titles; Type: ROW SECURITY; Schema: parable; Owner: -
--

ALTER TABLE parable.filtered_titles ENABLE ROW LEVEL SECURITY;

--
-- Name: folders; Type: ROW SECURITY; Schema: parable; Owner: -
--

ALTER TABLE parable.folders ENABLE ROW LEVEL SECURITY;

--
-- Name: ingest_runs; Type: ROW SECURITY; Schema: parable; Owner: -
--

ALTER TABLE parable.ingest_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: ingest_runs ingest_runs readable by authenticated; Type: POLICY; Schema: parable; Owner: -
--

CREATE POLICY "ingest_runs readable by authenticated" ON parable.ingest_runs FOR SELECT TO authenticated USING (true);


--
-- Name: ingested_guids; Type: ROW SECURITY; Schema: parable; Owner: -
--

ALTER TABLE parable.ingested_guids ENABLE ROW LEVEL SECURITY;

--
-- Name: read_items; Type: ROW SECURITY; Schema: parable; Owner: -
--

ALTER TABLE parable.read_items ENABLE ROW LEVEL SECURITY;

--
-- Name: story_views; Type: ROW SECURITY; Schema: parable; Owner: -
--

ALTER TABLE parable.story_views ENABLE ROW LEVEL SECURITY;

--
-- Name: subscriptions; Type: ROW SECURITY; Schema: parable; Owner: -
--

ALTER TABLE parable.subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: user_preferences; Type: ROW SECURITY; Schema: parable; Owner: -
--

ALTER TABLE parable.user_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: FUNCTION automatic_updates_paused(); Type: ACL; Schema: parable; Owner: -
--

REVOKE ALL ON FUNCTION parable.automatic_updates_paused() FROM PUBLIC;
GRANT ALL ON FUNCTION parable.automatic_updates_paused() TO service_role;


--
-- Name: FUNCTION count_feed_item(); Type: ACL; Schema: parable; Owner: -
--

REVOKE ALL ON FUNCTION parable.count_feed_item() FROM PUBLIC;
GRANT ALL ON FUNCTION parable.count_feed_item() TO service_role;


--
-- Name: FUNCTION count_feed_open(); Type: ACL; Schema: parable; Owner: -
--

REVOKE ALL ON FUNCTION parable.count_feed_open() FROM PUBLIC;
GRANT ALL ON FUNCTION parable.count_feed_open() TO service_role;


--
-- Name: TABLE feed_items; Type: ACL; Schema: parable; Owner: -
--

GRANT ALL ON TABLE parable.feed_items TO anon;
GRANT ALL ON TABLE parable.feed_items TO authenticated;
GRANT ALL ON TABLE parable.feed_items TO service_role;


--
-- Name: FUNCTION feed_items_excluding_states(p_user_id uuid, p_exclude_states text[]); Type: ACL; Schema: parable; Owner: -
--

GRANT ALL ON FUNCTION parable.feed_items_excluding_states(p_user_id uuid, p_exclude_states text[]) TO anon;
GRANT ALL ON FUNCTION parable.feed_items_excluding_states(p_user_id uuid, p_exclude_states text[]) TO authenticated;
GRANT ALL ON FUNCTION parable.feed_items_excluding_states(p_user_id uuid, p_exclude_states text[]) TO service_role;


--
-- Name: FUNCTION feed_items_with_state(p_user_id uuid, p_state text); Type: ACL; Schema: parable; Owner: -
--

GRANT ALL ON FUNCTION parable.feed_items_with_state(p_user_id uuid, p_state text) TO anon;
GRANT ALL ON FUNCTION parable.feed_items_with_state(p_user_id uuid, p_state text) TO authenticated;
GRANT ALL ON FUNCTION parable.feed_items_with_state(p_user_id uuid, p_state text) TO service_role;


--
-- Name: FUNCTION feed_numbers(); Type: ACL; Schema: parable; Owner: -
--

REVOKE ALL ON FUNCTION parable.feed_numbers() FROM PUBLIC;
GRANT ALL ON FUNCTION parable.feed_numbers() TO authenticated;
GRANT ALL ON FUNCTION parable.feed_numbers() TO service_role;


--
-- Name: FUNCTION find_exact_recent_feed_items(p_links text[], p_titles text[], p_since timestamp with time zone); Type: ACL; Schema: parable; Owner: -
--

REVOKE ALL ON FUNCTION parable.find_exact_recent_feed_items(p_links text[], p_titles text[], p_since timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION parable.find_exact_recent_feed_items(p_links text[], p_titles text[], p_since timestamp with time zone) TO service_role;


--
-- Name: FUNCTION find_similar_recent_feed_item(p_embedding extensions.vector, p_max_distance double precision, p_since timestamp with time zone); Type: ACL; Schema: parable; Owner: -
--

REVOKE ALL ON FUNCTION parable.find_similar_recent_feed_item(p_embedding extensions.vector, p_max_distance double precision, p_since timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION parable.find_similar_recent_feed_item(p_embedding extensions.vector, p_max_distance double precision, p_since timestamp with time zone) TO service_role;


--
-- Name: FUNCTION inbox_category_counts(); Type: ACL; Schema: parable; Owner: -
--

REVOKE ALL ON FUNCTION parable.inbox_category_counts() FROM PUBLIC;
GRANT ALL ON FUNCTION parable.inbox_category_counts() TO authenticated;
GRANT ALL ON FUNCTION parable.inbox_category_counts() TO service_role;


--
-- Name: FUNCTION inbox_story_count(); Type: ACL; Schema: parable; Owner: -
--

REVOKE ALL ON FUNCTION parable.inbox_story_count() FROM PUBLIC;
GRANT ALL ON FUNCTION parable.inbox_story_count() TO authenticated;
GRANT ALL ON FUNCTION parable.inbox_story_count() TO service_role;


--
-- Name: FUNCTION purge_expired_archived_articles(dry_run boolean); Type: ACL; Schema: parable; Owner: -
--

REVOKE ALL ON FUNCTION parable.purge_expired_archived_articles(dry_run boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION parable.purge_expired_archived_articles(dry_run boolean) TO service_role;


--
-- Name: FUNCTION purge_feed_counts(dry_run boolean); Type: ACL; Schema: parable; Owner: -
--

REVOKE ALL ON FUNCTION parable.purge_feed_counts(dry_run boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION parable.purge_feed_counts(dry_run boolean) TO service_role;


--
-- Name: FUNCTION purge_filtered_titles(dry_run boolean); Type: ACL; Schema: parable; Owner: -
--

REVOKE ALL ON FUNCTION parable.purge_filtered_titles(dry_run boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION parable.purge_filtered_titles(dry_run boolean) TO service_role;


--
-- Name: FUNCTION purge_ingested_guids(dry_run boolean); Type: ACL; Schema: parable; Owner: -
--

REVOKE ALL ON FUNCTION parable.purge_ingested_guids(dry_run boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION parable.purge_ingested_guids(dry_run boolean) TO service_role;


--
-- Name: FUNCTION purge_stale_inbox_articles(dry_run boolean); Type: ACL; Schema: parable; Owner: -
--

REVOKE ALL ON FUNCTION parable.purge_stale_inbox_articles(dry_run boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION parable.purge_stale_inbox_articles(dry_run boolean) TO service_role;


--
-- Name: FUNCTION purge_story_views(dry_run boolean); Type: ACL; Schema: parable; Owner: -
--

REVOKE ALL ON FUNCTION parable.purge_story_views(dry_run boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION parable.purge_story_views(dry_run boolean) TO service_role;


--
-- Name: FUNCTION reclaim_orphaned_feed_items(dry_run boolean); Type: ACL; Schema: parable; Owner: -
--

REVOKE ALL ON FUNCTION parable.reclaim_orphaned_feed_items(dry_run boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION parable.reclaim_orphaned_feed_items(dry_run boolean) TO service_role;


--
-- Name: FUNCTION run_retention(dry_run boolean); Type: ACL; Schema: parable; Owner: -
--

REVOKE ALL ON FUNCTION parable.run_retention(dry_run boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION parable.run_retention(dry_run boolean) TO service_role;


--
-- Name: FUNCTION story_feed(p_view text, p_query text, p_limit integer); Type: ACL; Schema: parable; Owner: -
--

REVOKE ALL ON FUNCTION parable.story_feed(p_view text, p_query text, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION parable.story_feed(p_view text, p_query text, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION parable.story_feed(p_view text, p_query text, p_limit integer) TO service_role;


--
-- Name: TABLE ai_usage; Type: ACL; Schema: parable; Owner: -
--

GRANT ALL ON TABLE parable.ai_usage TO anon;
GRANT ALL ON TABLE parable.ai_usage TO authenticated;
GRANT ALL ON TABLE parable.ai_usage TO service_role;


--
-- Name: TABLE app_settings; Type: ACL; Schema: parable; Owner: -
--

GRANT ALL ON TABLE parable.app_settings TO anon;
GRANT ALL ON TABLE parable.app_settings TO authenticated;
GRANT ALL ON TABLE parable.app_settings TO service_role;


--
-- Name: TABLE article_folders; Type: ACL; Schema: parable; Owner: -
--

GRANT ALL ON TABLE parable.article_folders TO anon;
GRANT ALL ON TABLE parable.article_folders TO authenticated;
GRANT ALL ON TABLE parable.article_folders TO service_role;


--
-- Name: TABLE article_states; Type: ACL; Schema: parable; Owner: -
--

GRANT ALL ON TABLE parable.article_states TO anon;
GRANT ALL ON TABLE parable.article_states TO authenticated;
GRANT ALL ON TABLE parable.article_states TO service_role;


--
-- Name: TABLE categories; Type: ACL; Schema: parable; Owner: -
--

GRANT ALL ON TABLE parable.categories TO anon;
GRANT ALL ON TABLE parable.categories TO authenticated;
GRANT ALL ON TABLE parable.categories TO service_role;


--
-- Name: TABLE feed_daily_counts; Type: ACL; Schema: parable; Owner: -
--

GRANT ALL ON TABLE parable.feed_daily_counts TO anon;
GRANT ALL ON TABLE parable.feed_daily_counts TO authenticated;
GRANT ALL ON TABLE parable.feed_daily_counts TO service_role;


--
-- Name: TABLE feed_item_texts; Type: ACL; Schema: parable; Owner: -
--

GRANT ALL ON TABLE parable.feed_item_texts TO anon;
GRANT ALL ON TABLE parable.feed_item_texts TO authenticated;
GRANT ALL ON TABLE parable.feed_item_texts TO service_role;


--
-- Name: TABLE feed_opens; Type: ACL; Schema: parable; Owner: -
--

GRANT ALL ON TABLE parable.feed_opens TO anon;
GRANT ALL ON TABLE parable.feed_opens TO authenticated;
GRANT ALL ON TABLE parable.feed_opens TO service_role;


--
-- Name: TABLE feeds; Type: ACL; Schema: parable; Owner: -
--

GRANT ALL ON TABLE parable.feeds TO anon;
GRANT ALL ON TABLE parable.feeds TO authenticated;
GRANT ALL ON TABLE parable.feeds TO service_role;


--
-- Name: TABLE filtered_titles; Type: ACL; Schema: parable; Owner: -
--

GRANT ALL ON TABLE parable.filtered_titles TO anon;
GRANT ALL ON TABLE parable.filtered_titles TO authenticated;
GRANT ALL ON TABLE parable.filtered_titles TO service_role;


--
-- Name: TABLE folders; Type: ACL; Schema: parable; Owner: -
--

GRANT ALL ON TABLE parable.folders TO anon;
GRANT ALL ON TABLE parable.folders TO authenticated;
GRANT ALL ON TABLE parable.folders TO service_role;


--
-- Name: TABLE ingest_runs; Type: ACL; Schema: parable; Owner: -
--

GRANT ALL ON TABLE parable.ingest_runs TO anon;
GRANT ALL ON TABLE parable.ingest_runs TO authenticated;
GRANT ALL ON TABLE parable.ingest_runs TO service_role;


--
-- Name: TABLE ingested_guids; Type: ACL; Schema: parable; Owner: -
--

GRANT ALL ON TABLE parable.ingested_guids TO anon;
GRANT ALL ON TABLE parable.ingested_guids TO authenticated;
GRANT ALL ON TABLE parable.ingested_guids TO service_role;


--
-- Name: TABLE read_items; Type: ACL; Schema: parable; Owner: -
--

GRANT ALL ON TABLE parable.read_items TO anon;
GRANT ALL ON TABLE parable.read_items TO authenticated;
GRANT ALL ON TABLE parable.read_items TO service_role;


--
-- Name: TABLE story_views; Type: ACL; Schema: parable; Owner: -
--

GRANT ALL ON TABLE parable.story_views TO anon;
GRANT ALL ON TABLE parable.story_views TO authenticated;
GRANT ALL ON TABLE parable.story_views TO service_role;


--
-- Name: TABLE subscriptions; Type: ACL; Schema: parable; Owner: -
--

GRANT ALL ON TABLE parable.subscriptions TO anon;
GRANT ALL ON TABLE parable.subscriptions TO authenticated;
GRANT ALL ON TABLE parable.subscriptions TO service_role;


--
-- Name: TABLE user_preferences; Type: ACL; Schema: parable; Owner: -
--

GRANT ALL ON TABLE parable.user_preferences TO anon;
GRANT ALL ON TABLE parable.user_preferences TO authenticated;
GRANT ALL ON TABLE parable.user_preferences TO service_role;


