import { useState, useRef, useCallback, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Mic, Square, Copy, Trash2, Radio, Cpu, Globe, Volume2, Clock, Zap, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type LiveMode = "browser" | "cuda";

const LIVE_CHUNK_MS = 2000;           // 2s chunks for lower latency
const LIVE_RECORDING_TIMESLICE_MS = 150;
const LIVE_MIN_BLOB_BYTES = 800;
const SILENCE_THRESHOLD = 3;          // Skip chunks below this audio level
const MAX_CONSECUTIVE_ERRORS = 5;

interface LiveStats {
  chunksProcessed: number;
  totalLatencyMs: number;
  wordsTranscribed: number;
  errorsCount: number;
  silenceSkips: number;
}

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
  const [isRefining, setIsRefining] = useState(false);

  // CUDA live mode refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const allChunksRef = useRef<Blob[]>([]);
  const headerChunkRef = useRef<Blob | null>(null);
  const processingRef = useRef(false);
  const gpuBusyToastAtRef = useRef(0);
  const consecutiveErrorsRef = useRef(0);

  // Audio level indicator refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const audioLevelRef = useRef(0);

  // Timer & stats
  const startTimeRef = useRef(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [stats, setStats] = useState<LiveStats>({
    chunksProcessed: 0, totalLatencyMs: 0, wordsTranscribed: 0, errorsCount: 0, silenceSkips: 0,
  });
  const scrollRef = useRef<HTMLDivElement>(null);

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

    // Client-side silence skip — don't waste GPU on silence
    if (audioLevelRef.current < SILENCE_THRESHOLD) {
      setStats(prev => ({ ...prev, silenceSkips: prev.silenceSkips + 1 }));
      setInterimText("שקט — ממתין לדיבור...");
      return;
    }

    processingRef.current = true;
    setInterimText("מעבד...");
    const sendStart = performance.now();
    try {
      const formData = new FormData();
      formData.append("file", blob, "chunk.webm");
      formData.append("language", "he");

      const res = await fetch(`${getBaseUrl()}/transcribe-live`, {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(12000),
      });

      if (res.status === 429) {
        chunksRef.current.unshift(blob);
        const now = Date.now();
        if (now - gpuBusyToastAtRef.current > 4000) {
          gpuBusyToastAtRef.current = now;
          toast({ title: "GPU עסוק", description: "ממשיך אוטומטית כשהשרת יתפנה" });
        }
        setInterimText("GPU עסוק — ממתין...");
        return;
      }

      if (res.status === 500) {
        consecutiveErrorsRef.current++;
        if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS) {
          toast({ title: "שגיאות חוזרות", description: "מנותק מהשרת — בדוק את שרת CUDA", variant: "destructive" });
          setInterimText("שגיאה — שרת לא מגיב");
          return;
        }
        chunksRef.current.unshift(blob);
        setStats(prev => ({ ...prev, errorsCount: prev.errorsCount + 1 }));
        return;
      }

      if (res.ok) {
        consecutiveErrorsRef.current = 0;
        const data = await res.json();
        const text = data.text?.trim();
        const latencyMs = Math.round(performance.now() - sendStart);
        const newWords = text ? text.split(/\s+/).length : 0;

        setStats(prev => ({
          ...prev,
          chunksProcessed: prev.chunksProcessed + 1,
          totalLatencyMs: prev.totalLatencyMs + latencyMs,
          wordsTranscribed: prev.wordsTranscribed + newWords,
        }));

        if (text) {
          setFinalText(prev => appendDedupText(prev, text));
          setInterimText("");
          // Auto-scroll
          setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 50);
        } else {
          setInterimText("מאזין...");
        }
      }
    } catch (err) {
      console.error("Live chunk error:", err);
      consecutiveErrorsRef.current++;
      chunksRef.current.unshift(blob);
      setStats(prev => ({ ...prev, errorsCount: prev.errorsCount + 1 }));
      if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS) {
        setInterimText("שרת לא מגיב — בדוק חיבור");
      }
    } finally {
      processingRef.current = false;
    }
  }, [appendDedupText]);

  const runFinalRefinePass = useCallback(async (): Promise<string | null> => {
    if (allChunksRef.current.length === 0) return null;
    setIsRefining(true);
    setInterimText("משפר דיוק — refine pass...");
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
        signal: AbortSignal.timeout(60000),
      });

      if (!res.ok) return null;
      const data = await res.json();
      const refinedText = data.text?.trim();
      if (refinedText) {
        toast({ title: "✅ שופר דיוק", description: `refine הושלם — ${data.wordTimings?.length || '?'} מילים | ${data.processing_time || '?'}s` });
        return refinedText;
      }
      return null;
    } catch {
      toast({ title: "refine נכשל", description: "משתמש בטקסט שנצבר", variant: "destructive" });
      return null;
    } finally {
      setIsRefining(false);
      setInterimText("");
    }
  }, []);

  const startCuda = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      consecutiveErrorsRef.current = 0;
      setStats({ chunksProcessed: 0, totalLatencyMs: 0, wordsTranscribed: 0, errorsCount: 0, silenceSkips: 0 });

      // Recording timer
      startTimeRef.current = Date.now();
      setElapsedSec(0);
      timerIntervalRef.current = setInterval(() => {
        setElapsedSec(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);

      // Audio level monitoring with smoothing
      try {
        const actx = new AudioContext({ sampleRate: 16000 });
        const src = actx.createMediaStreamSource(stream);
        const analyser = actx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.6;
        src.connect(analyser);
        audioCtxRef.current = actx;
        analyserRef.current = analyser;
        const dataArr = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteFrequencyData(dataArr);
          let sum = 0;
          for (let i = 0; i < dataArr.length; i++) sum += dataArr[i];
          const avg = sum / dataArr.length;
          const level = Math.min(100, Math.round((avg / 128) * 100));
          setAudioLevel(level);
          audioLevelRef.current = level;
          animFrameRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        // AudioContext not critical — continue without level indicator
      }

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          // Save the first chunk — it contains the WebM header/init segment.
          // Without it, later chunks are invalid standalone WebM files.
          if (!headerChunkRef.current) {
            headerChunkRef.current = e.data;
          }
          chunksRef.current.push(e.data);
          allChunksRef.current.push(e.data);
        }
      };

      recorder.start(LIVE_RECORDING_TIMESLICE_MS);

      // Send accumulated chunks every LIVE_CHUNK_MS.
      // Always prepend the WebM header chunk so each blob is a valid, standalone file.
      chunkIntervalRef.current = setInterval(() => {
        if (chunksRef.current.length > 0 && !processingRef.current) {
          const parts: Blob[] = [];
          // If the batch doesn't start with the header chunk, prepend it
          if (headerChunkRef.current && chunksRef.current[0] !== headerChunkRef.current) {
            parts.push(headerChunkRef.current);
          }
          parts.push(...chunksRef.current);
          const blob = new Blob(parts, { type: mimeType });
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
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
    audioLevelRef.current = 0;
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
    headerChunkRef.current = null;
    processingRef.current = false;
    consecutiveErrorsRef.current = 0;
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

  // Keyboard shortcut: Space to start/stop (when not typing)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        if (isListening) {
          stopListening();
        } else {
          startListening();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isListening, startListening, stopListening]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const avgLatency = stats.chunksProcessed > 0
    ? Math.round(stats.totalLatencyMs / stats.chunksProcessed)
    : 0;

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
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Radio className={`w-5 h-5 ${isListening ? 'text-red-500 animate-pulse' : 'text-primary'}`} />
          <h3 className="text-lg font-semibold">תמלול בזמן אמת</h3>
          {isListening && (
            <Badge variant="destructive" className="animate-pulse text-xs gap-1">
              <span className="w-2 h-2 rounded-full bg-destructive-foreground" />
              מאזין
            </Badge>
          )}
          {isRefining && (
            <Badge variant="secondary" className="animate-pulse text-xs gap-1">
              <Zap className="w-3 h-3" />
              משפר דיוק...
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Timer */}
          {isListening && mode === "cuda" && (
            <Badge variant="outline" className="text-xs gap-1 font-mono">
              <Clock className="w-3 h-3" />
              {formatTime(elapsedSec)}
            </Badge>
          )}
          {finalText && (
            <>
              <Button variant="ghost" size="sm" onClick={handleCopy} title="העתק">
                <Copy className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={handleClear} title="נקה">
                <Trash2 className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Audio Level Bar + Stats (CUDA only, while listening) */}
      {isListening && mode === "cuda" && (
        <div className="mb-3 space-y-2">
          {/* Waveform-style VU meter */}
          <div className="flex items-center gap-2">
            <Volume2 className={`w-4 h-4 shrink-0 ${audioLevel > 5 ? 'text-green-500' : 'text-muted-foreground'}`} />
            <div className="flex-1 h-3 bg-muted/50 rounded-full overflow-hidden relative">
              <div
                className="h-full rounded-full transition-all duration-100"
                style={{
                  width: `${Math.min(100, audioLevel)}%`,
                  background: audioLevel > 70 ? '#ef4444' : audioLevel > 40 ? '#f59e0b' : '#22c55e',
                }}
              />
            </div>
            <span className="text-xs text-muted-foreground font-mono w-8 text-left">{audioLevel}%</span>
          </div>
          {/* Live stats bar */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            <span>חלקים: {stats.chunksProcessed}</span>
            <span>מילים: {stats.wordsTranscribed}</span>
            {avgLatency > 0 && <span>השהיה: {avgLatency}ms</span>}
            {stats.silenceSkips > 0 && <span>שקט: {stats.silenceSkips}</span>}
            {stats.errorsCount > 0 && (
              <span className="text-orange-500 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                שגיאות: {stats.errorsCount}
              </span>
            )}
          </div>
        </div>
      )}

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
      <ScrollArea className="h-[220px] mb-4 rounded-md border p-4 bg-muted/30" ref={scrollRef}>
        <div className="text-right whitespace-pre-wrap leading-relaxed text-base">
          {finalText && <span>{finalText}</span>}
          {interimText && (
            <span className="text-muted-foreground opacity-60"> {interimText}</span>
          )}
          {!finalText && !interimText && !isListening && (
            <p className="text-muted-foreground text-center">
              לחץ על הכפתור כדי להתחיל תמלול בזמן אמת
              <br />
              <span className="text-xs opacity-60">או לחץ רווח (Space)</span>
            </p>
          )}
          {!finalText && !interimText && isListening && (
            <p className="text-muted-foreground text-center animate-pulse">מחכה לדיבור...</p>
          )}
        </div>
      </ScrollArea>

      {/* Controls */}
      <div className="flex justify-center gap-3">
        {!isListening ? (
          <Button onClick={startListening} className="gap-2 rounded-full px-8 h-12 text-base" disabled={isRefining}>
            <Mic className="w-5 h-5" />
            התחל תמלול חי
          </Button>
        ) : (
          <Button onClick={stopListening} variant="destructive" className="gap-2 rounded-full px-8 h-12 text-base">
            <Square className="w-5 h-5" />
            עצור
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground text-center mt-3">
        {mode === "cuda"
          ? `Whisper + GPU — chunks כל ${LIVE_CHUNK_MS / 1000}s + refine בעצירה | רווח להתחלה/עצירה`
          : "Web Speech API — עובד ישירות בדפדפן, ללא מפתח API"
        }
      </p>
    </Card>
  );
};
