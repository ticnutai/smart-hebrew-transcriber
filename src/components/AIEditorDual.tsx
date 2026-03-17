import { useState, memo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Wand2, Loader2, Sparkles, MessageSquare, BookOpen, FileText,
  Languages, Users, List, Heading, Maximize2, Minimize2,
  CheckCheck, Volume2, AlignJustify, Quote, Cpu, Save, Gauge, Trophy
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { editTranscriptCloud } from "@/utils/editTranscriptApi";
import { useOllama, isOllamaModel, getOllamaModelName } from "@/hooks/useOllama";

interface AIEditorDualProps {
  text: string;
  onTextChange: (text: string, source: string, customPrompt?: string) => void;
  onSaveVersion?: (text: string, source: string, engineLabel: string, actionLabel: string) => void;
}

const CLOUD_MODELS = [
  // Google Gemini
  { value: 'gemini-flash', label: 'Gemini 2.5 Flash', apiModel: 'google/gemini-2.5-flash', local: false },
  { value: 'gemini-pro', label: 'Gemini 2.5 Pro', apiModel: 'google/gemini-2.5-pro', local: false },
  { value: 'gemini-flash-lite', label: 'Gemini Flash Lite', apiModel: 'google/gemini-2.5-flash-lite', local: false },
  { value: 'gemini-3-flash', label: 'Gemini 3 Flash', apiModel: 'google/gemini-3-flash-preview', local: false },
  { value: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro', apiModel: 'google/gemini-3.1-pro-preview', local: false },
  // OpenAI
  { value: 'gpt-5', label: 'GPT-5', apiModel: 'openai/gpt-5', local: false },
  { value: 'gpt-5-mini', label: 'GPT-5 Mini', apiModel: 'openai/gpt-5-mini', local: false },
  { value: 'gpt-5-nano', label: 'GPT-5 Nano', apiModel: 'openai/gpt-5-nano', local: false },
  { value: 'gpt-5.2', label: 'GPT-5.2', apiModel: 'openai/gpt-5.2', local: false },
  { value: 'gpt-4o', label: 'GPT-4o', apiModel: 'openai/gpt-4o', local: false },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini', apiModel: 'openai/gpt-4o-mini', local: false },
  // Anthropic
  { value: 'claude-sonnet', label: 'Claude 3.5 Sonnet', apiModel: 'anthropic/claude-3.5-sonnet', local: false },
  { value: 'claude-haiku', label: 'Claude 3 Haiku', apiModel: 'anthropic/claude-3-haiku', local: false },
  // Cohere
  { value: 'command-r', label: 'Command R', apiModel: 'cohere/command-r', local: false },
  { value: 'aya-expanse-8b', label: 'Aya Expanse 8B', apiModel: 'cohere/aya-expanse-8b', local: false },
  // Meta & Mistral
  { value: 'llama-70b', label: 'Llama 3.1 70B', apiModel: 'meta-llama/llama-3.1-70b-instruct', local: false },
  { value: 'mistral-large', label: 'Mistral Large', apiModel: 'mistralai/mistral-large-latest', local: false },
  // Qwen
  { value: 'qwen2.5-14b', label: 'Qwen 2.5 14B', apiModel: 'qwen/qwen-2.5-14b-instruct', local: false },
  { value: 'qwen2.5-32b', label: 'Qwen 2.5 32B', apiModel: 'qwen/qwen-2.5-32b-instruct', local: false },
  // Hebrew-optimized additions
  { value: 'aya-expanse-32b', label: 'Aya Expanse 32B', apiModel: 'cohere/aya-expanse-32b', local: false },
  { value: 'command-r-plus', label: 'Command R+', apiModel: 'cohere/command-r-plus', local: false },
  { value: 'gemma2-27b', label: 'Gemma 2 27B', apiModel: 'google/gemma-2-27b-it', local: false },
  { value: 'mistral-nemo', label: 'Mistral Nemo 12B', apiModel: 'mistralai/mistral-nemo', local: false },
  { value: 'claude-4-haiku', label: 'Claude 4 Haiku', apiModel: 'anthropic/claude-4-haiku', local: false },
  { value: 'deepseek-v3', label: 'DeepSeek V3', apiModel: 'deepseek/deepseek-chat', local: false },
  { value: 'qwen2.5-72b', label: 'Qwen 2.5 72B', apiModel: 'qwen/qwen-2.5-72b-instruct', local: false },
];

const RECOMMENDED_OLLAMA_MODELS = [
  'aya:8b',
  'aya:35b',
  'qwen2.5:14b',
  'qwen2.5:32b',
  'mistral-nemo:12b',
  'command-r:35b',
  'gemma2:27b',
  'deepseek-v2:16b',
];

type CompareMetrics = {
  latencyMs: number;
  hebrewRatio: number;
  punctuationDensity: number;
  preserveScore: number;
  lengthDrift: number;
  qualityScore: number;
};

type BenchmarkSummary = {
  action: EditAction;
  rounds: number;
  createdAt: string;
  model1Value?: string;
  model2Value?: string;
  model1Label: string;
  model2Label: string;
  model1: {
    avgLatency: number;
    stdLatency: number;
    avgQuality: number;
    stdQuality: number;
    bestQuality: number;
    bestText: string;
  };
  model2: {
    avgLatency: number;
    stdLatency: number;
    avgQuality: number;
    stdQuality: number;
    bestQuality: number;
    bestText: string;
  };
  winner: 1 | 2;
};

const BENCHMARK_HISTORY_KEY = 'ai_benchmark_history_v1';

const ACTION_LABELS: Record<EditAction, string> = {
  improve: 'שפר ניסוח',
  grammar: 'דקדוק ואיות',
  readable: 'זורם לקריאה',
  punctuation: 'פיסוק',
  paragraphs: 'חלוקה לפסקאות',
  bullets: 'נקודות מפתח',
  headings: 'כותרות',
  expand: 'הרחבה',
  shorten: 'קיצור',
  summarize: 'סיכום',
  sources: 'הוספת מקורות',
  translate: 'תרגום',
  speakers: 'זיהוי דוברים',
  tone: 'שינוי טון',
  custom: 'פרומפט מותאם',
};

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr: number[]): number {
  if (arr.length <= 1) return 0;
  const m = avg(arr);
  const variance = avg(arr.map(v => (v - m) ** 2));
  return Math.sqrt(variance);
}

function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function scoreText(source: string, output: string, latencyMs: number): CompareMetrics {
  const src = source.trim();
  const out = output.trim();
  const srcWords = src.split(/\s+/).filter(Boolean);
  const outWords = out.split(/\s+/).filter(Boolean);

  const srcSet = new Set(srcWords.map(w => w.replace(/[^\u0590-\u05FFA-Za-z0-9]/g, '').toLowerCase()).filter(Boolean));
  const outSet = new Set(outWords.map(w => w.replace(/[^\u0590-\u05FFA-Za-z0-9]/g, '').toLowerCase()).filter(Boolean));
  let overlap = 0;
  srcSet.forEach(w => { if (outSet.has(w)) overlap++; });
  const preserveScore = srcSet.size > 0 ? overlap / srcSet.size : 0;

  const hebChars = (out.match(/[\u0590-\u05FF]/g) || []).length;
  const alphaChars = (out.match(/[A-Za-z\u0590-\u05FF]/g) || []).length;
  const hebrewRatio = alphaChars > 0 ? hebChars / alphaChars : 0;

  const punct = (out.match(/[.,!?;:\-—…״"'']/g) || []).length;
  const punctuationDensity = outWords.length > 0 ? punct / outWords.length : 0;

  const srcLen = Math.max(1, src.length);
  const lengthDrift = Math.min(1, Math.abs(out.length - src.length) / srcLen);

  const speedScore = Math.max(0, 1 - (latencyMs / 12000));
  const qualityScore = (
    preserveScore * 0.4 +
    Math.min(1, hebrewRatio) * 0.2 +
    Math.min(1, punctuationDensity * 8) * 0.15 +
    (1 - lengthDrift) * 0.15 +
    speedScore * 0.1
  ) * 100;

  return { latencyMs, hebrewRatio, punctuationDensity, preserveScore, lengthDrift, qualityScore };
}

type EditAction = 'improve' | 'grammar' | 'readable' | 'punctuation' | 'paragraphs' |
  'bullets' | 'headings' | 'expand' | 'shorten' | 'summarize' |
  'sources' | 'translate' | 'speakers' | 'tone' | 'custom';

const TONE_OPTIONS = [
  { value: 'formal', label: 'רשמי' },
  { value: 'personal', label: 'אישי' },
  { value: 'academic', label: 'אקדמי' },
  { value: 'business', label: 'עסקי' },
];

const TRANSLATE_LANGS = [
  { value: 'אנגלית', label: '🇺🇸 עברית ← אנגלית' },
  { value: 'עברית', label: '🇮🇱 אנגלית ← עברית' },
  { value: 'ערבית', label: '🇸🇦 ערבית' },
  { value: 'רוסית', label: '🇷🇺 רוסית' },
  { value: 'צרפתית', label: '🇫🇷 צרפתית' },
  { value: 'ספרדית', label: '🇪🇸 ספרדית' },
  { value: 'גרמנית', label: '🇩🇪 גרמנית' },
];

const AIEditorDualInner = ({ text, onTextChange, onSaveVersion }: AIEditorDualProps) => {
  const [isEditing1, setIsEditing1] = useState(false);
  const [isEditing2, setIsEditing2] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [model1, setModel1] = useState('gemini-flash');
  const [model2, setModel2] = useState('gpt-4o');
  const [result1, setResult1] = useState("");
  const [result2, setResult2] = useState("");
  const [mergedResult, setMergedResult] = useState("");
  const [latency1Ms, setLatency1Ms] = useState<number>(0);
  const [latency2Ms, setLatency2Ms] = useState<number>(0);
  const [isBenchmarking, setIsBenchmarking] = useState(false);
  const [benchmarkRounds, setBenchmarkRounds] = useState<'3' | '5' | '7'>('3');
  const [benchmarkAction, setBenchmarkAction] = useState<EditAction>('improve');
  const [benchmarkSummary, setBenchmarkSummary] = useState<BenchmarkSummary | null>(null);
  const [benchmarkAutoApplyWinner, setBenchmarkAutoApplyWinner] = useState(false);
  const [benchmarkSaveCloud, setBenchmarkSaveCloud] = useState(true);
  const [benchmarkHistory, setBenchmarkHistory] = useState<BenchmarkSummary[]>(() => {
    try {
      const raw = localStorage.getItem(BENCHMARK_HISTORY_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [historyActionFilter, setHistoryActionFilter] = useState<'all' | EditAction>('all');
  const [historyEngineFilter, setHistoryEngineFilter] = useState<'all' | 'model1' | 'model2'>('all');
  const [historyDateFilter, setHistoryDateFilter] = useState<'all' | '7d' | '30d' | '90d'>('all');
  const [historySearch, setHistorySearch] = useState('');
  const [historySort, setHistorySort] = useState<'newest' | 'oldest' | 'best_quality' | 'best_latency'>('newest');
  const [lastAction, setLastAction] = useState<EditAction | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [showCustomDialog, setShowCustomDialog] = useState(false);
  const ollama = useOllama();

  const installedOllamaNames = new Set(ollama.models.map(m => m.name));
  const missingRecommended = RECOMMENDED_OLLAMA_MODELS.filter(m => !installedOllamaNames.has(m));

  // Build unified model list: cloud + local Ollama models
  const AI_MODELS = [
    ...CLOUD_MODELS,
    ...ollama.models.map(m => ({
      value: `ollama:${m.name}`,
      label: `🖥️ ${m.name}`,
      apiModel: m.name,
      local: true,
    })),
  ];

  const getModelApi = (v: string) => AI_MODELS.find(m => m.value === v)?.apiModel || 'google/gemini-2.5-flash';
  const getModelLabel = (v: string) => AI_MODELS.find(m => m.value === v)?.label || v;

  const runEditOnce = async (
    action: EditAction,
    modelValue: string,
    extra?: { customPrompt?: string; toneStyle?: string; targetLanguage?: string }
  ): Promise<{ text: string; latencyMs: number }> => {
    const startedAt = performance.now();
    let resultText: string;

    if (isOllamaModel(modelValue)) {
      resultText = await ollama.editText({
        text,
        action,
        model: getOllamaModelName(modelValue),
        customPrompt: extra?.customPrompt,
        toneStyle: extra?.toneStyle,
        targetLanguage: extra?.targetLanguage,
      });
    } else {
      resultText = await editTranscriptCloud({
        text,
        action,
        model: getModelApi(modelValue),
        customPrompt: extra?.customPrompt,
        toneStyle: extra?.toneStyle,
        targetLanguage: extra?.targetLanguage,
      });
    }

    return {
      text: resultText,
      latencyMs: Math.round(performance.now() - startedAt),
    };
  };

  const handleEdit = async (
    action: EditAction,
    modelValue: string,
    setLoading: (v: boolean) => void,
    setResult: (v: string) => void,
    setLatency?: (v: number) => void,
    extra?: { customPrompt?: string; toneStyle?: string; targetLanguage?: string }
  ) => {
    if (!text.trim()) {
      toast({ title: "שגיאה", description: "אין טקסט לעריכה", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { text: resultText, latencyMs } = await runEditOnce(action, modelValue, extra);

      if (resultText) {
        setLatency?.(latencyMs);
        setResult(resultText);
        toast({ title: "הצלחה", description: `עריכה עם ${getModelLabel(modelValue)} הושלמה` });
      }
    } catch (error) {
      console.error(`Error editing with ${getModelLabel(modelValue)}:`, error);
      toast({
        title: `שגיאה ב-${getModelLabel(modelValue)}`,
        description: error instanceof Error ? error.message : "שגיאה בעריכה",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const runBoth = (action: EditAction, extra?: { customPrompt?: string; toneStyle?: string; targetLanguage?: string }) => {
    setLastAction(action);
    setMergedResult('');
    handleEdit(action, model1, setIsEditing1, setResult1, setLatency1Ms, extra);
    handleEdit(action, model2, setIsEditing2, setResult2, setLatency2Ms, extra);
  };

  const handleSmartMerge = async () => {
    if (!result1.trim() || !result2.trim()) {
      toast({ title: "חסר תוכן למיזוג", description: "צריך שתי תוצאות כדי לבצע מיזוג חכם", variant: "destructive" });
      return;
    }

    setIsMerging(true);
    try {
      const mergePrompt = [
        "אתה עורך ראשי.",
        "יש שתי גרסאות עריכה לאותו טקסט.",
        "החזר גרסה משולבת אחת בלבד בעברית, נקייה וזורמת, בלי הערות ובלי הסברים.",
        "שמור על דיוק, דקדוק, פיסוק ומבנה פסקאות.",
        "אם יש סתירה — בחר את הניסוח הבהיר והמדויק יותר.",
        "אל תאבד מידע מהותי.",
        "",
        "[מקור]",
        text,
        "",
        "[גרסה 1]",
        result1,
        "",
        "[גרסה 2]",
        result2,
      ].join('\n');

      let merged: string;
      const mergeEngine = isOllamaModel(model1) ? getModelLabel(model1) : getModelLabel(model1);

      if (isOllamaModel(model1)) {
        merged = await ollama.editText({
          text: mergePrompt,
          action: 'custom',
          model: getOllamaModelName(model1),
          customPrompt: 'בצע מיזוג חכם בין שתי גרסאות לטקסט אחד איכותי.',
        });
      } else {
        merged = await editTranscriptCloud({
          text: mergePrompt,
          action: 'custom',
          model: getModelApi(model1),
          customPrompt: 'בצע מיזוג חכם בין שתי גרסאות לטקסט אחד איכותי.',
        });
      }

      setMergedResult(merged);
      toast({ title: 'המיזוג הושלם', description: `בוצע עם ${mergeEngine}` });
    } catch (error) {
      toast({
        title: 'שגיאה במיזוג חכם',
        description: error instanceof Error ? error.message : 'שגיאה לא ידועה',
        variant: 'destructive',
      });
    } finally {
      setIsMerging(false);
    }
  };

  const runBenchmark = async () => {
    if (!text.trim()) {
      toast({ title: "שגיאה", description: "אין טקסט לבנצ'מרק", variant: "destructive" });
      return;
    }
    if (benchmarkAction === 'custom') {
      toast({ title: "לא נתמך", description: "לבנצ'מרק יש לבחור פעולה מובנית ולא פרומפט מותאם", variant: "destructive" });
      return;
    }

    const rounds = Number(benchmarkRounds);
    setIsBenchmarking(true);
    setBenchmarkSummary(null);

    try {
      const m1Latencies: number[] = [];
      const m2Latencies: number[] = [];
      const m1Scores: number[] = [];
      const m2Scores: number[] = [];
      let best1Text = '';
      let best2Text = '';
      let best1Score = -1;
      let best2Score = -1;

      for (let i = 0; i < rounds; i++) {
        const [r1, r2] = await Promise.all([
          runEditOnce(benchmarkAction, model1),
          runEditOnce(benchmarkAction, model2),
        ]);

        const s1 = scoreText(text, r1.text, r1.latencyMs);
        const s2 = scoreText(text, r2.text, r2.latencyMs);

        m1Latencies.push(r1.latencyMs);
        m2Latencies.push(r2.latencyMs);
        m1Scores.push(s1.qualityScore);
        m2Scores.push(s2.qualityScore);

        if (s1.qualityScore > best1Score) {
          best1Score = s1.qualityScore;
          best1Text = r1.text;
        }
        if (s2.qualityScore > best2Score) {
          best2Score = s2.qualityScore;
          best2Text = r2.text;
        }
      }

      const m1AvgQ = avg(m1Scores);
      const m2AvgQ = avg(m2Scores);
      const m1AvgL = avg(m1Latencies);
      const m2AvgL = avg(m2Latencies);

      const winner: 1 | 2 = m1AvgQ === m2AvgQ
        ? (m1AvgL <= m2AvgL ? 1 : 2)
        : (m1AvgQ > m2AvgQ ? 1 : 2);

      const summary: BenchmarkSummary = {
        action: benchmarkAction,
        rounds,
        createdAt: new Date().toISOString(),
        model1Value: model1,
        model2Value: model2,
        model1Label: getModelLabel(model1),
        model2Label: getModelLabel(model2),
        model1: {
          avgLatency: m1AvgL,
          stdLatency: stddev(m1Latencies),
          avgQuality: m1AvgQ,
          stdQuality: stddev(m1Scores),
          bestQuality: Math.max(...m1Scores),
          bestText: best1Text,
        },
        model2: {
          avgLatency: m2AvgL,
          stdLatency: stddev(m2Latencies),
          avgQuality: m2AvgQ,
          stdQuality: stddev(m2Scores),
          bestQuality: Math.max(...m2Scores),
          bestText: best2Text,
        },
        winner,
      };

      setBenchmarkSummary(summary);

      const nextHistory = [summary, ...benchmarkHistory].slice(0, 30);
      setBenchmarkHistory(nextHistory);
      try {
        localStorage.setItem(BENCHMARK_HISTORY_KEY, JSON.stringify(nextHistory));
      } catch {
        // ignore storage quota issues
      }

      if (benchmarkSaveCloud && onSaveVersion) {
        const cloudText = [
          `Benchmark ${ACTION_LABELS[summary.action]} (${summary.rounds} סבבים)`,
          `מנוע 1: ${summary.model1Label}`,
          `מהירות ממוצעת: ${summary.model1.avgLatency.toFixed(0)}ms | איכות: ${summary.model1.avgQuality.toFixed(1)} | יציבות איכות: ${summary.model1.stdQuality.toFixed(2)}`,
          `מנוע 2: ${summary.model2Label}`,
          `מהירות ממוצעת: ${summary.model2.avgLatency.toFixed(0)}ms | איכות: ${summary.model2.avgQuality.toFixed(1)} | יציבות איכות: ${summary.model2.stdQuality.toFixed(2)}`,
          `מנצח: מנוע ${summary.winner} (${summary.winner === 1 ? summary.model1Label : summary.model2Label})`,
        ].join('\n');

        onSaveVersion(cloudText, `ai-${summary.action}`, 'Benchmark', `benchmark-${summary.action}-${summary.rounds}`);
      }

      if (benchmarkAutoApplyWinner) {
        const winnerText = summary.winner === 1 ? summary.model1.bestText : summary.model2.bestText;
        if (winnerText.trim()) {
          onTextChange(winnerText, `ai-${summary.action}`, `Benchmark winner: ${summary.winner === 1 ? summary.model1Label : summary.model2Label}`);
        }
      }

      toast({ title: "Benchmark הושלם", description: `${rounds} סבבים על ${ACTION_LABELS[benchmarkAction]}` });
    } catch (error) {
      toast({
        title: "שגיאה ב-Benchmark",
        description: error instanceof Error ? error.message : "שגיאה לא ידועה",
        variant: "destructive",
      });
    } finally {
      setIsBenchmarking(false);
    }
  };

  const exportBenchmarkJson = () => {
    if (!benchmarkSummary) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadFile(
      `benchmark-${benchmarkSummary.action}-${stamp}.json`,
      JSON.stringify(benchmarkSummary, null, 2),
      'application/json;charset=utf-8'
    );
  };

  const exportBenchmarkCsv = () => {
    if (!benchmarkSummary) return;
    const s = benchmarkSummary;
    const rows = [
      ['metric', 'model_1', 'model_2'],
      ['model_name', s.model1Label, s.model2Label],
      ['avg_latency_ms', s.model1.avgLatency.toFixed(2), s.model2.avgLatency.toFixed(2)],
      ['std_latency_ms', s.model1.stdLatency.toFixed(2), s.model2.stdLatency.toFixed(2)],
      ['avg_quality', s.model1.avgQuality.toFixed(2), s.model2.avgQuality.toFixed(2)],
      ['std_quality', s.model1.stdQuality.toFixed(2), s.model2.stdQuality.toFixed(2)],
      ['best_quality', s.model1.bestQuality.toFixed(2), s.model2.bestQuality.toFixed(2)],
      ['winner', s.winner === 1 ? s.model1Label : s.model2Label, ''],
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadFile(`benchmark-${s.action}-${stamp}.csv`, csv, 'text/csv;charset=utf-8');
  };

  const exportAllHistoryJson = () => {
    if (benchmarkHistory.length === 0) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadFile(
      `benchmark-history-${stamp}.json`,
      JSON.stringify(benchmarkHistory, null, 2),
      'application/json;charset=utf-8'
    );
  };

  const exportAllHistoryCsv = () => {
    if (benchmarkHistory.length === 0) return;
    const rows: string[][] = [
      ['created_at', 'action', 'rounds', 'winner_model', 'model1', 'model1_avg_latency', 'model1_avg_quality', 'model2', 'model2_avg_latency', 'model2_avg_quality'],
      ...benchmarkHistory.map(h => [
        h.createdAt,
        h.action,
        String(h.rounds),
        h.winner === 1 ? h.model1Label : h.model2Label,
        h.model1Label,
        h.model1.avgLatency.toFixed(2),
        h.model1.avgQuality.toFixed(2),
        h.model2Label,
        h.model2.avgLatency.toFixed(2),
        h.model2.avgQuality.toFixed(2),
      ])
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadFile(`benchmark-history-${stamp}.csv`, csv, 'text/csv;charset=utf-8');
  };

  const clearBenchmarkHistory = () => {
    setBenchmarkHistory([]);
    setBenchmarkSummary(null);
    try {
      localStorage.removeItem(BENCHMARK_HISTORY_KEY);
    } catch {
      // ignore storage issues
    }
    toast({ title: 'היסטוריה נוקתה', description: 'כל ריצות ה-Benchmark המקומיות נמחקו' });
  };

  const restoreBenchmarkRun = (historyItem: BenchmarkSummary) => {
    const allowedRounds = ['3', '5', '7'] as const;
    const roundValue = String(historyItem.rounds);
    if ((allowedRounds as readonly string[]).includes(roundValue)) {
      setBenchmarkRounds(roundValue as '3' | '5' | '7');
    }

    setBenchmarkAction(historyItem.action);
    setBenchmarkSummary(historyItem);

    const allModelValues = new Set(AI_MODELS.map(m => m.value));
    const byLabel = (label: string) => AI_MODELS.find(m => m.label === label)?.value;

    const nextModel1 = (historyItem.model1Value && allModelValues.has(historyItem.model1Value))
      ? historyItem.model1Value
      : byLabel(historyItem.model1Label);
    const nextModel2 = (historyItem.model2Value && allModelValues.has(historyItem.model2Value))
      ? historyItem.model2Value
      : byLabel(historyItem.model2Label);

    if (nextModel1) setModel1(nextModel1);
    if (nextModel2) setModel2(nextModel2);

    if (!nextModel1 || !nextModel2) {
      toast({
        title: 'שחזור חלקי',
        description: 'חלק מהמודלים לא זמינים כרגע בסביבה, אך ההגדרות שוחזרו.',
      });
      return;
    }

    toast({
      title: 'ריצה שוחזרה',
      description: `הוחזרו פעולה, סבבים ומודלים: ${historyItem.model1Label} מול ${historyItem.model2Label}`,
    });
  };

  const filteredHistory = benchmarkHistory.filter(h => {
    const createdAt = new Date(h.createdAt).getTime();
    const now = Date.now();
    const maxAgeMs = historyDateFilter === '7d'
      ? 7 * 24 * 60 * 60 * 1000
      : historyDateFilter === '30d'
        ? 30 * 24 * 60 * 60 * 1000
        : historyDateFilter === '90d'
          ? 90 * 24 * 60 * 60 * 1000
          : Number.POSITIVE_INFINITY;
    const dateOk = historyDateFilter === 'all' || (now - createdAt <= maxAgeMs);
    const actionOk = historyActionFilter === 'all' || h.action === historyActionFilter;
    const engineOk = historyEngineFilter === 'all'
      || (historyEngineFilter === 'model1' && h.winner === 1)
      || (historyEngineFilter === 'model2' && h.winner === 2);
    const searchNeedle = historySearch.trim().toLowerCase();
    const searchOk = !searchNeedle
      || ACTION_LABELS[h.action].toLowerCase().includes(searchNeedle)
      || h.model1Label.toLowerCase().includes(searchNeedle)
      || h.model2Label.toLowerCase().includes(searchNeedle)
      || (h.winner === 1 ? h.model1Label : h.model2Label).toLowerCase().includes(searchNeedle);
    return dateOk && actionOk && engineOk && searchOk;
  });

  const sortedFilteredHistory = [...filteredHistory].sort((a, b) => {
    if (historySort === 'oldest') {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    }
    if (historySort === 'best_quality') {
      const qa = Math.max(a.model1.avgQuality, a.model2.avgQuality);
      const qb = Math.max(b.model1.avgQuality, b.model2.avgQuality);
      return qb - qa;
    }
    if (historySort === 'best_latency') {
      const la = Math.min(a.model1.avgLatency, a.model2.avgLatency);
      const lb = Math.min(b.model1.avgLatency, b.model2.avgLatency);
      return la - lb;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const leaderboard = (() => {
    const agg = new Map<string, { wins: number; count: number; avgQualitySum: number; avgLatencySum: number }>();
    sortedFilteredHistory.forEach(h => {
      const add = (label: string, quality: number, latency: number, win: boolean) => {
        const cur = agg.get(label) || { wins: 0, count: 0, avgQualitySum: 0, avgLatencySum: 0 };
        cur.count += 1;
        cur.avgQualitySum += quality;
        cur.avgLatencySum += latency;
        if (win) cur.wins += 1;
        agg.set(label, cur);
      };
      add(h.model1Label, h.model1.avgQuality, h.model1.avgLatency, h.winner === 1);
      add(h.model2Label, h.model2.avgQuality, h.model2.avgLatency, h.winner === 2);
    });

    return Array.from(agg.entries())
      .map(([label, v]) => ({
        label,
        wins: v.wins,
        count: v.count,
        winRate: v.count > 0 ? (v.wins / v.count) * 100 : 0,
        avgQuality: v.count > 0 ? v.avgQualitySum / v.count : 0,
        avgLatency: v.count > 0 ? v.avgLatencySum / v.count : 0,
      }))
      .sort((a, b) => b.winRate - a.winRate || b.avgQuality - a.avgQuality)
      .slice(0, 8);
  })();

  const historyChartData = [...sortedFilteredHistory]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(-10);

  const qualityPoints = historyChartData.map((h, i) => {
    const x = (i / Math.max(1, historyChartData.length - 1)) * 100;
    const y = 100 - Math.max(h.model1.avgQuality, h.model2.avgQuality);
    return `${x},${y}`;
  }).join(' ');

  const latencyPoints = historyChartData.map((h, i) => {
    const x = (i / Math.max(1, historyChartData.length - 1)) * 100;
    const bestLatency = Math.min(h.model1.avgLatency, h.model2.avgLatency);
    const normalized = Math.min(100, (bestLatency / 12000) * 100);
    const y = normalized;
    return `${x},${y}`;
  }).join(' ');

  const isLoading = isEditing1 || isEditing2 || isMerging;
  const noText = !text.trim();
  const metrics1 = result1 ? scoreText(text, result1, latency1Ms) : null;
  const metrics2 = result2 ? scoreText(text, result2, latency2Ms) : null;
  const winner = metrics1 && metrics2
    ? (metrics1.qualityScore >= metrics2.qualityScore ? 1 : 2)
    : null;

  const ActionBtn = ({ action, label, icon: Icon }: { action: EditAction; label: string; icon: React.ElementType }) => (
    <Button
      variant={lastAction === action ? "default" : "secondary"}
      size="sm"
      onClick={() => runBoth(action)}
      disabled={isLoading || noText}
      className="text-xs"
    >
      <Icon className="w-3 h-3 ml-1" />
      {label}
    </Button>
  );

  const EnginePanel = ({
    num, modelValue, setModelValue, isEditingState, result, onApply, onSave
  }: {
    num: number;
    modelValue: string;
    setModelValue: (v: string) => void;
    isEditingState: boolean;
    result: string;
    onApply: () => void;
    onSave: () => void;
  }) => (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">מנוע {num}</Label>
        <Select value={modelValue} onValueChange={setModelValue}>
          <SelectTrigger className="w-[200px] text-xs" dir="rtl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent dir="rtl">
            <SelectItem disabled value="_cloud_header" className="text-xs font-semibold text-muted-foreground">☁️ ענן</SelectItem>
            {CLOUD_MODELS.map(m => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
            {ollama.models.length > 0 && (
              <>
                <SelectItem disabled value="_local_header" className="text-xs font-semibold text-muted-foreground">🖥️ מקומי (Ollama)</SelectItem>
                {ollama.models.map(m => (
                  <SelectItem key={`ollama:${m.name}`} value={`ollama:${m.name}`}>🖥️ {m.name}</SelectItem>
                ))}
              </>
            )}
          </SelectContent>
        </Select>
      </div>

      {isEditingState && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />
          מעבד עם {getModelLabel(modelValue)}...
        </div>
      )}

      {result && !isEditingState && (
        <>
          <Textarea
            value={result}
            readOnly
            className="min-h-[200px] text-right bg-accent/10"
            dir="rtl"
            style={{ fontFamily: 'inherit', fontSize: 'inherit', lineHeight: 'inherit' }}
          />
          <Button size="sm" onClick={onApply} className="w-full">
            החלף בטקסט הראשי
          </Button>
          {onSaveVersion && (
            <Button size="sm" variant="outline" onClick={onSave} className="w-full">
              <Save className="w-3 h-3 ml-1" />
              שמור גרסה
            </Button>
          )}
        </>
      )}
    </div>
  );

  return (
    <Card className="p-6" dir="rtl">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-semibold">עריכה עם AI — השוואת מנועים</h2>
        <Badge variant="secondary" className="text-xs">{AI_MODELS.length} מודלים</Badge>
        {ollama.isConnected && (
          <Badge variant="outline" className="text-xs text-green-600 border-green-300">
            <Cpu className="w-3 h-3 ml-1" />
            Ollama ({ollama.models.length})
          </Badge>
        )}
      </div>

      {missingRecommended.length > 0 && ollama.isConnected && (
        <div className="mb-4 rounded-lg border p-3 bg-muted/20">
          <div className="flex items-center justify-between gap-2 mb-2">
            <Label className="text-sm font-semibold">מנועים מומלצים לעברית שעדיין לא מותקנים</Label>
            <Badge variant="outline" className="text-xs">{missingRecommended.length} חסרים</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {missingRecommended.map(m => (
              <Button
                key={m}
                size="sm"
                variant="outline"
                disabled={ollama.isPulling}
                onClick={async () => {
                  try {
                    await ollama.pullModel(m);
                    toast({ title: 'הורדה הושלמה', description: `${m} מוכן לשימוש` });
                  } catch (e) {
                    toast({ title: 'שגיאה בהורדה', description: e instanceof Error ? e.message : 'שגיאה', variant: 'destructive' });
                  }
                }}
              >
                {ollama.isPulling ? <Loader2 className="w-3 h-3 animate-spin ml-1" /> : <Cpu className="w-3 h-3 ml-1" />}
                התקן {m}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons - Categorized */}
      <div className="space-y-3 mb-6 p-4 bg-muted/30 rounded-lg">
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">ניסוח ושפה</Label>
          <div className="flex flex-wrap gap-1.5">
            <ActionBtn action="improve" label="שפר ניסוח" icon={Wand2} />
            <ActionBtn action="grammar" label="דקדוק ואיות" icon={CheckCheck} />
            <ActionBtn action="punctuation" label="פיסוק" icon={Quote} />
            <ActionBtn action="readable" label="זורם לקריאה" icon={BookOpen} />
          </div>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">מבנה</Label>
          <div className="flex flex-wrap gap-1.5">
            <ActionBtn action="paragraphs" label="חלק לפסקאות" icon={AlignJustify} />
            <ActionBtn action="headings" label="כותרות" icon={Heading} />
            <ActionBtn action="bullets" label="נקודות מפתח" icon={List} />
          </div>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">אורך</Label>
          <div className="flex flex-wrap gap-1.5">
            <ActionBtn action="expand" label="הרחב" icon={Maximize2} />
            <ActionBtn action="shorten" label="קצר" icon={Minimize2} />
            <ActionBtn action="summarize" label="סכם" icon={FileText} />
          </div>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">מיוחד</Label>
          <div className="flex flex-wrap gap-1.5">
            <ActionBtn action="sources" label="הוסף מקורות" icon={FileText} />
            <ActionBtn action="speakers" label="זהה דוברים" icon={Users} />

            {/* Translate with language picker */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={lastAction === 'translate' ? "default" : "secondary"}
                  size="sm"
                  disabled={isLoading || noText}
                  className="text-xs"
                >
                  <Languages className="w-3 h-3 ml-1" />
                  תרגם
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-52 p-2" dir="rtl">
                <Label className="text-xs font-semibold mb-2 block">שפת יעד:</Label>
                <div className="space-y-0.5">
                  {TRANSLATE_LANGS.map(lang => (
                    <Button
                      key={lang.value}
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-xs"
                      onClick={() => runBoth('translate', { targetLanguage: lang.value })}
                    >
                      {lang.label}
                    </Button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            {/* Tone with style picker */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={lastAction === 'tone' ? "default" : "secondary"}
                  size="sm"
                  disabled={isLoading || noText}
                  className="text-xs"
                >
                  <Volume2 className="w-3 h-3 ml-1" />
                  שנה טון
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-36 p-2" dir="rtl">
                <Label className="text-xs font-semibold mb-2 block">בחר טון:</Label>
                <div className="space-y-0.5">
                  {TONE_OPTIONS.map(tone => (
                    <Button
                      key={tone.value}
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-xs"
                      onClick={() => runBoth('tone', { toneStyle: tone.value })}
                    >
                      {tone.label}
                    </Button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Custom Prompt */}
        <div className="pt-2 border-t">
          <Dialog open={showCustomDialog} onOpenChange={setShowCustomDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={isLoading || noText}>
                <MessageSquare className="w-3 h-3 ml-1" />
                פרומפט מותאם
              </Button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle>פרומפט מותאם — יופעל על שני המנועים</DialogTitle>
              </DialogHeader>
              <Textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="הזן הוראות מותאמות למנוע ה-AI..."
                className="min-h-[100px] text-right"
                dir="rtl"
              />
              <Button
                onClick={() => {
                  if (!customPrompt.trim()) return;
                  runBoth('custom', { customPrompt });
                  setShowCustomDialog(false);
                }}
                disabled={isLoading || !customPrompt.trim()}
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
                בצע עריכה
              </Button>
            </DialogContent>
          </Dialog>

          <Button
            variant="outline"
            size="sm"
            className="mr-2"
            onClick={handleSmartMerge}
            disabled={isLoading || !result1.trim() || !result2.trim()}
          >
            {isMerging ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Sparkles className="w-3 h-3 ml-1" />}
            מיזוג חכם (שתי תוצאות)
          </Button>

          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="mr-2"
                disabled={!metrics1 || !metrics2 || isLoading}
              >
                <Gauge className="w-3 h-3 ml-1" />
                דיאלוג השוואה מעמיק
              </Button>
            </DialogTrigger>
            <DialogContent dir="rtl" className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>השוואת מנועים: מהירות, דיוק ואיכות</DialogTitle>
              </DialogHeader>
              {metrics1 && metrics2 && (
                <div className="space-y-3">
                  {winner && (
                    <div className="rounded-md border p-2 bg-muted/20 text-sm flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-amber-500" />
                      מנצח לפי ציון איכות משוקלל: מנוע {winner} ({winner === 1 ? getModelLabel(model1) : getModelLabel(model2)})
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-md border p-3 space-y-1">
                      <div className="font-semibold text-sm">מנוע 1: {getModelLabel(model1)}</div>
                      <div className="text-xs">מהירות: {metrics1.latencyMs}ms</div>
                      <div className="text-xs">שימור משמעות: {(metrics1.preserveScore * 100).toFixed(1)}%</div>
                      <div className="text-xs">עברית בטקסט: {(metrics1.hebrewRatio * 100).toFixed(1)}%</div>
                      <div className="text-xs">צפיפות פיסוק: {(metrics1.punctuationDensity * 100).toFixed(1)}%</div>
                      <div className="text-xs">סטיית אורך: {(metrics1.lengthDrift * 100).toFixed(1)}%</div>
                      <div className="font-semibold text-sm">ציון כולל: {metrics1.qualityScore.toFixed(1)}</div>
                    </div>
                    <div className="rounded-md border p-3 space-y-1">
                      <div className="font-semibold text-sm">מנוע 2: {getModelLabel(model2)}</div>
                      <div className="text-xs">מהירות: {metrics2.latencyMs}ms</div>
                      <div className="text-xs">שימור משמעות: {(metrics2.preserveScore * 100).toFixed(1)}%</div>
                      <div className="text-xs">עברית בטקסט: {(metrics2.hebrewRatio * 100).toFixed(1)}%</div>
                      <div className="text-xs">צפיפות פיסוק: {(metrics2.punctuationDensity * 100).toFixed(1)}%</div>
                      <div className="text-xs">סטיית אורך: {(metrics2.lengthDrift * 100).toFixed(1)}%</div>
                      <div className="font-semibold text-sm">ציון כולל: {metrics2.qualityScore.toFixed(1)}</div>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    הערה: זהו ציון השוואתי אוטומטי המבוסס על מהירות, שימור משמעות, יחס עברית, פיסוק וסטיית אורך. להכרעה סופית מומלץ גם review אנושי.
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="mr-2"
                disabled={isLoading || noText}
              >
                <Trophy className="w-3 h-3 ml-1" />
                Benchmark רב-סבבים
              </Button>
            </DialogTrigger>
            <DialogContent dir="rtl" className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Benchmark עמוק: מהירות, איכות ויציבות</DialogTitle>
              </DialogHeader>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">פעולה לבדיקה</Label>
                  <Select value={benchmarkAction} onValueChange={(v) => setBenchmarkAction(v as EditAction)}>
                    <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent dir="rtl">
                      <SelectItem value="improve">שפר ניסוח</SelectItem>
                      <SelectItem value="grammar">דקדוק ואיות</SelectItem>
                      <SelectItem value="punctuation">פיסוק</SelectItem>
                      <SelectItem value="readable">זורם לקריאה</SelectItem>
                      <SelectItem value="paragraphs">חלוקה לפסקאות</SelectItem>
                      <SelectItem value="headings">כותרות</SelectItem>
                      <SelectItem value="bullets">נקודות מפתח</SelectItem>
                      <SelectItem value="expand">הרחבה</SelectItem>
                      <SelectItem value="shorten">קיצור</SelectItem>
                      <SelectItem value="summarize">סיכום</SelectItem>
                      <SelectItem value="sources">הוספת מקורות</SelectItem>
                      <SelectItem value="speakers">זיהוי דוברים</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">כמות סבבים</Label>
                  <Select value={benchmarkRounds} onValueChange={(v) => setBenchmarkRounds(v as '3' | '5' | '7')}>
                    <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent dir="rtl">
                      <SelectItem value="3">3 סבבים (מהיר)</SelectItem>
                      <SelectItem value="5">5 סבבים (מומלץ)</SelectItem>
                      <SelectItem value="7">7 סבבים (עמוק)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1 flex items-end">
                  <Button className="w-full" onClick={runBenchmark} disabled={isBenchmarking || isLoading}>
                    {isBenchmarking ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Gauge className="w-4 h-4 ml-1" />}
                    הרץ Benchmark
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <Button
                  variant={benchmarkAutoApplyWinner ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setBenchmarkAutoApplyWinner(v => !v)}
                >
                  {benchmarkAutoApplyWinner ? 'מופעל: החלה אוטומטית של מנצח' : 'כבוי: החלה אוטומטית של מנצח'}
                </Button>
                <Button
                  variant={benchmarkSaveCloud ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setBenchmarkSaveCloud(v => !v)}
                >
                  {benchmarkSaveCloud ? 'מופעל: שמירת היסטוריה בענן' : 'כבוי: שמירת היסטוריה בענן'}
                </Button>
              </div>

              {benchmarkSummary && (
                <div className="space-y-3 mt-2">
                  <div className="rounded-md border p-2 bg-muted/20 text-sm flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-amber-500" />
                    מנצח Benchmark ({ACTION_LABELS[benchmarkSummary.action]}, {benchmarkSummary.rounds} סבבים):
                    מנוע {benchmarkSummary.winner} ({benchmarkSummary.winner === 1 ? benchmarkSummary.model1Label : benchmarkSummary.model2Label})
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-md border p-3 space-y-1">
                      <div className="font-semibold text-sm">מנוע 1: {benchmarkSummary.model1Label}</div>
                      <div className="text-xs">מהירות ממוצעת: {benchmarkSummary.model1.avgLatency.toFixed(0)}ms</div>
                      <div className="text-xs">יציבות מהירות (סטיית תקן): {benchmarkSummary.model1.stdLatency.toFixed(1)}ms</div>
                      <div className="text-xs">איכות ממוצעת: {benchmarkSummary.model1.avgQuality.toFixed(1)}</div>
                      <div className="text-xs">יציבות איכות (סטיית תקן): {benchmarkSummary.model1.stdQuality.toFixed(2)}</div>
                      <div className="text-xs">איכות שיא: {benchmarkSummary.model1.bestQuality.toFixed(1)}</div>
                    </div>

                    <div className="rounded-md border p-3 space-y-1">
                      <div className="font-semibold text-sm">מנוע 2: {benchmarkSummary.model2Label}</div>
                      <div className="text-xs">מהירות ממוצעת: {benchmarkSummary.model2.avgLatency.toFixed(0)}ms</div>
                      <div className="text-xs">יציבות מהירות (סטיית תקן): {benchmarkSummary.model2.stdLatency.toFixed(1)}ms</div>
                      <div className="text-xs">איכות ממוצעת: {benchmarkSummary.model2.avgQuality.toFixed(1)}</div>
                      <div className="text-xs">יציבות איכות (סטיית תקן): {benchmarkSummary.model2.stdQuality.toFixed(2)}</div>
                      <div className="text-xs">איכות שיא: {benchmarkSummary.model2.bestQuality.toFixed(1)}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" onClick={exportBenchmarkJson}>
                      ייצוא JSON
                    </Button>
                    <Button variant="outline" size="sm" onClick={exportBenchmarkCsv}>
                      ייצוא CSV
                    </Button>
                  </div>

                  {benchmarkHistory.length > 0 && (
                    <div className="rounded-md border p-2 text-xs space-y-2">
                      <div className="font-semibold">היסטוריית Benchmark</div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <Select value={historyActionFilter} onValueChange={(v) => setHistoryActionFilter(v as 'all' | EditAction)}>
                          <SelectTrigger className="text-xs"><SelectValue placeholder="סנן לפי פעולה" /></SelectTrigger>
                          <SelectContent dir="rtl">
                            <SelectItem value="all">כל הפעולות</SelectItem>
                            <SelectItem value="improve">שפר ניסוח</SelectItem>
                            <SelectItem value="grammar">דקדוק ואיות</SelectItem>
                            <SelectItem value="punctuation">פיסוק</SelectItem>
                            <SelectItem value="readable">זורם לקריאה</SelectItem>
                            <SelectItem value="paragraphs">חלוקה לפסקאות</SelectItem>
                            <SelectItem value="headings">כותרות</SelectItem>
                            <SelectItem value="bullets">נקודות מפתח</SelectItem>
                            <SelectItem value="expand">הרחבה</SelectItem>
                            <SelectItem value="shorten">קיצור</SelectItem>
                            <SelectItem value="summarize">סיכום</SelectItem>
                            <SelectItem value="sources">הוספת מקורות</SelectItem>
                            <SelectItem value="speakers">זיהוי דוברים</SelectItem>
                            <SelectItem value="translate">תרגום</SelectItem>
                            <SelectItem value="tone">שינוי טון</SelectItem>
                          </SelectContent>
                        </Select>

                        <Select value={historyEngineFilter} onValueChange={(v) => setHistoryEngineFilter(v as 'all' | 'model1' | 'model2')}>
                          <SelectTrigger className="text-xs"><SelectValue placeholder="סנן לפי מנצח" /></SelectTrigger>
                          <SelectContent dir="rtl">
                            <SelectItem value="all">כל המנצחים</SelectItem>
                            <SelectItem value="model1">מנוע 1 ניצח</SelectItem>
                            <SelectItem value="model2">מנוע 2 ניצח</SelectItem>
                          </SelectContent>
                        </Select>

                        <Select value={historyDateFilter} onValueChange={(v) => setHistoryDateFilter(v as 'all' | '7d' | '30d' | '90d')}>
                          <SelectTrigger className="text-xs"><SelectValue placeholder="סנן לפי זמן" /></SelectTrigger>
                          <SelectContent dir="rtl">
                            <SelectItem value="all">כל הזמן</SelectItem>
                            <SelectItem value="7d">7 ימים אחרונים</SelectItem>
                            <SelectItem value="30d">30 ימים אחרונים</SelectItem>
                            <SelectItem value="90d">90 ימים אחרונים</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <input
                          className="h-9 rounded-md border bg-background px-3 text-xs"
                          placeholder="חיפוש במודלים/פעולה/מנצח..."
                          value={historySearch}
                          onChange={(e) => setHistorySearch(e.target.value)}
                        />
                        <Select value={historySort} onValueChange={(v) => setHistorySort(v as 'newest' | 'oldest' | 'best_quality' | 'best_latency')}>
                          <SelectTrigger className="text-xs"><SelectValue placeholder="מיון" /></SelectTrigger>
                          <SelectContent dir="rtl">
                            <SelectItem value="newest">מיון: חדש לישן</SelectItem>
                            <SelectItem value="oldest">מיון: ישן לחדש</SelectItem>
                            <SelectItem value="best_quality">מיון: איכות גבוהה</SelectItem>
                            <SelectItem value="best_latency">מיון: מהירות גבוהה</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <Button variant="outline" size="sm" onClick={exportAllHistoryJson}>
                          ייצוא כל ההיסטוריה JSON
                        </Button>
                        <Button variant="outline" size="sm" onClick={exportAllHistoryCsv}>
                          ייצוא כל ההיסטוריה CSV
                        </Button>
                        <Button variant="outline" size="sm" onClick={clearBenchmarkHistory}>
                          נקה היסטוריה
                        </Button>
                      </div>

                      {leaderboard.length > 0 && (
                        <div className="rounded-md border p-2 bg-muted/10 space-y-1">
                          <div className="text-[11px] font-medium">Leaderboard מנועים (לפי פילטרים)</div>
                          {leaderboard.map((row, idx) => (
                            <div key={`${row.label}-${idx}`} className="grid grid-cols-5 gap-2 text-[10px] text-muted-foreground">
                              <span className="font-medium text-foreground col-span-2 truncate">{idx + 1}. {row.label}</span>
                              <span>Win% {row.winRate.toFixed(1)}</span>
                              <span>Q {row.avgQuality.toFixed(1)}</span>
                              <span>L {row.avgLatency.toFixed(0)}ms</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {historyChartData.length > 1 && (
                        <div className="rounded-md border p-2 bg-muted/20 space-y-1">
                          <div className="text-[11px] font-medium">מגמות 10 ריצות אחרונות (איכות ומהירות)</div>
                          <svg viewBox="0 0 100 100" className="w-full h-24">
                            <polyline points={qualityPoints} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" />
                            <polyline points={latencyPoints} fill="none" stroke="hsl(var(--destructive))" strokeWidth="2" />
                          </svg>
                          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary" /> איכות (גבוה=טוב)</span>
                            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-destructive" /> מהירות (נמוך=טוב)</span>
                          </div>
                        </div>
                      )}

                      {sortedFilteredHistory.slice(0, 8).map((h, idx) => (
                        <div key={`${h.createdAt}-${idx}`} className="flex items-center justify-between gap-2 text-muted-foreground">
                          <span>{new Date(h.createdAt).toLocaleString('he-IL')} • {ACTION_LABELS[h.action]} • {h.rounds} סבבים</span>
                          <span>מנצח: {h.winner === 1 ? h.model1Label : h.model2Label}</span>
                          <Button size="sm" variant="outline" onClick={() => restoreBenchmarkRun(h)}>
                            שחזר ריצה
                          </Button>
                        </div>
                      ))}
                      {sortedFilteredHistory.length === 0 && (
                        <div className="text-[11px] text-muted-foreground">אין נתונים עבור הפילטרים הנוכחיים</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Engine comparison panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <EnginePanel
          num={1}
          modelValue={model1}
          setModelValue={setModel1}
          isEditingState={isEditing1}
          result={result1}
          onApply={() => onTextChange(result1, `ai-${lastAction || 'improve'}`, `${getModelLabel(model1)}`)}
          onSave={() => onSaveVersion?.(result1, `ai-${lastAction || 'improve'}`, getModelLabel(model1), lastAction || 'improve')}
        />
        <EnginePanel
          num={2}
          modelValue={model2}
          setModelValue={setModel2}
          isEditingState={isEditing2}
          result={result2}
          onApply={() => onTextChange(result2, `ai-${lastAction || 'improve'}`, `${getModelLabel(model2)}`)}
          onSave={() => onSaveVersion?.(result2, `ai-${lastAction || 'improve'}`, getModelLabel(model2), lastAction || 'improve')}
        />
      </div>

      {mergedResult && (
        <div className="mt-4 border rounded-lg p-4 space-y-3 bg-accent/5">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">גרסה משולבת (מיזוג חכם)</Label>
            <Badge variant="outline" className="text-xs">AI Merge</Badge>
          </div>
          <Textarea
            value={mergedResult}
            readOnly
            className="min-h-[220px] text-right bg-background"
            dir="rtl"
            style={{ fontFamily: 'inherit', fontSize: 'inherit', lineHeight: 'inherit' }}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Button onClick={() => onTextChange(mergedResult, `ai-${lastAction || 'improve'}`, 'מיזוג חכם')}>
              החלף בטקסט הראשי
            </Button>
            {onSaveVersion && (
              <Button variant="outline" onClick={() => onSaveVersion(mergedResult, `ai-${lastAction || 'improve'}`, 'AI Merge', `merge-${lastAction || 'improve'}`)}>
                <Save className="w-3 h-3 ml-1" />
                שמור גרסה משולבת
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
};

export const AIEditorDual = memo(AIEditorDualInner);
