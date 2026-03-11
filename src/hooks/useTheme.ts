import { useState, useEffect, useCallback } from 'react';

// ─── Font Options ─────────────────────────────────────────────
export interface FontOption {
  id: string;
  name: string;
  nameHe: string;
  family: string;
  google: boolean;
  category: 'sans' | 'serif' | 'mono' | 'display';
}

export const FONT_OPTIONS: FontOption[] = [
  { id: 'system', name: 'System', nameHe: 'גופן מערכת', family: 'system-ui, -apple-system, sans-serif', google: false, category: 'sans' },
  { id: 'heebo', name: 'Heebo', nameHe: 'חיבו', family: '"Heebo", sans-serif', google: true, category: 'sans' },
  { id: 'rubik', name: 'Rubik', nameHe: 'רוביק', family: '"Rubik", sans-serif', google: true, category: 'sans' },
  { id: 'assistant', name: 'Assistant', nameHe: 'אסיסטנט', family: '"Assistant", sans-serif', google: true, category: 'sans' },
  { id: 'open-sans', name: 'Open Sans', nameHe: 'אופן סנס', family: '"Open Sans", sans-serif', google: true, category: 'sans' },
  { id: 'noto-hebrew', name: 'Noto Sans Hebrew', nameHe: 'נוטו עברי', family: '"Noto Sans Hebrew", sans-serif', google: true, category: 'sans' },
  { id: 'alef', name: 'Alef', nameHe: 'אלף', family: '"Alef", sans-serif', google: true, category: 'sans' },
  { id: 'varela-round', name: 'Varela Round', nameHe: 'ורלה מעוגל', family: '"Varela Round", sans-serif', google: true, category: 'sans' },
  { id: 'inter', name: 'Inter', nameHe: 'אינטר', family: '"Inter", sans-serif', google: true, category: 'sans' },
  { id: 'cairo', name: 'Cairo', nameHe: 'קהיר', family: '"Cairo", sans-serif', google: true, category: 'sans' },
  { id: 'frank-ruhl', name: 'Frank Ruhl Libre', nameHe: 'פרנק רוהל', family: '"Frank Ruhl Libre", serif', google: true, category: 'serif' },
  { id: 'david-libre', name: 'David Libre', nameHe: 'דוד', family: '"David Libre", serif', google: true, category: 'serif' },
  { id: 'secular-one', name: 'Secular One', nameHe: 'סקולר', family: '"Secular One", sans-serif', google: true, category: 'display' },
  { id: 'suez-one', name: 'Suez One', nameHe: 'סואץ', family: '"Suez One", serif', google: true, category: 'serif' },
  { id: 'ibm-plex-mono', name: 'IBM Plex Sans Hebrew', nameHe: 'IBM עברי', family: '"IBM Plex Sans Hebrew", sans-serif', google: true, category: 'sans' },
];

// ─── Interfaces ───────────────────────────────────────────────
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

export interface ThemeTypography {
  fontId: string;
  headingFontId: string;
  baseFontSize: number;       // px: 12-24
  headingScale: number;       // multiplier: 1.0-2.0
  lineHeight: number;         // unitless: 1.0-2.5
  letterSpacing: number;      // em: -0.05 to 0.15
  fontWeight: number;         // 300-600
  headingWeight: number;      // 400-900
}

export interface ThemeLayout {
  borderRadius: number;       // rem: 0-2
  borderWidth: number;        // px: 0-4
  shadowIntensity: number;    // 0-100
  cardPadding: number;        // rem: 0.25-3
  spacing: number;            // gap multiplier: 0.5-2
  contentMaxWidth: number;    // px: 640-1920
}

export interface ThemeEffects {
  glassEffect: boolean;
  animationSpeed: number;     // multiplier: 0-2 (0=off)
  buttonStyle: 'rounded' | 'pill' | 'square';
}

export interface AppTheme {
  id: string;
  name: string;
  nameHe: string;
  colors: ThemeColors;
  typography: ThemeTypography;
  layout: ThemeLayout;
  effects: ThemeEffects;
  isCustom?: boolean;
}

// ─── Defaults ─────────────────────────────────────────────────
export const DEFAULT_TYPOGRAPHY: ThemeTypography = {
  fontId: 'system',
  headingFontId: 'system',
  baseFontSize: 16,
  headingScale: 1.4,
  lineHeight: 1.6,
  letterSpacing: 0,
  fontWeight: 400,
  headingWeight: 700,
};

export const DEFAULT_LAYOUT: ThemeLayout = {
  borderRadius: 0.75,
  borderWidth: 1,
  shadowIntensity: 30,
  cardPadding: 1.5,
  spacing: 1,
  contentMaxWidth: 1200,
};

