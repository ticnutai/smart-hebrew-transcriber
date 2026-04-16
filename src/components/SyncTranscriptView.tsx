import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { addDictionaryReplacement, addIgnoredWord } from "@/utils/hebrewGrammarDictionary";
import type { MenuSuggestion } from "@/utils/syncedSpellAssist";
import { useTextMarking } from "@/hooks/useTextMarking";
import { MarkingToolbar } from "@/components/MarkingToolbar";
import { AlignRight, Clock, Search, ChevronUp, ChevronDown, X } from "lucide-react";
import type { WordTiming } from "./SyncAudioPlayer";

interface SyncTranscriptViewProps {
  wordTimings: WordTiming[];
  currentTime: number;
  onWordClick: (time: number) => void;
  onWordReplace?: (wordIndex: number, replacement: string) => void;
  fontSize?: number;
  fontFamily?: string;
  syncEnabled?: boolean;
  searchQuery?: string;
  searchActiveIndex?: number;
  onSearchMatchCount?: (count: number) => void;
}

interface SpellMenuState {
  x: number;
  y: number;
  wordIndex: number;
  word: string;
  suggestions: MenuSuggestion[];
}

function normalizeWord(word: string): string {
  return word.replace(/[.,;:!?"'׳״()\[\]{}<>\-–—]/g, "").trim();
}

export const SyncTranscriptView = ({
  wordTimings,
  currentTime,
  onWordClick,
  onWordReplace,
  fontSize = 18,
  fontFamily = "Assistant",
  syncEnabled = true,
  searchQuery,
  searchActiveIndex,
  onSearchMatchCount,
}: SyncTranscriptViewProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeWordRef = useRef<HTMLSpanElement>(null);

  const [spellMenu, setSpellMenu] = useState<SpellMenuState | null>(null);
  const [customCorrection, setCustomCorrection] = useState("");
  const [dictionaryVersion, setDictionaryVersion] = useState(0);

  useEffect(() => {
    if (!spellMenu) return;
    const close = () => setSpellMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [spellMenu]);

  const currentWordIndex = useMemo(() => {
    if (!syncEnabled || !wordTimings.length) return -1;
    for (let i = wordTimings.length - 1; i >= 0; i--) {
      if (currentTime >= wordTimings[i].start) return i;
    }
    return -1;
  }, [currentTime, wordTimings, syncEnabled]);

  // Search matching
  const searchMatchIndices = useMemo(() => {
    if (!searchQuery?.trim()) return new Set<number>();
    const q = searchQuery.trim().toLowerCase();
    const matches = new Set<number>();
    wordTimings.forEach((wt, i) => {
      if (wt.word.toLowerCase().includes(q)) matches.add(i);
    });
    return matches;
  }, [wordTimings, searchQuery]);

  const searchMatchList = useMemo(() => [...searchMatchIndices].sort((a, b) => a - b), [searchMatchIndices]);
  const activeSearchWordIndex = searchMatchList[searchActiveIndex ?? 0] ?? -1;

  useEffect(() => {
    onSearchMatchCount?.(searchMatchList.length);
  }, [searchMatchList.length, onSearchMatchCount]);

  const words = useMemo(() => wordTimings.map((w) => w.word), [wordTimings]);

  // Unified marking hook (local spell + AI analysis)
  const marking = useTextMarking(words, onWordReplace);

  const sentences = useMemo(() => {
    if (!wordTimings.length) return [];
    const groups: { words: (WordTiming & { globalIndex: number })[]; startTime: number }[] = [];
    let current: (WordTiming & { globalIndex: number })[] = [];

    wordTimings.forEach((wt, i) => {
      current.push({ ...wt, globalIndex: i });
      const endsWithPunctuation = /[.!?،؛:\n]$/.test(wt.word);
      if (endsWithPunctuation || current.length >= 15) {
        groups.push({ words: current, startTime: current[0].start });
        current = [];
      }
    });
    if (current.length > 0) {
      groups.push({ words: current, startTime: current[0].start });
    }
    return groups;
  }, [wordTimings]);

  useEffect(() => {
    if (activeWordRef.current && containerRef.current) {
      const container = containerRef.current;
      const word = activeWordRef.current;
      const containerRect = container.getBoundingClientRect();
      const wordRect = word.getBoundingClientRect();
      const isVisible = wordRect.top >= containerRect.top && wordRect.bottom <= containerRect.bottom;
      if (!isVisible) {
        word.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [currentWordIndex]);

  const formatTime = (t: number) => {
    if (!isFinite(t)) return "00:00";
    const m = Math.floor(t / 60).toString().padStart(2, "0");
    const s = Math.floor(t % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const applyCorrection = useCallback((wordIndex: number, correctedWord: string) => {
    const fixed = correctedWord.trim();
    if (!fixed) return;

    if (fixed === "__IGNORE__") {
      const raw = words[wordIndex] || "";
      const clean = normalizeWord(raw);
      if (clean) {
        addIgnoredWord(clean);
        setDictionaryVersion((v) => v + 1);
      }
      setSpellMenu(null);
      setCustomCorrection("");
      return;
    }

    onWordReplace?.(wordIndex, fixed);
    if (fixed !== "__DELETE__") {
      const raw = words[wordIndex] || "";
      const clean = normalizeWord(raw);
      if (clean) {
        addDictionaryReplacement(clean, fixed);
        setDictionaryVersion((v) => v + 1);
      }
    }

    setSpellMenu(null);
    setCustomCorrection("");
  }, [onWordReplace, words]);

  if (!wordTimings.length) {
    return (
      <Card className="p-8 text-center" dir="rtl">
        <AlignRight className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-semibold mb-2">אין נתוני סינכרון</h3>
        <p className="text-muted-foreground text-sm">נדרש תמלול עם חותמות זמן ברמת מילה כדי להציג סינכרון</p>
      </Card>
    );
  }

  // Build combined suggestions for context menu: local + AI
  const getSuggestions = (wordIndex: number): MenuSuggestion[] => {
    const local = marking.localIssueMap.get(wordIndex) || [];
    const aiResult = marking.resultMap.get(wordIndex);
    const combined = [...local];
    if (aiResult?.suggestion) {
      combined.push({ text: aiResult.suggestion, label: aiResult.suggestion, source: aiResult.reason || "AI", score: 1 });
    }
    return combined;
  };

  const hasIssue = (wordIndex: number): boolean => {
    return marking.getWordMarkingStyle(wordIndex) !== "";
  };

  return (
    <Card className="p-4 flex flex-col h-full" dir="rtl">
      {/* Header row */}
      <div className="flex items-center justify-between mb-2 min-h-8">
        <div className="flex items-center gap-2">
          <AlignRight className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">תמלול מסונכרן</h3>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs min-w-[76px] justify-center">
            <Clock className="w-3 h-3 ml-1" />
            {formatTime(currentTime)}
          </Badge>
          <Badge variant="secondary" className="text-xs min-w-[74px] justify-center">
            {currentWordIndex + 1} / {wordTimings.length}
          </Badge>
        </div>
      </div>

      {/* Unified marking toolbar */}
      <div className="mb-2">
        <MarkingToolbar
          settings={marking.settings}
          setSettings={marking.setSettings}
          isActive={marking.isActive}
          isAnalyzing={marking.isAnalyzing}
          isPaused={marking.isPaused}
          progress={marking.progress}
          stage={marking.stage}
          cacheSource={marking.cacheSource}
          canResume={marking.canResume}
          hasText={words.length > 0}
          localIssueCount={marking.localIssueCount}
          issueStats={marking.issueStats}
          fixableResults={marking.fixableResults}
          selectedFixes={marking.selectedFixes}
          showFixPanel={marking.showFixPanel}
          setShowFixPanel={marking.setShowFixPanel}
          toggleFixSelection={marking.toggleFixSelection}
          toggleSelectAll={marking.toggleSelectAll}
          wordResults={marking.wordResults}
          runAnalysis={marking.runAnalysis}
          handlePause={marking.handlePause}
          handleResume={marking.handleResume}
          handleCancel={marking.handleCancel}
          clearResults={marking.clearResults}
          handleFixAll={marking.handleFixAll}
          handleFixSelected={marking.handleFixSelected}
          handleRemoveAllDuplicates={marking.handleRemoveAllDuplicates}
          selectedDuplicate={marking.selectedDuplicate}
          setSelectedDuplicate={marking.setSelectedDuplicate}
          handleRemoveDuplicate={marking.handleRemoveDuplicate}
        />
      </div>

      {/* Word display */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 rounded-lg bg-muted/20 scroll-smooth"
        style={{ fontSize: `${fontSize}px`, fontFamily, lineHeight: 2 }}
      >
        {sentences.map((sentence, si) => {
          const isActiveSentence = sentence.words.some((w) => w.globalIndex === currentWordIndex);
          return (
            <div
              key={si}
              className={cn(
                "inline transition-opacity duration-300",
                isActiveSentence ? "opacity-100" : "opacity-70",
              )}
            >
              {sentence.words.map((wt) => {
                const isActive = wt.globalIndex === currentWordIndex;
                const isPast = wt.globalIndex < currentWordIndex;
                const prob = wt.probability;
                const confidenceStyle = prob != null && prob < 0.5
                  ? "border-b-2 border-red-400/70"
                  : prob != null && prob < 0.7
                    ? "border-b-2 border-orange-400/60"
                    : "";
                const confidenceTitle = prob != null
                  ? ` | ביטחון: ${(prob * 100).toFixed(0)}%`
                  : "";
                const markingClass = marking.getWordMarkingStyle(wt.globalIndex);
                const wordHasIssue = hasIssue(wt.globalIndex);
                const suggestions = wordHasIssue ? getSuggestions(wt.globalIndex) : [];
                const isSearchMatch = searchMatchIndices.has(wt.globalIndex);
                const isSearchActive = wt.globalIndex === activeSearchWordIndex;

                return (
                  <span
                    key={wt.globalIndex}
                    ref={isActive || isSearchActive ? activeWordRef : undefined}
                    className={cn(
                      "px-0.5 py-0.5 rounded cursor-pointer transition-all duration-150 inline-block",
                      confidenceStyle,
                      markingClass,
                      isSearchActive
                        ? "bg-yellow-400 text-black font-bold ring-2 ring-yellow-500 shadow-md"
                        : isSearchMatch
                          ? "bg-yellow-200/70 dark:bg-yellow-800/40"
                          : "",
                      isActive && !isSearchActive
                        ? "bg-primary text-primary-foreground font-bold scale-110 shadow-md mx-0.5"
                        : isPast
                          ? "text-muted-foreground hover:bg-muted"
                          : "hover:bg-muted",
                    )}
                    onClick={() => onWordClick(wt.start)}
                    onContextMenu={(e) => {
                      if (!wordHasIssue) return;
                      e.preventDefault();
                      setCustomCorrection(wt.word);
                      setSpellMenu({
                        x: e.clientX,
                        y: e.clientY,
                        wordIndex: wt.globalIndex,
                        word: wt.word,
                        suggestions,
                      });
                    }}
                    title={`${formatTime(wt.start)} → ${formatTime(wt.end)}${confidenceTitle}${wordHasIssue ? " | קליק ימני להצעות תיקון" : ""}`}
                  >
                    {wt.word}
                  </span>
                );
              })}
              {" "}
            </div>
          );
        })}
      </div>

      {spellMenu && (
        <div
          className="fixed z-[2000] min-w-[260px] max-w-[340px] rounded-md border bg-popover p-3 shadow-xl"
          style={{
            top: Math.min(spellMenu.y + 8, window.innerHeight - 220),
            left: Math.min(spellMenu.x + 8, window.innerWidth - 360),
          }}
          dir="rtl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-xs text-muted-foreground mb-2">
            תיקון עבור: <span className="font-medium text-foreground">{spellMenu.word}</span>
          </div>

          <div className="flex flex-wrap gap-1.5 mb-2">
            {spellMenu.suggestions.length > 0 ? spellMenu.suggestions.map((s, i) => (
              <Button
                key={`${s.text}_${i}_${s.source}`}
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => applyCorrection(spellMenu.wordIndex, s.text)}
                title={`מקור: ${s.source}`}
              >
                {s.label || s.text}
              </Button>
            )) : (
              <span className="text-xs text-muted-foreground">אין הצעות אוטומטיות למילה זו</span>
            )}
          </div>

          <div className="flex gap-1.5">
            <Input
              value={customCorrection}
              onChange={(e) => setCustomCorrection(e.target.value)}
              className="h-8 text-sm"
              dir="rtl"
              onKeyDown={(e) => {
                if (e.key === "Enter" && customCorrection.trim()) {
                  applyCorrection(spellMenu.wordIndex, customCorrection.trim());
                }
              }}
            />
            <Button
              size="sm"
              className="h-8 text-xs"
              onClick={() => customCorrection.trim() && applyCorrection(spellMenu.wordIndex, customCorrection.trim())}
            >
              החלף
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
};
