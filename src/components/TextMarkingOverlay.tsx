import { useState, useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Eye, Settings2, Loader2, XCircle, Trash2, Check, RefreshCw, Wand2, ListChecks, CheckCheck, Pause, Play } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { analyzeMorphology } from "@/utils/dictaApi";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import type { WordValidation } from "./DictionaryValidator";

interface MarkingSettings {
  showUnknown: boolean;
  showGrammar: boolean;
  showContext: boolean;
  showDuplicates: boolean;
}

interface DuplicateGroup {
  word: string;
  indices: number[];
}

interface Props {
  text: string;
  onTextChange: (text: string) => void;
  fontSize?: number;
  fontFamily?: string;
  lineHeight?: number;
}

const BATCH_SIZE = 40;
const PARALLEL_LIMIT = 3;

export const TextMarkingOverlay = ({ text, onTextChange, fontSize = 18, fontFamily = 'Assistant', lineHeight = 1.8 }: Props) => {
  const [settings, setSettings] = useState<MarkingSettings>({
    showUnknown: true,
    showGrammar: true,
    showContext: false,
    showDuplicates: true,
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [wordResults, setWordResults] = useState<WordValidation[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [selectedDuplicate, setSelectedDuplicate] = useState<DuplicateGroup | null>(null);
  const [selectedFixes, setSelectedFixes] = useState<Set<number>>(new Set());
  const [showFixPanel, setShowFixPanel] = useState(false);

  // Resume tracking
  const completedBatchesRef = useRef<Set<number>>(new Set());
  const morphResultsRef = useRef<WordValidation[]>([]);
  const cancelRef = useRef(false);
  const pauseRef = useRef(false);
  const totalBatchesRef = useRef(0);
  const completedCountRef = useRef(0);

  const words = useMemo(() => {
    if (!text.trim()) return [];
    return text.split(/(\s+)/).filter(w => w.length > 0);
  }, [text]);

  const actualWords = useMemo(() => {
    return words
      .map((w, i) => ({ word: w, index: i }))
      .filter(({ word }) => /\S/.test(word));
  }, [words]);

  const detectDuplicates = useCallback(() => {
    const groups: DuplicateGroup[] = [];
    const cleanWords = actualWords.map(w => w.word.replace(/[.,;:!?'"()\-–—]/g, '').trim());
    let i = 0;
    while (i < cleanWords.length) {
      if (cleanWords[i].length < 2) { i++; continue; }
      const currentWord = cleanWords[i];
      const dupeIndices = [actualWords[i].index];
      let j = i + 1;
      while (j < cleanWords.length && cleanWords[j] === currentWord) {
        dupeIndices.push(actualWords[j].index);
        j++;
      }
      if (dupeIndices.length > 1) {
        groups.push({ word: currentWord, indices: dupeIndices });
      }
      i = j;
    }
    return groups;
  }, [actualWords]);

  // Process a single AI batch
  const processAIBatch = useCallback(async (
    batch: { word: string; index: number }[],
    allActualWords: { word: string; index: number }[]
  ): Promise<Partial<WordValidation>[]> => {
    const wordsPayload = batch.map(r => {
      const wordIdx = allActualWords.findIndex(aw => aw.index === r.index);
      return {
        word: r.word,
        index: r.index,
        prev: wordIdx > 0 ? allActualWords[wordIdx - 1].word : undefined,
        next: wordIdx < allActualWords.length - 1 ? allActualWords[wordIdx + 1].word : undefined,
      };
    });

    const { data, error } = await supabase.functions.invoke('check-dictionary', {
      body: { words: wordsPayload },
    });

    if (!error && data?.results) {
      return data.results;
    }
    return [];
  }, []);

  const runAnalysis = useCallback(async (resume = false) => {
    if (!text.trim()) return;
    cancelRef.current = false;
    pauseRef.current = false;
    setIsPaused(false);
    setIsAnalyzing(true);

    try {
      let results: WordValidation[];

      if (resume && morphResultsRef.current.length > 0) {
        // Resume from previous morph results
        results = [...morphResultsRef.current];
        setStage('ממשיך מאיפה שעצרנו...');
      } else {
        // Fresh start
        completedBatchesRef.current = new Set();
        completedCountRef.current = 0;
        setProgress(0);
        setWordResults([]);
        setDuplicates([]);

        setStage('זיהוי כפילויות...');
        const dupes = detectDuplicates();
        setDuplicates(dupes);
        setProgress(5);

        setStage('ניתוח מורפולוגי...');
        const onlyWords = actualWords.map(w => w.word);
        const morphResult = await analyzeMorphology(onlyWords.join(' '));
        setProgress(25);

        if (cancelRef.current) return;

        results = actualWords.map((w, idx) => {
          const isHebrew = /[\u0590-\u05FF]/.test(w.word);
          const isPunctuation = /^[.,;:!?'"()\-–—]+$/.test(w.word);
          const isNumber = /^\d+$/.test(w.word);

          if (!isHebrew || isPunctuation || isNumber) {
            return {
              word: w.word, index: w.index,
              exists: true, grammarOk: true, contextOk: true,
              issueType: 'none' as const,
            };
          }

          const morph = morphResult.success && morphResult.words[idx];
          const hasLemma = morph && morph.lemma && morph.lemma !== '';

          return {
            word: w.word, index: w.index,
            exists: !!hasLemma,
            lemma: morph ? morph.lemma : undefined,
            pos: morph ? morph.pos : undefined,
            grammarOk: true,
            contextOk: true,
            issueType: (hasLemma ? 'none' : 'unknown_word') as WordValidation['issueType'],
          };
        });

        morphResultsRef.current = results;
        // Show morph results immediately
        setWordResults([...results]);
        setIsActive(true);
      }

      if (cancelRef.current) return;

      if (settings.showGrammar || settings.showContext) {
        setStage('בדיקת דקדוק והקשר...');
        const hebrewResults = results.filter(r => /[\u0590-\u05FF]/.test(r.word) && r.word.length > 1);
        const batches: typeof hebrewResults[] = [];
        for (let i = 0; i < hebrewResults.length; i += BATCH_SIZE) {
          batches.push(hebrewResults.slice(i, i + BATCH_SIZE));
        }
        totalBatchesRef.current = batches.length;

        // Filter out already completed batches (for resume)
        const pendingBatchIndices = batches
          .map((_, i) => i)
          .filter(i => !completedBatchesRef.current.has(i));

        if (pendingBatchIndices.length === 0) {
          setProgress(100);
          setStage('');
          setIsAnalyzing(false);
          return;
        }

        // Process in parallel chunks of PARALLEL_LIMIT
        for (let chunk = 0; chunk < pendingBatchIndices.length; chunk += PARALLEL_LIMIT) {
          if (cancelRef.current) break;

          // Wait while paused
          while (pauseRef.current && !cancelRef.current) {
            await new Promise(r => setTimeout(r, 200));
          }
          if (cancelRef.current) break;

          const chunkIndices = pendingBatchIndices.slice(chunk, chunk + PARALLEL_LIMIT);
          const batchStage = `בדיקת דקדוק והקשר (${completedCountRef.current}/${totalBatchesRef.current})...`;
          setStage(batchStage);

          // Run PARALLEL_LIMIT batches concurrently
          const promises = chunkIndices.map(async (bIdx) => {
            try {
              const batch = batches[bIdx];
              const aiResults = await processAIBatch(batch, actualWords);

              // Merge results incrementally
              for (const aiResult of aiResults) {
                const rIdx = results.findIndex(r => r.index === (aiResult as any).index);
                if (rIdx !== -1) {
                  results[rIdx] = {
                    ...results[rIdx],
                    exists: (aiResult as any).exists,
                    grammarOk: (aiResult as any).grammarOk,
                    contextOk: (aiResult as any).contextOk,
                    suggestion: (aiResult as any).suggestion || undefined,
                    reason: (aiResult as any).reason || undefined,
                    issueType: (aiResult as any).issueType || results[rIdx].issueType,
                  };
                }
              }

              completedBatchesRef.current.add(bIdx);
              completedCountRef.current++;
            } catch (err) {
              console.error(`AI batch ${bIdx} error:`, err);
              // Mark as completed to skip on resume
              completedBatchesRef.current.add(bIdx);
              completedCountRef.current++;
            }
          });

          await Promise.all(promises);

          // Update results and progress incrementally after each parallel chunk
          morphResultsRef.current = [...results];
          setWordResults([...results]);
          const pct = 25 + Math.round((completedCountRef.current / totalBatchesRef.current) * 70);
          setProgress(Math.min(pct, 95));
        }
      }

      if (!cancelRef.current) {
        setWordResults([...results]);
        morphResultsRef.current = results;
        setProgress(100);
        setStage('');
        setIsActive(true);
      }
    } catch (err) {
      console.error('Analysis error:', err);
      toast({ title: "שגיאה", description: "הניתוח נכשל — ניתן להמשיך מאיפה שעצר", variant: "destructive" });
    } finally {
      setIsAnalyzing(false);
      setIsPaused(false);
    }
  }, [text, actualWords, settings, detectDuplicates, processAIBatch]);

  const handlePause = useCallback(() => {
    pauseRef.current = true;
    setIsPaused(true);
  }, []);

  const handleResume = useCallback(() => {
    if (isPaused) {
      pauseRef.current = false;
      setIsPaused(false);
    } else {
      // Resume from last checkpoint
      runAnalysis(true);
    }
  }, [isPaused, runAnalysis]);

  const handleCancel = useCallback(() => {
    cancelRef.current = true;
    setIsAnalyzing(false);
    setIsPaused(false);
    setStage('');
    // Keep whatever results we have so far
    if (wordResults.length > 0) {
      setIsActive(true);
      toast({ title: "הופסק", description: `נשמרו ${wordResults.filter(r => r.issueType !== 'none').length} ממצאים — ניתן להמשיך` });
    }
  }, [wordResults]);

  const resultMap = useMemo(() => {
    const map = new Map<number, WordValidation>();
    wordResults.forEach(r => map.set(r.index, r));
    return map;
  }, [wordResults]);

  const duplicateIndices = useMemo(() => {
    const set = new Set<number>();
    duplicates.forEach(d => d.indices.forEach(i => set.add(i)));
    return set;
  }, [duplicates]);

  const handleRemoveDuplicate = useCallback((group: DuplicateGroup) => {
    const wordArray = text.split(/(\s+)/);
    const toRemove = new Set(group.indices.slice(1));
    const newWords = wordArray.filter((_, i) => {
      if (toRemove.has(i)) return false;
      if (toRemove.has(i + 1) && /^\s+$/.test(wordArray[i])) return false;
      return true;
    });
    onTextChange(newWords.join(''));
    setSelectedDuplicate(null);
    setIsActive(false);
  }, [text, onTextChange]);

  const handleRemoveAllDuplicates = useCallback(() => {
    if (duplicates.length === 0) return;
    const wordArray = text.split(/(\s+)/);
    const toRemove = new Set<number>();
    duplicates.forEach(d => d.indices.slice(1).forEach(i => toRemove.add(i)));
    const newWords = wordArray.filter((_, i) => {
      if (toRemove.has(i)) return false;
      if (toRemove.has(i + 1) && /^\s+$/.test(wordArray[i])) return false;
      return true;
    });
    onTextChange(newWords.join(''));
    setIsActive(false);
  }, [text, duplicates, onTextChange]);

  const handleApplyFix = useCallback((wordIndex: number, suggestion: string) => {
    const wordArray = text.split(/(\s+)/);
    if (wordIndex < wordArray.length) {
      wordArray[wordIndex] = suggestion;
      onTextChange(wordArray.join(''));
      toast({ title: "תוקן" });
      setIsActive(false);
    }
  }, [text, onTextChange]);

  // All fixable results (have a suggestion)
  const fixableResults = useMemo(() => {
    return wordResults.filter(r => r.issueType !== 'none' && r.suggestion);
  }, [wordResults]);

  const handleFixAll = useCallback(() => {
    if (fixableResults.length === 0) return;
    const wordArray = text.split(/(\s+)/);
    let count = 0;
    for (const r of fixableResults) {
      if (r.suggestion && r.index < wordArray.length) {
        wordArray[r.index] = r.suggestion;
        count++;
      }
    }
    onTextChange(wordArray.join(''));
    toast({ title: "תוקן הכל", description: `${count} מילים תוקנו` });
    setIsActive(false);
    setWordResults([]);
    setSelectedFixes(new Set());
    setShowFixPanel(false);
  }, [text, fixableResults, onTextChange]);

  const handleFixSelected = useCallback(() => {
    if (selectedFixes.size === 0) return;
    const wordArray = text.split(/(\s+)/);
    let count = 0;
    for (const idx of selectedFixes) {
      const r = wordResults.find(wr => wr.index === idx);
      if (r?.suggestion && idx < wordArray.length) {
        wordArray[idx] = r.suggestion;
        count++;
      }
    }
    onTextChange(wordArray.join(''));
    toast({ title: "תוקנו נבחרים", description: `${count} מילים תוקנו` });
    setIsActive(false);
    setWordResults([]);
    setSelectedFixes(new Set());
    setShowFixPanel(false);
  }, [text, selectedFixes, wordResults, onTextChange]);

  const toggleFixSelection = useCallback((index: number) => {
    setSelectedFixes(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedFixes.size === fixableResults.length) {
      setSelectedFixes(new Set());
    } else {
      setSelectedFixes(new Set(fixableResults.map(r => r.index)));
    }
  }, [fixableResults, selectedFixes]);

  const getWordStyle = useCallback((wordIndex: number) => {
    if (!isActive) return '';
    const result = resultMap.get(wordIndex);
    const isDuplicate = settings.showDuplicates && duplicateIndices.has(wordIndex);
    const styles: string[] = [];
    if (isDuplicate) styles.push('decoration-blue-400 decoration-wavy underline decoration-2');
    if (result) {
      if (settings.showUnknown && (result.issueType === 'unknown_word' || result.issueType === 'spelling')) styles.push('decoration-red-500 decoration-wavy underline decoration-2');
      else if (settings.showGrammar && result.issueType === 'grammar') styles.push('decoration-orange-400 decoration-wavy underline decoration-2');
      else if (settings.showContext && result.issueType === 'context') styles.push('decoration-yellow-400 decoration-wavy underline decoration-2');
    }
    return styles.join(' ');
  }, [isActive, resultMap, duplicateIndices, settings]);

  const issueStats = useMemo(() => {
    const unknown = wordResults.filter(r => r.issueType === 'unknown_word' || r.issueType === 'spelling').length;
    const grammar = wordResults.filter(r => r.issueType === 'grammar').length;
    const context = wordResults.filter(r => r.issueType === 'context').length;
    return { unknown, grammar, context, duplicates: duplicates.length };
  }, [wordResults, duplicates]);

  const canResume = !isAnalyzing && morphResultsRef.current.length > 0 && completedBatchesRef.current.size < totalBatchesRef.current && totalBatchesRef.current > 0;

  return (
    <div className="relative">
      <div className="flex items-center gap-2 mb-3 flex-wrap" dir="rtl">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
              <Settings2 className="w-3.5 h-3.5" /> הגדרות סימון
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72" dir="rtl" align="start">
            <div className="space-y-4">
              <h4 className="font-medium text-sm">סוגי סימון</h4>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><div className="w-3 h-0.5 bg-red-500 rounded" /><Label className="text-xs">מילים לא קיימות</Label></div>
                <Switch checked={settings.showUnknown} onCheckedChange={(v) => setSettings(s => ({ ...s, showUnknown: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><div className="w-3 h-0.5 bg-orange-400 rounded" /><Label className="text-xs">שגיאות דקדוק</Label></div>
                <Switch checked={settings.showGrammar} onCheckedChange={(v) => setSettings(s => ({ ...s, showGrammar: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><div className="w-3 h-0.5 bg-yellow-400 rounded" /><Label className="text-xs">בעיות הקשר</Label></div>
                <Switch checked={settings.showContext} onCheckedChange={(v) => setSettings(s => ({ ...s, showContext: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><div className="w-3 h-0.5 bg-blue-400 rounded" /><Label className="text-xs">מילים כפולות</Label></div>
                <Switch checked={settings.showDuplicates} onCheckedChange={(v) => setSettings(s => ({ ...s, showDuplicates: v }))} />
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Main action button */}
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => runAnalysis(false)} disabled={isAnalyzing || !text.trim()} variant={isActive ? "secondary" : "default"}>
          {isAnalyzing
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />{stage}</>
            : isActive
              ? <><RefreshCw className="w-3.5 h-3.5" />בדוק שוב</>
              : <><Eye className="w-3.5 h-3.5" />הפעל סימון</>
          }
        </Button>

        {/* Pause / Resume / Cancel during analysis */}
        {isAnalyzing && (
          <>
            {isPaused ? (
              <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={handleResume}>
                <Play className="w-3.5 h-3.5" /> המשך
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={handlePause}>
                <Pause className="w-3.5 h-3.5" /> השהה
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs text-destructive" onClick={handleCancel}>
              <XCircle className="w-3.5 h-3.5" /> עצור
            </Button>
          </>
        )}

        {/* Resume button when stopped mid-way */}
        {canResume && (
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs border-emerald-500/30 text-emerald-600" onClick={() => runAnalysis(true)}>
            <Play className="w-3.5 h-3.5" /> המשך מאיפה שעצר ({completedBatchesRef.current.size}/{totalBatchesRef.current})
          </Button>
        )}

        {/* Clear button */}
        {isActive && !isAnalyzing && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => {
            setIsActive(false); setWordResults([]); setDuplicates([]);
            setSelectedFixes(new Set()); setShowFixPanel(false);
            morphResultsRef.current = [];
            completedBatchesRef.current = new Set();
            completedCountRef.current = 0;
            totalBatchesRef.current = 0;
          }}>
            <XCircle className="w-3.5 h-3.5 ml-1" />נקה
          </Button>
        )}

        {/* Fix All + Select buttons */}
        {isActive && fixableResults.length > 0 && (
          <>
            <Button size="sm" variant="default" className="h-8 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={handleFixAll}>
              <Wand2 className="w-3.5 h-3.5" />
              תקן הכל ({fixableResults.length})
            </Button>
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setShowFixPanel(!showFixPanel)}>
              <ListChecks className="w-3.5 h-3.5" />
              {showFixPanel ? 'סגור בחירה' : 'בחר לתיקון'}
            </Button>
          </>
        )}

        {/* Stats badges */}
        {isActive && (
          <div className="flex gap-1 mr-auto">
            {issueStats.unknown > 0 && <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-400 border-red-500/20">{issueStats.unknown} לא ידוע</Badge>}
            {issueStats.grammar > 0 && <Badge variant="outline" className="text-[10px] bg-orange-500/10 text-orange-400 border-orange-500/20">{issueStats.grammar} דקדוק</Badge>}
            {issueStats.context > 0 && <Badge variant="outline" className="text-[10px] bg-yellow-500/10 text-yellow-400 border-yellow-500/20">{issueStats.context} הקשר</Badge>}
            {issueStats.duplicates > 0 && <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/20 cursor-pointer" onClick={handleRemoveAllDuplicates}><Trash2 className="w-3 h-3 ml-1" />{issueStats.duplicates} כפילויות</Badge>}
          </div>
        )}
      </div>

      {/* Progress bar with percentage */}
      {(isAnalyzing || (progress > 0 && progress < 100)) && (
        <div className="mb-3 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{stage}</span>
            <span className="font-mono font-medium">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
          {isPaused && <span className="text-xs text-yellow-500 font-medium">⏸ מושהה — לחץ המשך כדי להמשיך</span>}
        </div>
      )}

      {/* Marked text display — shown even during analysis for incremental results */}
      {(isActive || (isAnalyzing && wordResults.length > 0)) && (
        <TooltipProvider>
          <div className="p-4 rounded-xl border border-border/40 bg-muted/10 overflow-y-auto max-h-[50vh]" style={{ fontSize: `${fontSize}px`, fontFamily, lineHeight, direction: 'rtl' }} dir="rtl">
            {words.map((word, i) => {
              if (/^\s+$/.test(word)) return word.includes('\n') ? <br key={i} /> : <span key={i}> </span>;
              const style = getWordStyle(i);
              const result = resultMap.get(i);
              const isDuplicate = settings.showDuplicates && duplicateIndices.has(i);
              if (style === '') return <span key={i} className="inline">{word}</span>;
              return (
                <Tooltip key={i}>
                  <TooltipTrigger asChild>
                    <span className={`inline cursor-pointer ${style} rounded px-0.5 transition-colors hover:bg-white/10`} onClick={() => { if (isDuplicate) { const group = duplicates.find(d => d.indices.includes(i)); if (group) setSelectedDuplicate(group); } else if (result?.suggestion) handleApplyFix(i, result.suggestion); }}>{word}</span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs" dir="rtl">
                    <div className="space-y-1">
                      {result?.reason && <p>{result.reason}</p>}
                      {result?.suggestion && <p className="text-emerald-400 font-medium">לחץ לתקן → {result.suggestion}</p>}
                      {isDuplicate && <p className="text-blue-400 font-medium">לחץ לניהול כפילות</p>}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>
      )}

      {/* Fix selection panel */}
      {isActive && showFixPanel && fixableResults.length > 0 && (
        <div className="mt-3 rounded-xl border border-border/40 bg-muted/10 p-3" dir="rtl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ListChecks className="w-4 h-4 text-emerald-400" />
              <h4 className="font-medium text-sm">בחר מילים לתיקון</h4>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={toggleSelectAll}>
                <CheckCheck className="w-3.5 h-3.5" />
                {selectedFixes.size === fixableResults.length ? 'בטל הכל' : 'בחר הכל'}
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700"
                disabled={selectedFixes.size === 0}
                onClick={handleFixSelected}
              >
                <Wand2 className="w-3.5 h-3.5" />
                תקן נבחרים ({selectedFixes.size})
              </Button>
            </div>
          </div>
          <ScrollArea className="max-h-[200px]">
            <div className="space-y-1">
              {fixableResults.map((r) => {
                const isSelected = selectedFixes.has(r.index);
                const issueColor = r.issueType === 'spelling' || r.issueType === 'unknown_word'
                  ? 'text-red-400' : r.issueType === 'grammar'
                  ? 'text-orange-400' : 'text-yellow-400';
                return (
                  <div
                    key={r.index}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                      isSelected ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-white/5 hover:bg-white/10'
                    }`}
                    onClick={() => toggleFixSelection(r.index)}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleFixSelection(r.index)}
                      className="shrink-0"
                    />
                    <span className={`font-medium ${issueColor} line-through text-sm`}>{r.word}</span>
                    <span className="text-white/30 text-xs">→</span>
                    <span className="font-medium text-emerald-400 text-sm">{r.suggestion}</span>
                    {r.reason && (
                      <span className="text-white/30 text-[10px] mr-auto truncate max-w-[150px]">{r.reason}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      )}

      <Dialog open={!!selectedDuplicate} onOpenChange={(open) => !open && setSelectedDuplicate(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>ניהול כפילות: "{selectedDuplicate?.word}"</DialogTitle></DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button variant="destructive" size="sm" onClick={() => selectedDuplicate && handleRemoveDuplicate(selectedDuplicate)}><Trash2 className="w-3.5 h-3.5" />הסר כפילויות</Button>
            <Button variant="outline" size="sm" onClick={() => setSelectedDuplicate(null)}><Check className="w-3.5 h-3.5 ml-1" />השאר הכל</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
