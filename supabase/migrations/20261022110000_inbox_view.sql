-- The Inbox's layout (roadmap R21): the list, or the front page (category
-- panels showing their top stories). List stays the default until the
-- front page has been tried on real data.
alter table public.user_preferences
  add column if not exists inbox_view text not null default 'list'
  check (inbox_view in ('list', 'front'));
