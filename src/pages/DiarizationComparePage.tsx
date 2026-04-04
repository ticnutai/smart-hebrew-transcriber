import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeftRight, BarChart3, Clock, Copy, Download, FileText,
  GitCompareArrows, MessageSquare, Users, ArrowRight,
  Maximize2, Minimize2, Eye, EyeOff, Filter, Printer, ChevronDown,
} from "lucide-react";
import DiffMatchPatch from "diff-match-patch";

/* ═══════════════════════ Types ═══════════════════════ */

interface DiarizedSegment {
  text: string;
  start: number;
  end: number;
  speaker: string;
  speaker_label: string;
}

interface DiarizationResult {
  text: string;
  segments: DiarizedSegment[];
  speakers: string[];
  speaker_count: number;
  duration: number;
  processing_time: number;
  diarization_method: string;
}

interface CompareEntry {
  label: string;
  result: DiarizationResult;
}

/* ═══════════════════════ Constants ═══════════════════════ */

const BAR_COLORS = [
  "#3b82f6", "#22c55e", "#a855f7", "#f97316", "#ec4899",
  "#06b6d4", "#eab308", "#ef4444", "#6366f1", "#14b8a6",
];

const ENGINE_COLORS: Record<string, string> = {
  "מקומי": "#3b82f6",
  "WhisperX": "#a855f7",
  "AssemblyAI": "#22c55e",
  "Deepgram": "#f97316",
  "OpenAI": "#ec4899",
  "דפדפן": "#06b6d4",
};

/* ═══════════════════════ Utility Functions ═══════════════════════ */

