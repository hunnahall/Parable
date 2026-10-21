-- On-demand AI (roadmap step 11, 2026-10-20).
-- One row per OpenAI call made outside ingest: a summary or a translated
-- reader view, generated when a reader asks for it or saves a story. The
-- Usage box on /settings adds these to ingest_runs, so it counts every AI
-- call. Written by the service role; readable by any signed-in account,
-- like ingest_runs, since spend is a property of the project. Never pruned.
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  feed_item_id uuid references public.feed_items (id) on delete set null,
  kind text not null check (kind in ('summary', 'reader')),
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  reasoning_tokens integer not null default 0,
  first_text_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_created_at_idx on public.ai_usage (created_at);

alter table public.ai_usage enable row level security;

create policy "Signed-in users read AI usage" on public.ai_usage
  for select to authenticated
  using (true);
