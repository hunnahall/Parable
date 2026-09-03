-- Multi-user preparation: a shared, deduped feed catalog with per-user
-- subscriptions layered on top.
--
-- feeds / feed_items / article_content stay global: one fetch of a URL
-- serves every subscriber, which is what the ingest upsert's
-- onConflict: 'feed_id,guid' has always assumed. Who subscribes, what they
-- call a feed, whether they want AI summaries, how they file it, and what
-- they've read/saved/archived/deleted is per-user.
--
-- The per-article curation layer (article_states, article_folders,
-- read_items, user_preferences) was already correctly keyed by user_id and
-- needs no restructuring — only the policy tightening in section 6.


-- 1. Remove objects left behind by deleted features -------------------------

-- The Dashboard was removed in 8d8edbf; this table survived it and is only
-- referenced by a cleanup delete. saved_items was superseded by
-- article_states and has never held a row. categories was superseded by
-- folders: nothing reads it, and feeds.category is null on every row
-- because every caller has passed null since folders landed.
drop table if exists public.dashboard_widgets;
drop table if exists public.saved_items;
drop table if exists public.categories;

alter table public.feeds drop column if exists category;


-- 2. Folders belong to a user ----------------------------------------------

alter table public.folders
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

-- Existing folders belong to the original account — the oldest one, rather
-- than a hardcoded id, so this is also correct on a fresh restore.
update public.folders
   set user_id = (select id from auth.users order by created_at limit 1)
 where user_id is null;

alter table public.folders alter column user_id set not null;

create index if not exists folders_user_id_idx on public.folders (user_id);

-- feed_folders needs no owner column of its own: folder_id already implies
-- one now, which section 6's policy relies on.


-- 3. Subscriptions carry the per-user view of a feed ------------------------

-- title is an override, null meaning "use the catalog's own title", so
-- renaming a feed never renames it for another subscriber.
alter table public.subscriptions
  add column if not exists title text,
  add column if not exists summarize_articles boolean not null default false;

-- Subscribe the original account to everything currently in the catalog,
-- carrying its existing per-feed AI-summary choice across.
insert into public.subscriptions (user_id, feed_id, summarize_articles)
select u.id, f.id, f.summarize_articles
  from auth.users u
 cross join public.feeds f
 where u.created_at = (select min(created_at) from auth.users)
   and f.deleted_at is null
    on conflict (user_id, feed_id) do nothing;

-- Now that the flag lives per subscriber, ingest derives "does anyone want
-- summaries for this feed" from subscriptions instead.
alter table public.feeds drop column if exists summarize_articles;

create index if not exists subscriptions_feed_id_idx on public.subscriptions (feed_id);


-- 4. Deleting an article is a per-user act ----------------------------------

-- Previously the Delete action in the bulk toolbar hard-deleted the shared
-- feed_items row, which with more than one account would destroy other
-- people's articles (including saved ones) from one click. 'deleted' is a
-- per-user tombstone instead: the shared row survives, the article is gone
-- for that user, and section 7's retention job reclaims the row once every
-- user has archived or deleted it.
alter table public.article_states drop constraint if exists article_states_state_check;
alter table public.article_states add constraint article_states_state_check
  check (state = any (array['saved', 'archived', 'reading', 'deleted']));


-- 5. Missing indexes flagged by the database linter -------------------------

create index if not exists article_folders_user_id_idx on public.article_folders (user_id);
create index if not exists read_items_feed_item_id_idx on public.read_items (feed_item_id);


-- 6. Row level security -----------------------------------------------------

-- Every per-user policy wraps auth.uid() in a scalar subquery so Postgres
-- evaluates it once per statement rather than once per row.

-- Shared catalog. Readable and extendable by any signed-in user, but never
-- deletable by one: destroying a shared row is retention's job (service
-- role, which bypasses RLS), not a user action.
drop policy if exists "Authenticated users manage feeds" on public.feeds;
drop policy if exists "logged in users can read feeds" on public.feeds;

create policy "Signed-in users read the feed catalog" on public.feeds
  for select to authenticated using (true);
create policy "Signed-in users add to the feed catalog" on public.feeds
  for insert to authenticated with check (true);
create policy "Signed-in users update catalog feeds" on public.feeds
  for update to authenticated using (true) with check (true);

-- An article is visible if you subscribe to its feed, or if you already
-- have curation on it — the second clause is what keeps saved articles
-- readable after you unsubscribe from the feed they came from.
drop policy if exists "Authenticated users manage feed items" on public.feed_items;
drop policy if exists "logged in users can read feed_items" on public.feed_items;

create policy "Users read articles from feeds they subscribe to" on public.feed_items
  for select to authenticated using (
    exists (
      select 1 from public.subscriptions s
       where s.feed_id = feed_items.feed_id and s.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.article_states a
       where a.feed_item_id = feed_items.id and a.user_id = (select auth.uid())
    )
  );
-- image_url enrichment on first open (see fetchAndPersistArticleContent)
-- is a user-client write, so update stays open; delete does not.
create policy "Signed-in users update articles" on public.feed_items
  for update to authenticated using (true) with check (true);

