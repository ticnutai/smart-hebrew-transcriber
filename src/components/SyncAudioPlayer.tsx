import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Volume1,
  Rewind, FastForward, RotateCcw, Maximize2, Minimize2,
  AudioLines, Waves, Zap, Download, Link, Unlink,
  ShieldCheck, Mic, SlidersHorizontal, Sparkles, Brain,
  Wind, Radio, Filter, Settings2, ChevronDown, ChevronUp,
} from "lucide-react";

export interface WordTiming {
  word: string;
  start: number;
  end: number;
}

// ─── AI Noise Reduction Presets ───────────────────────────────
interface NoisePreset {
  id: string;
  nameHe: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  // Filter params
  highpassFreq: number;
  lowpassFreq: number;
  voiceBoostGain: number;
  voiceBoostQ: number;
  compThreshold: number;
  compRatio: number;
  compKnee: number;
  compAttack: number;
  compRelease: number;
  // Multi-band EQ
  deSibilance: boolean;   // reduce 6-8kHz
  deRumble: boolean;      // reduce <100Hz
  presenceBoost: boolean; // boost 2-5kHz
  warmth: boolean;        // boost 200-400Hz
  gateThreshold: number;  // noise gate -100 to -20 dB (0=off)
}

const NOISE_PRESETS: NoisePreset[] = [
  {
    id: 'off', nameHe: 'כבוי', icon: VolumeX, description: 'ללא עיבוד',
    highpassFreq: 20, lowpassFreq: 20000, voiceBoostGain: 0, voiceBoostQ: 1,
    compThreshold: -50, compRatio: 1, compKnee: 40, compAttack: 0.003, compRelease: 0.25,
    deSibilance: false, deRumble: false, presenceBoost: false, warmth: false, gateThreshold: 0,
  },
  {
    id: 'light', nameHe: 'קלה', icon: Wind, description: 'הפחתה עדינה — רעש רקע קל',
    highpassFreq: 80, lowpassFreq: 16000, voiceBoostGain: 2, voiceBoostQ: 1,
    compThreshold: -30, compRatio: 3, compKnee: 15, compAttack: 0.005, compRelease: 0.2,
    deSibilance: false, deRumble: true, presenceBoost: false, warmth: false, gateThreshold: -60,
  },
  {
    id: 'medium', nameHe: 'בינונית', icon: Filter, description: 'רעש מאוורר / מזגן',
    highpassFreq: 150, lowpassFreq: 14000, voiceBoostGain: 5, voiceBoostQ: 1.2,
    compThreshold: -28, compRatio: 5, compKnee: 10, compAttack: 0.003, compRelease: 0.2,
    deSibilance: false, deRumble: true, presenceBoost: true, warmth: false, gateThreshold: -45,
  },
  {
    id: 'aggressive', nameHe: 'חזקה', icon: ShieldCheck, description: 'סביבה רועשת מאוד',
    highpassFreq: 200, lowpassFreq: 12000, voiceBoostGain: 8, voiceBoostQ: 1.5,
    compThreshold: -35, compRatio: 8, compKnee: 5, compAttack: 0.002, compRelease: 0.15,
    deSibilance: true, deRumble: true, presenceBoost: true, warmth: true, gateThreshold: -35,
  },
  {
    id: 'ai-voice', nameHe: 'AI קול טהור', icon: Brain, description: 'מיטוב חכם לדיבור עברי',
    highpassFreq: 120, lowpassFreq: 13000, voiceBoostGain: 6, voiceBoostQ: 1.3,
    compThreshold: -32, compRatio: 6, compKnee: 8, compAttack: 0.003, compRelease: 0.18,
    deSibilance: true, deRumble: true, presenceBoost: true, warmth: true, gateThreshold: -40,
  },
  {
    id: 'podcast', nameHe: 'פודקאסט', icon: Radio, description: 'קול חם ומקצועי',
    highpassFreq: 90, lowpassFreq: 15000, voiceBoostGain: 4, voiceBoostQ: 0.8,
    compThreshold: -24, compRatio: 4, compKnee: 12, compAttack: 0.005, compRelease: 0.25,
    deSibilance: true, deRumble: true, presenceBoost: false, warmth: true, gateThreshold: -55,
  },
  {
    id: 'lecture', nameHe: 'הרצאה', icon: Mic, description: 'דיבור באולם / שטח',
    highpassFreq: 160, lowpassFreq: 13000, voiceBoostGain: 7, voiceBoostQ: 1.4,
    compThreshold: -30, compRatio: 6, compKnee: 8, compAttack: 0.003, compRelease: 0.2,
    deSibilance: false, deRumble: true, presenceBoost: true, warmth: false, gateThreshold: -42,
  },
];

