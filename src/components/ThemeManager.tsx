import { useState } from "react";
import { useTheme, BUILT_IN_THEMES, type AppTheme, type ThemeColors } from "@/hooks/useTheme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Check, Plus, Pencil, Trash2, Palette } from "lucide-react";

const DEFAULT_COLORS: ThemeColors = { ...BUILT_IN_THEMES[0].colors };

// Color groups for the editor
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
  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;
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

function ThemePreview({ theme, isActive, onClick }: { theme: AppTheme; isActive: boolean; onClick: () => void }) {
  const bg = `hsl(${theme.colors.background})`;
  const fg = `hsl(${theme.colors.foreground})`;
  const primary = `hsl(${theme.colors.primary})`;
  const border = `hsl(${theme.colors.border})`;
  const card = `hsl(${theme.colors.card})`;
  const accent = `hsl(${theme.colors.accent})`;

  return (
    <button
      onClick={onClick}
      className={`relative rounded-xl p-3 text-right transition-all ${isActive ? 'ring-2 ring-offset-2 ring-primary scale-[1.02]' : 'hover:scale-[1.01]'}`}
      style={{ backgroundColor: bg, border: `2px solid ${border}` }}
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
      </div>
    </button>
  );
}

function ThemeEditor({ initial, onSave, onCancel }: { initial?: AppTheme; onSave: (theme: AppTheme) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial?.nameHe || '');
  const [colors, setColors] = useState<ThemeColors>(initial?.colors || { ...DEFAULT_COLORS });

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
    if (val.startsWith('hsl(')) {
      return hslToHex(val.replace('hsl(', '').replace(')', ''));
    }
    return hslToHex(val);
  };

  const handleSave = () => {
    if (!name.trim()) {
      toast.error('יש להזין שם לערכת הנושא');
      return;
    }
    const id = initial?.id || `custom-${Date.now()}`;
    onSave({ id, name: name.trim(), nameHe: name.trim(), colors, isCustom: true });
  };

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto" dir="rtl">
      <div className="space-y-2">
        <Label>שם ערכת הנושא</Label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="שם הערכה..." />
      </div>

      {/* Live preview */}
      <div className="rounded-xl p-4 space-y-2" style={{ backgroundColor: `hsl(${colors.background})`, border: `2px solid hsl(${colors.border})` }}>
        <div className="text-sm font-bold" style={{ color: `hsl(${colors.foreground})` }}>{name || 'תצוגה מקדימה'}</div>
        <div className="rounded-lg p-3 space-y-1.5" style={{ backgroundColor: `hsl(${colors.card})`, border: `1px solid hsl(${colors.border})` }}>
          <div className="text-xs" style={{ color: `hsl(${colors.cardForeground})` }}>כרטיס לדוגמה</div>
          <div className="flex gap-2">
            <div className="text-xs px-2 py-1 rounded" style={{ backgroundColor: `hsl(${colors.primary})`, color: `hsl(${colors.primaryForeground})` }}>ראשי</div>
            <div className="text-xs px-2 py-1 rounded" style={{ backgroundColor: `hsl(${colors.accent})`, color: `hsl(${colors.accentForeground})` }}>הדגשה</div>
            <div className="text-xs px-2 py-1 rounded" style={{ backgroundColor: `hsl(${colors.secondary})`, color: `hsl(${colors.secondaryForeground})` }}>משני</div>
          </div>
          {colors.iconColor && (
            <div className="flex gap-1 items-center">
              <Palette className="h-3 w-3" style={{ color: colors.iconColor }} />
              <span className="text-xs" style={{ color: `hsl(${colors.mutedForeground})` }}>אייקונים</span>
            </div>
          )}
        </div>
      </div>

      {COLOR_GROUPS.map(group => (
        <div key={group.label} className="space-y-2">
          <h4 className="text-sm font-semibold text-muted-foreground">{group.label}</h4>
          <div className="grid grid-cols-2 gap-2">
            {group.keys.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <input
                  type="color"
                  value={getHex(key) || '#daa520'}
                  onChange={e => updateColor(key, e.target.value)}
                  className="w-8 h-8 rounded border cursor-pointer"
                />
                <span className="text-xs">{label}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="flex gap-2 pt-2">
        <Button onClick={handleSave} className="flex-1">שמור</Button>
        <Button variant="outline" onClick={onCancel}>ביטול</Button>
      </div>
    </div>
  );
}

export function ThemeManager() {
  const { activeThemeId, allThemes, setTheme, saveCustomTheme, deleteCustomTheme } = useTheme();
  const [editingTheme, setEditingTheme] = useState<AppTheme | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const handleSave = (theme: AppTheme) => {
    saveCustomTheme(theme);
    setTheme(theme.id);
    setEditingTheme(null);
    setIsCreating(false);
    toast.success(`ערכת הנושא "${theme.nameHe}" נשמרה!`);
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Palette className="h-5 w-5" />
            ערכות נושא
          </h3>
          <p className="text-sm text-muted-foreground">בחר ערכת נושא או צור אחת משלך</p>
        </div>
        <Dialog open={isCreating} onOpenChange={setIsCreating}>
          <DialogTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Plus className="h-4 w-4" />
              ערכה חדשה
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg" dir="rtl">
            <DialogHeader>
              <DialogTitle>יצירת ערכת נושא חדשה</DialogTitle>
            </DialogHeader>
            <ThemeEditor onSave={handleSave} onCancel={() => setIsCreating(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Built-in themes */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-muted-foreground">ערכות מובנות</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {BUILT_IN_THEMES.map(theme => (
            <ThemePreview
              key={theme.id}
              theme={theme}
              isActive={activeThemeId === theme.id}
              onClick={() => setTheme(theme.id)}
            />
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
                <div className="absolute bottom-2 left-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Dialog open={editingTheme?.id === theme.id} onOpenChange={open => !open && setEditingTheme(null)}>
                    <DialogTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={e => { e.stopPropagation(); setEditingTheme(theme); }}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg" dir="rtl">
                      <DialogHeader>
                        <DialogTitle>עריכת ערכת נושא</DialogTitle>
                      </DialogHeader>
                      <ThemeEditor initial={theme} onSave={handleSave} onCancel={() => setEditingTheme(null)} />
                    </DialogContent>
                  </Dialog>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-destructive"
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
