-- Cross-feed duplicate detection, to stop paying for the same summary
-- repeatedly. With 30+ subscribed sources, wire copy (AFP/Reuters/AP) is
-- republished across several outlets, and until now each copy paid its own
-- page fetch and its own gpt-5-nano summarization call.
--
-- The embedded text is the *translated* title (title_en, falling back to
-- title) rather than the original. That is what makes this work across a
-- majority-non-English feed list: the same AFP story on RFI in French and
-- on Reuters in English lands in one language space and collapses
-- together, which a raw multilingual embedding of the source titles would
-- do poorly. Ingest already has title_en in hand by this point — it
-- batch-translates a feed's titles before the filter gate — so nothing
-- extra is spent to get it.
--
-- 512 dimensions, not the model's native 1536: text-embedding-3-small is
-- trained for Matryoshka truncation, and a third of the storage/index size
-- is plenty for "is this the same headline?". Must stay in sync with
-- EMBEDDING_DIMENSIONS in src/lib/embeddings.ts — pgvector rejects a
-- mismatched dimension rather than coercing it.
-- Into `extensions`, matching where this project already puts pgcrypto and
-- uuid-ossp rather than dropping a type into `public`. The consequence is
-- that anything resolving the `vector` type or the `<=>` operator needs
-- `extensions` on its search_path — see find_similar_recent_feed_item
-- below, which sets it explicitly instead of inheriting whatever the
-- caller happens to have.
create extension if not exists vector with schema extensions;

alter table public.feed_items
  add column if not exists title_embedding extensions.vector(512);

-- HNSW rather than ivfflat: ivfflat's lists have to be tuned to the row
-- count, and this table's row count swings by an order of magnitude as
-- retention sweeps it every hour (12h inbox / 24h archive windows). HNSW
-- needs no such tuning and stays correct as the table empties and refills.
create index if not exists feed_items_title_embedding_idx
  on public.feed_items using hnsw (title_embedding extensions.vector_cosine_ops);

-- Nearest already-summarized article within a cosine distance, restricted
-- to a recent window. The window matters: retention keeps nothing past
-- 24h, so a match older than that points at a row that is about to be
-- reclaimed, and its summary would be copied onto an article that outlives
-- it.
--
-- SECURITY INVOKER (the default) deliberately — ingest calls this as the
-- service role, which bypasses RLS anyway, so there is no reason to hand
-- the function elevated rights it doesn't need.
create or replace function public.find_similar_recent_feed_item(
  p_embedding extensions.vector(512),
  p_max_distance double precision,
  p_since timestamptz
)
returns table (
  id uuid,
  title text,
  title_en text,
  summary_ai text,
  distance double precision
)
language sql
stable
-- Pinned rather than inherited: `extensions` has to be here for the `<=>`
-- cosine-distance operator to resolve at all, and pinning it is also what
-- the linter wants (a mutable search_path on a function is the hole the
-- 20260903190000 migration's notes describe).
set search_path = public, extensions
as $$
  select
    fi.id,
    fi.title,
    fi.title_en,
    fi.summary_ai,
    (fi.title_embedding <=> p_embedding)::double precision as distance
  from public.feed_items fi
  where fi.title_embedding is not null
    -- Only a row that already has a summary is worth matching: copying a
    -- null summary would save nothing and leave a bare title in the Inbox.
    and fi.summary_ai is not null
    and fi.created_at >= p_since
    and (fi.title_embedding <=> p_embedding) <= p_max_distance
  order by fi.title_embedding <=> p_embedding
  limit 1;
$$;

-- PostgREST exposes every function in the public schema at
-- /rest/v1/rpc/<name>, and Postgres grants EXECUTE to public by default —
-- the same trap 20260903190000_lock_down_retention_rpcs.sql was written
-- for. Only ingest (service role) ever calls this.
revoke all on function public.find_similar_recent_feed_item(
  extensions.vector, double precision, timestamptz
) from public, anon, authenticated;
