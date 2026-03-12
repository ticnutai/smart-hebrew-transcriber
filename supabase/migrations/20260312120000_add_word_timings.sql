-- Add word_timings JSONB column to transcripts for sync player across devices
ALTER TABLE public.transcripts
  ADD COLUMN IF NOT EXISTS word_timings jsonb DEFAULT NULL;

-- Index for quick non-null checks (partial index — only rows that have timings)
CREATE INDEX IF NOT EXISTS idx_transcripts_has_word_timings
  ON public.transcripts (id) WHERE word_timings IS NOT NULL;
