import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Users, Upload, Loader2, Copy, Download } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface SpeakerDiarizationProps {
  serverUrl?: string;
}

export const SpeakerDiarization = ({ serverUrl = "http://localhost:8765" }: SpeakerDiarizationProps) => {
  const [result, setResult] = useState<DiarizationResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [minGap, setMinGap] = useState(1.5);
  const [hfToken, setHfToken] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDiarize = async (file: File) => {
    setIsProcessing(true);
    setResult(null);

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
      .map(s => `[${s.speaker_label}] (${formatTime(s.start)}) ${s.text}`)
      .join("\n");
    navigator.clipboard.writeText(text);
    toast({ title: "הועתק", description: "התמלול עם דוברים הועתק ללוח" });
  };

  const downloadAsText = () => {
    if (!result) return;
    const text = result.segments
      .map(s => `[${s.speaker_label}] (${formatTime(s.start)}-${formatTime(s.end)}) ${s.text}`)
      .join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `diarization-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Build speaker index for consistent colors
  const speakerIndex: Record<string, number> = {};
  if (result) {
    result.speakers.forEach((sp, i) => {
      speakerIndex[sp] = i;
    });
  }

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
              הורד
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
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
            <span>{result.speaker_count} דוברים</span>
            <span>·</span>
            <span>{result.segments.length} קטעים</span>
            <span>·</span>
            <span>{formatTime(result.duration)}</span>
            <span>·</span>
            <span>{result.diarization_method}</span>
          </div>

          {/* Speaker legend */}
          <div className="flex flex-wrap gap-2 mb-3">
            {result.speakers.map((sp, i) => (
              <span key={sp} className="flex items-center gap-1 text-xs">
                <span className={`w-3 h-3 rounded-full ${SPEAKER_BADGE_COLORS[i % SPEAKER_BADGE_COLORS.length]}`} />
                {sp}
              </span>
            ))}
          </div>

          {/* Segments */}
          <div className="space-y-1 max-h-[500px] overflow-y-auto">
            {result.segments.map((seg, i) => {
              const colorIdx = speakerIndex[seg.speaker_label] ?? 0;
              return (
                <div
                  key={i}
                  className={`p-2 rounded border text-sm ${SPEAKER_COLORS[colorIdx % SPEAKER_COLORS.length]}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full ${SPEAKER_BADGE_COLORS[colorIdx % SPEAKER_BADGE_COLORS.length]}`} />
                    <span className="font-semibold text-xs">{seg.speaker_label}</span>
                    <span className="text-xs text-muted-foreground">{formatTime(seg.start)}</span>
                  </div>
                  <p className="text-right leading-relaxed">{seg.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-3">
        זיהוי דוברים מבוסס על הפסקות שקט בין קטעי דיבור. לזיהוי מדויק יותר, הזן HuggingFace Token להפעלת pyannote.
      </p>
    </Card>
  );
};
