import { useState, useEffect, useCallback } from 'react';

export interface ThemeColors {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
  sidebarBackground: string;
  sidebarForeground: string;
  sidebarPrimary: string;
  sidebarPrimaryForeground: string;
  sidebarAccent: string;
  sidebarAccentForeground: string;
  sidebarBorder: string;
  sidebarRing: string;
  iconColor: string;
}

export interface AppTheme {
  id: string;
  name: string;
  nameHe: string;
  colors: ThemeColors;
  isCustom?: boolean;
}

// Built-in themes
export const BUILT_IN_THEMES: AppTheme[] = [
  {
    id: 'default',
    name: 'Default',
    nameHe: 'ברירת מחדל',
    colors: {
      background: '40 15% 96%',
      foreground: '220 60% 8%',
      card: '38 25% 98%',
      cardForeground: '220 60% 8%',
      popover: '38 25% 98%',
      popoverForeground: '220 60% 8%',
      primary: '220 85% 22%',
      primaryForeground: '40 20% 98%',
      secondary: '38 20% 90%',
      secondaryForeground: '220 60% 8%',
      muted: '38 15% 92%',
      mutedForeground: '220 30% 40%',
      accent: '220 75% 35%',
      accentForeground: '40 20% 98%',
      destructive: '0 70% 50%',
      destructiveForeground: '40 20% 98%',
      border: '38 20% 88%',
      input: '38 20% 88%',
      ring: '220 85% 22%',
      sidebarBackground: '38 25% 98%',
      sidebarForeground: '220 60% 8%',
      sidebarPrimary: '220 85% 22%',
      sidebarPrimaryForeground: '40 20% 98%',
      sidebarAccent: '38 20% 94%',
      sidebarAccentForeground: '220 60% 8%',
      sidebarBorder: '38 20% 88%',
      sidebarRing: '220 85% 22%',
      iconColor: '',
    },
  },
  {
    id: 'royal-gold',
    name: 'Royal Gold',
    nameHe: 'זהב מלכותי',
    colors: {
      background: '0 0% 100%',
      foreground: '220 60% 20%',
      card: '0 0% 100%',
      cardForeground: '220 60% 20%',
      popover: '0 0% 100%',
      popoverForeground: '220 60% 20%',
      primary: '43 74% 49%',
      primaryForeground: '0 0% 100%',
      secondary: '43 30% 93%',
      secondaryForeground: '220 60% 20%',
      muted: '43 20% 95%',
      mutedForeground: '220 30% 40%',
      accent: '43 74% 49%',
      accentForeground: '0 0% 100%',
      destructive: '0 70% 50%',
      destructiveForeground: '0 0% 100%',
      border: '43 50% 70%',
      input: '43 30% 85%',
      ring: '43 74% 49%',
      sidebarBackground: '0 0% 100%',
      sidebarForeground: '220 60% 20%',
      sidebarPrimary: '43 74% 49%',
      sidebarPrimaryForeground: '0 0% 100%',
      sidebarAccent: '43 30% 95%',
      sidebarAccentForeground: '220 60% 20%',
      sidebarBorder: '43 50% 70%',
      sidebarRing: '43 74% 49%',
      iconColor: 'hsl(43, 74%, 49%)',
    },
  },
  {
    id: 'dark-modern',
    name: 'Dark Modern',
    nameHe: 'כהה מודרני',
    colors: {
      background: '220 50% 6%',
      foreground: '40 20% 95%',
      card: '220 45% 9%',
      cardForeground: '40 20% 95%',
      popover: '220 45% 9%',
      popoverForeground: '40 20% 95%',
      primary: '220 80% 55%',
      primaryForeground: '0 0% 100%',
      secondary: '220 40% 15%',
      secondaryForeground: '40 20% 95%',
      muted: '220 35% 12%',
      mutedForeground: '220 20% 65%',
      accent: '220 70% 45%',
      accentForeground: '0 0% 100%',
      destructive: '0 70% 50%',
      destructiveForeground: '0 0% 100%',
      border: '220 35% 20%',
      input: '220 35% 20%',
      ring: '220 80% 55%',
      sidebarBackground: '220 50% 6%',
      sidebarForeground: '40 20% 95%',
      sidebarPrimary: '220 80% 55%',
      sidebarPrimaryForeground: '0 0% 100%',
      sidebarAccent: '220 40% 12%',
      sidebarAccentForeground: '40 20% 95%',
      sidebarBorder: '220 35% 20%',
      sidebarRing: '220 80% 55%',
      iconColor: '',
    },
  },
  {
    id: 'emerald',
    name: 'Emerald',
    nameHe: 'אמרלד ירוק',
    colors: {
      background: '150 20% 96%',
      foreground: '150 50% 8%',
      card: '150 25% 98%',
      cardForeground: '150 50% 8%',
      popover: '150 25% 98%',
      popoverForeground: '150 50% 8%',
      primary: '152 70% 30%',
      primaryForeground: '0 0% 100%',
      secondary: '150 20% 90%',
      secondaryForeground: '150 50% 8%',
      muted: '150 15% 92%',
      mutedForeground: '150 20% 40%',
      accent: '152 65% 35%',
      accentForeground: '0 0% 100%',
      destructive: '0 70% 50%',
      destructiveForeground: '0 0% 100%',
      border: '150 20% 85%',
      input: '150 20% 85%',
      ring: '152 70% 30%',
      sidebarBackground: '150 25% 98%',
      sidebarForeground: '150 50% 8%',
      sidebarPrimary: '152 70% 30%',
      sidebarPrimaryForeground: '0 0% 100%',
      sidebarAccent: '150 20% 94%',
      sidebarAccentForeground: '150 50% 8%',
      sidebarBorder: '150 20% 85%',
      sidebarRing: '152 70% 30%',
      iconColor: '',
    },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    nameHe: 'שקיעה',
    colors: {
      background: '20 30% 97%',
      foreground: '20 60% 10%',
      card: '20 35% 99%',
      cardForeground: '20 60% 10%',
      popover: '20 35% 99%',
      popoverForeground: '20 60% 10%',
      primary: '15 80% 50%',
      primaryForeground: '0 0% 100%',
      secondary: '20 25% 90%',
      secondaryForeground: '20 60% 10%',
      muted: '20 15% 93%',
      mutedForeground: '20 25% 40%',
      accent: '340 70% 50%',
      accentForeground: '0 0% 100%',
      destructive: '0 70% 50%',
      destructiveForeground: '0 0% 100%',
      border: '20 25% 85%',
      input: '20 25% 85%',
      ring: '15 80% 50%',
      sidebarBackground: '20 35% 99%',
      sidebarForeground: '20 60% 10%',
      sidebarPrimary: '15 80% 50%',
      sidebarPrimaryForeground: '0 0% 100%',
      sidebarAccent: '20 25% 94%',
      sidebarAccentForeground: '20 60% 10%',
      sidebarBorder: '20 25% 85%',
      sidebarRing: '15 80% 50%',
      iconColor: '',
    },
  },
  {
    id: 'purple-night',
    name: 'Purple Night',
    nameHe: 'לילה סגול',
    colors: {
      background: '270 40% 8%',
      foreground: '270 10% 92%',
      card: '270 35% 12%',
      cardForeground: '270 10% 92%',
      popover: '270 35% 12%',
      popoverForeground: '270 10% 92%',
      primary: '270 70% 55%',
      primaryForeground: '0 0% 100%',
      secondary: '270 30% 18%',
      secondaryForeground: '270 10% 92%',
      muted: '270 25% 15%',
      mutedForeground: '270 15% 60%',
      accent: '280 65% 60%',
      accentForeground: '0 0% 100%',
      destructive: '0 70% 50%',
      destructiveForeground: '0 0% 100%',
      border: '270 25% 22%',
      input: '270 25% 22%',
      ring: '270 70% 55%',
      sidebarBackground: '270 40% 8%',
      sidebarForeground: '270 10% 92%',
      sidebarPrimary: '270 70% 55%',
      sidebarPrimaryForeground: '0 0% 100%',
      sidebarAccent: '270 30% 15%',
      sidebarAccentForeground: '270 10% 92%',
      sidebarBorder: '270 25% 22%',
      sidebarRing: '270 70% 55%',
      iconColor: '',
    },
  },
];

