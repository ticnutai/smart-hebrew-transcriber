import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Edit3, Clock, Link, Unlink } from "lucide-react";
import type { WordTiming } from "./SyncAudioPlayer";

interface SyncEditableViewProps {
  wordTimings: WordTiming[];
  currentTime: number;
  text: string;
  onTextChange: (text: string) => void;
  onWordClick: (time: number) => void;
  fontSize?: number;
  fontFamily?: string;
  syncEnabled?: boolean;
}

export const SyncEditableView = ({
  wordTimings,
  currentTime,
  text,
  onTextChange,
  onWordClick,
  fontSize = 18,
  fontFamily = 'Assistant',
  syncEnabled = true,
}: SyncEditableViewProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeWordRef = useRef<HTMLSpanElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(text);

  useEffect(() => {
    if (!isEditing) setEditText(text);
  }, [text, isEditing]);

  const currentWordIndex = useMemo(() => {
    if (!syncEnabled || !wordTimings.length) return -1;
    for (let i = wordTimings.length - 1; i >= 0; i--) {
      if (currentTime >= wordTimings[i].start) return i;
    }
    return -1;
  }, [currentTime, wordTimings, syncEnabled]);

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
    if (activeWordRef.current && containerRef.current && !isEditing) {
      const container = containerRef.current;
      const word = activeWordRef.current;
      const containerRect = container.getBoundingClientRect();
      const wordRect = word.getBoundingClientRect();
      const isVisible = wordRect.top >= containerRect.top && wordRect.bottom <= containerRect.bottom;
      if (!isVisible) {
        word.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentWordIndex, isEditing]);

  const formatTime = (t: number) => {
    if (!isFinite(t)) return '00:00';
    const m = Math.floor(t / 60).toString().padStart(2, '0');
    const s = Math.floor(t % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleSave = useCallback(() => {
    onTextChange(editText);
    setIsEditing(false);
  }, [editText, onTextChange]);

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
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Edit3 className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">עריכה מסונכרנת</h3>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            <Clock className="w-3 h-3 ml-1" />
            {formatTime(currentTime)}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {currentWordIndex + 1} / {wordTimings.length}
          </Badge>
          <Button
            variant={isEditing ? "default" : "outline"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => isEditing ? handleSave() : setIsEditing(true)}
          >
            {isEditing ? 'שמור' : 'ערוך'}
          </Button>
        </div>
      </div>

      {isEditing ? (
        <textarea
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          className="flex-1 min-h-[200px] w-full rounded-lg bg-muted/20 p-4 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
          style={{ fontSize: `${fontSize}px`, fontFamily, lineHeight: 2, direction: 'rtl' }}
        />
      ) : (
        <div
          ref={containerRef}
          className="flex-1 overflow-y-auto p-3 rounded-lg bg-muted/20 scroll-smooth"
          style={{ fontSize: `${fontSize}px`, fontFamily, lineHeight: 2 }}
        >
          {sentences.map((sentence, si) => {
            const isActiveSentence = sentence.words.some(w => w.globalIndex === currentWordIndex);
            return (
              <div
                key={si}
                className={`inline transition-opacity duration-300 ${isActiveSentence ? 'opacity-100' : 'opacity-70'}`}
              >
                {sentence.words.map((wt) => {
                  const isActive = wt.globalIndex === currentWordIndex;
                  const isPast = wt.globalIndex < currentWordIndex;
                  return (
                    <span
                      key={wt.globalIndex}
                      ref={isActive ? activeWordRef : undefined}
                      className={`
                        px-0.5 py-0.5 rounded cursor-pointer transition-all duration-150 inline-block
                        ${isActive
                          ? 'bg-accent text-accent-foreground font-bold scale-110 shadow-md mx-0.5'
                          : isPast
                            ? 'text-muted-foreground hover:bg-muted'
                            : 'hover:bg-muted'
                        }
                      `}
                      onClick={() => onWordClick(wt.start)}
                      title={`${formatTime(wt.start)} → ${formatTime(wt.end)}`}
                    >
                      {wt.word}
                    </span>
                  );
                })}
                {' '}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};
