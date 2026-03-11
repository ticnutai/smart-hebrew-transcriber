import { useState, useEffect, useCallback, useRef } from 'react';

export interface WordTiming {
  word: string;
  start: number;
  end: number;
}

export interface ServerTranscriptionResult {
  text: string;
  wordTimings: WordTiming[];
  duration?: number;
  language?: string;
  model?: string;
  processing_time?: number;
}

export interface PartialTranscript {
  text: string;
  wordTimings: WordTiming[];
  progress: number;         // 0-100 real percentage
  audioDuration?: number;
  lastSegEnd?: number;       // last segment end time in seconds (for resume)
}

interface ServerStatus {
  status: string;
  device: string;
  gpu: string | null;
  current_model: string | null;
  cached_models: string[];
  downloaded_models: string[];
  available_models: string[];
}

const DEFAULT_SERVER_URL = 'http://localhost:8765';

/** Key used to persist partial transcription in localStorage */
const PARTIAL_STORAGE_KEY = 'transcription_partial';

export const useLocalServer = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [partialTranscript, setPartialTranscript] = useState<PartialTranscript | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>();
  const abortRef = useRef<AbortController | null>(null);

  const getBaseUrl = () => {
    return localStorage.getItem('whisper_server_url') || DEFAULT_SERVER_URL;
  };

  const checkConnection = useCallback(async () => {
    const url = `${getBaseUrl()}/health`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json();
        console.log('[useLocalServer] ✅ server connected, status:', data.status, '| device:', data.device);
        setServerStatus(data);
        setIsConnected(true);
        return true;
      }
    } catch {
      // Server not running — silent, no spam
    }
    setIsConnected(false);
    setServerStatus(null);
    return false;
  }, []);

  // Poll every 10s
  useEffect(() => {
    checkConnection();
    pollRef.current = setInterval(checkConnection, 10000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [checkConnection]);

  // ─── Legacy single-shot transcribe (still available for fallback) ───
  const transcribe = async (
    file: File,
    model?: string,
    language: string = 'he'
  ): Promise<ServerTranscriptionResult> => {
    setIsLoading(true);
    setProgress(10);

    try {
      const form = new FormData();
      form.append('file', file, file.name);
      if (model) form.append('model', model);
      form.append('language', language);

      setProgress(30);

      const res = await fetch(`${getBaseUrl()}/transcribe`, {
        method: 'POST',
        body: form,
      });

      setProgress(90);

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `Server error ${res.status}`);
      }

      const data = await res.json();
      setProgress(100);

      return {
        text: data.text,
        wordTimings: data.wordTimings || [],
        duration: data.duration,
        language: data.language,
        model: data.model,
        processing_time: data.processing_time,
      };
    } finally {
      setIsLoading(false);
      setProgress(0);
    }
  };

  // ─── Streaming transcribe with real progress + incremental saves ───
  const transcribeStream = async (
    file: File,
    model?: string,
    language: string = 'he',
    onPartial?: (partial: PartialTranscript) => void,
    resumeFrom?: { startFrom: number; existingText: string; existingWords: WordTiming[] },
  ): Promise<ServerTranscriptionResult> => {
    console.log(`[useLocalServer] 🎙️ transcribeStream START — file:${file.name} (${(file.size/1024).toFixed(0)}KB), model:${model ?? 'default'}, lang:${language}${resumeFrom ? `, resumeFrom=${resumeFrom.startFrom}s` : ''}`);
    setIsLoading(true);
    console.log('[useLocalServer] setIsLoading(true)');
    setProgress(resumeFrom ? Math.round((resumeFrom.startFrom / 1) * 0) : 0);
    setPartialTranscript(null);

    // Only clear partial if not resuming
    if (!resumeFrom) {
      localStorage.removeItem(PARTIAL_STORAGE_KEY);
    }

    const form = new FormData();
    form.append('file', file, file.name);
    if (model) form.append('model', model);
    form.append('language', language);
    if (resumeFrom) {
      form.append('start_from', String(resumeFrom.startFrom));
    }

    // Prepend existing text/words when resuming
    const prefixText = resumeFrom?.existingText ? [resumeFrom.existingText] : [];
    const prefixWords = resumeFrom?.existingWords ? [...resumeFrom.existingWords] : [];

    try {
      abortRef.current = new AbortController();
      const streamUrl = `${getBaseUrl()}/transcribe-stream`;
      console.log(`[useLocalServer] → fetching ${streamUrl}`);
      const res = await fetch(streamUrl, {
        method: 'POST',
        body: form,
        signal: abortRef.current.signal,
      });

      console.log(`[useLocalServer] response status: ${res.status}, ok: ${res.ok}, content-type: ${res.headers.get('content-type')}`);

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `Server error ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('Streaming not supported');
      console.log('[useLocalServer] ✅ got reader, entering stream loop');

      const decoder = new TextDecoder();
      let buffer = '';
      const accText: string[] = [...prefixText];
      const accWords: WordTiming[] = [...prefixWords];
      let audioDuration = 0;
      let lastSegEnd = resumeFrom?.startFrom || 0;
      let finalResult: ServerTranscriptionResult | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // keep incomplete line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let evt: any;
          try { evt = JSON.parse(raw); } catch { continue; }

          console.log(`[useLocalServer] SSE evt: type=${evt.type}${ evt.type==='segment' ? ` progress=${evt.progress} text="${(evt.text||'').slice(0,40)}"` : evt.type==='info' ? ` duration=${evt.duration}` : evt.type==='done' ? ` processing_time=${evt.processing_time}` : '' }`);

          if (evt.type === 'info') {
            audioDuration = evt.duration || 0;
          } else if (evt.type === 'segment') {
            accText.push(evt.text);
            if (evt.words) accWords.push(...evt.words);
            if (evt.segEnd) lastSegEnd = evt.segEnd;

            const realProgress = evt.progress ?? 0;
            console.log(`[useLocalServer] setProgress(${realProgress}) — accumulated ${accText.length} segments`);
            setProgress(realProgress);

            const partial: PartialTranscript = {
              text: accText.join(' '),
              wordTimings: [...accWords],
              progress: realProgress,
              audioDuration,
              lastSegEnd,
            };
            setPartialTranscript(partial);
            onPartial?.(partial);

            // Persist partial to localStorage for crash recovery
            localStorage.setItem(PARTIAL_STORAGE_KEY, JSON.stringify(partial));
          } else if (evt.type === 'done') {
            console.log('[useLocalServer] ✅ done event received, setProgress(100)');
            setProgress(100);
            // When resuming, merge with prefix text
            const fullText = resumeFrom?.existingText
              ? resumeFrom.existingText + ' ' + evt.text
              : evt.text;
            const fullTimings = resumeFrom?.existingWords
              ? [...resumeFrom.existingWords, ...(evt.wordTimings || [])]
              : (evt.wordTimings || []);
            finalResult = {
              text: fullText,
              wordTimings: fullTimings,
              duration: evt.duration,
              language: evt.language,
              model: evt.model,
              processing_time: evt.processing_time,
            };
            // Clear partial — we have the full result
            localStorage.removeItem(PARTIAL_STORAGE_KEY);
          } else if (evt.type === 'error') {
            throw new Error(evt.error || 'Server transcription error');
          }
        }
      }

      if (finalResult) return finalResult;

      // If stream ended without 'done' event, use accumulated data
      if (accText.length > 0) {
        return {
          text: accText.join(' '),
          wordTimings: accWords,
          duration: audioDuration,
          model: model,
        };
      }

      console.warn('[useLocalServer] ⚠️ stream ended without results (no accText)');
      throw new Error('Stream ended without results');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        console.log('[useLocalServer] stream aborted by user');
        throw new Error('CANCELLED');
      }
      console.error('[useLocalServer] ❌ transcribeStream error:', err);
      throw err;
    } finally {
      console.log('[useLocalServer] setIsLoading(false)');
      setIsLoading(false);
      abortRef.current = null;
    }
  };

  /**
   * Recover a partial transcript from a previous interrupted session.
   * Returns null if nothing was saved.
   */
  const recoverPartial = (): PartialTranscript | null => {
    try {
      const raw = localStorage.getItem(PARTIAL_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as PartialTranscript;
    } catch {
      return null;
    }
  };

  const clearPartial = () => {
    localStorage.removeItem(PARTIAL_STORAGE_KEY);
    setPartialTranscript(null);
  };

  const cancelStream = () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    setIsLoading(false);
    setProgress(0);
  };

  const loadModel = async (modelId: string) => {
    const res = await fetch(`${getBaseUrl()}/load-model`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed' }));
      throw new Error(err.error);
    }
    await checkConnection(); // Refresh status
  };

  const downloadModel = async (modelId: string) => {
    const res = await fetch(`${getBaseUrl()}/download-model`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed' }));
      throw new Error(err.error);
    }
    await checkConnection(); // Refresh status
  };

  return {
    isConnected,
    serverStatus,
    isLoading,
    progress,
    partialTranscript,
    transcribe,
    transcribeStream,
    cancelStream,
    recoverPartial,
    clearPartial,
    loadModel,
    downloadModel,
    checkConnection,
    getBaseUrl,
  };
};
