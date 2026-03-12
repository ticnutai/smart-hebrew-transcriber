import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { debugLog } from '@/lib/debugLogger';

export interface CloudTranscript {
  id: string;
  user_id: string;
  text: string;
  engine: string;
  tags: string[];
  notes: string;
  title: string;
  folder: string;
  category: string;
  is_favorite: boolean;
  audio_file_path: string | null;
  word_timings: Array<{ word: string; start: number; end: number; probability?: number }> | null;
  created_at: string;
  updated_at: string;
}

export const useCloudTranscripts = () => {
  const { user, isAuthenticated } = useAuth();
  const [transcripts, setTranscripts] = useState<CloudTranscript[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchTranscripts = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('transcripts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setTranscripts((data as CloudTranscript[]) || []);
    } catch (error) {
      debugLog.error('Cloud', 'Error fetching transcripts', error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchTranscripts();
    }
  }, [isAuthenticated, fetchTranscripts]);

  // Realtime subscription
  useEffect(() => {
    if (!isAuthenticated) return;

    const channel = supabase
      .channel('transcripts-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'transcripts' },
        (payload) => {
          const newItem = payload.new as CloudTranscript;
          setTranscripts(prev => [newItem, ...prev]);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'transcripts' },
        (payload) => {
          const updated = payload.new as CloudTranscript;
          setTranscripts(prev => prev.map(t => t.id === updated.id ? updated : t));
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'transcripts' },
        (payload) => {
          setTranscripts(prev => prev.filter(t => t.id !== payload.old.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated, fetchTranscripts]);

  const uploadAudioFile = useCallback(async (file: File): Promise<string | null> => {
    if (!user) return null;
    try {
      const ext = file.name.split('.').pop() || 'wav';
      const filePath = `${user.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}.${ext}`;
      const { error } = await supabase.storage
        .from('permanent-audio')
        .upload(filePath, file, { cacheControl: '3600', upsert: false });
      if (error) throw error;
      return filePath;
    } catch (error) {
      debugLog.error('Cloud', 'Error uploading audio', error instanceof Error ? error.message : String(error));
      return null;
    }
  }, [user]);

  const getAudioUrl = useCallback(async (filePath: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase.storage
        .from('permanent-audio')
        .createSignedUrl(filePath, 3600); // 1 hour
      if (error) throw error;
      return data.signedUrl;
    } catch (error) {
      debugLog.error('Cloud', 'Error getting audio URL', error instanceof Error ? error.message : String(error));
      return null;
    }
  }, []);

  const saveTranscript = useCallback(async (
    text: string,
    engine: string,
    title?: string,
    audioFile?: File,
    wordTimings?: Array<{ word: string; start: number; end: number; probability?: number }>
  ): Promise<CloudTranscript | null> => {
    if (!user) {
      const history = JSON.parse(localStorage.getItem('transcript_history') || '[]');
      const entry = { text, timestamp: Date.now(), engine, tags: [], notes: '' };
      const updated = [entry, ...history].slice(0, 50);
      localStorage.setItem('transcript_history', JSON.stringify(updated));
      return null;
    }

    try {
      // Upload audio file if provided
      let audioFilePath: string | null = null;
      if (audioFile) {
        audioFilePath = await uploadAudioFile(audioFile);
      }

      const autoTitle = title || text.substring(0, 60).replace(/\n/g, ' ') + '...';
      const { data, error } = await supabase
        .from('transcripts')
        .insert({
          user_id: user.id,
          text,
          engine,
          title: autoTitle,
          tags: [],
          notes: '',
          folder: '',
          audio_file_path: audioFilePath,
          word_timings: wordTimings && wordTimings.length > 0 ? wordTimings as any : null,
        })
        .select()
        .single();

      if (error) throw error;
      return data as CloudTranscript;
    } catch (error) {
      debugLog.error('Cloud', 'Error saving transcript', error instanceof Error ? error.message : String(error));
      toast({
        title: 'שגיאה בשמירה',
        description: 'לא ניתן לשמור את התמלול בענן',
        variant: 'destructive',
      });
      return null;
    }
  }, [user, uploadAudioFile]);

  const updateTranscript = useCallback(async (
    id: string,
    updates: Partial<Pick<CloudTranscript, 'text' | 'tags' | 'notes' | 'title' | 'folder' | 'category' | 'is_favorite'>>
  ) => {
    try {
      const { error } = await supabase
        .from('transcripts')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      debugLog.error('Cloud', 'Error updating transcript', error instanceof Error ? error.message : String(error));
      toast({
        title: 'שגיאה בעדכון',
        description: 'לא ניתן לעדכן את התמלול',
        variant: 'destructive',
      });
    }
  }, []);

  const deleteTranscript = useCallback(async (id: string) => {
    try {
      // Delete associated audio file if exists
      const transcript = transcripts.find(t => t.id === id);
      if (transcript?.audio_file_path) {
        await supabase.storage.from('permanent-audio').remove([transcript.audio_file_path]);
      }

      const { error } = await supabase
        .from('transcripts')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      debugLog.error('Cloud', 'Error deleting transcript', error instanceof Error ? error.message : String(error));
      toast({
        title: 'שגיאה במחיקה',
        description: 'לא ניתן למחוק את התמלול',
        variant: 'destructive',
      });
    }
  }, [transcripts]);

  const deleteAll = useCallback(async () => {
    if (!user) return;
    try {
      // Collect audio file paths before deleting records
      const audioPaths = transcripts
        .filter(t => t.audio_file_path)
        .map(t => t.audio_file_path!);

      const { error } = await supabase
        .from('transcripts')
        .delete()
        .eq('user_id', user.id);

      if (error) throw error;

      // Delete audio files from storage
      if (audioPaths.length > 0) {
        await supabase.storage.from('permanent-audio').remove(audioPaths);
      }

      setTranscripts([]);
    } catch (error) {
      debugLog.error('Cloud', 'Error deleting all transcripts', error instanceof Error ? error.message : String(error));
    }
  }, [user, transcripts]);

  // Stats (memoized to prevent unnecessary re-renders)
  const stats = useMemo(() => ({
    total: transcripts.length,
    engines: [...new Set(transcripts.map(t => t.engine))],
    totalChars: transcripts.reduce((sum, t) => sum + t.text.length, 0),
  }), [transcripts]);

  const getTranscriptById = useCallback(async (id: string): Promise<CloudTranscript | null> => {
    try {
      const { data, error } = await supabase
        .from('transcripts')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as CloudTranscript;
    } catch {
      return null;
    }
  }, []);

  return {
    transcripts,
    isLoading,
    saveTranscript,
    updateTranscript,
    deleteTranscript,
    deleteAll,
    fetchTranscripts,
    getAudioUrl,
    getTranscriptById,
    stats,
    isCloud: isAuthenticated,
  };
};
