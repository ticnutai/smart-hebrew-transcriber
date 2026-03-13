import { useState, useEffect, useCallback, useRef } from "react";

const DEFAULT_OLLAMA_URL = "http://localhost:11434";

// Same prompts as on edge function — enables fully local editing
const ACTION_PROMPTS: Record<string, string> = {
  improve: 'אתה עורך מקצועי. שפר את הניסוח של הטקסט הבא כך שיהיה ברור ומקצועי יותר. השאר את המשמעות והתוכן זהים, רק שפר את הניסוח והדקדוק.',
  grammar: 'אתה מגיה מקצועי. תקן שגיאות דקדוק, כתיב ואיות בטקסט הבא. אל תשנה את המשמעות או הסגנון, רק תקן שגיאות שפה. החזר את הטקסט המתוקן בלבד.',
  punctuation: 'אתה עורך מקצועי. הוסף סימני פיסוק מתאימים לטקסט הבא — נקודות, פסיקים, סימני שאלה וקריאה. וודא שהפיסוק תקין ומשפר את הקריאות. החזר את הטקסט עם הפיסוק בלבד.',
  readable: 'אתה עורך מקצועי. עשה את הטקסט הבא קריא וזורם יותר. חלק למשפטים קצרים, הוסף סימני פיסוק מתאימים, וודא שהטקסט קל לקריאה ולהבנה.',
  paragraphs: 'אתה עורך מקצועי. חלק את הטקסט הבא לפסקאות לוגיות. הוסף שורה ריקה בין פסקאות. אל תשנה את התוכן עצמו, רק את המבנה.',
  headings: 'אתה עורך מקצועי. הוסף כותרת ראשית ותתי-כותרות מתאימות לטקסט הבא. השתמש בסימון: # לכותרת ראשית, ## לתת-כותרת. שמור על כל התוכן המקורי.',
  bullets: 'אתה עורך מקצועי. הפק רשימת נקודות מפתח (bullet points) מהטקסט הבא. כל נקודה תהיה משפט קצר וברור. השתמש בתבליטים (•). שמור על כל המידע החשוב.',
  expand: 'אתה עורך מקצועי. הרחב את הטקסט הבא — הוסף פרטים, הסברים ודוגמאות. שמור על הנושא והסגנון המקורי. הפוך כל נקודה למפורטת יותר.',
  shorten: 'אתה עורך מקצועי. קצר את הטקסט הבא לכמחצית מאורכו המקורי. שמור על הנקודות החשובות ביותר. הסר חזרות ומידע משני.',
  summarize: 'אתה עוזר שמסכם טקסטים בעברית. צור סיכום תמציתי של 3-5 משפטים, תוך שמירה על נקודות המפתח החשובות ביותר. הסיכום חייב להיות בעברית.',
  sources: 'אתה עורך מחקרי. הוסף הערות ומקורות אפשריים לטקסט הבא. סמן מקומות שבהם כדאי להוסיף מקורות או ציטוטים עם [מקור נדרש]. אל תמציא מקורות, רק ציין היכן הם נחוצים.',
  speakers: 'אתה מומחה בזיהוי דוברים. נתח את הטקסט הבא (שנוצר מתמלול שיחה) וזהה את הדוברים השונים. סמן כל דובר עם תווית (דובר 1:, דובר 2: וכו\') בתחילת כל קטע דיבור שלו. אם לא ניתן להבחין — סמן עם [החלפת דובר].',
  custom: 'בצע את המשימה המבוקשת על הטקסט הבא.',
};

const TONE_PROMPTS: Record<string, string> = {
  formal: 'אתה עורך מקצועי. שכתב את הטקסט הבא בטון רשמי ומקצועי. השתמש בשפה מכובדת, הימנע מסלנג ומקיצורים. שמור על כל התוכן.',
  personal: 'אתה עורך מקצועי. שכתב את הטקסט הבא בטון אישי וחם. השתמש בגוף ראשון, הוסף נגיעה אישית. שמור על כל התוכן.',
  academic: 'אתה עורך אקדמי. שכתב את הטקסט הבא בסגנון אקדמי מחקרי. השתמש במונחים מקצועיים, הוסף מבנה אקדמי מתאים.',
  business: 'אתה עורך עסקי. שכתב את הטקסט הבא בסגנון עסקי מקצועי. תמציתי, ברור ומכוון לפעולה.',
};

