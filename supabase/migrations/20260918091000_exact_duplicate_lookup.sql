-- The two cross-feed duplicate checks that cost nothing to run.
--
-- find_similar_recent_feed_item answers "is this the same story?" with an
-- embedding and a vector index scan, and it earns that cost on reworded
-- headlines and on the same story arriving in two languages. But a large
-- share of real syndication isn't reworded at all: outlets republish wire
-- copy under the agency's own headline, byte for byte, and often behind
-- the same canonical URL. Those need no embedding to recognize.
--
-- Called once per feed, before the per-item vector lookup, so a hit skips
-- the RPC, the page fetch and the summarization call. Strictly stricter
-- than the vector check — anything matching here would also have cleared
-- the 0.16 cosine threshold — so it changes what a merge costs, never
-- which merges happen.
--
-- Arrays are passed as function arguments (a JSON body) rather than
-- interpolated into a PostgREST filter string, which keeps titles
-- containing commas, parentheses or quotes from having to be escaped into
-- a URL by hand. Same reasoning as the cursor validation in
-- src/lib/articles/list.ts, applied before the problem instead of after.
--
-- No index on feed_items.link: p_since already bounds the scan to the
-- dedupe window via feed_items_created_at_idx, feed_items is small and
-- short-lived by design, and another index is write cost on every ingest.
create or replace function public.find_exact_recent_feed_items(
  p_links text[],
  p_titles text[],
  p_since timestamptz
)
returns table (id uuid, link text, title text, title_en text, summary_ai text)
language sql
stable
security definer
set search_path = public
as $$
  select fi.id, fi.link, fi.title, fi.title_en, fi.summary_ai
  from public.feed_items fi
  where fi.created_at >= p_since
    -- Only a row that actually has a summary is worth reusing; that is the
    -- entire point of the match.
    and fi.summary_ai is not null
    and (
      (fi.link is not null and fi.link = any(p_links))
      -- Both columns: an article already in the target language has a null
      -- title_en and matches on its original title instead.
      or fi.title_en = any(p_titles)
      or fi.title = any(p_titles)
    );
$$;

-- Same lockdown as the retention RPCs and find_similar_recent_feed_item:
-- SECURITY DEFINER, and PostgREST exposes every public function at
-- /rest/v1/rpc/<name>. This one reads across every user's catalog rows, so
-- it is service-role only — ingest is the only caller.
revoke all on function public.find_exact_recent_feed_items(text[], text[], timestamptz)
  from public, anon, authenticated;
