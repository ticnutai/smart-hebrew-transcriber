import { useState, useCallback, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Rabbit, Turtle, Scale, Play, Loader2, Trophy, Zap, Target,
  Timer, BarChart3, ArrowUpDown, CheckCircle2, XCircle, Clock, Download,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { enhanceAudioOnServer, type EnhancementOutputFormat, type EnhancementPreset } from "@/lib/audioEnhancement";
import { extractAudioSegment, probeAudioDurationSec } from "@/lib/audioSegment";

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

interface QualityCompareResult {
  id: string;
  preset?: EnhancementPreset;
  label: string;
  isBaseline: boolean;
  status: "success" | "error";
  text: string;
  wordCount: number;
  avgProbability: number;
  duration: number;
  processingTime: number;
  error?: string;
}

import { getServerUrl } from "@/lib/serverConfig";

// ─── Constants ───────────────────────────────────────────────────────────────

const SERVER = getServerUrl();

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

const ENHANCE_PRESETS: Array<{ id: EnhancementPreset; label: string; description: string }> = [
  { id: "clean", label: "נקי", description: "שיפור עדין ללא AI" },
  { id: "podcast", label: "פודקאסט", description: "EQ לדיבור טבעי" },
  { id: "broadcast", label: "שידור", description: "צליל מודגש וצפוף" },
  { id: "ai_voice", label: "AI Voice", description: "ניקוי קולי אגרסיבי" },
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
  const [qualityRunning, setQualityRunning] = useState(false);
  const [qualityProgress, setQualityProgress] = useState(0);
  const [sampleStartSec, setSampleStartSec] = useState("0");
  const [sampleDurationSec, setSampleDurationSec] = useState("120");
  const [qualityLanguage, setQualityLanguage] = useState("he");
  const [qualityOutputFormat, setQualityOutputFormat] = useState<EnhancementOutputFormat>("mp3");
  const [qualitySelectedPresets, setQualitySelectedPresets] = useState<EnhancementPreset[]>(["ai_voice", "clean"]);
  const [qualityResults, setQualityResults] = useState<QualityCompareResult[]>([]);
  const [qualityWordWeight, setQualityWordWeight] = useState("30");
  const [qualityConfidenceWeight, setQualityConfidenceWeight] = useState("55");
  const [qualitySpeedWeight, setQualitySpeedWeight] = useState("15");
  const [winnerBusy, setWinnerBusy] = useState(false);
  const [sampleInfo, setSampleInfo] = useState<{ sourceDuration: number; usedStart: number; usedEnd: number } | null>(null);
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

  const transcribeOnce = useCallback(async (file: File, language: string): Promise<QualityCompareResult> => {
    const form = new FormData();
    form.append("file", file, file.name);
    form.append("language", language);
    form.append("preset", "balanced");

    const started = performance.now();
    const resp = await fetch(`${SERVER}/transcribe`, { method: "POST", body: form });
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    const data = await resp.json();
    const wordTimings = Array.isArray(data.wordTimings) ? data.wordTimings : [];
    const avgProbability = wordTimings.length > 0
      ? wordTimings.reduce((sum: number, w: any) => sum + (Number(w?.probability) || 0), 0) / wordTimings.length
      : 0;
    const text = String(data.text || "");

    return {
      id: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      preset: undefined,
      label: "",
      isBaseline: false,
      status: "success",
      text,
      wordCount: text.split(/\s+/).filter(Boolean).length,
      avgProbability,
      duration: Number(data.duration) || 0,
      processingTime: Number(data.processing_time) || (performance.now() - started) / 1000,
    };
  }, []);

  const runQualityComparison = useCallback(async () => {
    if (!userAudio) {
      toast({ title: "בחר קובץ אודיו לבדיקה", variant: "destructive" });
      return;
    }
    if (qualitySelectedPresets.length === 0) {
      toast({ title: "בחר לפחות פריסט שיפור אחד", variant: "destructive" });
      return;
    }

    const ready = await checkServer();
    if (!ready) {
      toast({ title: "שרת לא זמין", description: "לא ניתן להריץ בדיקת השפעת שיפור", variant: "destructive" });
      return;
    }

    setQualityRunning(true);
    setQualityProgress(0);
    setQualityResults([]);
    abortRef.current = false;

    try {
      const sourceDuration = await probeAudioDurationSec(userAudio);
      const start = Math.min(Math.max(0, Number(sampleStartSec) || 0), Math.max(0, sourceDuration - 5));
      const requestedDuration = Math.max(5, Number(sampleDurationSec) || 120);
      const end = Math.min(sourceDuration, start + requestedDuration);
      const sampleFile = await extractAudioSegment(userAudio, start, end);
      setSampleInfo({ sourceDuration, usedStart: start, usedEnd: end });

      const totalSteps = 1 + qualitySelectedPresets.length;
      let completed = 0;

      const baseline = await transcribeOnce(sampleFile, qualityLanguage);
      const baselineResult: QualityCompareResult = {
        ...baseline,
        id: "baseline",
        preset: undefined,
        label: "מקור (ללא שיפור)",
        isBaseline: true,
      };
      setQualityResults([baselineResult]);
      completed += 1;
      setQualityProgress((completed / totalSteps) * 100);

      const nextResults: QualityCompareResult[] = [baselineResult];

      for (const preset of qualitySelectedPresets) {
        if (abortRef.current) break;
        try {
          const enhanced = await enhanceAudioOnServer(sampleFile, {
            preset,
            outputFormat: qualityOutputFormat,
          });
          const enhancedFile = new File([enhanced.blob], enhanced.fileName, { type: enhanced.mimeType });
          const transcribed = await transcribeOnce(enhancedFile, qualityLanguage);
          nextResults.push({
            ...transcribed,
            id: `${preset}_${Date.now()}`,
            preset,
            label: `משופר: ${ENHANCE_PRESETS.find((p) => p.id === preset)?.label || preset}`,
            isBaseline: false,
          });
        } catch (err: any) {
          nextResults.push({
            id: `${preset}_${Date.now()}`,
            preset,
            label: `משופר: ${ENHANCE_PRESETS.find((p) => p.id === preset)?.label || preset}`,
            isBaseline: false,
            status: "error",
            text: "",
            wordCount: 0,
            avgProbability: 0,
            duration: 0,
            processingTime: 0,
            error: err?.message || "שגיאה לא ידועה",
          });
        }
        completed += 1;
        setQualityProgress((completed / totalSteps) * 100);
        setQualityResults([...nextResults]);
      }

      const successful = nextResults.filter((r) => r.status === "success");
      if (successful.length > 1) {
        const baselineOk = successful.find((r) => r.isBaseline) || null;
        const winner = baselineOk
          ? successful
              .filter((r) => !r.isBaseline)
              .sort((a, b) => {
                const wa = Number(qualityWordWeight) || 0;
                const ca = Number(qualityConfidenceWeight) || 0;
                const sa = Number(qualitySpeedWeight) || 0;
                const total = Math.max(1, wa + ca + sa);

                const calcScore = (r: QualityCompareResult) => {
                  const wordDeltaPct = ((r.wordCount - baselineOk.wordCount) / Math.max(1, baselineOk.wordCount)) * 100;
                  const confDeltaPct = (r.avgProbability - baselineOk.avgProbability) * 100;
                  const speedDeltaPct = ((baselineOk.processingTime - r.processingTime) / Math.max(0.001, baselineOk.processingTime)) * 100;
                  return ((wa * wordDeltaPct) + (ca * confDeltaPct) + (sa * speedDeltaPct)) / total;
                };

                return calcScore(b) - calcScore(a);
              })[0]
          : undefined;
        if (winner) {
          toast({
            title: "בדיקת איכות הושלמה",
            description: `הטוב ביותר: ${winner.label}`,
          });
        }
      } else {
        toast({ title: "הבדיקה הסתיימה", description: "לא היו מספיק תוצאות להשוואה" });
      }
    } catch (err: any) {
      toast({
        title: "בדיקת איכות נכשלה",
        description: err?.message || "תקלה לא ידועה",
        variant: "destructive",
      });
    } finally {
      setQualityRunning(false);
    }
  }, [
    userAudio,
    qualitySelectedPresets,
    checkServer,
    sampleStartSec,
    sampleDurationSec,
    qualityLanguage,
    qualityOutputFormat,
    transcribeOnce,
    qualityWordWeight,
    qualityConfidenceWeight,
    qualitySpeedWeight,
  ]);

  const computeQualityScore = useCallback((row: QualityCompareResult, baseline: QualityCompareResult | null) => {
    if (!baseline || row.status !== "success" || row.isBaseline) return 0;
    const wordW = Number(qualityWordWeight) || 0;
    const confW = Number(qualityConfidenceWeight) || 0;
    const speedW = Number(qualitySpeedWeight) || 0;
    const total = Math.max(1, wordW + confW + speedW);

    const wordDeltaPct = ((row.wordCount - baseline.wordCount) / Math.max(1, baseline.wordCount)) * 100;
    const confDeltaPct = (row.avgProbability - baseline.avgProbability) * 100;
    const speedDeltaPct = ((baseline.processingTime - row.processingTime) / Math.max(0.001, baseline.processingTime)) * 100;

    return ((wordW * wordDeltaPct) + (confW * confDeltaPct) + (speedW * speedDeltaPct)) / total;
  }, [qualityWordWeight, qualityConfidenceWeight, qualitySpeedWeight]);

  const qualityBaseline = qualityResults.find((r) => r.isBaseline && r.status === "success") || null;
  const qualityWinner = qualityResults
    .filter((r) => !r.isBaseline && r.status === "success" && !!r.preset)
    .sort((a, b) => computeQualityScore(b, qualityBaseline) - computeQualityScore(a, qualityBaseline))[0] || null;

  const applyWinnerToFullFile = useCallback(async () => {
    if (!userAudio || !qualityWinner?.preset) {
      toast({ title: "אין זוכה ישים כרגע", description: "הרץ קודם בדיקת איכות עם לפחות פריסט אחד" });
      return;
    }
    setWinnerBusy(true);
    try {
      const enhanced = await enhanceAudioOnServer(userAudio, {
        preset: qualityWinner.preset,
        outputFormat: qualityOutputFormat,
      });
      const file = new File([enhanced.blob], enhanced.fileName, { type: enhanced.mimeType });
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
      toast({
        title: "הזוכה הוחל על הקובץ המלא",
        description: `${qualityWinner.label} • ${file.name}`,
      });
    } catch (err: any) {
      toast({
        title: "החלת הזוכה נכשלה",
        description: err?.message || "תקלה לא ידועה",
        variant: "destructive",
      });
    } finally {
      setWinnerBusy(false);
    }
  }, [qualityOutputFormat, qualityWinner, userAudio]);

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

      {/* Enhancement impact quality test */}
      <Card className="p-4 space-y-3 border-primary/25">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h3 className="font-bold flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              בדיקת השפעת שיפור על הצלחת התמלול
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              מריץ תמלול על המקור מול קבצים משופרים, על דגימה שתבחר (למשל 120 שניות)
            </p>
          </div>
          <div className="flex items-center gap-2">
            {qualityRunning ? (
              <Button variant="destructive" size="sm" onClick={() => { abortRef.current = true; }}>
                <XCircle className="w-4 h-4 ml-1" /> עצור בדיקת איכות
              </Button>
            ) : (
              <Button size="sm" className="gap-1" onClick={runQualityComparison}>
                <Play className="w-4 h-4 ml-1" /> הרץ בדיקת איכות
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">התחלת דגימה (שניות)</Label>
            <Input type="number" min="0" value={sampleStartSec} onChange={(e) => setSampleStartSec(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">אורך דגימה (שניות)</Label>
            <Input type="number" min="5" value={sampleDurationSec} onChange={(e) => setSampleDurationSec(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">שפת תמלול</Label>
            <Input value={qualityLanguage} onChange={(e) => setQualityLanguage(e.target.value || "he")} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">פורמט פלט משופר</Label>
            <div className="flex gap-1">
              {(["mp3", "opus", "aac"] as EnhancementOutputFormat[]).map((fmt) => (
                <Button
                  key={fmt}
                  size="sm"
                  variant={qualityOutputFormat === fmt ? "default" : "outline"}
                  onClick={() => setQualityOutputFormat(fmt)}
                  className="flex-1"
                >
                  {fmt.toUpperCase()}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">פריסטים להשוואה</Label>
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setQualitySelectedPresets(ENHANCE_PRESETS.map((p) => p.id))}
            >
              בחר הכל
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setQualitySelectedPresets([])}
            >
              נקה בחירה
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ENHANCE_PRESETS.map((preset) => {
              const selected = qualitySelectedPresets.includes(preset.id);
              return (
                <Button
                  key={preset.id}
                  size="sm"
                  variant={selected ? "default" : "outline"}
                  onClick={() => {
                    setQualitySelectedPresets((prev) => (
                      prev.includes(preset.id)
                        ? prev.filter((p) => p !== preset.id)
                        : [...prev, preset.id]
                    ));
                  }}
                >
                  {preset.label}
                </Button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {ENHANCE_PRESETS.filter((p) => qualitySelectedPresets.includes(p.id)).map((p) => p.description).join(" • ") || "לא נבחרו פריסטים"}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">משקל מילים (%)</Label>
            <Input type="number" min="0" max="100" value={qualityWordWeight} onChange={(e) => setQualityWordWeight(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">משקל ביטחון (%)</Label>
            <Input type="number" min="0" max="100" value={qualityConfidenceWeight} onChange={(e) => setQualityConfidenceWeight(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">משקל מהירות (%)</Label>
            <Input type="number" min="0" max="100" value={qualitySpeedWeight} onChange={(e) => setQualitySpeedWeight(e.target.value)} />
          </div>
        </div>

        {qualityWinner && (
          <div className="border rounded-lg p-2 bg-primary/5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">זוכה מומלץ: {qualityWinner.label}</span>
                <Badge variant="secondary" className="text-[10px]">
                  ציון {computeQualityScore(qualityWinner, qualityBaseline).toFixed(2)}
                </Badge>
              </div>
              <Button
                size="sm"
                className="gap-1"
                onClick={() => void applyWinnerToFullFile()}
                disabled={winnerBusy || !userAudio}
              >
                {winnerBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                החל זוכה על קובץ מלא והורד
              </Button>
            </div>
          </div>
        )}

        {qualityRunning && <Progress value={qualityProgress} className="h-2" />}

        {sampleInfo && (
          <div className="text-xs text-muted-foreground">
            אורך מקור: {sampleInfo.sourceDuration.toFixed(1)}s • נבדק טווח: {sampleInfo.usedStart.toFixed(1)}s → {sampleInfo.usedEnd.toFixed(1)}s
          </div>
        )}

        {qualityResults.length > 0 && (() => {
          const baseline = qualityResults.find((r) => r.isBaseline && r.status === "success") || null;
          return (
            <div className="space-y-2">
              {qualityResults.map((r) => {
                const deltaWords = baseline ? r.wordCount - baseline.wordCount : 0;
                const deltaProb = baseline ? r.avgProbability - baseline.avgProbability : 0;
                const isImproved = !r.isBaseline && r.status === "success" && baseline && (deltaWords > 0 || deltaProb > 0);
                const weightedScore = computeQualityScore(r, baseline);
                return (
                  <div key={r.id} className="border rounded-lg p-2 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium">{r.label}</span>
                        {r.status === "success" ? (
                          <Badge variant="outline" className="text-[10px]">OK</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">שגיאה</Badge>
                        )}
                        {isImproved && <Badge className="text-[10px]">שיפור</Badge>}
                      </div>
                      {r.status === "success" && (
                        <div className="text-xs text-muted-foreground">
                          {r.processingTime.toFixed(2)}s
                        </div>
                      )}
                    </div>

                    {r.status === "success" ? (
                      <div className="flex flex-wrap gap-2 text-xs">
                        <Badge variant="secondary">מילים: {r.wordCount}</Badge>
                        <Badge variant="secondary">ביטחון ממוצע: {(r.avgProbability * 100).toFixed(1)}%</Badge>
                        {!r.isBaseline && baseline && (
                          <>
                            <Badge variant="outline">Δ מילים: {deltaWords >= 0 ? "+" : ""}{deltaWords}</Badge>
                            <Badge variant="outline">Δ ביטחון: {deltaProb >= 0 ? "+" : ""}{(deltaProb * 100).toFixed(1)}%</Badge>
                            <Badge variant="outline">ציון משוקלל: {weightedScore.toFixed(2)}</Badge>
                          </>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-destructive">{r.error}</p>
                    )}

                    {r.text && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {r.text}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
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
      <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
        <TabsList className="w-full justify-start">
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
