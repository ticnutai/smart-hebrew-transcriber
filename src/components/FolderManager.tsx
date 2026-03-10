import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";
import {
  FolderOpen, FolderPlus, FileText, Search, ArrowRight, Edit, Trash2, Tag
} from "lucide-react";
import type { CloudTranscript } from "@/hooks/useCloudTranscripts";

interface FolderManagerProps {
  transcripts: CloudTranscript[];
  onUpdate: (id: string, updates: Partial<Pick<CloudTranscript, 'folder' | 'tags' | 'title'>>) => void;
  onDelete: (id: string) => void;
}

export const FolderManager = ({ transcripts, onUpdate, onDelete }: FolderManagerProps) => {
  const navigate = useNavigate();
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);

  // Get unique folders
  const folders = useMemo(() => {
    const folderSet = new Set(transcripts.map(t => t.folder).filter(Boolean));
    return Array.from(folderSet).sort();
  }, [transcripts]);

  // Filter transcripts
  const filteredTranscripts = useMemo(() => {
    let result = transcripts;

    if (selectedFolder !== null) {
      result = result.filter(t => (t.folder || '') === selectedFolder);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t =>
        t.text.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        t.engine.toLowerCase().includes(q) ||
        t.tags?.some(tag => tag.toLowerCase().includes(q))
      );
    }

    return result;
  }, [transcripts, selectedFolder, searchQuery]);

  const unfolderedCount = transcripts.filter(t => !t.folder).length;

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    // Just select the new folder name - it'll exist when items are moved to it
    setSelectedFolder(newFolderName.trim());
    setNewFolderName("");
    setShowNewFolder(false);
  };

  const handleMoveToFolder = (transcriptId: string, folder: string) => {
    onUpdate(transcriptId, { folder });
    setMovingId(null);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('he-IL', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <Card dir="rtl">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-primary" />
            <CardTitle className="text-xl">ניהול תמלולים</CardTitle>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowNewFolder(true)}>
            <FolderPlus className="w-4 h-4 ml-1" />
            תיקיה חדשה
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* New Folder Input */}
        {showNewFolder && (
          <div className="flex gap-2">
            <Input
              placeholder="שם התיקיה..."
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
              className="text-right"
              dir="rtl"
              autoFocus
            />
            <Button size="sm" onClick={handleCreateFolder}>צור</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowNewFolder(false)}>ביטול</Button>
          </div>
        )}

        {/* Folder chips */}
        <div className="flex flex-wrap gap-2">
          <Badge
            variant={selectedFolder === null ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setSelectedFolder(null)}
          >
            הכל ({transcripts.length})
          </Badge>
          <Badge
            variant={selectedFolder === '' ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setSelectedFolder('')}
          >
            ללא תיקיה ({unfolderedCount})
          </Badge>
          {folders.map(folder => (
            <Badge
              key={folder}
              variant={selectedFolder === folder ? "default" : "outline"}
              className="cursor-pointer gap-1"
              onClick={() => setSelectedFolder(folder)}
            >
              <FolderOpen className="w-3 h-3" />
              {folder} ({transcripts.filter(t => t.folder === folder).length})
            </Badge>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="חפש תמלולים..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pr-10 text-right"
            dir="rtl"
          />
        </div>

        {/* Transcript list */}
        <ScrollArea className="h-[350px]">
          <div className="space-y-2">
            {filteredTranscripts.map(t => (
              <div key={t.id} className="p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{t.engine}</Badge>
                    {t.folder && (
                      <Badge variant="secondary" className="text-xs gap-1">
                        <FolderOpen className="w-3 h-3" />{t.folder}
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{formatDate(t.created_at)}</span>
                </div>

                <p className="text-sm font-medium truncate mb-1">{t.title || t.text.substring(0, 60)}</p>
                <p className="text-xs text-muted-foreground line-clamp-1">{t.text.substring(0, 100)}</p>

                {t.tags && t.tags.length > 0 && (
                  <div className="flex gap-1 mt-1">
                    {t.tags.map((tag, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 mt-2">
                  <Button
                    size="sm" variant="outline" className="text-xs flex-1"
                    onClick={() => navigate('/text-editor', { state: { text: t.text } })}
                  >
                    <Edit className="w-3 h-3 ml-1" />
                    ערוך
                  </Button>

                  {/* Move to folder */}
                  <Dialog open={movingId === t.id} onOpenChange={(o) => setMovingId(o ? t.id : null)}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="ghost" className="text-xs">
                        <FolderOpen className="w-3 h-3 ml-1" />
                        העבר
                      </Button>
                    </DialogTrigger>
                    <DialogContent dir="rtl" className="max-w-sm">
                      <DialogHeader>
                        <DialogTitle>העבר לתיקיה</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-2 py-2">
                        <Button
                          variant="outline"
                          className="w-full justify-start"
                          onClick={() => handleMoveToFolder(t.id, '')}
                        >
                          ללא תיקיה
                        </Button>
                        {folders.map(f => (
                          <Button
                            key={f}
                            variant={t.folder === f ? "default" : "outline"}
                            className="w-full justify-start gap-2"
                            onClick={() => handleMoveToFolder(t.id, f)}
                          >
                            <FolderOpen className="w-4 h-4" />
                            {f}
                          </Button>
                        ))}
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Button
                    size="sm" variant="ghost" className="text-xs text-destructive hover:text-destructive"
                    onClick={() => onDelete(t.id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}

            {filteredTranscripts.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>אין תמלולים {selectedFolder ? `בתיקיה "${selectedFolder}"` : ''}</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
