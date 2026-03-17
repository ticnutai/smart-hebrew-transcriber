import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Server, Wifi, WifiOff, Download, Trash2, RefreshCw,
  HardDrive, Loader2, CheckCircle2, XCircle, Cpu
} from "lucide-react";
import { useOllama, getOllamaUrl, setOllamaUrl, formatModelSize } from "@/hooks/useOllama";
import { toast } from "@/hooks/use-toast";

const RECOMMENDED_MODELS = [
  { name: 'llama3.1:8b', label: 'Llama 3.1 8B', description: 'מודל כללי מצוין — Meta', vram: '~5 GB' },
  { name: 'mistral:7b', label: 'Mistral 7B', description: 'מהיר ואיכותי לטקסט', vram: '~4.5 GB' },
  { name: 'gemma2:9b', label: 'Gemma 2 9B', description: 'מודל חזק של Google', vram: '~5.5 GB' },
  { name: 'qwen2.5:7b', label: 'Qwen 2.5 7B', description: 'תמיכה טובה בעברית — Alibaba', vram: '~4.5 GB' },
  { name: 'phi3:medium', label: 'Phi-3 Medium 14B', description: 'מודל חכם של Microsoft', vram: '~8 GB' },
  { name: 'llama3.1:70b', label: 'Llama 3.1 70B', description: 'הכי חזק — דורש VRAM גבוה', vram: '~40 GB' },
  // Hebrew-optimized models
  { name: 'aya:8b', label: 'Aya 8B', description: 'תמיכה מעולה בעברית — Cohere', vram: '~5 GB' },
  { name: 'aya:35b', label: 'Aya 35B', description: 'הכי טוב לעברית — Cohere', vram: '~20 GB' },
  { name: 'qwen2.5:14b', label: 'Qwen 2.5 14B', description: 'רב-שפתי חזק — Alibaba', vram: '~9 GB' },
  { name: 'mistral-nemo:12b', label: 'Mistral Nemo 12B', description: 'מתקדם בשפות שמיות', vram: '~7 GB' },
  { name: 'command-r:35b', label: 'Command R 35B', description: 'RAG + עברית — Cohere', vram: '~20 GB' },
  { name: 'gemma2:27b', label: 'Gemma 2 27B', description: 'מודל חזק של Google', vram: '~16 GB' },
];

