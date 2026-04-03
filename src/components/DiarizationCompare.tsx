import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BarChart3, Clock, Users, MessageSquare, ArrowLeftRight, FileText, Copy } from "lucide-react";

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

interface DiarizationCompareProps {
  entries: CompareEntry[];
}

const BAR_COLORS = [
  "#3b82f6", "#22c55e", "#a855f7", "#f97316", "#ec4899",
  "#06b6d4", "#eab308", "#ef4444", "#6366f1", "#14b8a6",
];

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

/** Compute speaker time distribution */
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

/** Compute agreement: what % of time the two results assign the same "dominant speaker" */
function computeAgreement(a: DiarizationResult, b: DiarizationResult): number {
  if (a.duration === 0) return 0;
  const step = 0.5; // check every 0.5 seconds
  const totalSteps = Math.floor(a.duration / step);
  if (totalSteps === 0) return 0;

  // Build speaker-at-time lookup
  const getSpeakerAt = (result: DiarizationResult, time: number): number => {
    for (const seg of result.segments) {
      if (time >= seg.start && time < seg.end) {
        return result.speakers.indexOf(seg.speaker_label);
      }
    }
    return -1;
  };

  // Map speakers between results by overlap
  const speakerMapCache = new Map<number, number>();
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

  // Greedy mapping: match speakers with most overlap
  const usedB = new Set<number>();
  for (let i = 0; i < a.speakers.length; i++) {
    let bestJ = -1, bestOverlap = 0;
    for (let j = 0; j < b.speakers.length; j++) {
      if (!usedB.has(j) && overlapMatrix[i][j] > bestOverlap) {
        bestOverlap = overlapMatrix[i][j];
        bestJ = j;
      }
    }
    if (bestJ >= 0) {
      speakerMapCache.set(i, bestJ);
      usedB.add(bestJ);
    }
  }

  // Count agreement
  let agree = 0;
  for (let t = 0; t < totalSteps; t++) {
    const time = t * step;
    const spA = getSpeakerAt(a, time);
    const spB = getSpeakerAt(b, time);
    if (spA >= 0 && spB >= 0 && speakerMapCache.get(spA) === spB) {
      agree++;
    }
  }

  return (agree / totalSteps) * 100;
}

