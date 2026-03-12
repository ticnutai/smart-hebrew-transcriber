import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Cpu, Zap, Waves, Server } from "lucide-react";
import { toast } from "sonner";

interface EngineConfig {
  // CUDA server options
  cuda_compute_type: string;
  cuda_beam_size: number;
  cuda_fast_mode: boolean;
  cuda_vad_aggressive: boolean;
  cuda_no_condition_previous: boolean;
  cuda_hotwords: string;
  cuda_paragraph_threshold: number;
  cuda_server_url: string;
  // Cloud engine defaults
  default_engine: string;
  default_language: string;
  auto_navigate_editor: boolean;
  auto_save_cloud: boolean;
}

const DEFAULTS: EngineConfig = {
  cuda_compute_type: 'float16',
  cuda_beam_size: 5,
  cuda_fast_mode: false,
  cuda_vad_aggressive: false,
  cuda_no_condition_previous: false,
  cuda_hotwords: '',
  cuda_paragraph_threshold: 0,
  cuda_server_url: 'http://localhost:8765',
  default_engine: 'openai',
  default_language: 'he',
  auto_navigate_editor: true,
  auto_save_cloud: true,
};

const LS_KEY = 'engine_settings';

export const EngineSettings = () => {
  const [config, setConfig] = useState<EngineConfig>(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) return { ...DEFAULTS, ...JSON.parse(saved) };
    } catch { /* ignore */ }

    // Migrate from individual localStorage keys
    return {
      ...DEFAULTS,
      cuda_compute_type: localStorage.getItem('cuda_compute_type') || DEFAULTS.cuda_compute_type,
      cuda_beam_size: parseInt(localStorage.getItem('cuda_beam_size') || String(DEFAULTS.cuda_beam_size)),
      cuda_fast_mode: localStorage.getItem('cuda_fast_mode') === 'true',
      cuda_vad_aggressive: localStorage.getItem('cuda_vad_aggressive') === 'true',
      cuda_hotwords: localStorage.getItem('cuda_hotwords') || '',
      cuda_paragraph_threshold: parseFloat(localStorage.getItem('cuda_paragraph_threshold') || '0'),
      cuda_server_url: localStorage.getItem('cuda_server_url') || DEFAULTS.cuda_server_url,
      default_engine: localStorage.getItem('selected_engine') || DEFAULTS.default_engine,
      default_language: localStorage.getItem('source_language') || DEFAULTS.default_language,
    };
  });

  const update = (key: keyof EngineConfig, value: string | number | boolean) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    localStorage.setItem(LS_KEY, JSON.stringify(config));
    // Also write individual keys for backward compat with Index.tsx reads
    localStorage.setItem('cuda_compute_type', config.cuda_compute_type);
    localStorage.setItem('cuda_beam_size', String(config.cuda_beam_size));
    localStorage.setItem('cuda_fast_mode', String(config.cuda_fast_mode));
    localStorage.setItem('cuda_vad_aggressive', String(config.cuda_vad_aggressive));
    localStorage.setItem('cuda_hotwords', config.cuda_hotwords);
    localStorage.setItem('cuda_paragraph_threshold', String(config.cuda_paragraph_threshold));
    localStorage.setItem('cuda_server_url', config.cuda_server_url);
    localStorage.setItem('selected_engine', config.default_engine);
    localStorage.setItem('source_language', config.default_language);
    toast.success('הגדרות מנוע נשמרו');
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* CUDA Server Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-orange-500" />
            <CardTitle>שרת CUDA מקומי</CardTitle>
          </div>
          <CardDescription>הגדרות מתקדמות לשרת faster-whisper המקומי</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>כתובת שרת</Label>
            <Input
              value={config.cuda_server_url}
              onChange={e => update('cuda_server_url', e.target.value)}
              dir="ltr"
              placeholder="http://localhost:8765"
            />
          </div>

          <div className="space-y-2">
            <Label>סוג חישוב (Compute Type)</Label>
            <Select value={config.cuda_compute_type} onValueChange={v => update('cuda_compute_type', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="float16">float16 (ברירת מחדל)</SelectItem>
                <SelectItem value="int8_float16">int8_float16 (מהיר יותר)</SelectItem>
                <SelectItem value="int8">int8 (הכי מהיר, פחות דיוק)</SelectItem>
                <SelectItem value="float32">float32 (הכי מדויק, איטי)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Beam Size: {config.cuda_beam_size}</Label>
            <Slider
              value={[config.cuda_beam_size]}
              onValueChange={([v]) => update('cuda_beam_size', v)}
              min={1}
              max={10}
              step={1}
            />
            <p className="text-xs text-muted-foreground">ערך גבוה = דיוק גבוה + איטיות. 1 = הכי מהיר</p>
          </div>

          <div className="flex items-center justify-between">
            <Label>מצב מהיר (Fast Mode)</Label>
            <Switch checked={config.cuda_fast_mode} onCheckedChange={v => update('cuda_fast_mode', v)} />
          </div>
          <p className="text-xs text-muted-foreground">beam_size=1 + no_condition_on_previous</p>

          <div className="flex items-center justify-between">
            <Label>VAD אגרסיבי</Label>
            <Switch checked={config.cuda_vad_aggressive} onCheckedChange={v => update('cuda_vad_aggressive', v)} />
          </div>
          <p className="text-xs text-muted-foreground">סינון שקט חזק יותר — מומלץ להקלטות עם רעש רקע</p>

          <div className="flex items-center justify-between">
            <Label>ביטול התניה על משפט קודם</Label>
            <Switch checked={config.cuda_no_condition_previous} onCheckedChange={v => update('cuda_no_condition_previous', v)} />
          </div>

          <div className="space-y-2">
            <Label>מילות מפתח (Hotwords)</Label>
            <Input
              value={config.cuda_hotwords}
              onChange={e => update('cuda_hotwords', e.target.value)}
              placeholder="מילה1, מילה2, מילה3"
            />
            <p className="text-xs text-muted-foreground">מילים שחשוב לזהות נכון — מופרדות בפסיקים</p>
          </div>

          <div className="space-y-2">
            <Label>סף פסקה (שניות שקט): {config.cuda_paragraph_threshold}</Label>
            <Slider
              value={[config.cuda_paragraph_threshold]}
              onValueChange={([v]) => update('cuda_paragraph_threshold', v)}
              min={0}
              max={5}
              step={0.5}
            />
            <p className="text-xs text-muted-foreground">0 = ללא שבירת פסקאות אוטומטית</p>
          </div>
        </CardContent>
      </Card>

      {/* Default Engine & Language */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-blue-500" />
            <CardTitle>ברירות מחדל</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>מנוע ברירת מחדל</Label>
            <Select value={config.default_engine} onValueChange={v => update('default_engine', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI Whisper</SelectItem>
                <SelectItem value="groq">Groq Whisper</SelectItem>
                <SelectItem value="google">Google Speech-to-Text</SelectItem>
                <SelectItem value="assemblyai">AssemblyAI</SelectItem>
                <SelectItem value="deepgram">Deepgram</SelectItem>
                <SelectItem value="local">דפדפן (ONNX)</SelectItem>
                <SelectItem value="local-server">שרת CUDA מקומי</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>שפת מקור</Label>
            <Select value={config.default_language} onValueChange={v => update('default_language', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="he">עברית</SelectItem>
                <SelectItem value="yi">יידיש</SelectItem>
                <SelectItem value="en">אנגלית</SelectItem>
                <SelectItem value="auto">זיהוי אוטומטי</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <Label>מעבר אוטומטי לעורך לאחר תמלול</Label>
            <Switch checked={config.auto_navigate_editor} onCheckedChange={v => update('auto_navigate_editor', v)} />
          </div>

          <div className="flex items-center justify-between">
            <Label>שמירה אוטומטית לענן</Label>
            <Switch checked={config.auto_save_cloud} onCheckedChange={v => update('auto_save_cloud', v)} />
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} className="w-full" size="lg">
        שמור הגדרות מנוע
      </Button>
    </div>
  );
};
