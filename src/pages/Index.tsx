import { useState, useEffect } from "react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useLocalTranscription } from "@/hooks/useLocalTranscription";
import { useCloudTranscripts } from "@/hooks/useCloudTranscripts";
import { Settings, FileEdit, ChevronDown } from "lucide-react";
import { BatchUploader } from "@/components/BatchUploader";
import { BackgroundJobsPanel } from "@/components/BackgroundJobsPanel";
import { useTranscriptionJobs } from "@/hooks/useTranscriptionJobs";
import { useAuth } from "@/contexts/AuthContext";

type Engine = 'openai' | 'groq' | 'google' | 'local' | 'assemblyai' | 'deepgram';
type SourceLanguage = 'auto' | 'he' | 'yi' | 'en';

const Index = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [engine, setEngine] = useState<Engine>('groq');
  const [sourceLanguage, setSourceLanguage] = useState<SourceLanguage>('auto');
  const [transcript, setTranscript] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // Formatting settings
  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState('Assistant');
  const [textColor, setTextColor] = useState('hsl(var(--foreground))');
  const [lineHeight, setLineHeight] = useState(1.6);

  const { transcribe: localTranscribe, isLoading: isLocalLoading, progress: localProgress } = useLocalTranscription();
  const { transcripts, isLoading: isCloudLoading, saveTranscript, updateTranscript, deleteTranscript, deleteAll, isCloud } = useCloudTranscripts();
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
  }, []);

  // Save formatting settings
  useEffect(() => {
    localStorage.setItem('transcript_fontSize', String(fontSize));
    localStorage.setItem('transcript_fontFamily', fontFamily);
    localStorage.setItem('transcript_textColor', textColor);
    localStorage.setItem('transcript_lineHeight', String(lineHeight));
    localStorage.setItem('transcript_sourceLanguage', sourceLanguage);
  }, [fontSize, fontFamily, textColor, lineHeight, sourceLanguage]);

  // Save to cloud history
  const saveToHistory = async (text: string, engineUsed: string) => {
    await saveTranscript(text, engineUsed);
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
    // Check file size (25MB limit)
    if (file.size > 25 * 1024 * 1024) {
      toast({
        title: "שגיאה",
        description: "הקובץ גדול מדי. גודל מקסימלי: 25MB",
        variant: "destructive",
      });
      return;
    }

    if (engine === 'openai') {
      await transcribeWithOpenAI(file);
    } else if (engine === 'groq') {
      await transcribeWithGroq(file);
    } else if (engine === 'google') {
      await transcribeWithGoogle(file);
    } else if (engine === 'assemblyai') {
      await transcribeWithAssemblyAI(file);
    } else if (engine === 'deepgram') {
      await transcribeWithDeepgram(file);
    } else {
      await transcribeLocally(file);
    }
  };

  const transcribeWithOpenAI = async (file: File) => {
    setIsUploading(true);
    
    try {
      console.log("[OpenAI] Starting transcription for:", file.name, "Size:", file.size);
      
      const openaiKey = localStorage.getItem("openai_api_key");
      console.log("[OpenAI] API Key found:", !!openaiKey);
      
      if (!openaiKey) {
        console.error("[OpenAI] No API key found in localStorage");
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

      console.log("[OpenAI] Uploading via XHR to edge function...");
      const { data, error } = await xhrInvoke('transcribe-openai', form, (p) => setUploadProgress(p));

      console.log("[OpenAI] Response:", { hasData: !!data, hasError: !!error });

      if (error) throw error;

      if (data?.text) {
        setTranscript(data.text);
        saveToHistory(data.text, 'OpenAI Whisper');
        toast({
          title: "הצלחה!",
          description: "התמלול הושלם בהצלחה - עובר לעריכת טקסט",
        });
        // Auto-navigate to text editor
        setTimeout(() => {
          navigate('/text-editor', { state: { text: data.text } });
        }, 1000);
      } else {
        throw new Error('No transcription received');
      }
    } catch (error) {
      console.error('Error transcribing with OpenAI:', error);
      toast({
        title: "שגיאה",
        description: error instanceof Error ? error.message : "שגיאה בתמלול הקובץ",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const transcribeWithGroq = async (file: File) => {
    console.log("[Groq] Starting transcription for:", file.name, "Size:", file.size);
    setIsUploading(true);

    try {
      const groqKey = localStorage.getItem("groq_api_key");
      console.log("[Groq] Checking API key in localStorage...");
      console.log("[Groq] All localStorage keys:", Object.keys(localStorage));
      console.log("[Groq] API Key found:", !!groqKey);
      
      if (groqKey) {
        console.log("[Groq] Key starts with:", groqKey.substring(0, 10));
      }
      
      if (!groqKey) {
        console.error("[Groq] No API key found in localStorage!");
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

      console.log("[Groq] Uploading via XHR...");
      const { data, error } = await xhrInvoke('transcribe-groq', form, (p) => setUploadProgress(p));

      console.log("[Groq] Response received:", { hasData: !!data, hasError: !!error });
      if (error) {
        console.error("[Groq] Error details:", error);
      }
      if (data) {
        console.log("[Groq] Data keys:", Object.keys(data));
      }

      if (error) {
        console.error("[Groq] Supabase function error:", error);
        throw error;
      }

      if (data?.text) {
        console.log("[Groq] Transcription received, length:", data.text.length);
        setTranscript(data.text);
        saveToHistory(data.text, 'Groq Whisper');
        toast({ 
          title: "הצלחה!", 
          description: "התמלול עם Groq הושלם בהצלחה - עובר לעריכת טקסט" 
        });
        // Auto-navigate to text editor
        setTimeout(() => {
          navigate('/text-editor', { state: { text: data.text } });
        }, 1000);
      } else {
        console.error("[Groq] No text in response data:", data);
        throw new Error('No transcription received from Groq');
      }
    } catch (error) {
      console.error('[Groq] Full error:', error);
      toast({
        title: "שגיאה בתמלול Groq",
        description: error instanceof Error ? error.message : "שגיאה לא ידועה",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const transcribeWithGoogle = async (file: File) => {
    console.log("[Google] Starting transcription for:", file.name);
    setIsUploading(true);

    try {
      const googleKey = localStorage.getItem("google_api_key");
      console.log("[Google] API Key found:", !!googleKey);

      if (!googleKey) {
        console.error("[Google] No API key found!");
        toast({
          title: "נדרש מפתח API",
          description: "יש להגדיר מפתח Google בהגדרות",
          variant: "destructive",
        });
        navigate("/login");
        setIsUploading(false);
        return;
      }

      console.log("[Google] Converting file...");
      toast({
        title: "מעלה קובץ...",
        description: "מעבד עם Google Speech-to-Text",
      });

      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const base64 = reader.result?.toString().split(',')[1];
          if (base64) {
            console.log("[Google] Base64 success");
            resolve(base64);
          } else reject(new Error('Failed to convert file'));
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const base64Audio = await base64Promise;

      console.log("[Google] Calling edge function...");
      const { data, error } = await supabase.functions.invoke('transcribe-google', {
        body: {
          audio: base64Audio,
          fileName: file.name,
          apiKey: googleKey,
          language: sourceLanguage,
          targetLanguage: 'he' // Always Hebrew output
        }
      });

      console.log("[Google] Response:", { hasData: !!data, hasError: !!error });

      if (error) {
        console.error("[Google] Error:", error);
        throw error;
      }

      if (data?.text) {
        console.log("[Google] Success, text length:", data.text.length);
        setTranscript(data.text);
        saveToHistory(data.text, 'Google Speech-to-Text');
        toast({
          title: "הצלחה!",
          description: "התמלול עם Google הושלם בהצלחה - עובר לעריכת טקסט"
        });
        // Auto-navigate to text editor
        setTimeout(() => {
          navigate('/text-editor', { state: { text: data.text } });
        }, 1000);
      } else {
        throw new Error('No transcription received from Google');
      }
    } catch (error) {
      console.error('[Google] Full error:', error);
      toast({
        title: "שגיאה בתמלול Google",
        description: error instanceof Error ? error.message : "שגיאה לא ידועה",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const transcribeLocally = async (file: File) => {
    try {
      const text = await localTranscribe(file);
      setTranscript(text);
      saveToHistory(text, 'Local (Browser)');
      toast({
        title: "הצלחה!",
        description: "התמלול המקומי הושלם בהצלחה - עובר לעריכת טקסט",
      });
      // Auto-navigate to text editor
      setTimeout(() => {
        navigate('/text-editor', { state: { text } });
      }, 1000);
    } catch (error) {
      console.error('Error transcribing locally:', error);
      toast({
        title: "שגיאה",
        description: error instanceof Error ? error.message : "שגיאה בתמלול מקומי",
        variant: "destructive",
      });
    }
  };

  const transcribeWithAssemblyAI = async (file: File) => {
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
        setTranscript(data.text);
        saveToHistory(data.text, 'AssemblyAI');
        toast({
          title: "הצלחה!",
          description: "התמלול הושלם בהצלחה - עובר לעריכת טקסט",
        });
        setTimeout(() => {
          navigate('/text-editor', { state: { text: data.text } });
        }, 1000);
      } else {
        throw new Error('No transcription received');
      }
    } catch (error) {
      console.error('Error transcribing with AssemblyAI:', error);
      toast({
        title: "שגיאה",
        description: error instanceof Error ? error.message : "שגיאה בתמלול הקובץ",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const transcribeWithDeepgram = async (file: File) => {
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
        setTranscript(data.text);
        saveToHistory(data.text, 'Deepgram');
        toast({
          title: "הצלחה!",
          description: "התמלול הושלם בהצלחה - עובר לעריכת טקסט",
        });
        setTimeout(() => {
          navigate('/text-editor', { state: { text: data.text } });
        }, 1000);
      } else {
        throw new Error('No transcription received');
      }
    } catch (error) {
      console.error('Error transcribing with Deepgram:', error);
      toast({
        title: "שגיאה",
        description: error instanceof Error ? error.message : "שגיאה בתמלול הקובץ",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const isLoading = isUploading || isLocalLoading;
  const progress = engine === 'local' ? localProgress : (isUploading ? uploadProgress : undefined);

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
      return await localTranscribe(file);
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
          />
          <AudioRecorder
            onRecordingComplete={handleFileSelect}
            isTranscribing={isLoading}
          />
        </div>

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
                input.accept = 'audio/*,video/*,.mp3,.wav,.webm,.m4a,.ogg,.mp4';
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
          jobs={jobs}
          isDisabled={isLoading}
          isAuthenticated={isAuthenticated}
        />
        {engine === 'local' && (
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
