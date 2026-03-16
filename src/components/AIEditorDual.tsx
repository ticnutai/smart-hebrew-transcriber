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
  CheckCheck, Volume2, AlignJustify, Quote, Cpu, Save
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
  // Meta & Mistral
  { value: 'llama-70b', label: 'Llama 3.1 70B', apiModel: 'meta-llama/llama-3.1-70b-instruct', local: false },
  { value: 'mistral-large', label: 'Mistral Large', apiModel: 'mistralai/mistral-large-latest', local: false },
];

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
  const [model1, setModel1] = useState('gemini-flash');
  const [model2, setModel2] = useState('gpt-4o');
  const [result1, setResult1] = useState("");
  const [result2, setResult2] = useState("");
  const [lastAction, setLastAction] = useState<EditAction | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [showCustomDialog, setShowCustomDialog] = useState(false);
  const ollama = useOllama();

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

  const handleEdit = async (
    action: EditAction,
    modelValue: string,
    setLoading: (v: boolean) => void,
    setResult: (v: string) => void,
    extra?: { customPrompt?: string; toneStyle?: string; targetLanguage?: string }
  ) => {
    if (!text.trim()) {
      toast({ title: "שגיאה", description: "אין טקסט לעריכה", variant: "destructive" });
      return;
    }

    setLoading(true);

    try {
      let resultText: string;

      if (isOllamaModel(modelValue)) {
        // Local Ollama execution
        resultText = await ollama.editText({
          text,
          action,
          model: getOllamaModelName(modelValue),
          customPrompt: extra?.customPrompt,
          toneStyle: extra?.toneStyle,
          targetLanguage: extra?.targetLanguage,
        });
      } else {
        // Cloud execution via DB proxy → edge function fallback
        resultText = await editTranscriptCloud({
          text,
          action,
          model: getModelApi(modelValue),
          customPrompt: extra?.customPrompt,
          toneStyle: extra?.toneStyle,
          targetLanguage: extra?.targetLanguage,
        });
      }

      if (resultText) {
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
    handleEdit(action, model1, setIsEditing1, setResult1, extra);
    handleEdit(action, model2, setIsEditing2, setResult2, extra);
  };

  const isLoading = isEditing1 || isEditing2;
  const noText = !text.trim();

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
    </Card>
  );
};

export const AIEditorDual = memo(AIEditorDualInner);
