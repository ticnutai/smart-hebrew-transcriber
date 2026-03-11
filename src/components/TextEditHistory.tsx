import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { History, Clock, Type } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { he } from "date-fns/locale";

export interface TextVersion {
  id: string;
  text: string;
  timestamp: Date;
  source: 'original' | 'manual' | 'ai-improve' | 'ai-sources' | 'ai-readable' | 'ai-custom' |
    'ai-grammar' | 'ai-punctuation' | 'ai-paragraphs' | 'ai-bullets' | 'ai-headings' |
    'ai-expand' | 'ai-shorten' | 'ai-summarize' | 'ai-translate' | 'ai-speakers' | 'ai-tone';
  customPrompt?: string;
}

interface TextEditHistoryProps {
  versions: TextVersion[];
  onSelectVersion: (version: TextVersion) => void;
  selectedVersionId?: string;
}

const sourceLabels: Record<TextVersion['source'], string> = {
  original: 'מקורי',
  manual: 'עריכה ידנית',
  'ai-improve': 'AI - שיפור ניסוח',
  'ai-sources': 'AI - הוספת מקורות',
  'ai-readable': 'AI - זורם לקריאה',
  'ai-custom': 'AI - פרומפט מותאם',
  'ai-grammar': 'AI - דקדוק ואיות',
  'ai-punctuation': 'AI - פיסוק',
  'ai-paragraphs': 'AI - חלוקה לפסקאות',
  'ai-bullets': 'AI - נקודות מפתח',
  'ai-headings': 'AI - כותרות',
  'ai-expand': 'AI - הרחבה',
  'ai-shorten': 'AI - קיצור',
  'ai-summarize': 'AI - סיכום',
  'ai-translate': 'AI - תרגום',
  'ai-speakers': 'AI - זיהוי דוברים',
  'ai-tone': 'AI - שינוי טון'
};

export const TextEditHistory = ({ versions, onSelectVersion, selectedVersionId }: TextEditHistoryProps) => {
  const getWordCount = (text: string) => text.split(/\s+/).filter(w => w).length;
  const getCharCount = (text: string) => text.length;

  return (
    <Card className="p-6" dir="rtl">
      <div className="flex items-center gap-2 mb-4">
        <History className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-semibold text-right">היסטוריית עריכות</h2>
      </div>

      <ScrollArea className="h-[500px]">
        <div className="space-y-3">
          {versions.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">אין עדיין עריכות</p>
          ) : (
            versions.map((version) => (
              <Card
                key={version.id}
                className={`p-4 cursor-pointer transition-all hover:shadow-md ${
                  selectedVersionId === version.id ? 'ring-2 ring-primary bg-primary/5' : ''
                }`}
                onClick={() => onSelectVersion(version)}
              >
                <div className="space-y-2">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">
                          {sourceLabels[version.source]}
                        </span>
                        {version.customPrompt && (
                          <span className="text-xs text-muted-foreground">
                            ({version.customPrompt})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        <span>
                          {formatDistanceToNow(version.timestamp, { 
                            addSuffix: true, 
                            locale: he 
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-4 text-xs text-muted-foreground border-t pt-2">
                    <div className="flex items-center gap-1">
                      <Type className="w-3 h-3" />
                      <span>{getCharCount(version.text)} תווים</span>
                    </div>
                    <div>
                      <span>{getWordCount(version.text)} מילים</span>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground line-clamp-2 bg-muted/30 p-2 rounded">
                    {version.text.substring(0, 100)}...
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>
    </Card>
  );
};
