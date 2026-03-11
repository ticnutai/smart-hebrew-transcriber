import { Card } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Globe, Cpu, Zap, Chrome, Mic, Waves, Server } from "lucide-react";

type Engine = 'openai' | 'groq' | 'google' | 'local' | 'local-server' | 'assemblyai' | 'deepgram';
type SourceLanguage = 'auto' | 'he' | 'yi' | 'en';

interface TranscriptionEngineProps {
  selected: Engine;
  onChange: (engine: Engine) => void;
  sourceLanguage: SourceLanguage;
  onSourceLanguageChange: (lang: SourceLanguage) => void;
}

const getLocalModelLabel = (): string => {
  const preferred = localStorage.getItem('preferred_local_model');
  if (preferred) return preferred.split('/').pop() || 'Local';
  return 'whisper-tiny';
};

export const TranscriptionEngine = ({ selected, onChange, sourceLanguage, onSourceLanguageChange }: TranscriptionEngineProps) => {
  return (
    <Card className="p-6" dir="rtl">
      <h2 className="text-xl font-semibold mb-4 text-right">בחר מנוע תמלול</h2>
      
      <div className="mb-4">
        <h3 className="text-sm font-semibold mb-2 text-right text-muted-foreground">מנועים אונליין (5)</h3>
        <RadioGroup value={selected} onValueChange={(value) => onChange(value as Engine)}>
          <div className="grid grid-cols-3 gap-3">
            <Label 
              htmlFor="groq" 
              className={`flex flex-col items-center justify-center p-4 border-2 rounded-lg cursor-pointer transition-all hover:border-primary ${
                selected === 'groq' ? 'border-primary bg-primary/5' : 'border-border'
              }`}
            >
              <RadioGroupItem value="groq" id="groq" className="sr-only" />
              <Zap className="w-8 h-8 text-primary mb-2" />
              <span className="font-medium text-sm">Groq</span>
              <span className="text-[10px] text-muted-foreground mt-0.5">whisper-large-v3-turbo</span>
            </Label>

            <Label 
              htmlFor="openai" 
              className={`flex flex-col items-center justify-center p-4 border-2 rounded-lg cursor-pointer transition-all hover:border-primary ${
                selected === 'openai' ? 'border-primary bg-primary/5' : 'border-border'
              }`}
            >
              <RadioGroupItem value="openai" id="openai" className="sr-only" />
              <Globe className="w-8 h-8 text-primary mb-2" />
              <span className="font-medium text-sm">OpenAI</span>
              <span className="text-[10px] text-muted-foreground mt-0.5">whisper-1</span>
            </Label>

            <Label 
              htmlFor="google" 
              className={`flex flex-col items-center justify-center p-4 border-2 rounded-lg cursor-pointer transition-all hover:border-primary ${
                selected === 'google' ? 'border-primary bg-primary/5' : 'border-border'
              }`}
            >
              <RadioGroupItem value="google" id="google" className="sr-only" />
              <Chrome className="w-8 h-8 text-blue-500 mb-2" />
              <span className="font-medium text-sm">Google</span>
              <span className="text-[10px] text-muted-foreground mt-0.5">Speech-to-Text</span>
            </Label>

            <Label 
              htmlFor="assemblyai" 
              className={`flex flex-col items-center justify-center p-4 border-2 rounded-lg cursor-pointer transition-all hover:border-primary ${
                selected === 'assemblyai' ? 'border-primary bg-primary/5' : 'border-border'
              }`}
            >
              <RadioGroupItem value="assemblyai" id="assemblyai" className="sr-only" />
              <Mic className="w-8 h-8 text-green-500 mb-2" />
              <span className="font-medium text-sm">AssemblyAI</span>
              <span className="text-[10px] text-muted-foreground mt-0.5">Universal</span>
            </Label>

            <Label 
              htmlFor="deepgram" 
              className={`flex flex-col items-center justify-center p-4 border-2 rounded-lg cursor-pointer transition-all hover:border-primary ${
                selected === 'deepgram' ? 'border-primary bg-primary/5' : 'border-border'
              }`}
            >
              <RadioGroupItem value="deepgram" id="deepgram" className="sr-only" />
              <Waves className="w-8 h-8 text-purple-500 mb-2" />
              <span className="font-medium text-sm">Deepgram</span>
              <span className="text-[10px] text-muted-foreground mt-0.5">nova-2</span>
            </Label>
          </div>
        </RadioGroup>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2 text-right text-muted-foreground">מנועים מקומיים (אופליין)</h3>
        <RadioGroup value={selected} onValueChange={(value) => onChange(value as Engine)}>
          <div className="grid grid-cols-2 gap-3">
            <Label 
              htmlFor="local-server" 
              className={`flex flex-col items-center justify-center p-4 border-2 rounded-lg cursor-pointer transition-all hover:border-primary ${
                selected === 'local-server' ? 'border-primary bg-primary/5' : 'border-border'
              }`}
            >
              <RadioGroupItem value="local-server" id="local-server" className="sr-only" />
              <Server className="w-8 h-8 text-purple-500 mb-2" />
              <span className="font-medium text-sm">שרת CUDA 🖥️</span>
              <span className="text-xs text-muted-foreground mt-1">GPU + ivrit-ai + faster-whisper</span>
              <Badge variant="secondary" className="mt-1 text-[10px]">
                מומלץ לעברית 🇮🇱
              </Badge>
            </Label>

            <Label 
              htmlFor="local" 
              className={`flex flex-col items-center justify-center p-4 border-2 rounded-lg cursor-pointer transition-all hover:border-primary ${
                selected === 'local' ? 'border-primary bg-primary/5' : 'border-border'
              }`}
            >
              <RadioGroupItem value="local" id="local" className="sr-only" />
              <Cpu className="w-8 h-8 text-accent mb-2" />
              <span className="font-medium text-sm">דפדפן (ONNX)</span>
              <span className="text-xs text-muted-foreground mt-1">IndexedDB / WebGPU</span>
              <Badge variant="secondary" className="mt-1 text-[10px]">
                מודל: {getLocalModelLabel()}
              </Badge>
            </Label>
          </div>
        </RadioGroup>
      </div>

      <div className="border-t pt-4 mt-4">
        <Label className="text-sm font-semibold mb-2 block text-right">שפת מקור (קלט)</Label>
        <Select value={sourceLanguage} onValueChange={onSourceLanguageChange}>
          <SelectTrigger className="w-full text-right" dir="rtl">
            <SelectValue placeholder="בחר שפת מקור" />
          </SelectTrigger>
          <SelectContent dir="rtl">
            <SelectItem value="auto">זיהוי אוטומטי</SelectItem>
            <SelectItem value="he">עברית 🇮🇱</SelectItem>
            <SelectItem value="yi">יידיש 🕍</SelectItem>
            <SelectItem value="en">אנגלית 🇺🇸</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-2 text-right">
          התמלול יהיה תמיד בעברית, ללא קשר לשפת המקור
        </p>
      </div>
    </Card>
  );
};
