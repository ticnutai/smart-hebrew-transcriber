import { useRef, useEffect, useMemo, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlignRight, Clock } from "lucide-react";
import type { WordTiming } from "./SyncAudioPlayer";

interface SyncTranscriptViewProps {
  wordTimings: WordTiming[];
  currentTime: number;
  onWordClick: (time: number) => void;
  fontSize?: number;
  fontFamily?: string;
}

export const SyncTranscriptView = ({
  wordTimings,
  currentTime,
  onWordClick,
  fontSize = 18,
  fontFamily = 'Assistant',
}: SyncTranscriptViewProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeWordRef = useRef<HTMLSpanElement>(null);

  // Current word index 
  const currentWordIndex = useMemo(() => {
    if (!wordTimings.length) return -1;
    for (let i = wordTimings.length - 1; i >= 0; i--) {
      if (currentTime >= wordTimings[i].start) return i;
    }
    return -1;
  }, [currentTime, wordTimings]);

  // Group words into sentences (split on period, newline, or every ~15 words)
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

  // Auto-scroll to active word
  useEffect(() => {
    if (activeWordRef.current && containerRef.current) {
      const container = containerRef.current;
      const word = activeWordRef.current;
      const containerRect = container.getBoundingClientRect();
      const wordRect = word.getBoundingClientRect();

      const isVisible = (
        wordRect.top >= containerRect.top &&
        wordRect.bottom <= containerRect.bottom
      );

      if (!isVisible) {
        word.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentWordIndex]);

  const formatTime = (t: number) => {
    if (!isFinite(t)) return '00:00';
    const m = Math.floor(t / 60).toString().padStart(2, '0');
    const s = Math.floor(t % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  if (!wordTimings.length) {
    return (
      <Card className="p-8 text-center" dir="rtl">
        <AlignRight className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-semibold mb-2">אין נתוני סינכרון</h3>
        <p className="text-muted-foreground text-sm">
          נדרש תמלול עם חותמות זמן ברמת מילה כדי להציג סינכרון
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4" dir="rtl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlignRight className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">תמלול מסונכרן</h3>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            <Clock className="w-3 h-3 ml-1" />
            {formatTime(currentTime)}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {currentWordIndex + 1} / {wordTimings.length}
          </Badge>
        </div>
      </div>

      <div
        ref={containerRef}
        className="max-h-[500px] overflow-y-auto p-4 rounded-lg bg-muted/20 scroll-smooth"
        style={{ fontSize: `${fontSize}px`, fontFamily, lineHeight: 2 }}
      >
        {sentences.map((sentence, si) => {
          const isActiveSentence = sentence.words.some(w => w.globalIndex === currentWordIndex);
          return (
            <div
              key={si}
              className={`
                inline transition-opacity duration-300
                ${isActiveSentence ? 'opacity-100' : 'opacity-70'}
              `}
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
                        ? 'bg-primary text-primary-foreground font-bold scale-110 shadow-md mx-0.5'
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
    </Card>
  );
};