interface SyncAudioPlayerProps {
  audioUrl: string | null;
  wordTimings: WordTiming[];
  currentTime?: number;
  onTimeUpdate?: (time: number) => void;
  onWordClick?: (index: number, timing: WordTiming) => void;
  syncEnabled?: boolean;
  onSyncToggle?: (enabled: boolean) => void;
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export const SyncAudioPlayer = ({
  audioUrl,
  wordTimings,
  currentTime: externalTime,
  onTimeUpdate,
  onWordClick,
  syncEnabled: externalSync,
  onSyncToggle,
}: SyncAudioPlayerProps) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  // Audio graph nodes
  const gainNodeRef = useRef<GainNode | null>(null);
  const highpassRef = useRef<BiquadFilterNode | null>(null);
  const voiceBoostRef = useRef<BiquadFilterNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  // Multi-band EQ nodes
  const deSibilanceRef = useRef<BiquadFilterNode | null>(null);
  const deRumbleRef = useRef<BiquadFilterNode | null>(null);
  const presenceRef = useRef<BiquadFilterNode | null>(null);
  const warmthRef = useRef<BiquadFilterNode | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showEnhance, setShowEnhance] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Sync toggle (internal + external)
  const [internalSync, setInternalSync] = useState(true);
  const isSyncEnabled = externalSync !== undefined ? externalSync : internalSync;
  const toggleSync = useCallback(() => {
    const next = !isSyncEnabled;
    setInternalSync(next);
    onSyncToggle?.(next);
  }, [isSyncEnabled, onSyncToggle]);

  // Noise reduction state
  const [presetId, setPresetId] = useState('off');
  const currentPreset = NOISE_PRESETS.find(p => p.id === presetId) || NOISE_PRESETS[0];

  // Advanced manual overrides
  const [manualHighpass, setManualHighpass] = useState(80);
  const [manualVoiceBoost, setManualVoiceBoost] = useState(0);
  const [manualGate, setManualGate] = useState(0);
  const [manualCompRatio, setManualCompRatio] = useState(1);
  const isManualMode = presetId === 'manual';

  // Current word index for sync
  const currentWordIndex = useMemo(() => {
    if (!isSyncEnabled || !wordTimings.length) return -1;
    for (let i = wordTimings.length - 1; i >= 0; i--) {
      if (currentTime >= wordTimings[i].start) return i;
    }
    return -1;
  }, [currentTime, wordTimings, isSyncEnabled]);

  // ─── Initialize Web Audio API ────────────────────────────────
  const initAudioContext = useCallback(() => {
    if (audioContextRef.current || !audioRef.current) return;

    const ctx = new AudioContext();
    audioContextRef.current = ctx;

    const source = ctx.createMediaElementSource(audioRef.current);
    sourceRef.current = source;

    const gain = ctx.createGain();
    gainNodeRef.current = gain;

    // Highpass (rumble cut)
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 80;
    highpass.Q.value = 0.7;
    highpassRef.current = highpass;

    // Voice presence boost (peaking EQ at 3kHz)
    const voiceBoost = ctx.createBiquadFilter();
    voiceBoost.type = 'peaking';
    voiceBoost.frequency.value = 3000;
    voiceBoost.gain.value = 0;
    voiceBoost.Q.value = 1;
    voiceBoostRef.current = voiceBoost;

    // De-sibilance (notch at 7kHz)
    const deSibilance = ctx.createBiquadFilter();
    deSibilance.type = 'peaking';
    deSibilance.frequency.value = 7000;
    deSibilance.gain.value = 0;
    deSibilance.Q.value = 2;
    deSibilanceRef.current = deSibilance;

    // De-rumble (extra steep cut below 100Hz)
    const deRumble = ctx.createBiquadFilter();
    deRumble.type = 'highpass';
    deRumble.frequency.value = 20;
    deRumble.Q.value = 0.5;
    deRumbleRef.current = deRumble;

    // Presence boost (broad peak at 3.5kHz)
    const presence = ctx.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = 3500;
    presence.gain.value = 0;
    presence.Q.value = 0.8;
    presenceRef.current = presence;

    // Warmth boost (200-400Hz shelf)
    const warmth = ctx.createBiquadFilter();
    warmth.type = 'lowShelf';
    warmth.frequency.value = 300;
    warmth.gain.value = 0;
    warmthRef.current = warmth;

    // Compressor
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -50;
    compressor.ratio.value = 1;
    compressor.knee.value = 40;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;
    compressorRef.current = compressor;

    // Analyser
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyserRef.current = analyser;

    // Chain: source → deRumble → highpass → voiceBoost → deSibilance → presence → warmth → compressor → gain → analyser → output
    source.connect(deRumble);
    deRumble.connect(highpass);
    highpass.connect(voiceBoost);
    voiceBoost.connect(deSibilance);
    deSibilance.connect(presence);
    presence.connect(warmth);
    warmth.connect(compressor);
    compressor.connect(gain);
    gain.connect(analyser);
    analyser.connect(ctx.destination);
  }, []);

  // ─── Apply preset or manual params ───────────────────────────
  useEffect(() => {
    if (!highpassRef.current) return;

    const p = isManualMode ? null : currentPreset;
    const hp = p ? p.highpassFreq : manualHighpass;
    const vbGain = p ? p.voiceBoostGain : manualVoiceBoost;
    const vbQ = p ? p.voiceBoostQ : 1;
    const cThresh = p ? p.compThreshold : -50 + (manualCompRatio > 1 ? -(manualCompRatio * 3) : 0);
    const cRatio = p ? p.compRatio : manualCompRatio;
    const cKnee = p ? p.compKnee : 10;
    const cAttack = p ? p.compAttack : 0.003;
    const cRelease = p ? p.compRelease : 0.2;

    highpassRef.current.frequency.value = hp;
    if (voiceBoostRef.current) {
      voiceBoostRef.current.gain.value = vbGain;
      voiceBoostRef.current.Q.value = vbQ;
    }
    if (compressorRef.current) {
      compressorRef.current.threshold.value = cThresh;
      compressorRef.current.ratio.value = cRatio;
      compressorRef.current.knee.value = cKnee;
      compressorRef.current.attack.value = cAttack;
      compressorRef.current.release.value = cRelease;
    }

    // Multi-band toggles
    if (deSibilanceRef.current) {
      deSibilanceRef.current.gain.value = (p?.deSibilance) ? -6 : 0;
    }
    if (deRumbleRef.current) {
      deRumbleRef.current.frequency.value = (p?.deRumble) ? 100 : 20;
    }
    if (presenceRef.current) {
      presenceRef.current.gain.value = (p?.presenceBoost) ? 4 : 0;
    }
    if (warmthRef.current) {
      warmthRef.current.gain.value = (p?.warmth) ? 3 : 0;
    }
  }, [presetId, currentPreset, isManualMode, manualHighpass, manualVoiceBoost, manualGate, manualCompRatio]);

  // ─── Waveform Visualization ──────────────────────────────────
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
    const isActive = presetId !== 'off';
    const grad = ctx.createLinearGradient(0, 0, width, 0);
    if (isActive) {
      grad.addColorStop(0, 'rgba(34, 197, 94, 0.08)');
      grad.addColorStop(0.5, 'rgba(99, 102, 241, 0.08)');
      grad.addColorStop(1, 'rgba(139, 92, 246, 0.08)');
    } else {
      grad.addColorStop(0, 'rgba(99, 102, 241, 0.1)');
      grad.addColorStop(1, 'rgba(139, 92, 246, 0.1)');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Center line
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Waveform line
    ctx.lineWidth = 2;
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    if (isPlaying) {
      gradient.addColorStop(0, isActive ? '#22c55e' : '#6366f1');
      gradient.addColorStop(1, isActive ? '#3b82f6' : '#8b5cf6');
    } else {
      gradient.addColorStop(0, '#94a3b8');
      gradient.addColorStop(1, '#94a3b8');
    }
    ctx.strokeStyle = gradient;
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
      ctx.fillStyle = isActive ? 'rgba(34,197,94,0.12)' : 'rgba(99, 102, 241, 0.15)';
      ctx.fillRect(0, 0, progressX, height);

      // Playhead line
      ctx.strokeStyle = isActive ? '#22c55e' : '#6366f1';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(progressX, 0);
      ctx.lineTo(progressX, height);
      ctx.stroke();
    }

    animFrameRef.current = requestAnimationFrame(drawWaveform);
  }, [isPlaying, currentTime, duration, presetId]);

  useEffect(() => {
    if (isPlaying && analyserRef.current) {
      drawWaveform();
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, drawWaveform]);

  // ─── External time sync ──────────────────────────────────────
  useEffect(() => {
    if (isSyncEnabled && externalTime !== undefined && audioRef.current && Math.abs(audioRef.current.currentTime - externalTime) > 0.2) {
      audioRef.current.currentTime = externalTime;
      setCurrentTime(externalTime);
    }
  }, [externalTime, isSyncEnabled]);

  // ─── Audio event handlers ────────────────────────────────────
  const handleTimeUpdate = useCallback(() => {
    if (!audioRef.current) return;
    const t = audioRef.current.currentTime;
    setCurrentTime(t);
    onTimeUpdate?.(t);
  }, [onTimeUpdate]);

  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current) setDuration(audioRef.current.duration);
  }, []);

  const handleEnded = useCallback(() => setIsPlaying(false), []);

  // ─── Playback controls ──────────────────────────────────────
  const togglePlay = useCallback(() => {
    if (!audioRef.current || !audioUrl) return;
    initAudioContext();
    if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume();
    }
    if (isPlaying) audioRef.current.pause();
    else audioRef.current.play();
    setIsPlaying(!isPlaying);
  }, [isPlaying, audioUrl, initAudioContext]);

  const seek = useCallback((seconds: number) => {
    if (!audioRef.current) return;
    const t = Math.max(0, Math.min(duration, audioRef.current.currentTime + seconds));
    audioRef.current.currentTime = t;
    setCurrentTime(t);
  }, [duration]);

  const seekTo = useCallback((time: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = time;
    setCurrentTime(time);
    onTimeUpdate?.(time);
  }, [onTimeUpdate]);

  const handleSliderSeek = useCallback((value: number[]) => seekTo(value[0]), [seekTo]);

  const handleVolumeChange = useCallback((value: number[]) => {
    const v = value[0];
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
    setIsMuted(v === 0);
  }, []);

  const toggleMute = useCallback(() => {
    if (!audioRef.current) return;
    if (isMuted) { audioRef.current.volume = volume || 0.5; setIsMuted(false); }
    else { audioRef.current.volume = 0; setIsMuted(true); }
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

  const jumpToWord = useCallback((direction: 'prev' | 'next') => {
    if (!wordTimings.length) return;
    const targetIdx = direction === 'next'
      ? Math.min(currentWordIndex + 1, wordTimings.length - 1)
      : Math.max(currentWordIndex - 1, 0);
    seekTo(wordTimings[targetIdx].start);
  }, [wordTimings, currentWordIndex, seekTo]);

  const formatTime = (t: number) => {
    if (!isFinite(t)) return '00:00';
    const m = Math.floor(t / 60).toString().padStart(2, '0');
    const s = Math.floor(t % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleDownload = useCallback(() => {
    if (!audioUrl) return;
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = `recording-${Date.now()}.webm`;
    a.click();
  }, [audioUrl]);

  // Volume icon selection
  const VolumeIcon = isMuted ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  if (!audioUrl) {
    return (
      <Card className="p-8 text-center" dir="rtl">
        <AudioLines className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-semibold mb-2">אין קובץ אודיו</h3>
        <p className="text-muted-foreground text-sm">הקלט או העלה קובץ אודיו כדי להשתמש בנגן הסינכרוני</p>
      </Card>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
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

        {/* ─── Header ─────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Waves className="w-5 h-5 text-primary no-theme-icon" />
            <h3 className="font-semibold text-sm">נגן סינכרוני</h3>
            {wordTimings.length > 0 && (
              <Badge variant="secondary" className="text-xs">{wordTimings.length} מילים</Badge>
            )}
            {presetId !== 'off' && (
              <Badge className="text-xs gap-1 bg-green-600 hover:bg-green-700">
                <ShieldCheck className="w-3 h-3 no-theme-icon" />
                {currentPreset.nameHe}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* Sync toggle */}
            {wordTimings.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={isSyncEnabled ? 'default' : 'ghost'}
                    size="icon"
                    className={`h-7 w-7 ${isSyncEnabled ? 'bg-primary' : ''}`}
                    onClick={toggleSync}
                  >
                    {isSyncEnabled
                      ? <Link className="w-3.5 h-3.5 no-theme-icon" />
                      : <Unlink className="w-3.5 h-3.5 no-theme-icon" />
                    }
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {isSyncEnabled ? 'סינכרון פעיל — לחץ לכיבוי' : 'סינכרון כבוי — לחץ להפעלה'}
                </TooltipContent>
              </Tooltip>
            )}

            {/* Noise reduction toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showEnhance ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setShowEnhance(!showEnhance)}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 no-theme-icon" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">הפחתת רעש ושיפור אודיו</TooltipContent>
            </Tooltip>

            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDownload} title="הורד אודיו">
              <Download className="w-3.5 h-3.5 no-theme-icon" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsExpanded(!isExpanded)}>
              {isExpanded ? <Minimize2 className="w-3.5 h-3.5 no-theme-icon" /> : <Maximize2 className="w-3.5 h-3.5 no-theme-icon" />}
            </Button>
          </div>
        </div>

        {/* ─── Waveform Canvas ─────────────────────────────── */}
        <canvas
          ref={canvasRef}
          className="w-full rounded-lg cursor-pointer bg-muted/30"
          height={isExpanded ? 120 : 64}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            seekTo((x / rect.width) * duration);
          }}
        />

        {/* ─── Time Slider ─────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground font-mono min-w-[40px] text-center">{formatTime(currentTime)}</span>
          <Slider value={[currentTime]} max={duration || 1} step={0.1} onValueChange={handleSliderSeek} className="flex-1" />
          <span className="text-xs text-muted-foreground font-mono min-w-[40px] text-center">{formatTime(duration)}</span>
        </div>

        {/* ─── Main Controls ───────────────────────────────── */}
        <div className="flex items-center justify-center gap-1">
          <Tooltip><TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={restart}><RotateCcw className="w-4 h-4 no-theme-icon" /></Button>
          </TooltipTrigger><TooltipContent>התחל מההתחלה</TooltipContent></Tooltip>

          {wordTimings.length > 0 && isSyncEnabled && (
            <Tooltip><TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => jumpToWord('prev')}><SkipForward className="w-4 h-4 no-theme-icon" /></Button>
            </TooltipTrigger><TooltipContent>מילה קודמת</TooltipContent></Tooltip>
          )}

          <Tooltip><TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => seek(-5)}><FastForward className="w-4 h-4 no-theme-icon" /></Button>
          </TooltipTrigger><TooltipContent>5 שניות אחורה</TooltipContent></Tooltip>

          <Button size="icon" className="h-10 w-10 rounded-full" onClick={togglePlay}>
            {isPlaying ? <Pause className="w-5 h-5 no-theme-icon" /> : <Play className="w-5 h-5 mr-0.5 no-theme-icon" />}
          </Button>

          <Tooltip><TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => seek(5)}><Rewind className="w-4 h-4 no-theme-icon" /></Button>
          </TooltipTrigger><TooltipContent>5 שניות קדימה</TooltipContent></Tooltip>

          {wordTimings.length > 0 && isSyncEnabled && (
            <Tooltip><TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => jumpToWord('next')}><SkipBack className="w-4 h-4 no-theme-icon" /></Button>
            </TooltipTrigger><TooltipContent>מילה הבאה</TooltipContent></Tooltip>
          )}

          <Tooltip><TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs font-mono min-w-[40px]" onClick={cycleSpeed}>{speed}x</Button>
          </TooltipTrigger><TooltipContent>מהירות ניגון</TooltipContent></Tooltip>
        </div>

        {/* ─── Volume ──────────────────────────────────────── */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={toggleMute}>
            <VolumeIcon className="w-3.5 h-3.5 no-theme-icon" />
          </Button>
          <Slider value={[isMuted ? 0 : volume]} max={1} step={0.05} onValueChange={handleVolumeChange} className="w-28" />
          <span className="text-xs text-muted-foreground tabular-nums">{Math.round((isMuted ? 0 : volume) * 100)}%</span>
        </div>

        {/* ─── Noise Reduction / Enhancement Panel ──────────── */}
        {showEnhance && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-green-500 no-theme-icon" />
                  הפחתת רעש חכמה
                </p>
                <Badge variant="outline" className="text-xs">
                  {presetId === 'off' ? 'כבוי' : currentPreset.nameHe}
                </Badge>
              </div>

              {/* Preset Grid */}
              <div className="grid grid-cols-4 gap-1.5">
                {NOISE_PRESETS.map(p => {
                  const Icon = p.icon;
                  const isActive = presetId === p.id;
                  return (
                    <Tooltip key={p.id}>
                      <TooltipTrigger asChild>
                        <button
                          className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg border text-xs transition-all
                            ${isActive ? 'bg-primary text-primary-foreground border-primary shadow-md scale-[1.02]' : 'border-border hover:bg-muted'}
                          `}
                          onClick={() => setPresetId(p.id)}
                        >
                          <Icon className={`w-4 h-4 no-theme-icon ${isActive ? '' : 'text-muted-foreground'}`} />
                          <span className="font-medium leading-tight">{p.nameHe}</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">{p.description}</TooltipContent>
                    </Tooltip>
                  );
                })}

                {/* Manual mode button */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg border text-xs transition-all
                        ${isManualMode ? 'bg-primary text-primary-foreground border-primary shadow-md scale-[1.02]' : 'border-border hover:bg-muted'}
                      `}
                      onClick={() => setPresetId('manual')}
                    >
                      <Settings2 className={`w-4 h-4 no-theme-icon ${isManualMode ? '' : 'text-muted-foreground'}`} />
                      <span className="font-medium leading-tight">ידני</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">שליטה ידנית מלאה</TooltipContent>
                </Tooltip>
              </div>

              {/* Preset active info */}
              {presetId !== 'off' && !isManualMode && (
                <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-2 flex items-start gap-2">
                  <Brain className="w-3.5 h-3.5 mt-0.5 text-green-500 shrink-0 no-theme-icon" />
                  <div>
                    <span className="font-medium">{currentPreset.description}</span>
                    <span className="mx-1">—</span>
                    {currentPreset.deRumble && <Badge variant="outline" className="text-[10px] ml-1">חתך רעש נמוך</Badge>}
                    {currentPreset.deSibilance && <Badge variant="outline" className="text-[10px] ml-1">החלקת שין</Badge>}
                    {currentPreset.presenceBoost && <Badge variant="outline" className="text-[10px] ml-1">חיזוק נוכחות</Badge>}
                    {currentPreset.warmth && <Badge variant="outline" className="text-[10px] ml-1">חמימות</Badge>}
                  </div>
                </div>
              )}

              {/* Advanced / Manual Controls */}
              {(isManualMode || showAdvanced) && (
                <div className="space-y-3 bg-muted/20 rounded-lg p-3 border">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs">חתך בסים (Highpass)</span>
                      <span className="text-xs font-mono tabular-nums">{manualHighpass}Hz</span>
                    </div>
                    <Slider value={[manualHighpass]} min={20} max={400} step={10}
                      onValueChange={([v]) => { setManualHighpass(v); if (isManualMode && highpassRef.current) highpassRef.current.frequency.value = v; }}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs">חיזוק קול</span>
                      <span className="text-xs font-mono tabular-nums">{manualVoiceBoost > 0 ? '+' : ''}{manualVoiceBoost}dB</span>
                    </div>
                    <Slider value={[manualVoiceBoost]} min={0} max={12} step={0.5}
                      onValueChange={([v]) => { setManualVoiceBoost(v); if (isManualMode && voiceBoostRef.current) voiceBoostRef.current.gain.value = v; }}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs">דחיסה (Compression)</span>
                      <span className="text-xs font-mono tabular-nums">{manualCompRatio}:1</span>
                    </div>
                    <Slider value={[manualCompRatio]} min={1} max={12} step={0.5}
                      onValueChange={([v]) => {
                        setManualCompRatio(v);
                        if (isManualMode && compressorRef.current) {
                          compressorRef.current.ratio.value = v;
                          compressorRef.current.threshold.value = -50 + (v > 1 ? -(v * 3) : 0);
                        }
                      }}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs">סף שער רעש (Gate)</span>
                      <span className="text-xs font-mono tabular-nums">{manualGate === 0 ? 'כבוי' : `${manualGate}dB`}</span>
                    </div>
                    <Slider value={[manualGate]} min={-80} max={0} step={5}
                      onValueChange={([v]) => setManualGate(v)}
                    />
                  </div>
                </div>
              )}

              {/* Toggle advanced view for preset mode */}
              {!isManualMode && presetId !== 'off' && (
                <Button variant="ghost" size="sm" className="w-full text-xs gap-1" onClick={() => setShowAdvanced(!showAdvanced)}>
                  {showAdvanced ? <ChevronUp className="w-3 h-3 no-theme-icon" /> : <ChevronDown className="w-3 h-3 no-theme-icon" />}
                  {showAdvanced ? 'הסתר פרטים טכניים' : 'הצג פרטים טכניים'}
                </Button>
              )}

              {/* Show preset params when advanced is open in preset mode */}
              {showAdvanced && !isManualMode && presetId !== 'off' && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-muted-foreground bg-muted/20 rounded-lg p-2 font-mono">
                  <span>Highpass: {currentPreset.highpassFreq}Hz</span>
                  <span>Voice: +{currentPreset.voiceBoostGain}dB</span>
                  <span>Comp: {currentPreset.compRatio}:1 @{currentPreset.compThreshold}dB</span>
                  <span>Gate: {currentPreset.gateThreshold === 0 ? 'Off' : `${currentPreset.gateThreshold}dB`}</span>
                  <span>Attack: {currentPreset.compAttack * 1000}ms</span>
                  <span>Release: {currentPreset.compRelease * 1000}ms</span>
                </div>
              )}
            </div>
          </>
        )}

        {/* ─── Synced Transcript (inline mini view) ─────────── */}
        {wordTimings.length > 0 && isSyncEnabled && (
          <>
            <Separator />
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Zap className="w-3 h-3 no-theme-icon" />
                תמלול מסונכרן — לחץ על מילה לדלג
              </p>
              <div className="flex flex-wrap gap-1 max-h-48 overflow-y-auto p-2 rounded-lg bg-muted/30 text-sm leading-relaxed" dir="rtl">
                {wordTimings.map((wt, i) => (
                  <span
                    key={i}
                    className={`px-1 py-0.5 rounded cursor-pointer transition-all duration-150
                      ${i === currentWordIndex
                        ? 'bg-primary text-primary-foreground font-semibold scale-105 shadow-sm'
                        : i < currentWordIndex ? 'text-muted-foreground' : 'hover:bg-muted'}
                    `}
                    onClick={() => { seekTo(wt.start); onWordClick?.(i, wt); }}
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
    </TooltipProvider>
  );
};
