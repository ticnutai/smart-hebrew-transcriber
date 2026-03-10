import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { FolderUp, Files, Play, X, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

type FileStatus = "pending" | "processing" | "done" | "error";

interface BatchFile {
  file: File;
  status: FileStatus;
  progress: number;
  error?: string;
}

interface BatchUploaderProps {
  onTranscribeFile: (file: File, onProgress: (p: number) => void) => Promise<string>;
  onSaveTranscript: (text: string, engine: string, title: string) => Promise<void>;
  engineName: string;
  isDisabled?: boolean;
  concurrency?: number;
}

function isAudioOrVideo(file: File): boolean {
  if (file.type.startsWith("audio/") || file.type.startsWith("video/")) return true;
  const ext = file.name.toLowerCase().split(".").pop() || "";
  return ["mp3", "wav", "m4a", "ogg", "flac", "aac", "wma", "opus", "mp4", "webm", "avi", "mov", "mkv", "wmv"].includes(ext);
}

export function BatchUploader({ onTranscribeFile, onSaveTranscript, engineName, isDisabled, concurrency = 3 }: BatchUploaderProps) {
  const [files, setFiles] = useState<BatchFile[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [summary, setSummary] = useState<{ done: number; errors: number } | null>(null);
  const abortRef = useRef(false);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((fileList: FileList | null) => {
    if (!fileList) return;
    const audioFiles = Array.from(fileList).filter(isAudioOrVideo);
    if (audioFiles.length === 0) return;
    setFiles((prev) => [
      ...prev,
      ...audioFiles.map((f) => ({ file: f, status: "pending" as FileStatus, progress: 0 })),
    ]);
    setSummary(null);
  }, []);

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const clearAll = () => {
    if (isRunning) return;
    setFiles([]);
    setSummary(null);
  };

  const processFile = async (index: number): Promise<boolean> => {
    if (abortRef.current) return false;

    const batch = files[index];
    if (!batch || batch.status === "done") return true;

    setFiles((prev) => prev.map((f, idx) => idx === index ? { ...f, status: "processing", progress: 0, error: undefined } : f));

    // Retry up to 3 times for rate limits
    for (let attempt = 0; attempt < 3; attempt++) {
      if (abortRef.current) return false;
      try {
        const text = await onTranscribeFile(batch.file, (p) => {
          setFiles((prev) => prev.map((f, idx) => idx === index ? { ...f, progress: p } : f));
        });

        const title = batch.file.name.replace(/\.[^/.]+$/, "");
        await onSaveTranscript(text, engineName, title);

        setFiles((prev) => prev.map((f, idx) => idx === index ? { ...f, status: "done", progress: 100 } : f));
        return true;
      } catch (err: any) {
        const msg = err?.message || '';
        const retryAfter = err?.retryAfter || 60;
        
        if (msg === 'RATE_LIMIT' && attempt < 2) {
          // Wait and retry
          setFiles((prev) => prev.map((f, idx) => idx === index 
            ? { ...f, error: `ממתין ${retryAfter}ש' (rate limit)...`, progress: 0 } 
            : f));
          await new Promise(r => setTimeout(r, retryAfter * 1000));
          continue;
        }

        const errorMsg = err instanceof Error ? err.message : "שגיאה לא ידועה";
        setFiles((prev) => prev.map((f, idx) => idx === index ? { ...f, status: "error", error: errorMsg } : f));
        return false;
      }
    }
  };


  const startProcessing = async () => {
    if (isRunning || files.length === 0) return;
    setIsRunning(true);
    abortRef.current = false;
    setSummary(null);

    // Build list of indices to process
    const indices = files.map((f, i) => ({ i, status: f.status }))
      .filter(x => x.status !== "done")
      .map(x => x.i);

    let done = files.filter(f => f.status === "done").length;
    let errors = 0;
    let nextIdx = 0;

    async function worker() {
      while (nextIdx < indices.length && !abortRef.current) {
        const idx = indices[nextIdx++];
        const success = await processFile(idx);
        if (success) done++;
        else errors++;
      }
    }

    const workers = Array.from(
      { length: Math.min(concurrency, indices.length) },
      () => worker()
    );
    await Promise.all(workers);

    setSummary({ done, errors });
    setIsRunning(false);
  };

  const stopProcessing = () => {
    abortRef.current = true;
  };

  const pendingCount = files.filter((f) => f.status === "pending").length;
  const doneCount = files.filter((f) => f.status === "done").length;
  const totalProgress = files.length > 0 ? Math.round((doneCount / files.length) * 100) : 0;

  return (
    <Card dir="rtl">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Files className="w-5 h-5" />
          העלאה מרובה / תיקיה
          <Badge variant="outline" className="text-xs">עד {concurrency} במקביל</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 flex-wrap">
          <input
            ref={folderInputRef}
            type="file"
            className="hidden"
            // @ts-ignore
            webkitdirectory=""
            multiple
            onChange={(e) => addFiles(e.target.files)}
          />
          <input
            ref={filesInputRef}
            type="file"
            className="hidden"
            multiple
            accept="audio/*,video/*,.mp3,.wav,.m4a,.ogg,.flac,.aac,.mp4,.webm,.avi,.mov"
            onChange={(e) => addFiles(e.target.files)}
          />
          <Button variant="outline" onClick={() => folderInputRef.current?.click()} disabled={isRunning || isDisabled}>
            <FolderUp className="w-4 h-4 ml-2" />
            העלה תיקיה
          </Button>
          <Button variant="outline" onClick={() => filesInputRef.current?.click()} disabled={isRunning || isDisabled}>
            <Files className="w-4 h-4 ml-2" />
            בחר קבצים
          </Button>

          {files.length > 0 && !isRunning && (
            <>
              <Button onClick={startProcessing} disabled={pendingCount === 0 && doneCount === files.length}>
                <Play className="w-4 h-4 ml-2" />
                התחל תמלול ({pendingCount > 0 ? pendingCount : files.length - doneCount})
              </Button>
              <Button variant="ghost" size="sm" onClick={clearAll}>
                נקה הכל
              </Button>
            </>
          )}

          {isRunning && (
            <Button variant="destructive" onClick={stopProcessing}>
              <X className="w-4 h-4 ml-2" />
              עצור
            </Button>
          )}
        </div>

        {files.length > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{doneCount} / {files.length} הושלמו</span>
              <span>{totalProgress}%</span>
            </div>
            <Progress value={totalProgress} />
          </div>
        )}

        {files.length > 0 && (
          <div className="max-h-64 overflow-y-auto space-y-2">
            {files.map((bf, i) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-muted/50 text-sm">
                {bf.status === "pending" && <Badge variant="secondary" className="shrink-0">ממתין</Badge>}
                {bf.status === "processing" && <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />}
                {bf.status === "done" && <CheckCircle className="w-4 h-4 text-primary shrink-0" />}
                {bf.status === "error" && <AlertCircle className="w-4 h-4 text-destructive shrink-0" />}

                <span className="truncate flex-1" title={bf.file.name}>{bf.file.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {(bf.file.size / 1024 / 1024).toFixed(1)}MB
                </span>

                {bf.status === "processing" && (
                  <div className="w-16">
                    <Progress value={bf.progress} className="h-2" />
                  </div>
                )}

                {bf.status === "error" && (
                  <span className="text-xs text-destructive truncate max-w-[120px]" title={bf.error}>
                    {bf.error}
                  </span>
                )}

                {!isRunning && bf.status !== "processing" && (
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => removeFile(i)}>
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {summary && (
          <div className="p-3 rounded-md bg-muted text-sm flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-primary" />
            <span>
              הושלם: {summary.done} הצליחו
              {summary.errors > 0 && <>, <span className="text-destructive">{summary.errors} נכשלו</span></>}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
