import { useState, useRef, useEffect, useCallback, useMemo, memo, forwardRef, useImperativeHandle } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Volume1,
  Rewind, FastForward, RotateCcw, Maximize2, Minimize2,
  AudioLines, Waves, Zap, Download, Link, Unlink,
  ShieldCheck, Mic, SlidersHorizontal, Sparkles, Brain,
  Wind, Radio, Filter, Settings2, ChevronDown, ChevronUp,
  Save, Trash2, AlertTriangle, Scissors,
} from "lucide-react";

export interface WordTiming {
  word: string;
  start: number;
  end: number;
  probability?: number;
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

export interface SyncAudioPlayerRef {
  seekTo: (time: number) => void;
  play: () => void;
  pause: () => void;
}

export interface SpeakerSegmentForWaveform {
  start: number;
  end: number;
  speaker: string;
}

interface SyncAudioPlayerProps {
  audioUrl: string | null;
  wordTimings: WordTiming[];
  currentTime?: number;
  onTimeUpdate?: (time: number) => void;
  onWordClick?: (index: number, timing: WordTiming) => void;
  syncEnabled?: boolean;
  onSyncToggle?: (enabled: boolean) => void;
  compact?: boolean;
  onPlayStateChange?: (playing: boolean) => void;
  speakerSegments?: SpeakerSegmentForWaveform[];
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const QUICK_SPEED_OPTIONS = [0.75, 0.9, 0.95, 1, 1.05, 1.1, 1.25, 1.5];

function clampSpeed(v: number): number {
  return Math.min(2, Math.max(0.5, Number(v.toFixed(2))));
}

type IssueType = 'low-volume' | 'clipping' | 'hiss-risk' | 'hiss';

interface ProblemSegment {
  id: string;
  issueType: IssueType;
  start: number;
  end: number;
  severity: number;
}

interface UserNoisePreset {
  id: string;
  name: string;
  enhancementStrength: number;
  presetId: string;
  manualHighpass: number;
  manualLowpass: number;
  manualVoiceBoost: number;
  manualCompRatio: number;
  manualGate: number;
  humNotchEnabled: boolean;
  humNotchFreq: '50' | '60' | '100' | '120';
}

const USER_PRESETS_KEY = 'sync_audio_user_presets_v1';

function encodeWavFromFloat32(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const numChannels = 1;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export const SyncAudioPlayer = memo(forwardRef<SyncAudioPlayerRef, SyncAudioPlayerProps>(({
  audioUrl,
  wordTimings,
  currentTime: externalTime,
  onTimeUpdate,
  onWordClick,
  syncEnabled: externalSync,
  onSyncToggle,
  compact,
  onPlayStateChange,
  speakerSegments,
}, ref) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const lastDrawTimeRef = useRef<number>(0);

  // Static waveform
  const staticCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [peaksData, setPeaksData] = useState<Float32Array | null>(null);
  const [decodedDuration, setDecodedDuration] = useState<number>(0);
  const staticAnimFrameRef = useRef<number>(0);

  // Speaker color palette
  const SPEAKER_COLORS = useMemo(() => [
    '#6366f1', // indigo
    '#f59e0b', // amber
    '#10b981', // emerald
    '#ef4444', // red
    '#8b5cf6', // violet
    '#06b6d4', // cyan
    '#f97316', // orange
    '#ec4899', // pink
  ], []);

  const speakerColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (!speakerSegments) return map;
    const speakers = [...new Set(speakerSegments.map(s => s.speaker))];
    speakers.forEach((sp, i) => { map[sp] = SPEAKER_COLORS[i % SPEAKER_COLORS.length]; });
    return map;
  }, [speakerSegments, SPEAKER_COLORS]);

  // Audio graph nodes
  const gainNodeRef = useRef<GainNode | null>(null);
  const outputGainRef = useRef<GainNode | null>(null);
  const highpassRef = useRef<BiquadFilterNode | null>(null);
  const lowpassRef = useRef<BiquadFilterNode | null>(null);
  const voiceBoostRef = useRef<BiquadFilterNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const humNotchRef = useRef<BiquadFilterNode | null>(null);
  // Multi-band EQ nodes
  const deSibilanceRef = useRef<BiquadFilterNode | null>(null);
  const deRumbleRef = useRef<BiquadFilterNode | null>(null);
  const presenceRef = useRef<BiquadFilterNode | null>(null);
  const warmthRef = useRef<BiquadFilterNode | null>(null);
  // Equalizer
  const eqCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const eqAnimFrameRef = useRef<number>(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showSpeedControl, setShowSpeedControl] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showEnhance, setShowEnhance] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [outputGain, setOutputGain] = useState(1.0); // 0.0 to 3.0 (multiply)
  const [showEqualizer, setShowEqualizer] = useState(true);
  // 5-band parametric EQ user controls (dB, -12 to +12)
  const [eqBass, setEqBass] = useState(0);
  const [eqLowMid, setEqLowMid] = useState(0);
  const [eqMid, setEqMid] = useState(0);
  const [eqHighMid, setEqHighMid] = useState(0);
  const [eqTreble, setEqTreble] = useState(0);
  const eqBassRef = useRef<BiquadFilterNode | null>(null);
  const eqLowMidRef = useRef<BiquadFilterNode | null>(null);
  const eqMidRef = useRef<BiquadFilterNode | null>(null);
  const eqHighMidRef = useRef<BiquadFilterNode | null>(null);
  const eqTrebleRef = useRef<BiquadFilterNode | null>(null);

