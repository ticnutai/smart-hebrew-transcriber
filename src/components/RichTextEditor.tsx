import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  Copy, 
  Scissors, 
  FileDown, 
  Palette,
  Bold,
  Italic,
  Underline,
  Highlighter,
  Undo,
  Redo,
  Type
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface RichTextEditorProps {
  text: string;
  onChange: (text: string) => void;
}

export const RichTextEditor = ({ text, onChange }: RichTextEditorProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [highlightColor, setHighlightColor] = useState("#ffff00");
  const [history, setHistory] = useState<string[]>([text]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const colors = [
    "#ffff00", // צהוב
    "#00ff00", // ירוק
    "#00ffff", // תכלת
    "#ff00ff", // ורוד
    "#ffa500", // כתום
    "#ff0000", // אדום
  ];

  const updateHistory = (newText: string) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newText);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    onChange(newText);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      onChange(history[historyIndex - 1]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      onChange(history[historyIndex + 1]);
    }
  };

  const handleCopy = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = text.substring(start, end);

    if (selectedText) {
      navigator.clipboard.writeText(selectedText);
      toast({ title: "הועתק", description: "הטקסט הנבחר הועתק ללוח" });
    } else {
      navigator.clipboard.writeText(text);
      toast({ title: "הועתק", description: "כל הטקסט הועתק ללוח" });
    }
  };

  const handleCut = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = text.substring(start, end);

    if (selectedText) {
      navigator.clipboard.writeText(selectedText);
      const newText = text.substring(0, start) + text.substring(end);
      updateHistory(newText);
      toast({ title: "נגזר", description: "הטקסט הנבחר נגזר" });
    }
  };

  const handleHighlight = (color: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = text.substring(start, end);

    if (selectedText) {
      const highlightedText = `<mark style="background-color: ${color};">${selectedText}</mark>`;
      const newText = text.substring(0, start) + highlightedText + text.substring(end);
      updateHistory(newText);
      toast({ title: "הודגש", description: "הטקסט הנבחר הודגש בצבע" });
    }
  };

  const handleExportTXT = () => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
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
    // For DOCX export, we'll create an HTML file that can be opened in Word
    const htmlContent = `
      <!DOCTYPE html>
      <html dir="rtl">
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; direction: rtl; }
          mark { padding: 2px 4px; }
        </style>
      </head>
      <body>
        <pre style="white-space: pre-wrap; font-family: inherit;">${text}</pre>
      </body>
      </html>
    `;
    
    const blob = new Blob([htmlContent], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `edited-transcript-${Date.now()}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({ title: "ייצוא הצליח", description: "הקובץ DOCX הורד" });
  };

  return (
    <Card className="p-6" dir="rtl">
      <div className="space-y-4">
        {/* כלי עריכה */}
        <div className="flex flex-wrap gap-2 pb-4 border-b">
          <Button
            variant="outline"
            size="sm"
            onClick={handleUndo}
            disabled={historyIndex === 0}
            title="ביטול"
          >
            <Undo className="w-4 h-4" />
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleRedo}
            disabled={historyIndex === history.length - 1}
            title="ביצוע מחדש"
          >
            <Redo className="w-4 h-4" />
          </Button>

          <div className="w-px h-8 bg-border mx-1" />

          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            title="העתק"
          >
            <Copy className="w-4 h-4 ml-1" />
            העתק
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleCut}
            title="גזור"
          >
            <Scissors className="w-4 h-4 ml-1" />
            גזור
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" title="הדגשה">
                <Highlighter className="w-4 h-4 ml-1" />
                הדגש
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" dir="rtl">
              <div className="flex gap-2">
                {colors.map((color) => (
                  <button
                    key={color}
                    onClick={() => handleHighlight(color)}
                    className="w-8 h-8 rounded border-2 border-border hover:scale-110 transition-transform"
                    style={{ backgroundColor: color }}
                    title={`הדגש ב${color}`}
                  />
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <div className="w-px h-8 bg-border mx-1" />

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportTXT}
            title="ייצא TXT"
          >
            <FileDown className="w-4 h-4 ml-1" />
            TXT
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportDOCX}
            title="ייצא DOCX"
          >
            <FileDown className="w-4 h-4 ml-1" />
            DOCX
          </Button>
        </div>

        {/* אזור העריכה */}
        <div>
          <Label className="text-sm font-semibold mb-2 block text-right">
            <Type className="w-4 h-4 inline ml-1" />
            ערוך את הטקסט
          </Label>
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => updateHistory(e.target.value)}
            className="min-h-[500px] text-right inherit-font"
            dir="rtl"
            placeholder="הטקסט שלך יופיע כאן..."
            style={{
              fontFamily: 'inherit',
              fontSize: 'inherit',
              color: 'inherit',
              lineHeight: 'inherit',
            }}
          />
          <p className="text-xs text-muted-foreground mt-2 text-right">
            בחר טקסט כדי להשתמש בכלי העריכה
          </p>
        </div>

        {/* סטטיסטיקות */}
        <div className="flex gap-4 text-xs text-muted-foreground border-t pt-3">
          <span>תווים: {text.length}</span>
          <span>מילים: {text.split(/\s+/).filter(w => w).length}</span>
          <span>שורות: {text.split('\n').length}</span>
        </div>
      </div>
    </Card>
  );
};
