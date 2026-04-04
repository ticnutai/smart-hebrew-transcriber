import { useState, useMemo, useRef, useCallback, useEffect, lazy, Suspense } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeftRight, BarChart3, Clock, Copy, Download, FileText,
  GitCompareArrows, MessageSquare, Users, ArrowRight,
  Maximize2, Minimize2, Eye, EyeOff, Filter, Printer, ChevronDown,
  Play, Volume2, Search, Square, Check, Merge, Subtitles, Pause,
  Loader2, Cloud, Globe, Mic, Server, Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { diarizeInBrowser } from "@/utils/browserDiarization";
import { useCloudApiKeys } from "@/hooks/useCloudApiKeys";
import DiffMatchPatch from "diff-match-patch";
import type { SyncAudioPlayerRef } from "@/components/SyncAudioPlayer";
import { db } from "@/lib/localDb";
import { toast } from "@/hooks/use-toast";

const SyncAudioPlayer = lazy(() => import("@/components/SyncAudioPlayer").then(m => ({ default: m.SyncAudioPlayer })));

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

/* ═══════════════════════ Speaker Mapping ═══════════════════════ */

/** Build a map: speakerLabelA → speakerLabelB based on time overlap */
function buildSpeakerMap(a: DiarizationResult, b: DiarizationResult): Map<string, string> {
  const step = 0.5;
  const duration = Math.max(a.duration, b.duration);
  const totalSteps = Math.floor(duration / step);
  if (totalSteps === 0) return new Map();

  const overlapMatrix: Record<string, Record<string, number>> = {};
  for (const sp of a.speakers) {
    overlapMatrix[sp] = {};
    for (const sp2 of b.speakers) overlapMatrix[sp][sp2] = 0;
  }

  for (let t = 0; t < totalSteps; t++) {
    const time = t * step;
    const segA = a.segments.find(s => time >= s.start && time < s.end);
    const segB = b.segments.find(s => time >= s.start && time < s.end);
    if (segA && segB) {
      overlapMatrix[segA.speaker_label] = overlapMatrix[segA.speaker_label] || {};
      overlapMatrix[segA.speaker_label][segB.speaker_label] = (overlapMatrix[segA.speaker_label][segB.speaker_label] || 0) + 1;
    }
  }

  const map = new Map<string, string>();
  const usedB = new Set<string>();
  for (const spA of a.speakers) {
    let bestB = '', bestCount = 0;
    for (const spB of b.speakers) {
      if (!usedB.has(spB) && (overlapMatrix[spA]?.[spB] || 0) > bestCount) {
        bestCount = overlapMatrix[spA]?.[spB] || 0;
        bestB = spB;
      }
    }
    if (bestB) { map.set(spA, bestB); usedB.add(bestB); }
  }
  return map;
}

/** Find the matching segment by time overlap */
function findMatchingSegment(seg: DiarizedSegment, otherSegs: DiarizedSegment[]): DiarizedSegment | null {
  const mid = (seg.start + seg.end) / 2;
  return otherSegs.find(s => mid >= s.start && mid < s.end) || null;
}

/* ═══════════════════════ SRT/VTT Export ═══════════════════════ */

function formatSrtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec % 1) * 1000);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

function formatVttTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec % 1) * 1000);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

function exportSRT(entry: CompareEntry) {
  const segs = getMergedSegments(entry.result);
  const lines = segs.map((seg, i) =>
    `${i + 1}\n${formatSrtTime(seg.start)} --> ${formatSrtTime(seg.end)}\n[${seg.speaker_label}] ${seg.text}\n`
  );
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${entry.label}-diarization.srt`; a.click();
  URL.revokeObjectURL(url);
}

function exportVTT(entry: CompareEntry) {
  const segs = getMergedSegments(entry.result);
  const lines = [`WEBVTT\n`];
  segs.forEach((seg, i) => {
    lines.push(`${i + 1}\n${formatVttTime(seg.start)} --> ${formatVttTime(seg.end)}\n<v ${seg.speaker_label}>${seg.text}\n`);
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/vtt;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${entry.label}-diarization.vtt`; a.click();
  URL.revokeObjectURL(url);
}

/* ═══════════════════════ Search highlight helper ═══════════════════════ */

