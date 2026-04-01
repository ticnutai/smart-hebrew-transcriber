import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  convertToMp3,
  retryJob,
  onJobUpdate,
  revokeJobUrl,
  preloadFFmpeg,
  isSupportedFormat,
  getSupportedExtensions,
  getMaxParallel,
  restorePersistedJobs,
  removePersistedJob,
  type ConversionJob,
} from "@/lib/ffmpegConverter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Upload,
  FileAudio,
  Download,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Music,
  FolderDown,
  Zap,
  Mic,
  Save,
  RefreshCw,
  Cpu,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1) + " " + sizes[i];
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = (ms / 1000).toFixed(1);
  return `${secs}s`;
}

const ACCEPTED_MIME =
  "video/*,audio/*,.mkv,.avi,.mov,.webm,.flv,.wmv,.m4v,.3gp,.ogv,.ts,.mts,.m2ts,.vob,.mpg,.mpeg,.m4a,.wav,.ogg,.flac,.aac,.wma,.opus,.amr";

// ─── Status Badge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ConversionJob["status"] }) {
  const config: Record<ConversionJob["status"], { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ElementType }> = {
    queued: { label: "בתור", variant: "secondary", icon: Clock },
    loading: { label: "טוען FFmpeg", variant: "outline", icon: Loader2 },
    converting: { label: "ממיר...", variant: "default", icon: Zap },
    done: { label: "הושלם", variant: "secondary", icon: CheckCircle2 },
    error: { label: "שגיאה", variant: "destructive", icon: XCircle },
  };
  const c = config[status];
  const Icon = c.icon;
  return (
    <Badge variant={c.variant} className="gap-1 text-xs">
      <Icon className={cn("w-3 h-3", (status === "loading" || status === "converting") && "animate-spin")} />
      {c.label}
    </Badge>
  );
}

// ─── Job Card ────────────────────────────────────────────────────────────────

