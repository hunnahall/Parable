-- The Rules block on /filters: "if a title contains X, file it in folder
-- Y". Sibling to user_preferences.auto_delete_keywords, which discards
-- matching articles — these keep them, and filing an article saves it.
--
-- A separate table rather than another array column on user_preferences
-- because each rule is a pair (keyword, folder) with a real FK, and a
-- deleted folder has to take its rules with it.

create table if not exists public.filter_rules (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  keyword    text not null,
  folder_id  uuid not null references public.folders (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, keyword, folder_id)
);

create index if not exists filter_rules_user_id_idx on public.filter_rules (user_id);

alter table public.filter_rules enable row level security;

-- Same shape as every other per-user table: auth.uid() wrapped in a scalar
-- subquery so Postgres evaluates it once per statement rather than per row.
create policy filter_rules_own_rows on public.filter_rules
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
