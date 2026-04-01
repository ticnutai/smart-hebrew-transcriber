import { useState, useCallback, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Rabbit, Turtle, Scale, Play, Loader2, Trophy, Zap, Target,
  Timer, BarChart3, ArrowUpDown, CheckCircle2, XCircle, Clock,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

// ─── Types ───────────────────────────────────────────────────────────────────

interface BenchmarkResult {
  preset: string;
  presetLabel: string;
  api: string;
  audioDuration: number;
  processingTime: number;
  wallTime: number;
  rtf: number;
  speedX: number;
  text: string;
  wordCount: number;
  model: string;
  fastMode: boolean;
  status: "success" | "error";
  error?: string;
}

interface PresetInfo {
  key: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  badgeClass: string;
  description: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SERVER = "http://localhost:3000";

const PRESETS: PresetInfo[] = [
  {
    key: "fast",
    label: "⚡ מהיר",
    icon: <Rabbit className="w-4 h-4" />,
    color: "text-amber-600 dark:text-amber-400",
    badgeClass: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
    description: "beam=1, batch=24, int8_float16, VAD אגרסיבי",
  },
  {
    key: "balanced",
    label: "⚖️ מאוזן",
    icon: <Scale className="w-4 h-4" />,
    color: "text-blue-600 dark:text-blue-400",
    badgeClass: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
    description: "beam=1, batch=16, int8_float16",
  },
  {
    key: "accurate",
    label: "🎯 מדויק",
    icon: <Turtle className="w-4 h-4" />,
    color: "text-emerald-600 dark:text-emerald-400",
    badgeClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    description: "beam=5, batch=8, float16, הקשר מלא",
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Create a WAV buffer with mixed tones (speech-like) */
function createTestWav(durationSec = 5, sampleRate = 16000): Blob {
  const numSamples = sampleRate * durationSec;
  const dataSize = numSamples * 2;
  const fileSize = 44 + dataSize;
  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);

  // WAV header
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, fileSize - 8, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  const freqs = [150, 200, 250, 180, 220];
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const fIdx = Math.floor(t * 2) % freqs.length;
    const amp = (i % (sampleRate / 4) < sampleRate / 8) ? 12000 : 4000;
    const sample = Math.round(amp * Math.sin(2 * Math.PI * freqs[fIdx] * t));
    view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, sample)), true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function fmtTime(s: number) {
  if (s < 0.01) return "—";
  return s < 10 ? `${s.toFixed(2)}s` : `${s.toFixed(1)}s`;
}

function fmtSpeed(x: number) {
  return x >= 10 ? `${x.toFixed(0)}x` : `${x.toFixed(1)}x`;
}

function speedColor(x: number) {
  if (x >= 20) return "text-green-600 dark:text-green-400";
  if (x >= 10) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function speedBadgeClass(x: number) {
  if (x >= 20) return "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30";
  if (x >= 10) return "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30";
  return "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30";
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Benchmark() {
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [running, setRunning] = useState(false);
  const [currentPreset, setCurrentPreset] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [serverStatus, setServerStatus] = useState<{
    gpu: string; model: string; vram: string; ready: boolean;
  } | null>(null);
  const [activeTab, setActiveTab] = useState("all");
  const [userAudio, setUserAudio] = useState<File | null>(null);
  const abortRef = useRef(false);

  // ─── Server check ──────────────────────────────────────────────────────────

  const checkServer = useCallback(async () => {
    try {
      const r = await fetch(`${SERVER}/health`);
      if (!r.ok) return false;
      const d = await r.json();
      setServerStatus({
        gpu: d.gpu || "N/A",
        model: d.current_model || "N/A",
        vram: d.gpu_memory ? `${d.gpu_memory.allocated_mb}/${d.gpu_memory.total_mb} MB` : "N/A",
        ready: d.model_ready === true,
      });
      return d.model_ready === true;
    } catch {
      setServerStatus(null);
      return false;
    }
  }, []);

  // ─── Run single preset benchmark ──────────────────────────────────────────

  const runSinglePreset = useCallback(async (presetKey: string, audioBlob: Blob): Promise<BenchmarkResult | null> => {
    const presetInfo = PRESETS.find(p => p.key === presetKey)!;
    setCurrentPreset(presetKey);

    const form = new FormData();
    form.append("file", audioBlob, "benchmark.wav");
    form.append("language", "he");
    form.append("preset", presetKey);

    const wallStart = performance.now();
    try {
      const resp = await fetch(`${SERVER}/transcribe`, { method: "POST", body: form });
      const wallTime = (performance.now() - wallStart) / 1000;

      if (!resp.ok) {
        return {
          preset: presetKey, presetLabel: presetInfo.label, api: "/transcribe",
          audioDuration: 0, processingTime: 0, wallTime, rtf: 0, speedX: 0,
          text: "", wordCount: 0, model: "", fastMode: false,
          status: "error", error: `HTTP ${resp.status}`,
        };
      }

      const data = await resp.json();
      const pt = data.processing_time || 0;
      const dur = data.duration || 1;
      const rtf = pt / dur;
      const speedX = rtf > 0 ? 1 / rtf : 0;
      const text = data.text || "";

      return {
        preset: presetKey,
        presetLabel: presetInfo.label,
        api: "/transcribe",
        audioDuration: dur,
        processingTime: pt,
        wallTime,
        rtf,
        speedX,
        text,
        wordCount: text.split(/\s+/).filter(Boolean).length,
        model: data.model || "",
        fastMode: presetKey !== "accurate",
        status: "success",
      };
    } catch (err) {
      return {
        preset: presetKey, presetLabel: presetInfo.label, api: "/transcribe",
        audioDuration: 0, processingTime: 0, wallTime: (performance.now() - wallStart) / 1000,
        rtf: 0, speedX: 0, text: "", wordCount: 0, model: "", fastMode: false,
        status: "error", error: String(err),
      };
    }
  }, []);

  // ─── Run full benchmark ────────────────────────────────────────────────────

  const runBenchmark = useCallback(async () => {
    abortRef.current = false;
    setRunning(true);
    setResults([]);
    setProgress(0);

    const ready = await checkServer();
    if (!ready) {
      toast({ title: "❌ שרת CUDA לא זמין", description: "הפעל את שרת התמלול לפני הרצת הבנצ'מארק", variant: "destructive" });
      setRunning(false);
      return;
    }

    const audioBlob = userAudio || createTestWav(5);
    const presetKeys = ["fast", "balanced", "accurate"];
    const newResults: BenchmarkResult[] = [];

    for (let i = 0; i < presetKeys.length; i++) {
      if (abortRef.current) break;

      setProgress(((i) / presetKeys.length) * 100);
      const result = await runSinglePreset(presetKeys[i], audioBlob);
      if (result) {
        newResults.push(result);
        setResults([...newResults]);
      }
    }

    setProgress(100);
    setCurrentPreset(null);
    setRunning(false);

    if (newResults.length > 0) {
      toast({ title: "✅ בנצ'מארק הושלם", description: `${newResults.filter(r => r.status === "success").length}/${presetKeys.length} ערכות הושלמו בהצלחה` });
    }
  }, [checkServer, runSinglePreset, userAudio]);

  const stopBenchmark = useCallback(() => {
    abortRef.current = true;
  }, []);

  // ─── Derived data ──────────────────────────────────────────────────────────

  const successResults = results.filter(r => r.status === "success");
  const fastest = successResults.length > 0
    ? successResults.reduce((a, b) => a.processingTime < b.processingTime ? a : b)
    : null;
  const bestQuality = successResults.length > 0
    ? successResults.reduce((a, b) => a.wordCount > b.wordCount ? a : b)
    : null;

  const filteredResults = activeTab === "all"
    ? results
    : results.filter(r => r.preset === activeTab);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4" dir="rtl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" />
            בנצ'מארק תמלול
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            השוואת מהירות ואיכות בין כל ערכות התמלול
          </p>
        </div>
        <div className="flex gap-2">
          {running ? (
            <Button variant="destructive" size="sm" onClick={stopBenchmark}>
              <XCircle className="w-4 h-4 ml-1" /> עצור
            </Button>
          ) : (
            <Button onClick={runBenchmark} size="sm" className="gap-1">
              <Play className="w-4 h-4 ml-1" /> הרץ בנצ'מארק
            </Button>
          )}
        </div>
      </div>

      {/* Server Status */}
      {serverStatus && (
        <Card className="p-3 border-primary/20 bg-primary/5">
          <div className="flex items-center gap-4 text-sm flex-wrap">
            <Badge variant="outline" className="gap-1">
              {serverStatus.ready ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <XCircle className="w-3 h-3 text-red-500" />}
              {serverStatus.ready ? "מוכן" : "לא מוכן"}
            </Badge>
            <span>🖥️ {serverStatus.gpu}</span>
            <span>📦 {serverStatus.model}</span>
            <span>💾 {serverStatus.vram}</span>
          </div>
        </Card>
      )}

      {/* Upload custom audio */}
      <Card className="p-3">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-medium">קובץ בדיקה:</span>
          <input
            type="file"
            accept="audio/*"
            className="text-xs"
            onChange={(e) => setUserAudio(e.target.files?.[0] ?? null)}
          />
          {userAudio ? (
            <Badge variant="outline" className="gap-1">
              {userAudio.name} ({(userAudio.size / 1024).toFixed(0)} KB)
            </Badge>
          ) : (
            <span className="text-muted-foreground">אודיו סינטטי (5 שניות)</span>
          )}
        </div>
      </Card>

      {/* Progress */}
      {running && (
        <Card className="p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>
              מריץ ערכה: <strong>{PRESETS.find(p => p.key === currentPreset)?.label || "..."}</strong>
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </Card>
      )}

      {/* Winners Cards */}
      {successResults.length >= 2 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Fastest */}
          {fastest && (
            <Card className="p-4 border-amber-500/30 bg-amber-500/5">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-5 h-5 text-amber-500" />
                <span className="font-bold text-amber-700 dark:text-amber-400">הכי מהיר</span>
                <Trophy className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-2xl font-bold">{fmtSpeed(fastest.speedX)}</div>
              <div className="text-sm text-muted-foreground">
                {PRESETS.find(p => p.key === fastest.preset)?.label} — {fmtTime(fastest.processingTime)}
              </div>
            </Card>
          )}

          {/* Best Quality */}
          {bestQuality && (
            <Card className="p-4 border-emerald-500/30 bg-emerald-500/5">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-5 h-5 text-emerald-500" />
                <span className="font-bold text-emerald-700 dark:text-emerald-400">הכי איכותי</span>
                <Trophy className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-2xl font-bold">{bestQuality.wordCount} מילים</div>
              <div className="text-sm text-muted-foreground">
                {PRESETS.find(p => p.key === bestQuality.preset)?.label} — {fmtTime(bestQuality.processingTime)}
              </div>
            </Card>
          )}

          {/* Best Balance (speed × words) */}
          {(() => {
            const scored = successResults.map(r => ({ ...r, score: r.speedX * (r.wordCount || 1) }));
            const best = scored.reduce((a, b) => a.score > b.score ? a : b);
            return (
              <Card className="p-4 border-blue-500/30 bg-blue-500/5">
                <div className="flex items-center gap-2 mb-2">
                  <Scale className="w-5 h-5 text-blue-500" />
                  <span className="font-bold text-blue-700 dark:text-blue-400">האיזון הטוב ביותר</span>
                  <Trophy className="w-4 h-4 text-blue-500" />
                </div>
                <div className="text-2xl font-bold">{fmtSpeed(best.speedX)} · {best.wordCount} מילים</div>
                <div className="text-sm text-muted-foreground">
                  {PRESETS.find(p => p.key === best.preset)?.label}
                </div>
              </Card>
            );
          })()}
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start" dir="rtl">
          <TabsTrigger value="all" className="gap-1">
            <BarChart3 className="w-3.5 h-3.5" /> הכל
          </TabsTrigger>
          {PRESETS.map(p => (
            <TabsTrigger key={p.key} value={p.key} className="gap-1">
              {p.icon} {p.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Results Table */}
        <TabsContent value={activeTab} className="mt-3">
          {filteredResults.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">אין תוצאות עדיין</p>
              <p className="text-sm mt-1">לחץ "הרץ בנצ'מארק" כדי להשוות בין הערכות</p>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <ScrollArea className="max-h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right w-24">ערכה</TableHead>
                      <TableHead className="text-right">אודיו</TableHead>
                      <TableHead className="text-right">
                        <div className="flex items-center gap-1">
                          <Timer className="w-3 h-3" /> עיבוד GPU
                        </div>
                      </TableHead>
                      <TableHead className="text-right">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" /> זמן כולל
                        </div>
                      </TableHead>
                      <TableHead className="text-right">
                        <div className="flex items-center gap-1">
                          <Zap className="w-3 h-3" /> מהירות
                        </div>
                      </TableHead>
                      <TableHead className="text-right">מילים</TableHead>
                      <TableHead className="text-right">fast_mode</TableHead>
                      <TableHead className="text-right">סטטוס</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredResults.map((r, i) => {
                      const isFastest = fastest?.preset === r.preset && r.status === "success";
                      const isBestQ = bestQuality?.preset === r.preset && r.status === "success";
                      return (
                        <TableRow key={i} className={isFastest ? "bg-amber-500/5" : isBestQ ? "bg-emerald-500/5" : ""}>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              {PRESETS.find(p => p.key === r.preset)?.icon}
                              <span className="font-medium text-sm">{r.presetLabel}</span>
                              {isFastest && <Zap className="w-3 h-3 text-amber-500" />}
                              {isBestQ && <Target className="w-3 h-3 text-emerald-500" />}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{r.audioDuration.toFixed(1)}s</TableCell>
                          <TableCell>
                            <span className="font-mono text-sm font-medium">
                              {fmtTime(r.processingTime)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="font-mono text-sm text-muted-foreground">
                              {fmtTime(r.wallTime)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={speedBadgeClass(r.speedX)}>
                              {fmtSpeed(r.speedX)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{r.wordCount}</TableCell>
                          <TableCell>
                            {r.fastMode ? (
                              <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30 text-xs">✅</Badge>
                            ) : (
                              <Badge variant="outline" className="bg-gray-500/10 text-gray-500 border-gray-500/30 text-xs">❌</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {r.status === "success" ? (
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-500" />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Speed Comparison Bars */}
      {successResults.length >= 2 && (
        <Card className="p-4 space-y-3">
          <h3 className="font-bold flex items-center gap-2">
            <ArrowUpDown className="w-4 h-4" /> השוואת מהירות
          </h3>
          {(() => {
            const maxSpeed = Math.max(...successResults.map(r => r.speedX));
            return successResults.map((r, i) => {
              const pct = maxSpeed > 0 ? (r.speedX / maxSpeed) * 100 : 0;
              const preset = PRESETS.find(p => p.key === r.preset);
              return (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-1.5">
                      {preset?.icon}
                      <span className="font-medium">{preset?.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`font-mono font-bold ${speedColor(r.speedX)}`}>
                        {fmtSpeed(r.speedX)}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        ({fmtTime(r.processingTime)})
                      </span>
                    </div>
                  </div>
                  <div className="h-5 bg-muted/50 rounded-md overflow-hidden relative">
                    <div
                      className={`h-full rounded-md transition-all duration-700 ${
                        r.preset === "fast" ? "bg-amber-500/70" :
                        r.preset === "balanced" ? "bg-blue-500/70" :
                        "bg-emerald-500/70"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                    {fastest?.preset === r.preset && (
                      <span className="absolute right-2 top-0.5 text-xs font-bold">🏆</span>
                    )}
                  </div>
                </div>
              );
            });
          })()}
        </Card>
      )}

      {/* Timing Comparison */}
      {successResults.length >= 2 && (
        <Card className="p-4 space-y-3">
          <h3 className="font-bold flex items-center gap-2">
            <Timer className="w-4 h-4" /> השוואת זמנים (שניות)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {successResults.map((r, i) => {
              const preset = PRESETS.find(p => p.key === r.preset);
              const speedDiffVsFastest = fastest && r !== fastest
                ? ((r.processingTime - fastest.processingTime) / fastest.processingTime * 100)
                : 0;
              return (
                <Card key={i} className={`p-3 ${preset?.key === "fast" ? "border-amber-500/30" : preset?.key === "balanced" ? "border-blue-500/30" : "border-emerald-500/30"}`}>
                  <div className="flex items-center gap-1.5 mb-2">
                    {preset?.icon}
                    <span className="font-bold text-sm">{preset?.label}</span>
                  </div>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">עיבוד GPU:</span>
                      <span className="font-mono font-bold">{fmtTime(r.processingTime)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">זמן כולל:</span>
                      <span className="font-mono">{fmtTime(r.wallTime)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">אודיו:</span>
                      <span className="font-mono">{r.audioDuration.toFixed(1)}s</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">מהירות:</span>
                      <Badge variant="outline" className={speedBadgeClass(r.speedX)}>
                        {fmtSpeed(r.speedX)}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">RTF:</span>
                      <span className="font-mono text-xs">{r.rtf.toFixed(4)}</span>
                    </div>
                    {speedDiffVsFastest > 0 && (
                      <div className="text-xs text-red-500 text-left">
                        +{speedDiffVsFastest.toFixed(0)}% לעומת המהיר ביותר
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </Card>
      )}

      {/* Transcribed Text Comparison */}
      {successResults.length >= 2 && (
        <Card className="p-4 space-y-3">
          <h3 className="font-bold flex items-center gap-2">
            <Target className="w-4 h-4" /> השוואת טקסט מתומלל
          </h3>
          <div className="space-y-3">
            {successResults.map((r, i) => {
              const preset = PRESETS.find(p => p.key === r.preset);
              return (
                <div key={i} className="space-y-1">
                  <div className="flex items-center gap-1.5 text-sm">
                    {preset?.icon}
                    <span className="font-medium">{preset?.label}</span>
                    <Badge variant="outline" className="text-xs">{r.wordCount} מילים</Badge>
                  </div>
                  <div className="p-2 rounded bg-muted/30 text-sm leading-relaxed font-serif min-h-[2.5rem]" dir="rtl">
                    {r.text || <span className="text-muted-foreground italic">(ריק — אין דיבור באודיו)</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Preset Info Cards */}
      <Card className="p-4 space-y-3">
        <h3 className="font-bold">📋 פירוט ערכות</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {PRESETS.map(p => (
            <Card key={p.key} className="p-3">
              <div className="flex items-center gap-1.5 mb-1">
                {p.icon}
                <span className={`font-bold ${p.color}`}>{p.label}</span>
              </div>
              <p className="text-xs text-muted-foreground">{p.description}</p>
            </Card>
          ))}
        </div>
      </Card>
    </div>
  );
}