-- Extracted body text is a shared cache, populated on demand by whichever
-- user opens an article first.
drop policy if exists "Authenticated users manage article_content" on public.article_content;

create policy "Signed-in users read article content" on public.article_content
  for select to authenticated using (true);
create policy "Signed-in users cache article content" on public.article_content
  for insert to authenticated with check (true);
create policy "Signed-in users update cached article content" on public.article_content
  for update to authenticated using (true) with check (true);

-- Per-user tables.
drop policy if exists "Authenticated users manage folders" on public.folders;
create policy "Users manage their own folders" on public.folders
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Authenticated users manage feed_folders" on public.feed_folders;
create policy "Users manage their own feed folders" on public.feed_folders
  for all to authenticated
  using (
    exists (
      select 1 from public.folders f
       where f.id = feed_folders.folder_id and f.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.folders f
       where f.id = feed_folders.folder_id and f.user_id = (select auth.uid())
    )
  );

drop policy if exists "users manage their own subscriptions" on public.subscriptions;
create policy "Users manage their own subscriptions" on public.subscriptions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their own article states" on public.article_states;
create policy "Users manage their own article states" on public.article_states
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their own article folders" on public.article_folders;
create policy "Users manage their own article folders" on public.article_folders
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "users manage their own read_items" on public.read_items;
create policy "Users manage their own read items" on public.read_items
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "users manage their own preferences" on public.user_preferences;
create policy "Users manage their own preferences" on public.user_preferences
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);


-- 7. Functions -------------------------------------------------------------

-- The two list functions gain a subscription join: without it, every user
-- would see every article in the catalog. Same "or you already curated it"
-- escape hatch as the feed_items policy, so unsubscribing from a feed
-- never hides articles you saved from it.
create or replace function public.feed_items_excluding_states(
  p_user_id uuid,
  p_exclude_states text[]
)
returns setof public.feed_items
language sql
stable
set search_path to 'public'
as $function$
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

create or replace function public.feed_items_with_state(
  p_user_id uuid,
  p_state text
)
returns setof public.feed_items
language sql
stable
set search_path to 'public'
as $function$
  select fi.* from feed_items fi
  where exists (
    select 1 from article_states a
     where a.feed_item_id = fi.id and a.user_id = p_user_id and a.state = p_state
  )
$function$;

-- Auto-archive previously cross-joined every user against every article in
-- the catalog, which with more than one account would manufacture an
-- archived row for each user for articles from feeds they never subscribed
-- to. Scoped to actual subscriptions instead.
create or replace function public.auto_archive_stale_articles(dry_run boolean default false)
returns table(archived_count bigint)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  cnt bigint;
begin
  if dry_run then
    select count(*) into cnt
    from public.subscriptions sub
    join public.feed_items fi on fi.feed_id = sub.feed_id
    where fi.published_at < now() - interval '24 hours'
      and not exists (
        select 1 from public.article_states a
        where a.user_id = sub.user_id and a.feed_item_id = fi.id
      );
  else
    with candidates as (
      select sub.user_id, fi.id as feed_item_id
      from public.subscriptions sub
      join public.feed_items fi on fi.feed_id = sub.feed_id
      where fi.published_at < now() - interval '24 hours'
        and not exists (
          select 1 from public.article_states a
          where a.user_id = sub.user_id and a.feed_item_id = fi.id
        )
    ),
    inserted as (
      insert into public.article_states (user_id, feed_item_id, state, archived_at)
      select user_id, feed_item_id, 'archived', now() from candidates
      returning 1
    )
    select count(*) into cnt from inserted;
  end if;
  return query select cnt;
end;
$function$;

-- A per-user 'deleted' tombstone should let the shared row be reclaimed on
-- the same schedule an archive does.
create or replace function public.purge_archived_article_metadata(dry_run boolean default false)
returns table(purged_count bigint)
language plpgsql
set search_path to 'public'
as $function$
declare
  cnt bigint;
begin
  if dry_run then
    select count(*) into cnt
    from public.feed_items fi
    where exists (
        select 1 from public.article_states a
        where a.feed_item_id = fi.id
          and a.state in ('archived', 'deleted')
          and a.archived_at < now() - interval '30 days'
      )
      and not exists (
        select 1 from public.article_states s
        where s.feed_item_id = fi.id
          and (s.state = 'saved' or s.state = 'reading')
      );
  else
    with stale as (
      select fi.id
      from public.feed_items fi
      where exists (
          select 1 from public.article_states a
          where a.feed_item_id = fi.id
            and a.state in ('archived', 'deleted')
            and a.archived_at < now() - interval '30 days'
        )
        and not exists (
          select 1 from public.article_states s
          where s.feed_item_id = fi.id
            and (s.state = 'saved' or s.state = 'reading')
        )
    ),
    deleted as (
      delete from public.feed_items fi
      using stale s
      where fi.id = s.id
      returning 1
    )
    select count(*) into cnt from deleted;
  end if;
  return query select cnt;
end;
$function$;

-- Content purge already treats anything not saved/reading as expendable, so
-- 'deleted' needs no change there.
