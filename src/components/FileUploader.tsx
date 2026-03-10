import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface FileUploaderProps {
  onFileSelect: (file: File) => void;
  isLoading: boolean;
  progress?: number;
}

export const FileUploader = ({ onFileSelect, isLoading, progress }: FileUploaderProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  return (
    <Card className="p-8" dir="rtl">
      <div className="flex flex-col gap-4">
        <div className="rounded-full bg-primary/10 p-4">
          {isLoading ? (
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          ) : (
            <Upload className="w-8 h-8 text-primary" />
          )}
        </div>
        
        <div className="text-right">
          <h3 className="text-lg font-semibold mb-2">
            {isLoading ? "מתמלל..." : "העלה קובץ אודיו או וידאו"}
          </h3>
          <p className="text-sm text-muted-foreground">
            נתמך: MP3, WAV, M4A, MP4, WEBM ועוד
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            גודל מקסימלי: 25MB
          </p>
        </div>

        {progress !== undefined && progress > 0 && (
          <div className="w-full max-w-xs">
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-center mt-1 text-muted-foreground">{progress}%</p>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,video/*"
          onChange={handleFileChange}
          className="hidden"
          disabled={isLoading}
        />
        
        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          size="lg"
          className="ml-auto"
        >
          {isLoading ? "מעבד..." : "בחר קובץ"}
        </Button>
      </div>
    </Card>
  );
};
