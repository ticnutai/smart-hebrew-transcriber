import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  clearEnhanceQueueCompleted,
  getEnhanceQueueJobs,
  onEnhanceQueueUpdate,
  removeEnhanceQueueJob,
  type EnhanceQueueJob,
} from "@/lib/audioEnhanceQueue";
import AudioEnhanceDialog from "@/components/AudioEnhanceDialog";
import { toast } from "@/hooks/use-toast";
import {
  AudioLines,
  Download,
  FileAudio,
  FileStack,
  Loader2,
  Mic,
  Scissors,
  Sparkles,
  TestTube2,
  Trash2,
  WandSparkles,
} from "lucide-react";

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export default function VoiceStudio() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [enhanceDialogOpen, setEnhanceDialogOpen] = useState(false);
  const [enhanceQueueJobs, setEnhanceQueueJobs] = useState<EnhanceQueueJob[]>(() => getEnhanceQueueJobs());

  useEffect(() => {
    return onEnhanceQueueUpdate((jobs) => {
      setEnhanceQueueJobs(jobs);
    });
  }, []);

  const onPickFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSourceFile(file);
    if (file) {
      toast({
        title: "הקובץ נטען לסטודיו",
        description: "לחץ על 'פתח חלון שיפור' כדי להתחיל שיפור מסודר",
      });
    }
    e.target.value = "";
  }, []);

  const handleDownloadEnhancedQueueJob = useCallback((job: EnhanceQueueJob) => {
    if (!job.outputFile) return;
    const url = URL.createObjectURL(job.outputFile);
    const a = document.createElement("a");
    a.href = url;
    a.download = job.outputFile.name;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleTranscribeEnhancedQueueJob = useCallback((job: EnhanceQueueJob) => {
    if (!job.outputFile) return;
    navigate("/transcribe", { state: { file: job.outputFile } });
  }, [navigate]);

  const queueStats = useMemo(() => {
    return {
      total: enhanceQueueJobs.length,
      active: enhanceQueueJobs.filter((j) => j.status === "enhancing").length,
      queued: enhanceQueueJobs.filter((j) => j.status === "queued").length,
      done: enhanceQueueJobs.filter((j) => j.status === "done").length,
      errors: enhanceQueueJobs.filter((j) => j.status === "error").length,
    };
  }, [enhanceQueueJobs]);

  return (
    <div className="container max-w-6xl mx-auto px-4 py-6 space-y-6" dir="rtl">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <AudioLines className="w-6 h-6 text-primary" />
            סטודיו קול
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            מערכת מסודרת לכל שיפור איכות הקול לצורך תמלול ובכללי: ניקוי רעשים, תור שיפור רקע, בדיקות איכות וקיצורי זרימה.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1"><WandSparkles className="w-3.5 h-3.5" /> AI + Auto EQ</Badge>
          <Badge variant="outline">Real-time Filters</Badge>
          <Badge variant="outline">Batch Queue</Badge>
          <Badge variant="outline">Transcription Quality Tests</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              שיפור קובץ בקליק
            </CardTitle>
            <CardDescription>
              העלה קובץ אודיו/וידאו ופתח את חלון השיפור עם כל המצבים: AI Voice, ניקוי קלאסי, פורמטי יצוא ותמלול מיידי.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button className="gap-2" onClick={() => fileInputRef.current?.click()}>
                <FileAudio className="w-4 h-4" />
                בחר קובץ לשיפור
              </Button>
              {sourceFile && (
                <Button variant="outline" className="gap-2" onClick={() => setEnhanceDialogOpen(true)}>
                  <Sparkles className="w-4 h-4" />
                  פתח חלון שיפור
                </Button>
              )}
              <Input
                ref={fileInputRef}
                type="file"
                accept="audio/*,video/*"
                className="hidden"
                onChange={onPickFile}
              />
            </div>

            {sourceFile ? (
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-sm font-medium truncate">{sourceFile.name}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(sourceFile.size)}</p>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
                לא נבחר קובץ עדיין. לחץ על "בחר קובץ לשיפור" כדי להתחיל.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileStack className="w-4 h-4 text-primary" />
              זרימות עבודה
            </CardTitle>
            <CardDescription>מעבר מהיר לכלים המתקדמים שכבר קיימים במערכת.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-between" onClick={() => navigate("/video-to-mp3")}>ממיר + חיתוך + שיפור <Scissors className="w-4 h-4" /></Button>
            <Button variant="outline" className="w-full justify-between" onClick={() => navigate("/benchmark")}>בדיקת איכות תמלול (A/B) <TestTube2 className="w-4 h-4" /></Button>
            <Button variant="outline" className="w-full justify-between" onClick={() => navigate("/transcribe")}>תמלול מיידי מקובץ <Mic className="w-4 h-4" /></Button>
            <Button variant="outline" className="w-full justify-between" onClick={() => navigate("/text-editor")}>עריכה + פילטרים בזמן אמת <AudioLines className="w-4 h-4" /></Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              תור שיפור רקע ({queueStats.total})
            </span>
            <div className="flex items-center gap-1">
              {queueStats.active > 0 && (
                <Badge variant="default" className="text-[10px] gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {queueStats.active} פעילים
                </Badge>
              )}
              {queueStats.queued > 0 && <Badge variant="outline" className="text-[10px]">{queueStats.queued} בתור</Badge>}
              {(queueStats.done > 0 || queueStats.errors > 0) && (
                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={clearEnhanceQueueCompleted}>
                  נקה הסתיימו
                </Button>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {enhanceQueueJobs.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              אין כרגע משימות בתור. אפשר להוסיף מתפריט השיפור של קובץ.
            </div>
          ) : (
            <div className="space-y-2">
              {enhanceQueueJobs.slice(0, 20).map((job) => (
                <div key={job.id} className="flex items-center justify-between gap-2 border rounded-lg px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{job.sourceName}</p>
                    <p className="text-xs text-muted-foreground">
                      {job.preset === "ai_voice" ? "AI Voice" : "Auto EQ"} • {job.outputFormat.toUpperCase()}
                      {job.error ? ` • ${job.error}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {job.status === "queued" && <Badge variant="outline" className="text-[10px]">בתור</Badge>}
                    {job.status === "enhancing" && (
                      <Badge variant="default" className="text-[10px] gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        משפר
                      </Badge>
                    )}
                    {job.status === "error" && <Badge variant="destructive" className="text-[10px]">שגיאה</Badge>}
                    {job.status === "done" && (
                      <>
                        <Badge variant="secondary" className="text-[10px]">הושלם</Badge>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleTranscribeEnhancedQueueJob(job)}>
                          <Mic className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleDownloadEnhancedQueueJob(job)}>
                          <Download className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                    {job.status !== "enhancing" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => removeEnhanceQueueJob(job.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AudioEnhanceDialog
        open={enhanceDialogOpen}
        onOpenChange={(open) => {
          setEnhanceDialogOpen(open);
          if (!open) {
            setSourceFile(null);
          }
        }}
        file={sourceFile}
        onTranscribe={(file) => navigate("/transcribe", { state: { file } })}
      />
    </div>
  );
}