export const OllamaManager = () => {
  const {
    isConnected, isChecking, models,
    isPulling, pullProgress,
    checkConnection, pullModel, cancelPull, deleteModel,
  } = useOllama();

  const [urlInput, setUrlInput] = useState(getOllamaUrl());
  const [selectedModel, setSelectedModel] = useState('');
  const [customModelName, setCustomModelName] = useState('');

  const handleUrlSave = () => {
    const trimmed = urlInput.trim().replace(/\/+$/, '');
    if (!trimmed) return;
    setOllamaUrl(trimmed);
    toast({ title: "נשמר", description: `כתובת Ollama עודכנה ל-${trimmed}` });
    checkConnection();
  };

  const handlePull = async (modelName: string) => {
    if (!modelName) return;
    try {
      await pullModel(modelName);
      toast({ title: "הצלחה", description: `${modelName} הורד בהצלחה` });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        toast({ title: "בוטל", description: "ההורדה בוטלה" });
      } else {
        toast({ title: "שגיאה", description: err instanceof Error ? err.message : "שגיאה בהורדה", variant: "destructive" });
      }
    }
  };

  const handleDelete = async (modelName: string) => {
    try {
      await deleteModel(modelName);
      toast({ title: "נמחק", description: `${modelName} הוסר` });
    } catch (err) {
      toast({ title: "שגיאה", description: err instanceof Error ? err.message : "שגיאה במחיקה", variant: "destructive" });
    }
  };

  const pullPercent = pullProgress?.total && pullProgress?.completed
    ? Math.round((pullProgress.completed / pullProgress.total) * 100)
    : 0;

  return (
    <Card dir="rtl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-6 h-6 text-primary" />
            <div>
              <CardTitle className="text-xl">Ollama — מודלים מקומיים</CardTitle>
              <CardDescription>
                הרצת מודלי AI על המחשב שלך עם כרטיס NVIDIA
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isChecking ? (
              <Badge variant="secondary"><Loader2 className="w-3 h-3 animate-spin ml-1" />בודק...</Badge>
            ) : isConnected ? (
              <Badge variant="default" className="bg-green-600"><Wifi className="w-3 h-3 ml-1" />מחובר</Badge>
            ) : (
              <Badge variant="destructive"><WifiOff className="w-3 h-3 ml-1" />לא מחובר</Badge>
            )}
            <Button variant="ghost" size="icon" onClick={checkConnection} disabled={isChecking}>
              <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Connection URL */}
        <div className="space-y-2">
          <Label>כתובת שרת Ollama</Label>
          <div className="flex gap-2">
            <Input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="http://localhost:11434"
              dir="ltr"
              className="flex-1"
            />
            <Button onClick={handleUrlSave} variant="outline">שמור</Button>
          </div>
          {!isConnected && !isChecking && (
            <p className="text-xs text-destructive">
              ודא ש-Ollama רץ: <code className="text-xs bg-muted px-1 rounded" dir="ltr">ollama serve</code>
              {" "}ושהגדרת <code className="text-xs bg-muted px-1 rounded" dir="ltr">OLLAMA_ORIGINS=*</code>
            </p>
          )}
        </div>

        {/* Installed Models */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4" />
            <Label>מודלים מותקנים ({models.length})</Label>
          </div>

          {models.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground border rounded-lg">
              {isConnected ? "אין מודלים מותקנים — הורד מודל מהרשימה למטה" : "חבר ל-Ollama כדי לראות מודלים"}
            </div>
          ) : (
            <ScrollArea className="max-h-[250px]">
              <div className="space-y-2">
                {models.map((m) => (
                  <div key={m.name} className="flex items-center justify-between p-3 border rounded-lg bg-background">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      <div>
                        <p className="text-sm font-medium" dir="ltr">{m.name}</p>
                        <div className="flex gap-2 text-xs text-muted-foreground">
                          <span>{formatModelSize(m.size)}</span>
                          {m.details?.parameter_size && <span>{m.details.parameter_size}</span>}
                          {m.details?.quantization_level && <span>{m.details.quantization_level}</span>}
                        </div>
                      </div>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent dir="rtl">
                        <AlertDialogHeader>
                          <AlertDialogTitle>מחיקת מודל</AlertDialogTitle>
                          <AlertDialogDescription>
                            למחוק את <strong dir="ltr">{m.name}</strong>? יצטרך להוריד אותו מחדש.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>ביטול</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(m.name)} className="bg-destructive text-destructive-foreground">
                            מחק
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Download Models */}
        {isConnected && (
          <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
            <Label className="text-sm font-semibold">הורד מודל</Label>

            {/* Recommended */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">מומלצים ל-RTX 4060</Label>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="text-xs" dir="ltr">
                  <SelectValue placeholder="בחר מודל מומלץ..." />
                </SelectTrigger>
                <SelectContent dir="ltr">
                  {RECOMMENDED_MODELS.map(rm => (
                    <SelectItem key={rm.name} value={rm.name}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{rm.label}</span>
                        <span className="text-muted-foreground">— {rm.description} ({rm.vram})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={() => handlePull(selectedModel)}
                disabled={!selectedModel || isPulling}
                size="sm"
                className="w-full"
              >
                {isPulling ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Download className="w-4 h-4 ml-1" />}
                {isPulling ? 'מוריד...' : 'הורד מודל'}
              </Button>
            </div>

            {/* Custom model name */}
            <div className="space-y-1.5 pt-2 border-t">
              <Label className="text-xs text-muted-foreground">או הזן שם מודל ידנית</Label>
              <div className="flex gap-2">
                <Input
                  value={customModelName}
                  onChange={(e) => setCustomModelName(e.target.value)}
                  placeholder="e.g. codellama:7b"
                  dir="ltr"
                  className="flex-1 text-xs"
                />
                <Button
                  onClick={() => handlePull(customModelName.trim())}
                  disabled={!customModelName.trim() || isPulling}
                  size="sm"
                  variant="outline"
                >
                  <Download className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Pull progress */}
            {isPulling && pullProgress && (
              <div className="space-y-1.5 pt-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{pullProgress.status}</span>
                  {pullPercent > 0 && <span className="font-medium">{pullPercent}%</span>}
                </div>
                {pullPercent > 0 && <Progress value={pullPercent} />}
                <Button variant="ghost" size="sm" onClick={cancelPull} className="text-xs text-destructive">
                  <XCircle className="w-3 h-3 ml-1" />
                  בטל הורדה
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Instructions */}
        <div className="text-xs text-muted-foreground space-y-1 p-3 bg-muted/20 rounded-lg">
          <p className="font-semibold">התקנה מהירה:</p>
          <ol className="list-decimal pr-4 space-y-0.5" dir="rtl">
            <li>הורד Ollama מ-<code dir="ltr" className="bg-muted px-1 rounded">ollama.com</code></li>
            <li>הפעל: <code dir="ltr" className="bg-muted px-1 rounded">ollama serve</code></li>
            <li>
              הגדר CORS (חלונות): <code dir="ltr" className="bg-muted px-1 rounded">set OLLAMA_ORIGINS=*</code> לפני ההפעלה
            </li>
            <li>הורד מודל מהרשימה למעלה — והתחל לערוך!</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
};
