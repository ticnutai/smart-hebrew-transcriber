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
const SyncAudioPlayer = lazy(() => import("@/components/SyncAudioPlayer").then(m => ({ default: m.SyncAudioPlayer })));
const SyncTranscriptView = lazy(() => import("@/components/SyncTranscriptView").then(m => ({ default: m.SyncTranscriptView })));
import { ArrowRight, Home, Wand2, SplitSquareVertical, SpellCheck, Loader2, Columns2, Columns3, AlignJustify, LayoutGrid, Rows3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useCloudPreferences } from "@/hooks/useCloudPreferences";
import { useCloudTranscripts } from "@/hooks/useCloudTranscripts";

const TextEditor = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [text, setText] = useState("");
  const [versions, setVersions] = useState<TextVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>();
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [wordTimings, setWordTimings] = useState<WordTiming[]>([]);
  const [playerTime, setPlayerTime] = useState(0);
  const transcriptIdRef = useRef<string | null>(null);
  const manualVersionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { updateTranscript, getAudioUrl } = useCloudTranscripts();
  const [syncEnabled, setSyncEnabled] = useState(true);
  
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

  useEffect(() => {
    debugLog.info('TextEditor', '📝 TextEditor mounted');
    return () => debugLog.info('TextEditor', '📝 TextEditor unmounted');
  }, []);

  useEffect(() => {
    // Get text from navigation state or localStorage
    const stateText = location.state?.text;
    if (stateText) {
      setText(stateText);
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
    }

    // Load audio URL from navigation state or resolve from Supabase Storage
    if (location.state?.audioUrl) {
      const url = location.state.audioUrl as string;
      if (url.startsWith('blob:')) {
        fetch(url, { method: 'HEAD' }).then(() => {
          setAudioUrl(url);
        }).catch(() => {});
      } else {
        setAudioUrl(url);
      }
    } else if (location.state?.audioFilePath) {
      // Load audio from Supabase Storage (when opening from history)
      getAudioUrl(location.state.audioFilePath).then((url) => {
        if (url) setAudioUrl(url);
      });
    }

    // Load word timings from state, or fallback to localStorage
    if (location.state?.wordTimings) {
      setWordTimings(location.state.wordTimings);
    } else {
      try {
        const saved = localStorage.getItem('last_word_timings');
        if (saved) setWordTimings(JSON.parse(saved));
      } catch { /* corrupted */ }
    }

  }, [location.state]);

  // Auto-save text and versions to localStorage + debounce cloud save
  const cloudSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (text) {
      localStorage.setItem('current_editing_text', text);
    }
    if (versions.length > 0) {
      localStorage.setItem('text_versions', JSON.stringify(versions));
    }
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
    return () => { if (cloudSaveTimerRef.current) clearTimeout(cloudSaveTimerRef.current); };
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
  };

  const handleVersionSelect = (version: TextVersion) => {
    setSelectedVersionId(version.id);
    setText(version.text);
  };

  

  const [aiAction, setAiAction] = useState<string | null>(null);

  const handleAiQuickAction = async (action: 'fix_errors' | 'split_paragraphs' | 'fix_and_split') => {
    if (!text.trim()) {
      toast({ title: "אין טקסט לעיבוד", variant: "destructive" });
      return;
    }
    setAiAction(action);
    try {
      const { data, error } = await supabase.functions.invoke('edit-transcript', {
        body: { text, action }
      });
      if (error) throw error;
      if (!data?.text) throw new Error('לא התקבלה תשובה מ-AI');
      
      const labels: Record<string, string> = {
        fix_errors: 'תיקון שגיאות',
        split_paragraphs: 'חלוקה לפסקאות',
        fix_and_split: 'תיקון + חלוקה',
      };
      addVersion(data.text, 'ai-fix', labels[action]);
      toast({ title: `${labels[action]} הושלם ✅` });
    } catch (err) {
      console.error('AI action error:', err);
      toast({ title: "שגיאה בעיבוד AI", description: err instanceof Error ? err.message : 'שגיאה', variant: "destructive" });
    } finally {
      setAiAction(null);
    }
  };

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

        {/* Main Content */}
        <Tabs defaultValue="edit" className="w-full" dir="rtl">
          <TabsList className="grid w-full grid-cols-4 md:grid-cols-8 mb-6">
            <TabsTrigger value="player">🎧 נגן</TabsTrigger>
            <TabsTrigger value="edit">עריכת טקסט</TabsTrigger>
            <TabsTrigger value="templates">תבניות</TabsTrigger>
            <TabsTrigger value="ai">עריכה עם AI</TabsTrigger>
            <TabsTrigger value="pipeline">צינור עיבוד</TabsTrigger>
            <TabsTrigger value="prompts">ספריית פרומפטים</TabsTrigger>
            <TabsTrigger value="ollama">🖥️ Ollama</TabsTrigger>
            <TabsTrigger value="compare">השוואה</TabsTrigger>
            <TabsTrigger value="history">היסטוריה</TabsTrigger>
          </TabsList>

          <TabsContent value="player" className="space-y-4">
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
                onChange={(newText) => {
                  setText(newText);
                  // Debounce manual version creation (2s)
                  if (manualVersionTimerRef.current) clearTimeout(manualVersionTimerRef.current);
                  manualVersionTimerRef.current = setTimeout(() => {
                    addVersion(newText, 'manual');
                  }, 2000);
                }}
                columnStyle={columnStyle}
              />
            </div>
          </TabsContent>

          <TabsContent value="templates" className="space-y-4">
            <EditingTemplates
              text={text}
              onApply={(newText, templateName) => {
                addVersion(newText, 'ai-custom', templateName);
              }}
            />
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
              <AIEditorDual 
                text={text} 
                onTextChange={(newText, source, customPrompt) => {
                  setText(newText);
                  addVersion(newText, source as TextVersion['source'], customPrompt);
                }} 
              />
            </div>
          </TabsContent>

          <TabsContent value="compare" className="space-y-4">
            {versions.length >= 2 ? (
              <AdvancedDiffView 
                versions={versions}
                fontSize={fontSize}
                fontFamily={fontFamily}
                textColor={textColor}
                lineHeight={lineHeight}
                onApplyVersion={(newText) => {
                  setText(newText);
                }}
              />
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                יש צורך בלפחות שתי גרסאות כדי להשוות
              </div>
            )}
          </TabsContent>

          <TabsContent value="pipeline" className="space-y-4">
            <EditPipeline
              text={text}
              onTextChange={(newText, source, customPrompt) => {
                setText(newText);
                addVersion(newText, source as TextVersion['source'], customPrompt);
              }}
            />
          </TabsContent>

          <TabsContent value="prompts" className="space-y-4">
            <PromptLibrary
              text={text}
              onTextChange={(newText, source, customPrompt) => {
                setText(newText);
                addVersion(newText, source as TextVersion['source'], customPrompt);
              }}
            />
          </TabsContent>

          <TabsContent value="ollama" className="space-y-4">
            <OllamaManager />
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <TextEditHistory 
              versions={versions}
              onSelectVersion={handleVersionSelect}
              selectedVersionId={selectedVersionId}
            />
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
