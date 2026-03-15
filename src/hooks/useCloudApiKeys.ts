import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { debugLog } from "@/lib/debugLogger";
import { db, isDbAvailable } from '@/lib/localDb';
import { getLocalApiKeys, saveApiKeysLocally } from '@/lib/syncEngine';
import { setEncryptedKey } from '@/lib/keyCrypto';

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
        setEncryptedKey(storageKey, value);
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
        // 1) Try local DB first (instant)
        const localKeys = await getLocalApiKeys();
        if (localKeys) {
          const { id: _id, user_identifier: _ui, updated_at: _ua, _dirty, ...rest } = localKeys;
          const loaded: ApiKeys = {
            openai_key: rest.openai_key || '',
            google_key: rest.google_key || '',
            groq_key: rest.groq_key || '',
            claude_key: rest.claude_key || '',
            assemblyai_key: rest.assemblyai_key || '',
            deepgram_key: rest.deepgram_key || '',
          };
          cachedKeys = loaded;
          syncToLocalStorage(loaded);
        }

        // 2) Then fetch from cloud
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

          // Save to local DB for next time
          await saveApiKeysLocally({
            id: 'current',
            user_identifier: user.id,
            ...loaded,
            updated_at: data.updated_at || new Date().toISOString(),
          });
          await db.apiKeys.update('current', { _dirty: false });

          return loaded;
        }
      } catch (err) {
        debugLog.error('ApiKeys', 'Error loading API keys from cloud', err instanceof Error ? err.message : String(err));
      }
      return cachedKeys || EMPTY_KEYS;
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

    // Save to local DB
    await saveApiKeysLocally({
      id: 'current',
      user_identifier: user.id,
      ...merged,
      updated_at: new Date().toISOString(),
    });

    // Push to cloud
    const { error } = await supabase
      .from('user_api_keys')
      .upsert({
        user_identifier: user.id,
        ...merged,
      }, { onConflict: 'user_identifier' });

    if (!error) {
      await db.apiKeys.update('current', { _dirty: false });
    }
  }, [user, keys, syncToLocalStorage]);

  const invalidateCache = useCallback(() => {
    cachedKeys = null;
    loadPromise = null;
  }, []);

  return { keys, isLoaded, saveKeys, loadKeys, invalidateCache };
};
