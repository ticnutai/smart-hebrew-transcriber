import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Globe, Cpu, Zap, Chrome, Mic, Waves, Server, Power, PowerOff, Loader2, CheckCircle2, XCircle, Copy, Rabbit, Turtle, Settings, ChevronDown, Flame, Download, Sparkles, Link2 } from "lucide-react";
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

const START_CMD_LOCAL = '.\\scripts\\start-whisper-server.ps1';
const START_CMD_LOVABLE = '.\\scripts\\start-lovable.ps1';

// True remote = not localhost AND server URL is explicitly set to a non-localhost address
const isNonLocalHost = !['localhost', '127.0.0.1'].includes(window.location.hostname);
const hasCustomServerUrl = () => {
  const url = localStorage.getItem('whisper_server_url') || '';
  return url !== '' && !url.includes('localhost') && !url.includes('127.0.0.1');
};

export const TranscriptionEngine = ({ selected, onChange, sourceLanguage, onSourceLanguageChange }: TranscriptionEngineProps) => {
  const { isConnected, serverStatus, checkConnection, startPolling, stopPolling, shutdownServer, warmupServer, preloadModelStream, cancelPreload, modelReady, modelLoading, getBaseUrl } = useLocalServer();
  const [isStarting, setIsStarting] = useState(false);
  const [fastMode, setFastMode] = useState(() => localStorage.getItem('cuda_fast_mode') === '1');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [computeType, setComputeType] = useState(() => localStorage.getItem('cuda_compute_type') || 'float16');
  const [beamSize, setBeamSize] = useState(() => parseInt(localStorage.getItem('cuda_beam_size') || '0'));
  const [noConditionPrev, setNoConditionPrev] = useState(() => localStorage.getItem('cuda_no_condition_prev') === '1');
  const [vadAggressive, setVadAggressive] = useState(() => localStorage.getItem('cuda_vad_aggressive') === '1');
  const [isWarmingUp, setIsWarmingUp] = useState(false);
  const [preloadMode, setPreloadMode] = useState<'preload' | 'direct'>(() => (localStorage.getItem('cuda_preload_mode') as 'preload' | 'direct') || 'preload');
  const [preloadMsg, setPreloadMsg] = useState('');
  const [cloudSaveMode, setCloudSaveMode] = useState<'immediate' | 'text-only' | 'skip'>(() => (localStorage.getItem('cuda_cloud_save') as 'immediate' | 'text-only' | 'skip') || 'immediate');
  const [hotwords, setHotwords] = useState(() => localStorage.getItem('cuda_hotwords') || '');
  const [paragraphThreshold, setParagraphThreshold] = useState(() => parseFloat(localStorage.getItem('cuda_paragraph_threshold') || '0'));
  const [serverUrl, setServerUrl] = useState(() => localStorage.getItem('whisper_server_url') || '');
  const [ollamaUrl, setOllamaUrl] = useState(() => localStorage.getItem('ollama_base_url') || '');

  // "True remote" = non-localhost site + custom remote URL configured
  // If on Lovable but targeting localhost:8765, that's local-via-web, NOT remote
  const isRemoteAccess = isNonLocalHost && hasCustomServerUrl();

  // When user selects CUDA server, start polling; otherwise stop
  useEffect(() => {
    if (selected === 'local-server') {
      // Poll (5s) while waiting, normal (10s) once connected
      startPolling(isConnected ? 10000 : 5000);
      if (isConnected) setIsStarting(false);
      return () => stopPolling();
    } else {
      stopPolling();
      setIsStarting(false);
    }
  }, [selected, isConnected, startPolling, stopPolling]);

  // Auto-preload model when connected + preload mode
  useEffect(() => {
    if (selected === 'local-server' && isConnected && preloadMode === 'preload' && !modelReady && !modelLoading) {
      preloadModelStream(undefined, undefined, (msg) => setPreloadMsg(msg)).then((r) => {
        if (r.ready) {
          toast({ title: '✅ המודל מוכן!', description: r.elapsed ? `נטען ב-${r.elapsed}s` : 'המודל טעון ומוכן לתמלול' });
        }
        setPreloadMsg('');
      }).catch(() => setPreloadMsg(''));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, isConnected, preloadMode]);

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
      // Fallback: try launcher service on 8764
      try {
        const launcherRes = await fetch('http://localhost:8764/start', { method: 'POST', signal: AbortSignal.timeout(5000) });
        const launcherData = await launcherRes.json();
        if (launcherData.ok) {
          toast({
            title: "🚀 השרת מופעל!",
            description: launcherData.results?.whisper?.message === 'already running' ? 'השרת כבר רץ, ממתין לחיבור...' : 'שרת CUDA + Ollama עולים...',
          });
          return;
        }
      } catch {
        // launcher not available either
      }
      toast({
        title: "שגיאה בהפעלת השרת",
        description: "לא ניתן להפעיל. הפעל ידנית בטרמינל.",
        variant: "destructive",
      });
      setIsStarting(false);
    }
  }, []);

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
                  {/* Model status badge */}
                  {modelReady ? (
                    <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-300">
                      <Sparkles className="w-3 h-3 ml-1" />
                      מודל מוכן
                    </Badge>
                  ) : modelLoading ? (
                    <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-300">
                      <Loader2 className="w-3 h-3 ml-1 animate-spin" />
                      טוען מודל...
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                      מודל לא טעון
                    </Badge>
                  )}
                </>
              ) : (
                <>
                  <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                  <span className="text-xs text-red-500 font-medium">
                    {isStarting ? 'מחכה לשרת...' : isRemoteAccess ? 'נדרשת כתובת מרחוק' : 'לא מחובר — הפעל שרת CUDA'}
                  </span>
                </>
              )}
            </div>
            {!isConnected ? (
              isRemoteAccess ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs h-7"
                  onClick={(e) => {
                    e.preventDefault();
                    setAdvancedOpen(true);
                  }}
                >
                  <Link2 className="w-3.5 h-3.5" />
                  הגדר כתובת שרת
                </Button>
              ) : isNonLocalHost ? (
                /* On Lovable site — try launcher service on 8764, then check connection */
                <Button
                  size="sm"
                  variant="default"
                  className="gap-1.5 text-xs h-7"
                  onClick={async (e) => {
                    e.preventDefault();
                    setIsStarting(true);
                    // Step 1: Try launcher service to start everything
                    try {
                      const res = await fetch('http://localhost:8764/start', { method: 'POST', signal: AbortSignal.timeout(5000) });
                      const data = await res.json();
                      if (data.ok) {
                        toast({
                          title: '🚀 מפעיל שרת CUDA...',
                          description: data.results?.whisper?.message === 'already running'
                            ? 'השרת כבר רץ, ממתין לחיבור...'
                            : 'השרת עולה, ממתין לחיבור...',
                        });
                        return; // polling will pick it up
                      }
                    } catch {
                      // Launcher not running — try direct connection check
                    }
                    // Step 2: Fallback — just check if server already reachable
                    const ok = await checkConnection();
                    if (ok) {
                      toast({ title: '🟢 מחובר!', description: 'שרת CUDA זוהה' });
                    } else {
                      toast({
                        title: '🔴 שרת לא נמצא',
                        description: 'הפעל install-launcher.ps1 ואז נסה שוב, או הפעל start-lovable.ps1 ידנית',
                        variant: 'destructive',
                      });
                    }
                    setIsStarting(false);
                  }}
                >
                  {isStarting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Server className="w-3.5 h-3.5" />
                  )}
                  {isStarting ? 'מפעיל...' : 'הפעל שרת'}
                </Button>
              ) : (
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
              )
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs h-7 text-destructive border-destructive/40 hover:bg-destructive/10"
                onClick={(e) => {
                  e.preventDefault();
                  shutdownServer();
                  toast({ title: "השרת נכבה", description: "שרת ה-CUDA כובה בהצלחה" });
                }}
              >
                <PowerOff className="w-3.5 h-3.5" />
                כבה שרת
              </Button>
            )}
          </div>
          {!isConnected && !isRemoteAccess && !isNonLocalHost && (
            <div className="text-[11px] text-muted-foreground space-y-1 border-t pt-2">
              <p>הפעל בטרמינל:</p>
              <div className="flex items-center gap-1">
                <code className="flex-1 bg-background px-2 py-1 rounded text-[11px] font-mono border select-all">
                  {START_CMD_LOCAL}
                </code>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={(e) => { e.preventDefault(); navigator.clipboard.writeText(START_CMD_LOCAL); toast({ title: 'הועתק', description: 'הפקודה הועתקה ללוח' }); }}>
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
            </div>
          )}
          {!isConnected && !isRemoteAccess && isNonLocalHost && (
            <div className="text-[11px] text-muted-foreground space-y-1.5 border-t pt-2">
              <p className="font-medium">🖥️ לחץ "הפעל שרת" — ה-Launcher יפעיל הכל אוטומטית!</p>
              <p className="text-muted-foreground">
                הפעם ראשונה? הרץ פעם אחת בטרמינל:
              </p>
              <div className="flex items-center gap-1">
                <code className="flex-1 bg-background px-2 py-1 rounded text-[11px] font-mono border select-all">
                  .\scripts\install-launcher.ps1
                </code>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={(e) => { e.preventDefault(); navigator.clipboard.writeText('.\\scripts\\install-launcher.ps1'); toast({ title: 'הועתק', description: 'הפקודה הועתקה ללוח' }); }}>
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">זה מתקין שירות קטן שעולה אוטומטית עם Windows ומאפשר הפעלת השרת מהאתר</p>
            </div>
          )}
          {!isConnected && isRemoteAccess && (
            <div className="text-[11px] text-amber-600 dark:text-amber-400 space-y-1.5 border-t pt-2">
              <p className="font-medium">📡 גישה מרחוק — נדרשת כתובת שרת</p>
              <p className="text-muted-foreground">פתח הגדרות מתקדמות למטה והזן את כתובת שרת ה-Whisper שקיבלת מ-start-remote.ps1</p>
            </div>
          )}
        </div>
      )}

      {/* Model preload mode + manual preload */}
      {selected === 'local-server' && isConnected && (
        <div className="border-t pt-3 mt-3 space-y-2">
          <Label className="text-xs font-medium text-right block">מצב טעינת מודל</Label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={preloadMode === 'preload' ? 'default' : 'outline'}
              size="sm"
              className={`gap-1.5 text-xs h-8 ${preloadMode === 'preload' ? 'bg-blue-500 hover:bg-blue-600 text-white' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                setPreloadMode('preload');
                localStorage.setItem('cuda_preload_mode', 'preload');
                toast({ title: '📦 מצב טעינה מראש', description: 'המודל ייטען אוטומטית ברגע שהשרת מחובר' });
              }}
            >
              <Download className="w-3.5 h-3.5" />
              טען מראש
            </Button>
            <Button
              variant={preloadMode === 'direct' ? 'default' : 'outline'}
              size="sm"
              className={`gap-1.5 text-xs h-8 ${preloadMode === 'direct' ? 'bg-blue-500 hover:bg-blue-600 text-white' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                setPreloadMode('direct');
                localStorage.setItem('cuda_preload_mode', 'direct');
                toast({ title: '⚡ תמלול ישיר', description: 'המודל ייטען רק כשתתחיל לתמלל (חיסכון VRAM)' });
              }}
            >
              <Zap className="w-3.5 h-3.5" />
              תמלל ישיר
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground text-right">
            {preloadMode === 'preload' ? 'המודל נטען ברקע מיד כשהשרת מוכן — תמלול ראשון מהיר' : 'חוסך VRAM — המודל נטען רק כשמתחילים לתמלל'}
          </p>

          {/* Manual preload / progress */}
          {!modelReady && !modelLoading && (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5 text-xs h-8"
              onClick={async (e) => {
                e.preventDefault();
                setPreloadMsg('מתחיל טעינה...');
                try {
                  const r = await preloadModelStream(undefined, undefined, (msg) => setPreloadMsg(msg));
                  if (r.ready) {
                    toast({ title: '✅ המודל מוכן!', description: r.elapsed ? `נטען ב-${r.elapsed}s` : 'מוכן לתמלול' });
                  }
                } catch {
                  toast({ title: '❌ טעינה נכשלה', variant: 'destructive' });
                }
                setPreloadMsg('');
              }}
            >
              <Download className="w-3.5 h-3.5" />
              טען מודל עכשיו
            </Button>
          )}
          {modelLoading && preloadMsg && (
            <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
              <span className="truncate">{preloadMsg}</span>
            </div>
          )}
        </div>
      )}

      {/* Fast mode toggle — only for CUDA engine */}
      {selected === 'local-server' && (
        <div className="border-t pt-3 mt-3">
          <div className="flex items-center justify-between gap-2">
            <Button
              variant={fastMode ? 'default' : 'outline'}
              size="sm"
              className={`gap-1.5 text-xs h-8 flex-1 ${fastMode ? 'bg-amber-500 hover:bg-amber-600 text-white' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                const next = !fastMode;
                setFastMode(next);
                localStorage.setItem('cuda_fast_mode', next ? '1' : '0');
                toast({ title: next ? '⚡ מצב מהיר הופעל' : '🐢 מצב רגיל (איכות מקסימלית)', description: next ? 'עיבוד מקבילי — מהיר פי 2-5' : 'עיבוד סדרתי — איכות מקסימלית' });
              }}
            >
              {fastMode ? <Rabbit className="w-3.5 h-3.5" /> : <Turtle className="w-3.5 h-3.5" />}
              {fastMode ? '⚡ מהיר' : '🐢 רגיל'}
            </Button>
            <span className="text-[11px] text-muted-foreground text-right">
              {fastMode ? 'עיבוד מקבילי — מהיר ביותר' : 'איכות מקסימלית'}
            </span>
          </div>
        </div>
      )}

      {/* Advanced CUDA settings — only for CUDA engine */}
      {selected === 'local-server' && (
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full mt-2 gap-1.5 text-xs h-7 text-muted-foreground">
              <Settings className="w-3.5 h-3.5" />
              הגדרות מתקדמות
              <ChevronDown className={`w-3 h-3 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 space-y-3 rounded-lg border p-3 bg-muted/20 text-sm">

              {/* Compute Type */}
              <div className="space-y-1">
                <Label className="text-xs font-medium text-right block">סוג חישוב (Compute Type)</Label>
                <Select value={computeType} onValueChange={(v) => { setComputeType(v); localStorage.setItem('cuda_compute_type', v); }}>
                  <SelectTrigger className="h-8 text-xs" dir="rtl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="float16">float16 — ברירת מחדל (איכות מקסימלית)</SelectItem>
                    <SelectItem value="int8_float16">int8_float16 — מהיר ~30% (איכות טובה)</SelectItem>
                    <SelectItem value="int8">int8 — מהיר ביותר (פחות דיוק)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground text-right">⚠️ שינוי סוג חישוב דורש טעינה מחדש של המודל</p>
              </div>

              {/* Beam Size */}
              <div className="space-y-1">
                <Label className="text-xs font-medium text-right block">Beam Size</Label>
                <Select value={String(beamSize)} onValueChange={(v) => { setBeamSize(Number(v)); localStorage.setItem('cuda_beam_size', v); }}>
                  <SelectTrigger className="h-8 text-xs" dir="rtl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="0">ברירת מחדל (5 רגיל / 1 מהיר)</SelectItem>
                    <SelectItem value="1">1 — מהיר ביותר</SelectItem>
                    <SelectItem value="2">2</SelectItem>
                    <SelectItem value="3">3</SelectItem>
                    <SelectItem value="5">5 — איכות מקסימלית</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground text-right">beam גבוה = דיוק גבוה אבל איטי יותר</p>
              </div>

              {/* Condition on previous text */}
              <div className="flex items-center justify-between gap-2">
                <div className="text-right">
                  <Label className="text-xs font-medium block">ביטול תנאי טקסט קודם</Label>
                  <p className="text-[10px] text-muted-foreground">מונע לולאות הזיה — מומלץ להפעיל</p>
                </div>
                <Switch
                  checked={noConditionPrev}
                  onCheckedChange={(v) => { setNoConditionPrev(v); localStorage.setItem('cuda_no_condition_prev', v ? '1' : '0'); }}
                />
              </div>

              {/* VAD Aggressive */}
              <div className="flex items-center justify-between gap-2">
                <div className="text-right">
                  <Label className="text-xs font-medium block">VAD אגרסיבי</Label>
                  <p className="text-[10px] text-muted-foreground">מדלג מהר על שקט — מאיץ קבצים ארוכים</p>
                </div>
                <Switch
                  checked={vadAggressive}
                  onCheckedChange={(v) => { setVadAggressive(v); localStorage.setItem('cuda_vad_aggressive', v ? '1' : '0'); }}
                />
              </div>

              {/* Hotwords */}
              <div className="space-y-1 border-t pt-2">
                <Label className="text-xs font-medium text-right block">מילון מותאם אישית (Hotwords)</Label>
                <textarea
                  className="w-full h-16 text-xs rounded-md border bg-background px-3 py-2 text-right resize-none"
                  dir="rtl"
                  placeholder="הכנס מילים מופרדות בפסיקים: שלום, ירושלים, כנסת..."
                  value={hotwords}
                  onChange={(e) => { setHotwords(e.target.value); localStorage.setItem('cuda_hotwords', e.target.value); }}
                />
                <p className="text-[10px] text-muted-foreground text-right">מילים שחוזרות בהקלטה — משפר דיוק זיהוי שמות, מונחים מקצועיים</p>
              </div>

              {/* Auto Paragraph Detection */}
              <div className="space-y-1">
                <Label className="text-xs font-medium text-right block">זיהוי פסקאות אוטומטי</Label>
                <Select value={String(paragraphThreshold)} onValueChange={(v) => { setParagraphThreshold(Number(v)); localStorage.setItem('cuda_paragraph_threshold', v); }}>
                  <SelectTrigger className="h-8 text-xs" dir="rtl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="0">כבוי</SelectItem>
                    <SelectItem value="1">1 שניות שקט</SelectItem>
                    <SelectItem value="1.5">1.5 שניות שקט</SelectItem>
                    <SelectItem value="2">2 שניות שקט</SelectItem>
                    <SelectItem value="3">3 שניות שקט</SelectItem>
                    <SelectItem value="5">5 שניות שקט</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground text-right">מוסיף מעבר פסקה כשיש שקט ארוך — מתאים להרצאות</p>
              </div>

              {/* GPU Warmup */}
              {isConnected && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5 text-xs h-8"
                  disabled={isWarmingUp}
                  onClick={async (e) => {
                    e.preventDefault();
                    setIsWarmingUp(true);
                    const t = await warmupServer();
                    setIsWarmingUp(false);
                    toast({ title: t != null ? `🔥 GPU חומם ב-${t}s` : '❌ חימום נכשל', description: t != null ? 'התמלול הראשון יהיה מהיר יותר' : 'ודא שהשרת פועל' });
                  }}
                >
                  {isWarmingUp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Flame className="w-3.5 h-3.5" />}
                  {isWarmingUp ? 'מחמם GPU...' : 'חמם GPU (Warmup)'}
                </Button>
              )}

              {/* Remote Server URLs */}
              <div className="space-y-2 border-t pt-2">
                <div className="flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5 text-blue-500" />
                  <Label className="text-xs font-medium text-right block">גישה מרחוק — כתובות שרתים</Label>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground text-right block">כתובת שרת Whisper (CUDA)</Label>
                  <input
                    type="url"
                    className="w-full h-8 text-xs rounded-md border bg-background px-3 text-left dir-ltr font-mono"
                    dir="ltr"
                    placeholder="http://localhost:8765"
                    value={serverUrl}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      setServerUrl(v);
                      if (v) localStorage.setItem('whisper_server_url', v);
                      else localStorage.removeItem('whisper_server_url');
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground text-right block">כתובת שרת Ollama (AI עריכה)</Label>
                  <input
                    type="url"
                    className="w-full h-8 text-xs rounded-md border bg-background px-3 text-left dir-ltr font-mono"
                    dir="ltr"
                    placeholder="http://localhost:11434"
                    value={ollamaUrl}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      setOllamaUrl(v);
                      if (v) localStorage.setItem('ollama_base_url', v);
                      else localStorage.removeItem('ollama_base_url');
                    }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground text-right">
                  לגישה מרחוק: הפעל <code className="font-mono bg-muted px-1 rounded">scripts\start-remote.ps1</code> במחשב — יקבל כתובות אינטרנט. השאר ריק לשימוש מקומי.
                </p>
              </div>

              {/* Cloud Save Mode */}
              <div className="space-y-1 border-t pt-2">
                <Label className="text-xs font-medium text-right block">שמירה בענן</Label>
                <Select value={cloudSaveMode} onValueChange={(v: 'immediate' | 'text-only' | 'skip') => { setCloudSaveMode(v); localStorage.setItem('cuda_cloud_save', v); }}>
                  <SelectTrigger className="h-8 text-xs" dir="rtl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="immediate">מלא — טקסט + אודיו לענן</SelectItem>
                    <SelectItem value="text-only">טקסט בלבד — בלי להעלות אודיו</SelectItem>
                    <SelectItem value="skip">מקומי בלבד — ללא ענן כלל</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground text-right">
                  {cloudSaveMode === 'immediate' ? 'התמלול + קובץ האודיו יישמרו בענן' :
                   cloudSaveMode === 'text-only' ? 'רק הטקסט יעלה לענן — מהיר יותר, חוסך נפח' :
                   'הכל נשאר מקומי — תמלול אופליין מלא'}
                </p>
              </div>

            </div>
          </CollapsibleContent>
        </Collapsible>
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
