-- Records that an article took its summary from another source's copy of
-- the same story.
--
-- Cross-feed dedupe saves the fetch and the summarization call, but until
-- now it left no trace anywhere except a console.log line. Two
-- consequences, both bad:
--
--   1. The reader sees two cards carrying word-for-word identical summary
--      text, with nothing explaining why. Dedupe's one visible effect on
--      the product was to make it look broken.
--   2. Auditing DEDUPE_MAX_DISTANCE — explicitly called for, since 0.16
--      was set from six hand-written pairs — meant grepping platform logs,
--      which is why nobody was ever going to do it.
--
-- Nullable, and `on delete set null` rather than cascade: the row this
-- points at is reclaimed on its own 12h schedule, and losing the
-- attribution must never take the article with it. The copied summary
-- stays valid regardless — it was copied, not referenced.
alter table public.feed_items
  add column if not exists duplicate_of uuid
    references public.feed_items(id) on delete set null;

-- Answers "how many other sources ran this story?" without a scan.
create index if not exists feed_items_duplicate_of_idx
  on public.feed_items (duplicate_of)
  where duplicate_of is not null;
