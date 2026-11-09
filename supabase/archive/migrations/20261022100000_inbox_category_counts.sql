-- The sidebar lists each category with a count of its Inbox stories
-- (roadmap R11). Same rule as the Inbox sections: a story whose feeds span
-- categories counts in each. Security invoker, so story_feed's RLS-scoped
-- view of the caller's own Inbox applies.
create or replace function public.inbox_category_counts()
returns table (category_id uuid, stories bigint)
language sql
stable
set search_path = public
as $$
  select (src->>'category_id')::uuid, count(distinct f.story_id)
  from public.story_feed('inbox', null, 100000) f
  cross join lateral jsonb_array_elements(f.items) src
  where src->>'category_id' is not null
  group by 1;
$$;

grant execute on function public.inbox_category_counts() to authenticated;
revoke execute on function public.inbox_category_counts() from anon, public;
