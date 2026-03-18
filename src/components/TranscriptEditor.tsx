import { useState, useRef, useCallback, useEffect, memo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Wand2, BookOpen, FileText, Copy, Download, Loader2, Upload, Settings2, CheckCheck, AlignJustify, Quote, Users, Search, ChevronUp, ChevronDown, X, PenLine, Save } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { editTranscriptCloud } from "@/utils/editTranscriptApi";
import { ExportButton } from "@/components/ExportButton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { learnFromCorrections, type CorrectionEntry } from "@/utils/correctionLearning";

interface TranscriptEditorProps {
  transcript: string;
  onTranscriptChange: (text: string) => void;
  wordTimings?: Array<{word: string, start: number, end: number, probability?: number}>;
  searchOpen?: boolean;
  onSearchOpenChange?: (open: boolean) => void;
  onWordCorrected?: (original: string, corrected: string) => void;
}

const TranscriptEditorInner = ({ transcript, onTranscriptChange, wordTimings, searchOpen, onSearchOpenChange, onWordCorrected }: TranscriptEditorProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [showConfidence, setShowConfidence] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [correctionWord, setCorrectionWord] = useState("");
  const [correctionIndex, setCorrectionIndex] = useState<number | null>(null);
  const [correctionOriginal, setCorrectionOriginal] = useState("");
  // For normal textarea mode word correction
  const [textCorrectionOpen, setTextCorrectionOpen] = useState(false);
  const [textCorrectionWord, setTextCorrectionWord] = useState("");
  const [textCorrectionOriginal, setTextCorrectionOriginal] = useState("");
  const [textCorrectionPos, setTextCorrectionPos] = useState<{wordStart: number, wordEnd: number} | null>(null);
  const [showWordMode, setShowWordMode] = useState(false);
  const correctionInputRef = useRef<HTMLInputElement>(null);

  const handleWordCorrection = useCallback((original: string, corrected: string, wordIdx?: number) => {
    if (!corrected.trim() || corrected === original) return;
    // Learn the correction offline
    const entry: CorrectionEntry = {
      original,
      corrected,
      frequency: 1,
      engine: 'manual',
      category: 'word',
      confidence: 0.8,
      lastUsed: Date.now(),
      createdAt: Date.now(),
    };
    learnFromCorrections([entry]);
    // Also notify parent if callback provided
    onWordCorrected?.(original, corrected);
    toast({ title: "תיקון נשמר ✅", description: `"${original}" → "${corrected}" נשמר ללמידה` });
  }, [onWordCorrected]);
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
      const resultText = await editTranscriptCloud({
        text: transcript,
        action,
        customPrompt: prompt,
      });

      onTranscriptChange(resultText);
      toast({
        title: "הצלחה",
        description: "הטקסט נערך בהצלחה",
      });
      setShowPromptDialog(false);
      setCustomPrompt("");
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
        <div className="flex items-center gap-2 mb-3 p-2 bg-muted/50 rounded-md border" role="search" aria-label="חיפוש בתמלול">
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
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
            aria-label="חפש בתמלול"
          />
          <span className="text-xs text-muted-foreground whitespace-nowrap min-w-[60px] text-center" aria-live="polite">
            {searchQuery ? `${matches.length > 0 ? currentMatch + 1 : 0}/${matches.length}` : ''}
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMatch} disabled={matches.length === 0} title="הקודם" aria-label="התאמה הקודמת">
            <ChevronUp className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMatch} disabled={matches.length === 0} title="הבא" aria-label="התאמה הבאה">
            <ChevronDown className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={closeSearch} title="סגור" aria-label="סגור חיפוש">
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
                <Popover
                  key={i}
                  open={correctionIndex === i}
                  onOpenChange={(open) => {
                    if (open) {
                      setCorrectionIndex(i);
                      setCorrectionOriginal(w.word);
                      setCorrectionWord(w.word);
                      setTimeout(() => correctionInputRef.current?.select(), 50);
                    } else {
                      setCorrectionIndex(null);
                    }
                  }}
                >
                  <PopoverTrigger asChild>
                    <span
                      className={`inline-block px-0.5 rounded cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all ${bg}`}
                      title={`ביטחון: ${Math.round(p * 100)}% • לחץ לתיקון`}
                    >
                      {w.word}
                    </span>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-3" dir="rtl" align="center" side="top">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <PenLine className="w-4 h-4 text-primary" />
                        <span>תיקון מילה</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        מקור: <span className="line-through text-red-500">{correctionOriginal}</span>
                      </div>
                      <Input
                        ref={correctionInputRef}
                        value={correctionWord}
                        onChange={(e) => setCorrectionWord(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            // Apply correction
                            const newTimings = [...wordTimings];
                            newTimings[i] = { ...newTimings[i], word: correctionWord };
                            const newText = newTimings.map(wt => wt.word).join(' ');
                            onTranscriptChange(newText);
                            handleWordCorrection(correctionOriginal, correctionWord, i);
                            setCorrectionIndex(null);
                          }
                          if (e.key === 'Escape') setCorrectionIndex(null);
                        }}
                        className="h-8 text-sm"
                        dir="rtl"
                        placeholder="הקלד תיקון..."
                      />
                      <Button
                        size="sm"
                        className="w-full gap-2"
                        onClick={() => {
                          const newTimings = [...wordTimings];
                          newTimings[i] = { ...newTimings[i], word: correctionWord };
                          const newText = newTimings.map(wt => wt.word).join(' ');
                          onTranscriptChange(newText);
                          handleWordCorrection(correctionOriginal, correctionWord, i);
                          setCorrectionIndex(null);
                        }}
                        disabled={!correctionWord.trim() || correctionWord === correctionOriginal}
                      >
                        <Save className="w-4 h-4" />
                        תקן ושמור ללמידה
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground border-t pt-2">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-200 dark:bg-red-900/40 inline-block" /> &lt;70%</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-200 dark:bg-yellow-900/40 inline-block" /> 70-90%</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border inline-block" /> &gt;90%</span>
            <span className="text-xs mr-auto">💡 לחץ על מילה לתיקון ושמירה ללמידה</span>
          </div>
        </div>
      ) : showWordMode && transcript.trim() ? (
        <div className="min-h-[300px] mb-4 p-3 bg-background border rounded-md text-right overflow-y-auto" dir="rtl">
          <div className="flex flex-wrap gap-1 leading-relaxed font-mono text-base">
            {transcript.split(/(\s+)/).map((segment, i) => {
              if (/^\s+$/.test(segment)) return <span key={i}>{segment}</span>;
              if (!segment) return null;
              return (
                <Popover
                  key={i}
                  open={textCorrectionOpen && textCorrectionPos?.wordStart === i}
                  onOpenChange={(open) => {
                    if (open) {
                      setTextCorrectionOpen(true);
                      setTextCorrectionOriginal(segment);
                      setTextCorrectionWord(segment);
                      setTextCorrectionPos({ wordStart: i, wordEnd: i });
                      setTimeout(() => correctionInputRef.current?.select(), 50);
                    } else {
                      setTextCorrectionOpen(false);
                      setTextCorrectionPos(null);
                    }
                  }}
                >
                  <PopoverTrigger asChild>
                    <span
                      className="inline-block px-0.5 rounded cursor-pointer hover:bg-primary/10 hover:ring-1 hover:ring-primary/30 transition-all"
                    >
                      {segment}
                    </span>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-3" dir="rtl" align="center" side="top">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <PenLine className="w-4 h-4 text-primary" />
                        <span>תיקון מילה</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        מקור: <span className="line-through text-red-500">{textCorrectionOriginal}</span>
                      </div>
                      <Input
                        ref={correctionInputRef}
                        value={textCorrectionWord}
                        onChange={(e) => setTextCorrectionWord(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const parts = transcript.split(/(\s+)/);
                            parts[i] = textCorrectionWord;
                            onTranscriptChange(parts.join(''));
                            handleWordCorrection(textCorrectionOriginal, textCorrectionWord);
                            setTextCorrectionOpen(false);
                            setTextCorrectionPos(null);
                          }
                          if (e.key === 'Escape') {
                            setTextCorrectionOpen(false);
                            setTextCorrectionPos(null);
                          }
                        }}
                        className="h-8 text-sm"
                        dir="rtl"
                        placeholder="הקלד תיקון..."
                      />
                      <Button
                        size="sm"
                        className="w-full gap-2"
                        onClick={() => {
                          const parts = transcript.split(/(\s+)/);
                          parts[i] = textCorrectionWord;
                          onTranscriptChange(parts.join(''));
                          handleWordCorrection(textCorrectionOriginal, textCorrectionWord);
                          setTextCorrectionOpen(false);
                          setTextCorrectionPos(null);
                        }}
                        disabled={!textCorrectionWord.trim() || textCorrectionWord === textCorrectionOriginal}
                      >
                        <Save className="w-4 h-4" />
                        תקן ושמור ללמידה
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground border-t pt-2">
            <span className="text-xs">💡 לחץ על מילה לתיקון ושמירה ללמידה</span>
            <Button variant="ghost" size="sm" className="h-6 text-xs mr-auto" onClick={() => setShowWordMode(false)}>
              חזור לעריכה חופשית
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <Textarea
            ref={textareaRef}
            value={transcript}
            onChange={(e) => onTranscriptChange(e.target.value)}
            placeholder="התמלול יופיע כאן..."
            className="min-h-[300px] mb-1 font-mono text-base text-right"
            dir="rtl"
            disabled={isEditing}
          />
          {transcript.trim() && (
            <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => setShowWordMode(true)}>
              <PenLine className="w-3 h-3" />
              מצב תיקון מילים — לחץ על מילה לתקן ולשמור ללמידה
            </Button>
          )}
        </div>
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

export const TranscriptEditor = memo(TranscriptEditorInner);
