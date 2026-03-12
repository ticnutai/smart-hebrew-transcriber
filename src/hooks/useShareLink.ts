import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const useShareLink = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const createShareLink = async (transcriptId: string): Promise<string | null> => {
    if (!user) return null;
    setLoading(true);
    try {
      // Check if a share link already exists
      const { data: existing } = await supabase
        .from('shared_transcripts')
        .select('share_token')
        .eq('transcript_id', transcriptId)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (existing?.share_token) {
        return `${window.location.origin}/share/${existing.share_token}`;
      }

      // Create new share link
      const { data, error } = await supabase
        .from('shared_transcripts')
        .insert({ transcript_id: transcriptId, user_id: user.id })
        .select('share_token')
        .single();

      if (error) throw error;
      return `${window.location.origin}/share/${data.share_token}`;
    } catch (err) {
      console.error('Failed to create share link:', err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const revokeShareLink = async (transcriptId: string) => {
    if (!user) return;
    await supabase
      .from('shared_transcripts')
      .update({ is_active: false })
      .eq('transcript_id', transcriptId)
      .eq('user_id', user.id);
  };

  const getSharedTranscript = async (token: string) => {
    // Fetch shared link
    const { data: shared, error: sharedError } = await supabase
      .from('shared_transcripts')
      .select('transcript_id, is_active, expires_at, view_count')
      .eq('share_token', token)
      .eq('is_active', true)
      .maybeSingle();

    if (sharedError || !shared) return null;

    // Check expiry
    if (shared.expires_at && new Date(shared.expires_at) < new Date()) return null;

    // Increment view count
    await supabase
      .from('shared_transcripts')
      .update({ view_count: (shared.view_count || 0) + 1 })
      .eq('share_token', token);

    // Fetch transcript content
    const { data: transcript, error: txError } = await supabase
      .from('transcripts')
      .select('text, engine, created_at, title')
      .eq('id', shared.transcript_id)
      .single();

    if (txError || !transcript) return null;
    return transcript;
  };

  return { createShareLink, revokeShareLink, getSharedTranscript, loading };
};
