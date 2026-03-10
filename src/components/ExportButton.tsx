import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileText, File, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { jsPDF } from "jspdf";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import { saveAs } from "file-saver";

interface ExportButtonProps {
  text: string;
  title?: string;
  disabled?: boolean;
}

export const ExportButton = ({ text, title = "תמלול", disabled }: ExportButtonProps) => {
  const [isExporting, setIsExporting] = useState(false);

  const exportToPDF = async () => {
    setIsExporting(true);
    try {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      // Add Hebrew font support - use built-in Helvetica (limited Hebrew support)
      // For full Hebrew, we'll use Unicode text rendering
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      const maxWidth = pageWidth - margin * 2;

      // Title
      doc.setFontSize(18);
      doc.text(title, pageWidth - margin, 20, { align: "right" });

      // Date
      doc.setFontSize(10);
      doc.setTextColor(128, 128, 128);
      const dateStr = new Date().toLocaleString('he-IL');
      doc.text(dateStr, pageWidth - margin, 28, { align: "right" });

      // Content
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);

      const lines = doc.splitTextToSize(text, maxWidth);
      let y = 40;

      for (const line of lines) {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        doc.text(line, pageWidth - margin, y, { align: "right" });
        y += 7;
      }

      doc.save(`${title}-${Date.now()}.pdf`);
      toast({ title: "PDF הורד בהצלחה" });
    } catch (error) {
      console.error("PDF export error:", error);
      toast({ title: "שגיאה בייצוא PDF", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const exportToDOCX = async () => {
    setIsExporting(true);
    try {
      const paragraphs = text.split('\n').map(line =>
        new Paragraph({
          children: [
            new TextRun({
              text: line,
              size: 24, // 12pt
              font: "David",
            }),
          ],
          bidirectional: true,
        })
      );

      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: title,
                  bold: true,
                  size: 36, // 18pt
                  font: "David",
                }),
              ],
              heading: HeadingLevel.HEADING_1,
              bidirectional: true,
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: new Date().toLocaleString('he-IL'),
                  size: 20,
                  color: "888888",
                  font: "David",
                }),
              ],
              bidirectional: true,
            }),
            new Paragraph({ children: [] }), // spacer
            ...paragraphs,
          ],
        }],
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `${title}-${Date.now()}.docx`);
      toast({ title: "DOCX הורד בהצלחה" });
    } catch (error) {
      console.error("DOCX export error:", error);
      toast({ title: "שגיאה בייצוא DOCX", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const exportToTXT = () => {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    saveAs(blob, `${title}-${Date.now()}.txt`);
    toast({ title: "TXT הורד בהצלחה" });
  };

  return (
    <DropdownMenu dir="rtl">
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled || !text.trim() || isExporting}>
          {isExporting ? (
            <Loader2 className="w-4 h-4 ml-2 animate-spin" />
          ) : (
            <Download className="w-4 h-4 ml-2" />
          )}
          ייצוא
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={exportToPDF}>
          <File className="w-4 h-4 ml-2" />
          ייצוא ל-PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportToDOCX}>
          <FileText className="w-4 h-4 ml-2" />
          ייצוא ל-DOCX
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportToTXT}>
          <FileText className="w-4 h-4 ml-2" />
          ייצוא ל-TXT
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
