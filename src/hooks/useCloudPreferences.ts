import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { db, isDbAvailable } from '@/lib/localDb';
import { getLocalPreferences, savePreferencesLocally, syncPreferencesDown } from '@/lib/syncEngine';

export interface UserPreferences {
  font_size: number;
  font_family: string;
  text_color: string;
  line_height: number;
  sidebar_pinned: boolean;
  theme: string;          // theme ID (e.g. 'default', 'royal-gold')
  engine: string;         // transcription engine
  source_language: string; // source language for transcription
  custom_themes: string;  // JSON string of custom themes array
  editor_columns: number; // 1, 2, or 3 column text display
}

const DEFAULT_PREFERENCES: UserPreferences = {
  font_size: 16,
  font_family: 'Assistant',
  text_color: 'hsl(var(--foreground))',
  line_height: 1.6,
  sidebar_pinned: false,
  theme: 'default',
  engine: 'groq',
  source_language: 'auto',
  custom_themes: '[]',
  editor_columns: 1,
};

export const useCloudPreferences = () => {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [isLoaded, setIsLoaded] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load preferences: local DB → localStorage → cloud
  useEffect(() => {
    if (!user) {
      // Load from localStorage as fallback
      try {
        const saved = localStorage.getItem('user_preferences');
        if (saved) {
          const parsed = JSON.parse(saved);
          setPreferences({ ...DEFAULT_PREFERENCES, ...parsed });
        } else {
          // Try individual keys for backward compat
          const prefs = { ...DEFAULT_PREFERENCES };
          const engine = localStorage.getItem('transcript_engine');
          const srcLang = localStorage.getItem('transcript_sourceLanguage');
          const fontSize = localStorage.getItem('transcript_fontSize');
          const fontFamily = localStorage.getItem('transcript_fontFamily');
          const textColor = localStorage.getItem('transcript_textColor');
          const lineHeight = localStorage.getItem('transcript_lineHeight');
          const themeId = localStorage.getItem('app_theme_id');
          const customThemes = localStorage.getItem('app_custom_themes');
          const editorCols = localStorage.getItem('editor_columns');
          if (engine) prefs.engine = engine;
          if (srcLang) prefs.source_language = srcLang;
          if (editorCols) prefs.editor_columns = Number(editorCols);
          if (fontSize) prefs.font_size = Number(fontSize);
          if (fontFamily) prefs.font_family = fontFamily;
          if (textColor) prefs.text_color = textColor;
          if (lineHeight) prefs.line_height = Number(lineHeight);
          if (themeId) prefs.theme = themeId;
          if (customThemes) prefs.custom_themes = customThemes;
          setPreferences(prefs);
        }
      } catch {}
      setIsLoaded(true);
      return;
    }

    const load = async () => {
      // 1) Try local DB first (instant)
      const localPrefs = await getLocalPreferences();
      if (localPrefs) {
        const { id: _id, _dirty, ...rest } = localPrefs;
        setPreferences({ ...DEFAULT_PREFERENCES, ...rest });
        setIsLoaded(true);
      }

      // 2) Then fetch from cloud in background
      const { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data) {
        const loaded: UserPreferences = {
          font_size: data.font_size ?? DEFAULT_PREFERENCES.font_size,
          font_family: data.font_family ?? DEFAULT_PREFERENCES.font_family,
          text_color: data.text_color ?? DEFAULT_PREFERENCES.text_color,
          line_height: Number(data.line_height) || DEFAULT_PREFERENCES.line_height,
          sidebar_pinned: data.sidebar_pinned ?? DEFAULT_PREFERENCES.sidebar_pinned,
          theme: data.theme ?? DEFAULT_PREFERENCES.theme,
          engine: (data as any).engine ?? DEFAULT_PREFERENCES.engine,
          source_language: (data as any).source_language ?? DEFAULT_PREFERENCES.source_language,
          custom_themes: typeof (data as any).custom_themes === 'string'
            ? (data as any).custom_themes
            : JSON.stringify((data as any).custom_themes ?? []),
          editor_columns: (data as any).editor_columns ?? DEFAULT_PREFERENCES.editor_columns,
        };
        setPreferences(loaded);
        // Mirror to localStorage so useTheme picks up cloud values
        localStorage.setItem('app_theme_id', loaded.theme);
        localStorage.setItem('app_custom_themes', loaded.custom_themes);
        localStorage.setItem('editor_columns', String(loaded.editor_columns));
        window.dispatchEvent(new CustomEvent('cloud-prefs-loaded'));

        // Save to local DB for next time
        await savePreferencesLocally({
          id: 'current',
          user_id: user.id,
          ...loaded,
          updated_at: data.updated_at || new Date().toISOString(),
        });
        // Mark not dirty since it came from cloud
        await db.preferences.update('current', { _dirty: false });
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

    // Also mirror individual localStorage keys for backward compat
    localStorage.setItem('transcript_engine', updated.engine);
    localStorage.setItem('transcript_sourceLanguage', updated.source_language);
    localStorage.setItem('transcript_fontSize', String(updated.font_size));
    localStorage.setItem('transcript_fontFamily', updated.font_family);
    localStorage.setItem('transcript_textColor', updated.text_color);
    localStorage.setItem('transcript_lineHeight', String(updated.line_height));
    localStorage.setItem('app_theme_id', updated.theme);
    localStorage.setItem('app_custom_themes', updated.custom_themes);
    localStorage.setItem('editor_columns', String(updated.editor_columns));

    // Save to local DB (instant, offline-capable)
    if (user) {
      savePreferencesLocally({
        id: 'current',
        user_id: user.id,
        ...updated,
        updated_at: new Date().toISOString(),
      });
    }

    if (!user) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      // Parse custom_themes string to JSON for DB storage
      let customThemesParsed: unknown = [];
      try { customThemesParsed = JSON.parse(updated.custom_themes); } catch {}

      const { error } = await supabase
        .from('user_preferences')
        .upsert({
          user_id: user.id,
          font_size: updated.font_size,
          font_family: updated.font_family,
          text_color: updated.text_color,
          line_height: updated.line_height,
          sidebar_pinned: updated.sidebar_pinned,
          theme: updated.theme,
          engine: updated.engine,
          source_language: updated.source_language,
          custom_themes: customThemesParsed,
          editor_columns: updated.editor_columns,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: 'user_id' });

      // Fallback: if new columns don't exist yet, save without them
      if (error) {
        await supabase
          .from('user_preferences')
          .upsert({
            user_id: user.id,
            font_size: updated.font_size,
            font_family: updated.font_family,
            text_color: updated.text_color,
            line_height: updated.line_height,
            sidebar_pinned: updated.sidebar_pinned,
            theme: updated.theme,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });
      }
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
