import { useState, useRef } from "react";
import {
  useTheme, BUILT_IN_THEMES, FONT_OPTIONS, DEFAULT_TYPOGRAPHY, DEFAULT_LAYOUT, DEFAULT_EFFECTS, loadGoogleFont,
  type AppTheme, type ThemeColors, type ThemeTypography, type ThemeLayout, type ThemeEffects,
} from "@/hooks/useTheme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Check, Plus, Pencil, Trash2, Palette, Type, LayoutGrid, Sparkles, Copy,
  Download, Upload, RotateCcw,
} from "lucide-react";

const DEFAULT_COLORS: ThemeColors = { ...BUILT_IN_THEMES[0].colors };

// ─── Color Groups ─────────────────────────────────────────────
const COLOR_GROUPS: { label: string; keys: { key: keyof ThemeColors; label: string }[] }[] = [
  {
    label: 'צבעים ראשיים',
    keys: [
      { key: 'background', label: 'רקע' },
      { key: 'foreground', label: 'טקסט' },
      { key: 'primary', label: 'צבע ראשי' },
      { key: 'primaryForeground', label: 'טקסט ראשי' },
      { key: 'accent', label: 'הדגשה' },
      { key: 'accentForeground', label: 'טקסט הדגשה' },
    ],
  },
  {
    label: 'כרטיסים ומסגרות',
    keys: [
      { key: 'card', label: 'כרטיס' },
      { key: 'cardForeground', label: 'טקסט כרטיס' },
      { key: 'border', label: 'מסגרת' },
      { key: 'input', label: 'שדה קלט' },
      { key: 'ring', label: 'טבעת פוקוס' },
    ],
  },
  {
    label: 'צבעים משניים',
    keys: [
      { key: 'secondary', label: 'משני' },
      { key: 'secondaryForeground', label: 'טקסט משני' },
      { key: 'muted', label: 'מעומעם' },
      { key: 'mutedForeground', label: 'טקסט מעומעם' },
    ],
  },
  {
    label: 'סרגל צד',
    keys: [
      { key: 'sidebarBackground', label: 'רקע' },
      { key: 'sidebarForeground', label: 'טקסט' },
      { key: 'sidebarPrimary', label: 'ראשי' },
      { key: 'sidebarBorder', label: 'מסגרת' },
    ],
  },
  {
    label: 'מיוחד',
    keys: [
      { key: 'iconColor', label: 'צבע אייקונים' },
      { key: 'destructive', label: 'שגיאה' },
    ],
  },
];

