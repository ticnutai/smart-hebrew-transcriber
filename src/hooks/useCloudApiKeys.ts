import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface ApiKeys {
  openai_key: string;
  google_key: string;
  groq_key: string;
  claude_key: string;
  assemblyai_key: string;
  deepgram_key: string;
}

const EMPTY_KEYS: ApiKeys = {
  openai_key: '',
  google_key: '',
  groq_key: '',
  claude_key: '',
  assemblyai_key: '',
  deepgram_key: '',
};

// Map from cloud field names to localStorage keys
const STORAGE_MAP: Record<keyof ApiKeys, string> = {
  openai_key: 'openai_api_key',
  google_key: 'google_api_key',
  groq_key: 'groq_api_key',
  claude_key: 'claude_api_key',
  assemblyai_key: 'assemblyai_api_key',
  deepgram_key: 'deepgram_api_key',
};

let cachedKeys: ApiKeys | null = null;
let loadPromise: Promise<ApiKeys> | null = null;

export const useCloudApiKeys = () => {
  const { user } = useAuth();
  const [keys, setKeys] = useState<ApiKeys>(cachedKeys || EMPTY_KEYS);
  const [isLoaded, setIsLoaded] = useState(!!cachedKeys);

  const syncToLocalStorage = useCallback((apiKeys: ApiKeys) => {
    for (const [field, storageKey] of Object.entries(STORAGE_MAP)) {
      const value = apiKeys[field as keyof ApiKeys];
      if (value) {
        localStorage.setItem(storageKey, value);
      }
    }
  }, []);

  const loadKeys = useCallback(async () => {
    if (!user) return;

    // Prevent duplicate loads
    if (loadPromise) {
      const result = await loadPromise;
      setKeys(result);
      setIsLoaded(true);
      return;
    }

    loadPromise = (async () => {
      try {
        const { data, error } = await supabase
          .from('user_api_keys')
          .select('*')
          .eq('user_identifier', user.id)
          .maybeSingle();

        if (data) {
          const loaded: ApiKeys = {
            openai_key: data.openai_key || '',
            google_key: data.google_key || '',
            groq_key: data.groq_key || '',
            claude_key: data.claude_key || '',
            assemblyai_key: data.assemblyai_key || '',
            deepgram_key: data.deepgram_key || '',
          };
          cachedKeys = loaded;
          syncToLocalStorage(loaded);
          return loaded;
        }
      } catch (err) {
        console.error('Error loading API keys from cloud:', err);
      }
      return EMPTY_KEYS;
    })();

    const result = await loadPromise;
    loadPromise = null;
    setKeys(result);
    setIsLoaded(true);
  }, [user, syncToLocalStorage]);

  useEffect(() => {
    if (user && !cachedKeys) {
      loadKeys();
    } else if (cachedKeys) {
      setKeys(cachedKeys);
      setIsLoaded(true);
    }
  }, [user, loadKeys]);

  const saveKeys = useCallback(async (newKeys: Partial<ApiKeys>) => {
    if (!user) return;
    const merged = { ...keys, ...newKeys };
    setKeys(merged);
    cachedKeys = merged;
    syncToLocalStorage(merged);

    await supabase
      .from('user_api_keys')
      .upsert({
        user_identifier: user.id,
        ...merged,
      }, { onConflict: 'user_identifier' });
  }, [user, keys, syncToLocalStorage]);

  const invalidateCache = useCallback(() => {
    cachedKeys = null;
    loadPromise = null;
  }, []);

  return { keys, isLoaded, saveKeys, loadKeys, invalidateCache };
};
