import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Rewind, FastForward, RotateCcw, Maximize2, Minimize2,
  AudioLines, Waves, Zap, Download
} from "lucide-react";

export interface WordTiming {
  word: string;
  start: number; // seconds
  end: number;   // seconds
}

interface SyncAudioPlayerProps {
  audioUrl: string | null;
  wordTimings: WordTiming[];
  currentTime?: number;
  onTimeUpdate?: (time: number) => void;
  onWordClick?: (index: number, timing: WordTiming) => void;
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export const SyncAudioPlayer = ({
  audioUrl,
  wordTimings,
  currentTime: externalTime,
  onTimeUpdate,
  onWordClick,
}: SyncAudioPlayerProps) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  // Audio processing nodes
  const gainNodeRef = useRef<GainNode | null>(null);
  const highpassRef = useRef<BiquadFilterNode | null>(null);
  const lowpassRef = useRef<BiquadFilterNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [isExpanded, setIsExpanded] = useState(false);

  // Audio enhancement state
  const [noiseReduction, setNoiseReduction] = useState(false);
  const [voiceBoost, setVoiceBoost] = useState(false);
  const [compression, setCompression] = useState(false);

  // Current word index for sync
  const currentWordIndex = useMemo(() => {
    if (!wordTimings.length) return -1;
    for (let i = wordTimings.length - 1; i >= 0; i--) {
      if (currentTime >= wordTimings[i].start) return i;
    }
    return -1;
  }, [currentTime, wordTimings]);

  // Initialize Web Audio API for processing
  const initAudioContext = useCallback(() => {
    if (audioContextRef.current || !audioRef.current) return;

    const ctx = new AudioContext();
    audioContextRef.current = ctx;

    const source = ctx.createMediaElementSource(audioRef.current);
    sourceRef.current = source;

    // Create nodes
    const gain = ctx.createGain();
    gainNodeRef.current = gain;

    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 80; // Cut below 80Hz
    highpassRef.current = highpass;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'peaking';
    lowpass.frequency.value = 3000; // Voice presence
    lowpass.gain.value = 0;
    lowpassRef.current = lowpass;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.ratio.value = 4;
    compressor.knee.value = 10;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;
    compressorRef.current = compressor;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyserRef.current = analyser;

    // Chain: source → highpass → voice boost → compressor → gain → analyser → output
    source.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(compressor);
    compressor.connect(gain);
    gain.connect(analyser);
    analyser.connect(ctx.destination);
  }, []);

  // Update audio enhancement parameters
  useEffect(() => {
    if (!highpassRef.current || !lowpassRef.current || !compressorRef.current) return;

    // Noise reduction: raise highpass filter
    highpassRef.current.frequency.value = noiseReduction ? 200 : 80;

    // Voice boost: boost mid frequencies
    lowpassRef.current.gain.value = voiceBoost ? 8 : 0;

    // Compression
    compressorRef.current.threshold.value = compression ? -35 : -24;
    compressorRef.current.ratio.value = compression ? 8 : 4;
  }, [noiseReduction, voiceBoost, compression]);