function highlightSearchTerm(text: string, query: string): React.ReactNode {
  if (!query || query.length < 2) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? <mark key={i} className="bg-yellow-300 dark:bg-yellow-700 px-0.5 rounded">{part}</mark> : part
  );
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

/* ═══════════════════════ Split Column: Full Engine Result ═══════════════════════ */

interface EngineColumnProps {
  entry: CompareEntry;
  idx: number;
  currentTime: number;
  onSeek: (time: number) => void;
  searchQuery: string;
  highlightedSegIdx: number | null;
  onHighlightSeg: (idx: number | null) => void;
  otherEntry: CompareEntry | null;
  speakerMap: Map<string, string>;
  onPlaySegment: (start: number, end: number) => void;
  mergeSelections: Map<number, 'left' | 'right'>;
  onToggleMerge: (segIdx: number, side: 'left' | 'right') => void;
  side: 'left' | 'right';
  showMerge: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  dmp: DiffMatchPatch;
}

function EngineColumn({
  entry, idx, currentTime, onSeek, searchQuery, highlightedSegIdx,
  onHighlightSeg, otherEntry, speakerMap, onPlaySegment,
  mergeSelections, onToggleMerge, side, showMerge, scrollRef, onScroll, dmp,
}: EngineColumnProps) {
  const color = ENGINE_COLORS[entry.label] || '#888';
  const merged = useMemo(() => getMergedSegments(entry.result), [entry.result]);
  const otherMerged = useMemo(() => otherEntry ? getMergedSegments(otherEntry.result) : [], [otherEntry]);
  const dist = getSpeakerDistribution(entry.result);
  const totalWords = entry.result.segments.reduce((a, s) => a + s.text.split(/\s+/).filter(Boolean).length, 0);

  // Find current segment for highlight
  const activeIdx = merged.findIndex(s => currentTime >= s.start && currentTime < s.end);

  // Word-level diff per segment (Enhancement 3)
  const segmentDiffs = useMemo(() => {
    if (!otherEntry) return [];
    return merged.map(seg => {
      const match = findMatchingSegment(seg, otherMerged);
      if (!match) return null;
      const diffs = dmp.diff_main(seg.text, match.text);
      dmp.diff_cleanupSemantic(diffs);
      return diffs;
    });
  }, [merged, otherMerged, dmp, otherEntry]);

  return (
    <div className="flex flex-col min-h-0">
      {/* Engine header */}
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3" style={{ borderTopColor: color, borderTopWidth: '3px' }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="font-bold text-base">{entry.label}</span>
            <Badge variant="outline" className="text-[10px]">{entry.result.diarization_method}</Badge>
          </div>
          <div className="flex items-center gap-1">
            {/* SRT/VTT export (Enhancement 7) */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => exportSRT(entry)}>
                    <Subtitles className="w-3 h-3" />
                    SRT
                  </Button>
                </TooltipTrigger>
                <TooltipContent>ייצוא SRT</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => exportVTT(entry)}>
                    <Subtitles className="w-3 h-3" />
                    VTT
                  </Button>
                </TooltipTrigger>
                <TooltipContent>ייצוא VTT</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => {
                    const text = merged.map(s => `[${s.speaker_label}] (${formatTime(s.start)}-${formatTime(s.end)})\n${s.text}`).join('\n\n');
                    navigator.clipboard.writeText(text);
                  }}>
                    <Copy className="w-3 h-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>העתק תמלול</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Quick stats + speaker mapping (Enhancement 4) */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{entry.result.speaker_count} דוברים</span>
          <span>·</span>
          <span>{entry.result.segments.length} קטעים</span>
          <span>·</span>
          <span>{totalWords} מילים</span>
          <span>·</span>
          <span>{entry.result.processing_time.toFixed(1)}s עיבוד</span>
        </div>
        {speakerMap.size > 0 && (
          <div className="flex flex-wrap gap-x-3 mt-1 text-[10px] text-muted-foreground/70">
            {[...speakerMap.entries()].map(([a, b]) => (
              <span key={a}>
                {side === 'left' ? `${a} ↔ ${b}` : `${b} ↔ ${a}`}
              </span>
            ))}
          </div>
        )}

        {/* Speaker distribution bar */}
        <div className="flex h-3 rounded-full overflow-hidden mt-2">
          {dist.map((d, i) => (
            <div
              key={d.label}
              className="h-full"
              style={{ width: `${d.pct}%`, backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }}
              title={`${d.label}: ${Math.round(d.pct)}%`}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
          {dist.map((d, i) => (
            <span key={d.label} className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }} />
              {d.label} ({Math.round(d.pct)}%)
            </span>
          ))}
        </div>

        {/* Mini timeline */}
        <div className="mt-2 relative h-5 bg-muted/30 rounded overflow-hidden cursor-pointer"
          onClick={e => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            onSeek(pct * entry.result.duration);
          }}
        >
          {entry.result.segments.map((seg, si) => {
            const left = (seg.start / entry.result.duration) * 100;
            const width = ((seg.end - seg.start) / entry.result.duration) * 100;
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
              />
            );
          })}
          {/* Playhead */}
          {entry.result.duration > 0 && (
            <div
              className="absolute top-0 h-full w-0.5 bg-foreground/80 z-10"
              style={{ left: `${(currentTime / entry.result.duration) * 100}%` }}
            />
          )}
        </div>
      </div>

      {/* Transcript segments — flowing continuously */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3" onScroll={onScroll}>
        {merged.map((seg, i) => {
          const spIdx = entry.result.speakers.indexOf(seg.speaker_label);
          const isActive = i === activeIdx;
          const isCrossHighlighted = highlightedSegIdx !== null && highlightedSegIdx === i;
          const isSelected = mergeSelections.get(i) === side;
          const diffResult = segmentDiffs[i];

          // Render text with search highlight or word-level diff (Enhancement 3 & 5)
          let renderedText: React.ReactNode = seg.text;
          if (searchQuery && searchQuery.length >= 2) {
            renderedText = highlightSearchTerm(seg.text, searchQuery);
          } else if (diffResult) {
            renderedText = diffResult.map(([op, text], di) => {
              if (op === 0) return <span key={di}>{text}</span>;
              if (op === -1) return <span key={di} className="bg-red-200 dark:bg-red-900/50 line-through text-red-700 dark:text-red-300">{text}</span>;
              return null; // op === 1: text from the other side, skip
            });
          }

          return (
            <div
              key={i}
              data-seg-idx={i}
              className={`space-y-1 p-2 rounded-lg cursor-pointer transition-colors group relative
                ${isActive ? 'bg-primary/10 ring-1 ring-primary/30' : ''}
                ${isCrossHighlighted ? 'bg-yellow-100 dark:bg-yellow-900/30 ring-1 ring-yellow-400/50' : ''}
                ${!isActive && !isCrossHighlighted ? 'hover:bg-muted/50' : ''}
                ${isSelected ? 'ring-2 ring-green-500' : ''}
              `}
              onClick={() => onSeek(seg.start)}
              onMouseEnter={() => onHighlightSeg(i)}
              onMouseLeave={() => onHighlightSeg(null)}
            >
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: BAR_COLORS[spIdx % BAR_COLORS.length] }} />
                <span className="text-xs font-semibold">{seg.speaker_label}</span>
                <span className="text-[10px] text-muted-foreground">{formatTime(seg.start)} – {formatTime(seg.end)}</span>
                {/* Play segment button (Enhancement 6) */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={e => { e.stopPropagation(); onPlaySegment(seg.start, seg.end); }}
                >
                  <Play className="w-3 h-3" />
                </Button>
                {/* Merge select button (Enhancement 8) */}
                {showMerge && (
                  <Button
                    variant={isSelected ? 'default' : 'outline'}
                    size="sm"
                    className="h-5 px-1.5 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity mr-auto"
                    onClick={e => { e.stopPropagation(); onToggleMerge(i, side); }}
                  >
                    <Check className="w-3 h-3" />
                  </Button>
                )}
              </div>
              <p className="text-sm leading-relaxed pr-5">{renderedText}</p>
            </div>
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
  const [currentTime, setCurrentTime] = useState(0);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<SyncAudioPlayerRef>(null);
  const dmp = useMemo(() => new DiffMatchPatch(), []);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioFileName, setAudioFileName] = useState<string>('');
  const [selectedEngine, setSelectedEngine] = useState<string>('assemblyai');
  const [isRunningEngine, setIsRunningEngine] = useState(false);
  const { keys: cloudKeys } = useCloudApiKeys();

  // New enhancement state
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedSegIdx, setHighlightedSegIdx] = useState<number | null>(null);
  const [mergeSelections, setMergeSelections] = useState<Map<number, 'left' | 'right'>>(new Map());
  const [showMerge, setShowMerge] = useState(false);
  const [syncScrollEnabled, setSyncScrollEnabled] = useState(true);
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const isScrolling = useRef(false);
  const segmentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Enhancement 4: Speaker mapping
  const speakerMap = useMemo(() => {
    if (entries.length < 2) return new Map<string, string>();
    return buildSpeakerMap(entries[diffPair[0]]?.result, entries[diffPair[1]]?.result);
  }, [entries, diffPair]);

  // Load entries from navigation state or localStorage
  useEffect(() => {
    const state = location.state as { entries?: CompareEntry[]; audioUrl?: string; audioFileName?: string } | null;
    const stateEntries = state?.entries;
    if (stateEntries && stateEntries.length >= 1) {
      setEntries(stateEntries);
      if (stateEntries.length >= 2) {
        localStorage.setItem('diarization_compare_entries', JSON.stringify(stateEntries));
      }
    } else {
      try {
        const saved = localStorage.getItem('diarization_compare_entries');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length >= 2) setEntries(parsed);
        }
      } catch { /* ignore */ }
    }
    if (state?.audioUrl) {
      setAudioUrl(state.audioUrl);
      localStorage.setItem('diarization_compare_audioUrl', state.audioUrl);
    } else {
      const savedUrl = localStorage.getItem('diarization_compare_audioUrl');
      if (savedUrl) setAudioUrl(savedUrl);
    }
    if (state?.audioFileName) {
      setAudioFileName(state.audioFileName);
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

  const handleSeek = useCallback((time: number) => {
    setCurrentTime(time);
    playerRef.current?.seekTo(time);
    playerRef.current?.play();
  }, []);

  // Enhancement 6: Play individual segment
  const handlePlaySegment = useCallback((start: number, end: number) => {
    setCurrentTime(start);
    playerRef.current?.seekTo(start);
    playerRef.current?.play();
    // Stop at end of segment
    if (segmentTimerRef.current) clearTimeout(segmentTimerRef.current);
    const dur = (end - start) * 1000;
    segmentTimerRef.current = setTimeout(() => {
      playerRef.current?.pause();
    }, dur);
  }, []);

  // Enhancement 1: Synchronized scrolling
  const handleLeftScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (!syncScrollEnabled || isScrolling.current) return;
    isScrolling.current = true;
    const target = e.currentTarget;
    if (rightScrollRef.current) {
      const pct = target.scrollTop / (target.scrollHeight - target.clientHeight || 1);
      rightScrollRef.current.scrollTop = pct * (rightScrollRef.current.scrollHeight - rightScrollRef.current.clientHeight);
    }
    requestAnimationFrame(() => { isScrolling.current = false; });
  }, [syncScrollEnabled]);

  const handleRightScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (!syncScrollEnabled || isScrolling.current) return;
    isScrolling.current = true;
    const target = e.currentTarget;
    if (leftScrollRef.current) {
      const pct = target.scrollTop / (target.scrollHeight - target.clientHeight || 1);
      leftScrollRef.current.scrollTop = pct * (leftScrollRef.current.scrollHeight - leftScrollRef.current.clientHeight);
    }
    requestAnimationFrame(() => { isScrolling.current = false; });
  }, [syncScrollEnabled]);

  // Enhancement 8: Toggle merge selection
  const handleToggleMerge = useCallback((segIdx: number, side: 'left' | 'right') => {
    setMergeSelections(prev => {
      const next = new Map(prev);
      if (next.get(segIdx) === side) next.delete(segIdx);
      else next.set(segIdx, side);
      return next;
    });
  }, []);

  // Enhancement 8: Build merged transcript
  const mergedTranscript = useMemo(() => {
    if (!showMerge || entries.length < 2) return '';
    const leftMerged = getMergedSegments(entries[diffPair[0]].result);
    const rightMerged = getMergedSegments(entries[diffPair[1]].result);
    const maxLen = Math.max(leftMerged.length, rightMerged.length);
    const lines: string[] = [];
    for (let i = 0; i < maxLen; i++) {
      const sel = mergeSelections.get(i);
      const seg = sel === 'right' ? rightMerged[i] : leftMerged[i]; // default to left
      if (seg) lines.push(`[${seg.speaker_label}] (${formatTime(seg.start)}-${formatTime(seg.end)})\n${seg.text}`);
    }
    return lines.join('\n\n');
  }, [showMerge, entries, diffPair, mergeSelections]);

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

  const pairAgreement = comparisons.find(c =>
    (c.aIdx === diffPair[0] && c.bIdx === diffPair[1]) || (c.aIdx === diffPair[1] && c.bIdx === diffPair[0])
  );

  return (
    <div ref={containerRef} className={`flex flex-col ${isFullscreen ? 'h-screen bg-background' : 'h-[calc(100vh-64px)]'}`} dir="rtl">
      {/* ═══ Top Bar ═══ */}
      <div className="shrink-0 border-b px-4 py-2 flex items-center justify-between flex-wrap gap-2 print:hidden bg-background">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <GitCompareArrows className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold leading-tight">השוואת זיהוי דוברים</h1>
            <p className="text-[10px] text-muted-foreground">{entries.length} מנועים · {formatDuration(entries[0]?.result.duration || 0)}</p>
          </div>
          {pairAgreement && (
            <Badge variant="secondary" className="text-sm font-bold mr-2">
              התאמה: {Math.round(pairAgreement.agreement)}%
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {/* Enhancement 5: Search bar */}
          <div className="relative">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="חיפוש..."
              className="h-7 w-36 text-xs pr-7"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <Separator orientation="vertical" className="h-5 mx-1" />

          {/* Enhancement 1: Sync scroll toggle */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={syncScrollEnabled ? 'default' : 'outline'}
                  size="sm"
                  className="text-xs h-7 gap-1"
                  onClick={() => setSyncScrollEnabled(!syncScrollEnabled)}
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{syncScrollEnabled ? 'גלילה מסונכרנת: פעיל' : 'גלילה מסונכרנת: כבוי'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Enhancement 8: Merge toggle */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showMerge ? 'default' : 'outline'}
                  size="sm"
                  className="text-xs h-7 gap-1"
                  onClick={() => setShowMerge(!showMerge)}
                >
                  <Merge className="w-3.5 h-3.5" />
                  מיזוג
                </Button>
              </TooltipTrigger>
              <TooltipContent>בחר את הקטעים הטובים מכל מנוע</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Pair selector for >2 engines */}
          {entries.length > 2 && comparisons.map((c, i) => (
            <Button
              key={i}
              variant={diffPair[0] === c.aIdx && diffPair[1] === c.bIdx ? 'default' : 'outline'}
              size="sm"
              className="text-xs h-7 gap-1"
              onClick={() => setDiffPair([c.aIdx, c.bIdx])}
            >
              {c.a} ↔ {c.b}
            </Button>
          ))}
          <Separator orientation="vertical" className="h-5 mx-1" />
          <Button variant={showAnalysis ? 'default' : 'outline'} size="sm" className="text-xs h-7 gap-1" onClick={() => setShowAnalysis(!showAnalysis)}>
            <BarChart3 className="w-3.5 h-3.5" />
            ניתוח
          </Button>
          <TooltipProvider>
            <Tooltip><TooltipTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={exportAsJSON}>
                <Download className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger><TooltipContent>ייצוא JSON</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={exportAsText}>
                <FileText className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger><TooltipContent>ייצוא טקסט</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={handlePrint}>
                <Printer className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger><TooltipContent>הדפסה</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={toggleFullscreen}>
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </Button>
            </TooltipTrigger><TooltipContent>{isFullscreen ? 'יציאה ממסך מלא' : 'מסך מלא'}</TooltipContent></Tooltip>
          </TooltipProvider>
          <Button variant="ghost" size="sm" className="gap-1 text-xs h-7" onClick={() => navigate('/diarization')}>
            <ArrowRight className="w-3.5 h-3.5" />
            חזרה
          </Button>
        </div>
      </div>

      {/* ═══ Shared Audio Player ═══ */}
      {audioUrl && (
        <div className="shrink-0 border-b px-4 py-2 bg-muted/20">
          <Suspense fallback={<div className="h-16 rounded-lg animate-pulse bg-muted/30" />}>
            <SyncAudioPlayer
              ref={playerRef}
              audioUrl={audioUrl}
              wordTimings={[]}
              onTimeUpdate={setCurrentTime}
              compact
              speakerSegments={entries[diffPair[0]]?.result.segments.map(s => ({
                start: s.start,
                end: s.end,
                speaker: s.speaker_label,
              })) || []}
            />
          </Suspense>
        </div>
      )}

      {/* ═══ Split-Screen: Two Engine Columns ═══ */}
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 border-l overflow-hidden">
          <EngineColumn
            entry={entries[diffPair[0]]}
            idx={diffPair[0]}
            currentTime={currentTime}
            onSeek={handleSeek}
            searchQuery={searchQuery}
            highlightedSegIdx={highlightedSegIdx}
            onHighlightSeg={setHighlightedSegIdx}
            otherEntry={entries[diffPair[1]]}
            speakerMap={speakerMap}
            onPlaySegment={handlePlaySegment}
            mergeSelections={mergeSelections}
            onToggleMerge={handleToggleMerge}
            side="left"
            showMerge={showMerge}
            scrollRef={leftScrollRef}
            onScroll={handleLeftScroll}
            dmp={dmp}
          />
        </div>
        <div className="flex-1 min-w-0 overflow-hidden">
          <EngineColumn
            entry={entries[diffPair[1]]}
            idx={diffPair[1]}
            currentTime={currentTime}
            onSeek={handleSeek}
            searchQuery={searchQuery}
            highlightedSegIdx={highlightedSegIdx}
            onHighlightSeg={setHighlightedSegIdx}
            otherEntry={entries[diffPair[0]]}
            speakerMap={speakerMap}
            onPlaySegment={handlePlaySegment}
            mergeSelections={mergeSelections}
            onToggleMerge={handleToggleMerge}
            side="right"
            showMerge={showMerge}
            scrollRef={rightScrollRef}
            onScroll={handleRightScroll}
            dmp={dmp}
          />
        </div>
      </div>

      {/* ═══ Merge Panel (Enhancement 8) ═══ */}
      {showMerge && mergeSelections.size > 0 && (
        <div className="shrink-0 border-t bg-green-50 dark:bg-green-950/20 max-h-[30vh] overflow-y-auto">
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Merge className="w-4 h-4 text-green-600" />
                <span className="font-bold text-sm">תמלול ממוזג</span>
                <Badge variant="outline" className="text-[10px]">{mergeSelections.size} קטעים נבחרו</Badge>
              </div>
              <Button size="sm" className="h-7 text-xs gap-1" onClick={() => navigator.clipboard.writeText(mergedTranscript)}>
                <Copy className="w-3 h-3" />
                העתק
              </Button>
            </div>
            <pre className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90 max-h-40 overflow-y-auto">{mergedTranscript}</pre>
          </div>
        </div>
      )}

      {/* ═══ Analysis Panel (collapsible) ═══ */}
      {showAnalysis && (
        <div className="shrink-0 border-t bg-background max-h-[50vh] overflow-y-auto">
          <div className="p-4 space-y-4">
            <Tabs defaultValue="diff" className="w-full">
              <TabsList className="w-full max-w-2xl mb-3">
                <TabsTrigger value="diff" className="flex-1 text-xs gap-1.5">
                  <GitCompareArrows className="w-3.5 h-3.5" />
                  השוואת טקסט
                </TabsTrigger>
                <TabsTrigger value="timeline" className="flex-1 text-xs gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  ציר זמן
                </TabsTrigger>
                <TabsTrigger value="stats" className="flex-1 text-xs gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5" />
                  סטטיסטיקות
                </TabsTrigger>
              </TabsList>

              <TabsContent value="diff" className="space-y-4">
                <AgreementMatrix entries={entries} comparisons={comparisons} activePair={diffPair} onSelectPair={setDiffPair} />
                <SideBySideDiff entries={entries} diffPair={diffPair} dmp={dmp} />
              </TabsContent>

              <TabsContent value="timeline" className="space-y-4">
                <TimelineComparison entries={entries} diffPair={diffPair} />
                <AgreementMatrix entries={entries} comparisons={comparisons} activePair={diffPair} onSelectPair={setDiffPair} />
              </TabsContent>

              <TabsContent value="stats" className="space-y-4">
                <EngineStatsCards entries={entries} />
                <AgreementMatrix entries={entries} comparisons={comparisons} activePair={diffPair} onSelectPair={setDiffPair} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}
    </div>
  );
};

export default DiarizationComparePage;