  // A-B focused processing (speed + enhancement on selected segment only)
  const [focusEnabled, setFocusEnabled] = useState(false);
  const [focusStart, setFocusStart] = useState(0);
  const [focusEnd, setFocusEnd] = useState(0);
  const [focusLoop, setFocusLoop] = useState(false);

  const hasValidFocusRange = focusEnd > focusStart;
  const isWithinFocusedSegment = !focusEnabled || !hasValidFocusRange
    ? true
    : currentTime >= focusStart && currentTime <= focusEnd;

  // Sync toggle (internal + external)
  const [internalSync, setInternalSync] = useState(true);
  const isSyncEnabled = externalSync !== undefined ? externalSync : internalSync;
  const toggleSync = useCallback(() => {
    const next = !isSyncEnabled;
    setInternalSync(next);
    onSyncToggle?.(next);
  }, [isSyncEnabled, onSyncToggle]);

  // Imperative ref for external control (e.g. from SpeakerDiarization)
  useImperativeHandle(ref, () => ({
    seekTo: (time: number) => {
      if (audioRef.current) {
        audioRef.current.currentTime = time;
        setCurrentTime(time);
        onTimeUpdate?.(time);
      }
    },
    play: () => {
      if (audioRef.current && audioRef.current.paused) {
        initAudioContext();
        if (audioContextRef.current?.state === 'suspended') audioContextRef.current.resume();
        audioRef.current.play();
        setIsPlaying(true);
      }
    },
    pause: () => {
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    },
  }));

  // Notify parent of play state changes
  useEffect(() => { onPlayStateChange?.(isPlaying); }, [isPlaying, onPlayStateChange]);

  // Noise reduction state
  const [presetId, setPresetId] = useState('off');
  const currentPreset = NOISE_PRESETS.find(p => p.id === presetId) || NOISE_PRESETS[0];

  // Advanced manual overrides
  const [manualHighpass, setManualHighpass] = useState(80);
  const [manualLowpass, setManualLowpass] = useState(16000);
  const [manualVoiceBoost, setManualVoiceBoost] = useState(0);
  const [manualGate, setManualGate] = useState(0);
  const [manualCompRatio, setManualCompRatio] = useState(1);
  const [humNotchEnabled, setHumNotchEnabled] = useState(false);
  const [humNotchFreq, setHumNotchFreq] = useState<'50' | '60' | '100' | '120'>('50');
  const isManualMode = presetId === 'manual';
  const [enhancementStrength, setEnhancementStrength] = useState(55);
  const [isBypassEnhancement, setIsBypassEnhancement] = useState(false);
  const [problemSegments, setProblemSegments] = useState<ProblemSegment[]>([]);
  const [userPresets, setUserPresets] = useState<UserNoisePreset[]>([]);
  const [userPresetName, setUserPresetName] = useState('');

