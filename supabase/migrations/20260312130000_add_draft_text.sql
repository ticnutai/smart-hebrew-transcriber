-- Add draft_text column for auto-saving editor drafts across devices
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS draft_text text DEFAULT NULL;
