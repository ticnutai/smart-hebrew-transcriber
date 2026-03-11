import { useState, useEffect, useRef, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Globe, Cpu, Zap, Chrome, Mic, Waves, Server, Power, Loader2, CheckCircle2, XCircle, Copy } from "lucide-react";
import { useLocalServer } from "@/hooks/useLocalServer";
import { toast } from "@/hooks/use-toast";

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

const START_CMD = '.\\scripts\\start-whisper-server.ps1';

export const TranscriptionEngine = ({ selected, onChange, sourceLanguage, onSourceLanguageChange }: TranscriptionEngineProps) => {
  const { isConnected, serverStatus, checkConnection, getBaseUrl } = useLocalServer();
  const [isStarting, setIsStarting] = useState(false);
  const fastPollRef = useRef<ReturnType<typeof setInterval>>();

  // When user selects CUDA server, start fast-polling for connection
  useEffect(() => {
    if (selected === 'local-server' && !isConnected) {
      // Immediately check
      checkConnection();
      // Poll every 2s until connected (fast poll)
      fastPollRef.current = setInterval(async () => {
        const ok = await checkConnection();
        if (ok) {
          clearInterval(fastPollRef.current);
          setIsStarting(false);
        }
      }, 2000);
      return () => clearInterval(fastPollRef.current);
    } else {
      if (fastPollRef.current) clearInterval(fastPollRef.current);
      setIsStarting(false);
    }
  }, [selected, isConnected, checkConnection]);

  const handleStartServer = useCallback(async () => {
    setIsStarting(true);
    try {
      const res = await fetch('/__api/start-server', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        toast({
          title: "🚀 השרת מופעל!",
          description: data.message === 'already running' ? 'השרת כבר רץ, ממתין לחיבור...' : 'השרת עולה, ממתין לחיבור...',
        });
      } else {
        throw new Error(data.error || 'Failed to start');
      }
    } catch (err: any) {
      toast({
        title: "שגיאה בהפעלת השרת",
        description: err.message || "לא ניתן להפעיל. הפעל ידנית בטרמינל.",
        variant: "destructive",
      });
      setIsStarting(false);
    }
  }, []);

  const handleCopyCommand = () => {
    navigator.clipboard.writeText(START_CMD);
    toast({ title: "הועתק", description: "הפקודה הועתקה ללוח" });
  };

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
              className={`flex flex-col items-center justify-center p-4 border-2 rounded-lg cursor-pointer transition-all hover:border-primary relative ${
                selected === 'local-server' ? 'border-primary bg-primary/5' : 'border-border'
              }`}
            >
              <RadioGroupItem value="local-server" id="local-server" className="sr-only" />
              {/* Connection status indicator */}
              <div className="absolute top-2 left-2">
                {isConnected ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                ) : isStarting ? (
                  <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-400" />
                )}
              </div>
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

      {/* Server status panel - shown when CUDA engine selected */}
      {selected === 'local-server' && (
        <div className="mt-3 rounded-lg border p-3 space-y-2 bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isConnected ? (
                <>
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                  </span>
                  <span className="text-xs text-green-600 dark:text-green-400 font-medium">מחובר</span>
                  {serverStatus?.device && (
                    <Badge variant="outline" className="text-[10px]">
                      {serverStatus.device === 'cuda' ? `GPU ${serverStatus.gpu || ''}` : serverStatus.device}
                    </Badge>
                  )}
                  {serverStatus?.current_model && (
                    <Badge variant="outline" className="text-[10px]">
                      {serverStatus.current_model.split('/').pop()}
                    </Badge>
                  )}
                </>
              ) : (
                <>
                  <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                  <span className="text-xs text-red-500 font-medium">
                    {isStarting ? 'מחכה לשרת...' : 'לא מחובר'}
                  </span>
                </>
              )}
            </div>
            {!isConnected && (
              <Button
                size="sm"
                variant="default"
                className="gap-1.5 text-xs h-7"
                onClick={(e) => {
                  e.preventDefault();
                  handleStartServer();
                }}
              >
                {isStarting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Power className="w-3.5 h-3.5" />
                )}
                {isStarting ? 'ממתין לחיבור...' : 'הפעל שרת'}
              </Button>
            )}
          </div>
          {!isConnected && (
            <div className="text-[11px] text-muted-foreground space-y-1 border-t pt-2">
              <p>הפעל בטרמינל:</p>
              <div className="flex items-center gap-1">
                <code className="flex-1 bg-background px-2 py-1 rounded text-[11px] font-mono border select-all">
                  {START_CMD}
                </code>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={(e) => { e.preventDefault(); handleCopyCommand(); }}>
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

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
