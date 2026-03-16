import { useState, useEffect, useCallback, useRef } from "react";
import { ACTION_PROMPTS, TONE_PROMPTS } from "@/lib/prompts";

const DEFAULT_OLLAMA_URL = "http://localhost:11434";

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

  // Smart polling: fast when connected, exponential backoff when disconnected,
  // pauses when tab is hidden
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    let consecutiveFails = 0;
    const BASE_INTERVAL = 30_000;
    const MAX_INTERVAL = 120_000;

    const poll = async () => {
      const ok = await checkConnection();
      if (ok) {
        consecutiveFails = 0;
      } else {
        consecutiveFails++;
      }
      // Stop polling after 5 consecutive failures (Ollama not running)
      if (consecutiveFails >= 5) return;
      const nextInterval = ok
        ? BASE_INTERVAL
        : Math.min(BASE_INTERVAL * Math.pow(2, consecutiveFails), MAX_INTERVAL);
      timeoutId = setTimeout(poll, nextInterval);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        clearTimeout(timeoutId);
      } else {
        // Immediate check on tab focus, then resume schedule
        poll();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    // Initial check
    poll();

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
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
      if (lang === 'עברית') {
        systemPrompt = 'You are a professional translator. Translate the following text into Hebrew (עברית). Preserve the original meaning and style. Do not add notes — only the translation itself.';
      } else {
        systemPrompt = `אתה מתרגם מקצועי. תרגם את הטקסט הבא ל${lang}. שמור על המשמעות והסגנון המקורי. אל תוסיף הערות — רק את התרגום עצמו.`;
      }
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