  // Draw waveform visualization
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);

    ctx.clearRect(0, 0, width, height);

    // Gradient background
    const grad = ctx.createLinearGradient(0, 0, width, 0);
    grad.addColorStop(0, 'rgba(99, 102, 241, 0.1)');
    grad.addColorStop(1, 'rgba(139, 92, 246, 0.1)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Waveform line
    ctx.lineWidth = 2;
    ctx.strokeStyle = isPlaying ? '#6366f1' : '#94a3b8';
    ctx.beginPath();

    const sliceWidth = width / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = (v * height) / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Progress overlay
    if (duration > 0) {
      const progressX = (currentTime / duration) * width;
      ctx.fillStyle = 'rgba(99, 102, 241, 0.15)';
      ctx.fillRect(0, 0, progressX, height);
    }

    animFrameRef.current = requestAnimationFrame(drawWaveform);
  }, [isPlaying, currentTime, duration]);

  // Start/stop visualization
  useEffect(() => {
    if (isPlaying && analyserRef.current) {
      drawWaveform();
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, drawWaveform]);

  // Sync from external time control (e.g., clicking a word in transcript)
  useEffect(() => {
    if (externalTime !== undefined && audioRef.current && Math.abs(audioRef.current.currentTime - externalTime) > 0.2) {
      audioRef.current.currentTime = externalTime;
      setCurrentTime(externalTime);
    }
  }, [externalTime]);

  // Audio event handlers
  const handleTimeUpdate = useCallback(() => {
    if (!audioRef.current) return;
    const t = audioRef.current.currentTime;
    setCurrentTime(t);
    onTimeUpdate?.(t);
  }, [onTimeUpdate]);

  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
  }, []);

  // Playback controls
  const togglePlay = useCallback(() => {
    if (!audioRef.current || !audioUrl) return;
    initAudioContext();
    if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume();
    }
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying, audioUrl, initAudioContext]);

  const seek = useCallback((seconds: number) => {
    if (!audioRef.current) return;
    const newTime = Math.max(0, Math.min(duration, audioRef.current.currentTime + seconds));
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  }, [duration]);

  const seekTo = useCallback((time: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = time;
    setCurrentTime(time);
    onTimeUpdate?.(time);
  }, [onTimeUpdate]);

  const handleSliderSeek = useCallback((value: number[]) => {
    seekTo(value[0]);
  }, [seekTo]);

  const handleVolumeChange = useCallback((value: number[]) => {
    const v = value[0];
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
    setIsMuted(v === 0);
  }, []);

  const toggleMute = useCallback(() => {
    if (!audioRef.current) return;
    if (isMuted) {
      audioRef.current.volume = volume || 0.5;
      setIsMuted(false);
    } else {
      audioRef.current.volume = 0;
      setIsMuted(true);
    }
  }, [isMuted, volume]);

  const cycleSpeed = useCallback(() => {
    const idx = SPEED_OPTIONS.indexOf(speed);
    const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }, [speed]);

  const restart = useCallback(() => {
    seekTo(0);
    if (!isPlaying) togglePlay();
  }, [seekTo, isPlaying, togglePlay]);

  // Jump to prev/next word
  const jumpToWord = useCallback((direction: 'prev' | 'next') => {
    if (!wordTimings.length) return;
    let targetIdx = direction === 'next'
      ? Math.min(currentWordIndex + 1, wordTimings.length - 1)
      : Math.max(currentWordIndex - 1, 0);
    seekTo(wordTimings[targetIdx].start);
  }, [wordTimings, currentWordIndex, seekTo]);

  // Format time
  const formatTime = (t: number) => {
    if (!isFinite(t)) return '00:00';
    const m = Math.floor(t / 60).toString().padStart(2, '0');
    const s = Math.floor(t % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Download audio
  const handleDownload = useCallback(() => {
    if (!audioUrl) return;
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = `recording-${Date.now()}.webm`;
    a.click();
  }, [audioUrl]);

  if (!audioUrl) {
    return (
      <Card className="p-8 text-center" dir="rtl">
        <AudioLines className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-semibold mb-2">אין קובץ אודיו</h3>
        <p className="text-muted-foreground text-sm">
          הקלט או העלה קובץ אודיו כדי להשתמש בנגן הסינכרוני
        </p>
      </Card>
    );
  }

  return (
    <Card className={`p-4 space-y-3 ${isExpanded ? 'fixed inset-4 z-50 overflow-auto' : ''}`} dir="rtl">
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        preload="auto"
        crossOrigin="anonymous"
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Waves className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-sm">נגן סינכרוני</h3>
          {wordTimings.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {wordTimings.length} מילים
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDownload} title="הורד אודיו">
            <Download className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {/* Waveform Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full rounded-lg cursor-pointer bg-muted/30"
        height={isExpanded ? 120 : 64}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const ratio = x / rect.width;
          seekTo(ratio * duration);
        }}
      />

      {/* Time Slider */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground font-mono min-w-[40px] text-center">
          {formatTime(currentTime)}
        </span>
        <Slider
          value={[currentTime]}
          max={duration || 1}
          step={0.1}
          onValueChange={handleSliderSeek}
          className="flex-1"
        />
        <span className="text-xs text-muted-foreground font-mono min-w-[40px] text-center">
          {formatTime(duration)}
        </span>
      </div>

      {/* Main Controls */}
      <div className="flex items-center justify-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={restart} title="התחל מההתחלה">
          <RotateCcw className="w-4 h-4" />
        </Button>

        {wordTimings.length > 0 && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => jumpToWord('prev')} title="מילה קודמת">
            <SkipForward className="w-4 h-4" />
          </Button>
        )}

        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => seek(-5)} title="5 שניות אחורה">
          <FastForward className="w-4 h-4" />
        </Button>

        <Button
          size="icon"
          className="h-10 w-10 rounded-full"
          onClick={togglePlay}
          title={isPlaying ? "עצור" : "נגן"}
        >
          {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 mr-0.5" />}
        </Button>

        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => seek(5)} title="5 שניות קדימה">
          <Rewind className="w-4 h-4" />
        </Button>

        {wordTimings.length > 0 && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => jumpToWord('next')} title="מילה הבאה">
            <SkipBack className="w-4 h-4" />
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs font-mono min-w-[40px]"
          onClick={cycleSpeed}
          title="מהירות ניגון"
        >
          {speed}x
        </Button>
      </div>

      {/* Volume */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={toggleMute}>
          {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
        </Button>
        <Slider
          value={[isMuted ? 0 : volume]}
          max={1}
          step={0.05}
          onValueChange={handleVolumeChange}
          className="w-24"
        />
      </div>

      <Separator />

      {/* Audio Enhancement Controls */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">שיפור אודיו</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="flex items-center gap-2">
            <Switch
              id="noise-reduction"
              checked={noiseReduction}
              onCheckedChange={setNoiseReduction}
            />
            <Label htmlFor="noise-reduction" className="text-xs cursor-pointer">
              הפחתת רעש
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="voice-boost"
              checked={voiceBoost}
              onCheckedChange={setVoiceBoost}
            />
            <Label htmlFor="voice-boost" className="text-xs cursor-pointer">
              חיזוק קול
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="compression"
              checked={compression}
              onCheckedChange={setCompression}
            />
            <Label htmlFor="compression" className="text-xs cursor-pointer">
              דחיסה
            </Label>
          </div>
        </div>
      </div>

      {/* Synced Transcript Words (inline mini view) */}
      {wordTimings.length > 0 && (
        <>
          <Separator />
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Zap className="w-3 h-3" />
              תמלול מסונכרן — לחץ על מילה לדלג
            </p>
            <div
              className="flex flex-wrap gap-1 max-h-48 overflow-y-auto p-2 rounded-lg bg-muted/30 text-sm leading-relaxed"
              dir="rtl"
            >
              {wordTimings.map((wt, i) => (
                <span
                  key={i}
                  className={`
                    px-1 py-0.5 rounded cursor-pointer transition-all duration-150
                    ${i === currentWordIndex
                      ? 'bg-primary text-primary-foreground font-semibold scale-105 shadow-sm'
                      : i < currentWordIndex
                        ? 'text-muted-foreground'
                        : 'hover:bg-muted'
                    }
                  `}
                  onClick={() => {
                    seekTo(wt.start);
                    onWordClick?.(i, wt);
                  }}
                  title={`${formatTime(wt.start)} - ${formatTime(wt.end)}`}
                >
                  {wt.word}
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </Card>
  );
};