function formatDuration(sec: number): string {
  if (sec < 60) return `${Math.round(sec)} שנ׳`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s > 0 ? `${m} דק׳ ${s} שנ׳` : `${m} דק׳`;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getSpeakerDistribution(result: DiarizationResult) {
  const dist: Record<string, number> = {};
  for (const seg of result.segments) {
    dist[seg.speaker_label] = (dist[seg.speaker_label] || 0) + (seg.end - seg.start);
  }
  const total = Object.values(dist).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(dist)
    .map(([label, time]) => ({ label, time, pct: (time / total) * 100 }))
    .sort((a, b) => b.time - a.time);
}

function computeAgreement(a: DiarizationResult, b: DiarizationResult): number {
  if (a.duration === 0) return 0;
  const step = 0.5;
  const totalSteps = Math.floor(a.duration / step);
  if (totalSteps === 0) return 0;

  const getSpeakerAt = (result: DiarizationResult, time: number): number => {
    for (const seg of result.segments) {
      if (time >= seg.start && time < seg.end) {
        return result.speakers.indexOf(seg.speaker_label);
      }
    }
    return -1;
  };

  const overlapMatrix: number[][] = Array.from({ length: a.speakers.length }, () =>
    new Array(b.speakers.length).fill(0)
  );

  for (let t = 0; t < totalSteps; t++) {
    const time = t * step;
    const spA = getSpeakerAt(a, time);
    const spB = getSpeakerAt(b, time);
    if (spA >= 0 && spB >= 0) {
      overlapMatrix[spA][spB] += 1;
    }
  }

  const speakerMap = new Map<number, number>();
  const usedB = new Set<number>();
  for (let i = 0; i < a.speakers.length; i++) {
    let bestJ = -1, bestOverlap = 0;
    for (let j = 0; j < b.speakers.length; j++) {
      if (!usedB.has(j) && overlapMatrix[i][j] > bestOverlap) {
        bestOverlap = overlapMatrix[i][j];
        bestJ = j;
      }
    }
    if (bestJ >= 0) { speakerMap.set(i, bestJ); usedB.add(bestJ); }
  }

  let agree = 0;
  for (let t = 0; t < totalSteps; t++) {
    const time = t * step;
    const spA = getSpeakerAt(a, time);
    const spB = getSpeakerAt(b, time);
    if (spA >= 0 && spB >= 0 && speakerMap.get(spA) === spB) agree++;
  }

  return (agree / totalSteps) * 100;
}

function getMergedSegments(result: DiarizationResult): DiarizedSegment[] {
  const merged: DiarizedSegment[] = [];
  for (const seg of result.segments) {
    const prev = merged[merged.length - 1];
    if (prev && prev.speaker_label === seg.speaker_label) {
      prev.text = prev.text + ' ' + seg.text;
      prev.end = seg.end;
    } else {
      merged.push({ ...seg });
    }
  }
  return merged;
}

function getMergedText(result: DiarizationResult): string {
  return getMergedSegments(result)
    .map(s => `[${s.speaker_label}] ${s.text}`)
    .join('\n');
}

/* ═══════════════════════ Section Components ═══════════════════════ */

/** Agreement matrix heatmap */
function AgreementMatrix({ entries, comparisons, activePair, onSelectPair }: {
  entries: CompareEntry[];
  comparisons: Array<{ a: string; b: string; aIdx: number; bIdx: number; agreement: number }>;
  activePair: [number, number];
  onSelectPair: (pair: [number, number]) => void;
}) {
  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <ArrowLeftRight className="w-4 h-4 text-primary" />
        מטריצת התאמה בין מנועים
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="p-1 text-right" />
              {entries.map((e, i) => (
                <th key={i} className="p-1 text-center font-medium min-w-[80px]">
                  <Badge variant="outline" className="text-xs" style={{ borderColor: ENGINE_COLORS[e.label] || '#888' }}>
                    {e.label}
                  </Badge>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((rowEntry, ri) => (
              <tr key={ri}>
                <td className="p-1 text-right font-medium">
                  <Badge variant="outline" className="text-xs" style={{ borderColor: ENGINE_COLORS[rowEntry.label] || '#888' }}>
                    {rowEntry.label}
                  </Badge>
                </td>
                {entries.map((_colEntry, ci) => {
                  if (ri === ci) {
                    return (
                      <td key={ci} className="p-1 text-center">
                        <div className="w-full h-8 rounded bg-muted/50 flex items-center justify-center text-muted-foreground">—</div>
                      </td>
                    );
                  }
                  const comp = comparisons.find(c =>
                    (c.aIdx === ri && c.bIdx === ci) || (c.aIdx === ci && c.bIdx === ri)
                  );
                  const agreement = comp ? comp.agreement : 0;
                  const isActive = (activePair[0] === ri && activePair[1] === ci) || (activePair[0] === ci && activePair[1] === ri);
                  const bg = agreement > 70 ? 'bg-green-100 dark:bg-green-900/30' : agreement > 40 ? 'bg-yellow-100 dark:bg-yellow-900/30' : 'bg-red-100 dark:bg-red-900/30';
                  return (
                    <td key={ci} className="p-1 text-center">
                      <button
                        className={`w-full h-8 rounded font-bold text-sm transition-all ${bg} ${isActive ? 'ring-2 ring-primary' : 'hover:ring-1 hover:ring-primary/50'}`}
                        onClick={() => onSelectPair([Math.min(ri, ci), Math.max(ri, ci)])}
                      >
                        {Math.round(agreement)}%
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Side-by-side diff view */
function SideBySideDiff({ entries, diffPair, dmp }: {
  entries: CompareEntry[];
  diffPair: [number, number];
  dmp: DiffMatchPatch;
}) {
  const diffResult = useMemo(() => {
    if (!entries[diffPair[0]] || !entries[diffPair[1]]) return null;
    const textA = getMergedText(entries[diffPair[0]].result);
    const textB = getMergedText(entries[diffPair[1]].result);
    const diffs = dmp.diff_main(textA, textB);
    dmp.diff_cleanupSemantic(diffs);

    let added = 0, removed = 0, same = 0;
    for (const [op, text] of diffs) {
      const words = text.split(/\s+/).filter(Boolean).length;
      if (op === 1) added += words;
      else if (op === -1) removed += words;
      else same += words;
    }
    const total = same + Math.max(added, removed);
    const similarity = total > 0 ? Math.round((same / total) * 100) : 0;
    return { diffs, added, removed, same, similarity };
  }, [entries, diffPair, dmp]);

  const renderSide = (side: 'left' | 'right') => {
    if (!diffResult) return null;
    return diffResult.diffs.map(([op, text], i) => {
      if (side === 'left') {
        if (op === 0) return <span key={i}>{text}</span>;
        if (op === -1) return <span key={i} className="bg-red-200/70 dark:bg-red-900/40 text-red-800 dark:text-red-300 line-through px-0.5 rounded">{text}</span>;
        return null;
      }
      if (op === 0) return <span key={i}>{text}</span>;
      if (op === 1) return <span key={i} className="bg-green-200/70 dark:bg-green-900/40 text-green-800 dark:text-green-300 font-semibold px-0.5 rounded">{text}</span>;
      return null;
    });
  };

  if (!diffResult) return null;

  return (
    <div className="space-y-3">
      {/* Stats bar */}
      <div className="flex items-center gap-4 text-xs flex-wrap">
        <Badge variant="secondary" className="gap-1 text-sm font-bold">
          דמיון: {diffResult.similarity}%
        </Badge>
        <span className="text-green-600 dark:text-green-400 font-medium">+{diffResult.added} מילים נוספו</span>
        <span className="text-red-600 dark:text-red-400 font-medium">−{diffResult.removed} מילים הוסרו</span>
        <span className="text-muted-foreground">{diffResult.same} מילים משותפות</span>
      </div>

      {/* Side-by-side panels */}
      <div className="grid grid-cols-2 gap-4">
        {([diffPair[0], diffPair[1]] as const).map((idx, sideNum) => {
          const side = sideNum === 0 ? 'left' : 'right';
          const entry = entries[idx];
          const color = ENGINE_COLORS[entry?.label] || '#888';
          return (
            <Card key={sideNum} className="flex flex-col" style={{ borderTopColor: color, borderTopWidth: '3px' }}>
              <div className="sticky top-0 bg-card z-10 p-3 pb-2 flex items-center justify-between border-b">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                  <span className="font-semibold text-sm">{entry?.label}</span>
                  <Badge variant="outline" className="text-[10px]">{entry?.result.diarization_method}</Badge>
                </div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => {
                        navigator.clipboard.writeText(getMergedText(entry.result));
                      }}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>העתק טקסט</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <ScrollArea className="h-[500px] p-3" dir="rtl">
                <div className="text-sm leading-relaxed whitespace-pre-wrap">
                  {renderSide(side as 'left' | 'right')}
                </div>
              </ScrollArea>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/** Segment-by-segment timeline comparison aligned by time */
function TimelineComparison({ entries, diffPair }: {
  entries: CompareEntry[];
  diffPair: [number, number];
}) {
  const entryA = entries[diffPair[0]];
  const entryB = entries[diffPair[1]];

  const duration = Math.max(entryA?.result.duration || 0, entryB?.result.duration || 0);
  const timeSlots = useMemo(() => {
    if (!entryA || !entryB) return [];
    const step = 2; // 2-second slots
    const slots: Array<{
      time: number;
      segA: DiarizedSegment | null;
      segB: DiarizedSegment | null;
      match: boolean;
    }> = [];

    for (let t = 0; t < duration; t += step) {
      const segA = entryA.result.segments.find(s => t >= s.start && t < s.end) || null;
      const segB = entryB.result.segments.find(s => t >= s.start && t < s.end) || null;
      const match = segA && segB ? segA.speaker_label === segB.speaker_label : (segA === null && segB === null);
      slots.push({ time: t, segA, segB, match });
    }
    return slots;
  }, [entryA, entryB, duration]);

  if (!entryA || !entryB) return null;

  return (
    <Card className="p-4 space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Clock className="w-4 h-4 text-primary" />
        השוואת ציר זמן — {entryA.label} מול {entryB.label}
      </h3>

      {/* Dual timeline bars */}
      <div className="space-y-1">
        {[entryA, entryB].map((entry, rowIdx) => (
          <div key={rowIdx} className="flex items-center gap-2">
            <span className="text-xs font-medium min-w-[70px] text-left">{entry.label}</span>
            <div className="flex-1 relative h-5 bg-muted/30 rounded overflow-hidden">
              {entry.result.segments.map((seg, si) => {
                const left = (seg.start / duration) * 100;
                const width = ((seg.end - seg.start) / duration) * 100;
                const spIdx = entry.result.speakers.indexOf(seg.speaker_label);
                return (
                  <div
                    key={si}
                    className="absolute top-0 h-full opacity-80 hover:opacity-100 transition-opacity"
                    style={{
                      left: `${left}%`,
                      width: `${Math.max(width, 0.3)}%`,
                      backgroundColor: BAR_COLORS[spIdx % BAR_COLORS.length],
                    }}
                    title={`${seg.speaker_label}: ${formatTime(seg.start)}-${formatTime(seg.end)}\n${seg.text.slice(0, 60)}`}
                  />
                );
              })}
            </div>
          </div>
        ))}

        {/* Agreement bar */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground min-w-[70px] text-left">התאמה</span>
          <div className="flex-1 relative h-3 bg-muted/30 rounded overflow-hidden flex">
            {timeSlots.map((slot, i) => (
              <div
                key={i}
                className="h-full"
                style={{
                  flex: '1',
                  backgroundColor: slot.match ? '#22c55e' : '#ef4444',
                  opacity: (slot.segA || slot.segB) ? 0.7 : 0.15,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>0:00</span>
        <span>{formatTime(duration / 4)}</span>
        <span>{formatTime(duration / 2)}</span>
        <span>{formatTime(duration * 3 / 4)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </Card>
  );
}

/** Per-engine statistics cards */
function EngineStatsCards({ entries }: { entries: CompareEntry[] }) {
  return (
    <div className={`grid gap-4 ${entries.length === 2 ? 'grid-cols-2' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
      {entries.map((entry, idx) => {
        const dist = getSpeakerDistribution(entry.result);
        const mergedSegs = getMergedSegments(entry.result);
        const color = ENGINE_COLORS[entry.label] || '#888';
        const avgSegLen = entry.result.segments.length > 0
          ? (entry.result.segments.reduce((a, s) => a + (s.end - s.start), 0) / entry.result.segments.length)
          : 0;
        const totalWords = entry.result.segments.reduce((a, s) => a + s.text.split(/\s+/).filter(Boolean).length, 0);

        return (
          <Card key={idx} className="p-4" style={{ borderTopColor: color, borderTopWidth: '3px' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                <span className="font-semibold text-sm">{entry.label}</span>
              </div>
              <Badge variant="outline" className="text-[10px]">{entry.result.diarization_method}</Badge>
            </div>

            {/* Key stats */}
            <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
              <div className="bg-muted/30 rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-primary">{entry.result.speaker_count}</div>
                <div className="text-muted-foreground">דוברים</div>
              </div>
              <div className="bg-muted/30 rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-primary">{entry.result.segments.length}</div>
                <div className="text-muted-foreground">קטעים</div>
              </div>
              <div className="bg-muted/30 rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-primary">{totalWords}</div>
                <div className="text-muted-foreground">מילים</div>
              </div>
              <div className="bg-muted/30 rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-primary">{entry.result.processing_time.toFixed(1)}s</div>
                <div className="text-muted-foreground">זמן עיבוד</div>
              </div>
            </div>

            {/* Speaker bar */}
            <div className="flex h-5 rounded-full overflow-hidden mb-2">
              {dist.map((d, i) => (
                <div
                  key={d.label}
                  className="h-full transition-all"
                  style={{ width: `${d.pct}%`, backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }}
                  title={`${d.label}: ${Math.round(d.pct)}%`}
                />
              ))}
            </div>

            {/* Speaker legend */}
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {dist.map((d, i) => (
                <span key={d.label} className="flex items-center gap-1 text-xs">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }} />
                  {d.label} ({Math.round(d.pct)}%)
                </span>
              ))}
            </div>

            <Separator className="my-2" />

            {/* Extra info */}
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div>משך: {formatDuration(entry.result.duration)}</div>
              <div>ממוצע קטע: {avgSegLen.toFixed(1)} שנ׳</div>
              <div>פסקאות ממוזגות: {mergedSegs.length}</div>
            </div>

            {/* Timeline */}
            <div className="mt-2 relative h-6 bg-muted/30 rounded overflow-hidden">
              {entry.result.segments.map((seg, si) => {
                const left = (seg.start / entry.result.duration) * 100;
                const width = ((seg.end - seg.start) / entry.result.duration) * 100;
                const spIdx = entry.result.speakers.indexOf(seg.speaker_label);
                return (
                  <div
                    key={si}
                    className="absolute top-0 h-full opacity-80"
                    style={{
                      left: `${left}%`,
                      width: `${Math.max(width, 0.3)}%`,
                      backgroundColor: BAR_COLORS[spIdx % BAR_COLORS.length],
                    }}
                  />
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
              <span>0:00</span>
              <span>{formatTime(entry.result.duration)}</span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/** Side-by-side transcript comparison by segments */
function TranscriptComparison({ entries, diffPair }: {
  entries: CompareEntry[];
  diffPair: [number, number];
}) {
  const [speakerFilter, setSpeakerFilter] = useState<string | null>(null);

  const entryA = entries[diffPair[0]];
  const entryB = entries[diffPair[1]];
  if (!entryA || !entryB) return null;

  const mergedA = getMergedSegments(entryA.result);
  const mergedB = getMergedSegments(entryB.result);

  const allSpeakers = [...new Set([...entryA.result.speakers, ...entryB.result.speakers])];

  const filterSegs = (segs: DiarizedSegment[]) => {
    if (!speakerFilter) return segs;
    return segs.filter(s => s.speaker_label === speakerFilter);
  };

  return (
    <div className="space-y-3">
      {/* Speaker filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">סנן לפי דובר:</span>
        <Button variant={!speakerFilter ? 'default' : 'outline'} size="sm" className="text-xs h-6" onClick={() => setSpeakerFilter(null)}>
          הכל
        </Button>
        {allSpeakers.map((sp, i) => (
          <Button
            key={sp}
            variant={speakerFilter === sp ? 'default' : 'outline'}
            size="sm"
            className="text-xs h-6 gap-1"
            onClick={() => setSpeakerFilter(sp === speakerFilter ? null : sp)}
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }} />
            {sp}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {[{ entry: entryA, segs: filterSegs(mergedA) }, { entry: entryB, segs: filterSegs(mergedB) }].map(({ entry, segs }, sideNum) => {
          const color = ENGINE_COLORS[entry.label] || '#888';
          return (
            <Card key={sideNum} className="flex flex-col" style={{ borderTopColor: color, borderTopWidth: '3px' }}>
              <div className="sticky top-0 bg-card z-10 p-3 pb-2 flex items-center justify-between border-b">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                  <span className="font-semibold text-sm">{entry.label}</span>
                  <span className="text-xs text-muted-foreground">{segs.length} פסקאות</span>
                </div>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => {
                  const text = segs.map(s => `[${s.speaker_label}] (${formatTime(s.start)}-${formatTime(s.end)})\n${s.text}`).join('\n\n');
                  navigator.clipboard.writeText(text);
                }}>
                  <Copy className="w-3 h-3 mr-1" />העתק
                </Button>
              </div>
              <ScrollArea className="h-[500px] p-3" dir="rtl">
                <div className="space-y-3">
                  {segs.map((seg, i) => {
                    const spIdx = entry.result.speakers.indexOf(seg.speaker_label);
                    return (
                      <div key={i} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: BAR_COLORS[spIdx % BAR_COLORS.length] }} />
                          <span className="text-xs font-semibold">{seg.speaker_label}</span>
                          <span className="text-[10px] text-muted-foreground">{formatTime(seg.start)} – {formatTime(seg.end)}</span>
                        </div>
                        <p className="text-sm leading-relaxed pr-5">{seg.text}</p>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════ Main Page Component ═══════════════════════ */

const DiarizationComparePage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<CompareEntry[]>([]);
  const [diffPair, setDiffPair] = useState<[number, number]>([0, 1]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dmp = useMemo(() => new DiffMatchPatch(), []);

  // Load entries from navigation state or localStorage
  useEffect(() => {
    const stateEntries = (location.state as { entries?: CompareEntry[] })?.entries;
    if (stateEntries && stateEntries.length >= 2) {
      setEntries(stateEntries);
      localStorage.setItem('diarization_compare_entries', JSON.stringify(stateEntries));
    } else {
      try {
        const saved = localStorage.getItem('diarization_compare_entries');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length >= 2) setEntries(parsed);
        }
      } catch { /* ignore */ }
    }
  }, [location.state]);

  const comparisons = useMemo(() => {
    if (entries.length < 2) return [];
    const results: Array<{ a: string; b: string; aIdx: number; bIdx: number; agreement: number }> = [];
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        results.push({
          a: entries[i].label,
          b: entries[j].label,
          aIdx: i,
          bIdx: j,
          agreement: computeAgreement(entries[i].result, entries[j].result),
        });
      }
    }
    return results;
  }, [entries]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const exportAsJSON = () => {
    const data = { entries, comparisons, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `diarization-compare-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportAsText = () => {
    let text = `═══ השוואת זיהוי דוברים ═══\n\n`;
    for (const comp of comparisons) {
      text += `${comp.a} ↔ ${comp.b}: ${Math.round(comp.agreement)}% התאמה\n`;
    }
    text += '\n';
    for (const entry of entries) {
      text += `── ${entry.label} (${entry.result.diarization_method}) ──\n`;
      text += `דוברים: ${entry.result.speaker_count} | קטעים: ${entry.result.segments.length} | עיבוד: ${entry.result.processing_time}s\n\n`;
      const merged = getMergedSegments(entry.result);
      for (const seg of merged) {
        text += `[${seg.speaker_label}] (${formatTime(seg.start)}-${formatTime(seg.end)})\n${seg.text}\n\n`;
      }
      text += '\n';
    }
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `diarization-compare-${Date.now()}.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => window.print();

  if (entries.length < 2) {
    return (
      <div className="container max-w-4xl mx-auto py-12 px-4 text-center" dir="rtl">
        <ArrowLeftRight className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-40" />
        <h2 className="text-xl font-bold mb-2">אין נתוני השוואה</h2>
        <p className="text-muted-foreground mb-6">
          כדי להשתמש בעמוד זה, הרץ זיהוי דוברים עם לפחות 2 מנועים שונים ולחץ "פתח השוואה מלאה"
        </p>
        <Button onClick={() => navigate('/diarization')} className="gap-2">
          <Users className="w-4 h-4" />
          לדף זיהוי דוברים
        </Button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`${isFullscreen ? 'bg-background p-4 overflow-auto' : 'container max-w-7xl mx-auto py-6 px-4'}`} dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <GitCompareArrows className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">השוואת זיהוי דוברים</h1>
            <p className="text-xs text-muted-foreground">{entries.length} מנועים · {formatDuration(entries[0]?.result.duration || 0)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip><TooltipTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1" onClick={exportAsJSON}>
                <Download className="w-3.5 h-3.5" />JSON
              </Button>
            </TooltipTrigger><TooltipContent>ייצוא JSON</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1" onClick={exportAsText}>
                <FileText className="w-3.5 h-3.5" />TXT
              </Button>
            </TooltipTrigger><TooltipContent>ייצוא טקסט</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1" onClick={handlePrint}>
                <Printer className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger><TooltipContent>הדפסה</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild>
              <Button variant="outline" size="sm" onClick={toggleFullscreen}>
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </Button>
            </TooltipTrigger><TooltipContent>{isFullscreen ? 'יציאה ממסך מלא' : 'מסך מלא'}</TooltipContent></Tooltip>
          </TooltipProvider>
          <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => navigate('/diarization')}>
            <ArrowRight className="w-3.5 h-3.5" />
            חזרה
          </Button>
        </div>
      </div>

      {/* Pair selector pills */}
      {entries.length > 2 && (
        <div className="flex items-center gap-2 flex-wrap mb-4 print:hidden">
          <span className="text-xs text-muted-foreground font-medium">השוואה פעילה:</span>
          {comparisons.map((c, i) => (
            <Button
              key={i}
              variant={diffPair[0] === c.aIdx && diffPair[1] === c.bIdx ? 'default' : 'outline'}
              size="sm"
              className="text-xs h-7 gap-1"
              onClick={() => setDiffPair([c.aIdx, c.bIdx])}
            >
              {c.a} ↔ {c.b}
              <Badge variant="secondary" className="text-[10px] h-4 px-1 mr-1">{Math.round(c.agreement)}%</Badge>
            </Button>
          ))}
        </div>
      )}

      <Tabs defaultValue="diff" className="w-full">
        <TabsList className="w-full max-w-2xl mb-4 print:hidden">
          <TabsTrigger value="diff" className="flex-1 text-xs gap-1.5">
            <GitCompareArrows className="w-4 h-4" />
            השוואת טקסט
          </TabsTrigger>
          <TabsTrigger value="timeline" className="flex-1 text-xs gap-1.5">
            <Clock className="w-4 h-4" />
            ציר זמן
          </TabsTrigger>
          <TabsTrigger value="stats" className="flex-1 text-xs gap-1.5">
            <BarChart3 className="w-4 h-4" />
            סטטיסטיקות
          </TabsTrigger>
          <TabsTrigger value="transcript" className="flex-1 text-xs gap-1.5">
            <MessageSquare className="w-4 h-4" />
            תמלולים
          </TabsTrigger>
        </TabsList>

        {/* ═══ TAB: Text Diff ═══ */}
        <TabsContent value="diff" className="space-y-4">
          <AgreementMatrix entries={entries} comparisons={comparisons} activePair={diffPair} onSelectPair={setDiffPair} />
          <SideBySideDiff entries={entries} diffPair={diffPair} dmp={dmp} />
        </TabsContent>

        {/* ═══ TAB: Timeline ═══ */}
        <TabsContent value="timeline" className="space-y-4">
          <TimelineComparison entries={entries} diffPair={diffPair} />
          <AgreementMatrix entries={entries} comparisons={comparisons} activePair={diffPair} onSelectPair={setDiffPair} />
        </TabsContent>

        {/* ═══ TAB: Stats ═══ */}
        <TabsContent value="stats" className="space-y-4">
          <EngineStatsCards entries={entries} />
          <AgreementMatrix entries={entries} comparisons={comparisons} activePair={diffPair} onSelectPair={setDiffPair} />
        </TabsContent>

        {/* ═══ TAB: Transcripts ═══ */}
        <TabsContent value="transcript" className="space-y-4">
          <TranscriptComparison entries={entries} diffPair={diffPair} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DiarizationComparePage;
