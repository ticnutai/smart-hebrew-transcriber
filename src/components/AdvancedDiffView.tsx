import { useState, useMemo, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowRightLeft, Copy, ArrowUp, ArrowDown, Layers } from "lucide-react";
import { TextVersion } from "@/components/TextEditHistory";
import DiffMatchPatch from "diff-match-patch";
import { toast } from "@/hooks/use-toast";

interface AdvancedDiffViewProps {
  versions: TextVersion[];
  fontSize?: number;
  fontFamily?: string;
  textColor?: string;
  lineHeight?: number;
  onApplyVersion?: (text: string) => void;
}

type VersionFilter = "all" | "ai" | "manual" | "original" | "cloud" | "local";

const sourceLabels: Record<TextVersion['source'], string> = {
  original: 'מקורי',
  manual: 'עריכה ידנית',
  'ai-improve': 'AI - שיפור',
  'ai-sources': 'AI - מקורות',
  'ai-readable': 'AI - זורם',
  'ai-custom': 'AI - מותאם',
  'ai-fix': 'AI - תיקון',
  'ai-grammar': 'AI - דקדוק',
  'ai-punctuation': 'AI - פיסוק',
  'ai-paragraphs': 'AI - פסקאות',
  'ai-bullets': 'AI - תבליטים',
  'ai-headings': 'AI - כותרות',
  'ai-expand': 'AI - הרחבה',
  'ai-shorten': 'AI - קיצור',
  'ai-summarize': 'AI - סיכום',
  'ai-translate': 'AI - תרגום',
  'ai-speakers': 'AI - דוברים',
  'ai-tone': 'AI - טון',
};

