-- Filters (roadmap step 9, 2026-10-20).

-- A log of the titles each reader's keyword filters removed, so the Inbox
-- can say "N filtered today" and list them. Written by ingest (service
-- role) and by "Run filters now" (the reader). Kept 48h.
create table if not exists public.filtered_titles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  feed_id uuid references public.feeds (id) on delete set null,
  title text not null,
  link text,
  keyword text not null,
  filtered_at timestamptz not null default now()
);

create index if not exists filtered_titles_user_time_idx
  on public.filtered_titles (user_id, filtered_at desc);

alter table public.filtered_titles enable row level security;

create policy "Users read their own filtered titles" on public.filtered_titles
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users log their own filtered titles" on public.filtered_titles
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create or replace function public.purge_filtered_titles(dry_run boolean default false)
returns table (deleted_count bigint)
language plpgsql
security definer
set search_path = public
as $$
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
$$;

revoke all on function public.purge_filtered_titles(boolean)
  from public, anon, authenticated;
