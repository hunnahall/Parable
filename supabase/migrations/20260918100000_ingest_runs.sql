-- One row per completed ingest run: what it did, and what it spent.
--
-- src/lib/usage.ts already accumulates real token usage off every OpenAI
-- response, but it only ever reached a log line — which answers "what did
-- that run cost?" and nothing about trends. This is the persistent half:
-- it is what the Usage box on /settings reads, and it is the baseline any
-- future pipeline change gets measured against.
--
-- Deliberately not per-user. Ingest is one shared background job writing
-- rows every subscriber reads, so its spend is a property of the project,
-- not of an account.
create table if not exists public.ingest_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  duration_ms integer not null,

  feeds_processed integer not null default 0,
  feeds_failed integer not null default 0,
  items_inserted integer not null default 0,
  summaries_reused integer not null default 0,
  summaries_repaired integer not null default 0,

  -- Split by path so a change to one is legible without disentangling it
  -- from the others. Reasoning tokens are a subset of output tokens, not
  -- an addition to them.
  translate_calls integer not null default 0,
  translate_input_tokens integer not null default 0,
  translate_output_tokens integer not null default 0,
  translate_reasoning_tokens integer not null default 0,

  summarize_calls integer not null default 0,
  summarize_input_tokens integer not null default 0,
  summarize_output_tokens integer not null default 0,
  summarize_reasoning_tokens integer not null default 0,

  embed_calls integer not null default 0,
  embed_input_tokens integer not null default 0
);

-- The Usage box filters on a rolling window and nothing else.
create index if not exists ingest_runs_created_at_idx
  on public.ingest_runs (created_at desc);

alter table public.ingest_runs enable row level security;

-- Readable by any signed-in account, writable by none: ingest writes these
-- as the service role, which bypasses RLS entirely. There is nothing
-- personal in the table — it is operational data about the shared job —
-- and a user who can see the Inbox can already infer roughly how much
-- ingest is doing.
drop policy if exists "ingest_runs readable by authenticated" on public.ingest_runs;
create policy "ingest_runs readable by authenticated"
  on public.ingest_runs for select
  to authenticated
  using (true);

-- Not pruned by retention. At six runs a day this is ~2,200 rows a year,
-- and the whole value of the table is the history — reclaiming it would
-- defeat the point. Revisit if it ever becomes large enough to notice.
