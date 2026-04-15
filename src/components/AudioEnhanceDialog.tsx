import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Mic, Download, Loader2 } from "lucide-react";
import { SyncAudioPlayer } from "@/components/SyncAudioPlayer";
import { toast } from "@/hooks/use-toast";
import {
  enhanceAudioOnServer,
  type EnhancementOutputFormat,
  type EnhancementPreset,
} from "@/lib/audioEnhancement";
import { submitEnhanceJob } from "@/lib/audioEnhanceQueue";

interface AudioEnhanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: File | null;
  sourceLabel?: string;
  onTranscribe?: (file: File) => void;
  defaultOutputFormat?: EnhancementOutputFormat;
}

const PRESET_OPTIONS: Array<{ id: EnhancementPreset; label: string; description: string; ai: boolean }> = [
  { id: "clean", label: "נקי", description: "שיפור קלאסי ללא AI", ai: false },
  { id: "podcast", label: "פודקאסט", description: "חם ומאוזן לדיבור", ai: false },
  { id: "broadcast", label: "שידור", description: "צליל הדוק וברור", ai: false },
  { id: "ai_voice", label: "AI Voice", description: "ניקוי ודגש קולי אגרסיבי", ai: true },
];

const OUTPUT_OPTIONS: Array<{ id: EnhancementOutputFormat; label: string; ext: string }> = [
  { id: "mp3", label: "MP3", ext: ".mp3" },
  { id: "opus", label: "OPUS", ext: ".opus" },
  { id: "aac", label: "AAC", ext: ".m4a" },
];

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export default function AudioEnhanceDialog({
  open,
  onOpenChange,
  file,
  sourceLabel,
  onTranscribe,
  defaultOutputFormat = "mp3",
}: AudioEnhanceDialogProps) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [preset, setPreset] = useState<EnhancementPreset>("ai_voice");
  const [outputFormat, setOutputFormat] = useState<EnhancementOutputFormat>(defaultOutputFormat);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhancedFile, setEnhancedFile] = useState<File | null>(null);
  const [enhancedUrl, setEnhancedUrl] = useState<string | null>(null);

  useEffect(() => {
    setOutputFormat(defaultOutputFormat);
  }, [defaultOutputFormat, open]);

  useEffect(() => {
    setEnhancedFile((prev) => {
      if (prev) {
        // no-op; URL cleanup handled separately
      }
      return null;
    });
    setEnhancedUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, [file, preset, outputFormat, open]);

  useEffect(() => {
    if (!file || !open) {
      setAudioUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }

    const nextUrl = URL.createObjectURL(file);
    setAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return nextUrl;
    });

    return () => {
      URL.revokeObjectURL(nextUrl);
    };
  }, [file, open]);

  const title = useMemo(() => {
    if (sourceLabel?.trim()) return sourceLabel.trim();
    return file?.name || "קובץ אודיו";
  }, [file?.name, sourceLabel]);

  const handleDownload = () => {
    if (!audioUrl || !file) return;
    const a = document.createElement("a");
    a.href = audioUrl;
    a.download = file.name;
    a.click();
  };

  const handleDownloadEnhanced = () => {
    if (!enhancedUrl || !enhancedFile) return;
    const a = document.createElement("a");
    a.href = enhancedUrl;
    a.download = enhancedFile.name;
    a.click();
  };

  const runEnhancement = async (opts: { downloadAfter?: boolean; transcribeAfter?: boolean }) => {
    if (!file) return;
    setIsEnhancing(true);
    try {
      const result = await enhanceAudioOnServer(file, {
        preset,
        outputFormat,
      });
      const nextFile = new File([result.blob], result.fileName, { type: result.mimeType });
      const nextUrl = URL.createObjectURL(nextFile);

      setEnhancedFile(nextFile);
      setEnhancedUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return nextUrl;
      });

      toast({ title: "הקובץ שופר בהצלחה ✓", description: `${nextFile.name} (${formatBytes(nextFile.size)})` });

      if (opts.downloadAfter) {
        const a = document.createElement("a");
        a.href = nextUrl;
        a.download = nextFile.name;
        a.click();
      }

      if (opts.transcribeAfter && onTranscribe) {
        onTranscribe(nextFile);
        onOpenChange(false);
      }
    } catch (err: any) {
      toast({
        title: "שיפור הקובץ נכשל",
        description: err?.message || "תקלה לא ידועה",
        variant: "destructive",
      });
    } finally {
      setIsEnhancing(false);
    }
  };

  const enqueueEnhancement = () => {
    if (!file) return;
    submitEnhanceJob(file, { preset, outputFormat });
    toast({
      title: "נוסף לתור שיפור רקע",
      description: `${file.name} • ${preset === "ai_voice" ? "AI Voice" : "Auto EQ"}`,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            שיפור איכות קובץ קולי
          </DialogTitle>
          <DialogDescription className="text-right">
            <span className="font-medium">{title}</span>
            {file && <span className="text-muted-foreground"> ({formatBytes(file.size)})</span>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary">AI Voice</Badge>
            <Badge variant="outline">אקולייזרים אוטומטיים</Badge>
            <Badge variant="outline">מצב ידני מתקדם</Badge>
            <Badge variant="outline">ללא AI (פריסטים רגילים)</Badge>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">מצב שיפור</p>
            <div className="grid grid-cols-2 gap-2">
              {PRESET_OPTIONS.map((p) => (
                <Button
                  key={p.id}
                  variant={preset === p.id ? "default" : "outline"}
                  size="sm"
                  className="justify-start"
                  onClick={() => setPreset(p.id)}
                >
                  {p.label}
                  <span className="mr-2 text-[10px] opacity-80">{p.ai ? "AI" : "Auto"}</span>
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {PRESET_OPTIONS.find((p) => p.id === preset)?.description}
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">פורמט פלט משופר</p>
            <div className="flex flex-wrap gap-2">
              {OUTPUT_OPTIONS.map((o) => (
                <Button
                  key={o.id}
                  variant={outputFormat === o.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setOutputFormat(o.id)}
                >
                  {o.label}
                </Button>
              ))}
            </div>
          </div>

          <SyncAudioPlayer audioUrl={audioUrl} wordTimings={[]} compact />

          {enhancedUrl && enhancedFile && (
            <div className="space-y-2 border rounded-lg p-3 bg-muted/20">
              <p className="text-sm font-medium">תצוגה לקובץ המשופר</p>
              <p className="text-xs text-muted-foreground">{enhancedFile.name} • {formatBytes(enhancedFile.size)}</p>
              <SyncAudioPlayer audioUrl={enhancedUrl} wordTimings={[]} compact />
            </div>
          )}
        </div>

        <DialogFooter className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <Button
            className="gap-2 w-full"
            disabled={!file || isEnhancing}
            onClick={() => void runEnhancement({ transcribeAfter: true })}
          >
            {isEnhancing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            שפר + תמלל
          </Button>
          <Button
            variant="secondary"
            className="gap-2 w-full"
            disabled={!file || isEnhancing}
            onClick={() => void runEnhancement({ downloadAfter: true })}
          >
            {isEnhancing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            שפר + שמור
          </Button>
          <Button
            variant="outline"
            className="gap-2 w-full"
            disabled={!file || isEnhancing}
            onClick={() => void runEnhancement({})}
          >
            {isEnhancing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            שפר בלבד
          </Button>
          <Button
            variant="outline"
            className="gap-2 w-full"
            disabled={!file || isEnhancing}
            onClick={enqueueEnhancement}
          >
            <Sparkles className="w-4 h-4" />
            הוסף לתור רקע
          </Button>
          {onTranscribe && file && (
            <Button
              variant="ghost"
              className="gap-2 w-full"
              onClick={() => {
                onTranscribe(file);
                onOpenChange(false);
              }}
            >
              <Mic className="w-4 h-4" />
              תמלל מקור
            </Button>
          )}
          <Button variant="ghost" className="gap-2 w-full" onClick={handleDownload} disabled={!file || !audioUrl}>
            <Download className="w-4 h-4" />
            שמור מקור
          </Button>
          <Button variant="outline" className="gap-2 w-full" onClick={handleDownloadEnhanced} disabled={!enhancedFile || !enhancedUrl}>
            <Download className="w-4 h-4" />
            הורד משופר
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
