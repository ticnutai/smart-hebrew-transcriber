import { useState, useRef, useCallback, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Wand2, BookOpen, FileText, Copy, Download, Loader2, Upload, Settings2, CheckCheck, AlignJustify, Quote, Users, Search, ChevronUp, ChevronDown, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ExportButton } from "@/components/ExportButton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface TranscriptEditorProps {
  transcript: string;
  onTranscriptChange: (text: string) => void;
  wordTimings?: Array<{word: string, start: number, end: number, probability?: number}>;
  searchOpen?: boolean;
  onSearchOpenChange?: (open: boolean) => void;
}

export const TranscriptEditor = ({ transcript, onTranscriptChange, wordTimings, searchOpen, onSearchOpenChange }: TranscriptEditorProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [showConfidence, setShowConfidence] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [showPromptDialog, setShowPromptDialog] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [currentMatch, setCurrentMatch] = useState(0);
  const [matches, setMatches] = useState<number[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Compute matches when query or transcript changes
  useEffect(() => {
    if (!searchQuery.trim()) {
      setMatches([]);
      setCurrentMatch(0);
      return;
    }
    const indices: number[] = [];
    const lower = transcript.toLowerCase();
    const q = searchQuery.toLowerCase();
    let idx = lower.indexOf(q);
    while (idx !== -1) {
      indices.push(idx);
      idx = lower.indexOf(q, idx + 1);
    }
    setMatches(indices);
    setCurrentMatch(indices.length > 0 ? 0 : -1);
  }, [searchQuery, transcript]);

  // Focus search input when opened
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      setSearchQuery("");
    }
  }, [searchOpen]);

  // Jump to match in textarea
  const jumpToMatch = useCallback((matchIndex: number) => {
    if (matches.length === 0 || matchIndex < 0) return;
    const idx = matches[matchIndex];
    const ta = textareaRef.current;
    if (ta) {
      ta.focus();
      ta.setSelectionRange(idx, idx + searchQuery.length);
      // Scroll the textarea so the match is visible
      const textBefore = transcript.substring(0, idx);
      const lines = textBefore.split('\n');
      const approxLine = lines.length;
      const lineHeight = 24;
      ta.scrollTop = Math.max(0, (approxLine - 3) * lineHeight);
    }
  }, [matches, searchQuery, transcript]);

  useEffect(() => {
    if (currentMatch >= 0 && matches.length > 0) {
      jumpToMatch(currentMatch);
    }
  }, [currentMatch, jumpToMatch, matches]);

  const nextMatch = () => {
    if (matches.length === 0) return;
    setCurrentMatch(prev => (prev + 1) % matches.length);
  };
  const prevMatch = () => {
    if (matches.length === 0) return;
    setCurrentMatch(prev => (prev - 1 + matches.length) % matches.length);
  };
  const closeSearch = () => {
    onSearchOpenChange?.(false);
  };

  const handleEdit = async (action: 'improve' | 'sources' | 'readable' | 'custom' | 'grammar' | 'punctuation' | 'paragraphs' | 'speakers', prompt?: string) => {
    if (!transcript.trim()) {
      toast({
        title: "שגיאה",
        description: "אין טקסט לעריכה",
        variant: "destructive",
      });
      return;
    }

    setIsEditing(true);

    try {
      const { data, error } = await supabase.functions.invoke('edit-transcript', {
        body: { 
          text: transcript, 
          action,
          customPrompt: prompt 
        }
      });

      if (error) throw error;

      if (data?.text) {
        onTranscriptChange(data.text);
        toast({
          title: "הצלחה",
          description: "הטקסט נערך בהצלחה",
        });
        setShowPromptDialog(false);
        setCustomPrompt("");
      }
    } catch (error) {
      console.error('Error editing transcript:', error);
      toast({
        title: "שגיאה",
        description: error instanceof Error ? error.message : "שגיאה בעריכת הטקסט",
        variant: "destructive",
      });
    } finally {
      setIsEditing(false);
    }
  };

  const handleCustomEdit = () => {
    if (!customPrompt.trim()) {
      toast({
        title: "שגיאה",
        description: "נא להזין פרומפט",
        variant: "destructive",
      });
      return;
    }
    handleEdit('custom', customPrompt);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          try {
            const json = JSON.parse(content);
            onTranscriptChange(json.transcript || content);
          } catch {
            onTranscriptChange(content);
          }
          toast({
            title: "הצלחה",
            description: "הקובץ יובא בהצלחה",
          });
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const handleExportJSON = () => {
    const data = {
      transcript,
      timestamp: new Date().toISOString(),
      version: "1.0"
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "הורדה החלה",
      description: "הקובץ JSON הורד למחשב שלך",
    });
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(transcript);
    toast({
      title: "הועתק",
      description: "הטקסט הועתק ללוח",
    });
  };

  const handleDownload = () => {
    const blob = new Blob([transcript], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "הורדה החלה",
      description: "הקובץ הורד למחשב שלך",
    });
  };

  return (
    <Card className="p-6" dir="rtl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-right">תמלול</h2>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={searchOpen ? "default" : "outline"}
            size="sm"
            onClick={() => onSearchOpenChange?.(!searchOpen)}
            disabled={!transcript.trim()}
            title="חיפוש בתמלול (Ctrl+F)"
          >
            <Search className="w-4 h-4 ml-2" />
            חפש
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleImport}
            disabled={isEditing}
          >
            <Upload className="w-4 h-4 ml-2" />
            יבוא
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            disabled={!transcript.trim() || isEditing}
          >
            <Copy className="w-4 h-4 ml-2" />
            העתק
          </Button>
          <ExportButton text={transcript} disabled={isEditing} wordTimings={wordTimings} />
          {wordTimings && wordTimings.some(w => w.probability != null) && (
            <Button
              variant={showConfidence ? "default" : "outline"}
              size="sm"
              onClick={() => setShowConfidence(!showConfidence)}
              title="הצג ציון ביטחון למילים"
            >
              <Settings2 className="w-4 h-4 ml-2" />
              ביטחון
            </Button>
          )}
        </div>
      </div>

      {/* Search bar */}
      {searchOpen && (
        <div className="flex items-center gap-2 mb-3 p-2 bg-muted/50 rounded-md border">
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <Input
            ref={searchInputRef}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.shiftKey ? prevMatch() : nextMatch();
              }
              if (e.key === 'Escape') closeSearch();
            }}
            placeholder="חפש בתמלול..."
            className="h-8 text-sm flex-1"
            dir="rtl"
          />
          <span className="text-xs text-muted-foreground whitespace-nowrap min-w-[60px] text-center">
            {searchQuery ? `${matches.length > 0 ? currentMatch + 1 : 0}/${matches.length}` : ''}
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMatch} disabled={matches.length === 0} title="הקודם">
            <ChevronUp className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMatch} disabled={matches.length === 0} title="הבא">
            <ChevronDown className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={closeSearch} title="סגור">
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {showConfidence && wordTimings && wordTimings.some(w => w.probability != null) ? (
        <div className="min-h-[300px] mb-4 p-3 bg-background border rounded-md text-right overflow-y-auto" dir="rtl">
          <div className="flex flex-wrap gap-1 leading-relaxed font-mono text-base">
            {wordTimings.map((w, i) => {
              const p = w.probability ?? 1;
              const bg = p >= 0.9 ? '' : p >= 0.7 ? 'bg-yellow-200 dark:bg-yellow-900/40' : 'bg-red-200 dark:bg-red-900/40';
              return (
                <span
                  key={i}
                  className={`inline-block px-0.5 rounded ${bg}`}
                  title={`ביטחון: ${Math.round(p * 100)}%`}
                >
                  {w.word}
                </span>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground border-t pt-2">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-200 dark:bg-red-900/40 inline-block" /> &lt;70%</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-200 dark:bg-yellow-900/40 inline-block" /> 70-90%</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border inline-block" /> &gt;90%</span>
          </div>
        </div>
      ) : (
        <Textarea
          ref={textareaRef}
          value={transcript}
          onChange={(e) => onTranscriptChange(e.target.value)}
          placeholder="התמלול יופיע כאן..."
          className="min-h-[300px] mb-4 font-mono text-base text-right"
          dir="rtl"
          disabled={isEditing}
        />
      )}

      <div className="border-t pt-4">
        <h3 className="text-sm font-semibold mb-3 text-right">עריכת טקסט עם AI</h3>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => handleEdit('grammar')}
            disabled={!transcript.trim() || isEditing}
          >
            {isEditing ? (
              <Loader2 className="w-4 h-4 ml-2 animate-spin" />
            ) : (
              <CheckCheck className="w-4 h-4 ml-2" />
            )}
            דקדוק ואיות
          </Button>

          <Button
            variant="secondary"
            onClick={() => handleEdit('punctuation')}
            disabled={!transcript.trim() || isEditing}
          >
            {isEditing ? (
              <Loader2 className="w-4 h-4 ml-2 animate-spin" />
            ) : (
              <Quote className="w-4 h-4 ml-2" />
            )}
            פיסוק
          </Button>

          <Button
            variant="secondary"
            onClick={() => handleEdit('paragraphs')}
            disabled={!transcript.trim() || isEditing}
          >
            {isEditing ? (
              <Loader2 className="w-4 h-4 ml-2 animate-spin" />
            ) : (
              <AlignJustify className="w-4 h-4 ml-2" />
            )}
            חלק לפסקאות
          </Button>

          <Button
            variant="secondary"
            onClick={() => handleEdit('improve')}
            disabled={!transcript.trim() || isEditing}
          >
            {isEditing ? (
              <Loader2 className="w-4 h-4 ml-2 animate-spin" />
            ) : (
              <Wand2 className="w-4 h-4 ml-2" />
            )}
            שפר ניסוח
          </Button>
          
          <Button
            variant="secondary"
            onClick={() => handleEdit('sources')}
            disabled={!transcript.trim() || isEditing}
          >
            {isEditing ? (
              <Loader2 className="w-4 h-4 ml-2 animate-spin" />
            ) : (
              <FileText className="w-4 h-4 ml-2" />
            )}
            הוסף מקורות
          </Button>
          
          <Button
            variant="secondary"
            onClick={() => handleEdit('readable')}
            disabled={!transcript.trim() || isEditing}
          >
            {isEditing ? (
              <Loader2 className="w-4 h-4 ml-2 animate-spin" />
            ) : (
              <BookOpen className="w-4 h-4 ml-2" />
            )}
            עשה זורם לקריאה
          </Button>

          <Button
            variant="secondary"
            onClick={() => handleEdit('speakers')}
            disabled={!transcript.trim() || isEditing}
          >
            {isEditing ? (
              <Loader2 className="w-4 h-4 ml-2 animate-spin" />
            ) : (
              <Users className="w-4 h-4 ml-2" />
            )}
            זהה דוברים
          </Button>

          <Dialog open={showPromptDialog} onOpenChange={setShowPromptDialog}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                disabled={!transcript.trim() || isEditing}
              >
                <Settings2 className="w-4 h-4 ml-2" />
                פרומפט מותאם
              </Button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle>פרומפט מותאם אישית</DialogTitle>
                <DialogDescription>
                  הזן את ההוראות שלך ל-AI לעריכת הטקסט
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <Textarea
                  placeholder="למשל: תרגם לאנגלית, סכם ל-3 משפטים, המר לנקודות..."
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  className="min-h-[100px] text-right"
                  dir="rtl"
                />
                <Button 
                  onClick={handleCustomEdit} 
                  className="w-full"
                  disabled={isEditing || !customPrompt.trim()}
                >
                  {isEditing ? (
                    <>
                      <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                      מעבד...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4 ml-2" />
                      הפעל עריכה
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <p className="text-xs text-muted-foreground mt-3 text-right">
          כפתורי ה-AI משתמשים במודל Gemini חינמי לעריכה חכמה של הטקסט
        </p>
      </div>
    </Card>
  );
};
