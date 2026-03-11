import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { TranscriptionEngine } from "@/components/TranscriptionEngine";
import { FileUploader } from "@/components/FileUploader";
import { AudioRecorder } from "@/components/AudioRecorder";
import { LiveTranscriber } from "@/components/LiveTranscriber";
import { TranscriptEditor } from "@/components/TranscriptEditor";
import { CloudTranscriptHistory } from "@/components/CloudTranscriptHistory";
import { TranscriptSummary } from "@/components/TranscriptSummary";
import { ShareTranscript } from "@/components/ShareTranscript";
import { TextStyleControl } from "@/components/TextStyleControl";
import { LocalModelManager } from "@/components/LocalModelManager";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useLocalTranscription } from "@/hooks/useLocalTranscription";
import { useLocalServer } from "@/hooks/useLocalServer";
import { useBackgroundTask } from "@/hooks/useBackgroundTask";
import { debugLog } from "@/lib/debugLogger";
import { useCloudTranscripts } from "@/hooks/useCloudTranscripts";
import { Settings, FileEdit, ChevronDown, X, Zap, Globe, Chrome, Mic, Waves, Server, Cpu, Film } from "lucide-react";
import { BatchUploader } from "@/components/BatchUploader";
import { BackgroundJobsPanel } from "@/components/BackgroundJobsPanel";
import { useTranscriptionJobs } from "@/hooks/useTranscriptionJobs";
import { useAuth } from "@/contexts/AuthContext";
import { isVideoFile, extractAudioFromVideo, VIDEO_NEEDS_EXTRACTION, MAX_VIDEO_SIZE_MB, MAX_AUDIO_SIZE_MB } from "@/lib/videoUtils";

type Engine = 'openai' | 'groq' | 'google' | 'local' | 'local-server' | 'assemblyai' | 'deepgram';
type SourceLanguage = 'auto' | 'he' | 'yi' | 'en';