export const DiarizationCompare = ({ entries }: DiarizationCompareProps) => {
  const [showTranscript, setShowTranscript] = useState<number | null>(null);
  const [showSideBySide, setShowSideBySide] = useState(false);

  const comparisons = useMemo(() => {
    if (entries.length < 2) return [];
    const results: Array<{ a: string; b: string; agreement: number }> = [];
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        results.push({
          a: entries[i].label,
          b: entries[j].label,
          agreement: computeAgreement(entries[i].result, entries[j].result),
        });
      }
    }
    return results;
  }, [entries]);

  if (entries.length < 2) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <ArrowLeftRight className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm font-medium mb-1">הרץ זיהוי דוברים עם לפחות 2 מנועים שונים</p>
        <p className="text-xs">לחץ "הוסף להשוואה" אחרי כל הרצה כדי לשמור את התוצאה</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Agreement scores */}
      {comparisons.length > 0 && (
        <Card className="p-3 bg-muted/20">
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4" />
            אחוז התאמה בין מנועים
          </h4>
          <div className="space-y-2">
            {comparisons.map((c, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xs min-w-[140px]">{c.a} ↔ {c.b}</span>
                <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${c.agreement}%`,
                      backgroundColor: c.agreement > 70 ? '#22c55e' : c.agreement > 40 ? '#eab308' : '#ef4444',
                    }}
                  />
                </div>
                <span className="text-sm font-bold min-w-[40px] text-left">
                  {Math.round(c.agreement)}%
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Side-by-side comparison */}
      <div className={`grid gap-3 ${entries.length === 2 ? 'grid-cols-2' : entries.length >= 3 ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'}`}>
        {entries.map((entry, idx) => {
          const dist = getSpeakerDistribution(entry.result);
          return (
            <Card key={idx} className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{entry.label}</Badge>
                  <span className="text-xs text-muted-foreground">{entry.result.diarization_method}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {entry.result.speaker_count} דוברים
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" />
                    {entry.result.segments.length} קטעים
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {entry.result.processing_time} שנ׳
                  </span>
                </div>
              </div>

              {/* Speaker distribution bar */}
              <div className="flex h-4 rounded-full overflow-hidden mb-2">
                {dist.map((d, i) => (
                  <div
                    key={d.label}
                    className="h-full transition-all"
                    style={{
                      width: `${d.pct}%`,
                      backgroundColor: BAR_COLORS[i % BAR_COLORS.length],
                    }}
                    title={`${d.label}: ${Math.round(d.pct)}%`}
                  />
                ))}
              </div>

              {/* Speaker legend */}
              <div className="flex flex-wrap gap-2">
                {dist.map((d, i) => (
                  <span key={d.label} className="flex items-center gap-1 text-xs">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }}
                    />
                    {d.label} ({Math.round(d.pct)}% · {formatDuration(d.time)})
                  </span>
                ))}
              </div>

              {/* Timeline preview */}
              <div className="mt-2 relative h-6 bg-muted/50 rounded overflow-hidden">
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
                      title={`${seg.speaker_label} ${formatTime(seg.start)}-${formatTime(seg.end)}`}
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

      {/* ──── Action buttons ──── */}
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => setShowSideBySide(!showSideBySide)}>
          <FileText className="w-3.5 h-3.5" />
          {showSideBySide ? 'הסתר השוואת טקסט' : 'השוואת טקסט side-by-side'}
        </Button>
        {entries.map((entry, idx) => (
          <Button key={idx} variant={showTranscript === idx ? 'default' : 'outline'} size="sm" className="text-xs gap-1"
            onClick={() => setShowTranscript(showTranscript === idx ? null : idx)}>
            <MessageSquare className="w-3.5 h-3.5" />
            תמלול נקי — {entry.label}
          </Button>
        ))}
      </div>

      {/* ──── Clean Transcript View ──── */}
      {showTranscript !== null && entries[showTranscript] && (() => {
        const entry = entries[showTranscript];
        // Merge consecutive segments from same speaker
        const merged: DiarizedSegment[] = [];
        for (const seg of entry.result.segments) {
          const prev = merged[merged.length - 1];
          if (prev && prev.speaker_label === seg.speaker_label) {
            prev.text = prev.text + ' ' + seg.text;
            prev.end = seg.end;
          } else {
            merged.push({ ...seg });
          }
        }
        return (
          <Card className="p-4 space-y-3 max-h-[500px] overflow-y-auto" dir="rtl">
            <div className="flex items-center justify-between sticky top-0 bg-card pb-2 z-10">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                תמלול נקי — {entry.label}
              </h4>
              <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => {
                const text = merged.map(s => `[${s.speaker_label}] (${formatTime(s.start)}-${formatTime(s.end)})\n${s.text}`).join('\n\n');
                navigator.clipboard.writeText(text);
              }}>
                <Copy className="w-3.5 h-3.5" />העתק
              </Button>
            </div>
            {merged.map((seg, i) => {
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
          </Card>
        );
      })()}

      {/* ──── Side-by-Side Text Comparison ──── */}
      {showSideBySide && entries.length >= 2 && (
        <div className={`grid gap-3 ${entries.length === 2 ? 'grid-cols-2' : 'grid-cols-1 md:grid-cols-2'}`}>
          {entries.map((entry, idx) => {
            const merged: DiarizedSegment[] = [];
            for (const seg of entry.result.segments) {
              const prev = merged[merged.length - 1];
              if (prev && prev.speaker_label === seg.speaker_label) {
                prev.text = prev.text + ' ' + seg.text;
                prev.end = seg.end;
              } else {
                merged.push({ ...seg });
              }
            }
            return (
              <Card key={idx} className="p-3 max-h-[400px] overflow-y-auto" dir="rtl">
                <div className="sticky top-0 bg-card pb-2 z-10">
                  <Badge variant="outline" className="text-xs mb-2">{entry.label}</Badge>
                </div>
                <div className="space-y-2">
                  {merged.map((seg, i) => {
                    const spIdx = entry.result.speakers.indexOf(seg.speaker_label);
                    return (
                      <div key={i} className="text-xs">
                        <span className="inline-flex items-center gap-1 font-semibold mb-0.5">
                          <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: BAR_COLORS[spIdx % BAR_COLORS.length] }} />
                          {seg.speaker_label}
                          <span className="font-normal text-muted-foreground">({formatTime(seg.start)})</span>
                        </span>
                        <p className="leading-relaxed">{seg.text}</p>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