// ─── Color Conversion ─────────────────────────────────────────
function hslToHex(hsl: string): string {
  if (!hsl || hsl === 'inherit') return '#daa520';
  const parts = hsl.trim().split(/\s+/);
  if (parts.length < 3) return '#888888';
  const h = parseFloat(parts[0]);
  const s = parseFloat(parts[1]) / 100;
  const l = parseFloat(parts[2]) / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function hexToHsl(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '0 0% 0%';
  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

// ─── SliderRow ────────────────────────────────────────────────
function SliderRow({ label, value, min, max, step, onChange, unit = '', displayValue }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; unit?: string; displayValue?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-mono tabular-nums">{displayValue ?? `${value}${unit}`}</span>
      </div>
      <Slider
        min={min} max={max} step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
      />
    </div>
  );
}

// ─── Theme Preview Card ───────────────────────────────────────
function ThemePreview({ theme, isActive, onClick }: { theme: AppTheme; isActive: boolean; onClick: () => void }) {
  const bg = `hsl(${theme.colors.background})`;
  const fg = `hsl(${theme.colors.foreground})`;
  const primary = `hsl(${theme.colors.primary})`;
  const border = `hsl(${theme.colors.border})`;
  const card = `hsl(${theme.colors.card})`;
  const accent = `hsl(${theme.colors.accent})`;
  const fontId = theme.typography?.fontId || 'system';
  const font = FONT_OPTIONS.find(f => f.id === fontId);
  if (font?.google) loadGoogleFont(fontId);

  return (
    <button
      onClick={onClick}
      className={`relative rounded-xl p-3 text-right transition-all ${isActive ? 'ring-2 ring-offset-2 ring-primary scale-[1.02]' : 'hover:scale-[1.01]'}`}
      style={{ backgroundColor: bg, border: `2px solid ${border}`, fontFamily: font?.family }}
    >
      {isActive && (
        <div className="absolute top-2 left-2 rounded-full p-1" style={{ backgroundColor: primary }}>
          <Check className="h-3 w-3 text-white" />
        </div>
      )}
      <div className="space-y-2">
        <div className="text-sm font-bold" style={{ color: fg }}>{theme.nameHe}</div>
        <div className="flex gap-1">
          <div className="h-4 w-4 rounded-full border" style={{ backgroundColor: primary, borderColor: border }} />
          <div className="h-4 w-4 rounded-full border" style={{ backgroundColor: accent, borderColor: border }} />
          <div className="h-4 w-4 rounded-full border" style={{ backgroundColor: card, borderColor: border }} />
          <div className="h-4 w-4 rounded-full border" style={{ backgroundColor: fg, borderColor: border }} />
        </div>
        <div className="flex gap-1">
          <div className="h-2 rounded-full" style={{ backgroundColor: primary, width: '60%' }} />
          <div className="h-2 rounded-full" style={{ backgroundColor: accent, width: '40%' }} />
        </div>
        {font && fontId !== 'system' && (
          <div className="text-[9px] truncate" style={{ color: `hsl(${theme.colors.mutedForeground})` }}>{font.nameHe}</div>
        )}
      </div>
    </button>
  );
}

// ─── Theme Editor (full) ──────────────────────────────────────
function ThemeEditor({ initial, onSave, onCancel }: { initial?: AppTheme; onSave: (theme: AppTheme) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial?.nameHe || '');
  const [colors, setColors] = useState<ThemeColors>(initial?.colors || { ...DEFAULT_COLORS });
  const [typography, setTypography] = useState<ThemeTypography>(initial?.typography || { ...DEFAULT_TYPOGRAPHY });
  const [layout, setLayout] = useState<ThemeLayout>(initial?.layout || { ...DEFAULT_LAYOUT });
  const [effects, setEffects] = useState<ThemeEffects>(initial?.effects || { ...DEFAULT_EFFECTS });

  const updateColor = (key: keyof ThemeColors, hex: string) => {
    if (key === 'iconColor') {
      setColors(prev => ({ ...prev, [key]: hex ? `hsl(${hexToHsl(hex)})` : '' }));
    } else {
      setColors(prev => ({ ...prev, [key]: hexToHsl(hex) }));
    }
  };

  const getHex = (key: keyof ThemeColors) => {
    const val = colors[key];
    if (!val || val === 'inherit') return '';
    if (val.startsWith('hsl(')) return hslToHex(val.replace('hsl(', '').replace(')', ''));
    return hslToHex(val);
  };

  const handleSave = () => {
    if (!name.trim()) { toast.error('יש להזין שם לערכת הנושא'); return; }
    const id = initial?.id || `custom-${Date.now()}`;
    onSave({ id, name: name.trim(), nameHe: name.trim(), colors, typography, layout, effects, isCustom: true });
  };

  const bodyFont = FONT_OPTIONS.find(f => f.id === typography.fontId);
  const headFont = FONT_OPTIONS.find(f => f.id === typography.headingFontId);

  // ensure fonts are loaded for preview
  if (bodyFont?.google) loadGoogleFont(typography.fontId);
  if (headFont?.google) loadGoogleFont(typography.headingFontId);

  const WEIGHT_OPTIONS = [
    { value: 300, label: 'דק (300)' },
    { value: 400, label: 'רגיל (400)' },
    { value: 500, label: 'בינוני (500)' },
    { value: 600, label: 'חצי שמן (600)' },
    { value: 700, label: 'שמן (700)' },
    { value: 800, label: 'שמן מאוד (800)' },
    { value: 900, label: 'הכי שמן (900)' },
  ];

  return (
    <div className="space-y-3 max-h-[75vh] overflow-y-auto px-1" dir="rtl">
      {/* Name */}
      <div className="space-y-1.5">
        <Label className="text-sm font-semibold">שם ערכת הנושא</Label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="שם הערכה..." />
      </div>

      {/* Live Preview */}
      <div
        className="rounded-xl p-4 space-y-2 transition-all"
        style={{
          backgroundColor: `hsl(${colors.background})`,
          border: `${layout.borderWidth}px solid hsl(${colors.border})`,
          borderRadius: `${layout.borderRadius}rem`,
          fontFamily: bodyFont?.family,
          fontSize: `${typography.baseFontSize}px`,
          lineHeight: typography.lineHeight,
          letterSpacing: `${typography.letterSpacing}em`,
          fontWeight: typography.fontWeight,
        }}
      >
        <div style={{ color: `hsl(${colors.foreground})`, fontFamily: headFont?.family, fontWeight: typography.headingWeight, fontSize: `${typography.baseFontSize * typography.headingScale}px` }}>
          {name || 'תצוגה מקדימה'}
        </div>
        <div
          className="space-y-1.5"
          style={{
            backgroundColor: `hsl(${colors.card})`,
            border: `${layout.borderWidth}px solid hsl(${colors.border})`,
            borderRadius: `${Math.max(0, layout.borderRadius - 0.25)}rem`,
            padding: `${layout.cardPadding}rem`,
          }}
        >
          <div className="text-xs" style={{ color: `hsl(${colors.cardForeground})` }}>כרטיס לדוגמה עם טקסט</div>
          <div className="flex gap-2 flex-wrap">
            <div className="text-xs px-2 py-1" style={{
              backgroundColor: `hsl(${colors.primary})`, color: `hsl(${colors.primaryForeground})`,
              borderRadius: effects.buttonStyle === 'pill' ? '9999px' : effects.buttonStyle === 'square' ? '0' : `${layout.borderRadius}rem`,
            }}>ראשי</div>
            <div className="text-xs px-2 py-1" style={{
              backgroundColor: `hsl(${colors.accent})`, color: `hsl(${colors.accentForeground})`,
              borderRadius: effects.buttonStyle === 'pill' ? '9999px' : effects.buttonStyle === 'square' ? '0' : `${layout.borderRadius}rem`,
            }}>הדגשה</div>
            <div className="text-xs px-2 py-1" style={{
              backgroundColor: `hsl(${colors.secondary})`, color: `hsl(${colors.secondaryForeground})`,
              borderRadius: effects.buttonStyle === 'pill' ? '9999px' : effects.buttonStyle === 'square' ? '0' : `${layout.borderRadius}rem`,
            }}>משני</div>
          </div>
          {colors.iconColor && (
            <div className="flex gap-1 items-center">
              <Palette className="h-3 w-3 no-theme-icon" style={{ color: colors.iconColor }} />
              <span className="text-xs" style={{ color: `hsl(${colors.mutedForeground})` }}>אייקונים</span>
            </div>
          )}
        </div>
      </div>

      {/* Accordion Sections */}
      <Accordion type="multiple" defaultValue={['typography']} className="space-y-1">

        {/* Typography Section */}
        <AccordionItem value="typography" className="border rounded-lg px-3">
          <AccordionTrigger className="text-sm font-semibold gap-2 py-2.5">
            <span className="flex items-center gap-2"><Type className="h-4 w-4 no-theme-icon" /> טיפוגרפיה</span>
          </AccordionTrigger>
          <AccordionContent className="space-y-3 pb-3">
            {/* Body Font */}
            <div className="space-y-1">
              <Label className="text-xs">גופן גוף הטקסט</Label>
              <Select value={typography.fontId} onValueChange={v => setTypography(p => ({ ...p, fontId: v }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FONT_OPTIONS.map(f => {
                    if (f.google) loadGoogleFont(f.id);
                    return (
                      <SelectItem key={f.id} value={f.id}>
                        <span style={{ fontFamily: f.family }}>{f.nameHe}</span>
                        <span className="text-muted-foreground text-xs mr-2">({f.name})</span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Heading Font */}
            <div className="space-y-1">
              <Label className="text-xs">גופן כותרות</Label>
              <Select value={typography.headingFontId} onValueChange={v => setTypography(p => ({ ...p, headingFontId: v }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FONT_OPTIONS.map(f => {
                    if (f.google) loadGoogleFont(f.id);
                    return (
                      <SelectItem key={f.id} value={f.id}>
                        <span style={{ fontFamily: f.family }}>{f.nameHe}</span>
                        <span className="text-muted-foreground text-xs mr-2">({f.name})</span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Font Size */}
            <SliderRow label="גודל גופן" value={typography.baseFontSize} min={12} max={24} step={1} onChange={v => setTypography(p => ({ ...p, baseFontSize: v }))} unit="px" />

            {/* Heading Scale */}
            <SliderRow label="קנה מידה כותרות" value={typography.headingScale} min={1.0} max={2.0} step={0.05} onChange={v => setTypography(p => ({ ...p, headingScale: v }))} displayValue={`×${typography.headingScale.toFixed(2)}`} />

            {/* Line Height */}
            <SliderRow label="גובה שורה" value={typography.lineHeight} min={1.0} max={2.5} step={0.05} onChange={v => setTypography(p => ({ ...p, lineHeight: v }))} displayValue={typography.lineHeight.toFixed(2)} />

            {/* Letter Spacing */}
            <SliderRow label="מרווח אותיות" value={typography.letterSpacing} min={-0.05} max={0.15} step={0.005} onChange={v => setTypography(p => ({ ...p, letterSpacing: v }))} displayValue={`${typography.letterSpacing.toFixed(3)}em`} />

            {/* Font Weight */}
            <div className="space-y-1">
              <Label className="text-xs">משקל גופן גוף</Label>
              <Select value={String(typography.fontWeight)} onValueChange={v => setTypography(p => ({ ...p, fontWeight: Number(v) }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WEIGHT_OPTIONS.filter(w => w.value <= 600).map(w => (
                    <SelectItem key={w.value} value={String(w.value)}>{w.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Heading Weight */}
            <div className="space-y-1">
              <Label className="text-xs">משקל כותרות</Label>
              <Select value={String(typography.headingWeight)} onValueChange={v => setTypography(p => ({ ...p, headingWeight: Number(v) }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WEIGHT_OPTIONS.filter(w => w.value >= 400).map(w => (
                    <SelectItem key={w.value} value={String(w.value)}>{w.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setTypography({ ...DEFAULT_TYPOGRAPHY })}>
              <RotateCcw className="h-3 w-3 ml-1 no-theme-icon" /> איפוס טיפוגרפיה
            </Button>
          </AccordionContent>
        </AccordionItem>

        {/* Colors Section */}
        <AccordionItem value="colors" className="border rounded-lg px-3">
          <AccordionTrigger className="text-sm font-semibold gap-2 py-2.5">
            <span className="flex items-center gap-2"><Palette className="h-4 w-4 no-theme-icon" /> צבעים</span>
          </AccordionTrigger>
          <AccordionContent className="space-y-3 pb-3">
            {COLOR_GROUPS.map(group => (
              <div key={group.label} className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground">{group.label}</h4>
                <div className="grid grid-cols-2 gap-2">
                  {group.keys.map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-2">
                      <input
                        type="color"
                        value={getHex(key) || '#daa520'}
                        onChange={e => updateColor(key, e.target.value)}
                        className="w-7 h-7 rounded border cursor-pointer shrink-0"
                      />
                      <span className="text-xs">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setColors({ ...DEFAULT_COLORS })}>
              <RotateCcw className="h-3 w-3 ml-1 no-theme-icon" /> איפוס צבעים
            </Button>
          </AccordionContent>
        </AccordionItem>

        {/* Layout Section */}
        <AccordionItem value="layout" className="border rounded-lg px-3">
          <AccordionTrigger className="text-sm font-semibold gap-2 py-2.5">
            <span className="flex items-center gap-2"><LayoutGrid className="h-4 w-4 no-theme-icon" /> עיצוב ומרווחים</span>
          </AccordionTrigger>
          <AccordionContent className="space-y-3 pb-3">
            <SliderRow label="עיגול פינות" value={layout.borderRadius} min={0} max={2} step={0.05} onChange={v => setLayout(p => ({ ...p, borderRadius: v }))} unit="rem" />
            <SliderRow label="עובי מסגרת" value={layout.borderWidth} min={0} max={4} step={0.5} onChange={v => setLayout(p => ({ ...p, borderWidth: v }))} unit="px" />
            <SliderRow label="עוצמת צל" value={layout.shadowIntensity} min={0} max={100} step={5} onChange={v => setLayout(p => ({ ...p, shadowIntensity: v }))} unit="%" />
            <SliderRow label="ריפוד כרטיסים" value={layout.cardPadding} min={0.25} max={3} step={0.25} onChange={v => setLayout(p => ({ ...p, cardPadding: v }))} unit="rem" />
            <SliderRow label="מכפיל מרווחים" value={layout.spacing} min={0.5} max={2} step={0.05} onChange={v => setLayout(p => ({ ...p, spacing: v }))} displayValue={`×${layout.spacing.toFixed(2)}`} />
            <SliderRow label="רוחב תוכן מקסימלי" value={layout.contentMaxWidth} min={640} max={1920} step={40} onChange={v => setLayout(p => ({ ...p, contentMaxWidth: v }))} unit="px" />
            <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setLayout({ ...DEFAULT_LAYOUT })}>
              <RotateCcw className="h-3 w-3 ml-1 no-theme-icon" /> איפוס עיצוב
            </Button>
          </AccordionContent>
        </AccordionItem>

        {/* Effects Section */}
        <AccordionItem value="effects" className="border rounded-lg px-3">
          <AccordionTrigger className="text-sm font-semibold gap-2 py-2.5">
            <span className="flex items-center gap-2"><Sparkles className="h-4 w-4 no-theme-icon" /> אפקטים</span>
          </AccordionTrigger>
          <AccordionContent className="space-y-3 pb-3">
            {/* Glass Effect */}
            <div className="flex items-center justify-between">
              <Label className="text-xs">אפקט זכוכית (Glass)</Label>
              <Switch checked={effects.glassEffect} onCheckedChange={v => setEffects(p => ({ ...p, glassEffect: v }))} />
            </div>

            {/* Animation Speed */}
            <SliderRow label="מהירות אנימציות" value={effects.animationSpeed} min={0} max={2} step={0.1} onChange={v => setEffects(p => ({ ...p, animationSpeed: v }))} displayValue={effects.animationSpeed === 0 ? 'כבוי' : `×${effects.animationSpeed.toFixed(1)}`} />

            {/* Button Style */}
            <div className="space-y-1">
              <Label className="text-xs">סגנון כפתורים</Label>
              <div className="flex gap-2">
                {([
                  { value: 'rounded' as const, label: 'מעוגל', radius: '0.5rem' },
                  { value: 'pill' as const, label: 'גלולה', radius: '9999px' },
                  { value: 'square' as const, label: 'מרובע', radius: '0' },
                ] as const).map(opt => (
                  <button
                    key={opt.value}
                    className={`flex-1 text-xs py-1.5 px-2 border transition-all ${effects.buttonStyle === opt.value ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}
                    style={{ borderRadius: opt.radius }}
                    onClick={() => setEffects(p => ({ ...p, buttonStyle: opt.value }))}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setEffects({ ...DEFAULT_EFFECTS })}>
              <RotateCcw className="h-3 w-3 ml-1 no-theme-icon" /> איפוס אפקטים
            </Button>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Save / Cancel */}
      <div className="flex gap-2 pt-2 sticky bottom-0 bg-background pb-1">
        <Button onClick={handleSave} className="flex-1">שמור ערכת נושא</Button>
        <Button variant="outline" onClick={onCancel}>ביטול</Button>
      </div>
    </div>
  );
}

// ─── Main ThemeManager Component ──────────────────────────────
export function ThemeManager() {
  const { activeThemeId, allThemes, setTheme, saveCustomTheme, deleteCustomTheme, exportTheme, importTheme } = useTheme();
  const [editingTheme, setEditingTheme] = useState<AppTheme | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const handleSave = (theme: AppTheme) => {
    saveCustomTheme(theme);
    setTheme(theme.id);
    setEditingTheme(null);
    setIsCreating(false);
    toast.success(`ערכת הנושא "${theme.nameHe}" נשמרה!`);
  };

  const handleExport = (themeId: string) => {
    const json = exportTheme(themeId);
    if (!json) return;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const theme = allThemes.find(t => t.id === themeId);
    a.download = `theme-${theme?.name || themeId}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('ערכת הנושא יוצאה בהצלחה');
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const theme = importTheme(text);
      if (!theme) {
        toast.error('קובץ ערכת נושא לא תקין');
        return;
      }
      saveCustomTheme(theme);
      setTheme(theme.id);
      toast.success(`ערכת הנושא "${theme.nameHe}" יובאה בהצלחה!`);
    };
    reader.readAsText(file);
    if (importRef.current) importRef.current.value = '';
  };

  const handleDuplicate = (theme: AppTheme) => {
    const dup: AppTheme = {
      ...JSON.parse(JSON.stringify(theme)),
      id: `custom-${Date.now()}`,
      nameHe: `${theme.nameHe} (עותק)`,
      name: `${theme.name} (copy)`,
      isCustom: true,
    };
    saveCustomTheme(dup);
    toast.success('ערכת הנושא שוכפלה');
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Palette className="h-5 w-5" />
            ערכות נושא
          </h3>
          <p className="text-sm text-muted-foreground">גופנים, צבעים, מרווחים ואפקטים — הכל בשליטתך</p>
        </div>
        <div className="flex gap-2">
          <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
          <Button variant="outline" size="sm" className="gap-1" onClick={() => importRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" /> ייבוא
          </Button>
          <Dialog open={isCreating} onOpenChange={setIsCreating}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1">
                <Plus className="h-3.5 w-3.5" /> ערכה חדשה
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh]" dir="rtl">
              <DialogHeader>
                <DialogTitle>יצירת ערכת נושא חדשה</DialogTitle>
              </DialogHeader>
              <ThemeEditor onSave={handleSave} onCancel={() => setIsCreating(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Built-in themes */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-muted-foreground">ערכות מובנות</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {BUILT_IN_THEMES.map(theme => (
            <div key={theme.id} className="relative group">
              <ThemePreview
                theme={theme}
                isActive={activeThemeId === theme.id}
                onClick={() => setTheme(theme.id)}
              />
              <div className="absolute bottom-1.5 left-1.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button size="icon" variant="ghost" className="h-6 w-6" title="שכפול" onClick={e => { e.stopPropagation(); handleDuplicate(theme); }}>
                  <Copy className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-6 w-6" title="ייצוא" onClick={e => { e.stopPropagation(); handleExport(theme.id); }}>
                  <Download className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Custom themes */}
      {allThemes.filter(t => t.isCustom).length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-muted-foreground">ערכות אישיות</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {allThemes.filter(t => t.isCustom).map(theme => (
              <div key={theme.id} className="relative group">
                <ThemePreview
                  theme={theme}
                  isActive={activeThemeId === theme.id}
                  onClick={() => setTheme(theme.id)}
                />
                <div className="absolute bottom-1.5 left-1.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Dialog open={editingTheme?.id === theme.id} onOpenChange={open => !open && setEditingTheme(null)}>
                    <DialogTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={e => { e.stopPropagation(); setEditingTheme(theme); }}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg max-h-[90vh]" dir="rtl">
                      <DialogHeader>
                        <DialogTitle>עריכת ערכת נושא</DialogTitle>
                      </DialogHeader>
                      <ThemeEditor initial={theme} onSave={handleSave} onCancel={() => setEditingTheme(null)} />
                    </DialogContent>
                  </Dialog>
                  <Button size="icon" variant="ghost" className="h-6 w-6" title="שכפול" onClick={e => { e.stopPropagation(); handleDuplicate(theme); }}>
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" title="ייצוא" onClick={e => { e.stopPropagation(); handleExport(theme.id); }}>
                    <Download className="h-3 w-3" />
                  </Button>
                  <Button
                    size="icon" variant="ghost" className="h-6 w-6 text-destructive"
                    onClick={e => { e.stopPropagation(); deleteCustomTheme(theme.id); toast.success('ערכת הנושא נמחקה'); }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