const Index = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [engine, setEngine] = useState<Engine>(() => {
    const saved = localStorage.getItem('transcript_engine') as Engine | null;
    return saved || 'groq';
  });
  const [sourceLanguage, setSourceLanguage] = useState<SourceLanguage>('auto');
  const [transcript, setTranscript] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // Formatting settings
  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState('Assistant');
  const [textColor, setTextColor] = useState('hsl(var(--foreground))');
  const [lineHeight, setLineHeight] = useState(1.6);

  // Audio & word timing state for sync player
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [wordTimings, setWordTimings] = useState<Array<{word: string, start: number, end: number}>>([]);

  const { transcribe: localTranscribe, isLoading: isLocalLoading, progress: localProgress } = useLocalTranscription();
  const { transcribeStream: serverTranscribeStream, isLoading: isServerLoading, progress: serverProgress, isConnected: serverConnected, recoverPartial, clearPartial, cancelStream: cancelServerStream } = useLocalServer();
  const bgTask = useBackgroundTask();
  const { transcripts, isLoading: isCloudLoading, saveTranscript, updateTranscript, deleteTranscript, deleteAll, isCloud, getAudioUrl } = useCloudTranscripts();
  const { jobs, submitJob, submitBatchJobs, retryJob, deleteJob } = useTranscriptionJobs();

  // Load formatting settings from localStorage
  useEffect(() => {
    const savedFontSize = localStorage.getItem('transcript_fontSize');
    const savedFontFamily = localStorage.getItem('transcript_fontFamily');
    const savedTextColor = localStorage.getItem('transcript_textColor');
    const savedLineHeight = localStorage.getItem('transcript_lineHeight');
    const savedSourceLang = localStorage.getItem('transcript_sourceLanguage');

    if (savedFontSize) setFontSize(Number(savedFontSize));
    if (savedFontFamily) setFontFamily(savedFontFamily);
    if (savedTextColor) setTextColor(savedTextColor);
    if (savedLineHeight) setLineHeight(Number(savedLineHeight));
    if (savedSourceLang) setSourceLanguage(savedSourceLang as SourceLanguage);

    // Recover partial transcription from a previous interrupted session
    const partial = recoverPartial();
    if (partial && partial.text) {
      setTranscript(partial.text);
      setWordTimings(partial.wordTimings || []);
      toast({
        title: "שוחזר תמלול חלקי",
        description: `נמצא תמלול שהופסק (${partial.progress}%) — ${partial.wordTimings?.length || 0} מילים`,
      });
      debugLog.info('Recovery', `Restored partial transcript: ${partial.progress}%, ${partial.text.length} chars`);
    }
  }, []);

  // Save formatting settings
  useEffect(() => {
    localStorage.setItem('transcript_fontSize', String(fontSize));
    localStorage.setItem('transcript_fontFamily', fontFamily);
    localStorage.setItem('transcript_textColor', textColor);
    localStorage.setItem('transcript_lineHeight', String(lineHeight));
    localStorage.setItem('transcript_sourceLanguage', sourceLanguage);
  }, [fontSize, fontFamily, textColor, lineHeight, sourceLanguage]);

  // Save engine choice & auto-switch to local GPU when available
  useEffect(() => {
    localStorage.setItem('transcript_engine', engine);
  }, [engine]);

  useEffect(() => {
    if (serverConnected && engine === 'groq') {
      setEngine('local-server');
    }
  }, [serverConnected]);

  // Keep reference to current file for saving with transcript
  const currentFileRef = useRef<File | null>(null);

  // Save to cloud history
  const saveToHistory = async (text: string, engineUsed: string) => {
    await saveTranscript(text, engineUsed, undefined, currentFileRef.current || undefined);
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
    console.log(`[Index] handleFileSelect — file:${file.name} (${(file.size/1024).toFixed(0)}KB), engine:${engine}, serverConnected:${serverConnected}`);
    currentFileRef.current = file;
    
    const isVideo = isVideoFile(file);
    const maxMB = isVideo ? MAX_VIDEO_SIZE_MB : MAX_AUDIO_SIZE_MB;
    
    // Check file size (dynamic limit based on type)
    if (file.size > maxMB * 1024 * 1024) {
      debugLog.error('Upload', 'קובץ גדול מדי', { size: file.size, maxMB });
      toast({
        title: "שגיאה",
        description: `הקובץ גדול מדי. גודל מקסימלי ל${isVideo ? 'וידאו' : 'אודיו'}: ${maxMB}MB`,
        variant: "destructive",
      });
      return;
    }

    // Preserve media URL for playback
    const url = URL.createObjectURL(file);
    setAudioUrl(url);

    // If video file and engine requires audio-only → extract audio first
    let fileToTranscribe = file;
    if (isVideo && VIDEO_NEEDS_EXTRACTION.has(engine)) {
      debugLog.info('Video', `מחלץ אודיו מוידאו: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
      toast({
        title: "🎬 מחלץ אודיו מוידאו...",
        description: `${engine === 'google' ? 'Google Speech-to-Text' : engine} דורש קובץ אודיו — מחלץ אוטומטית`,
      });
      try {
        fileToTranscribe = await extractAudioFromVideo(file, (p) => {
          setUploadProgress(Math.round(p * 0.3)); // 0-30% for extraction
        });
        debugLog.info('Video', `חילוץ אודיו הושלם: ${fileToTranscribe.name} (${(fileToTranscribe.size / 1024 / 1024).toFixed(1)}MB)`);
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

    debugLog.info('Transcription', `התחלת תמלול: ${fileToTranscribe.name} (${(fileToTranscribe.size / 1024 / 1024).toFixed(1)}MB) עם ${engine}`);
    console.log(`[Index] bgTask.run starting — bgTask.status=${bgTask.status}, isRunning=${bgTask.isRunning}`);

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
        saveToHistory(data.text, 'OpenAI Whisper');
        toast({
          title: "הצלחה!",
          description: "התמלול הושלם בהצלחה - עובר לעריכת טקסט",
        });
        // Auto-navigate to text editor
        setTimeout(() => {
          navigate('/text-editor', { state: { text: data.text, audioUrl: fileAudioUrl, wordTimings: timings } });
        }, 1000);
      } else {
        throw new Error('No transcription received');
      }
    } catch (error) {
      debugLog.error('OpenAI', 'Transcription failed', error instanceof Error ? error.message : error);
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
        saveToHistory(data.text, 'Groq Whisper');
        toast({ 
          title: "הצלחה!", 
          description: "התמלול עם Groq הושלם בהצלחה - עובר לעריכת טקסט" 
        });
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
        saveToHistory(data.text, 'Google Speech-to-Text');
        toast({
          title: "הצלחה!",
          description: "התמלול עם Google הושלם בהצלחה - עובר לעריכת טקסט"
        });
        // Auto-navigate to text editor
        setTimeout(() => {
          navigate('/text-editor', { state: { text: data.text, audioUrl: fileAudioUrl, wordTimings: timings } });
        }, 1000);
      } else {
        throw new Error('No transcription received from Google');
      }
    } catch (error) {
      debugLog.error('Google', 'Transcription failed', error instanceof Error ? error.message : error);
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
      saveToHistory(result.text, 'Local (Browser)');
      toast({
        title: "הצלחה!",
        description: "התמלול המקומי הושלם בהצלחה - עובר לעריכת טקסט",
      });
      // Auto-navigate to text editor
      setTimeout(() => {
        navigate('/text-editor', { state: { text: result.text, audioUrl: fileAudioUrl, wordTimings: result.wordTimings } });
      }, 1000);
    } catch (error) {
      debugLog.error('Local', 'Browser transcription failed', error instanceof Error ? error.message : error);
      toast({
        title: "שגיאה",
        description: error instanceof Error ? error.message : "שגיאה בתמלול מקומי",
        variant: "destructive",
      });
      throw error;
    }
  };

  const transcribeWithLocalServer = async (file: File, fileAudioUrl?: string) => {
    console.log(`[Index] transcribeWithLocalServer — serverConnected:${serverConnected}, engine:${engine}`);
    if (!serverConnected) {
      console.warn('[Index] ❌ serverConnected is FALSE — aborting transcription');
      toast({
        title: "שרת לא מחובר",
        description: "הפעל את השרת המקומי: python server/transcribe_server.py",
        variant: "destructive",
      });
      return;
    }

    try {
      const preferredModel = localStorage.getItem('preferred_local_model') || undefined;
      const lang = sourceLanguage === 'auto' ? 'auto' : sourceLanguage;
      console.log(`[Index] 🚀 calling serverTranscribeStream — model:${preferredModel ?? 'default'}, lang:${lang}, file:${file.name}`);
      toast({ title: "מתמלל עם GPU...", description: "מעבד את הקובץ בשרת המקומי עם CUDA — תראה תוצאות בזמן אמת" });

      const result = await serverTranscribeStream(file, preferredModel, lang, (partial) => {
        // Update live as segments arrive
        setTranscript(partial.text);
        setWordTimings(partial.wordTimings);
        console.log(`[Index] 📊 partial callback — progress:${partial.progress}%, words:${partial.wordTimings.length}`);
        debugLog.info('CUDA Stream', `${partial.progress}% — ${partial.wordTimings.length} מילים`);
      });
      console.log(`[Index] ✅ serverTranscribeStream finished — text length:${result.text?.length}, processing_time:${result.processing_time}s`);

      const timings = result.wordTimings || [];
      setTranscript(result.text);
      setWordTimings(timings);
      saveToHistory(result.text, `Local CUDA (${result.model || 'server'})`);
      clearPartial();
      toast({
        title: "הצלחה!",
        description: `תמלול GPU הושלם ב-${result.processing_time || '?'}s — עובר לעריכת טקסט`,
      });
      setTimeout(() => {
        navigate('/text-editor', { state: { text: result.text, audioUrl: fileAudioUrl, wordTimings: timings } });
      }, 1000);
    } catch (error) {
      if (error instanceof Error && error.message === 'CANCELLED') {
        toast({ title: "תמלול הופסק", description: "התמלול בוטל על ידי המשתמש" });
        return;
      }
      debugLog.error('CUDA Server', 'Transcription failed', error instanceof Error ? error.message : error);
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

      const { data, error } = await xhrInvoke('transcribe-assemblyai', form, (p) => setUploadProgress(p));

      if (error) throw error;

      if (data?.text) {
        const timings = data.wordTimings || [];
        setTranscript(data.text);
        setWordTimings(timings);
        saveToHistory(data.text, 'AssemblyAI');
        toast({
          title: "הצלחה!",
          description: "התמלול הושלם בהצלחה - עובר לעריכת טקסט",
        });
        setTimeout(() => {
          navigate('/text-editor', { state: { text: data.text, audioUrl: fileAudioUrl, wordTimings: timings } });
        }, 1000);
      } else {
        throw new Error('No transcription received');
      }
    } catch (error) {
      debugLog.error('AssemblyAI', 'Transcription failed', error instanceof Error ? error.message : error);
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

      const { data, error } = await xhrInvoke('transcribe-deepgram', form, (p) => setUploadProgress(p));

      if (error) throw error;

      if (data?.text) {
        const timings = data.wordTimings || [];
        setTranscript(data.text);
        setWordTimings(timings);
        saveToHistory(data.text, 'Deepgram');
        toast({
          title: "הצלחה!",
          description: "התמלול הושלם בהצלחה - עובר לעריכת טקסט",
        });
        setTimeout(() => {
          navigate('/text-editor', { state: { text: data.text, audioUrl: fileAudioUrl, wordTimings: timings } });
        }, 1000);
      } else {
        throw new Error('No transcription received');
      }
    } catch (error) {
      debugLog.error('Deepgram', 'Transcription failed', error instanceof Error ? error.message : error);
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

  // ── Debug: watch loading/progress state ──
  useEffect(() => {
    console.log(`[Index] 🔄 STATE — isLoading:${isLoading} | bgTask:${bgTask.status} | isServerLoading:${isServerLoading} | serverProgress:${serverProgress} | isUploading:${isUploading} | serverConnected:${serverConnected}`);
  }, [isLoading, bgTask.status, isServerLoading, serverProgress, isUploading, serverConnected]);

  // Elapsed time counter — starts fresh each time a transcription begins
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval>>();
  useEffect(() => {
    if (isLoading) {
      setElapsedSeconds(0);
      elapsedIntervalRef.current = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    } else {
      clearInterval(elapsedIntervalRef.current);
    }
    return () => clearInterval(elapsedIntervalRef.current);
  }, [isLoading]);

  const handleCancelTranscription = () => {
    if (engine === 'local-server') {
      cancelServerStream();
    }
    bgTask.reset();
    setIsUploading(false);
  };

  // Batch transcription wrapper - transcribes a single file and returns text
  const batchTranscribeFile = async (file: File, onProgress: (p: number) => void): Promise<string> => {
    if (file.size > 25 * 1024 * 1024) throw new Error("הקובץ גדול מדי (מקסימום 25MB)");

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
    await saveTranscript(text, engineUsed);
  };

  return (
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
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => navigate("/settings")}
          >
            <Settings className="h-4 w-4" />
          </Button>
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
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FileUploader 
            onFileSelect={handleFileSelect} 
            isLoading={isLoading}
            progress={progress}
            engine={engine}
          />
          <AudioRecorder
            onRecordingComplete={handleFileSelect}
            isTranscribing={isLoading}
            engine={engine}
          />
        </div>

        {/* Active transcription progress panel */}
        {isLoading && (
          <Card className="p-4 border-primary/40 bg-primary/5 shadow-sm" dir="rtl">
            <div className="flex items-center gap-3">
              <div className="flex-1 space-y-2 text-right">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-mono text-xs text-muted-foreground">
                    {String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:{String(elapsedSeconds % 60).padStart(2, '0')} ⏱
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {progress !== undefined && progress > 0 ? `מתמלל... ${progress}%` : 'מתמלל...'}
                    </span>
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
                  </div>
                </div>
                <div className="relative h-2.5 rounded-full bg-muted overflow-hidden">
                  {progress === undefined || progress === 0 ? (
                    <div className="absolute inset-0 rounded-full overflow-hidden">
                      <div className="h-full w-full bg-primary/30 rounded-full" />
                      <div
                        className="absolute top-0 h-full w-1/3 bg-primary/70 rounded-full"
                        style={{ animation: 'transcription-scan 1.6s ease-in-out infinite' }}
                      />
                    </div>
                  ) : (
                    <div
                      className="absolute top-0 left-0 h-full rounded-full bg-primary transition-[width] duration-300 ease-out overflow-hidden"
                      style={{ width: `${Math.max(progress, 3)}%` }}
                    >
                      <div className="absolute top-0 right-0 h-full w-5 bg-white/40 animate-pulse" />
                    </div>
                  )}
                </div>
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0 text-destructive border-destructive/40 hover:bg-destructive/10"
                onClick={handleCancelTranscription}
                title="עצור תמלול"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        )}

        {/* Background transcription option for authenticated users */}
        {isAuthenticated && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'audio/*,video/*,.mp3,.wav,.m4a,.flac,.ogg,.opus,.aac,.wma,.amr,.mp4,.webm,.avi,.mov,.mkv,.wmv,.3gp,.aiff,.aif,.caf,.spx,.gsm';
                input.onchange = async (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (!file) return;
                  if (file.size > 50 * 1024 * 1024) {
                    toast({ title: "הקובץ גדול מדי", description: "מקסימום 50MB לתמלול ברקע", variant: "destructive" });
                    return;
                  }
                  await submitJob(file, engine, sourceLanguage);
                };
                input.click();
              }}
            >
              🔄 תמלול ברקע (ימשיך גם אם תעזוב)
            </Button>
            <span className="text-xs text-muted-foreground">הקובץ יעלה לשרת ויתומלל גם בלי שהעמוד פתוח</span>
          </div>
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
          onTranscriptComplete={(text) => {
            setTranscript(text);
            saveToHistory(text, 'Live (Web Speech API)');
            toast({ title: "תמלול חי הושלם!" });
            setTimeout(() => navigate('/text-editor', { state: { text } }), 1000);
          }}
        />

        {/* Batch Upload */}
        <BatchUploader
          onSubmitBatch={(files) => submitBatchJobs(files, engine, sourceLanguage)}
          onSaveTranscript={batchSaveTranscript}
          onRetryJob={retryJob}
          jobs={jobs}
          isDisabled={isLoading}
          isAuthenticated={isAuthenticated}
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
        />

        {transcript && (
          <>
            <TranscriptSummary transcript={transcript} />
            
            <ShareTranscript transcript={transcript} />
            
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
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