const CSS_VAR_MAP: Record<keyof ThemeColors, string> = {
  background: '--background',
  foreground: '--foreground',
  card: '--card',
  cardForeground: '--card-foreground',
  popover: '--popover',
  popoverForeground: '--popover-foreground',
  primary: '--primary',
  primaryForeground: '--primary-foreground',
  secondary: '--secondary',
  secondaryForeground: '--secondary-foreground',
  muted: '--muted',
  mutedForeground: '--muted-foreground',
  accent: '--accent',
  accentForeground: '--accent-foreground',
  destructive: '--destructive',
  destructiveForeground: '--destructive-foreground',
  border: '--border',
  input: '--input',
  ring: '--ring',
  sidebarBackground: '--sidebar-background',
  sidebarForeground: '--sidebar-foreground',
  sidebarPrimary: '--sidebar-primary',
  sidebarPrimaryForeground: '--sidebar-primary-foreground',
  sidebarAccent: '--sidebar-accent',
  sidebarAccentForeground: '--sidebar-accent-foreground',
  sidebarBorder: '--sidebar-border',
  sidebarRing: '--sidebar-ring',
  iconColor: '--icon-color',
};

function applyThemeToDOM(colors: ThemeColors) {
  const root = document.documentElement;
  for (const [key, cssVar] of Object.entries(CSS_VAR_MAP)) {
    const value = colors[key as keyof ThemeColors];
    if (cssVar === '--icon-color') {
      root.style.setProperty(cssVar, value || 'inherit');
    } else {
      root.style.setProperty(cssVar, value);
    }
  }
}

