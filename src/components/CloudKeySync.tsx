import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

/**
 * Invisible component that syncs API keys from cloud to localStorage
 * on app load, so all transcription functions find keys immediately.
 */
const CloudKeySync = () => {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const syncKeys = async () => {
      try {
        const { data } = await supabase
          .from('user_api_keys')
          .select('*')
          .eq('user_identifier', user.id)
          .maybeSingle();

        if (data) {
          if (data.openai_key) localStorage.setItem('openai_api_key', data.openai_key);
          if (data.google_key) localStorage.setItem('google_api_key', data.google_key);
          if (data.groq_key) localStorage.setItem('groq_api_key', data.groq_key);
          if (data.claude_key) localStorage.setItem('claude_api_key', data.claude_key);
          if (data.assemblyai_key) localStorage.setItem('assemblyai_api_key', data.assemblyai_key);
          if (data.deepgram_key) localStorage.setItem('deepgram_api_key', data.deepgram_key);
          console.log('[CloudKeySync] API keys synced from cloud ✓');
        }
      } catch (err) {
        console.error('[CloudKeySync] Error syncing keys:', err);
      }
    };

    syncKeys();
  }, [user]);

  return null;
};

export default CloudKeySync;
