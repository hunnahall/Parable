-- Feeds page numbers (roadmap step 13, 2026-10-21).
--
-- Articles are deleted 12h after arriving, so counting feed_items can't
-- say how busy a feed is over a week. These are running counts, one row
-- per feed (or reader and feed) per UTC day, written by triggers as
-- articles arrive and get opened, and kept 30 days.

-- 1. Articles each feed delivered per day. Shared, like the catalog.
create table if not exists public.feed_daily_counts (
  feed_id uuid not null references public.feeds (id) on delete cascade,
  day date not null,
  articles integer not null default 0,
  primary key (feed_id, day)
);

alter table public.feed_daily_counts enable row level security;

create policy "Signed-in users read feed counts" on public.feed_daily_counts
  for select to authenticated
  using (true);

-- 2. Articles each reader opened per feed per day: the publisher link,
-- the reader view or the summary (each inserts a read_items row once).
create table if not exists public.feed_opens (
  user_id uuid not null references auth.users (id) on delete cascade,
  feed_id uuid not null references public.feeds (id) on delete cascade,
  day date not null,
  opens integer not null default 0,
  primary key (user_id, feed_id, day)
);

alter table public.feed_opens enable row level security;

create policy "Users read their own feed opens" on public.feed_opens
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Clean slate clears these with the rest of the account.
create policy "Users delete their own feed opens" on public.feed_opens
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.count_feed_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.feed_daily_counts (feed_id, day, articles)
  values (new.feed_id, (new.created_at at time zone 'utc')::date, 1)
  on conflict (feed_id, day) do update
    set articles = public.feed_daily_counts.articles + 1;
  return null;
end;
$$;

revoke all on function public.count_feed_item() from public, anon, authenticated;

drop trigger if exists feed_items_count on public.feed_items;
create trigger feed_items_count
  after insert on public.feed_items
  for each row execute function public.count_feed_item();

-- Fires only for a new read_items row: markArticleRead upserts with
-- ignoreDuplicates, so opening the same article twice counts once.
create or replace function public.count_feed_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.feed_opens (user_id, feed_id, day, opens)
  select new.user_id, fi.feed_id, (now() at time zone 'utc')::date, 1
  from public.feed_items fi
  where fi.id = new.feed_item_id
  on conflict (user_id, feed_id, day) do update
    set opens = public.feed_opens.opens + 1;
  return null;
end;
$$;

revoke all on function public.count_feed_open() from public, anon, authenticated;

drop trigger if exists read_items_count on public.read_items;
create trigger read_items_count
  after insert on public.read_items
  for each row execute function public.count_feed_open();

-- Backfill from what's still stored (about 12h of articles).
insert into public.feed_daily_counts (feed_id, day, articles)
select feed_id, (created_at at time zone 'utc')::date, count(*)
from public.feed_items
group by 1, 2
on conflict (feed_id, day) do nothing;

insert into public.feed_opens (user_id, feed_id, day, opens)
select r.user_id, fi.feed_id, (now() at time zone 'utc')::date, count(*)
from public.read_items r
join public.feed_items fi on fi.id = r.feed_item_id
group by 1, 2, 3
on conflict (user_id, feed_id, day) do nothing;

-- 3. The numbers for each of the reader's feeds over the last 7 days, or
-- since they subscribed, or since counting began (the earliest day in
-- feed_daily_counts, for any feed), whichever is latest. days is that span
-- (at least 1), so articles / days is a daily rate that a feed added this
-- morning doesn't inflate past its real count.
create or replace function public.feed_numbers()
returns table (feed_id uuid, articles bigint, opens bigint, days numeric)
language sql
stable
set search_path = public
as $$
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
$$;

grant execute on function public.feed_numbers() to authenticated;
revoke execute on function public.feed_numbers() from anon, public;

-- 4. Retention: the page reads 7 days; keep 30.
create or replace function public.purge_feed_counts(dry_run boolean default false)
returns table (deleted_count bigint)
language plpgsql
security definer
set search_path = public
as $$
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
$$;

revoke all on function public.purge_feed_counts(boolean)
  from public, anon, authenticated;