export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
  digest: string;
  details?: {
    parameter_size?: string;
    quantization_level?: string;
    family?: string;
  };
}

export interface OllamaPullProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
}

const OLLAMA_URL_KEY = 'ollama_base_url';

export function getOllamaUrl(): string {
  return localStorage.getItem(OLLAMA_URL_KEY) || DEFAULT_OLLAMA_URL;
}

export function setOllamaUrl(url: string) {
  localStorage.setItem(OLLAMA_URL_KEY, url);
}

export function useOllama() {
  const [isConnected, setIsConnected] = useState(false);
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState<OllamaPullProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const checkConnection = useCallback(async () => {
    setIsChecking(true);
    try {
      const baseUrl = getOllamaUrl();
      const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error('Bad response');
      const data = await res.json();
      setModels(data.models || []);
      setIsConnected(true);
      return true;
    } catch {
      setIsConnected(false);
      setModels([]);
      return false;
    } finally {
      setIsChecking(false);
    }
  }, []);

  // Check on mount and every 30s
  useEffect(() => {
    checkConnection();
    const interval = setInterval(checkConnection, 30000);
    return () => clearInterval(interval);
  }, [checkConnection]);

  const pullModel = useCallback(async (modelName: string, onProgress?: (p: OllamaPullProgress) => void) => {
    setIsPulling(true);
    setPullProgress({ status: 'starting' });

    try {
      const baseUrl = getOllamaUrl();
      abortRef.current = new AbortController();

      const res = await fetch(`${baseUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) throw new Error(`Pull failed: ${res.statusText}`);
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value, { stream: true }).split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const progress = JSON.parse(line) as OllamaPullProgress;
            setPullProgress(progress);
            onProgress?.(progress);
          } catch { /* skip malformed lines */ }
        }
      }

      // Refresh model list
      await checkConnection();
    } finally {
      setIsPulling(false);
      setPullProgress(null);
      abortRef.current = null;
    }
  }, [checkConnection]);

  const cancelPull = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const deleteModel = useCallback(async (modelName: string) => {
    const baseUrl = getOllamaUrl();
    const res = await fetch(`${baseUrl}/api/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName }),
    });
    if (!res.ok) throw new Error(`Delete failed: ${res.statusText}`);
    await checkConnection();
  }, [checkConnection]);

  const editText = useCallback(async (params: {
    text: string;
    action: string;
    model: string;
    customPrompt?: string;
    toneStyle?: string;
    targetLanguage?: string;
  }): Promise<string> => {
    const { text, action, model, customPrompt, toneStyle, targetLanguage } = params;
    const baseUrl = getOllamaUrl();

    let systemPrompt = '';
    if (action === 'custom' && customPrompt) {
      systemPrompt = customPrompt;
    } else if (action === 'tone') {
      systemPrompt = TONE_PROMPTS[toneStyle || 'formal'] || TONE_PROMPTS.formal;
    } else if (action === 'translate') {
      const lang = targetLanguage || 'אנגלית';
      systemPrompt = `אתה מתרגם מקצועי. תרגם את הטקסט הבא ל${lang}. שמור על המשמעות והסגנון המקורי. אל תוסיף הערות — רק את התרגום עצמו.`;
    } else {
      systemPrompt = ACTION_PROMPTS[action];
      if (!systemPrompt) throw new Error(`Invalid action: ${action}`);
    }

    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        stream: false,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Ollama error: ${errText}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('No response from Ollama model');
    return content;
  }, []);

  return {
    isConnected,
    isChecking,
    models,
    isPulling,
    pullProgress,
    checkConnection,
    pullModel,
    cancelPull,
    deleteModel,
    editText,
  };
}

// Helper to check if a model value is an Ollama model
export const isOllamaModel = (value: string) => value.startsWith('ollama:');

// Extract the actual model name from the prefixed value
export const getOllamaModelName = (value: string) => value.replace('ollama:', '');

// Format model size in human-readable form
export const formatModelSize = (bytes: number): string => {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${bytes} B`;
};
