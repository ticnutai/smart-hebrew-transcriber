import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Sanitize filename - remove Hebrew/special chars that may cause issues
function sanitizeFileName(name: string): string {
  const ext = name.split('.').pop() || 'webm';
  return `audio_${Date.now()}.${ext}`;
}

// Retry wrapper
async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 2000): Promise<T> {
  let lastError: Error | undefined;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (i < retries) {
        console.log(`Retry ${i + 1}/${retries} after error: ${lastError.message}`);
        await new Promise(r => setTimeout(r, delayMs * (i + 1)));
      }
    }
  }
  throw lastError;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const contentType = req.headers.get('content-type') || '';

    let GROQ_API_KEY: string | undefined;
    let fileBlob: Blob | undefined;
    let fileName = 'audio.webm';
    let language = 'he';

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const apiKey = form.get('apiKey');
      if (typeof apiKey === 'string') GROQ_API_KEY = apiKey;
      const lang = form.get('language');
      if (typeof lang === 'string' && lang !== 'auto') language = lang;
      const file = form.get('file');
      if (file instanceof Blob) {
        fileBlob = file;
        if ('name' in file) {
          fileName = (file as any).name || fileName;
        }
      }
      if (!fileBlob) throw new Error('file is required in multipart form');
    } else {
      const { audio, fileName: jsonName, apiKey, language: jsonLang } = await req.json();
      if (!audio) throw new Error('No audio data provided');
      GROQ_API_KEY = apiKey || Deno.env.get('GROQ_API_KEY');
      if (jsonLang && jsonLang !== 'auto') language = jsonLang;
      const binaryAudio = Uint8Array.from(atob(audio), c => c.charCodeAt(0));
      fileBlob = new Blob([binaryAudio], { type: 'application/octet-stream' });
      fileName = jsonName || fileName;
    }

    GROQ_API_KEY = GROQ_API_KEY || Deno.env.get('GROQ_API_KEY');
    if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY is not configured');

    // Sanitize the filename to avoid encoding issues
    const safeFileName = sanitizeFileName(fileName);
    console.log('Sending to Groq Whisper API...', fileName, '->', safeFileName);

    const result = await withRetry(async () => {
      const fd = new FormData();
      fd.append('file', fileBlob!, safeFileName);
      fd.append('model', 'whisper-large-v3-turbo');
      fd.append('language', language);
      fd.append('response_format', 'verbose_json');
      fd.append('timestamp_granularities[]', 'word');

      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
        body: fd,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Groq API error:', response.status, errorText);
        
        if (response.status === 429) {
          // Don't retry rate limits - surface immediately
          const err = new Error('RATE_LIMIT');
          (err as any).noRetry = true;
          throw err;
        }
        if (response.status === 401 || response.status === 403) {
          const err = new Error('AUTH_ERROR');
          (err as any).noRetry = true;
          throw err;
        }
        // 500 errors are retryable
        if (response.status >= 500) {
          throw new Error(`SERVER_ERROR_${response.status}`);
        }
        throw new Error(`Groq API error: ${response.status}`);
      }

      return await response.json();
    }, 3, 3000);

    console.log('Groq transcription completed successfully');

    // Extract word-level timestamps
    const wordTimings = (result.words || []).map((w: any) => ({
      word: w.word,
      start: w.start,
      end: w.end,
    }));

    return new Response(JSON.stringify({ text: result.text, wordTimings }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in transcribe-groq:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    
    if (msg === 'RATE_LIMIT') {
      return new Response(JSON.stringify({ error: 'חרגת ממגבלת הבקשות של Groq. נסה שוב מאוחר יותר.', retryAfter: 60 }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' },
      });
    }
    if (msg === 'AUTH_ERROR') {
      return new Response(JSON.stringify({ error: 'מפתח Groq שגוי או חסר.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (msg.startsWith('SERVER_ERROR_')) {
      return new Response(JSON.stringify({ error: 'שגיאת שרת ב-Groq. הבקשה נכשלה גם אחרי ניסיונות חוזרים. נסה שוב בעוד מספר דקות.' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
