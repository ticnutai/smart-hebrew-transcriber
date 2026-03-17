import { useState, useRef, useCallback, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Mic, Square, Copy, Trash2, Radio, Cpu, Globe } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type LiveMode = "browser" | "cuda";

const LIVE_CHUNK_MS = 3000;
const LIVE_RECORDING_TIMESLICE_MS = 200;
const LIVE_MIN_BLOB_BYTES = 1200;

interface LiveTranscriberProps {
  onTranscriptComplete: (text: string) => void;
  serverConnected?: boolean;
}

export const LiveTranscriber = ({ onTranscriptComplete, serverConnected }: LiveTranscriberProps) => {
  const [isListening, setIsListening] = useState(false);
  const isListeningRef = useRef(false);
  const [interimText, setInterimText] = useState("");
  const [finalText, setFinalText] = useState("");
  const [isSupported, setIsSupported] = useState(true);
  const [mode, setMode] = useState<LiveMode>(serverConnected ? "cuda" : "browser");
  const recognitionRef = useRef<any>(null);

  // CUDA live mode refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const allChunksRef = useRef<Blob[]>([]);
  const processingRef = useRef(false);
  const gpuBusyToastAtRef = useRef(0);

  const appendDedupText = useCallback((prev: string, nextRaw: string) => {
    const next = nextRaw.trim();
    if (!next) return prev;
    if (!prev.trim()) return next;

    const prevWords = prev.trim().split(/\s+/);
    const nextWords = next.split(/\s+/);
    const maxOverlap = Math.min(8, prevWords.length, nextWords.length);

    for (let overlap = maxOverlap; overlap >= 1; overlap--) {
      const prevTail = prevWords.slice(-overlap).join(" ");
      const nextHead = nextWords.slice(0, overlap).join(" ");
      if (prevTail === nextHead) {
        const suffix = nextWords.slice(overlap).join(" ");
        return suffix ? `${prev} ${suffix}` : prev;
      }
    }

    return `${prev} ${next}`;
  }, []);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition && !serverConnected) {
      setIsSupported(false);
    }
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      stopCudaCleanup();
    };
  }, []);

  // Switch mode when server connection changes
  useEffect(() => {
    if (serverConnected && !isListening) {
      setMode("cuda");
    }
  }, [serverConnected, isListening]);

  // ─── Browser Web Speech API ───
  const startBrowser = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({ title: "לא נתמך", description: "הדפדפן שלך לא תומך בתמלול בזמן אמת. נסה Chrome.", variant: "destructive" });
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "he-IL";

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";

      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript + " ";
        } else {
          interim += transcript;
        }
      }

      if (final) {
        setFinalText(prev => prev + final);
      }
      setInterimText(interim);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      if (event.error === "not-allowed") {
        toast({ title: "גישה למיקרופון נדחתה", description: "אנא אפשר גישה למיקרופון", variant: "destructive" });
      }
      setIsListening(false);
      isListeningRef.current = false;
    };

    recognition.onend = () => {
      if (recognitionRef.current && isListeningRef.current) {
        try {
          recognition.start();
        } catch {
          isListeningRef.current = false;
          setIsListening(false);
        }
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    isListeningRef.current = true;
    setIsListening(true);
  }, []);

  const stopBrowser = useCallback(() => {
    isListeningRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimText("");
  }, []);

  // ─── CUDA Whisper Live Mode ───
  const getBaseUrl = () => localStorage.getItem('whisper_server_url') || 'http://localhost:8765';

  const sendChunk = useCallback(async (blob: Blob) => {
    if (blob.size < LIVE_MIN_BLOB_BYTES || processingRef.current) return;
    processingRef.current = true;
    try {
      const formData = new FormData();
      formData.append("file", blob, "chunk.webm");
      formData.append("language", "he");

      const res = await fetch(`${getBaseUrl()}/transcribe-live`, {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(15000),
      });

      if (res.status === 429) {
        chunksRef.current.unshift(blob);
        const now = Date.now();
        if (now - gpuBusyToastAtRef.current > 4000) {
          gpuBusyToastAtRef.current = now;
          toast({ title: "GPU עסוק", description: "ממשיך אוטומטית כשהשרת יתפנה" });
        }
        return;
      }

      if (res.ok) {
        const data = await res.json();
        const text = data.text?.trim();
        if (text) {
          setFinalText(prev => appendDedupText(prev, text));
          setInterimText("");
        }
      }
    } catch (err) {
      console.error("Live chunk error:", err);
      // Keep audio for the next cycle when a transient network/server error occurs.
      chunksRef.current.unshift(blob);
    } finally {
      processingRef.current = false;
    }
  }, [appendDedupText]);

  const runFinalRefinePass = useCallback(async (): Promise<string | null> => {
    if (allChunksRef.current.length === 0) return null;
    try {
      const mimeType = mediaRecorderRef.current?.mimeType || "audio/webm";
      const fullBlob = new Blob(allChunksRef.current, { type: mimeType });

      const formData = new FormData();
      formData.append("file", fullBlob, "live-final.webm");
      formData.append("language", "he");
      formData.append("final", "1");

      const res = await fetch(`${getBaseUrl()}/transcribe-live`, {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) return null;
      const data = await res.json();
      const refinedText = data.text?.trim();
      if (refinedText) {
        toast({ title: "✅ שופר דיוק", description: "בוצע refine קצר לאחר עצירה" });
        return refinedText;
      }
      return null;
    } catch {
      // Final refine is best-effort only.
      return null;
    }
  }, []);

  const startCuda = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
          allChunksRef.current.push(e.data);
        }
      };

      recorder.start(LIVE_RECORDING_TIMESLICE_MS);

      // Send accumulated chunks every ~1.8s for lower perceived latency.
      chunkIntervalRef.current = setInterval(() => {
        if (chunksRef.current.length > 0 && !processingRef.current) {
          const blob = new Blob(chunksRef.current, { type: mimeType });
          chunksRef.current = [];
          sendChunk(blob);
        }
      }, LIVE_CHUNK_MS);

      setInterimText("מאזין...");
      isListeningRef.current = true;
      setIsListening(true);
    } catch (err) {
      console.error("Microphone access error:", err);
      toast({ title: "גישה למיקרופון נדחתה", description: "אנא אפשר גישה למיקרופון בהגדרות הדפדפן", variant: "destructive" });
    }
  }, [sendChunk]);

  const stopCudaCleanup = useCallback(() => {
    if (chunkIntervalRef.current) {
      clearInterval(chunkIntervalRef.current);
      chunkIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    chunksRef.current = [];
    allChunksRef.current = [];
    processingRef.current = false;
    isListeningRef.current = false;
    setIsListening(false);
    setInterimText("");
  }, []);

  // ─── Unified controls ───
  const startListening = useCallback(() => {
    if (mode === "cuda") {
      startCuda();
    } else {
      startBrowser();
    }
  }, [mode, startCuda, startBrowser]);

  const stopListening = useCallback(async () => {
    if (mode === "cuda") {
      const refinedText = await runFinalRefinePass();
      const merged = refinedText
        ? (refinedText.length >= Math.max(20, Math.floor(finalText.length * 0.8))
          ? refinedText
          : appendDedupText(finalText, refinedText))
        : finalText;
      if (refinedText) {
        setFinalText(merged);
      }
      stopCudaCleanup();
      if (merged.trim()) {
        onTranscriptComplete(merged.trim());
      }
    } else {
      stopBrowser();
      if (finalText.trim()) {
        onTranscriptComplete(finalText.trim());
      }
    }
  }, [appendDedupText, mode, finalText, onTranscriptComplete, runFinalRefinePass, stopCudaCleanup, stopBrowser]);

  const handleCopy = () => {
    navigator.clipboard.writeText(finalText);
    toast({ title: "הועתק ללוח" });
  };

  const handleClear = () => {
    setFinalText("");
    setInterimText("");
  };

  const browserSupported = !!(
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  );

  if (!isSupported && !serverConnected) {
    return (
      <Card className="p-6" dir="rtl">
        <div className="text-center text-muted-foreground">
          <p>הדפדפן שלך לא תומך בתמלול בזמן אמת.</p>
          <p className="text-sm mt-1">נסה להשתמש ב-Google Chrome או הפעל את שרת CUDA.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6" dir="rtl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Radio className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">תמלול בזמן אמת</h3>
          {isListening && (
            <Badge variant="destructive" className="animate-pulse text-xs gap-1">
              <span className="w-2 h-2 rounded-full bg-destructive-foreground" />
              מאזין
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          {finalText && (
            <>
              <Button variant="ghost" size="sm" onClick={handleCopy}>
                <Copy className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={handleClear}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Mode selector */}
      {!isListening && (
        <div className="flex gap-2 mb-4 justify-center">
          {browserSupported && (
            <Button
              variant={mode === "browser" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("browser")}
            >
              <Globe className="w-4 h-4 ml-1" />
              Web Speech
            </Button>
          )}
          <Button
            variant={mode === "cuda" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("cuda")}
            disabled={!serverConnected}
            title={!serverConnected ? "שרת CUDA לא מחובר" : "תמלול עם Whisper GPU"}
          >
            <Cpu className="w-4 h-4 ml-1" />
            CUDA Whisper
          </Button>
        </div>
      )}

      {/* Live text display */}
      <ScrollArea className="h-[200px] mb-4 rounded-md border p-4 bg-muted/30">
        <div className="text-right whitespace-pre-wrap leading-relaxed">
          {finalText && <span>{finalText}</span>}
          {interimText && (
            <span className="text-muted-foreground opacity-60"> {interimText}</span>
          )}
          {!finalText && !interimText && !isListening && (
            <p className="text-muted-foreground text-center">לחץ על הכפתור כדי להתחיל תמלול בזמן אמת</p>
          )}
          {!finalText && !interimText && isListening && (
            <p className="text-muted-foreground text-center animate-pulse">מחכה לדיבור...</p>
          )}
        </div>
      </ScrollArea>

      {/* Controls */}
      <div className="flex justify-center">
        {!isListening ? (
          <Button onClick={startListening} className="gap-2 rounded-full px-8">
            <Mic className="w-5 h-5" />
            התחל תמלול חי
          </Button>
        ) : (
          <Button onClick={stopListening} variant="destructive" className="gap-2 rounded-full px-8">
            <Square className="w-5 h-5" />
            עצור
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground text-center mt-3">
        {mode === "cuda"
          ? "משתמש ב-Whisper + GPU – תמלול מהיר (כ-1.8 שניות) + refine בעת עצירה"
          : "משתמש ב-Web Speech API – עובד ישירות בדפדפן, ללא מפתח API"
        }
      </p>
    </Card>
  );
};