  // Current word index for sync
  const currentWordIndex = useMemo(() => {
    if (!isSyncEnabled || !wordTimings.length) return -1;
    for (let i = wordTimings.length - 1; i >= 0; i--) {
      if (currentTime >= wordTimings[i].start) return i;
    }
    return -1;
  }, [currentTime, wordTimings, isSyncEnabled]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(USER_PRESETS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setUserPresets(parsed.filter((p) => p && p.id && p.name));
      }
    } catch {
      // ignore corrupted local data
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(userPresets));
    } catch {
      // localStorage quota/availability issues are non-fatal
    }
  }, [userPresets]);

  const saveCurrentAsUserPreset = useCallback(() => {
    const name = userPresetName.trim();
    if (!name) return;
    const next: UserNoisePreset = {
      id: crypto.randomUUID(),
      name,
      enhancementStrength,
      presetId,
      manualHighpass,
      manualLowpass,
      manualVoiceBoost,
      manualCompRatio,
      manualGate,
      humNotchEnabled,
      humNotchFreq,
    };
    setUserPresets((prev) => [next, ...prev].slice(0, 20));
    setUserPresetName('');
  }, [
    userPresetName,
    enhancementStrength,
    presetId,
    manualHighpass,
    manualLowpass,
    manualVoiceBoost,
    manualCompRatio,
    manualGate,
    humNotchEnabled,
    humNotchFreq,
  ]);

  const applyUserPreset = useCallback((preset: UserNoisePreset) => {
    setEnhancementStrength(preset.enhancementStrength);
    setPresetId(preset.presetId);
    setManualHighpass(preset.manualHighpass);
    setManualLowpass(preset.manualLowpass);
    setManualVoiceBoost(preset.manualVoiceBoost);
    setManualCompRatio(preset.manualCompRatio);
    setManualGate(preset.manualGate);
    setHumNotchEnabled(preset.humNotchEnabled);
    setHumNotchFreq(preset.humNotchFreq);
  }, []);

  const removeUserPreset = useCallback((id: string) => {
    setUserPresets((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const enhancementSettings = useMemo(() => {
    const strength = Math.max(0, Math.min(1, enhancementStrength / 100));
    const lerp = (from: number, to: number) => from + (to - from) * strength;

    const neutral = {
      hp: 20,
      lp: 20000,
      vbGain: 0,
      vbQ: 1,
      cThresh: -50,
      cRatio: 1,
      cKnee: 40,
      cAttack: 0.003,
      cRelease: 0.25,
      deSibilanceGain: 0,
      deRumbleFreq: 20,
      presenceGain: 0,
      warmthGain: 0,
      gateThreshold: 0,
    };

    if (isBypassEnhancement || presetId === 'off') {
      return neutral;
    }

    const p = isManualMode ? null : currentPreset;
    const targetHp = p ? p.highpassFreq : manualHighpass;
    const targetLp = p ? p.lowpassFreq : manualLowpass;
    const targetVbGain = p ? p.voiceBoostGain : manualVoiceBoost;
    const targetVbQ = p ? p.voiceBoostQ : 1;
    const targetThresh = p ? p.compThreshold : -50 + (manualCompRatio > 1 ? -(manualCompRatio * 3) : 0);
    const targetRatio = p ? p.compRatio : manualCompRatio;
    const targetKnee = p ? p.compKnee : 10;
    const targetAttack = p ? p.compAttack : 0.003;
    const targetRelease = p ? p.compRelease : 0.2;

    return {
      hp: lerp(neutral.hp, targetHp),
      lp: lerp(neutral.lp, targetLp),
      vbGain: lerp(neutral.vbGain, targetVbGain),
      vbQ: lerp(neutral.vbQ, targetVbQ),
      cThresh: lerp(neutral.cThresh, targetThresh),
      cRatio: lerp(neutral.cRatio, targetRatio),
      cKnee: lerp(neutral.cKnee, targetKnee),
      cAttack: lerp(neutral.cAttack, targetAttack),
      cRelease: lerp(neutral.cRelease, targetRelease),
      deSibilanceGain: (!isManualMode && p?.deSibilance && strength > 0.25) ? lerp(0, -6) : 0,
      deRumbleFreq: (!isManualMode && p?.deRumble && strength > 0.2) ? lerp(20, 100) : 20,
      presenceGain: (!isManualMode && p?.presenceBoost && strength > 0.35) ? lerp(0, 4) : 0,
      warmthGain: (!isManualMode && p?.warmth && strength > 0.35) ? lerp(0, 3) : 0,
      gateThreshold: p ? lerp(0, p.gateThreshold) : lerp(0, manualGate),
    };
  }, [
    enhancementStrength,
    isBypassEnhancement,
    presetId,
    isManualMode,
    currentPreset,
    manualHighpass,
    manualLowpass,
    manualVoiceBoost,
    manualCompRatio,
    manualGate,
  ]);

  // ─── Initialize Web Audio API ────────────────────────────────
  const initAudioContext = useCallback(() => {
    if (audioContextRef.current || !audioRef.current) return;

    const ctx = new AudioContext();
    audioContextRef.current = ctx;

    const source = ctx.createMediaElementSource(audioRef.current);
    sourceRef.current = source;

    const gain = ctx.createGain();
    gainNodeRef.current = gain;

    // Output gain (post-processing volume boost)
    const outGain = ctx.createGain();
    outGain.gain.value = outputGain;
    outputGainRef.current = outGain;

    // Highpass (rumble cut)
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 80;
    highpass.Q.value = 0.7;
    highpassRef.current = highpass;

    // Lowpass (hiss reduction)
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 20000;
    lowpass.Q.value = 0.7;
    lowpassRef.current = lowpass;

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
    warmth.type = 'lowshelf';
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

    // Hum notch (50/60Hz and harmonics)
    const humNotch = ctx.createBiquadFilter();
    humNotch.type = 'notch';
    humNotch.frequency.value = 50;
    humNotch.Q.value = 8;
    humNotchRef.current = humNotch;

    // 5-band parametric EQ
    const makeEqBand = (freq: number, q: number, gainVal: number) => {
      const f = ctx.createBiquadFilter();
      f.type = 'peaking';
      f.frequency.value = freq;
      f.Q.value = q;
      f.gain.value = gainVal;
      return f;
    };
    const eBass = makeEqBand(80, 0.7, eqBass);
    const eLowMid = makeEqBand(300, 1.0, eqLowMid);
    const eMid = makeEqBand(1000, 1.0, eqMid);
    const eHighMid = makeEqBand(3500, 1.0, eqHighMid);
    const eTreble = makeEqBand(10000, 0.7, eqTreble);
    eqBassRef.current = eBass;
    eqLowMidRef.current = eLowMid;
    eqMidRef.current = eMid;
    eqHighMidRef.current = eHighMid;
    eqTrebleRef.current = eTreble;

    // Analyser
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyserRef.current = analyser;

    // Chain: source → deRumble → highpass → lowpass → humNotch → voiceBoost → deSibilance → presence → warmth → compressor → EQ bands → outputGain → gain → analyser → output
    source.connect(deRumble);
    deRumble.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(humNotch);
    humNotch.connect(voiceBoost);
    voiceBoost.connect(deSibilance);
    deSibilance.connect(presence);
    presence.connect(warmth);
    warmth.connect(compressor);
    compressor.connect(eBass);
    eBass.connect(eLowMid);
    eLowMid.connect(eMid);
    eMid.connect(eHighMid);
    eHighMid.connect(eTreble);
    eTreble.connect(outGain);
    outGain.connect(gain);
    gain.connect(analyser);
    analyser.connect(ctx.destination);
  }, []);

  // ─── Apply preset or manual params ───────────────────────────
  useEffect(() => {
    if (!highpassRef.current) return;

    const processingActive = !focusEnabled || !hasValidFocusRange || isWithinFocusedSegment;
    if (!processingActive) {
      highpassRef.current.frequency.value = 20;
      if (lowpassRef.current) lowpassRef.current.frequency.value = 20000;
      if (voiceBoostRef.current) {
        voiceBoostRef.current.gain.value = 0;
        voiceBoostRef.current.Q.value = 1;
      }
      if (compressorRef.current) {
        compressorRef.current.threshold.value = -50;
        compressorRef.current.ratio.value = 1;
        compressorRef.current.knee.value = 40;
        compressorRef.current.attack.value = 0.003;
        compressorRef.current.release.value = 0.25;
      }
      if (deSibilanceRef.current) deSibilanceRef.current.gain.value = 0;
      if (deRumbleRef.current) deRumbleRef.current.frequency.value = 20;
      if (presenceRef.current) presenceRef.current.gain.value = 0;
      if (warmthRef.current) warmthRef.current.gain.value = 0;
      return;
    }

    highpassRef.current.frequency.value = enhancementSettings.hp;
    if (lowpassRef.current) {
      lowpassRef.current.frequency.value = enhancementSettings.lp;
    }
    if (voiceBoostRef.current) {
      voiceBoostRef.current.gain.value = enhancementSettings.vbGain;
      voiceBoostRef.current.Q.value = enhancementSettings.vbQ;
    }
    if (compressorRef.current) {
      compressorRef.current.threshold.value = enhancementSettings.cThresh;
      compressorRef.current.ratio.value = enhancementSettings.cRatio;
      compressorRef.current.knee.value = enhancementSettings.cKnee;
      compressorRef.current.attack.value = enhancementSettings.cAttack;
      compressorRef.current.release.value = enhancementSettings.cRelease;
    }

    // Multi-band toggles
    if (deSibilanceRef.current) {
      deSibilanceRef.current.gain.value = enhancementSettings.deSibilanceGain;
    }
    if (deRumbleRef.current) {
      deRumbleRef.current.frequency.value = enhancementSettings.deRumbleFreq;
    }
    if (presenceRef.current) {
      presenceRef.current.gain.value = enhancementSettings.presenceGain;
    }
    if (warmthRef.current) {
      warmthRef.current.gain.value = enhancementSettings.warmthGain;
    }
  }, [
    enhancementSettings,
    focusEnabled,
    hasValidFocusRange,
    isWithinFocusedSegment,
  ]);

  useEffect(() => {
    if (!humNotchRef.current) return;
    if (humNotchEnabled && !isBypassEnhancement && enhancementStrength > 10) {
      humNotchRef.current.frequency.value = Number(humNotchFreq);
      humNotchRef.current.Q.value = 10;
    } else {
      humNotchRef.current.frequency.value = 10;
      humNotchRef.current.Q.value = 0.0001;
    }
  }, [humNotchEnabled, humNotchFreq, isBypassEnhancement, enhancementStrength]);

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

    // Gradient background (RTL: right-to-left)
    const isActive = presetId !== 'off';
    const grad = ctx.createLinearGradient(width, 0, 0, 0);
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

    // Waveform line (RTL: right-to-left)
    ctx.lineWidth = 2;
    const gradient = ctx.createLinearGradient(width, 0, 0, 0);
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
    let x = width; // RTL: start drawing from right
    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = (v * height) / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x -= sliceWidth;
    }
    ctx.lineTo(0, height / 2);
    ctx.stroke();

    // Progress overlay (RTL: fills from right)
    if (duration > 0) {
      const progressFraction = currentTime / duration;
      const progressW = progressFraction * width;
      const playheadX = width - progressW;
      ctx.fillStyle = isActive ? 'rgba(34,197,94,0.12)' : 'rgba(99, 102, 241, 0.15)';
      ctx.fillRect(playheadX, 0, progressW, height);

      // Playhead line
      ctx.strokeStyle = isActive ? '#22c55e' : '#6366f1';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();
    }

    animFrameRef.current = requestAnimationFrame((timestamp) => {
      // Throttle to ~15fps (66ms between frames)
      if (timestamp - lastDrawTimeRef.current < 66) {
        animFrameRef.current = requestAnimationFrame(drawWaveform);
        return;
      }
      lastDrawTimeRef.current = timestamp;
      drawWaveform();
    });
  }, [isPlaying, currentTime, duration, presetId]);

  useEffect(() => {
    if (isPlaying && analyserRef.current) {
      drawWaveform();
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, drawWaveform]);

  // ─── Cleanup AudioContext on unmount ─────────────────────────
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, []);

  // ─── Decode audio → peaks for static waveform ───────────────
  useEffect(() => {
    if (!audioUrl) { setPeaksData(null); setDecodedDuration(0); return; }
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(audioUrl);
        if (cancelled) return;
        const arrayBuf = await resp.arrayBuffer();
        if (cancelled) return;
        const offlineCtx = new OfflineAudioContext(1, 1, 44100);
        const decoded = await offlineCtx.decodeAudioData(arrayBuf);
        if (cancelled) return;

        // Use decoded.duration as the authoritative duration (fixes WebM blob issues)
        const realDuration = decoded.duration;
        if (realDuration && isFinite(realDuration) && realDuration > 0) {
          setDuration(realDuration);
          setDecodedDuration(realDuration);
        }

        const raw = decoded.getChannelData(0);
        const BARS = 300;
        const peaks = new Float32Array(BARS);
        const blockSize = Math.floor(raw.length / BARS);
        for (let i = 0; i < BARS; i++) {
          let sum = 0;
          const start = i * blockSize;
          for (let j = start; j < start + blockSize && j < raw.length; j++) {
            sum += Math.abs(raw[j]);
          }
          peaks[i] = sum / blockSize;
        }
        // Normalize to 0-1
        const max = Math.max(...peaks) || 1;
        for (let i = 0; i < BARS; i++) peaks[i] /= max;
        if (!cancelled) setPeaksData(peaks);
      } catch { /* decode not supported for this format */ }
    })();
    return () => { cancelled = true; };
  }, [audioUrl]);

  // Use the best available duration (decoded is most reliable)
  const effectiveDuration = decodedDuration > 0 ? decodedDuration : duration;

  // ─── Draw static waveform with speaker colors + playhead ────
  const drawStaticWaveform = useCallback(() => {
    const canvas = staticCanvasRef.current;
    if (!canvas || !peaksData) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const BARS = peaksData.length;
    const barW = W / BARS;
    const gap = Math.max(1, barW * 0.15);
    const dur = effectiveDuration || 1;

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = 'rgba(241, 245, 249, 0.5)';
    ctx.fillRect(0, 0, W, H);

    for (let i = 0; i < BARS; i++) {
      // RTL: bar 0 = right edge
      const x = W - (i + 1) * barW;
      const barH = Math.max(2, peaksData[i] * (H * 0.85));
      const y = (H - barH) / 2;

      // Determine bar time position for speaker coloring
      const barTimeFraction = i / BARS;
      const barTime = barTimeFraction * dur;

      // Find speaker for this time
      let color = 'rgba(99, 102, 241, 0.6)'; // default indigo
      if (speakerSegments?.length) {
        for (const seg of speakerSegments) {
          if (barTime >= seg.start && barTime <= seg.end) {
            color = speakerColorMap[seg.speaker] || color;
            break;
          }
        }
      }

      // Dim bars after playhead (already played = full, upcoming = dimmed)
      const playFraction = dur > 0 ? currentTime / dur : 0;
      const opacity = barTimeFraction <= playFraction ? 1.0 : 0.35;

      ctx.globalAlpha = opacity;
      ctx.fillStyle = color;
      ctx.fillRect(x + gap / 2, y, barW - gap, barH);
    }
    ctx.globalAlpha = 1.0;

    // Playhead line (thin red line)
    if (dur > 0) {
      const playFraction = currentTime / dur;
      const headX = W - playFraction * W; // RTL
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(headX, 0);
      ctx.lineTo(headX, H);
      ctx.stroke();
    }
  }, [currentTime, effectiveDuration, peaksData, speakerSegments, speakerColorMap]);

  // Redraw static waveform on time/peaks change
  useEffect(() => {
    if (staticAnimFrameRef.current) cancelAnimationFrame(staticAnimFrameRef.current);
    staticAnimFrameRef.current = requestAnimationFrame(drawStaticWaveform);
    return () => { if (staticAnimFrameRef.current) cancelAnimationFrame(staticAnimFrameRef.current); };
  }, [drawStaticWaveform]);

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

    if (focusEnabled && focusLoop && hasValidFocusRange && t >= focusEnd - 0.01) {
      audioRef.current.currentTime = focusStart;
      setCurrentTime(focusStart);
      onTimeUpdate?.(focusStart);
      return;
    }

    setCurrentTime(t);
    onTimeUpdate?.(t);
  }, [onTimeUpdate, focusEnabled, focusLoop, hasValidFocusRange, focusEnd, focusStart]);

  const handleLoadedMetadata = useCallback(() => {
    if (!audioRef.current) return;
    const d = audioRef.current.duration;
    if (d && isFinite(d) && d > 0) setDuration(d);
  }, []);

  // WebM blobs from MediaRecorder often report wrong duration initially
  const handleDurationChange = useCallback(() => {
    if (!audioRef.current) return;
    const d = audioRef.current.duration;
    if (d && isFinite(d) && d > 0) setDuration(d);
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    // Fix duration from actual playback end time
    if (audioRef.current) {
      const t = audioRef.current.currentTime;
      if (t > duration) setDuration(t);
    }
  }, [duration]);

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

  const setPlaybackSpeed = useCallback((next: number) => {
    const clamped = clampSpeed(next);
    setSpeed(clamped);
    if (audioRef.current) {
      const effective = (focusEnabled && hasValidFocusRange && !isWithinFocusedSegment) ? 1 : clamped;
      audioRef.current.playbackRate = effective;
    }
  }, [focusEnabled, hasValidFocusRange, isWithinFocusedSegment]);

  const nudgeSpeed = useCallback((delta: number) => {
    setPlaybackSpeed(speed + delta);
  }, [setPlaybackSpeed, speed]);

  const markFocusStartFromCurrent = useCallback(() => {
    setFocusStart(currentTime);
    if (focusEnd <= currentTime) {
      setFocusEnd(Math.min(effectiveDuration || currentTime + 0.1, currentTime + 10));
    }
  }, [currentTime, focusEnd, effectiveDuration]);

  const markFocusEndFromCurrent = useCallback(() => {
    const nextEnd = Math.max(currentTime, focusStart + 0.1);
    setFocusEnd(nextEnd);
  }, [currentTime, focusStart]);

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

  // ─── Keyboard Shortcuts ──────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't interfere with input/textarea/contenteditable
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft' && e.ctrlKey) {
        e.preventDefault();
        seek(-5);
      } else if (e.code === 'ArrowRight' && e.ctrlKey) {
        e.preventDefault();
        seek(5);
      } else if (e.code === 'ArrowLeft' && e.shiftKey) {
        e.preventDefault();
        jumpToWord('next'); // RTL: left = forward
      } else if (e.code === 'ArrowRight' && e.shiftKey) {
        e.preventDefault();
        jumpToWord('prev'); // RTL: right = backward
      } else if (e.code === 'KeyR' && e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        restart();
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        toggleMute();
      } else if (e.code === 'KeyS' && e.altKey) {
        e.preventDefault();
        cycleSpeed();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [togglePlay, seek, jumpToWord, restart, toggleMute, cycleSpeed]);

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

  const exportFocusedProcessedSegment = useCallback(async () => {
    if (!audioUrl || !hasValidFocusRange || !effectiveDuration) return;

    const startSec = Math.max(0, Math.min(focusStart, effectiveDuration - 0.05));
    const endSec = Math.max(startSec + 0.05, Math.min(focusEnd, effectiveDuration));

    const resp = await fetch(audioUrl);
    const arrayBuf = await resp.arrayBuffer();
    const decodeCtx = new OfflineAudioContext(1, 1, 44100);
    const decoded = await decodeCtx.decodeAudioData(arrayBuf);

    const sampleRate = decoded.sampleRate;
    const startSample = Math.floor(startSec * sampleRate);
    const endSample = Math.min(Math.floor(endSec * sampleRate), decoded.length);
    const length = Math.max(1, endSample - startSample);

    const sourceData = decoded.getChannelData(0).slice(startSample, endSample);
    const segBuffer = new AudioBuffer({ length, sampleRate, numberOfChannels: 1 });
    segBuffer.copyToChannel(sourceData, 0, 0);

    const offline = new OfflineAudioContext(1, length, sampleRate);
    const src = offline.createBufferSource();
    src.buffer = segBuffer;

    const deRumble = offline.createBiquadFilter();
    deRumble.type = 'highpass';
    deRumble.frequency.value = enhancementSettings.deRumbleFreq;
    deRumble.Q.value = 0.8;

    const highpass = offline.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = enhancementSettings.hp;
    highpass.Q.value = 0.7;

    const lowpass = offline.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = enhancementSettings.lp;
    lowpass.Q.value = 0.7;

    const notch = offline.createBiquadFilter();
    notch.type = 'notch';
    if (humNotchEnabled && !isBypassEnhancement && enhancementStrength > 10) {
      notch.frequency.value = Number(humNotchFreq);
      notch.Q.value = 10;
    } else {
      notch.frequency.value = 10;
      notch.Q.value = 0.0001;
    }

    const voice = offline.createBiquadFilter();
    voice.type = 'peaking';
    voice.frequency.value = 3000;
    voice.Q.value = enhancementSettings.vbQ;
    voice.gain.value = enhancementSettings.vbGain;

    const deSibilance = offline.createBiquadFilter();
    deSibilance.type = 'peaking';
    deSibilance.frequency.value = 6500;
    deSibilance.Q.value = 2.5;
    deSibilance.gain.value = enhancementSettings.deSibilanceGain;

    const presence = offline.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = 3200;
    presence.Q.value = 1.2;
    presence.gain.value = enhancementSettings.presenceGain;

    const warmth = offline.createBiquadFilter();
    warmth.type = 'peaking';
    warmth.frequency.value = 260;
    warmth.Q.value = 0.9;
    warmth.gain.value = enhancementSettings.warmthGain;

    const compressor = offline.createDynamicsCompressor();
    compressor.threshold.value = enhancementSettings.cThresh;
    compressor.ratio.value = enhancementSettings.cRatio;
    compressor.knee.value = enhancementSettings.cKnee;
    compressor.attack.value = enhancementSettings.cAttack;
    compressor.release.value = enhancementSettings.cRelease;

    src.connect(deRumble);
    deRumble.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(notch);
    notch.connect(voice);
    voice.connect(deSibilance);
    deSibilance.connect(presence);
    presence.connect(warmth);
    warmth.connect(compressor);
    compressor.connect(offline.destination);

    src.start(0);
    const rendered = await offline.startRendering();
    const wavBuffer = encodeWavFromFloat32(rendered.getChannelData(0), sampleRate);
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `focused-segment-${Math.round(startSec)}-${Math.round(endSec)}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  }, [
    audioUrl,
    hasValidFocusRange,
    effectiveDuration,
    focusStart,
    focusEnd,
    enhancementSettings,
    humNotchEnabled,
    humNotchFreq,
    isBypassEnhancement,
    enhancementStrength,
  ]);

  useEffect(() => {
    if (!peaksData || !effectiveDuration) {
      setProblemSegments([]);
      return;
    }

    const bars = peaksData.length;
    if (!bars) {
      setProblemSegments([]);
      return;
    }

    const found: ProblemSegment[] = [];
    const pushSegment = (issue: IssueType, i: number, severity: number) => {
      const start = (i / bars) * effectiveDuration;
      const end = ((i + 1) / bars) * effectiveDuration;
      const prev = found[found.length - 1];
      if (prev && prev.issueType === issue && start - prev.end < 0.6) {
        prev.end = end;
        prev.severity = Math.max(prev.severity, severity);
        return;
      }
      found.push({
        id: `${issue}-${i}`,
        issueType: issue,
        start,
        end,
        severity,
      });
    };

    for (let i = 1; i < bars - 1; i++) {
      const amp = peaksData[i];
      const roughness = Math.abs(peaksData[i] - peaksData[i - 1]) + Math.abs(peaksData[i] - peaksData[i + 1]);

      if (amp > 0.96) {
        pushSegment('clipping', i, Math.min(1, (amp - 0.96) / 0.04));
      } else if (amp < 0.06) {
        pushSegment('low-volume', i, Math.min(1, (0.06 - amp) / 0.06));
      } else if (amp < 0.35 && roughness > 0.22) {
        pushSegment('hiss', i, Math.min(1, (roughness - 0.22) / 0.5));
      }
    }

    setProblemSegments(found.slice(0, 25));
  }, [peaksData, effectiveDuration]);

  // Volume icon selection
  const VolumeIcon = isMuted ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  useEffect(() => {
    if (effectiveDuration > 0 && focusEnd <= 0) {
      setFocusEnd(effectiveDuration);
    }
  }, [effectiveDuration, focusEnd]);

  useEffect(() => {
    if (!audioRef.current) return;
    const effective = (focusEnabled && hasValidFocusRange && !isWithinFocusedSegment) ? 1 : speed;
    audioRef.current.playbackRate = effective;
  }, [speed, focusEnabled, hasValidFocusRange, isWithinFocusedSegment]);

  if (!audioUrl) {
    if (compact) return null;
    return (
      <Card className="p-8 text-center" dir="rtl">
        <AudioLines className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-semibold mb-2">אין קובץ אודיו</h3>
        <p className="text-muted-foreground text-sm">הקלט או העלה קובץ אודיו כדי להשתמש בנגן הסינכרוני</p>
      </Card>
    );
  }

  const Wrapper = compact ? 'div' as const : Card;
  const wrapperClass = compact
    ? 'p-3 rounded-xl border bg-gradient-to-l from-primary/5 to-transparent space-y-3'
    : `p-4 space-y-3 ${isExpanded ? 'fixed inset-4 z-50 overflow-auto' : ''}`;

  return (
    <TooltipProvider delayDuration={300}>
      <Wrapper className={wrapperClass} dir="rtl">
        {/* Hidden audio element */}
        <audio
          ref={audioRef}
          src={audioUrl}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onDurationChange={handleDurationChange}
          onEnded={handleEnded}
          preload="auto"
          crossOrigin="anonymous"
        />

        {/* ─── Header ─────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {!compact && <Waves className="w-5 h-5 text-primary no-theme-icon" />}
            {!compact && <h3 className="font-semibold text-sm">נגן סינכרוני</h3>}
            {compact && presetId !== 'off' && (
              <Badge className="text-xs gap-1 bg-green-600 hover:bg-green-700">
                <ShieldCheck className="w-3 h-3 no-theme-icon" />
                {currentPreset.nameHe}
              </Badge>
            )}
            {wordTimings.length > 0 && (
              <Badge variant="secondary" className="text-xs">{wordTimings.length} מילים</Badge>
            )}
            {!compact && presetId !== 'off' && (
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

        {/* ─── Static Waveform (peaks + speaker colors + playhead) ── */}
        <canvas
          ref={staticCanvasRef}
          className="w-full rounded-lg cursor-pointer bg-muted/30"
          style={{ height: isExpanded ? 120 : 80 }}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = rect.right - e.clientX; // RTL: right = start
            seekTo((x / rect.width) * effectiveDuration);
          }}
        />

        {/* ─── Live Waveform Canvas (overlay, only when playing) ── */}
        {isPlaying && (
          <canvas
            ref={canvasRef}
            className="w-full rounded-lg cursor-pointer bg-transparent"
            height={isExpanded ? 50 : 32}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = rect.right - e.clientX; // RTL: right = start
              seekTo((x / rect.width) * effectiveDuration);
            }}
          />
        )}

        {/* ─── Speaker Legend ──────────────────────────────── */}
        {speakerSegments && speakerSegments.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-end">
            {Object.entries(speakerColorMap).map(([speaker, color]) => (
              <div key={speaker} className="flex items-center gap-1 text-xs">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
                <span>{speaker}</span>
              </div>
            ))}
          </div>
        )}

        {/* ─── Time Slider ─────────────────────────────────── */}
        <div className="flex items-center gap-3" dir="ltr">
          <span className="text-xs text-muted-foreground font-mono min-w-[40px] text-center">{formatTime(effectiveDuration)}</span>
          <Slider value={[currentTime]} max={effectiveDuration || 1} step={0.1} onValueChange={handleSliderSeek} className="flex-1" dir="rtl" />
          <span className="text-xs text-muted-foreground font-mono min-w-[40px] text-center">{formatTime(currentTime)}</span>
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
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs font-mono min-w-[46px]"
              onClick={() => setShowSpeedControl((v) => !v)}
            >
              {speed.toFixed(2).replace(/\.00$/, '')}x
            </Button>
          </TooltipTrigger><TooltipContent>מהירות ניגון (לחץ לפתיחת סליידר)</TooltipContent></Tooltip>
        </div>

        {/* ─── Speed Control Panel ─────────────────────────── */}
        {showSpeedControl && (
          <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">מהירות ניגון מדויקת</p>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => nudgeSpeed(-0.05)}>-0.05</Button>
                <Badge variant="secondary" className="text-xs font-mono">{speed.toFixed(2)}x</Badge>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => nudgeSpeed(0.05)}>+0.05</Button>
              </div>
            </div>
            <Slider value={[speed]} min={0.5} max={2} step={0.01} onValueChange={([v]) => setPlaybackSpeed(v)} />
            <div className="flex flex-wrap gap-1 justify-end">
              {QUICK_SPEED_OPTIONS.map((opt) => (
                <Button
                  key={opt}
                  variant={Math.abs(speed - opt) < 0.001 ? 'default' : 'outline'}
                  size="sm"
                  className="h-6 px-2 text-[11px] font-mono"
                  onClick={() => setPlaybackSpeed(opt)}
                >
                  {opt}x
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* ─── Focus Segment Controls (A-B) ───────────────── */}
        {!compact && (
          <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-medium">התמקדות בקטע (A-B)</Label>
                <Badge variant="outline" className="text-[10px]">{formatTime(focusStart)} → {formatTime(focusEnd)}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-[11px] text-muted-foreground">לופ</Label>
                <Switch checked={focusLoop} onCheckedChange={setFocusLoop} />
                <Label className="text-[11px] text-muted-foreground">מצב ממוקד</Label>
                <Switch checked={focusEnabled} onCheckedChange={setFocusEnabled} />
              </div>
            </div>

            <Slider
              value={[focusStart, Math.max(focusStart + 0.1, focusEnd)]}
              min={0}
              max={Math.max(1, effectiveDuration || 1)}
              step={0.1}
              onValueChange={([a, b]) => {
                const start = Math.max(0, Math.min(a, b - 0.1));
                const end = Math.max(start + 0.1, b);
                setFocusStart(start);
                setFocusEnd(end);
              }}
            />

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="h-6 px-2" onClick={markFocusStartFromCurrent}>קבע A מהמיקום הנוכחי</Button>
                <Button variant="outline" size="sm" className="h-6 px-2" onClick={markFocusEndFromCurrent}>קבע B מהמיקום הנוכחי</Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2"
                  onClick={exportFocusedProcessedSegment}
                  disabled={!hasValidFocusRange}
                >
                  <Scissors className="w-3 h-3 ml-1 no-theme-icon" />
                  ייצוא קטע מעובד
                </Button>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => seekTo(focusStart)}>נגן מ-A</Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                  onClick={() => {
                    setFocusStart(0);
                    setFocusEnd(Math.max(0.1, effectiveDuration || 1));
                  }}
                >
                  אפס טווח
                </Button>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              כש"מצב ממוקד" פעיל, שינויי מהירות והפחתת רעש חלים רק בתוך הטווח שנבחר.
            </p>

            {problemSegments.length > 0 && (
              <div className="space-y-1 rounded-md border bg-background/70 p-2">
                <p className="text-[11px] font-medium flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-500 no-theme-icon" />
                  קטעים שדורשים תשומת לב ({problemSegments.length})
                </p>
                <div className="max-h-24 overflow-y-auto space-y-1">
                  {problemSegments.slice(0, 8).map((seg) => (
                    <button
                      key={seg.id}
                      type="button"
                      className="w-full text-right text-[11px] rounded border px-2 py-1 hover:bg-muted/60 transition-colors"
                      onClick={() => {
                        setFocusStart(seg.start);
                        setFocusEnd(Math.min(effectiveDuration || seg.end, seg.end + 0.6));
                        seekTo(seg.start);
                      }}
                    >
                      {seg.issueType === 'clipping' ? 'קליפינג' : seg.issueType === 'low-volume' ? 'עוצמה נמוכה' : 'רעש חד'}
                      <span className="mx-1">•</span>
                      {formatTime(seg.start)} - {formatTime(seg.end)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

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
                <div className="flex items-center gap-2">
                  <Label className="text-[11px] text-muted-foreground">השוואת מקור A/B</Label>
                  <Switch checked={isBypassEnhancement} onCheckedChange={setIsBypassEnhancement} />
                  <Badge variant="outline" className="text-xs">
                    {isBypassEnhancement ? 'מקור (Bypass)' : presetId === 'off' ? 'כבוי' : currentPreset.nameHe}
                  </Badge>
                </div>
              </div>

              <div className="space-y-1.5 rounded-lg border bg-muted/20 p-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs">איכות מול בטיחות דיבור</span>
                  <span className="text-xs font-mono tabular-nums">{enhancementStrength}%</span>
                </div>
                <Slider value={[enhancementStrength]} min={0} max={100} step={1} onValueChange={([v]) => setEnhancementStrength(v)} />
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>שומר טבעיות</span>
                  <span>ניקוי אגרסיבי</span>
                </div>
              </div>

              <div className="space-y-1.5 rounded-lg border bg-muted/20 p-2">
                <div className="flex items-center gap-1.5">
                  <Input
                    value={userPresetName}
                    onChange={(e) => setUserPresetName(e.target.value)}
                    placeholder="שם לפריסט אישי"
                    className="h-7 text-xs"
                  />
                  <Button size="sm" className="h-7 px-2 text-xs" onClick={saveCurrentAsUserPreset} disabled={!userPresetName.trim()}>
                    <Save className="w-3 h-3 ml-1 no-theme-icon" />
                    שמור
                  </Button>
                </div>
                {userPresets.length > 0 && (
                  <div className="space-y-1 max-h-24 overflow-y-auto">
                    {userPresets.map((preset) => (
                      <div key={preset.id} className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-[11px] flex-1 justify-start"
                          onClick={() => applyUserPreset(preset)}
                        >
                          {preset.name}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => removeUserPreset(preset.id)}
                          title="מחק פריסט"
                        >
                          <Trash2 className="w-3 h-3 no-theme-icon" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
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
                      <span className="text-xs">חתך היי (Lowpass)</span>
                      <span className="text-xs font-mono tabular-nums">{manualLowpass}Hz</span>
                    </div>
                    <Slider value={[manualLowpass]} min={6000} max={20000} step={250}
                      onValueChange={([v]) => {
                        setManualLowpass(v);
                        if (isManualMode && lowpassRef.current) lowpassRef.current.frequency.value = v;
                      }}
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

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs">סינון זמזום חשמל (Notch)</span>
                      <Switch checked={humNotchEnabled} onCheckedChange={setHumNotchEnabled} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">תדר:</span>
                      <Select value={humNotchFreq} onValueChange={(v) => setHumNotchFreq(v as '50' | '60' | '100' | '120')}>
                        <SelectTrigger className="h-7 w-28 text-xs">
                          <SelectValue placeholder="בחר תדר" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="50">50Hz</SelectItem>
                          <SelectItem value="60">60Hz</SelectItem>
                          <SelectItem value="100">100Hz</SelectItem>
                          <SelectItem value="120">120Hz</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
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

        {/* ─── Keyboard shortcuts hint ──────────────────────── */}
        <p className="text-[10px] text-muted-foreground text-center opacity-60">
          ⌨️ Space=נגן/עצור · Ctrl+←→=±5s · Shift+←→=מילה · M=השתק · Alt+S=מהירות
        </p>
      </Wrapper>
    </TooltipProvider>
  );
}));