function JobCard({
  job,
  onRemove,
  onTranscribe,
  onSaveAndTranscribe,
  onRetry,
}: {
  job: ConversionJob;
  onRemove: (id: string) => void;
  onTranscribe: (job: ConversionJob) => void;
  onSaveAndTranscribe: (job: ConversionJob) => void;
  onRetry: (job: ConversionJob) => void;
}) {
  const elapsed =
    job.startedAt && job.finishedAt
      ? formatDuration(job.finishedAt - job.startedAt)
      : job.startedAt
        ? formatDuration(Date.now() - job.startedAt)
        : null;

  const outputFilename = job.fileName.replace(/\.[^/.]+$/, "") + ".mp3";

  return (
    <Card className="relative overflow-hidden" data-testid="job-card" data-status={job.status}>
      {(job.status === "converting" || job.status === "loading") && (
        <div
          className="absolute bottom-0 left-0 h-1 bg-primary/60 transition-all duration-300"
          style={{ width: `${job.progress}%` }}
        />
      )}
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3" dir="rtl">
          {/* Info */}
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="rounded-lg bg-primary/10 p-2 shrink-0">
              {job.status === "done" ? (
                <Music className="w-5 h-5 text-green-500" />
              ) : (
                <FileAudio className="w-5 h-5 text-primary" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate text-sm">{job.fileName}</p>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                <span>{formatBytes(job.fileSize)}</span>
                {job.outputBlob && (
                  <>
                    <span>→</span>
                    <span className="text-green-600">{formatBytes(job.outputBlob.size)}</span>
                  </>
                )}
                {elapsed && <span>• {elapsed}</span>}
                {job.retryCount > 0 && <span>• ניסיון {job.retryCount + 1}</span>}
              </div>
              {(job.status === "converting" || job.status === "loading") && (
                <div className="flex items-center gap-2 mt-2">
                  <Progress value={job.progress} className="h-2 flex-1" />
                  <span className="text-xs font-mono text-muted-foreground w-9 text-left">{job.progress}%</span>
                </div>
              )}
              {job.error && (
                <p className="text-xs text-destructive mt-1">{job.error}</p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <StatusBadge status={job.status} />
            {job.status === "done" && job.outputUrl && (
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-green-600 hover:text-green-700"
                  title="שמור + תמלל + ענן"
                  onClick={() => onSaveAndTranscribe(job)}
                >
                  <Save className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-primary hover:text-primary"
                  title="תמלול"
                  onClick={() => onTranscribe(job)}
                >
                  <Mic className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" asChild>
                  <a href={job.outputUrl} download={outputFilename}>
                    <Download className="w-4 h-4" />
                  </a>
                </Button>
              </>
            )}
            {job.status === "error" && onRetry && (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-orange-500 hover:text-orange-600"
                title="נסה שוב"
                onClick={() => onRetry(job)}
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            )}
            {(job.status === "done" || job.status === "error") && (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => onRemove(job.id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function VideoToMp3() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [jobs, setJobs] = useState<ConversionJob[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [ffmpegReady, setFfmpegReady] = useState(false);
  const [promptJob, setPromptJob] = useState<ConversionJob | null>(null);
  const [saveAndTranscribeBusyId, setSaveAndTranscribeBusyId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const toMp3File = useCallback((job: ConversionJob): File | null => {
    if (!job.outputBlob) return null;
    const mp3Name = job.fileName.replace(/\.[^/.]+$/, "") + ".mp3";
    return new File([job.outputBlob], mp3Name, { type: "audio/mpeg" });
  }, []);

  const uploadMp3ToCloud = useCallback(async (file: File): Promise<string | null> => {
    if (!isAuthenticated || !user) return null;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${user.id}/${Date.now()}_${safeName}`;

    const { error } = await supabase.storage
      .from("permanent-audio")
      .upload(filePath, file, { cacheControl: "3600", upsert: false });

    if (error) throw error;
    return filePath;
  }, [isAuthenticated, user]);

  // Preload FFmpeg on mount + restore persisted jobs
  useEffect(() => {
    preloadFFmpeg()
      .then(() => setFfmpegReady(true))
      .catch(() => {
        // Will load on first conversion
      });

    // Restore any persisted jobs from previous session
    restorePersistedJobs().then((restored) => {
      if (restored.length > 0) {
        setJobs((prev) => [...prev, ...restored]);
        toast({ title: `${restored.length} המרות שוחזרו מהפעלה קודמת` });
      }
    });
  }, []);

  // Listen to job updates + auto-show prompt on completion
  useEffect(() => {
    const unsub = onJobUpdate((updatedJob) => {
      setJobs((prev) => {
        const idx = prev.findIndex((j) => j.id === updatedJob.id);
        if (idx === -1) return prev;
        const next = [...prev];
        next[idx] = updatedJob;
        return next;
      });

      if (updatedJob.status === "done") {
        setPromptJob(updatedJob);
      }
    });
    return unsub;
  }, []);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      jobs.forEach(revokeJobUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const valid: File[] = [];
    const invalid: string[] = [];

    for (const f of fileArray) {
      if (isSupportedFormat(f.name)) {
        valid.push(f);
      } else {
        invalid.push(f.name);
      }
    }

    if (invalid.length > 0) {
      toast({
        title: "פורמט לא נתמך",
        description: invalid.join(", "),
        variant: "destructive",
      });
    }

    if (valid.length === 0) return;

    const newJobs = valid.map((f) => convertToMp3(f));
    setJobs((prev) => [...newJobs, ...prev]);
  }, []);

  const handleRemove = useCallback((id: string) => {
    setJobs((prev) => {
      const job = prev.find((j) => j.id === id);
      if (job) revokeJobUrl(job);
      return prev.filter((j) => j.id !== id);
    });
    removePersistedJob(id);
  }, []);

  const handleDownloadAll = useCallback(() => {
    const doneJobs = jobs.filter((j) => j.status === "done" && j.outputUrl);
    for (const job of doneJobs) {
      const a = document.createElement("a");
      a.href = job.outputUrl!;
      a.download = job.fileName.replace(/\.[^/.]+$/, "") + ".mp3";
      a.click();
    }
  }, [jobs]);

  const handleClearDone = useCallback(() => {
    setJobs((prev) => {
      const toRemove = prev.filter((j) => j.status === "done" || j.status === "error");
      toRemove.forEach((j) => {
        revokeJobUrl(j);
        removePersistedJob(j.id);
      });
      return prev.filter((j) => j.status !== "done" && j.status !== "error");
    });
  }, []);

  // Navigate to transcription page with the converted MP3
  const handleTranscribe = useCallback((job: ConversionJob) => {
    const mp3File = toMp3File(job);
    if (!mp3File) return;
    navigate("/transcribe", { state: { file: mp3File } });
  }, [navigate, toMp3File]);

  // Download the MP3 file
  const handleSaveMp3 = useCallback((job: ConversionJob) => {
    if (!job.outputUrl) return;
    const a = document.createElement("a");
    a.href = job.outputUrl;
    a.download = job.fileName.replace(/\.[^/.]+$/, "") + ".mp3";
    a.click();
    setPromptJob(null);
    toast({ title: "הקובץ נשמר ✓" });
  }, []);

  const handleSaveAndTranscribe = useCallback(async (job: ConversionJob) => {
    const mp3File = toMp3File(job);
    if (!mp3File || !job.outputUrl) return;

    setSaveAndTranscribeBusyId(job.id);
    try {
      // Keep an explicit local copy for the user before moving to transcription.
      const a = document.createElement("a");
      a.href = job.outputUrl;
      a.download = mp3File.name;
      a.click();

      if (isAuthenticated) {
        try {
          await uploadMp3ToCloud(mp3File);
          toast({ title: "הקובץ נשמר והועלה לענן ✓" });
        } catch {
          toast({
            title: "התמלול ימשיך, אבל העלאה לענן נכשלה",
            description: "ניתן לנסות להעלות שוב מתוך מסך התמלול",
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "הקובץ נשמר מקומית",
          description: "כדי להעלות גם לענן יש להתחבר לחשבון",
        });
      }

      navigate("/transcribe", { state: { file: mp3File } });
      setPromptJob(null);
    } finally {
      setSaveAndTranscribeBusyId(null);
    }
  }, [isAuthenticated, navigate, toMp3File, uploadMp3ToCloud]);

  // Retry a failed conversion
  const handleRetry = useCallback((job: ConversionJob) => {
    if (!job.file) {
      toast({ title: "לא ניתן לנסות שוב — הקובץ המקורי לא זמין", variant: "destructive" });
      return;
    }
    const updatedJob = retryJob(job, job.file);
    setJobs((prev) => prev.map((j) => (j.id === updatedJob.id ? updatedJob : j)));
  }, []);

  // Drag & Drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles]
  );

  const stats = {
    total: jobs.length,
    done: jobs.filter((j) => j.status === "done").length,
    active: jobs.filter((j) => j.status === "converting" || j.status === "loading").length,
    queued: jobs.filter((j) => j.status === "queued").length,
    errors: jobs.filter((j) => j.status === "error").length,
  };

  return (
    <div className="container max-w-4xl mx-auto py-6 px-4 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Music className="w-6 h-6 text-primary" />
            ממיר וידאו ל-MP3
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            המרה מהירה בדפדפן — ללא העלאה לשרת. תומך ב-{getSupportedExtensions().length}+ פורמטים.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <Cpu className="w-3 h-3" />
            {getMaxParallel()} מקבילים
          </Badge>
          <Badge variant={ffmpegReady ? "secondary" : "outline"} className="gap-1">
            {ffmpegReady ? (
              <><CheckCircle2 className="w-3 h-3 text-green-500" /> מוכן</>
            ) : (
              <><Loader2 className="w-3 h-3 animate-spin" /> טוען מנוע...</>
            )}
          </Badge>
        </div>
      </div>

      {/* Drop Zone */}
      <div
        ref={dropZoneRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-200",
          isDragging
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
        )}
      >
        <Upload className={cn("w-10 h-10 mx-auto mb-3", isDragging ? "text-primary" : "text-muted-foreground")} />
        <p className="font-medium text-lg">
          {isDragging ? "שחרר כאן..." : "גרור קבצים לכאן או לחץ לבחירה"}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          MP4, MKV, AVI, MOV, WebM, FLV, WAV, FLAC, OGG ועוד
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_MIME}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* Stats & Actions */}
      {jobs.length > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">
              {stats.done}/{stats.total} הושלמו
            </span>
            {stats.active > 0 && (
              <Badge variant="default" className="gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                {stats.active} פעילים
              </Badge>
            )}
            {stats.queued > 0 && (
              <Badge variant="outline">{stats.queued} בתור</Badge>
            )}
            {stats.errors > 0 && (
              <Badge variant="destructive">{stats.errors} שגיאות</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {stats.done > 1 && (
              <Button variant="outline" size="sm" onClick={handleDownloadAll} className="gap-1">
                <FolderDown className="w-4 h-4" />
                הורד הכל ({stats.done})
              </Button>
            )}
            {(stats.done > 0 || stats.errors > 0) && (
              <Button variant="ghost" size="sm" onClick={handleClearDone} className="gap-1 text-muted-foreground">
                <Trash2 className="w-4 h-4" />
                נקה מושלמים
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Job List */}
      {jobs.length > 0 && (
        <ScrollArea className="max-h-[calc(100vh-420px)]">
          <div className="space-y-2 pb-2">
            {jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                onRemove={handleRemove}
                onTranscribe={setPromptJob}
                onSaveAndTranscribe={(j) => void handleSaveAndTranscribe(j)}
                onRetry={handleRetry}
              />
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Empty State */}
      {jobs.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-center text-muted-foreground">
              אין קבצים בתור
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center pb-6">
            <div className="flex justify-center gap-2 flex-wrap text-xs">
              {["MP4", "MKV", "AVI", "MOV", "WebM", "FLV", "WAV", "FLAC", "OGG", "M4A", "WMV", "3GP"].map((ext) => (
                <Badge key={ext} variant="outline" className="text-xs">
                  {ext}
                </Badge>
              ))}
              <Badge variant="outline" className="text-xs">+עוד</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              ⚡ ההמרה רצה לגמרי בדפדפן שלך באמצעות FFmpeg WebAssembly — הקבצים לא עוזבים את המחשב
            </p>
          </CardContent>
        </Card>
      )}

      {/* Post-conversion prompt dialog */}
      <Dialog open={!!promptJob} onOpenChange={(open) => !open && setPromptJob(null)}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              ההמרה הושלמה!
            </DialogTitle>
            <DialogDescription className="text-right">
              <span className="font-medium">{promptJob?.fileName.replace(/\.[^/.]+$/, "")}.mp3</span>
              {promptJob?.outputBlob && (
                <span className="text-muted-foreground"> ({formatBytes(promptJob.outputBlob.size)})</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            מה תרצה לעשות עם הקובץ?
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-2">
            <Button
              className="gap-2 flex-1"
              disabled={!promptJob || saveAndTranscribeBusyId === promptJob?.id}
              onClick={() => {
                if (promptJob) void handleSaveAndTranscribe(promptJob);
              }}
            >
              {saveAndTranscribeBusyId === promptJob?.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              שמור + תמלל + ענן
            </Button>
            <Button
              className="gap-2 flex-1"
              onClick={() => {
                if (promptJob) handleTranscribe(promptJob);
              }}
            >
              <Mic className="w-4 h-4" />
              תמלל את הקובץ
            </Button>
            <Button
              variant="outline"
              className="gap-2 flex-1"
              onClick={() => {
                if (promptJob) handleSaveMp3(promptJob);
              }}
            >
              <Save className="w-4 h-4" />
              שמור כ-MP3
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
