-- Pausing automatic updates (Settings, 2026-10-22). One shared flag, since
-- ingest and retention are one job for every account: while it's true the
-- cron jobs (supabase/cron.sql) skip their call to the app, so no articles
-- load and nothing expires. Refresh on the Inbox still runs ingest by hand.

-- App-wide settings, one row per key. Readable by signed-in users; written
-- only by the server (service role), like the feed catalog.
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.app_settings enable row level security;

create policy "Signed-in users read app settings" on public.app_settings
  for select to authenticated
  using (true);

insert into public.app_settings (key, value)
values ('automatic_updates_paused', 'false'::jsonb)
on conflict (key) do nothing;

-- What the cron jobs check before calling the app. Security definer so it
-- reads the flag regardless of the caller; only the database owner (which
-- runs pg_cron) may call it.
create or replace function public.automatic_updates_paused()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select value = 'true'::jsonb from public.app_settings where key = 'automatic_updates_paused'),
    false
  );
$$;

revoke all on function public.automatic_updates_paused() from public, anon, authenticated;
