-- Apply after the categories code is deployed (roadmap step 7): feeds are
-- filed by category now, and folders hold saved articles only.
drop table if exists public.feed_folders;
