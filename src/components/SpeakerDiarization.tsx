import { useState, useRef, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Users, Upload, Loader2, Copy, Download, BarChart3, Clock, MessageSquare, Mic, Pencil, Check, X, Subtitles } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface DiarizedSegment {
  text: string;
  start: number;
  end: number;
  speaker: string;
  speaker_label: string;
  words?: Array<{ word: string; start: number; end: number; probability: number }>;
}

interface DiarizationResult {
  text: string;
  segments: DiarizedSegment[];
  speakers: string[];
  speaker_count: number;
  duration: number;
  processing_time: number;
  diarization_method: string;
}

interface SpeakerStats {
  label: string;
  totalTime: number;
  percentage: number;
  segmentCount: number;
  wordCount: number;
  avgSegmentLength: number;
  longestSegment: number;
}

const SPEAKER_COLORS = [
  "bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700",
  "bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700",
  "bg-purple-100 dark:bg-purple-900/30 border-purple-300 dark:border-purple-700",
  "bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700",
  "bg-pink-100 dark:bg-pink-900/30 border-pink-300 dark:border-pink-700",
  "bg-cyan-100 dark:bg-cyan-900/30 border-cyan-300 dark:border-cyan-700",
  "bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700",
  "bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700",
  "bg-indigo-100 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-700",
  "bg-teal-100 dark:bg-teal-900/30 border-teal-300 dark:border-teal-700",
];

const SPEAKER_BADGE_COLORS = [
  "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500", "bg-pink-500",
  "bg-cyan-500", "bg-yellow-500", "bg-red-500", "bg-indigo-500", "bg-teal-500",
];

