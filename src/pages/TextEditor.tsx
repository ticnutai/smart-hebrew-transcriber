import { useState, useEffect, useRef, lazy, Suspense, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RichTextEditor } from "@/components/RichTextEditor";
import { debugLog } from "@/lib/debugLogger";
import type { TextVersion } from "@/components/TextEditHistory";
import type { WordTiming } from "@/components/SyncAudioPlayer";

// Lazy-loaded heavy components
const AIEditorDual = lazy(() => import("@/components/AIEditorDual").then(m => ({ default: m.AIEditorDual })));
const TextComparisonMulti = lazy(() => import("@/components/TextComparisonMulti").then(m => ({ default: m.TextComparisonMulti })));
const EditingTemplates = lazy(() => import("@/components/EditingTemplates").then(m => ({ default: m.EditingTemplates })));
const AdvancedDiffView = lazy(() => import("@/components/AdvancedDiffView").then(m => ({ default: m.AdvancedDiffView })));
const TextStyleControl = lazy(() => import("@/components/TextStyleControl").then(m => ({ default: m.TextStyleControl })));
const TextEditHistory = lazy(() => import("@/components/TextEditHistory").then(m => ({ default: m.TextEditHistory })));
const PromptLibrary = lazy(() => import("@/components/PromptLibrary").then(m => ({ default: m.PromptLibrary })));
const EditPipeline = lazy(() => import("@/components/EditPipeline").then(m => ({ default: m.EditPipeline })));
const OllamaManager = lazy(() => import("@/components/OllamaManager").then(m => ({ default: m.OllamaManager })));
const CorrectionLearningPanel = lazy(() => import("@/components/CorrectionLearningPanel").then(m => ({ default: m.CorrectionLearningPanel })));
const SyncAudioPlayer = lazy(() => import("@/components/SyncAudioPlayer").then(m => ({ default: m.SyncAudioPlayer })));
const SyncTranscriptView = lazy(() => import("@/components/SyncTranscriptView").then(m => ({ default: m.SyncTranscriptView })));
const VocabularyPanel = lazy(() => import("@/components/VocabularyPanel").then(m => ({ default: m.VocabularyPanel })));
const AutoSummaryCard = lazy(() => import("@/components/AutoSummaryCard").then(m => ({ default: m.AutoSummaryCard })));
const EngineCompare = lazy(() => import("@/components/EngineCompare").then(m => ({ default: m.EngineCompare })));
const AnalyticsDashboard = lazy(() => import("@/components/AnalyticsDashboard").then(m => ({ default: m.AnalyticsDashboard })));
const SpeakerDiarization = lazy(() => import("@/components/SpeakerDiarization").then(m => ({ default: m.SpeakerDiarization })));
import { ArrowRight, Home, Wand2, SplitSquareVertical, SpellCheck, Loader2, Columns2, Columns3, AlignJustify, LayoutGrid, Rows3, Save, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { editTranscriptCloud } from "@/utils/editTranscriptApi";
import { toast } from "@/hooks/use-toast";
import { useCloudPreferences } from "@/hooks/useCloudPreferences";
import { useCloudTranscripts } from "@/hooks/useCloudTranscripts";
import { useCloudVersions } from "@/hooks/useCloudVersions";
import { useOllama, isOllamaModel } from "@/hooks/useOllama";
import { db } from "@/lib/localDb";
import { useCorrectionLearning } from "@/hooks/useCorrectionLearning";
import { LazyErrorBoundary } from "@/components/LazyErrorBoundary";

const sourceLabels: Record<string, string> = {
  original: 'תמלול מקורי',
  manual: 'עריכה ידנית',
  'ai-improve': 'שיפור ניסוח',
  'ai-sources': 'הוספת מקורות',
  'ai-readable': 'זורם לקריאה',
  'ai-custom': 'פרומפט מותאם',
  'ai-fix': 'תיקון ועיבוד',
  'ai-grammar': 'דקדוק ואיות',
  'ai-punctuation': 'פיסוק',
  'ai-paragraphs': 'חלוקה לפסקאות',
  'ai-bullets': 'נקודות מפתח',
  'ai-headings': 'כותרות',
  'ai-expand': 'הרחבה',
  'ai-shorten': 'קיצור',
  'ai-summarize': 'סיכום',
  'ai-translate': 'תרגום',
  'ai-speakers': 'זיהוי דוברים',
  'ai-tone': 'שינוי טון',
};

const TextEditor = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [text, setText] = useState("");
  const [versions, setVersions] = useState<TextVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>();
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioFileName, setAudioFileName] = useState<string>("");
  const [wordTimings, setWordTimings] = useState<WordTiming[]>([]);
  const [playerTime, setPlayerTime] = useState(0);
  const transcriptIdRef = useRef<string | null>(null);
  const manualVersionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { updateTranscript, getAudioUrl } = useCloudTranscripts();
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [transcriptId, setTranscriptId] = useState<string | null>(null);
  const { versions: cloudVersions, isLoading: cloudVersionsLoading, saveVersion: saveCloudVersion } = useCloudVersions(transcriptId);
  const ollama = useOllama();
  const { learn: learnCorrections, applyCorrections } = useCorrectionLearning();
  const originalTextRef = useRef<string>("");
  
  // Cloud-synced style settings
  const { preferences, updatePreference } = useCloudPreferences();
  const fontSize = preferences.font_size;
  const fontFamily = preferences.font_family;
  const textColor = preferences.text_color;
  const lineHeight = preferences.line_height;
  const setFontSize = (v: number) => updatePreference('font_size', v);
  const setFontFamily = (v: string) => updatePreference('font_family', v);
  const setTextColor = (v: string) => updatePreference('text_color', v);
  const setLineHeight = (v: number) => updatePreference('line_height', v);

  // Column view (cloud-synced)
  const columns = preferences.editor_columns;
  const setColumns = (v: number) => updatePreference('editor_columns', v);

  const columnStyle: React.CSSProperties = columns > 1 ? {
    columnCount: columns,
    columnGap: '2rem',
    columnRule: '1px solid hsl(var(--border))',
  } : {};

  // Recover audio from Dexie IndexedDB (last saved blob)
  const tryRecoverAudioFromDexie = useCallback(async () => {
    try {
      const entry = await db.audioBlobs.get('last_audio');
      if (entry?.blob) {
        const url = URL.createObjectURL(entry.blob);
        setAudioUrl(url);
        setAudioBlob(entry.blob);
        setAudioFileName(entry.name || '');
        debugLog.info('TextEditor', `Audio recovered from Dexie: ${entry.name}`);
      }
    } catch { /* Dexie not available */ }
  }, []);

  useEffect(() => {
    debugLog.info('TextEditor', '📝 TextEditor mounted');
    return () => debugLog.info('TextEditor', '📝 TextEditor unmounted');
  }, []);

  // Always try to load audio blob from Dexie for SpeakerDiarization passthrough
  useEffect(() => {
    (async () => {
      try {
        const entry = await db.audioBlobs.get('last_audio');
        if (entry?.blob) {
          setAudioBlob(entry.blob);
          setAudioFileName(entry.name || '');
        }
      } catch { /* Dexie not available */ }
    })();
  }, []);

  // Fallback: if audioUrl exists but audioBlob is still null, fetch the blob from URL
  useEffect(() => {
    if (audioBlob || !audioUrl) return;
    (async () => {
      try {
        const resp = await fetch(audioUrl);
        if (resp.ok) {
          const blob = await resp.blob();
          setAudioBlob(blob);
          // Also persist to Dexie for diarization recovery
          try {
            await db.audioBlobs.put({ id: 'last_audio', blob, type: blob.type, name: audioFileName || 'audio', saved_at: Date.now() });
          } catch { /* Dexie not available */ }
        }
      } catch { /* fetch failed */ }
    })();
  }, [audioUrl, audioBlob, audioFileName]);

  useEffect(() => {
    // Get text from navigation state or localStorage
    const stateText = location.state?.text;
    if (stateText) {
      setText(stateText);
      originalTextRef.current = stateText;
      const initialVersion: TextVersion = {
        id: crypto.randomUUID(),
        text: stateText,
        timestamp: new Date(),
        source: 'original'
      };
      setVersions([initialVersion]);
      setSelectedVersionId(initialVersion.id);
      // Save to localStorage for persistence
      localStorage.setItem('current_editing_text', stateText);
      localStorage.setItem('text_versions', JSON.stringify([initialVersion]));
      // Save initial version to cloud
      if (location.state?.transcriptId) {
        // Defer to avoid calling saveCloudVersion before hook is ready
        setTimeout(() => {
          saveCloudVersion(stateText, 'original', null, 'תמלול מקורי');
        }, 500);
      }
    } else {
      // Try to load from localStorage
      const savedText = localStorage.getItem('current_editing_text');
      const savedVersions = localStorage.getItem('text_versions');
      
      if (savedVersions) {
        try {
          const parsedVersions = JSON.parse(savedVersions).map((v: any) => ({
            ...v,
            timestamp: new Date(v.timestamp)
          }));
          setVersions(parsedVersions);
          setSelectedVersionId(parsedVersions[parsedVersions.length - 1]?.id);
        } catch {
          // Corrupted localStorage — reset
          localStorage.removeItem('text_versions');
        }
      }
      
      if (savedText) {
        setText(savedText);
      }
    }

    // Track transcript ID for cloud saves
    if (location.state?.transcriptId) {
      transcriptIdRef.current = location.state.transcriptId;
      setTranscriptId(location.state.transcriptId);
    }

    // Load audio URL from navigation state or resolve from Supabase Storage
    if (location.state?.audioUrl) {
      const url = location.state.audioUrl as string;
      if (url.startsWith('blob:')) {
        // Blob URLs only support GET (HEAD fails), so use a minimal range GET to verify
        fetch(url).then((resp) => {
          if (resp.ok || resp.status === 206) {
            resp.body?.cancel(); // Don't download the whole file
            setAudioUrl(url);
          }
        }).catch(() => {
          // Blob URL expired — try recovering from Dexie
          tryRecoverAudioFromDexie();
        });
      } else {
        setAudioUrl(url);
      }
    } else if (location.state?.audioFilePath) {
      // Load audio from Supabase Storage (when opening from history)
      getAudioUrl(location.state.audioFilePath).then((url) => {
        if (url) setAudioUrl(url);
      });
    } else {
      // No audio URL in navigation state — try recovering from Dexie
      tryRecoverAudioFromDexie();
    }

    // Load word timings from state, or fallback to localStorage, or fetch from cloud
    if (location.state?.wordTimings) {
      setWordTimings(location.state.wordTimings);
    } else if (location.state?.transcriptId) {
      // Try fetching word_timings from cloud
      supabase
        .from('transcripts')
        .select('word_timings')
        .eq('id', location.state.transcriptId)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.word_timings && Array.isArray(data.word_timings) && data.word_timings.length > 0) {
            setWordTimings(data.word_timings as unknown as WordTiming[]);
            debugLog.info('TextEditor', `Loaded ${(data.word_timings as any[]).length} word timings from cloud`);
          }
        });
    } else {
      try {
        const saved = localStorage.getItem('last_word_timings');
        if (saved) setWordTimings(JSON.parse(saved));
      } catch { /* corrupted */ }
    }

  }, [location.state]);

  // Auto-save text and versions to localStorage + debounce cloud save
  const cloudSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // Debounce localStorage writes (500ms)
    if (localSaveTimerRef.current) clearTimeout(localSaveTimerRef.current);
    localSaveTimerRef.current = setTimeout(() => {
      if (text) {
        localStorage.setItem('current_editing_text', text);
      }
      if (versions.length > 0) {
        localStorage.setItem('text_versions', JSON.stringify(versions));
      }
    }, 500);
    // Debounce save edited_text to cloud (3s after last change)
    if (transcriptIdRef.current && text) {
      if (cloudSaveTimerRef.current) clearTimeout(cloudSaveTimerRef.current);
      cloudSaveTimerRef.current = setTimeout(() => {
        if (transcriptIdRef.current) {
          updateTranscript(transcriptIdRef.current, { edited_text: text });
          debugLog.info('TextEditor', 'Auto-saved edited_text to cloud');
        }
      }, 3000);
    }
    return () => {
      if (cloudSaveTimerRef.current) clearTimeout(cloudSaveTimerRef.current);
      if (localSaveTimerRef.current) clearTimeout(localSaveTimerRef.current);
    };
  }, [text, versions]);

  const addVersion = (newText: string, source: TextVersion['source'], customPrompt?: string) => {
    const newVersion: TextVersion = {
      id: crypto.randomUUID(),
      text: newText,
      timestamp: new Date(),
      source,
      customPrompt
    };
    setVersions(prev => [...prev, newVersion]);
    setSelectedVersionId(newVersion.id);
    setText(newText);
    // Also save to cloud versions
    if (transcriptId) {
      saveCloudVersion(newText, source, customPrompt || null, sourceLabels[source] || source);
    }
  };

  const handleSaveVersion = (text: string, source: string, engineLabel: string, actionLabel: string) => {
    // Save version to cloud WITHOUT replacing the main text
    if (transcriptId) {
      saveCloudVersion(text, source, engineLabel, actionLabel);
      toast({ title: 'גרסה נשמרה בענן ☁️', description: `${engineLabel} — ${actionLabel}` });
    } else {
      toast({ title: 'לא ניתן לשמור', description: 'יש צורך בתמלול שמור בענן', variant: 'destructive' });
    }
  };

  const handleVersionSelect = (version: TextVersion) => {
    setSelectedVersionId(version.id);
    setText(version.text);
  };

  const handleRestoreVersion = (newText: string) => {
    setText(newText);
    addVersion(newText, 'manual', 'שחזור גרסה');
    toast({ title: 'גרסה שוחזרה ✅' });
  };

  

  const [aiAction, setAiAction] = useState<string | null>(null);

  const handleAiQuickAction = async (action: 'fix_errors' | 'split_paragraphs' | 'fix_and_split') => {
    if (!text.trim()) {
      toast({ title: "אין טקסט לעיבוד", variant: "destructive" });
      return;
    }
    setAiAction(action);
    const labels: Record<string, string> = {
      fix_errors: 'תיקון שגיאות',
      split_paragraphs: 'חלוקה לפסקאות',
      fix_and_split: 'תיקון + חלוקה',
    };
    try {
      let resultText: string | undefined;

      // Prefer Ollama if connected (offline-first)
      if (ollama.isConnected && ollama.models.length > 0) {
        const model = ollama.models[0].name;
        resultText = await ollama.editText({ text, action, model });
      } else {
        // Cloud: DB proxy → edge function fallback
        resultText = await editTranscriptCloud({ text, action });
      }

      if (!resultText) throw new Error('לא התקבלה תשובה מ-AI');
      addVersion(resultText, 'ai-fix', labels[action]);
      toast({ title: `${labels[action]} הושלם ✅` });
    } catch (err) {
      // If Ollama failed, try cloud as fallback
      if (ollama.isConnected) {
        try {
          const cloudText = await editTranscriptCloud({ text, action });
          if (cloudText) {
            addVersion(cloudText, 'ai-fix', labels[action]);
            toast({ title: `${labels[action]} הושלם ✅ (ענן)` });
            return;
          }
        } catch { /* cloud also failed */ }
      }
      console.error('AI action error:', err);
      toast({ title: "שגיאה בעיבוד AI", description: err instanceof Error ? err.message : 'שגיאה', variant: "destructive" });
    } finally {
      setAiAction(null);
    }
  };

  const handleEditorChange = useCallback((newText: string) => {
    setText(newText);
    // Debounce manual version creation (2s)
    if (manualVersionTimerRef.current) clearTimeout(manualVersionTimerRef.current);
    manualVersionTimerRef.current = setTimeout(() => {
      addVersion(newText, 'manual');
      // Learn from user corrections
      if (originalTextRef.current && newText !== originalTextRef.current) {
        learnCorrections(originalTextRef.current, newText, 'manual');
      }
    }, 2000);
  }, [learnCorrections]);

  const buildSyncedTimings = useCallback((editedText: string): WordTiming[] | null => {
    if (!wordTimings.length) return null;
    const totalDuration = wordTimings[wordTimings.length - 1]?.end || 0;
    if (totalDuration <= 0) return null;
    const words = editedText.split(/\s+/).filter(Boolean);
    if (words.length === 0) return null;

    const wordDuration = totalDuration / words.length;
    return words.map((word, i) => ({
      word,
      start: i * wordDuration,
      end: (i + 1) * wordDuration,
    }));
  }, [wordTimings]);

  const handleSyncToPlayer = useCallback((editedText: string) => {
    const newTimings = buildSyncedTimings(editedText);
    if (!newTimings) {
      toast({ title: "אין נתוני תזמון", description: "צריך אודיו עם תזמונים כדי לסנכרן", variant: "destructive" });
      return;
    }

    setWordTimings(newTimings);
    setText(editedText);
    toast({ title: "מסונכרן לנגן ✅", description: `${newTimings.length} מילים סונכרנו עם האודיו` });
  }, [buildSyncedTimings]);

  const handleSaveAndReplaceOriginal = useCallback(async (
    editedText: string,
    source: string,
    engineLabel: string,
    actionLabel: string,
  ) => {
    const id = transcriptIdRef.current;
    if (!id) {
      toast({ title: 'לא ניתן לשמור', description: 'יש צורך בתמלול שמור בענן', variant: 'destructive' });
      return;
    }

    const syncedTimings = buildSyncedTimings(editedText);
    await updateTranscript(id, {
      text: editedText,
      edited_text: editedText,
      ...(syncedTimings ? { word_timings: syncedTimings } : {}),
    });

    setText(editedText);
    if (syncedTimings) setWordTimings(syncedTimings);
    if (transcriptId) {
      saveCloudVersion(editedText, source, engineLabel, `${actionLabel} • החלפת מקור`);
    }

    toast({
      title: 'נשמר והוחלף במקור ✅',
      description: syncedTimings ? 'הטקסט והסנכרון לנגן עודכנו במקור' : 'הטקסט במקור עודכן',
    });
  }, [buildSyncedTimings, saveCloudVersion, transcriptId, updateTranscript]);

  const handleDuplicateAndSave = useCallback(async (
    editedText: string,
    source: string,
    engineLabel: string,
    actionLabel: string,
  ) => {
    const id = transcriptIdRef.current;
    if (!id) {
      toast({ title: 'לא ניתן לשכפל', description: 'יש צורך בתמלול שמור בענן', variant: 'destructive' });
      return;
    }

    const { data: current, error: loadError } = await supabase
      .from('transcripts')
      .select('user_id, engine, tags, notes, title, folder, category, is_favorite, audio_file_path, word_timings')
      .eq('id', id)
      .maybeSingle();

    if (loadError || !current) {
      toast({ title: 'שגיאה בשכפול', description: 'לא ניתן לקרוא את התמלול המקורי', variant: 'destructive' });
      return;
    }

    const syncedTimings = buildSyncedTimings(editedText);
    const duplicateTitle = `${current.title || 'תמלול'} (עותק)`;
    const { data: inserted, error: insertError } = await supabase
      .from('transcripts')
      .insert({
        user_id: current.user_id,
        text: editedText,
        edited_text: editedText,
        engine: current.engine,
        tags: current.tags || [],
        notes: current.notes || '',
        title: duplicateTitle,
        folder: current.folder || '',
        category: current.category || '',
        is_favorite: current.is_favorite || false,
        audio_file_path: current.audio_file_path,
        word_timings: syncedTimings || current.word_timings || null,
      })
      .select('id')
      .single();

    if (insertError) {
      toast({ title: 'שגיאה בשכפול', description: 'לא ניתן ליצור עותק חדש', variant: 'destructive' });
      return;
    }

    if (transcriptId) {
      saveCloudVersion(editedText, source, engineLabel, `${actionLabel} • שכפל ושמור`);
    }

    toast({
      title: 'שוכפל ונשמר ✅',
      description: `נוצר עותק חדש מחובר לאודיו (${inserted.id.slice(0, 8)}...)`,
    });
  }, [buildSyncedTimings, saveCloudVersion, transcriptId]);

  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
    <div className="min-h-screen bg-background p-4 md:p-8" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="text-right flex-1">
            <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              עריכת טקסט מתקדמת
            </h1>
            <p className="text-muted-foreground">
              ערוך, שפר והשווה את הטקסט שלך עם כלים מתקדמים
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Column view selector */}
            <div className="flex items-center border rounded-md overflow-hidden">
              {[
                { cols: 1, icon: AlignJustify, label: "עמודה אחת" },
                { cols: 2, icon: Columns2, label: "2 עמודות" },
                { cols: 3, icon: Columns3, label: "3 עמודות" },
              ].map(({ cols, icon: Icon, label }) => (
                <Button
                  key={cols}
                  variant={columns === cols ? "default" : "ghost"}
                  size="icon"
                  className="h-8 w-8 rounded-none"
                  onClick={() => setColumns(cols)}
                  title={label}
                >
                  <Icon className="h-4 w-4" />
                </Button>
              ))}
            </div>
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
              variant="outline" 
              size="icon"
              onClick={() => navigate("/")}
              title="חזרה לדף הראשי"
            >
              <Home className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* AI Quick Actions */}
        {text.trim() && (
          <div className="flex gap-2 flex-wrap p-3 rounded-lg border bg-muted/30">
            <span className="text-sm text-muted-foreground self-center ml-2">פעולות מהירות:</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleAiQuickAction('fix_errors')}
              disabled={!!aiAction}
            >
              {aiAction === 'fix_errors' ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <SpellCheck className="w-4 h-4 ml-1" />}
              תקן שגיאות
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleAiQuickAction('split_paragraphs')}
              disabled={!!aiAction}
            >
              {aiAction === 'split_paragraphs' ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <SplitSquareVertical className="w-4 h-4 ml-1" />}
              חלק לפסקאות
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => handleAiQuickAction('fix_and_split')}
              disabled={!!aiAction}
            >
              {aiAction === 'fix_and_split' ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <Wand2 className="w-4 h-4 ml-1" />}
              תקן + חלק לפסקאות
            </Button>
          </div>
        )}

        {/* Always-visible transcript save actions */}
        {text.trim() && (
          <div className="flex gap-2 flex-wrap p-3 rounded-lg border bg-background">
            <span className="text-sm text-muted-foreground self-center ml-2">שמירה לתמלול:</span>
            <Button
              variant="default"
              size="sm"
              onClick={() => handleSaveAndReplaceOriginal(text, 'manual', 'עורך טקסט', 'שמירה ידנית')}
            >
              <Save className="w-4 h-4 ml-1" />
              שמור והחלף מקור
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDuplicateAndSave(text, 'manual', 'עורך טקסט', 'שכפול ידני')}
            >
              <Copy className="w-4 h-4 ml-1" />
              שכפל ושמור
            </Button>
          </div>
        )}

        {/* Main Content */}
        <Tabs defaultValue="edit" className="w-full" dir="rtl">
          <TabsList className="grid w-full grid-cols-4 md:grid-cols-7 lg:grid-cols-15 mb-6">
            <TabsTrigger value="player">🎧 נגן</TabsTrigger>
            <TabsTrigger value="edit">עריכת טקסט</TabsTrigger>
            <TabsTrigger value="speakers">👥 זיהוי דוברים</TabsTrigger>
            <TabsTrigger value="templates">תבניות</TabsTrigger>
            <TabsTrigger value="ai">עריכה עם AI</TabsTrigger>
            <TabsTrigger value="pipeline">צינור עיבוד</TabsTrigger>
            <TabsTrigger value="prompts">ספריית פרומפטים</TabsTrigger>
            <TabsTrigger value="ollama">🖥️ Ollama</TabsTrigger>
            <TabsTrigger value="learning">🧠 למידה</TabsTrigger>
            <TabsTrigger value="vocab">📖 מילון</TabsTrigger>
            <TabsTrigger value="summary">📊 סיכום</TabsTrigger>
            <TabsTrigger value="ab">⚡ A/B</TabsTrigger>
            <TabsTrigger value="analytics">📈 אנליטיקה</TabsTrigger>
            <TabsTrigger value="compare">השוואה</TabsTrigger>
            <TabsTrigger value="history">היסטוריה</TabsTrigger>
          </TabsList>

          <TabsContent value="player" className="space-y-4">
            <LazyErrorBoundary label="נגן מסונכרן">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SyncAudioPlayer
                audioUrl={audioUrl}
                wordTimings={wordTimings}
                currentTime={playerTime}
                onTimeUpdate={setPlayerTime}
                syncEnabled={syncEnabled}
                onSyncToggle={setSyncEnabled}
              />
              <SyncTranscriptView
                wordTimings={wordTimings}
                currentTime={playerTime}
                onWordClick={(time) => setPlayerTime(time)}
                fontSize={fontSize}
                fontFamily={fontFamily}
                syncEnabled={syncEnabled}
              />
            </div>
            </LazyErrorBoundary>
          </TabsContent>

          <TabsContent value="edit" className="space-y-4">
            <div
              style={{
                fontSize: `${fontSize}px`,
                fontFamily: fontFamily,
                color: textColor,
                lineHeight: lineHeight,
              }}
            >
              <RichTextEditor 
                text={text} 
                onChange={handleEditorChange}
                columnStyle={columnStyle}
                onSaveReplaceOriginal={() => handleSaveAndReplaceOriginal(text, 'manual', 'עורך טקסט', 'שמירה מסרגל העורך')}
                onDuplicateSave={() => handleDuplicateAndSave(text, 'manual', 'עורך טקסט', 'שכפול מסרגל העורך')}
                onWordCorrected={(original, corrected) => {
                  debugLog.info('TextEditor', `Spell correction: "${original}" → "${corrected}"`);
                }}
              />
            </div>
          </TabsContent>

          <TabsContent value="speakers" className="space-y-4">
            <LazyErrorBoundary label="זיהוי דוברים">
              <SpeakerDiarization serverUrl="/whisper" initialAudioBlob={audioBlob} initialAudioName={audioFileName} initialText={text} />
            </LazyErrorBoundary>
          </TabsContent>

          <TabsContent value="templates" className="space-y-4">
            <LazyErrorBoundary label="תבניות עריכה"><EditingTemplates
              text={text}
              onApply={(newText, templateName) => {
                addVersion(newText, 'ai-custom', templateName);
              }}
            /></LazyErrorBoundary>
          </TabsContent>

          <TabsContent value="ai" className="space-y-4">
            <div
              style={{
                fontSize: `${fontSize}px`,
                fontFamily: fontFamily,
                color: textColor,
                lineHeight: lineHeight,
                ...columnStyle,
              }}
            >
              <LazyErrorBoundary label="עורך AI"><AIEditorDual 
                text={text} 
                onTextChange={(newText, source, customPrompt) => {
                  setText(newText);
                  addVersion(newText, source as TextVersion['source'], customPrompt);
                }}
                onSaveVersion={handleSaveVersion}
                onSaveAndReplaceOriginal={handleSaveAndReplaceOriginal}
                onDuplicateAndSave={handleDuplicateAndSave}
                onSyncToPlayer={handleSyncToPlayer}
              /></LazyErrorBoundary>
            </div>
          </TabsContent>

          <TabsContent value="compare" className="space-y-4">
            {versions.length >= 2 ? (
              <LazyErrorBoundary label="השוואה מתקדמת"><AdvancedDiffView 
                versions={versions}
                fontSize={fontSize}
                fontFamily={fontFamily}
                textColor={textColor}
                lineHeight={lineHeight}
                onApplyVersion={(newText) => {
                  setText(newText);
                }}
              /></LazyErrorBoundary>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                יש צורך בלפחות שתי גרסאות כדי להשוות
              </div>
            )}
          </TabsContent>

          <TabsContent value="pipeline" className="space-y-4">
            <LazyErrorBoundary label="צינור עריכה"><EditPipeline
              text={text}
              onTextChange={(newText, source, customPrompt) => {
                setText(newText);
                addVersion(newText, source as TextVersion['source'], customPrompt);
              }}
            /></LazyErrorBoundary>
          </TabsContent>

          <TabsContent value="prompts" className="space-y-4">
            <LazyErrorBoundary label="ספריית פרומפטים"><PromptLibrary
              text={text}
              onTextChange={(newText, source, customPrompt) => {
                setText(newText);
                addVersion(newText, source as TextVersion['source'], customPrompt);
              }}
            /></LazyErrorBoundary>
          </TabsContent>

          <TabsContent value="ollama" className="space-y-4">
            <LazyErrorBoundary label="Ollama"><OllamaManager /></LazyErrorBoundary>
          </TabsContent>

          <TabsContent value="learning" className="space-y-4">
            <LazyErrorBoundary label="למידת תיקונים"><CorrectionLearningPanel /></LazyErrorBoundary>
          </TabsContent>
          <TabsContent value="vocab" className="space-y-4">
            <LazyErrorBoundary label="אוצר מילים"><VocabularyPanel /></LazyErrorBoundary>
          </TabsContent>

          <TabsContent value="summary" className="space-y-4">
            <LazyErrorBoundary label="סיכום"><AutoSummaryCard text={text} /></LazyErrorBoundary>
          </TabsContent>

          <TabsContent value="ab" className="space-y-4">
            <LazyErrorBoundary label="השוואת מנועים"><EngineCompare text={text} /></LazyErrorBoundary>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            <LazyErrorBoundary label="אנליטיקס"><AnalyticsDashboard /></LazyErrorBoundary>
          </TabsContent>
          <TabsContent value="history" className="space-y-4">
            <LazyErrorBoundary label="היסטוריית עריכה"><TextEditHistory 
              versions={versions}
              onSelectVersion={handleVersionSelect}
              selectedVersionId={selectedVersionId}
              cloudVersions={cloudVersions}
              cloudLoading={cloudVersionsLoading}
              onRestoreVersion={handleRestoreVersion}
            /></LazyErrorBoundary>
          </TabsContent>
        </Tabs>

        {/* Back Button */}
        <div className="flex justify-center pt-6 border-t">
          <Button
            variant="outline"
            onClick={() => navigate("/")}
            className="gap-2"
          >
            <ArrowRight className="w-4 h-4" />
            חזרה לעמוד הראשי
          </Button>
        </div>
      </div>
    </div>
    </Suspense>
  );
};

export default TextEditor;
