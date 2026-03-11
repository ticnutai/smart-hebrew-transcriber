import { useState, useEffect, useRef } from 'react';
import { Bug, Copy, Trash2, X, ChevronDown, ChevronUp } from 'lucide-react';
import { debugLog, type LogEntry } from '@/lib/debugLogger';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';

const levelColor: Record<string, string> = {
  info: 'text-blue-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
};

const levelBg: Record<string, string> = {
  info: 'bg-blue-950/40',
  warn: 'bg-yellow-950/40',
  error: 'bg-red-950/40',
};

export const DebugPanel = () => {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<LogEntry[]>(debugLog.getEntries());
  const [errorCount, setErrorCount] = useState(debugLog.getErrorCount());
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return debugLog.subscribe((newEntries) => {
      setEntries(newEntries);
      setErrorCount(newEntries.filter((e) => e.level === 'error').length);
    });
  }, []);

  const handleCopy = async () => {
    const text = debugLog.toText();
    if (!text) {
      toast({ title: 'אין לוגים להעתקה' });
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'הועתק!', description: 'כל הלוגים הועתקו ללוח' });
    } catch {
      toast({ title: 'שגיאה בהעתקה', variant: 'destructive' });
    }
  };

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString('he-IL', { hour12: false } as Intl.DateTimeFormatOptions);

  return (
    <>
      {/* Floating Bug Icon */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-4 left-4 z-[9999] flex items-center justify-center w-12 h-12 rounded-full bg-card border border-border shadow-lg hover:shadow-xl transition-all hover:scale-110"
        title="Debug Panel"
      >
        <Bug className="w-5 h-5 text-muted-foreground" />
        {errorCount > 0 && (
          <Badge
            variant="destructive"
            className="absolute -top-1 -right-1 h-5 min-w-5 flex items-center justify-center text-[10px] px-1"
          >
            {errorCount}
          </Badge>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-20 left-4 z-[9999] w-[420px] max-h-[60vh] bg-card border border-border rounded-lg shadow-2xl flex flex-col overflow-hidden" dir="ltr">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/50">
            <span className="font-semibold text-sm flex items-center gap-2">
              <Bug className="w-4 h-4" />
              Debug Log
              <Badge variant="secondary" className="text-[10px]">{entries.length}</Badge>
            </span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy} title="Copy All">
                <Copy className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => {
                  debugLog.clear();
                  toast({ title: 'לוגים נוקו' });
                }}
                title="Clear"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)} title="Close">
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* Log entries */}
          <ScrollArea className="flex-1 max-h-[50vh]" ref={scrollRef}>
            {entries.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm">No logs yet</div>
            ) : (
              <div className="divide-y divide-border">
                {entries.map((entry) => (
                  <div
                    key={entry.id}
                    className={`px-3 py-1.5 text-xs font-mono cursor-pointer hover:bg-muted/30 ${levelBg[entry.level] ?? ''}`}
                    onClick={() => entry.details && toggleExpand(entry.id)}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground whitespace-nowrap">{formatTime(entry.timestamp)}</span>
                      <span className={`font-bold uppercase w-12 ${levelColor[entry.level] ?? ''}`}>
                        {entry.level}
                      </span>
                      <span className="text-muted-foreground">[{entry.source}]</span>
                      <span className="flex-1 break-words">{entry.message}</span>
                      {entry.details && (
                        expandedIds.has(entry.id) ? (
                          <ChevronUp className="w-3 h-3 mt-0.5 shrink-0" />
                        ) : (
                          <ChevronDown className="w-3 h-3 mt-0.5 shrink-0" />
                        )
                      )}
                    </div>
                    {entry.details && expandedIds.has(entry.id) && (
                      <pre className="mt-1 ml-14 p-2 rounded bg-muted text-[10px] overflow-x-auto whitespace-pre-wrap max-h-40">
                        {entry.details}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </>
  );
};
