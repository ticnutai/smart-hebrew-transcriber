import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RichTextEditor } from "@/components/RichTextEditor";
import { AIEditorDual } from "@/components/AIEditorDual";
import { TextComparisonMulti } from "@/components/TextComparisonMulti";
import { TextStyleControl } from "@/components/TextStyleControl";
import { TextEditHistory, TextVersion } from "@/components/TextEditHistory";
import { ArrowRight, Home, Wand2, SplitSquareVertical, SpellCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const TextEditor = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [text, setText] = useState("");
  const [versions, setVersions] = useState<TextVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>();
  
  // Style settings
  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState('Assistant');
  const [textColor, setTextColor] = useState('hsl(var(--foreground))');
  const [lineHeight, setLineHeight] = useState(1.6);

  useEffect(() => {
    // Get text from navigation state or localStorage
    const stateText = location.state?.text;
    if (stateText) {
      setText(stateText);
      const initialVersion: TextVersion = {
        id: Date.now().toString(),
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
        const parsedVersions = JSON.parse(savedVersions).map((v: any) => ({
          ...v,
          timestamp: new Date(v.timestamp)
        }));
        setVersions(parsedVersions);
        setSelectedVersionId(parsedVersions[parsedVersions.length - 1]?.id);
      }
      
      if (savedText) {
        setText(savedText);
      }
    }

    // Load style settings
    const savedFontSize = localStorage.getItem('editor_fontSize');
    const savedFontFamily = localStorage.getItem('editor_fontFamily');
    const savedTextColor = localStorage.getItem('editor_textColor');
    const savedLineHeight = localStorage.getItem('editor_lineHeight');

    if (savedFontSize) setFontSize(Number(savedFontSize));
    if (savedFontFamily) setFontFamily(savedFontFamily);
    if (savedTextColor) setTextColor(savedTextColor);
    if (savedLineHeight) setLineHeight(Number(savedLineHeight));
  }, [location.state]);

  // Auto-save text and versions to localStorage
  useEffect(() => {
    if (text) {
      localStorage.setItem('current_editing_text', text);
    }
    if (versions.length > 0) {
      localStorage.setItem('text_versions', JSON.stringify(versions));
    }
  }, [text, versions]);

  const addVersion = (newText: string, source: TextVersion['source'], customPrompt?: string) => {
    const newVersion: TextVersion = {
      id: Date.now().toString(),
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

  // Save style settings
  useEffect(() => {
    localStorage.setItem('editor_fontSize', String(fontSize));
    localStorage.setItem('editor_fontFamily', fontFamily);
    localStorage.setItem('editor_textColor', textColor);
    localStorage.setItem('editor_lineHeight', String(lineHeight));
  }, [fontSize, fontFamily, textColor, lineHeight]);

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
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => navigate("/")}
            title="חזרה לדף הראשי"
          >
            <Home className="h-4 w-4" />
          </Button>
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
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="edit">עריכת טקסט</TabsTrigger>
            <TabsTrigger value="ai">עריכה עם AI</TabsTrigger>
            <TabsTrigger value="compare">השוואה</TabsTrigger>
            <TabsTrigger value="history">היסטוריה</TabsTrigger>
          </TabsList>

          <TabsContent value="edit" className="space-y-4">
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
                  addVersion(newText, 'manual');
                }} 
              />
            </div>
          </TabsContent>

          <TabsContent value="ai" className="space-y-4">
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
            <div
              style={{
                fontSize: `${fontSize}px`,
                fontFamily: fontFamily,
                color: textColor,
                lineHeight: lineHeight,
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
            {versions.length >= 2 ? (
              <TextComparisonMulti 
                versions={versions}
                fontSize={fontSize}
                fontFamily={fontFamily}
                textColor={textColor}
                lineHeight={lineHeight}
              />
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                יש צורך בלפחות שתי גרסאות כדי להשוות
              </div>
            )}
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
  );
};

export default TextEditor;
