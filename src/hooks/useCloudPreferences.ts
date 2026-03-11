import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface UserPreferences {
  font_size: number;
  font_family: string;
  text_color: string;
  line_height: number;
  sidebar_pinned: boolean;
  theme: string;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  font_size: 16,
  font_family: 'Assistant',
  text_color: 'hsl(var(--foreground))',
  line_height: 1.6,
  sidebar_pinned: false,
  theme: 'light',
};

export const useCloudPreferences = () => {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [isLoaded, setIsLoaded] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load preferences from cloud
  useEffect(() => {
    if (!user) {
      // Load from localStorage as fallback
      try {
        const saved = localStorage.getItem('user_preferences');
        if (saved) setPreferences(JSON.parse(saved));
      } catch {}
      setIsLoaded(true);
      return;
    }

    const load = async () => {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data) {
        setPreferences({
          font_size: data.font_size ?? DEFAULT_PREFERENCES.font_size,
          font_family: data.font_family ?? DEFAULT_PREFERENCES.font_family,
          text_color: data.text_color ?? DEFAULT_PREFERENCES.text_color,
          line_height: Number(data.line_height) || DEFAULT_PREFERENCES.line_height,
          sidebar_pinned: data.sidebar_pinned ?? DEFAULT_PREFERENCES.sidebar_pinned,
          theme: data.theme ?? DEFAULT_PREFERENCES.theme,
        });
      } else if (!error) {
        // Create initial record
        await supabase.from('user_preferences').insert({
          user_id: user.id,
          ...DEFAULT_PREFERENCES,
        });
      }
      setIsLoaded(true);
    };

    load();
  }, [user]);

  // Debounced save to cloud
  const saveToCloud = useCallback((updated: UserPreferences) => {
    // Always save to localStorage for quick access
    localStorage.setItem('user_preferences', JSON.stringify(updated));

    if (!user) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      await supabase
        .from('user_preferences')
        .upsert({
          user_id: user.id,
          ...updated,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
    }, 500);
  }, [user]);

  const updatePreference = useCallback(<K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
  ) => {
    setPreferences(prev => {
      const updated = { ...prev, [key]: value };
      saveToCloud(updated);
      return updated;
    });
  }, [saveToCloud]);

  const updatePreferences = useCallback((partial: Partial<UserPreferences>) => {
    setPreferences(prev => {
      const updated = { ...prev, ...partial };
      saveToCloud(updated);
      return updated;
    });
  }, [saveToCloud]);

  return {
    preferences,
    isLoaded,
    updatePreference,
    updatePreferences,
  };
};
