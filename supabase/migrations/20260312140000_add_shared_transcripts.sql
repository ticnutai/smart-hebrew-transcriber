-- Create shared_transcripts table for shareable public links
CREATE TABLE IF NOT EXISTS public.shared_transcripts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  transcript_id uuid NOT NULL REFERENCES public.transcripts(id) ON DELETE CASCADE,
  share_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone DEFAULT (now() + interval '30 days'),
  view_count integer DEFAULT 0,
  is_active boolean DEFAULT true
);

-- Index for fast token lookup
CREATE INDEX IF NOT EXISTS idx_shared_transcripts_token ON public.shared_transcripts(share_token);

-- RLS policies
ALTER TABLE public.shared_transcripts ENABLE ROW LEVEL SECURITY;

-- Owner can manage their shared links
CREATE POLICY "Users can manage own shared links" ON public.shared_transcripts
  FOR ALL USING (auth.uid() = user_id);

-- Anyone can read active, non-expired shared links (for the public share page)
CREATE POLICY "Anyone can view active shared links" ON public.shared_transcripts
  FOR SELECT USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));
