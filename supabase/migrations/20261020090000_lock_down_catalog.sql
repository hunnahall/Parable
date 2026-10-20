-- The feed catalog (feeds, feed_items) is shared by every account, so no
-- signed-in user may change it directly. Adding a feed now goes through a
-- server action that writes the catalog row with the service role
-- (src/lib/feeds/actions.ts); ingest and retention already did. Reads are
-- unchanged. Users still edit everything they own: subscriptions, folders,
-- article states, preferences.

drop policy if exists "Signed-in users add to the feed catalog" on public.feeds;
drop policy if exists "Signed-in users update catalog feeds" on public.feeds;
drop policy if exists "Signed-in users update articles" on public.feed_items;
