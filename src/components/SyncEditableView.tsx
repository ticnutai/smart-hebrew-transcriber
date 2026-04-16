import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { addDictionaryReplacement, addIgnoredWord } from "@/utils/hebrewGrammarDictionary";
import { buildIssueMap, type SyncedSpellAssistSettings, type MenuSuggestion } from "@/utils/syncedSpellAssist";
import { Edit3, Clock, SpellCheck, Settings2, Link, Unlink } from "lucide-react";
import type { WordTiming } from "./SyncAudioPlayer";

interface SyncEditableViewProps {
  wordTimings: WordTiming[];
  currentTime: number;
  text: string;
  onTextChange: (text: string) => void;
  onWordClick: (time: number) => void;
  onWordReplace?: (wordIndex: number, replacement: string) => void;
  fontSize?: number;
  fontFamily?: string;
  syncEnabled?: boolean;
}

interface SpellMenuState {
  x: number;
  y: number;
  wordIndex: number;
  word: string;
  suggestions: MenuSuggestion[];
}

const SETTINGS_KEY = "sync_editor_spell_assist_v1";

const DEFAULT_SETTINGS: SyncedSpellAssistSettings = {
  enabled: false,
  grammarEnabled: true,
  duplicateWordsRule: true,
  punctuationRule: true,
  latinWordsRule: true,
  useDictionary: true,
  markMode: "underline",
  markColor: "#ef4444",
  keepMarkedAfterFix: false,
};

