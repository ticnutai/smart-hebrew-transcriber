import { useState, useRef, useCallback, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { 
  Copy, Scissors, FileDown, 
  Bold, Italic, Underline, Strikethrough,
  Highlighter, Undo, Redo, Type, 
  AlignRight, AlignCenter, AlignLeft, AlignJustify, 
  Palette, List, ListOrdered, Eraser,
  Maximize2, Minimize2, SplitSquareVertical, Eye,
  Search, X, ChevronDown
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  text: string;
  onChange: (text: string) => void;
}

const prepareHtml = (text: string): string => {
  if (!text) return '';
  if (/<[a-z][\s\S]*>/i.test(text)) return text;
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
};

const stripHtml = (html: string): string => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.innerText || '';
};

type ViewMode = 'edit' | 'preview' | 'split';

export const RichTextEditor = ({ text, onChange }: RichTextEditorProps) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [showFormatBar, setShowFormatBar] = useState(false);
  const [textColor, setTextColor] = useState("#000000");
  const [fontSize, setFontSize] = useState("16");
  const [viewMode, setViewMode] = useState<ViewMode>('edit');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [htmlContent, setHtmlContent] = useState(() => prepareHtml(text));
  const isInternalUpdate = useRef(false);

  const highlightColors = [
    "#ffff00", "#00ff00", "#00ffff", "#ff00ff", "#ffa500", "#ff0000",
  ];

  const textColors = [
    "#000000", "#ffffff", "#ff0000", "#0000ff", "#008000", "#800080", "#ff8c00", "#808080",
  ];

  // Sync external text changes
  useEffect(() => {
    if (!isInternalUpdate.current) {
      const newHtml = prepareHtml(text);
      setHtmlContent(newHtml);
      if (editorRef.current && editorRef.current.innerHTML !== newHtml) {
        editorRef.current.innerHTML = newHtml;
      }
    }
    isInternalUpdate.current = false;
  }, [text]);

  const execCommand = useCallback((command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    syncContent();
  }, []);

  const syncContent = useCallback(() => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      setHtmlContent(html);
      isInternalUpdate.current = true;
      onChange(stripHtml(html));
    }
  }, [onChange]);

  const getHtmlForExport = () => {
    return editorRef.current?.innerHTML || htmlContent;
  };

  const handleCopy = () => {
    const sel = window.getSelection();
    const selectedText = sel?.toString() || '';
    if (selectedText) {
      navigator.clipboard.writeText(selectedText);
      toast({ title: "הועתק", description: "הטקסט הנבחר הועתק ללוח" });
    } else {
      navigator.clipboard.writeText(stripHtml(htmlContent));
      toast({ title: "הועתק", description: "כל הטקסט הועתק ללוח" });
    }
  };

  const handleCut = () => {
    const sel = window.getSelection();
    if (sel && sel.toString()) {
      navigator.clipboard.writeText(sel.toString());
      execCommand('delete');
      toast({ title: "נגזר", description: "הטקסט הנבחר נגזר" });
    }
  };

  const handleClearFormatting = () => {
    execCommand('removeFormat');
    toast({ title: "עיצוב נוקה", description: "העיצוב הוסר מהטקסט הנבחר" });
  };

  const handleSearch = () => {
    if (!searchTerm || !editorRef.current) return;
    const sel = window.getSelection();
    if (!sel) return;
    
    const textContent = editorRef.current.textContent || '';
    const idx = textContent.toLowerCase().indexOf(searchTerm.toLowerCase());
    if (idx === -1) {
      toast({ title: "לא נמצא", description: `"${searchTerm}" לא נמצא בטקסט` });
      return;
    }

    // Use window.find for highlight
    window.find(searchTerm, false, false, true);
  };

  const plainText = stripHtml(htmlContent);

  const handleExportTXT = () => {
    const blob = new Blob([plainText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `edited-transcript-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "ייצוא הצליח", description: "הקובץ הורד בהצלחה" });
  };

  const handleExportDOCX = () => {
    const richHtml = getHtmlForExport();
    const htmlDoc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8">
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
<style>@page{direction:rtl}body{font-family:Arial,sans-serif;direction:rtl;unicode-bidi:embed;line-height:1.8;}</style>
</head><body dir="rtl"><div style="font-family:Arial;">${richHtml}</div></body></html>`;
    const blob = new Blob(['\ufeff' + htmlDoc], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `edited-transcript-${Date.now()}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "ייצוא הצליח", description: "קובץ Word הורד" });
  };

  const handleExportPDF = () => {
    const richHtml = getHtmlForExport();
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({ title: "שגיאה", description: "יש לאפשר חלונות קופצים ליצוא PDF", variant: "destructive" });
      return;
    }
    printWindow.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>ייצוא PDF</title><style>body{font-family:Arial,sans-serif;direction:rtl;padding:40px;line-height:1.8}@media print{body{padding:20px}}</style></head><body>${richHtml}</body></html>`);
    printWindow.document.close();
    printWindow.print();
  };

  const handleExportSRT = () => {
    const words = plainText.split(/\s+/).filter(w => w);
    const segmentSize = 10;
    let srtContent = '';
    for (let i = 0; i < words.length; i += segmentSize) {
      const seg = words.slice(i, i + segmentSize).join(' ');
      const idx = Math.floor(i / segmentSize);
      const startSec = idx * 5;
      const endSec = (idx + 1) * 5;
      const fmt = (s: number) => {
        const h = String(Math.floor(s / 3600)).padStart(2, '0');
        const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
        const sc = String(s % 60).padStart(2, '0');
        return `${h}:${m}:${sc},000`;
      };
      srtContent += `${idx + 1}\n${fmt(startSec)} --> ${fmt(endSec)}\n${seg}\n\n`;
    }
    const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript-${Date.now()}.srt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "ייצוא הצליח", description: "קובץ SRT (כתוביות) הורד" });
  };

  const ToolBtn = ({ icon: Icon, label, onClick, active, disabled }: {
    icon: React.ElementType; label: string; onClick: () => void; active?: boolean; disabled?: boolean;
  }) => (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={active ? "secondary" : "ghost"}
            size="sm"
            onClick={onClick}
            disabled={disabled}
            className={cn("h-8 w-8 p-0", active && "bg-accent ring-1 ring-primary/30")}
          >
            <Icon className="w-4 h-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom"><p>{label}</p></TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  const cardClass = cn(
    "p-4 transition-all duration-300",
    isFullscreen && "fixed inset-0 z-50 rounded-none overflow-auto bg-background"
  );

  return (
    <Card className={cardClass} dir="rtl">
      <div className="space-y-3">

        {/* === שורת כלים ראשית === */}
        <div className="flex flex-wrap items-center gap-1 pb-3 border-b">

          {/* Undo / Redo */}
          <ToolBtn icon={Undo} label="ביטול (Ctrl+Z)" onClick={() => execCommand('undo')} />
          <ToolBtn icon={Redo} label="ביצוע מחדש (Ctrl+Y)" onClick={() => execCommand('redo')} />

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* === כפתור T – עיצוב טקסט === */}
          <Popover open={showFormatBar} onOpenChange={setShowFormatBar}>
            <PopoverTrigger asChild>
              <Button
                variant={showFormatBar ? "secondary" : "outline"}
                size="sm"
                className="gap-1 font-bold text-base px-2"
                title="עיצוב טקסט"
              >
                T
                <ChevronDown className="w-3 h-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3" dir="rtl" align="start">
              <div className="space-y-3">
                {/* Bold / Italic / Underline / Strikethrough */}
                <div className="flex items-center gap-1">
                  <ToolBtn icon={Bold} label="מודגש" onClick={() => execCommand('bold')} />
                  <ToolBtn icon={Italic} label="נטוי" onClick={() => execCommand('italic')} />
                  <ToolBtn icon={Underline} label="קו תחתון" onClick={() => execCommand('underline')} />
                  <ToolBtn icon={Strikethrough} label="קו חוצה" onClick={() => execCommand('strikeThrough')} />
                  <Separator orientation="vertical" className="h-6 mx-1" />
                  <ToolBtn icon={Eraser} label="נקה עיצוב" onClick={handleClearFormatting} />
                </div>

                {/* גודל פונט */}
                <div className="flex items-center gap-2">
                  <Label className="text-xs whitespace-nowrap">גודל:</Label>
                  <select
                    className="h-7 rounded border bg-background px-2 text-xs"
                    value={fontSize}
                    onChange={(e) => {
                      setFontSize(e.target.value);
                      execCommand('fontSize', '7');
                      // Replace font size 7 with actual px
                      if (editorRef.current) {
                        const fonts = editorRef.current.querySelectorAll('font[size="7"]');
                        fonts.forEach(el => {
                          (el as HTMLElement).removeAttribute('size');
                          (el as HTMLElement).style.fontSize = e.target.value + 'px';
                        });
                        syncContent();
                      }
                    }}
                  >
                    {[12, 14, 16, 18, 20, 24, 28, 32, 36, 48].map(s => (
                      <option key={s} value={s}>{s}px</option>
                    ))}
                  </select>
                </div>

                {/* צבע טקסט */}
                <div className="space-y-1">
                  <Label className="text-xs">צבע טקסט:</Label>
                  <div className="flex gap-1.5 flex-wrap">
                    {textColors.map(c => (
                      <button
                        key={c}
                        onClick={() => { setTextColor(c); execCommand('foreColor', c); }}
                        className={cn(
                          "w-6 h-6 rounded border-2 hover:scale-110 transition-transform",
                          textColor === c ? "border-primary ring-1 ring-primary" : "border-border"
                        )}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                    <input
                      type="color"
                      value={textColor}
                      onChange={(e) => { setTextColor(e.target.value); execCommand('foreColor', e.target.value); }}
                      className="w-6 h-6 rounded cursor-pointer border-0 p-0"
                      title="צבע מותאם"
                    />
                  </div>
                </div>

                {/* הדגשה (highlight) */}
                <div className="space-y-1">
                  <Label className="text-xs">צבע הדגשה:</Label>
                  <div className="flex gap-1.5 flex-wrap">
                    {highlightColors.map(c => (
                      <button
                        key={c}
                        onClick={() => execCommand('hiliteColor', c)}
                        className="w-6 h-6 rounded border-2 border-border hover:scale-110 transition-transform"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>

                {/* רשימות */}
                <div className="flex items-center gap-1">
                  <ToolBtn icon={List} label="רשימה" onClick={() => execCommand('insertUnorderedList')} />
                  <ToolBtn icon={ListOrdered} label="רשימה ממוספרת" onClick={() => execCommand('insertOrderedList')} />
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* === יישור === */}
          <ToolBtn icon={AlignRight} label="יישור לימין" onClick={() => execCommand('justifyRight')} />
          <ToolBtn icon={AlignCenter} label="מרכוז" onClick={() => execCommand('justifyCenter')} />
          <ToolBtn icon={AlignLeft} label="יישור לשמאל" onClick={() => execCommand('justifyLeft')} />
          <ToolBtn icon={AlignJustify} label="יישור לשני הצדדים" onClick={() => execCommand('justifyFull')} />

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* העתק / גזור */}
          <ToolBtn icon={Copy} label="העתק" onClick={handleCopy} />
          <ToolBtn icon={Scissors} label="גזור" onClick={handleCut} />

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* תצוגה */}
          <ToolBtn
            icon={Type}
            label="עריכה"
            onClick={() => setViewMode('edit')}
            active={viewMode === 'edit'}
          />
          <ToolBtn
            icon={Eye}
            label="תצוגה מקדימה"
            onClick={() => setViewMode('preview')}
            active={viewMode === 'preview'}
          />
          <ToolBtn
            icon={SplitSquareVertical}
            label="תצוגה מפוצלת"
            onClick={() => setViewMode('split')}
            active={viewMode === 'split'}
          />
          <ToolBtn
            icon={isFullscreen ? Minimize2 : Maximize2}
            label={isFullscreen ? "יציאה ממסך מלא" : "מסך מלא"}
            onClick={() => setIsFullscreen(f => !f)}
          />

          {/* חיפוש */}
          <ToolBtn icon={Search} label="חיפוש" onClick={() => setSearchOpen(o => !o)} active={searchOpen} />

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* ייצוא */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1 text-xs">
                <FileDown className="w-4 h-4" />
                ייצא
                <ChevronDown className="w-3 h-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" dir="rtl">
              <div className="flex flex-col gap-1">
                <Button variant="ghost" size="sm" onClick={handleExportTXT} className="justify-start">TXT</Button>
                <Button variant="ghost" size="sm" onClick={handleExportDOCX} className="justify-start">DOC (Word)</Button>
                <Button variant="ghost" size="sm" onClick={handleExportPDF} className="justify-start">PDF</Button>
                <Button variant="ghost" size="sm" onClick={handleExportSRT} className="justify-start">SRT (כתוביות)</Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* === חיפוש === */}
        {searchOpen && (
          <div className="flex items-center gap-2 pb-2 border-b">
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="חפש בטקסט..."
              className="h-8 text-sm max-w-xs"
              dir="rtl"
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Button variant="ghost" size="sm" onClick={handleSearch} className="h-8">
              <Search className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setSearchOpen(false); setSearchTerm(""); }} className="h-8">
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* === אזור עריכה === */}
        <div className={cn(
          "grid gap-4",
          viewMode === 'split' ? "grid-cols-2" : "grid-cols-1"
        )}>
          {/* Editor */}
          {(viewMode === 'edit' || viewMode === 'split') && (
            <div className="space-y-1">
              {viewMode === 'split' && (
                <Label className="text-xs text-muted-foreground">עריכה</Label>
              )}
              <div
                ref={editorRef}
                contentEditable
                dir="rtl"
                className={cn(
                  "rounded-md border border-input bg-background px-4 py-3 text-right",
                  "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                  "overflow-auto prose prose-sm max-w-none",
                  isFullscreen ? "min-h-[calc(100vh-200px)]" : "min-h-[500px]"
                )}
                style={{
                  fontFamily: 'inherit',
                  fontSize: 'inherit',
                  lineHeight: '1.8',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
                onInput={syncContent}
                dangerouslySetInnerHTML={{ __html: htmlContent }}
                suppressContentEditableWarning
              />
            </div>
          )}

          {/* Preview */}
          {(viewMode === 'preview' || viewMode === 'split') && (
            <div className="space-y-1">
              {viewMode === 'split' && (
                <Label className="text-xs text-muted-foreground">תצוגה מקדימה</Label>
              )}
              <div
                dir="rtl"
                className={cn(
                  "rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 px-4 py-3 text-right",
                  "overflow-auto prose prose-sm max-w-none",
                  isFullscreen ? "min-h-[calc(100vh-200px)]" : "min-h-[500px]"
                )}
                style={{
                  fontFamily: 'inherit',
                  fontSize: 'inherit',
                  lineHeight: '1.8',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
                dangerouslySetInnerHTML={{ __html: htmlContent }}
              />
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-right">
          סמן טקסט ולחץ <strong>T</strong> לעיצוב • יישור • תצוגה מפוצלת
        </p>

        {/* === סטטיסטיקות === */}
        <div className="flex gap-4 text-xs text-muted-foreground border-t pt-3">
          <span>תווים: {plainText.length}</span>
          <span>מילים: {plainText.split(/\s+/).filter(w => w).length}</span>
          <span>שורות: {plainText.split('\n').length}</span>
        </div>
      </div>
    </Card>
  );
};
