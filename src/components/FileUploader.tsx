import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Upload, Loader2, Zap, Globe, Chrome, Mic, Waves, Server, Cpu, Film, Music } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { isVideoFile, MAX_VIDEO_SIZE_MB, MAX_AUDIO_SIZE_MB } from "@/lib/videoUtils";

const ENGINE_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  groq: { label: 'Groq', icon: <Zap className="w-3 h-3" />, color: 'text-primary' },
  openai: { label: 'OpenAI', icon: <Globe className="w-3 h-3" />, color: 'text-primary' },
  google: { label: 'Google', icon: <Chrome className="w-3 h-3" />, color: 'text-blue-500' },
  assemblyai: { label: 'AssemblyAI', icon: <Mic className="w-3 h-3" />, color: 'text-green-500' },
  deepgram: { label: 'Deepgram', icon: <Waves className="w-3 h-3" />, color: 'text-purple-500' },
  'local-server': { label: 'CUDA', icon: <Server className="w-3 h-3" />, color: 'text-purple-500' },
  local: { label: 'ONNX', icon: <Cpu className="w-3 h-3" />, color: 'text-accent' },
};

interface FileUploaderProps {
  onFileSelect: (file: File) => void;
  isLoading: boolean;
  progress?: number;
  engine?: string;
}

export const FileUploader = ({ onFileSelect, isLoading, progress, engine }: FileUploaderProps) => {
  const meta = engine ? ENGINE_META[engine] : null;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      onFileSelect(file);
    }
  };

  const isVideo = selectedFile ? isVideoFile(selectedFile) : false;

  return (
    <Card className="p-8" dir="rtl">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          {meta && (
            <Badge variant="outline" className={`flex items-center gap-1 text-[10px] px-2 py-0.5 ${meta.color}`}>
              {meta.icon}
              {meta.label}
            </Badge>
          )}
          {isVideo && isLoading && (
            <Badge className="flex items-center gap-1 text-[10px] bg-purple-600 hover:bg-purple-700">
              <Film className="w-3 h-3" />
              וידאו — מחלץ אודיו
            </Badge>
          )}
        </div>
        <div className="rounded-full bg-primary/10 p-4">
          {isLoading ? (
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          ) : isVideo ? (
            <Film className="w-8 h-8 text-purple-500" />
          ) : (
            <Upload className="w-8 h-8 text-primary" />
          )}
        </div>
        
        <div className="text-right">
          <h3 className="text-lg font-semibold mb-2">
            {isLoading ? "מתמלל..." : "העלה קובץ אודיו או וידאו"}
          </h3>
          <p className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1"><Music className="w-3 h-3" /> MP3, WAV, M4A, FLAC, OGG, AAC, WMA</span>
            <span className="flex items-center gap-1"><Film className="w-3 h-3" /> MP4, WEBM, AVI, MOV, MKV</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            אודיו: עד {MAX_AUDIO_SIZE_MB}MB | וידאו: עד {MAX_VIDEO_SIZE_MB}MB
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
          accept="audio/*,video/*,.mp3,.wav,.m4a,.flac,.ogg,.opus,.aac,.wma,.amr,.mp4,.webm,.avi,.mov,.mkv,.wmv,.3gp,.3gpp,.aiff,.aif,.caf,.spx,.gsm"
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
