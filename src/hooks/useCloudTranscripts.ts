import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

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
      console.error('Error fetching transcripts:', error);
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
        { event: '*', schema: 'public', table: 'transcripts' },
        () => {
          fetchTranscripts();
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
      console.error('Error uploading audio:', error);
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
      console.error('Error getting audio URL:', error);
      return null;
    }
  }, []);

  const saveTranscript = useCallback(async (
    text: string,
    engine: string,
    title?: string,
    audioFile?: File
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
        })
        .select()
        .single();

      if (error) throw error;
      return data as CloudTranscript;
    } catch (error) {
      console.error('Error saving transcript:', error);
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
      console.error('Error updating transcript:', error);
      toast({
        title: 'שגיאה בעדכון',
        description: 'לא ניתן לעדכן את התמלול',
        variant: 'destructive',
      });
    }
  }, []);

  const deleteTranscript = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('transcripts')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting transcript:', error);
      toast({
        title: 'שגיאה במחיקה',
        description: 'לא ניתן למחוק את התמלול',
        variant: 'destructive',
      });
    }
  }, []);

  const deleteAll = useCallback(async () => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('transcripts')
        .delete()
        .eq('user_id', user.id);

      if (error) throw error;
      setTranscripts([]);
    } catch (error) {
      console.error('Error deleting all transcripts:', error);
    }
  }, [user]);

  // Stats
  const stats = {
    total: transcripts.length,
    engines: [...new Set(transcripts.map(t => t.engine))],
    totalChars: transcripts.reduce((sum, t) => sum + t.text.length, 0),
  };

  return {
    transcripts,
    isLoading,
    saveTranscript,
    updateTranscript,
    deleteTranscript,
    deleteAll,
    fetchTranscripts,
    stats,
    isCloud: isAuthenticated,
  };
};
