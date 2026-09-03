-- The retention functions are only ever called by the cron routes through
-- the service role (see src/lib/feeds/retention.ts), but PostgREST exposes
-- every function in the public schema at /rest/v1/rpc/<name> and Postgres
-- grants EXECUTE to public by default. auto_archive_stale_articles is
-- SECURITY DEFINER, so until now anyone holding the publishable key could
-- POST to it and archive every user's inbox; the two purge functions
-- likewise invite a caller to trigger deletions on someone else's
-- schedule. Revoke them from the API roles.
revoke all on function public.auto_archive_stale_articles(boolean) from public, anon, authenticated;
revoke all on function public.purge_expired_article_content(boolean) from public, anon, authenticated;
revoke all on function public.purge_archived_article_metadata(boolean) from public, anon, authenticated;

-- feed_items_excluding_states and feed_items_with_state stay callable by
-- authenticated: the app's list views invoke them from the user's own
-- client, and they're SECURITY INVOKER, so RLS still applies to every row
-- they return.

-- Orphaned by the retention rewrite in 20260902172428 — nothing in the
-- app or in cron.sql has called it since, and it carries the mutable
-- search_path the linter flags.
drop function if exists public.cleanup_old_feed_items(integer);