export const DEFAULT_EFFECTS: ThemeEffects = {
  glassEffect: false,
  animationSpeed: 1,
  buttonStyle: 'rounded',
};

// ─── Built-in Themes ──────────────────────────────────────────
export const BUILT_IN_THEMES: AppTheme[] = [
  {
    id: 'default',
    name: 'Default',
    nameHe: 'ברירת מחדל',
    typography: { ...DEFAULT_TYPOGRAPHY },
    layout: { ...DEFAULT_LAYOUT },
    effects: { ...DEFAULT_EFFECTS },
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
    typography: { ...DEFAULT_TYPOGRAPHY, fontId: 'frank-ruhl', headingFontId: 'suez-one', headingScale: 1.5, lineHeight: 1.7, headingWeight: 700 },
    layout: { ...DEFAULT_LAYOUT, borderRadius: 1, borderWidth: 2, shadowIntensity: 40, cardPadding: 1.75 },
    effects: { ...DEFAULT_EFFECTS, buttonStyle: 'rounded' },
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
    typography: { ...DEFAULT_TYPOGRAPHY, fontId: 'rubik', headingFontId: 'rubik', baseFontSize: 15, letterSpacing: 0.01, headingWeight: 600 },
    layout: { ...DEFAULT_LAYOUT, borderRadius: 0.5, borderWidth: 1, shadowIntensity: 60, cardPadding: 1.25, spacing: 0.9 },
    effects: { ...DEFAULT_EFFECTS, glassEffect: true, buttonStyle: 'rounded' },
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
    typography: { ...DEFAULT_TYPOGRAPHY, fontId: 'assistant', headingFontId: 'assistant', lineHeight: 1.75, headingScale: 1.45 },
    layout: { ...DEFAULT_LAYOUT, borderRadius: 1, shadowIntensity: 20, spacing: 1.1 },
    effects: { ...DEFAULT_EFFECTS },
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
    typography: { ...DEFAULT_TYPOGRAPHY, fontId: 'heebo', headingFontId: 'heebo', baseFontSize: 16, headingWeight: 800 },
    layout: { ...DEFAULT_LAYOUT, borderRadius: 1.25, shadowIntensity: 35 },
    effects: { ...DEFAULT_EFFECTS, buttonStyle: 'pill' },
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
    typography: { ...DEFAULT_TYPOGRAPHY, fontId: 'varela-round', headingFontId: 'varela-round', baseFontSize: 15, spacing: 0.85, headingWeight: 700 },
    layout: { ...DEFAULT_LAYOUT, borderRadius: 0.6, borderWidth: 1, shadowIntensity: 50, cardPadding: 1.25, spacing: 0.9 },
    effects: { ...DEFAULT_EFFECTS, glassEffect: true, animationSpeed: 1.2 },
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

// ─── CSS Variable Mapping ─────────────────────────────────────
const CSS_COLOR_MAP: Record<keyof ThemeColors, string> = {
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

// ─── Font Loading ─────────────────────────────────────────────
const loadedFonts = new Set<string>();

export function loadGoogleFont(fontId: string) {
  const font = FONT_OPTIONS.find(f => f.id === fontId);
  if (!font || !font.google || loadedFonts.has(fontId)) return;
  loadedFonts.add(fontId);
  const fontName = font.name.replace(/\s+/g, '+');
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${fontName}:wght@300;400;500;600;700;800;900&display=swap`;
  document.head.appendChild(link);
}

function getFontFamily(fontId: string): string {
  const font = FONT_OPTIONS.find(f => f.id === fontId);
  return font?.family || 'system-ui, -apple-system, sans-serif';
}

// ─── Shadow Generation ────────────────────────────────────────
function getShadow(intensity: number): { sm: string; md: string; lg: string } {
  if (intensity === 0) return { sm: 'none', md: 'none', lg: 'none' };
  const o = Math.round(intensity * 0.25) / 100;
  return {
    sm: `0 1px 2px rgba(0,0,0,${o}), 0 1px 3px rgba(0,0,0,${o * 0.6})`,
    md: `0 4px 6px rgba(0,0,0,${o}), 0 2px 4px rgba(0,0,0,${o * 0.6})`,
    lg: `0 10px 15px rgba(0,0,0,${o * 1.5}), 0 4px 6px rgba(0,0,0,${o})`,
  };
}

// ─── Button Radius ────────────────────────────────────────────
function getButtonRadius(style: ThemeEffects['buttonStyle'], baseRadius: number): string {
  switch (style) {
    case 'pill': return '9999px';
    case 'square': return '0px';
    default: return `${baseRadius}rem`;
  }
}

// ─── Apply Full Theme ─────────────────────────────────────────
function applyThemeToDOM(theme: AppTheme) {
  const root = document.documentElement;
  const { colors, typography, layout, effects } = theme;

  // Colors
  for (const [key, cssVar] of Object.entries(CSS_COLOR_MAP)) {
    const value = colors[key as keyof ThemeColors];
    if (cssVar === '--icon-color') {
      root.style.setProperty(cssVar, value || 'inherit');
    } else {
      root.style.setProperty(cssVar, value);
    }
  }

  // Typography
  loadGoogleFont(typography.fontId);
  loadGoogleFont(typography.headingFontId);
  root.style.setProperty('--font-family', getFontFamily(typography.fontId));
  root.style.setProperty('--font-heading', getFontFamily(typography.headingFontId));
  root.style.setProperty('--font-size-base', `${typography.baseFontSize}px`);
  root.style.setProperty('--heading-scale', `${typography.headingScale}`);
  root.style.setProperty('--line-height', `${typography.lineHeight}`);
  root.style.setProperty('--letter-spacing', `${typography.letterSpacing}em`);
  root.style.setProperty('--font-weight', `${typography.fontWeight}`);
  root.style.setProperty('--heading-weight', `${typography.headingWeight}`);

  // Layout
  root.style.setProperty('--radius', `${layout.borderRadius}rem`);
  root.style.setProperty('--border-width', `${layout.borderWidth}px`);
  root.style.setProperty('--card-padding', `${layout.cardPadding}rem`);
  root.style.setProperty('--spacing-multiplier', `${layout.spacing}`);
  root.style.setProperty('--content-max-width', `${layout.contentMaxWidth}px`);
  const shadows = getShadow(layout.shadowIntensity);
  root.style.setProperty('--shadow-sm', shadows.sm);
  root.style.setProperty('--shadow-md', shadows.md);
  root.style.setProperty('--shadow-lg', shadows.lg);

  // Effects
  root.style.setProperty('--animation-speed', `${effects.animationSpeed}`);
  root.style.setProperty('--btn-radius', getButtonRadius(effects.buttonStyle, layout.borderRadius));

  // Glass effect class
  if (effects.glassEffect) {
    root.classList.add('theme-glass');
  } else {
    root.classList.remove('theme-glass');
  }
}

// ─── Migration helper for old custom themes ───────────────────
function migrateTheme(t: Partial<AppTheme> & { colors: ThemeColors; id: string; name: string; nameHe: string }): AppTheme {
  return {
    ...t,
    typography: t.typography || { ...DEFAULT_TYPOGRAPHY },
    layout: t.layout || { ...DEFAULT_LAYOUT },
    effects: t.effects || { ...DEFAULT_EFFECTS },
    isCustom: t.isCustom,
  };
}

// ─── Hook ─────────────────────────────────────────────────────
export function useTheme() {
  const [activeThemeId, setActiveThemeId] = useState<string>('default');
  const [customThemes, setCustomThemes] = useState<AppTheme[]>([]);

  useEffect(() => {
    const savedId = localStorage.getItem('app_theme_id') || 'default';
    const savedCustom = localStorage.getItem('app_custom_themes');
    const customs: AppTheme[] = savedCustom
      ? (JSON.parse(savedCustom) as Array<Partial<AppTheme> & { colors: ThemeColors; id: string; name: string; nameHe: string }>).map(migrateTheme)
      : [];
    setCustomThemes(customs);
    setActiveThemeId(savedId);

    const allThemes = [...BUILT_IN_THEMES, ...customs];
    const theme = allThemes.find(t => t.id === savedId) || BUILT_IN_THEMES[0];
    applyThemeToDOM(theme);
  }, []);

  const allThemes = [...BUILT_IN_THEMES, ...customThemes];

  const setTheme = useCallback((themeId: string) => {
    const all = [...BUILT_IN_THEMES, ...customThemes];
    const theme = all.find(t => t.id === themeId);
    if (!theme) return;
    setActiveThemeId(themeId);
    localStorage.setItem('app_theme_id', themeId);
    applyThemeToDOM(theme);
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

  const exportTheme = useCallback((themeId: string): string | null => {
    const theme = [...BUILT_IN_THEMES, ...customThemes].find(t => t.id === themeId);
    if (!theme) return null;
    return JSON.stringify(theme, null, 2);
  }, [customThemes]);

  const importTheme = useCallback((json: string): AppTheme | null => {
    try {
      const parsed = JSON.parse(json);
      if (!parsed.colors || !parsed.nameHe) return null;
      const theme = migrateTheme({ ...parsed, id: `import-${Date.now()}`, isCustom: true });
      return theme;
    } catch {
      return null;
    }
  }, []);

  return {
    activeThemeId,
    allThemes,
    customThemes,
    setTheme,
    saveCustomTheme,
    deleteCustomTheme,
    exportTheme,
    importTheme,
  };
}
