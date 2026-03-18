import { useState, useEffect, useRef, lazy, Suspense, useCallback, type ChangeEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { TranscriptionEngine } from "@/components/TranscriptionEngine";
import { FileUploader } from "@/components/FileUploader";
import { AudioRecorder } from "@/components/AudioRecorder";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "@/hooks/use-toast";
import { debugLog } from "@/lib/debugLogger";
import { Settings, FileEdit, ChevronDown, X, Zap, Globe, Chrome, Mic, Waves, Server, Cpu, Film, Pause, Play, Square, Copy, Check, Keyboard, Activity, Users } from "lucide-react";
import { PerfMonitorPanel } from "@/components/PerfMonitorPanel";
import { useAuth } from "@/contexts/AuthContext";
import { useCloudPreferences } from "@/hooks/useCloudPreferences";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { KeyboardShortcutsDialog } from "@/components/KeyboardShortcutsDialog";
import { LazyErrorBoundary } from "@/components/LazyErrorBoundary";
import { useTranscriptionEngines } from "@/hooks/useTranscriptionEngines";
import { MAX_AUDIO_SIZE_MB } from "@/lib/videoUtils";

// Lazy-loaded heavy components
const LiveTranscriber = lazy(() => import("@/components/LiveTranscriber").then(m => ({ default: m.LiveTranscriber })));
import type { LiveTranscriptResult } from "@/components/LiveTranscriber";
const TranscriptEditor = lazy(() => import("@/components/TranscriptEditor").then(m => ({ default: m.TranscriptEditor })));
const CloudTranscriptHistory = lazy(() => import("@/components/CloudTranscriptHistory").then(m => ({ default: m.CloudTranscriptHistory })));
const TranscriptSummary = lazy(() => import("@/components/TranscriptSummary").then(m => ({ default: m.TranscriptSummary })));
const ShareTranscript = lazy(() => import("@/components/ShareTranscript").then(m => ({ default: m.ShareTranscript })));
const TextStyleControl = lazy(() => import("@/components/TextStyleControl").then(m => ({ default: m.TextStyleControl })));
const LocalModelManager = lazy(() => import("@/components/LocalModelManager").then(m => ({ default: m.LocalModelManager })));
const BackgroundJobsPanel = lazy(() => import("@/components/BackgroundJobsPanel").then(m => ({ default: m.BackgroundJobsPanel })));
const SpeakerDiarization = lazy(() => import("@/components/SpeakerDiarization").then(m => ({ default: m.SpeakerDiarization })));
const YouTubeTranscriber = lazy(() => import("@/components/YouTubeTranscriber").then(m => ({ default: m.YouTubeTranscriber })));

type Engine = 'openai' | 'groq' | 'google' | 'local' | 'local-server' | 'assemblyai' | 'deepgram';
type SourceLanguage = 'auto' | 'he' | 'yi' | 'en';

const Index = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const folderFromUrl = searchParams.get('folder') || undefined;
  const { isAuthenticated } = useAuth();

  // Cloud-synced preferences
  const { preferences, updatePreference, isLoaded: prefsLoaded } = useCloudPreferences();
  const engine = preferences.engine as Engine;
  const sourceLanguage = preferences.source_language as SourceLanguage;
  const fontSize = preferences.font_size;
  const fontFamily = preferences.font_family;
  const textColor = preferences.text_color;
  const lineHeight = preferences.line_height;
  const setEngine = (v: Engine) => updatePreference('engine', v);
  const setSourceLanguage = (v: SourceLanguage) => updatePreference('source_language', v);
  const setFontSize = (v: number) => updatePreference('font_size', v);
  const setFontFamily = (v: string) => updatePreference('font_family', v);
  const setTextColor = (v: string) => updatePreference('text_color', v);
  const setLineHeight = (v: number) => updatePreference('line_height', v);

  const [transcript, setTranscript] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [wordTimings, setWordTimings] = useState<Array<{word: string, start: number, end: number, probability?: number}>>([]);
  const [recoveredPartialInfo, setRecoveredPartialInfo] = useState<{progress: number, wordCount: number, lastSegEnd?: number} | null>(null);
  const [lastStats, setLastStats] = useState<{processing_time: number, rtf: number, compute_type: string, beam_size: number, fast_mode: boolean, file_size: number, duration: number} | null>(null);
  const [copied, setCopied] = useState(false);
  const [diarize, setDiarize] = useState(false);

  const txState = {
    transcript, setTranscript, wordTimings, setWordTimings,
    isUploading, setIsUploading, uploadProgress, setUploadProgress,
    lastStats, setLastStats, audioUrl, setAudioUrl,
    recoveredPartialInfo, setRecoveredPartialInfo, diarize,
  };

  const tx = useTranscriptionEngines(txState, preferences);

  // Audio element ref for queue item playback
  const queueAudioRef = useRef<HTMLAudioElement | null>(null);
  const [queuePlayingId, setQueuePlayingId] = useState<string | null>(null);
  const resumeFileInputRef = useRef<HTMLInputElement | null>(null);

  const {
    isLocalLoading, localProgress, isServerLoading, serverProgress, serverPhase,
    serverConnected, bgTask, transcripts, isCloudLoading, updateTranscript,
    deleteTranscript, deleteAll, isCloud, jobs, submitJob, submitBatchJobs,
    retryJob, deleteJob, localQueue, perfMonitor,
    handleFileSelect, handleCancelTranscription, handleCancelQueueItem,
    handleResumeTranscription, batchSaveTranscript, saveToHistory,
    currentFileRef, lastFileRef, lastSavedTranscriptIdRef, pendingServerFileRef,
    recoverPartial, clearPartial, checkConnection, startPolling, stopPolling,
    addAnalyticsRecord, transcribeWithLocalServer,
  } = tx;

  const isLoading = isUploading || isLocalLoading || isServerLoading || bgTask.isRunning;
  const progress = engine === 'local' ? localProgress : engine === 'local-server' ? serverProgress : (isUploading ? uploadProgress : undefined);
  const [showPerfPanel, setShowPerfPanel] = useState(false);

  useEffect(() => {
    if (engine === 'local-server') { checkConnection(); startPolling(10000); }
    else { stopPolling(); }
    return () => stopPolling();
  }, [engine, checkConnection, startPolling, stopPolling]);

  useEffect(() => {
    const partial = recoverPartial();
    if (partial && partial.text) {
      setTranscript(partial.text);
      setWordTimings(partial.wordTimings || []);
      setRecoveredPartialInfo({ progress: partial.progress, wordCount: partial.wordTimings?.length || 0, lastSegEnd: partial.lastSegEnd });
      toast({ title: "🔄 שוחזר תמלול חלקי", description: `נמצא תמלול שהופסק (${partial.progress}%) — ${partial.wordTimings?.length || 0} מילים` });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-process persistent queue when server comes up
  useEffect(() => {
    if (!serverConnected || engine !== 'local-server') return;
    if (pendingServerFileRef.current) {
      const { file, audioUrl: au } = pendingServerFileRef.current;
      pendingServerFileRef.current = null;
      toast({ title: "\u2705 \u05d4\u05e9\u05e8\u05ea \u05e2\u05dc\u05d4!", description: `\u05de\u05ea\u05d7\u05d9\u05dc \u05ea\u05de\u05dc\u05d5\u05dc: ${file.name}` });
      currentFileRef.current = file;
      bgTask.run(`local-server \u2014 ${file.name}`, async () => { await transcribeWithLocalServer(file, au); }).catch(() => {});
      return;
    }
    const processNextQueueItem = async () => {
      if (localQueue.processingRef.current) return;
      const next = localQueue.getNextPending();
      if (!next) return;
      localQueue.processingRef.current = true;
      await localQueue.updateItemStatus(next.id, 'processing');
      try {
        const blob = await localQueue.getBlob(next.id);
        if (!blob) { await localQueue.updateItemStatus(next.id, 'failed', 'קובץ לא נמצא'); localQueue.processingRef.current = false; return; }
        const file = new File([blob], next.fileName, { type: blob.type });
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('QUEUE_TIMEOUT')), 600000));
        await Promise.race([transcribeWithLocalServer(file, next.audioUrl), timeoutPromise]);
        await localQueue.updateItemStatus(next.id, 'completed');
      } catch (err) {
        const msg = err instanceof Error && err.message === 'QUEUE_TIMEOUT' ? 'תמלול חרג מזמן מקסימלי (10 דקות)' : 'שגיאה בתמלול';
        await localQueue.updateItemStatus(next.id, 'failed', msg);
      } finally {
        localQueue.processingRef.current = false;
        setTimeout(processNextQueueItem, 500);
      }
    };
    processNextQueueItem();
  }, [serverConnected, engine, localQueue.queue]);

  // Keyboard shortcuts
  const [searchOpen, setSearchOpen] = useState(false);
  const shortcutHandler = useCallback((action: 'show-shortcuts' | 'copy-transcript' | 'cancel-transcription' | 'search-transcript') => {
    if (action === 'copy-transcript' && transcript) {
      navigator.clipboard.writeText(transcript).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); toast({ title: "הועתק" }); });
    } else if (action === 'cancel-transcription' && isLoading) { handleCancelTranscription(); }
    else if (action === 'search-transcript') { setSearchOpen(prev => !prev); }
  }, [transcript, isLoading, handleCancelTranscription]);
  const { showHelp, setShowHelp } = useKeyboardShortcuts(shortcutHandler);

  // Elapsed time counter
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval>>();
  const transcribeStartTimeRef = useRef<number>(0);
  const [transcribeElapsed, setTranscribeElapsed] = useState(0);
  useEffect(() => {
    if (isLoading) {
      setElapsedSeconds(0); setTranscribeElapsed(0); transcribeStartTimeRef.current = 0;
      elapsedIntervalRef.current = setInterval(() => {
        setElapsedSeconds(s => s + 1);
        if (transcribeStartTimeRef.current > 0) setTranscribeElapsed(Math.floor((Date.now() - transcribeStartTimeRef.current) / 1000));
      }, 1000);
    } else { clearInterval(elapsedIntervalRef.current); }
    return () => clearInterval(elapsedIntervalRef.current);
  }, [isLoading]);

  useEffect(() => {
    if (engine === 'local-server' && serverPhase === 'transcribing' && transcribeStartTimeRef.current === 0) transcribeStartTimeRef.current = Date.now();
  }, [engine, serverPhase]);

  const handleResumeFilePick = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.currentTarget.value = '';
    if (!picked) return;
    toast({ title: 'נבחר קובץ להמשך', description: picked.name });
    await handleResumeTranscription(picked);
  };

  // Queue item playback
  const handleQueuePlay = async (itemId: string) => {
    if (queuePlayingId === itemId && queueAudioRef.current) {
      queueAudioRef.current.pause(); queueAudioRef.current.currentTime = 0; setQueuePlayingId(null); return;
    }
    const url = await localQueue.getPlaybackUrl(itemId);
    if (!url) { toast({ title: "הקובץ לא נמצא", variant: "destructive" }); return; }
    if (queueAudioRef.current) { queueAudioRef.current.pause(); URL.revokeObjectURL(queueAudioRef.current.src); }
    const audio = new Audio(url);
    audio.onended = () => { setQueuePlayingId(null); URL.revokeObjectURL(url); };
    queueAudioRef.current = audio;
    setQueuePlayingId(itemId);
    audio.play().catch(() => setQueuePlayingId(null));
  };

  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
    <div className="min-h-screen bg-background p-4 md:p-8" dir="rtl">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header with Tabs */}
        <div className="flex items-center justify-between mb-6">
          <div className="text-right flex-1">
            <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              מערכת תמלול מתקדמת
            </h1>
            <p className="text-muted-foreground">
              תמלול חכם של אודיו ווידאו לעברית עם עריכה מונעת AI
            </p>
          </div>
          <div className="flex items-center gap-2">
            <TextStyleControl
              fontSize={fontSize}
              fontFamily={fontFamily}
              textColor={textColor}
              lineHeight={lineHeight}
              onFontSizeChange={setFontSize}
              onFontFamilyChange={setFontFamily}
              onTextColorChange={setTextColor}
              onLineHeightChange={setLineHeight}
            />
            <Button
              variant={perfMonitor.enabled ? "default" : "outline"}
              size="icon"
              onClick={() => {
                perfMonitor.toggle();
                if (!perfMonitor.enabled) setShowPerfPanel(true);
                else setShowPerfPanel(false);
              }}
              title={perfMonitor.enabled ? "מוניטור ביצועים פעיל — לחץ לכיבוי" : "הפעל מוניטור ביצועים"}
              className={perfMonitor.enabled ? "bg-purple-600 hover:bg-purple-700 text-white" : ""}
            >
              <Activity className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              size="icon"
              onClick={() => setShowHelp(true)}
              title="קיצורי מקלדת (?)"
            >
              <Keyboard className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              size="icon"
              onClick={() => navigate("/settings")}
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <Tabs defaultValue="transcribe" className="w-full" dir="rtl">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="transcribe">תמלול</TabsTrigger>
            <TabsTrigger 
              value="edit"
              onClick={() => navigate('/text-editor')}
            >
              <FileEdit className="w-4 h-4 ml-1" />
              עריכת טקסט
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <TranscriptionEngine 
          selected={engine} 
          onChange={setEngine}
          sourceLanguage={sourceLanguage}
          onSourceLanguageChange={setSourceLanguage}
        />

        {(engine === 'assemblyai' || engine === 'deepgram') && (
          <div className="flex items-center gap-2 text-sm" dir="rtl">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={diarize}
                onChange={e => setDiarize(e.target.checked)}
                className="rounded border-gray-300"
              />
              <Users className="w-4 h-4" />
              <span>זיהוי דוברים (Speaker Diarization)</span>
            </label>
          </div>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FileUploader 
            onFileSelect={handleFileSelect} 
            isLoading={isLoading}
            progress={progress}
            engine={engine}
            isAuthenticated={isAuthenticated}
            isCloudEngine={engine !== 'local' && engine !== 'local-server'}
            onSubmitBatch={(files) => submitBatchJobs(files, engine, sourceLanguage)}
            onSaveTranscript={batchSaveTranscript}
            onRetryJob={retryJob}
            onSubmitBackgroundJob={(file) => submitJob(file, engine, sourceLanguage)}
            jobs={jobs}
            maxFileSizeMB={MAX_AUDIO_SIZE_MB}
          />
          <AudioRecorder
            onRecordingComplete={handleFileSelect}
            isTranscribing={isLoading}
            engine={engine}
          />
        </div>

        {/* Recovered partial transcript banner */}
        {recoveredPartialInfo && !isLoading && transcript && (
          <Card className="p-3 border-amber-500/40 bg-amber-500/5" dir="rtl">
            <input
              ref={resumeFileInputRef}
              type="file"
              className="hidden"
              accept="audio/*,video/*,.mp3,.wav,.m4a,.flac,.ogg,.aac,.wma,.mp4,.webm,.avi,.mov,.mkv"
              onChange={handleResumeFilePick}
            />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1 text-destructive border-destructive/40 hover:bg-destructive/10"
                  onClick={() => {
                    clearPartial();
                    setRecoveredPartialInfo(null);
                    setTranscript('');
                    setWordTimings([]);
                    toast({ title: "התמלול החלקי נמחק" });
                  }}
                >
                  <Square className="h-3 w-3" />
                  עצור
                </Button>
                {recoveredPartialInfo.lastSegEnd && (
                  <Button
                    variant="default"
                    size="sm"
                    className="text-xs gap-1"
                    onClick={() => {
                      if (currentFileRef.current || lastFileRef.current) {
                        handleResumeTranscription();
                      } else {
                        resumeFileInputRef.current?.click();
                      }
                    }}
                  >
                    <Play className="h-3 w-3" />
                    {currentFileRef.current || lastFileRef.current ? 'המשך' : 'בחר קובץ והמשך'}
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2 text-right">
                <div>
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                    ⏸ תמלול חלקי ({recoveredPartialInfo.progress}%)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {recoveredPartialInfo.wordCount} מילים{recoveredPartialInfo.lastSegEnd ? ` — עצר ב-${Math.round(recoveredPartialInfo.lastSegEnd)}s` : ''}
                  </p>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Performance Monitor Panel */}
        {perfMonitor.enabled && showPerfPanel && (
          <PerfMonitorPanel
            records={perfMonitor.records}
            onClear={perfMonitor.clearRecords}
            onClose={() => setShowPerfPanel(false)}
          />
        )}

        {/* Transcription stats — shown after CUDA transcription completes */}
        {lastStats && !isLoading && (
          <Card className="p-3 border-green-500/30 bg-green-500/5" dir="rtl">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-6 px-2 text-muted-foreground"
                onClick={() => setLastStats(null)}
              >
                ✕
              </Button>
              <div className="flex flex-wrap gap-3 text-xs text-right">
                <span>⏱ {lastStats.processing_time}s</span>
                <span>📊 RTF={lastStats.rtf}</span>
                <span>📐 {lastStats.compute_type}</span>
                <span>🔍 beam={lastStats.beam_size}</span>
                <span>{lastStats.fast_mode ? '⚡ מהיר' : '🐢 רגיל'}</span>
                <span>📁 {(lastStats.file_size / 1024 / 1024).toFixed(1)}MB</span>
                <span>🎵 {lastStats.duration.toFixed(0)}s</span>
              </div>
            </div>
          </Card>
        )}

        {/* Active transcription progress panel */}
        {isLoading && (
          <Card className="p-4 border-primary/40 bg-primary/5 shadow-sm" dir="rtl">
            <div className="flex items-center gap-3">
              <div className="flex-1 space-y-2.5 text-right">
                {/* Top row: status + engine badge */}
                <div className="flex items-center justify-between">
                  <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${
                    engine === 'groq' ? 'text-primary border-primary/30' :
                    engine === 'google' ? 'text-blue-500 border-blue-500/30' :
                    engine === 'assemblyai' ? 'text-green-500 border-green-500/30' :
                    engine === 'deepgram' ? 'text-purple-500 border-purple-500/30' :
                    engine === 'local-server' ? 'text-purple-500 border-purple-500/30' :
                    engine === 'local' ? 'text-accent border-accent/30' :
                    'text-primary border-primary/30'
                  }`}>
                    {engine === 'groq' && <Zap className="w-3 h-3" />}
                    {engine === 'openai' && <Globe className="w-3 h-3" />}
                    {engine === 'google' && <Chrome className="w-3 h-3" />}
                    {engine === 'assemblyai' && <Mic className="w-3 h-3" />}
                    {engine === 'deepgram' && <Waves className="w-3 h-3" />}
                    {engine === 'local-server' && <Server className="w-3 h-3" />}
                    {engine === 'local' && <Cpu className="w-3 h-3" />}
                    {engine === 'groq' ? 'Groq' : engine === 'openai' ? 'OpenAI' : engine === 'google' ? 'Google' : engine === 'assemblyai' ? 'AssemblyAI' : engine === 'deepgram' ? 'Deepgram' : engine === 'local-server' ? 'CUDA' : 'ONNX'}
                  </span>
                  <span className="font-medium text-sm">
                    {progress !== undefined && progress > 0
                      ? `מתמלל... ${progress}%`
                      : engine === 'local-server' && serverPhase === 'loading-model'
                        ? '⏳ טוען מודל...'
                        : 'מתמלל...'}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="relative h-3 rounded-full bg-muted overflow-hidden">
                  {progress !== undefined && progress > 0 ? (
                    <div
                      className="absolute top-0 right-0 h-full rounded-full bg-primary transition-[width] duration-500 ease-out overflow-hidden"
                      style={{ width: `${Math.max(progress, 3)}%` }}
                    >
                      <div className="absolute top-0 left-0 h-full w-6 bg-white/30 animate-pulse rounded-full" />
                    </div>
                  ) : (
                    <div className="absolute inset-0 rounded-full overflow-hidden">
                      <div className="h-full w-full bg-primary/30 rounded-full" />
                      <div
                        className="absolute top-0 h-full w-1/3 bg-primary/70 rounded-full"
                        style={{ animation: 'transcription-scan 1.6s ease-in-out infinite' }}
                      />
                    </div>
                  )}
                </div>

                {/* Bottom row: timer + ETA */}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {engine === 'local-server' && progress !== undefined && progress >= 5 && progress < 100 && transcribeElapsed > 3 && (() => {
                      const etaSec = Math.round((transcribeElapsed / progress) * (100 - progress));
                      const etaMin = Math.floor(etaSec / 60);
                      const etaSecRem = etaSec % 60;
                      return `נותרו ~${etaMin > 0 ? `${etaMin}:${String(etaSecRem).padStart(2, '0')}` : `${etaSecRem}s`}`;
                    })()}
                  </span>
                  <span className="font-mono tabular-nums">
                    ⏱ {String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:{String(elapsedSeconds % 60).padStart(2, '0')}
                  </span>
                </div>
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0 text-destructive border-destructive/40 hover:bg-destructive/10"
                onClick={handleCancelTranscription}
                title="השהה תמלול"
              >
                <Pause className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        )}

        {/* Live transcript preview during streaming */}
        {isLoading && transcript && (
          <Card className="p-4 border-green-500/30 bg-green-500/5" dir="rtl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground font-mono">
                {transcript.split(/\s+/).filter(Boolean).length} מילים
              </span>
              <h4 className="text-sm font-semibold text-green-700 dark:text-green-400">📝 תמלול חי — מתעדכן בזמן אמת</h4>
            </div>
            <div
              className="max-h-[200px] overflow-y-auto text-sm leading-relaxed text-right p-3 bg-background/60 rounded-md border"
              dir="rtl"
            >
              {transcript}
            </div>
          </Card>
        )}



        {/* Background Jobs Panel */}
        {isAuthenticated && jobs.length > 0 && (
          <BackgroundJobsPanel
            jobs={jobs}
            onRetry={retryJob}
            onDelete={deleteJob}
            onUseResult={(text, eng) => {
              setTranscript(text);
              saveToHistory(text, eng);
            }}
          />
        )}

        {/* Local CUDA Queue Panel */}
        {localQueue.queue.length > 0 && (
          <Card className="p-4 space-y-3" dir="rtl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Server className="w-4 h-4" />
                תור תמלולים מקומי ({localQueue.pendingCount} ממתינים)
              </h3>
              <Button variant="ghost" size="sm" className="text-xs h-6" onClick={localQueue.clearCompleted}>
                נקה הושלמו
              </Button>
            </div>
            {localQueue.queue.map(item => (
              <div key={item.id} className="flex items-center justify-between text-sm border rounded-md p-2">
                <div className="flex items-center gap-2 min-w-0">
                  {item.status === 'pending' && <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />}
                  {item.status === 'processing' && <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse shrink-0" />}
                  {item.status === 'completed' && <span className="h-2 w-2 rounded-full bg-green-400 shrink-0" />}
                  {item.status === 'failed' && <span className="h-2 w-2 rounded-full bg-red-400 shrink-0" />}
                  <span className="truncate">{item.fileName}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {item.status === 'pending' && 'ממתין לשרת'}
                    {item.status === 'processing' && 'מתמלל...'}
                    {item.status === 'completed' && 'הושלם'}
                    {item.status === 'failed' && (item.error || 'נכשל')}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {/* Play / Stop-play button */}
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title={queuePlayingId === item.id ? 'עצור השמעה' : 'נגן'}
                    onClick={() => handleQueuePlay(item.id)}>
                    {queuePlayingId === item.id ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  </Button>
                  {/* Stop transcription (only for processing item) */}
                  {item.status === 'processing' && (
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-orange-500" title="עצור תמלול"
                      onClick={handleCancelQueueItem}>
                      <Pause className="w-3 h-3" />
                    </Button>
                  )}
                  {/* Retry (only for failed items) */}
                  {item.status === 'failed' && (
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-blue-500" title="נסה שוב"
                      onClick={() => localQueue.retryItem(item.id)}>
                      <Zap className="w-3 h-3" />
                    </Button>
                  )}
                  {/* Delete (always available except when processing) */}
                  {item.status !== 'processing' && (
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" title="מחק"
                      onClick={() => localQueue.removeFromQueue(item.id)}>
                      <X className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </Card>
        )}

        {/* Live Transcription */}
        <LazyErrorBoundary label="תמלול חי">
        <LiveTranscriber
          serverConnected={serverConnected}
          onTranscriptComplete={(result: LiveTranscriptResult) => {
            const { text, audioBlob, wordTimings, folder, durationSec } = result;
            setTranscript(text);
            const engineLabel = audioBlob ? 'Live (CUDA Whisper)' : 'Live (Web Speech API)';
            const audioFile = audioBlob
              ? new File([audioBlob], `live-${Date.now()}.webm`, { type: audioBlob.type })
              : undefined;
            saveToHistory(text, engineLabel, undefined, wordTimings, audioFile, folder).then(() => {
              setTimeout(() => navigate('/text-editor', { state: { text, transcriptId: lastSavedTranscriptIdRef.current } }), 1000);
            });
            addAnalyticsRecord({
              engine: engineLabel, status: 'success',
              charCount: text.length, wordCount: text.split(/\s+/).length,
              duration: durationSec,
            });
            toast({ title: "תמלול חי הושלם!", description: audioFile ? "הקלטה + תמלול נשמרו" : undefined });
          }}
        />
        </LazyErrorBoundary>



        {/* Local Model Manager - shown when local engine or local-server selected */}
        {(engine === 'local' || engine === 'local-server') && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full mb-4">
                <ChevronDown className="w-4 h-4 ml-2" />
                ניהול מודלים מקומיים
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mb-4">
              <LazyErrorBoundary label="ניהול מודלים"><LocalModelManager /></LazyErrorBoundary>
            </CollapsibleContent>
          </Collapsible>
        )}

        <LazyErrorBoundary label="היסטוריית תמלולים">
        <CloudTranscriptHistory
          transcripts={transcripts}
          isCloud={isCloud}
          isLoading={isCloudLoading}
          onSelect={(text) => setTranscript(text)}
          onClearAll={() => {
            deleteAll();
            toast({ title: "ההיסטוריה נמחקה" });
          }}
          onDelete={deleteTranscript}
          onUpdate={(id, updates) => updateTranscript(id, updates)}
          initialFolderFilter={folderFromUrl}
        />
        </LazyErrorBoundary>

        {transcript && (
          <>
            <div className="flex gap-2 items-center justify-end" dir="rtl">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(transcript);
                    setCopied(true);
                    toast({ title: "הטקסט הועתק!" });
                    setTimeout(() => setCopied(false), 2000);
                  } catch {
                    toast({ title: "שגיאה", description: "לא ניתן להעתיק ללוח", variant: "destructive" });
                  }
                }}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "הועתק!" : "העתק תמלול"}
              </Button>
              <LazyErrorBoundary label="שיתוף"><ShareTranscript transcript={transcript} /></LazyErrorBoundary>
            </div>
            <LazyErrorBoundary label="סיכום תמלול"><TranscriptSummary transcript={transcript} /></LazyErrorBoundary>
          </>
        )}

        {transcript && (
          <div 
            style={{
              fontSize: `${fontSize}px`,
              fontFamily: fontFamily,
              color: textColor,
              lineHeight: lineHeight,
            }}
          >
            <LazyErrorBoundary label="עורך תמלול">
            <TranscriptEditor 
              transcript={transcript}
              onTranscriptChange={setTranscript}
              wordTimings={wordTimings}
              searchOpen={searchOpen}
              onSearchOpenChange={setSearchOpen}
              onWordCorrected={(original, corrected) => {
                debugLog.info('Index', `Word corrected: "${original}" → "${corrected}"`);
              }}
            />
            </LazyErrorBoundary>
          </div>
        )}

        {/* YouTube Transcription — available when local server is connected */}
        {serverConnected && (
          <LazyErrorBoundary label="YouTube">
          <YouTubeTranscriber
            onTranscriptComplete={(text) => {
              setTranscript(text);
              saveToHistory(text, 'YouTube (Whisper GPU)').then(() => {
                setTimeout(() => navigate('/text-editor', { state: { text, transcriptId: lastSavedTranscriptIdRef.current } }), 1000);
              });
              addAnalyticsRecord({
                engine: 'YouTube (Whisper GPU)', status: 'success',
                charCount: text.length, wordCount: text.split(/\s+/).length,
              });
              toast({ title: "תמלול YouTube הושלם!" });
            }}
          />
          </LazyErrorBoundary>
        )}

        {/* Speaker Diarization — available when local server is connected */}
        {serverConnected && (
          <LazyErrorBoundary label="זיהוי דוברים"><SpeakerDiarization /></LazyErrorBoundary>
        )}
      </div>
    </div>
    <KeyboardShortcutsDialog open={showHelp} onOpenChange={setShowHelp} />
    </Suspense>
  );
};

export default Index;
