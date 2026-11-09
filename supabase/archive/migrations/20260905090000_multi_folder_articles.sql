-- Folders become Parable's single curation primitive (tags are dropped in
-- the next migration), so an article has to be able to live in more than
-- one at a time. article_folders' PK was (feed_item_id, user_id), which
-- allowed exactly one folder per article per user.

alter table public.article_folders
  drop constraint article_folders_pkey;

alter table public.article_folders
  add constraint article_folders_pkey
  primary key (feed_item_id, user_id, folder_id);

-- Filing rules and the folder picker both read "which folders is this
-- article in", which is now a multi-row lookup per article.
create index if not exists article_folders_user_folder_idx
  on public.article_folders (user_id, folder_id);

-- folders_name_parent_unique was (parent_id, name) NULLS NOT DISTINCT with
-- no user scoping, dating from when Parable was single-user: two accounts
-- could not both have a root folder named "Tech". Folders are load-bearing
-- now, so scope the constraint to its owner.
-- It's backed by a constraint, not a bare index, so it has to be dropped
-- as one.
alter table public.folders drop constraint if exists folders_name_parent_unique;

create unique index folders_user_name_parent_unique
  on public.folders (user_id, parent_id, name)
  nulls not distinct;