function normalizeWord(word: string): string {
  return word.replace(/[.,;:!?"'׳״()\[\]{}<>\-–—]/g, "").trim();
}

function loadSettings(): SyncedSpellAssistSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<SyncedSpellAssistSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return `rgba(239, 68, 68, ${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const SyncEditableView = ({
  wordTimings,
  currentTime,
  text,
  onTextChange,
  onWordClick,
  onWordReplace,
  fontSize = 18,
  fontFamily = "Assistant",
  syncEnabled = true,
}: SyncEditableViewProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeWordRef = useRef<HTMLSpanElement>(null);
  const [isEditing, setIsEditing] = useState(true);

  const [settings, setSettings] = useState<SyncedSpellAssistSettings>(() => loadSettings());
  const [showSettings, setShowSettings] = useState(false);
  const [spellMenu, setSpellMenu] = useState<SpellMenuState | null>(null);
  const [customCorrection, setCustomCorrection] = useState("");
  const [stickyMarked, setStickyMarked] = useState<Set<number>>(new Set());
  const [dictionaryVersion, setDictionaryVersion] = useState(0);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Ignore storage errors
    }
  }, [settings]);

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

  const words = useMemo(() => wordTimings.map((w) => w.word), [wordTimings]);

  const issueMap = useMemo(
    () => buildIssueMap(words, settings, stickyMarked),
    [words, settings, stickyMarked, dictionaryVersion],
  );

  const sentences = useMemo(() => {
    if (!wordTimings.length) return [];
    const groups: { words: (WordTiming & { globalIndex: number })[] }[] = [];
    let current: (WordTiming & { globalIndex: number })[] = [];

    wordTimings.forEach((wt, i) => {
      current.push({ ...wt, globalIndex: i });
      const endsWithPunctuation = /[.!?،؛:\n]$/.test(wt.word);
      if (endsWithPunctuation || current.length >= 15) {
        groups.push({ words: current });
        current = [];
      }
    });

    if (current.length > 0) groups.push({ words: current });
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
  }, [currentWordIndex, isEditing]);

  const formatTime = (t: number) => {
    if (!isFinite(t)) return "00:00";
    const m = Math.floor(t / 60).toString().padStart(2, "0");
    const s = Math.floor(t % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const replaceWordFallback = useCallback((wordIndex: number, replacement: string) => {
    const words = text.split(/\s+/).filter(Boolean);
    if (wordIndex < 0 || wordIndex >= words.length) return;
    words[wordIndex] = replacement;
    onTextChange(words.join(" "));
  }, [onTextChange, text]);

  const applyInlineWordEdit = useCallback((wordIndex: number, rawValue: string) => {
    const fixed = rawValue.trim().replace(/\s+/g, " ");
    if (!fixed || fixed === wordTimings[wordIndex]?.word) return;
    if (onWordReplace) onWordReplace(wordIndex, fixed);
    else replaceWordFallback(wordIndex, fixed);
  }, [onWordReplace, replaceWordFallback, wordTimings]);

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

    if (onWordReplace) {
      onWordReplace(wordIndex, fixed);
    } else {
      const plainWords = text.split(/\s+/).filter(Boolean);
      if (wordIndex >= 0 && wordIndex < plainWords.length) {
        plainWords[wordIndex] = fixed;
        onTextChange(plainWords.join(" "));
      }
    }

    if (fixed !== "__DELETE__") {
      const raw = words[wordIndex] || "";
      const clean = normalizeWord(raw);
      if (clean) {
        addDictionaryReplacement(clean, fixed);
        setDictionaryVersion((v) => v + 1);
      }
    }

    setStickyMarked((prev) => {
      const next = new Set(prev);
      if (settings.keepMarkedAfterFix) next.add(wordIndex);
      else next.delete(wordIndex);
      return next;
    });

    setSpellMenu(null);
    setCustomCorrection("");
  }, [onWordReplace, onTextChange, settings.keepMarkedAfterFix, text, words]);

  const markStyleForWord = useCallback((wordIndex: number): React.CSSProperties => {
    if (!settings.enabled || !issueMap.has(wordIndex)) return {};

    if (settings.markMode === "highlight") {
      return {
        backgroundColor: hexToRgba(settings.markColor, 0.28),
        borderRadius: "0.25rem",
      };
    }

    return {
      textDecorationLine: "underline",
      textDecorationStyle: "wavy",
      textDecorationColor: settings.markColor,
      textUnderlineOffset: "3px",
      textDecorationThickness: "1.5px",
    };
  }, [issueMap, settings.enabled, settings.markColor, settings.markMode]);

  if (!wordTimings.length && !text) {
    return (
      <Card className="p-6 text-center" dir="rtl">
        <Edit3 className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
        <h3 className="text-sm font-semibold mb-1">עריכה מסונכרנת</h3>
        <p className="text-muted-foreground text-xs">נדרש תמלול עם תזמונים</p>
      </Card>
    );
  }

  return (
    <Card className="p-4 flex flex-col h-full" dir="rtl">
      <div className="flex items-center justify-between mb-3 min-h-10">
        <div className="flex items-center gap-2">
          <Edit3 className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">עריכה מסונכרנת</h3>
          <Badge variant={syncEnabled ? "secondary" : "outline"} className="text-xs gap-1 min-w-[86px] justify-center">
            {syncEnabled ? <Link className="w-3 h-3" /> : <Unlink className="w-3 h-3" />}
            {syncEnabled ? "מסונכרן" : "מושהה"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="group relative">
            <Button
              variant={settings.enabled ? "default" : "outline"}
              size="sm"
              className="h-7 px-2 text-xs gap-1 min-w-[108px]"
              onClick={() => setSettings((prev) => ({ ...prev, enabled: !prev.enabled }))}
              title="הפעלת/כיבוי זיהוי שגיאות כתיב ותחביר"
            >
              <SpellCheck className="w-3.5 h-3.5" />
              בדיקת שגיאות
            </Button>

            {settings.enabled && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 absolute -left-7 top-0 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => setShowSettings((v) => !v)}
                title="הגדרות סימון"
              >
                <Settings2 className="w-3.5 h-3.5" />
              </Button>
            )}

            {settings.enabled && showSettings && (
              <div className="absolute left-0 top-8 z-50 w-72 rounded-md border bg-popover p-3 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <p className="text-xs font-medium mb-2">הגדרות סימון שגיאות</p>
                <div className="space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">בדיקת תחביר בסיסית</Label>
                    <Switch checked={settings.grammarEnabled} onCheckedChange={(v) => setSettings((prev) => ({ ...prev, grammarEnabled: v }))} />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label className="text-xs">זיהוי כפילות מילים</Label>
                    <Switch checked={settings.duplicateWordsRule} onCheckedChange={(v) => setSettings((prev) => ({ ...prev, duplicateWordsRule: v }))} />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label className="text-xs">זיהוי פיסוק חריג</Label>
                    <Switch checked={settings.punctuationRule} onCheckedChange={(v) => setSettings((prev) => ({ ...prev, punctuationRule: v }))} />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label className="text-xs">זיהוי לטינית בטקסט עברי</Label>
                    <Switch checked={settings.latinWordsRule} onCheckedChange={(v) => setSettings((prev) => ({ ...prev, latinWordsRule: v }))} />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label className="text-xs">מילון דקדוקי מותאם</Label>
                    <Switch checked={settings.useDictionary} onCheckedChange={(v) => setSettings((prev) => ({ ...prev, useDictionary: v }))} />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label className="text-xs">מצב סימון</Label>
                    <div className="flex gap-1">
                      <Button variant={settings.markMode === "underline" ? "default" : "outline"} size="sm" className="h-6 px-2 text-[10px]" onClick={() => setSettings((prev) => ({ ...prev, markMode: "underline" }))}>קו תחתון</Button>
                      <Button variant={settings.markMode === "highlight" ? "default" : "outline"} size="sm" className="h-6 px-2 text-[10px]" onClick={() => setSettings((prev) => ({ ...prev, markMode: "highlight" }))}>היילייט</Button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs">צבע סימון</Label>
                    <Input type="color" className="h-7 w-16 p-1" value={settings.markColor} onChange={(e) => setSettings((prev) => ({ ...prev, markColor: e.target.value }))} />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label className="text-xs">להשאיר סימון אחרי תיקון</Label>
                    <Switch checked={settings.keepMarkedAfterFix} onCheckedChange={(v) => setSettings((prev) => ({ ...prev, keepMarkedAfterFix: v }))} />
                  </div>
                </div>
              </div>
            )}
          </div>

          <Badge variant="outline" className="text-xs min-w-[76px] justify-center">
            <Clock className="w-3 h-3 ml-1" />
            {formatTime(currentTime)}
          </Badge>
          <Badge variant="secondary" className="text-xs min-w-[74px] justify-center">
            {currentWordIndex + 1} / {wordTimings.length}
          </Badge>

          <Button
            variant={isEditing ? "default" : "outline"}
            size="sm"
            className="h-7 px-2 text-xs min-w-[96px]"
            onClick={() => setIsEditing((v) => !v)}
          >
            {isEditing ? "עריכה פעילה" : "ערוך"}
          </Button>
        </div>
      </div>

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
              className={`inline transition-opacity duration-300 ${isActiveSentence ? "opacity-100" : "opacity-70"}`}
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
                const isIssue = settings.enabled && issueMap.has(wt.globalIndex);
                const suggestions = isIssue ? (issueMap.get(wt.globalIndex) || []) : [];
                return (
                  <span
                    key={wt.globalIndex}
                    ref={isActive ? activeWordRef : undefined}
                    contentEditable={isEditing}
                    suppressContentEditableWarning
                    spellCheck={false}
                    className={cn(
                      "px-0.5 py-0.5 rounded transition-all duration-150 inline-block",
                      confidenceStyle,
                      isEditing ? "cursor-text" : "cursor-pointer",
                      isActive
                        ? "bg-accent text-accent-foreground font-bold scale-110 shadow-md mx-0.5"
                        : isPast
                          ? "text-muted-foreground hover:bg-muted"
                          : "hover:bg-muted",
                    )}
                    style={markStyleForWord(wt.globalIndex)}
                    onClick={() => {
                      if (!isEditing) onWordClick(wt.start);
                    }}
                    onBlur={(e) => {
                      if (!isEditing) return;
                      const next = e.currentTarget.textContent || wt.word;
                      applyInlineWordEdit(wt.globalIndex, next);
                    }}
                    onKeyDown={(e) => {
                      if (!isEditing) return;
                      if (e.key === "Enter") {
                        e.preventDefault();
                        (e.currentTarget as HTMLElement).blur();
                      }
                    }}
                    onContextMenu={(e) => {
                      if (!settings.enabled || !isIssue) return;
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
                    title={`${formatTime(wt.start)} → ${formatTime(wt.end)}${isIssue ? " | קליק ימני להצעות תיקון" : ""}${isEditing ? " | מצב עריכה" : ""}`}
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
