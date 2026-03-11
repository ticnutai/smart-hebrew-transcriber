import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { History, Trash2, FileText, Search, Tag, X, Edit, Cloud, HardDrive, Loader2, Calendar, Filter } from "lucide-react";
import type { CloudTranscript } from "@/hooks/useCloudTranscripts";

interface CloudTranscriptHistoryProps {
  transcripts: CloudTranscript[];
  isCloud: boolean;
  isLoading: boolean;
  onSelect: (text: string) => void;
  onClearAll: () => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Pick<CloudTranscript, 'tags' | 'notes' | 'title'>>) => void;
}

export const CloudTranscriptHistory = ({
  transcripts,
  isCloud,
  isLoading,
  onSelect,
  onClearAll,
  onDelete,
  onUpdate,
}: CloudTranscriptHistoryProps) => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [newTag, setNewTag] = useState("");
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [engineFilter, setEngineFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  // Get unique engines for filter
  const engines = useMemo(() => 
    [...new Set(transcripts.map(t => t.engine))],
    [transcripts]
  );

  // Filter by date range
  const getDateThreshold = (filter: string): Date | null => {
    const now = new Date();
    switch (filter) {
      case 'today': return new Date(now.getFullYear(), now.getMonth(), now.getDate());
      case 'week': { const d = new Date(now); d.setDate(d.getDate() - 7); return d; }
      case 'month': { const d = new Date(now); d.setMonth(d.getMonth() - 1); return d; }
      default: return null;
    }
  };

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const dateThreshold = getDateThreshold(dateFilter);

    return transcripts.filter(t => {
      const matchesSearch = !q || 
        t.text.toLowerCase().includes(q) ||
        t.engine.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        t.tags?.some(tag => tag.toLowerCase().includes(q));
      const matchesEngine = engineFilter === "all" || t.engine === engineFilter;
      const matchesDate = !dateThreshold || new Date(t.created_at) >= dateThreshold;
      return matchesSearch && matchesEngine && matchesDate;
    });
  }, [transcripts, searchQuery, engineFilter, dateFilter]);

  if (transcripts.length === 0 && !isLoading) return null;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('he-IL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };




  // Highlight search matches in text
  const highlightText = (text: string, query: string, maxLen: number = 200) => {
    const truncated = text.substring(0, maxLen);
    if (!query || query.length < 2) return truncated + '...';
    
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return truncated + '...';
    
    // Show context around the match
    const start = Math.max(0, idx - 60);
    const end = Math.min(text.length, idx + query.length + 60);
    const snippet = (start > 0 ? '...' : '') + text.substring(start, end) + (end < text.length ? '...' : '');
    
    // Bold the match
    const parts = snippet.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((part, i) => 
      part.toLowerCase() === query.toLowerCase() 
        ? <mark key={i} className="bg-primary/20 text-foreground rounded px-0.5">{part}</mark> 
        : part
    );
  };

  const handleAddTag = (id: string, tag: string) => {
    if (!tag.trim()) return;
    const transcript = transcripts.find(t => t.id === id);
    if (!transcript) return;
    const tags = transcript.tags || [];
    if (!tags.includes(tag.trim())) {
      onUpdate(id, { tags: [...tags, tag.trim()] });
    }
    setNewTag("");
    setEditingTagId(null);
  };

  const handleRemoveTag = (id: string, tagToRemove: string) => {
    const transcript = transcripts.find(t => t.id === id);
    if (!transcript) return;
    onUpdate(id, { tags: (transcript.tags || []).filter(t => t !== tagToRemove) });
  };

  const activeFilters = (engineFilter !== "all" ? 1 : 0) + (dateFilter !== "all" ? 1 : 0);

  return (
    <Card className="p-6" dir="rtl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-semibold text-right">
            היסטוריית תמלולים ({filtered.length}/{transcripts.length})
          </h2>
          {isCloud ? (
            <Badge variant="secondary" className="text-xs gap-1">
              <Cloud className="w-3 h-3" /> ענן
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs gap-1">
              <HardDrive className="w-3 h-3" /> מקומי
            </Badge>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={onClearAll}>
          <Trash2 className="w-4 h-4 ml-2" />
          נקה הכל
        </Button>
      </div>

      {/* Search + Filter toggle */}
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="חפש בתמלולים (טקסט, כותרת, תגית, מנוע)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-10 text-right"
            dir="rtl"
          />
        </div>
        <Button
          variant={showFilters ? "default" : "outline"}
          size="icon"
          onClick={() => setShowFilters(!showFilters)}
          title="סינון"
        >
          <Filter className="w-4 h-4" />
          {activeFilters > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-destructive-foreground rounded-full text-[10px] flex items-center justify-center">
              {activeFilters}
            </span>
          )}
        </Button>
      </div>

      {/* Filters row */}
      {showFilters && (
        <div className="flex gap-2 mb-3 flex-wrap">
          <Select value={engineFilter} onValueChange={setEngineFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder="כל המנועים" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל המנועים</SelectItem>
              {engines.map(e => (
                <SelectItem key={e} value={e}>{e}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-[130px] h-8 text-xs">
              <Calendar className="w-3 h-3 ml-1" />
              <SelectValue placeholder="כל הזמנים" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל הזמנים</SelectItem>
              <SelectItem value="today">היום</SelectItem>
              <SelectItem value="week">שבוע אחרון</SelectItem>
              <SelectItem value="month">חודש אחרון</SelectItem>
            </SelectContent>
          </Select>

          {activeFilters > 0 && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setEngineFilter("all"); setDateFilter("all"); }}>
              <X className="w-3 h-3 ml-1" />
              נקה סינון
            </Button>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="mr-2 text-muted-foreground">טוען תמלולים...</span>
        </div>
      ) : (
        <ScrollArea className="h-[400px]">
          <div className="space-y-3">
            {filtered.map((entry) => (
              <div
                key={entry.id}
                className="p-4 rounded-lg border hover:bg-accent/50 transition-colors text-right"
              >
                <div className="flex items-center justify-between mb-2 flex-row-reverse">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-medium">{entry.engine}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => onDelete(entry.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                    <span className="text-xs text-muted-foreground">{formatDate(entry.created_at)}</span>
                  </div>
                </div>

                {entry.title && (
                  <p className="text-sm font-medium mb-1 text-right">{entry.title}</p>
                )}

                <div className="flex items-start gap-2 mb-3 flex-row-reverse">
                  <FileText className="w-4 h-4 mt-1 flex-shrink-0 text-muted-foreground" />
                  <p className="text-sm line-clamp-2 text-right flex-1 text-muted-foreground">
                    {highlightText(entry.text, searchQuery)}
                  </p>
                </div>

                <div className="flex gap-2 mt-2 flex-row-reverse">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 text-xs"
                    onClick={() => navigate('/text-editor', { state: { text: entry.text } })}
                  >
                    <Edit className="w-3 h-3 ml-1" />
                    ערוך
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-1 text-xs"
                    onClick={() => onSelect(entry.text)}
                  >
                    <FileText className="w-3 h-3 ml-1" />
                    טען
                  </Button>
                </div>

                {entry.tags && entry.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {entry.tags.map((tag, tagIndex) => (
                      <Badge key={tagIndex} variant="secondary" className="text-xs">
                        {tag}
                        <X
                          className="w-3 h-3 mr-1 cursor-pointer hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveTag(entry.id, tag);
                          }}
                        />
                      </Badge>
                    ))}
                  </div>
                )}

                {editingTagId === entry.id ? (
                  <div className="flex gap-2 mt-2">
                    <Input
                      placeholder="הוסף תגית..."
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddTag(entry.id, newTag);
                      }}
                      className="text-xs h-7 text-right"
                      dir="rtl"
                      autoFocus
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => handleAddTag(entry.id, newTag)}
                    >
                      הוסף
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-full text-xs mt-2"
                    onClick={() => {
                      setEditingTagId(entry.id);
                      setNewTag("");
                    }}
                  >
                    <Tag className="w-3 h-3 ml-1" />
                    הוסף תגית
                  </Button>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </Card>
  );
};
