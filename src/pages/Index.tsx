import { useState, useEffect, useRef, lazy, Suspense, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { TranscriptionEngine } from "@/components/TranscriptionEngine";
import { FileUploader } from "@/components/FileUploader";
import { AudioRecorder } from "@/components/AudioRecorder";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useLocalTranscription } from "@/hooks/useLocalTranscription";
import { useLocalServer, type TranscriptionStats, type CudaOptions } from "@/hooks/useLocalServer";
import { useBackgroundTask } from "@/hooks/useBackgroundTask";
import { debugLog } from "@/lib/debugLogger";
import { useCloudTranscripts } from "@/hooks/useCloudTranscripts";
import { useTranscriptionAnalytics } from "@/hooks/useTranscriptionAnalytics";
import { Settings, FileEdit, ChevronDown, X, Zap, Globe, Chrome, Mic, Waves, Server, Cpu, Film, Pause, Play, Square, Copy, Check, Keyboard, Activity, Users } from "lucide-react";
import { usePerfMonitor } from "@/hooks/usePerfMonitor";
import { PerfMonitorPanel } from "@/components/PerfMonitorPanel";
import { useTranscriptionJobs } from "@/hooks/useTranscriptionJobs";
import { useAuth } from "@/contexts/AuthContext";
import { useCloudPreferences } from "@/hooks/useCloudPreferences";
import { isVideoFile, extractAudioFromVideo, VIDEO_NEEDS_EXTRACTION, MAX_VIDEO_SIZE_MB, MAX_AUDIO_SIZE_MB } from "@/lib/videoUtils";
import { compressAudio, needsCompression, formatFileSize, CLOUD_API_LIMIT } from "@/lib/audioCompression";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { KeyboardShortcutsDialog } from "@/components/KeyboardShortcutsDialog";
import { addNotification } from "@/hooks/useNotifications";