export const AdvancedDiffView = ({
  versions,
  fontSize = 16,
  fontFamily = 'Assistant',
  textColor = 'hsl(var(--foreground))',
  lineHeight = 1.6,
  onApplyVersion,
}: AdvancedDiffViewProps) => {
  const [leftId, setLeftId] = useState(versions[0]?.id || '');
  const [rightId, setRightId] = useState(versions[versions.length - 1]?.id || '');
  const [viewMode, setViewMode] = useState<'side-by-side' | 'unified' | 'stats'>('side-by-side');
  const [versionFilter, setVersionFilter] = useState<VersionFilter>("all");

  const selectableVersions = useMemo(() => {
    const isCloudVersion = (v: TextVersion) => v.id.includes("-") && v.id.length >= 30;
    if (versionFilter === "all") return versions;
    if (versionFilter === "ai") return versions.filter((v) => v.source.startsWith("ai-"));
    if (versionFilter === "manual") return versions.filter((v) => v.source === "manual");
    if (versionFilter === "original") return versions.filter((v) => v.source === "original");
    if (versionFilter === "cloud") return versions.filter((v) => isCloudVersion(v));
    return versions.filter((v) => !isCloudVersion(v));
  }, [versions, versionFilter]);

  useEffect(() => {
    if (!versions.length) {
      setLeftId('');
      setRightId('');
      return;
    }

    if (!leftId || !versions.some((v) => v.id === leftId)) {
      setLeftId(versions[0].id);
    }
    if (!rightId || !versions.some((v) => v.id === rightId)) {
      setRightId(versions[versions.length - 1].id);
    }
  }, [versions, leftId, rightId]);

  useEffect(() => {
    if (!selectableVersions.length) return;
    if (!selectableVersions.some((v) => v.id === leftId)) {
      setLeftId(selectableVersions[0].id);
    }
    if (!selectableVersions.some((v) => v.id === rightId)) {
      setRightId(selectableVersions[selectableVersions.length - 1].id);
    }
  }, [selectableVersions, leftId, rightId]);

  const leftVersion = versions.find(v => v.id === leftId);
  const rightVersion = versions.find(v => v.id === rightId);

  const dmp = useMemo(() => new DiffMatchPatch(), []);

  const diffs = useMemo(() => {
    if (!leftVersion || !rightVersion) return [];
    const d = dmp.diff_main(leftVersion.text, rightVersion.text);
    dmp.diff_cleanupSemantic(d);
    return d;
  }, [leftVersion, rightVersion, dmp]);

  const stats = useMemo(() => {
    let added = 0, removed = 0, unchanged = 0;
    let addedWords = 0, removedWords = 0;
    for (const [op, text] of diffs) {
      const words = text.split(/\s+/).filter(w => w).length;
      if (op === 1) { added += text.length; addedWords += words; }
      else if (op === -1) { removed += text.length; removedWords += words; }
      else { unchanged += text.length; }
    }
    const total = added + removed + unchanged;
    const similarity = total > 0 ? Math.round((unchanged / total) * 100) : 100;
    
    const lWords = leftVersion?.text.split(/\s+/).filter(w => w).length || 0;
    const rWords = rightVersion?.text.split(/\s+/).filter(w => w).length || 0;
    const lChars = leftVersion?.text.length || 0;
    const rChars = rightVersion?.text.length || 0;

    return { added, removed, unchanged, addedWords, removedWords, similarity, lWords, rWords, lChars, rChars };
  }, [diffs, leftVersion, rightVersion]);

  const renderSideBySide = (side: 'left' | 'right') => {
    return diffs.map((diff, i) => {
      const [op, text] = diff;
      if (side === 'left') {
        if (op === -1) return <span key={i} className="bg-destructive/20 text-destructive-foreground line-through decoration-destructive/60">{text}</span>;
        if (op === 0) return <span key={i}>{text}</span>;
        return null;
      } else {
        if (op === 1) return <span key={i} className="bg-green-500/20 font-medium">{text}</span>;
        if (op === 0) return <span key={i}>{text}</span>;
        return null;
      }
    });
  };

  const renderUnified = () => {
    return diffs.map((diff, i) => {
      const [op, text] = diff;
      if (op === -1) return <span key={i} className="bg-destructive/20 line-through decoration-destructive/60">{text}</span>;
      if (op === 1) return <span key={i} className="bg-green-500/20 font-medium underline decoration-green-500/60">{text}</span>;
      return <span key={i}>{text}</span>;
    });
  };

  const copyDiff = () => {
    if (!rightVersion) return;
    navigator.clipboard.writeText(rightVersion.text);
    toast({ title: "הועתק ללוח" });
  };

  const textStyle = { fontFamily, fontSize: `${fontSize}px`, color: textColor, lineHeight };

  const getLabel = (v: TextVersion) => {
    const base = sourceLabels[v.source];
    return v.customPrompt ? `${base} (${v.customPrompt})` : base;
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* Controls */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-primary" />
            <span className="font-semibold">השוואה מתקדמת</span>
          </div>
          
          <div className="flex-1" />
          
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)} className="w-auto">
            <TabsList className="h-8">
              <TabsTrigger value="side-by-side" className="text-xs px-2 h-7">צד-בצד</TabsTrigger>
              <TabsTrigger value="unified" className="text-xs px-2 h-7">מאוחד</TabsTrigger>
              <TabsTrigger value="stats" className="text-xs px-2 h-7">סטטיסטיקות</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <div className="flex items-center gap-2 md:col-span-2">
            <Badge variant="secondary" className="shrink-0 text-xs">סינון</Badge>
            <Select value={versionFilter} onValueChange={(v) => setVersionFilter(v as VersionFilter)}>
              <SelectTrigger className="text-xs h-8 max-w-[220px]" dir="rtl"><SelectValue /></SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value="all" className="text-xs">הכול</SelectItem>
                <SelectItem value="ai" className="text-xs">רק AI</SelectItem>
                <SelectItem value="manual" className="text-xs">רק ידני</SelectItem>
                <SelectItem value="original" className="text-xs">רק מקור</SelectItem>
                <SelectItem value="cloud" className="text-xs">רק ענן</SelectItem>
                <SelectItem value="local" className="text-xs">רק מקומי</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-[11px] text-muted-foreground">{selectableVersions.length} גרסאות זמינות לבחירה</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="shrink-0 text-xs">בסיס</Badge>
            <Select value={leftId} onValueChange={setLeftId}>
              <SelectTrigger className="text-xs h-8" dir="rtl"><SelectValue /></SelectTrigger>
              <SelectContent dir="rtl">
                {selectableVersions.map(v => (
                  <SelectItem key={v.id} value={v.id} className="text-xs">{getLabel(v)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="default" className="shrink-0 text-xs">חדש</Badge>
            <Select value={rightId} onValueChange={setRightId}>
              <SelectTrigger className="text-xs h-8" dir="rtl"><SelectValue /></SelectTrigger>
              <SelectContent dir="rtl">
                {selectableVersions.map(v => (
                  <SelectItem key={v.id} value={v.id} className="text-xs">{getLabel(v)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Quick stats bar */}
        <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t text-xs">
          <span className="text-muted-foreground">דמיון:</span>
          <div className="flex items-center gap-1.5">
            <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
              <div 
                className="h-full rounded-full transition-all"
                style={{ 
                  width: `${stats.similarity}%`,
                  backgroundColor: stats.similarity > 80 ? 'hsl(var(--primary))' : stats.similarity > 50 ? 'hsl(40 90% 50%)' : 'hsl(var(--destructive))'
                }}
              />
            </div>
            <span className="font-bold">{stats.similarity}%</span>
          </div>
          <span className="text-green-600 dark:text-green-400">+{stats.addedWords} מילים</span>
          <span className="text-destructive">-{stats.removedWords} מילים</span>
          {onApplyVersion && rightVersion && (
            <div className="flex-1 flex justify-end gap-2">
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={copyDiff}>
                <Copy className="w-3 h-3 ml-1" />העתק
              </Button>
              <Button size="sm" className="h-7 text-xs" onClick={() => onApplyVersion(rightVersion.text)}>
                החל גרסה חדשה
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Side by side view */}
      {viewMode === 'side-by-side' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="overflow-hidden">
            <div className="px-4 py-2 border-b bg-destructive/5 flex items-center justify-between">
              <span className="text-sm font-medium">גרסת בסיס</span>
              <span className="text-xs text-muted-foreground">{stats.lChars} תווים · {stats.lWords} מילים</span>
            </div>
            <ScrollArea className="h-[500px] p-4">
              <pre className="whitespace-pre-wrap text-right" dir="rtl" style={textStyle}>
                {renderSideBySide('left')}
              </pre>
            </ScrollArea>
          </Card>
          <Card className="overflow-hidden">
            <div className="px-4 py-2 border-b bg-green-500/5 flex items-center justify-between">
              <span className="text-sm font-medium">גרסה חדשה</span>
              <span className="text-xs text-muted-foreground">{stats.rChars} תווים · {stats.rWords} מילים</span>
            </div>
            <ScrollArea className="h-[500px] p-4">
              <pre className="whitespace-pre-wrap text-right" dir="rtl" style={textStyle}>
                {renderSideBySide('right')}
              </pre>
            </ScrollArea>
          </Card>
        </div>
      )}

      {/* Unified view */}
      {viewMode === 'unified' && (
        <Card className="overflow-hidden">
          <div className="px-4 py-2 border-b bg-muted/30 flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">תצוגה מאוחדת</span>
          </div>
          <ScrollArea className="h-[600px] p-4">
            <pre className="whitespace-pre-wrap text-right" dir="rtl" style={textStyle}>
              {renderUnified()}
            </pre>
          </ScrollArea>
          <div className="px-4 py-2 border-t text-xs text-muted-foreground flex gap-4 justify-end">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded bg-destructive/20 border border-destructive/30" /> נמחק
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded bg-green-500/20 border border-green-500/30" /> נוסף
            </span>
          </div>
        </Card>
      )}

      {/* Stats view */}
      {viewMode === 'stats' && (
        <Card className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary" />
            ניתוח שינויים מפורט
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-muted/30 text-center space-y-1">
              <p className="text-3xl font-bold text-primary">{stats.similarity}%</p>
              <p className="text-xs text-muted-foreground">אחוז דמיון</p>
            </div>
            <div className="p-4 rounded-lg bg-green-500/10 text-center space-y-1">
              <p className="text-3xl font-bold text-green-600 dark:text-green-400 flex items-center justify-center gap-1">
                <ArrowUp className="w-5 h-5" />{stats.addedWords}
              </p>
              <p className="text-xs text-muted-foreground">מילים שנוספו</p>
            </div>
            <div className="p-4 rounded-lg bg-destructive/10 text-center space-y-1">
              <p className="text-3xl font-bold text-destructive flex items-center justify-center gap-1">
                <ArrowDown className="w-5 h-5" />{stats.removedWords}
              </p>
              <p className="text-xs text-muted-foreground">מילים שנמחקו</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/30 text-center space-y-1">
              <p className="text-3xl font-bold">{Math.abs(stats.rWords - stats.lWords)}</p>
              <p className="text-xs text-muted-foreground">הפרש מילים נטו</p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <h4 className="text-sm font-medium">פירוט לפי גרסה</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg border space-y-1">
                <p className="text-sm font-medium">{leftVersion ? getLabel(leftVersion) : ''}</p>
                <p className="text-xs text-muted-foreground">{stats.lChars} תווים · {stats.lWords} מילים</p>
              </div>
              <div className="p-3 rounded-lg border space-y-1">
                <p className="text-sm font-medium">{rightVersion ? getLabel(rightVersion) : ''}</p>
                <p className="text-xs text-muted-foreground">{stats.rChars} תווים · {stats.rWords} מילים</p>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

