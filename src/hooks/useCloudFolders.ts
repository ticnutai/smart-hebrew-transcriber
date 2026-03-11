import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { debugLog } from '@/lib/debugLogger';

interface FolderInfo {
  name: string;
  count: number;
}

export const useCloudFolders = () => {
  const { user, isAuthenticated } = useAuth();
  const [rawFolders, setRawFolders] = useState<string[]>([]);

  const fetchFolders = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('transcripts')
        .select('folder')
        .eq('user_id', user.id);

      if (error) throw error;

      const folderNames = (data || [])
        .map(d => d.folder as string)
        .filter(f => f && f.trim() !== '');
      setRawFolders(folderNames);
    } catch (error) {
      debugLog.error('Cloud', 'Error fetching folders', error instanceof Error ? error.message : String(error));
    }
  }, [user]);

  useEffect(() => {
    if (isAuthenticated) fetchFolders();
  }, [isAuthenticated, fetchFolders]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const channel = supabase
      .channel('folders-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transcripts' },
        () => fetchFolders()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isAuthenticated, fetchFolders]);

  const folders: FolderInfo[] = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of rawFolders) {
      counts.set(f, (counts.get(f) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'he'));
  }, [rawFolders]);

  const createFolder = useCallback(async (name: string) => {
    // Folders are implicit — created by assigning to a transcript
    // This is a no-op placeholder; actual folder creation happens via transcript update
  }, []);

  return { folders, refetch: fetchFolders, createFolder };
};