const SPEAKER_BAR_COLORS = [
  "#3b82f6", "#22c55e", "#a855f7", "#f97316", "#ec4899",
  "#06b6d4", "#eab308", "#ef4444", "#6366f1", "#14b8a6",
];

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${Math.round(sec)} שנ׳`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s > 0 ? `${m} דק׳ ${s} שנ׳` : `${m} דק׳`;
}

interface SpeakerDiarizationProps {
  serverUrl?: string;
}

export const SpeakerDiarization = ({ serverUrl = "http://localhost:3000" }: SpeakerDiarizationProps) => {
  const [result, setResult] = useState<DiarizationResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [minGap, setMinGap] = useState(1.5);
  const [hfToken, setHfToken] = useState("");
  const [activeSpeakerFilter, setActiveSpeakerFilter] = useState<string | null>(null);
  const [speakerNames, setSpeakerNames] = useState<Record<string, string>>({});
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get display name for a speaker (custom name or original)
  const getSpeakerName = (originalLabel: string) => speakerNames[originalLabel] || originalLabel;

  const startEditingSpeaker = (label: string) => {
    setEditingSpeaker(label);
    setEditingName(getSpeakerName(label));
  };

  const saveSpeakerName = () => {
    if (!editingSpeaker) return;
    const trimmed = editingName.trim();
    setSpeakerNames(prev => ({
      ...prev,
      [editingSpeaker]: trimmed || editingSpeaker,
    }));
    setEditingSpeaker(null);
    toast({ title: "שם דובר עודכן", description: `${editingSpeaker} → ${trimmed || editingSpeaker}` });
  };

  // Compute speaker statistics
  const speakerStats = useMemo<SpeakerStats[]>(() => {
    if (!result) return [];
    const statsMap: Record<string, { totalTime: number; segmentCount: number; wordCount: number; longestSegment: number }> = {};
    
    for (const seg of result.segments) {
      const key = seg.speaker_label;
      if (!statsMap[key]) {
        statsMap[key] = { totalTime: 0, segmentCount: 0, wordCount: 0, longestSegment: 0 };
      }
      const segDuration = seg.end - seg.start;
      statsMap[key].totalTime += segDuration;
      statsMap[key].segmentCount += 1;
      statsMap[key].wordCount += seg.text.trim().split(/\s+/).filter(Boolean).length;
      if (segDuration > statsMap[key].longestSegment) {
        statsMap[key].longestSegment = segDuration;
      }
    }

    const totalSpeaking = Object.values(statsMap).reduce((sum, s) => sum + s.totalTime, 0);

    return result.speakers.map(sp => {
      const s = statsMap[sp] || { totalTime: 0, segmentCount: 0, wordCount: 0, longestSegment: 0 };
      return {
        label: sp,
        totalTime: s.totalTime,
        percentage: totalSpeaking > 0 ? (s.totalTime / totalSpeaking) * 100 : 0,
        segmentCount: s.segmentCount,
        wordCount: s.wordCount,
        avgSegmentLength: s.segmentCount > 0 ? s.totalTime / s.segmentCount : 0,
        longestSegment: s.longestSegment,
      };
    }).sort((a, b) => b.totalTime - a.totalTime);
  }, [result]);

  // Build speaker index for consistent colors
  const speakerIndex: Record<string, number> = {};
  if (result) {
    result.speakers.forEach((sp, i) => {
      speakerIndex[sp] = i;
    });
  }

  const filteredSegments = useMemo(() => {
    if (!result) return [];
    if (!activeSpeakerFilter) return result.segments;
    return result.segments.filter(s => s.speaker_label === activeSpeakerFilter);
  }, [result, activeSpeakerFilter]);

  const handleDiarize = async (file: File) => {
    setIsProcessing(true);
    setResult(null);
    setActiveSpeakerFilter(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("min_gap", minGap.toString());
      if (hfToken.trim()) {
        formData.append("hf_token", hfToken.trim());
      }

      const resp = await fetch(`${serverUrl}/diarize`, {
        method: "POST",
        body: formData,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Server error" }));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }

      const data: DiarizationResult = await resp.json();
      setResult(data);
      toast({
        title: "זיהוי דוברים הושלם",
        description: `${data.speaker_count} דוברים זוהו ב-${data.processing_time} שניות (${data.diarization_method})`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast({
        title: "שגיאה בזיהוי דוברים",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleDiarize(file);
    e.target.value = "";
  };

  const copyAsText = () => {
    if (!result) return;
    const text = result.segments
      .map(s => `[${getSpeakerName(s.speaker_label)}] (${formatTime(s.start)}) ${s.text}`)
      .join("\n");
    navigator.clipboard.writeText(text);
    toast({ title: "הועתק", description: "התמלול עם דוברים הועתק ללוח" });
  };

  const downloadAsText = () => {
    if (!result) return;
    const header = `זיהוי דוברים — ${result.speaker_count} דוברים | ${formatTime(result.duration)} | ${result.diarization_method}\n`;
    const statsSection = speakerStats.map(s =>
      `${getSpeakerName(s.label)}: ${formatDuration(s.totalTime)} (${Math.round(s.percentage)}%) | ${s.wordCount} מילים | ${s.segmentCount} קטעים`
    ).join("\n");
    const separator = "\n" + "─".repeat(50) + "\n\n";
    const segments = result.segments
      .map(s => `[${getSpeakerName(s.speaker_label)}] (${formatTime(s.start)}-${formatTime(s.end)}) ${s.text}`)
      .join("\n");
    
    const fullText = header + "\n" + statsSection + separator + segments;
    const blob = new Blob([fullText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `diarization-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadAsSrt = () => {
    if (!result) return;
    const pad = (n: number) => n.toString().padStart(2, "0");
    const formatSrt = (sec: number) => {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = Math.floor(sec % 60);
      const ms = Math.round((sec % 1) * 1000);
      return `${pad(h)}:${pad(m)}:${pad(s)},${ms.toString().padStart(3, "0")}`;
    };
    const srt = result.segments.map((seg, i) =>
      `${i + 1}\n${formatSrt(seg.start)} --> ${formatSrt(seg.end)}\n[${getSpeakerName(seg.speaker_label)}] ${seg.text}`
    ).join("\n\n");
    const blob = new Blob(["\uFEFF" + srt], { type: "text/srt;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `diarization-${Date.now()}.srt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="p-6" dir="rtl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Users className="w-5 h-5" />
          זיהוי דוברים
        </h2>
        {result && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={copyAsText}>
              <Copy className="w-4 h-4 ml-1" />
              העתק
            </Button>
            <Button variant="outline" size="sm" onClick={downloadAsText}>
              <Download className="w-4 h-4 ml-1" />
              TXT
            </Button>
            <Button variant="outline" size="sm" onClick={downloadAsSrt}>
              <Subtitles className="w-4 h-4 ml-1" />
              SRT
            </Button>
          </div>
        )}
      </div>

      {/* Settings */}
      <div className="space-y-3 mb-4">
        <div className="flex items-center gap-4">
          <Label className="text-sm whitespace-nowrap min-w-[120px]">שקט מינימלי (שניות)</Label>
          <Slider
            value={[minGap]}
            onValueChange={([v]) => setMinGap(v)}
            min={0.5}
            max={5}
            step={0.5}
            className="flex-1"
          />
          <span className="text-sm text-muted-foreground w-8">{minGap}</span>
        </div>
        <div className="flex items-center gap-4">
          <Label className="text-sm whitespace-nowrap min-w-[120px]">HuggingFace Token</Label>
          <Input
            value={hfToken}
            onChange={e => setHfToken(e.target.value)}
            type="password"
            placeholder="אופציונלי — לזיהוי מתקדם עם pyannote"
            className="flex-1 text-sm"
          />
        </div>
      </div>

      {/* Upload button */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,video/*"
        onChange={handleFileSelect}
        className="hidden"
      />
      <Button
        onClick={() => fileInputRef.current?.click()}
        disabled={isProcessing}
        className="w-full mb-4"
      >
        {isProcessing ? (
          <>
            <Loader2 className="w-4 h-4 ml-2 animate-spin" />
            מזהה דוברים...
          </>
        ) : (
          <>
            <Upload className="w-4 h-4 ml-2" />
            העלה קובץ לזיהוי דוברים
          </>
        )}
      </Button>

      {/* Results */}
      {result && (
        <Tabs defaultValue="stats" className="mt-2">
          <TabsList className="w-full grid grid-cols-3 mb-3">
            <TabsTrigger value="stats" className="text-xs gap-1">
              <BarChart3 className="w-3.5 h-3.5" />
              סטטיסטיקות
            </TabsTrigger>
            <TabsTrigger value="timeline" className="text-xs gap-1">
              <Clock className="w-3.5 h-3.5" />
              ציר זמן
            </TabsTrigger>
            <TabsTrigger value="transcript" className="text-xs gap-1">
              <MessageSquare className="w-3.5 h-3.5" />
              תמלול
            </TabsTrigger>
          </TabsList>

          {/* === Stats Tab === */}
          <TabsContent value="stats" className="space-y-4">
            {/* Summary bar */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
              <span className="font-medium text-foreground">{result.speaker_count} דוברים</span>
              <span>·</span>
              <span>{result.segments.length} קטעים</span>
              <span>·</span>
              <span>{formatTime(result.duration)}</span>
              <span>·</span>
              <span>{result.diarization_method}</span>
            </div>

            {/* Speaker cards */}
            <div className="space-y-3">
              {speakerStats.map((stat) => {
                const colorIdx = speakerIndex[stat.label] ?? 0;
                const barColor = SPEAKER_BAR_COLORS[colorIdx % SPEAKER_BAR_COLORS.length];
                return (
                  <div
                    key={stat.label}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      activeSpeakerFilter === stat.label
                        ? SPEAKER_COLORS[colorIdx % SPEAKER_COLORS.length] + " ring-2 ring-primary/30"
                        : "bg-muted/30 border-border hover:bg-muted/50"
                    }`}
                    onClick={() => setActiveSpeakerFilter(
                      activeSpeakerFilter === stat.label ? null : stat.label
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-3 h-3 rounded-full ${SPEAKER_BADGE_COLORS[colorIdx % SPEAKER_BADGE_COLORS.length]}`} />
                        {editingSpeaker === stat.label ? (
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <Input
                              value={editingName}
                              onChange={e => setEditingName(e.target.value)}
                              className="h-6 text-sm w-28 px-1"
                              autoFocus
                              onKeyDown={e => {
                                if (e.key === "Enter") saveSpeakerName();
                                if (e.key === "Escape") setEditingSpeaker(null);
                              }}
                            />
                            <button onClick={saveSpeakerName} className="text-green-600 hover:text-green-700">
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setEditingSpeaker(null)} className="text-red-500 hover:text-red-600">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className="font-semibold text-sm">{getSpeakerName(stat.label)}</span>
                            <button
                              onClick={e => { e.stopPropagation(); startEditingSpeaker(stat.label); }}
                              className="text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                      <span className="text-lg font-bold" style={{ color: barColor }}>
                        {Math.round(stat.percentage)}%
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full h-2 rounded-full bg-muted mb-2 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${stat.percentage}%`, backgroundColor: barColor }}
                      />
                    </div>

                    {/* Detail stats */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>זמן דיבור: {formatDuration(stat.totalTime)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />
                        <span>{stat.wordCount} מילים</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Mic className="w-3 h-3" />
                        <span>{stat.segmentCount} קטעי דיבור</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <BarChart3 className="w-3 h-3" />
                        <span>ממוצע: {formatDuration(stat.avgSegmentLength)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Combined bar chart */}
            <div className="mt-2">
              <Label className="text-xs text-muted-foreground mb-1 block">חלוקת זמן דיבור</Label>
              <div className="flex h-6 rounded-full overflow-hidden border">
                <TooltipProvider>
                  {speakerStats.map((stat) => {
                    const colorIdx = speakerIndex[stat.label] ?? 0;
                    return (
                      <Tooltip key={stat.label}>
                        <TooltipTrigger asChild>
                          <div
                            className="h-full transition-all duration-500 cursor-pointer hover:opacity-80"
                            style={{
                              width: `${stat.percentage}%`,
                              backgroundColor: SPEAKER_BAR_COLORS[colorIdx % SPEAKER_BAR_COLORS.length],
                              minWidth: stat.percentage > 0 ? "4px" : "0",
                            }}
                          />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{getSpeakerName(stat.label)}: {Math.round(stat.percentage)}% ({formatDuration(stat.totalTime)})</p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </TooltipProvider>
              </div>
            </div>
          </TabsContent>

          {/* === Timeline Tab === */}
          <TabsContent value="timeline" className="space-y-2">
            <div className="text-xs text-muted-foreground mb-2">
              ציר זמן — כל קטע מייצג דובר לאורך ההקלטה ({formatTime(result.duration)})
            </div>
            <div className="space-y-0.5">
              {result.segments.map((seg, i) => {
                const colorIdx = speakerIndex[seg.speaker_label] ?? 0;
                const leftPct = (seg.start / result.duration) * 100;
                const widthPct = Math.max(((seg.end - seg.start) / result.duration) * 100, 0.5);
                return (
                  <TooltipProvider key={i}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="relative h-5 w-full">
                          <div
                            className="absolute h-full rounded-sm cursor-pointer hover:opacity-80 transition-opacity"
                            style={{
                              right: `${leftPct}%`,
                              width: `${widthPct}%`,
                              backgroundColor: SPEAKER_BAR_COLORS[colorIdx % SPEAKER_BAR_COLORS.length],
                              opacity: activeSpeakerFilter && activeSpeakerFilter !== seg.speaker_label ? 0.15 : 0.85,
                            }}
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[250px]">
                        <p className="font-semibold text-xs">{getSpeakerName(seg.speaker_label)}</p>
                        <p className="text-xs">{formatTime(seg.start)} – {formatTime(seg.end)}</p>
                        <p className="text-xs mt-1 line-clamp-2">{seg.text}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })}
            </div>
            {/* Time markers */}
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1 px-0.5" dir="ltr">
              <span>{formatTime(0)}</span>
              <span>{formatTime(result.duration * 0.25)}</span>
              <span>{formatTime(result.duration * 0.5)}</span>
              <span>{formatTime(result.duration * 0.75)}</span>
              <span>{formatTime(result.duration)}</span>
            </div>

            {/* Speaker legend */}
            <div className="flex flex-wrap gap-2 mt-3">
              {result.speakers.map((sp, i) => (
                <button
                  key={sp}
                  className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-all ${
                    activeSpeakerFilter === sp
                      ? "ring-2 ring-primary/40 font-semibold"
                      : "hover:bg-muted/50"
                  }`}
                  onClick={() => setActiveSpeakerFilter(activeSpeakerFilter === sp ? null : sp)}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: SPEAKER_BAR_COLORS[i % SPEAKER_BAR_COLORS.length] }}
                  />
                  {getSpeakerName(sp)}
                </button>
              ))}
              {activeSpeakerFilter && (
                <button
                  className="text-xs text-muted-foreground underline"
                  onClick={() => setActiveSpeakerFilter(null)}
                >
                  הצג הכל
                </button>
              )}
            </div>
          </TabsContent>

          {/* === Transcript Tab === */}
          <TabsContent value="transcript" className="space-y-1">
            {/* Filter chips */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              <button
                className={`text-xs px-2 py-0.5 rounded-full border transition-all ${
                  !activeSpeakerFilter ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"
                }`}
                onClick={() => setActiveSpeakerFilter(null)}
              >
                הכל ({result.segments.length})
              </button>
              {result.speakers.map((sp, i) => {
                const count = result.segments.filter(s => s.speaker_label === sp).length;
                return (
                  <button
                    key={sp}
                    className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-all ${
                      activeSpeakerFilter === sp ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"
                    }`}
                    onClick={() => setActiveSpeakerFilter(activeSpeakerFilter === sp ? null : sp)}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: SPEAKER_BAR_COLORS[i % SPEAKER_BAR_COLORS.length] }}
                    />
                    {getSpeakerName(sp)} ({count})
                  </button>
                );
              })}
            </div>

            <div className="space-y-1 max-h-[500px] overflow-y-auto">
              {filteredSegments.map((seg, i) => {
                const colorIdx = speakerIndex[seg.speaker_label] ?? 0;
                return (
                  <div
                    key={i}
                    className={`p-2 rounded border text-sm ${SPEAKER_COLORS[colorIdx % SPEAKER_COLORS.length]}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full ${SPEAKER_BADGE_COLORS[colorIdx % SPEAKER_BADGE_COLORS.length]}`} />
                      <span className="font-semibold text-xs">{getSpeakerName(seg.speaker_label)}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatTime(seg.start)} – {formatTime(seg.end)}
                      </span>
                      <span className="text-[10px] text-muted-foreground mr-auto">
                        {formatDuration(seg.end - seg.start)}
                      </span>
                    </div>
                    <p className="text-right leading-relaxed">{seg.text}</p>
                  </div>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      )}

      <p className="text-xs text-muted-foreground mt-3">
        זיהוי דוברים מבוסס על הפסקות שקט בין קטעי דיבור. לזיהוי מדויק יותר, הזן HuggingFace Token להפעלת pyannote.
      </p>
    </Card>
  );
};
