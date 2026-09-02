-- Timezone and clock-format settings are no longer exposed in the UI
-- (Settings page) and have no remaining reader — drop the columns.
ALTER TABLE public.user_preferences
  DROP COLUMN IF EXISTS timezone,
  DROP COLUMN IF EXISTS clock_format;