// Lazy-loaded heavy components
const LiveTranscriber = lazy(() => import("@/components/LiveTranscriber").then(m => ({ default: m.LiveTranscriber })));
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

  // Audio & word timing state for sync player
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [wordTimings, setWordTimings] = useState<Array<{word: string, start: number, end: number, probability?: number}>>([]);
  const [recoveredPartialInfo, setRecoveredPartialInfo] = useState<{progress: number, wordCount: number, lastSegEnd?: number} | null>(null);
  const [lastStats, setLastStats] = useState<TranscriptionStats | null>(null);
  const [copied, setCopied] = useState(false);
  const [diarize, setDiarize] = useState(false);

  // Save reference to last uploaded file for resume functionality
  const lastFileRef = useRef<File | null>(null);
  const lastAudioUrlRef = useRef<string | null>(null);

  // Pending file waiting for local server to come up
  const pendingServerFileRef = useRef<{ file: File; audioUrl: string } | null>(null);

  const { transcribe: localTranscribe, isLoading: isLocalLoading, progress: localProgress } = useLocalTranscription();
  const { transcribeStream: serverTranscribeStream, transcribeStreamParallel: serverTranscribeParallel, isLoading: isServerLoading, progress: serverProgress, phase: serverPhase, isConnected: serverConnected, modelReady: serverModelReady, recoverPartial, clearPartial, cancelStream: cancelServerStream, checkConnection, startPolling, stopPolling } = useLocalServer();
  const bgTask = useBackgroundTask();
  const { transcripts, isLoading: isCloudLoading, saveTranscript, updateTranscript, deleteTranscript, deleteAll, isCloud, getAudioUrl } = useCloudTranscripts();
  const { jobs, submitJob, submitBatchJobs, retryJob, deleteJob } = useTranscriptionJobs();
  const { addRecord: addAnalyticsRecord } = useTranscriptionAnalytics();
  const perfMonitor = usePerfMonitor();
  const [showPerfPanel, setShowPerfPanel] = useState(false);

  // Helper to track the start time of each transcription for analytics
  const transcriptionStartRef = useRef<number>(0);

  // Start/stop health polling when CUDA engine is selected
  // Skip polling when on cloud (non-localhost) with default server URL
  const isCloudWithDefaultUrl = typeof window !== 'undefined'
    && !['localhost', '127.0.0.1'].includes(window.location.hostname)
    && !localStorage.getItem('whisper_server_url');

  useEffect(() => {
    // TranscriptionEngine handles initial check + polling for the CUDA engine.
    // Index only starts polling on-demand (see transcribeWithLocalServer).
    return () => stopPolling();
  }, [engine, stopPolling]);

  // Cleanup audio Object URL on unmount
  useEffect(() => {
    return () => {
      if (lastAudioUrlRef.current) {
        URL.revokeObjectURL(lastAudioUrlRef.current);
      }
    };
  }, []);

  // Recover partial transcription on mount (runs once)
  useEffect(() => {
    const partial = recoverPartial();
    if (partial && partial.text) {
      setTranscript(partial.text);
      setWordTimings(partial.wordTimings || []);
      setRecoveredPartialInfo({ progress: partial.progress, wordCount: partial.wordTimings?.length || 0, lastSegEnd: partial.lastSegEnd });
      toast({
        title: "🔄 שוחזר תמלול חלקי",
        description: `נמצא תמלול שהופסק (${partial.progress}%) — ${partial.wordTimings?.length || 0} מילים. אפשר להמשיך מאותו מקום`,
      });
      debugLog.info('Recovery', `Restored partial transcript: ${partial.progress}%, ${partial.text.length} chars`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-start transcription when server comes up and there's a pending file
  useEffect(() => {
    if (serverConnected && pendingServerFileRef.current && engine === 'local-server') {
      const { file, audioUrl } = pendingServerFileRef.current;
      pendingServerFileRef.current = null;
      toast({ title: "\u2705 \u05d4\u05e9\u05e8\u05ea \u05e2\u05dc\u05d4!", description: `\u05de\u05ea\u05d7\u05d9\u05dc \u05ea\u05de\u05dc\u05d5\u05dc: ${file.name}` });
      currentFileRef.current = file;
      debugLog.info('Transcription', `\u05e9\u05e8\u05ea \u05e2\u05dc\u05d4 \u2014 \u05de\u05ea\u05d7\u05d9\u05dc \u05ea\u05de\u05dc\u05d5\u05dc \u05de\u05de\u05ea\u05d9\u05df: ${file.name}`);
      bgTask.run(`local-server \u2014 ${file.name}`, async () => {
        await transcribeWithLocalServer(file, audioUrl);
      }).catch(() => {});
    }
  }, [serverConnected]);

  // Keep reference to current file for saving with transcript
  const currentFileRef = useRef<File | null>(null);

  // Save to cloud history (respects cloud save mode for CUDA engine)
  const saveToHistory = async (text: string, engineUsed: string, skipCloud?: boolean, timings?: Array<{word: string, start: number, end: number, probability?: number}>) => {
    if (skipCloud) {
      // Save only to localStorage, skip cloud upload entirely
      let history: any[] = [];
      try { history = JSON.parse(localStorage.getItem('transcript_history') || '[]'); } catch { /* corrupted */ }
      const entry = { text, timestamp: Date.now(), engine: engineUsed, tags: [], notes: '' };
      const updated = [entry, ...history].slice(0, 50);
      localStorage.setItem('transcript_history', JSON.stringify(updated));
      return;
    }
    await saveTranscript(text, engineUsed, undefined, currentFileRef.current || undefined, timings);
    addNotification({ type: 'success', title: 'תמלול הושלם', description: `מנוע: ${engineUsed} — ${text.split(/\s+/).length} מילים` });
  };

  // Save text-only to cloud (deferred mode — upload text without audio file)
  const saveTextOnlyToCloud = async (text: string, engineUsed: string, timings?: Array<{word: string, start: number, end: number, probability?: number}>) => {
    await saveTranscript(text, engineUsed, undefined, undefined, timings);
  };

  // Helper: invoke edge function with real upload progress via XHR and multipart form
  const xhrInvoke = (functionName: string, formData: FormData, onProgress: (p: number) => void) => {
    return new Promise<{ data?: any; error?: any }>((resolve) => {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`;
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Authorization', `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`);
      xhr.setRequestHeader('x-client-info', 'xhr-upload');

      // Upload progress = 0-50%
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 50);
          onProgress(percent);
        }
      };

      // Once upload is done, animate processing progress 50-90%
      let processingInterval: ReturnType<typeof setInterval> | null = null;
      xhr.upload.onloadend = () => {
        onProgress(50);
        let current = 50;
        processingInterval = setInterval(() => {
          current = Math.min(current + 2, 90);
          onProgress(current);
          if (current >= 90 && processingInterval) {
            clearInterval(processingInterval);
          }
        }, 500);
      };

      xhr.onload = () => {
        if (processingInterval) clearInterval(processingInterval);
        onProgress(100);
        try {
          const json = JSON.parse(xhr.responseText || '{}');
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve({ data: json });
          } else if (xhr.status === 429) {
            const retryAfter = parseInt(xhr.getResponseHeader('Retry-After') || '60', 10);
            resolve({ error: { message: `RATE_LIMIT`, retryAfter } });
          } else {
            resolve({ error: json || { message: `HTTP ${xhr.status}` } });
          }
        } catch (e) {
          resolve({ error: { message: 'Invalid JSON response' } });
        }
      };

      xhr.onerror = () => {
        if (processingInterval) clearInterval(processingInterval);
        resolve({ error: { message: 'Network error' } });
      };

      xhr.send(formData);
    });
  };

  const handleFileSelect = async (file: File) => {
    currentFileRef.current = file;
    pendingServerFileRef.current = null; // Clear pending queue when new file is selected
    setRecoveredPartialInfo(null); // Clear recovery banner on new transcription
    
    const isVideo = isVideoFile(file);
    const maxMB = isVideo ? MAX_VIDEO_SIZE_MB : MAX_AUDIO_SIZE_MB;
    
    // Check file size (500MB hard limit)
    if (file.size > maxMB * 1024 * 1024) {
      debugLog.error('Upload', 'קובץ גדול מדי', { size: file.size, maxMB });
      toast({
        title: "שגיאה",
        description: `הקובץ גדול מדי. גודל מקסימלי: ${maxMB}MB`,
        variant: "destructive",
      });
      return;
    }

    // Preserve media URL for playback
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    const url = URL.createObjectURL(file);
    setAudioUrl(url);

    // Persist audio blob to IndexedDB for text-editor recovery
    try {
      const idb = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('transcriber_audio', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('blobs');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = idb.transaction('blobs', 'readwrite');
      tx.objectStore('blobs').put(file, 'last_audio');
      tx.objectStore('blobs').put(file.type, 'last_audio_type');
      tx.objectStore('blobs').put(file.name, 'last_audio_name');
      idb.close();
    } catch { /* IndexedDB not available — ok */ }

    // Show audio/video duration after file select
    try {
      const mediaEl = isVideo ? document.createElement('video') : new Audio();
      mediaEl.preload = 'metadata';
      mediaEl.src = url;
      mediaEl.onloadedmetadata = () => {
        const dur = mediaEl.duration;
        if (dur && isFinite(dur)) {
          const mins = Math.floor(dur / 60);
          const secs = Math.round(dur % 60);
          toast({ title: `${isVideo ? '🎬' : '🎵'} ${file.name}`, description: `משך: ${mins}:${secs.toString().padStart(2, '0')} | ${formatFileSize(file.size)}` });
        }
      };
    } catch { /* ignore duration detection errors */ }

    // Step 1: If video file and engine requires audio-only → extract audio
    let fileToTranscribe = file;
    if (isVideo && VIDEO_NEEDS_EXTRACTION.has(engine)) {
      debugLog.info('Video', `מחלץ אודיו מוידאו: ${file.name} (${formatFileSize(file.size)})`);
      toast({
        title: "🎬 מחלץ אודיו מוידאו...",
        description: `${engine === 'google' ? 'Google Speech-to-Text' : engine} דורש קובץ אודיו — מחלץ אוטומטית`,
      });
      try {
        fileToTranscribe = await extractAudioFromVideo(file, (p) => {
          setUploadProgress(Math.round(p * 0.2)); // 0-20% for extraction
        });
        debugLog.info('Video', `חילוץ אודיו הושלם: ${fileToTranscribe.name} (${formatFileSize(fileToTranscribe.size)})`);
      } catch (err) {
        debugLog.error('Video', 'שגיאה בחילוץ אודיו', err);
        toast({
          title: "שגיאה בחילוץ אודיו",
          description: err instanceof Error ? err.message : "לא ניתן לחלץ אודיו מהווידאו",
          variant: "destructive",
        });
        return;
      }
    } else if (isVideo) {
      debugLog.info('Video', `שולח וידאו ישירות ל-${engine} (תומך וידאו)`);
      toast({ title: "🎬 וידאו זוהה", description: `${engine} מעבד וידאו ישירות — מחלץ אודיו בצד השרת` });
    }

    // Step 2: Auto-compress if file too large for cloud APIs (>25MB)
    // Skip compression for local-server (no limit) and local (ONNX)
    const isCloudEngine = !['local-server', 'local'].includes(engine);
    if (isCloudEngine && needsCompression(fileToTranscribe)) {
      const originalSize = formatFileSize(fileToTranscribe.size);
      debugLog.info('Compression', `כיווץ אודיו: ${fileToTranscribe.name} (${originalSize}) — מנוע ענן דורש <25MB`);
      toast({
        title: "🗜️ מכווץ אודיו...",
        description: `${originalSize} → מכווץ ל-16kHz מונו לשליחה ל-${engine}`,
      });
      try {
        fileToTranscribe = await compressAudio(fileToTranscribe, (p) => {
          setUploadProgress(20 + Math.round(p * 0.3)); // 20-50% for compression
        });
        const compressedSize = formatFileSize(fileToTranscribe.size);
        debugLog.info('Compression', `כיווץ הושלם: ${originalSize} → ${compressedSize}`);
        toast({
          title: "✅ כיווץ הושלם",
          description: `${originalSize} → ${compressedSize}`,
        });

        // If still too large after compression, warn but try anyway
        if (fileToTranscribe.size > CLOUD_API_LIMIT) {
          debugLog.warn('Compression', `הקובץ עדיין גדול לאחר כיווץ: ${compressedSize}`);
          toast({
            title: "⚠️ קובץ עדיין גדול",
            description: `${compressedSize} — ייתכן שה-API ידו חה. מומלץ להשתמש בשרת CUDA מקומי`,
            variant: "destructive",
          });
        }
      } catch (err) {
        debugLog.error('Compression', 'שגיאה בכיווץ', err);
        toast({
          title: "שגיאה בכיווץ",
          description: err instanceof Error ? err.message : "לא ניתן לכווץ את הקובץ",
          variant: "destructive",
        });
        return;
      }
    }

    debugLog.info('Transcription', `התחלת תמלול: ${fileToTranscribe.name} (${formatFileSize(fileToTranscribe.size)}) עם ${engine}`);

    // Track start time for analytics
    transcriptionStartRef.current = Date.now();
    perfMonitor.startTimer();

    // Run in background — doesn't block tab, sends notification on complete
    bgTask.run(`${engine} — ${file.name}`, async () => {
      if (engine === 'openai') {
        await transcribeWithOpenAI(fileToTranscribe, url);
      } else if (engine === 'groq') {
        await transcribeWithGroq(fileToTranscribe, url);
      } else if (engine === 'google') {
        await transcribeWithGoogle(fileToTranscribe, url);
      } else if (engine === 'assemblyai') {
        await transcribeWithAssemblyAI(fileToTranscribe, url);
      } else if (engine === 'deepgram') {
        await transcribeWithDeepgram(fileToTranscribe, url);
      } else if (engine === 'local-server') {
        await transcribeWithLocalServer(fileToTranscribe, url);
      } else {
        await transcribeLocally(fileToTranscribe, url);
      }
    }).catch(() => {
      // Already logged by bgTask
    });
  };

  const transcribeWithOpenAI = async (file: File, fileAudioUrl?: string) => {
    setIsUploading(true);
    
    try {
      debugLog.info('OpenAI', `Starting transcription: ${file.name} (${file.size} bytes)`);
      
      const openaiKey = localStorage.getItem("openai_api_key");
      if (!openaiKey) {
        debugLog.error('OpenAI', 'No API key found in localStorage');
        toast({
          title: "נדרש מפתח API",
          description: "יש להגדיר מפתח OpenAI בהגדרות",
          variant: "destructive",
        });
        navigate("/login");
        setIsUploading(false);
        return;
      }

      setUploadProgress(0);
      toast({ title: "מעלה קובץ...", description: "מעבד את הקובץ שלך" });

      const form = new FormData();
      form.append('file', file, file.name);
      form.append('fileName', file.name);
      form.append('apiKey', openaiKey);
      form.append('language', sourceLanguage);
      form.append('targetLanguage', 'he'); // Always Hebrew output

      debugLog.info('OpenAI', 'Uploading via XHR to edge function...');
      const { data, error } = await xhrInvoke('transcribe-openai', form, (p) => setUploadProgress(p));

      debugLog.info('OpenAI', 'Response received', { hasData: !!data, hasError: !!error });

      if (error) throw error;

      if (data?.text) {
        const timings = data.wordTimings || [];
        setTranscript(data.text);
        setWordTimings(timings);
        saveToHistory(data.text, 'OpenAI Whisper', undefined, timings);
        addAnalyticsRecord({
          engine: 'OpenAI Whisper', status: 'success',
          fileName: file.name, fileSize: file.size,
          processingTime: (Date.now() - transcriptionStartRef.current) / 1000,
          charCount: data.text.length, wordCount: data.text.split(/\s+/).length,
        });
        perfMonitor.record({
          engine: 'OpenAI Whisper', status: 'success',
          fileName: file.name, fileSize: file.size,
          audioDuration: data.duration || 0,
          processingTime: (Date.now() - transcriptionStartRef.current) / 1000,
          text: data.text, wordTimings: timings,
        });
        toast({
          title: "הצלחה!",
          description: "התמלול הושלם בהצלחה - עובר לעריכת טקסט",
        });
        // Persist word timings for text-editor recovery
        if (timings.length > 0) localStorage.setItem('last_word_timings', JSON.stringify(timings));
        // Auto-navigate to text editor
        setTimeout(() => {
          navigate('/text-editor', { state: { text: data.text, audioUrl: fileAudioUrl, wordTimings: timings } });
        }, 1000);
      } else {
        throw new Error('No transcription received');
      }
    } catch (error) {
      debugLog.error('OpenAI', 'Transcription failed', error instanceof Error ? error.message : error);
      addAnalyticsRecord({
        engine: 'OpenAI Whisper', status: 'failed',
        fileName: file.name, fileSize: file.size,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      toast({
        title: "שגיאה",
        description: error instanceof Error ? error.message : "שגיאה בתמלול הקובץ",
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsUploading(false);
    }
  };

  const transcribeWithGroq = async (file: File, fileAudioUrl?: string) => {
    debugLog.info('Groq', `Starting transcription: ${file.name} (${file.size} bytes)`);
    setIsUploading(true);

    try {
      const groqKey = localStorage.getItem("groq_api_key");
      
      if (!groqKey) {
        debugLog.error('Groq', 'No API key found in localStorage');
        toast({
          title: "נדרש מפתח API",
          description: "יש להגדיר מפתח Groq בהגדרות (לחץ על כפתור ההגדרות בראש העמוד)",
          variant: "destructive",
        });
        navigate("/login");
        setIsUploading(false);
        return;
      }

      setUploadProgress(0);
      toast({ title: "מעלה קובץ...", description: "מעבד עם Groq - מנוע מהיר במיוחד" });

      const form = new FormData();
      form.append('file', file, file.name);
      form.append('fileName', file.name);
      form.append('apiKey', groqKey);
      form.append('language', sourceLanguage);
      form.append('targetLanguage', 'he'); // Always Hebrew output

      debugLog.info('Groq', 'Uploading via XHR...');
      const { data, error } = await xhrInvoke('transcribe-groq', form, (p) => setUploadProgress(p));

      debugLog.info('Groq', 'Response received', { hasData: !!data, hasError: !!error });

      if (error) {
        debugLog.error('Groq', 'Edge function error', error);
        const errMsg = error.message || error.error || 'שגיאה לא ידועה';
        if (errMsg === 'RATE_LIMIT' || error.retryAfter) {
          const wait = error.retryAfter || 60;
          throw new Error(`חרגת ממגבלת Groq. נסה שוב בעוד ${wait} שניות.`);
        }
        throw new Error(errMsg);
      }

      if (data?.text) {
        debugLog.info('Groq', `Transcription received, length: ${data.text.length}`);
        const timings = data.wordTimings || [];
        setTranscript(data.text);
        setWordTimings(timings);
        saveToHistory(data.text, 'Groq Whisper', undefined, timings);
        addAnalyticsRecord({
          engine: 'Groq Whisper', status: 'success',
          fileName: file.name, fileSize: file.size,
          processingTime: (Date.now() - transcriptionStartRef.current) / 1000,
          charCount: data.text.length, wordCount: data.text.split(/\s+/).length,
        });
        perfMonitor.record({
          engine: 'Groq Whisper', status: 'success',
          fileName: file.name, fileSize: file.size,
          audioDuration: data.duration || 0,
          processingTime: (Date.now() - transcriptionStartRef.current) / 1000,
          text: data.text, wordTimings: timings,
        });
        toast({ 
          title: "הצלחה!", 
          description: "התמלול עם Groq הושלם בהצלחה - עובר לעריכת טקסט" 
        });
        if (timings.length > 0) localStorage.setItem('last_word_timings', JSON.stringify(timings));
        // Auto-navigate to text editor
        setTimeout(() => {
          navigate('/text-editor', { state: { text: data.text, audioUrl: fileAudioUrl, wordTimings: timings } });
        }, 1000);
      } else {
        debugLog.error('Groq', 'No text in response data', data);
        throw new Error('No transcription received from Groq');
      }
    } catch (error) {
      debugLog.error('Groq', 'Transcription failed', error instanceof Error ? error.message : error);
      addAnalyticsRecord({
        engine: 'Groq Whisper', status: 'failed',
        fileName: file.name, fileSize: file.size,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      toast({
        title: "שגיאה בתמלול Groq",
        description: error instanceof Error ? error.message : "שגיאה לא ידועה",
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsUploading(false);
    }
  };

  const transcribeWithGoogle = async (file: File, fileAudioUrl?: string) => {
    debugLog.info('Google', `Starting transcription: ${file.name}`);
    setIsUploading(true);

    try {
      const googleKey = localStorage.getItem("google_api_key");

      if (!googleKey) {
        debugLog.error('Google', 'No API key found in localStorage');
        toast({
          title: "נדרש מפתח API",
          description: "יש להגדיר מפתח Google בהגדרות",
          variant: "destructive",
        });
        navigate("/login");
        setIsUploading(false);
        return;
      }

      debugLog.info('Google', 'Converting file to base64...');
      toast({
        title: "מעלה קובץ...",
        description: "מעבד עם Google Speech-to-Text",
      });

      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const base64 = reader.result?.toString().split(',')[1];
          if (base64) {
            resolve(base64);
          } else reject(new Error('Failed to convert file'));
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const base64Audio = await base64Promise;

      debugLog.info('Google', 'Calling edge function...');
      const { data, error } = await supabase.functions.invoke('transcribe-google', {
        body: {
          audio: base64Audio,
          fileName: file.name,
          apiKey: googleKey,
          language: sourceLanguage,
          targetLanguage: 'he' // Always Hebrew output
        }
      });

      debugLog.info('Google', 'Response received', { hasData: !!data, hasError: !!error });

      if (error) {
        debugLog.error('Google', 'Edge function error', error);
        throw error;
      }

      if (data?.text) {
        debugLog.info('Google', `Success, text length: ${data.text.length}`);
        const timings = data.wordTimings || [];
        setTranscript(data.text);
        setWordTimings(timings);
        saveToHistory(data.text, 'Google Speech-to-Text', undefined, timings);
        addAnalyticsRecord({
          engine: 'Google Speech-to-Text', status: 'success',
          fileName: file.name, fileSize: file.size,
          processingTime: (Date.now() - transcriptionStartRef.current) / 1000,
          charCount: data.text.length, wordCount: data.text.split(/\s+/).length,
        });
        perfMonitor.record({
          engine: 'Google Speech-to-Text', status: 'success',
          fileName: file.name, fileSize: file.size,
          audioDuration: 0,
          processingTime: (Date.now() - transcriptionStartRef.current) / 1000,
          text: data.text, wordTimings: timings,
        });
        toast({
          title: "הצלחה!",
          description: "התמלול עם Google הושלם בהצלחה - עובר לעריכת טקסט"
        });
        if (timings.length > 0) localStorage.setItem('last_word_timings', JSON.stringify(timings));
        // Auto-navigate to text editor
        setTimeout(() => {
          navigate('/text-editor', { state: { text: data.text, audioUrl: fileAudioUrl, wordTimings: timings } });
        }, 1000);
      } else {
        throw new Error('No transcription received from Google');
      }
    } catch (error) {
      debugLog.error('Google', 'Transcription failed', error instanceof Error ? error.message : error);
      addAnalyticsRecord({
        engine: 'Google Speech-to-Text', status: 'failed',
        fileName: file.name, fileSize: file.size,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      toast({
        title: "שגיאה בתמלול Google",
        description: error instanceof Error ? error.message : "שגיאה לא ידועה",
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsUploading(false);
    }
  };

  const transcribeLocally = async (file: File, fileAudioUrl?: string) => {
    try {
      const result = await localTranscribe(file);
      setTranscript(result.text);
      setWordTimings(result.wordTimings);
      saveToHistory(result.text, 'Local (Browser)', undefined, result.wordTimings);
      addAnalyticsRecord({
        engine: 'Local (Browser)', status: 'success',
        fileName: file.name, fileSize: file.size,
        processingTime: (Date.now() - transcriptionStartRef.current) / 1000,
        charCount: result.text.length, wordCount: result.text.split(/\s+/).length,
      });
      perfMonitor.record({
        engine: 'Local (Browser)', status: 'success',
        fileName: file.name, fileSize: file.size,
        audioDuration: 0,
        processingTime: (Date.now() - transcriptionStartRef.current) / 1000,
        text: result.text, wordTimings: result.wordTimings,
      });
      toast({
        title: "הצלחה!",
        description: "התמלול המקומי הושלם בהצלחה - עובר לעריכת טקסט",
      });
      if (result.wordTimings?.length > 0) localStorage.setItem('last_word_timings', JSON.stringify(result.wordTimings));
      // Auto-navigate to text editor
      setTimeout(() => {
        navigate('/text-editor', { state: { text: result.text, audioUrl: fileAudioUrl, wordTimings: result.wordTimings } });
      }, 1000);
    } catch (error) {
      debugLog.error('Local', 'Browser transcription failed', error instanceof Error ? error.message : error);
      addAnalyticsRecord({
        engine: 'Local (Browser)', status: 'failed',
        fileName: file.name, fileSize: file.size,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      toast({
        title: "שגיאה",
        description: error instanceof Error ? error.message : "שגיאה בתמלול מקומי",
        variant: "destructive",
      });
      throw error;
    }
  };

  const transcribeWithLocalServer = async (file: File, fileAudioUrl?: string, resumeFrom?: { startFrom: number; existingText: string; existingWords: Array<{word: string, start: number, end: number}> }) => {
    // Fresh connection check before transcription (serverConnected state may be stale)
    const isUp = await checkConnection();
    if (!isUp) {
      pendingServerFileRef.current = { file, audioUrl: fileAudioUrl || '' };
      // Aggressive polling while waiting — max 60 seconds, then give up
      startPolling(2000, 60000);
      toast({
        title: "⏳ ממתין לשרת...",
        description: `${file.name} בתור — התמלול יתחיל אוטומטית כשהשרת יעלה (עד דקה)`,
      });
      // Auto-clear pending file after 60 seconds if server never came up
      setTimeout(() => {
        if (pendingServerFileRef.current) {
          pendingServerFileRef.current = null;
          toast({
            title: "⏰ השרת לא הגיב",
            description: "הופסקה ההמתנה אחרי דקה. הפעל את השרת ונסה שוב.",
            variant: "destructive",
          });
        }
      }, 60000);
      return;
    }

    try {
      const preferredModel = localStorage.getItem('preferred_local_model') || undefined;
      const lang = sourceLanguage === 'auto' ? 'auto' : sourceLanguage;
      setTranscript('');
      setWordTimings([]);
      setLastStats(null);
      toast({ title: "מתמלל עם GPU...", description: "מעבד את הקובץ בשרת המקומי עם CUDA — תראה תוצאות בזמן אמת" });

      // Build CUDA options from localStorage
      const cudaOptions: CudaOptions = {
        fastMode: localStorage.getItem('cuda_fast_mode') === '1',
        computeType: localStorage.getItem('cuda_compute_type') || undefined,
        beamSize: parseInt(localStorage.getItem('cuda_beam_size') || '0') || undefined,
        noConditionOnPrevious: localStorage.getItem('cuda_no_condition_prev') === '1',
        vadAggressive: localStorage.getItem('cuda_vad_aggressive') === '1',
        hotwords: localStorage.getItem('cuda_hotwords') || undefined,
        paragraphThreshold: parseFloat(localStorage.getItem('cuda_paragraph_threshold') || '0') || undefined,
      };

      // Use parallel mode (stage audio + preload model simultaneously) when model isn't ready
      const useParallel = !serverModelReady;
      const transcribeFn = useParallel ? serverTranscribeParallel : serverTranscribeStream;
      if (useParallel) {
        debugLog.info('CUDA', 'Using parallel mode: staging audio + preloading model simultaneously');
        toast({ title: "⚡ מצב מקבילי", description: "מעלה אודיו + טוען מודל במקביל" });
      }

      const result = await transcribeFn(file, preferredModel, lang, (partial) => {
        // Update live as segments arrive
        setTranscript(partial.text);
        setWordTimings(partial.wordTimings);
        debugLog.info('CUDA Stream', `${partial.progress}% — ${partial.wordTimings.length} מילים`);
      }, resumeFrom, cudaOptions);
      const timings = result.wordTimings || [];
      setTranscript(result.text);
      setWordTimings(timings);
      if (result.stats) setLastStats(result.stats);

      // Cloud save mode: 'immediate' (default), 'text-only' (no audio upload), 'skip' (local only)
      const cloudSaveMode = localStorage.getItem('cuda_cloud_save') || 'immediate';
      const engineLabel = `Local CUDA (${result.model || 'server'})`;
      if (cloudSaveMode === 'skip') {
        saveToHistory(result.text, engineLabel, true, timings);  // localStorage only
      } else if (cloudSaveMode === 'text-only') {
        saveTextOnlyToCloud(result.text, engineLabel, timings);  // text to cloud, no audio upload
      } else {
        saveToHistory(result.text, engineLabel, undefined, timings);  // full: text + audio to cloud
      }

      clearPartial();
      addAnalyticsRecord({
        engine: engineLabel, status: 'success',
        fileName: file.name, fileSize: file.size,
        audioDuration: result.duration || result.stats?.duration,
        processingTime: result.processing_time || result.stats?.processing_time,
        rtf: result.stats?.rtf,
        segmentCount: timings.length,
        charCount: result.text.length,
        wordCount: result.text.split(/\s+/).length,
        model: result.model,
        computeType: result.stats?.compute_type,
        beamSize: result.stats?.beam_size,
        fastMode: result.stats?.fast_mode,
      });
      perfMonitor.record({
        engine: engineLabel, status: 'success',
        fileName: file.name, fileSize: file.size,
        audioDuration: result.duration || result.stats?.duration || 0,
        processingTime: result.processing_time || result.stats?.processing_time || 0,
        text: result.text, wordTimings: timings,
        computeType: result.stats?.compute_type,
        beamSize: result.stats?.beam_size,
        model: result.model,
      });
      const statsInfo = result.stats ? ` | RTF=${result.stats.rtf} | ${result.stats.compute_type}` : '';
      toast({
        title: "הצלחה!",
        description: `תמלול GPU הושלם ב-${result.processing_time || '?'}s${statsInfo} — עובר לעריכת טקסט`,
      });
      if (timings.length > 0) localStorage.setItem('last_word_timings', JSON.stringify(timings));
      setTimeout(() => {
        navigate('/text-editor', { state: { text: result.text, audioUrl: fileAudioUrl, wordTimings: timings } });
      }, 1000);
    } catch (error) {
      if (error instanceof Error && error.message === 'CANCELLED') {
        toast({ title: "תמלול הופסק", description: "התמלול בוטל על ידי המשתמש" });
        return;
      }
      debugLog.error('CUDA Server', 'Transcription failed', error instanceof Error ? error.message : error);
      addAnalyticsRecord({
        engine: 'Local CUDA', status: 'failed',
        fileName: file.name, fileSize: file.size,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      // Even on failure, keep what was partially transcribed (already saved to localStorage by hook)
      toast({
        title: "שגיאה בתמלול שרת מקומי",
        description: `${error instanceof Error ? error.message : 'שגיאה לא ידועה'} — מה שהצליח נשמר`,
        variant: "destructive",
      });
      throw error;
    }
  };

  const transcribeWithAssemblyAI = async (file: File, fileAudioUrl?: string) => {
    setIsUploading(true);
    
    try {
      const assemblyKey = localStorage.getItem("assemblyai_api_key");
      
      if (!assemblyKey) {
        toast({
          title: "נדרש מפתח API",
          description: "יש להגדיר מפתח AssemblyAI בהגדרות",
          variant: "destructive",
        });
        navigate("/login");
        setIsUploading(false);
        return;
      }

      setUploadProgress(0);
      toast({ title: "מעלה קובץ...", description: "מעבד את הקובץ שלך" });

      const form = new FormData();
      form.append('file', file, file.name);
      form.append('apiKey', assemblyKey);
      form.append('language', sourceLanguage);
      if (diarize) form.append('diarize', 'true');

      const { data, error } = await xhrInvoke('transcribe-assemblyai', form, (p) => setUploadProgress(p));

      if (error) throw error;

      if (data?.text) {
        const timings = data.wordTimings || [];
        setTranscript(data.text);
        setWordTimings(timings);
        saveToHistory(data.text, 'AssemblyAI', undefined, timings);
        addAnalyticsRecord({
          engine: 'AssemblyAI', status: 'success',
          fileName: file.name, fileSize: file.size,
          processingTime: (Date.now() - transcriptionStartRef.current) / 1000,
          charCount: data.text.length, wordCount: data.text.split(/\s+/).length,
        });
        perfMonitor.record({
          engine: 'AssemblyAI', status: 'success',
          fileName: file.name, fileSize: file.size,
          audioDuration: 0,
          processingTime: (Date.now() - transcriptionStartRef.current) / 1000,
          text: data.text, wordTimings: timings,
        });
        toast({
          title: "הצלחה!",
          description: "התמלול הושלם בהצלחה - עובר לעריכת טקסט",
        });
        if (timings.length > 0) localStorage.setItem('last_word_timings', JSON.stringify(timings));
        setTimeout(() => {
          navigate('/text-editor', { state: { text: data.text, audioUrl: fileAudioUrl, wordTimings: timings } });
        }, 1000);
      } else {
        throw new Error('No transcription received');
      }
    } catch (error) {
      debugLog.error('AssemblyAI', 'Transcription failed', error instanceof Error ? error.message : error);
      addAnalyticsRecord({
        engine: 'AssemblyAI', status: 'failed',
        fileName: file.name, fileSize: file.size,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      toast({
        title: "שגיאה",
        description: error instanceof Error ? error.message : "שגיאה בתמלול הקובץ",
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsUploading(false);
    }
  };

  const transcribeWithDeepgram = async (file: File, fileAudioUrl?: string) => {
    setIsUploading(true);
    
    try {
      const deepgramKey = localStorage.getItem("deepgram_api_key");
      
      if (!deepgramKey) {
        toast({
          title: "נדרש מפתח API",
          description: "יש להגדיר מפתח Deepgram בהגדרות",
          variant: "destructive",
        });
        navigate("/login");
        setIsUploading(false);
        return;
      }

      setUploadProgress(0);
      toast({ title: "מעלה קובץ...", description: "מעבד את הקובץ שלך" });

      const form = new FormData();
      form.append('file', file, file.name);
      form.append('apiKey', deepgramKey);
      form.append('language', sourceLanguage);
      if (diarize) form.append('diarize', 'true');

      const { data, error } = await xhrInvoke('transcribe-deepgram', form, (p) => setUploadProgress(p));

      if (error) throw error;

      if (data?.text) {
        const timings = data.wordTimings || [];
        setTranscript(data.text);
        setWordTimings(timings);
        saveToHistory(data.text, 'Deepgram', undefined, timings);
        addAnalyticsRecord({
          engine: 'Deepgram', status: 'success',
          fileName: file.name, fileSize: file.size,
          processingTime: (Date.now() - transcriptionStartRef.current) / 1000,
          charCount: data.text.length, wordCount: data.text.split(/\s+/).length,
        });
        perfMonitor.record({
          engine: 'Deepgram', status: 'success',
          fileName: file.name, fileSize: file.size,
          audioDuration: 0,
          processingTime: (Date.now() - transcriptionStartRef.current) / 1000,
          text: data.text, wordTimings: timings,
        });
        toast({
          title: "הצלחה!",
          description: "התמלול הושלם בהצלחה - עובר לעריכת טקסט",
        });
        if (timings.length > 0) localStorage.setItem('last_word_timings', JSON.stringify(timings));
        setTimeout(() => {
          navigate('/text-editor', { state: { text: data.text, audioUrl: fileAudioUrl, wordTimings: timings } });
        }, 1000);
      } else {
        throw new Error('No transcription received');
      }
    } catch (error) {
      debugLog.error('Deepgram', 'Transcription failed', error instanceof Error ? error.message : error);
      addAnalyticsRecord({
        engine: 'Deepgram', status: 'failed',
        fileName: file.name, fileSize: file.size,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      toast({
        title: "שגיאה",
        description: error instanceof Error ? error.message : "שגיאה בתמלול הקובץ",
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsUploading(false);
    }
  };

  const isLoading = isUploading || isLocalLoading || isServerLoading || bgTask.isRunning;
  const progress = engine === 'local' ? localProgress : engine === 'local-server' ? serverProgress : (isUploading ? uploadProgress : undefined);

  // Keyboard shortcuts
  const [searchOpen, setSearchOpen] = useState(false);
  const shortcutHandler = useCallback((action: 'show-shortcuts' | 'copy-transcript' | 'cancel-transcription' | 'search-transcript') => {
    if (action === 'copy-transcript' && transcript) {
      navigator.clipboard.writeText(transcript).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast({ title: "הועתק", description: "התמלול הועתק ללוח" });
      });
    } else if (action === 'cancel-transcription' && isLoading) {
      handleCancelTranscription();
    } else if (action === 'search-transcript') {
      setSearchOpen(prev => !prev);
    }
  }, [transcript, isLoading]);
  const { showHelp, setShowHelp } = useKeyboardShortcuts(shortcutHandler);

  // Elapsed time counter — starts fresh each time a transcription begins
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval>>();
  // Track when actual transcription progress started (for ETA calc, excludes model loading)
  const transcribeStartTimeRef = useRef<number>(0);
  const [transcribeElapsed, setTranscribeElapsed] = useState(0);
  useEffect(() => {
    if (isLoading) {
      setElapsedSeconds(0);
      setTranscribeElapsed(0);
      transcribeStartTimeRef.current = 0;
      elapsedIntervalRef.current = setInterval(() => {
        setElapsedSeconds(s => s + 1);
        if (transcribeStartTimeRef.current > 0) {
          setTranscribeElapsed(Math.floor((Date.now() - transcribeStartTimeRef.current) / 1000));
        }
      }, 1000);
    } else {
      clearInterval(elapsedIntervalRef.current);
    }
    return () => clearInterval(elapsedIntervalRef.current);
  }, [isLoading]);

  // Mark when first real progress arrives (phase changes to transcribing)
  useEffect(() => {
    if (engine === 'local-server' && serverPhase === 'transcribing' && transcribeStartTimeRef.current === 0) {
      transcribeStartTimeRef.current = Date.now();
    }
  }, [engine, serverPhase]);

  const handleCancelTranscription = () => {
    if (engine === 'local-server') {
      cancelServerStream();
      // Partial is already saved to localStorage by useLocalServer on each segment
      const partial = recoverPartial();
      if (partial && partial.text) {
        setRecoveredPartialInfo({ progress: partial.progress, wordCount: partial.wordTimings?.length || 0, lastSegEnd: partial.lastSegEnd });
        toast({ title: "⏸ תמלול הופסק", description: `נשמר תמלול חלקי (${partial.progress}%) — ${partial.wordTimings?.length || 0} מילים. אפשר להמשיך מאותו מקום` });
      } else {
        toast({ title: "תמלול הופסק" });
      }
    }
    bgTask.reset();
    setIsUploading(false);
  };

  const handleResumeTranscription = async () => {
    const partial = recoverPartial();
    if (!partial || !partial.lastSegEnd) {
      toast({ title: "אין מה להמשיך", description: "לא נמצא תמלול חלקי עם נקודת המשך", variant: "destructive" });
      return;
    }
    const file = currentFileRef.current;
    if (!file) {
      toast({ title: "נדרש קובץ", description: "העלה שוב את אותו קובץ שאומת כדי להמשיך", variant: "destructive" });
      return;
    }
    setRecoveredPartialInfo(null);
    try {
      await transcribeWithLocalServer(file, undefined, {
        startFrom: partial.lastSegEnd,
        existingText: partial.text,
        existingWords: partial.wordTimings,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'CANCELLED') return;
      console.error('[Index] resume failed:', error);
    }
  };

  // Batch transcription wrapper - transcribes a single file and returns text
  const batchTranscribeFile = async (file: File, onProgress: (p: number) => void): Promise<string> => {
    if (file.size > MAX_AUDIO_SIZE_MB * 1024 * 1024) throw new Error(`הקובץ גדול מדי (מקסימום ${MAX_AUDIO_SIZE_MB}MB)`);

    const getKey = (name: string) => {
      const key = localStorage.getItem(name);
      if (!key) throw new Error(`נדרש מפתח API - הגדר בהגדרות`);
      return key;
    };

    const engineMap: Record<string, string> = {
      openai: 'transcribe-openai',
      groq: 'transcribe-groq',
      assemblyai: 'transcribe-assemblyai',
      deepgram: 'transcribe-deepgram',
    };

    if (engine === 'local') {
      const result = await localTranscribe(file);
      return typeof result === 'string' ? result : result.text;
    }

    if (engine === 'google') {
      const googleKey = getKey('google_api_key');
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const b64 = reader.result?.toString().split(',')[1];
          b64 ? resolve(b64) : reject(new Error('Failed to convert'));
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const { data, error } = await supabase.functions.invoke('transcribe-google', {
        body: { audio: base64, fileName: file.name, apiKey: googleKey, language: sourceLanguage, targetLanguage: 'he' }
      });
      if (error) throw error;
      if (!data?.text) throw new Error('No transcription received');
      return data.text;
    }

    // OpenAI, Groq, AssemblyAI, Deepgram
    const keyMap: Record<string, string> = {
      openai: 'openai_api_key', groq: 'groq_api_key',
      assemblyai: 'assemblyai_api_key', deepgram: 'deepgram_api_key',
    };
    const apiKey = getKey(keyMap[engine]);
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('fileName', file.name);
    form.append('apiKey', apiKey);
    form.append('language', sourceLanguage);
    if (engine === 'openai' || engine === 'groq') form.append('targetLanguage', 'he');

    const { data, error } = await xhrInvoke(engineMap[engine], form, onProgress);
    if (error) {
      const err = new Error(error.message || error.error || 'שגיאה בתמלול');
      (err as any).retryAfter = error.retryAfter;
      throw err;
    }
    if (!data?.text) throw new Error('No transcription received');
    return data.text;
  };

  const batchSaveTranscript = async (text: string, engineUsed: string, title: string) => {
    await saveTranscript(text, engineUsed, title, undefined, undefined);
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
                {recoveredPartialInfo.lastSegEnd && currentFileRef.current && (
                  <Button
                    variant="default"
                    size="sm"
                    className="text-xs gap-1"
                    onClick={handleResumeTranscription}
                  >
                    <Play className="h-3 w-3" />
                    המשך
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

        {/* Live Transcription */}
        <LiveTranscriber
          serverConnected={serverConnected}
          onTranscriptComplete={(text) => {
            setTranscript(text);
            saveToHistory(text, 'Live (Web Speech API)');
            addAnalyticsRecord({
              engine: 'Live (Web Speech API)', status: 'success',
              charCount: text.length, wordCount: text.split(/\s+/).length,
            });
            toast({ title: "תמלול חי הושלם!" });
            setTimeout(() => navigate('/text-editor', { state: { text } }), 1000);
          }}
        />



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
              <LocalModelManager />
            </CollapsibleContent>
          </Collapsible>
        )}

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
              <ShareTranscript transcript={transcript} />
            </div>
            <TranscriptSummary transcript={transcript} />
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
            <TranscriptEditor 
              transcript={transcript}
              onTranscriptChange={setTranscript}
              wordTimings={wordTimings}
              searchOpen={searchOpen}
              onSearchOpenChange={setSearchOpen}
            />
          </div>
        )}

        {/* YouTube Transcription — available when local server is connected */}
        {serverConnected && (
          <YouTubeTranscriber
            onTranscriptComplete={(text) => {
              setTranscript(text);
              saveToHistory(text, 'YouTube (Whisper GPU)');
              addAnalyticsRecord({
                engine: 'YouTube (Whisper GPU)', status: 'success',
                charCount: text.length, wordCount: text.split(/\s+/).length,
              });
              toast({ title: "תמלול YouTube הושלם!" });
              setTimeout(() => navigate('/text-editor', { state: { text } }), 1000);
            }}
          />
        )}

        {/* Speaker Diarization — available when local server is connected */}
        {serverConnected && (
          <SpeakerDiarization />
        )}
      </div>
    </div>
    <KeyboardShortcutsDialog open={showHelp} onOpenChange={setShowHelp} />
    </Suspense>
  );
};

export default Index;
