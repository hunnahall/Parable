-- Covenant Works Design System v2: dark by default, light available, one
-- sans (Hanken Grotesk). The body-font picker goes; a theme choice takes
-- its place. 'system' follows the device.

alter table public.user_preferences
  add column if not exists theme text not null default 'system'
    check (theme in ('system', 'dark', 'light'));

alter table public.user_preferences drop constraint if exists user_preferences_font_check;
alter table public.user_preferences drop column if exists font;
