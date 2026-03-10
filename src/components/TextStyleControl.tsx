import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Card } from "@/components/ui/card";
import { Type } from "lucide-react";

interface TextStyleControlProps {
  fontSize: number;
  fontFamily: string;
  textColor: string;
  lineHeight: number;
  onFontSizeChange: (size: number) => void;
  onFontFamilyChange: (family: string) => void;
  onTextColorChange: (color: string) => void;
  onLineHeightChange: (height: number) => void;
}

const FONT_FAMILIES = [
  { value: 'Assistant', label: 'Assistant' },
  { value: 'Rubik', label: 'Rubik' },
  { value: 'Heebo', label: 'Heebo' },
  { value: 'Frank Ruhl Libre', label: 'Frank Ruhl Libre' },
  { value: 'Arial', label: 'Arial' },
  { value: 'system-ui', label: 'מערכת' }
];

const TEXT_COLORS = [
  { value: 'hsl(var(--foreground))', label: 'ברירת מחדל' },
  { value: 'hsl(220 60% 8%)', label: 'כחול כהה' },
  { value: 'hsl(0 0% 0%)', label: 'שחור' },
  { value: 'hsl(220 40% 30%)', label: 'כחול אפור' },
  { value: 'hsl(0 0% 20%)', label: 'אפור כהה' }
];

export const TextStyleControl = ({
  fontSize,
  fontFamily,
  textColor,
  lineHeight,
  onFontSizeChange,
  onFontFamilyChange,
  onTextColorChange,
  onLineHeightChange
}: TextStyleControlProps) => {
  return (
    <Card className="p-4" dir="rtl">
      <div className="flex items-center gap-2 mb-4">
        <Type className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold">עיצוב טקסט</h3>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="text-sm">גופן</Label>
          <Select value={fontFamily} onValueChange={onFontFamilyChange}>
            <SelectTrigger dir="rtl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent dir="rtl">
              {FONT_FAMILIES.map(font => (
                <SelectItem key={font.value} value={font.value}>
                  {font.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-sm">גודל גופן: {fontSize}px</Label>
          <Slider
            value={[fontSize]}
            onValueChange={(v) => onFontSizeChange(v[0])}
            min={12}
            max={32}
            step={1}
            dir="ltr"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm">צבע טקסט</Label>
          <Select value={textColor} onValueChange={onTextColorChange}>
            <SelectTrigger dir="rtl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent dir="rtl">
              {TEXT_COLORS.map(color => (
                <SelectItem key={color.value} value={color.value}>
                  {color.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-sm">גובה שורה: {lineHeight.toFixed(1)}</Label>
          <Slider
            value={[lineHeight]}
            onValueChange={(v) => onLineHeightChange(v[0])}
            min={1.2}
            max={2.5}
            step={0.1}
            dir="ltr"
          />
        </div>
      </div>
    </Card>
  );
};