export function useTheme() {
  const [activeThemeId, setActiveThemeId] = useState<string>('default');
  const [customThemes, setCustomThemes] = useState<AppTheme[]>([]);

  // Load on mount
  useEffect(() => {
    const savedId = localStorage.getItem('app_theme_id') || 'default';
    const savedCustom = localStorage.getItem('app_custom_themes');
    const customs: AppTheme[] = savedCustom ? JSON.parse(savedCustom) : [];
    setCustomThemes(customs);
    setActiveThemeId(savedId);

    const allThemes = [...BUILT_IN_THEMES, ...customs];
    const theme = allThemes.find(t => t.id === savedId) || BUILT_IN_THEMES[0];
    applyThemeToDOM(theme.colors);
  }, []);

  const allThemes = [...BUILT_IN_THEMES, ...customThemes];

  const setTheme = useCallback((themeId: string) => {
    const all = [...BUILT_IN_THEMES, ...customThemes];
    const theme = all.find(t => t.id === themeId);
    if (!theme) return;
    setActiveThemeId(themeId);
    localStorage.setItem('app_theme_id', themeId);
    applyThemeToDOM(theme.colors);
  }, [customThemes]);

  const saveCustomTheme = useCallback((theme: AppTheme) => {
    setCustomThemes(prev => {
      const existing = prev.findIndex(t => t.id === theme.id);
      const updated = existing >= 0
        ? prev.map(t => t.id === theme.id ? { ...theme, isCustom: true } : t)
        : [...prev, { ...theme, isCustom: true }];
      localStorage.setItem('app_custom_themes', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const deleteCustomTheme = useCallback((themeId: string) => {
    setCustomThemes(prev => {
      const updated = prev.filter(t => t.id !== themeId);
      localStorage.setItem('app_custom_themes', JSON.stringify(updated));
      return updated;
    });
    if (activeThemeId === themeId) {
      setTheme('default');
    }
  }, [activeThemeId, setTheme]);

  return {
    activeThemeId,
    allThemes,
    customThemes,
    setTheme,
    saveCustomTheme,
    deleteCustomTheme,
  };
}
