import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function sanitizeFileName(name: string): string {
  const ext = name.split('.').pop() || 'webm';
  return `audio_${Date.now()}.${ext}`;
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 2000): Promise<T> {
  let lastError: Error | undefined;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (i < retries) {
        console.log(`Retry ${i + 1}/${retries}: ${lastError.message}`);
        await new Promise(r => setTimeout(r, delayMs * (i + 1)));
      }
    }
  }
  throw lastError;
}

const CHUNK_SIZE = 20 * 1024 * 1024; // 20MB

async function transcribeBlob(
  blob: Blob,
  engine: string,
  language: string,
  fileName: string,
  userApiKeys?: Record<string, string>
): Promise<string> {
  const safeFileName = sanitizeFileName(fileName);

  if (engine === 'groq') {
    const apiKey = userApiKeys?.groq_key || Deno.env.get('GROQ_API_KEY');
    if (!apiKey) throw new Error('GROQ_API_KEY not configured. Please add your Groq API key in Settings.');

    return await withRetry(async () => {
      const fd = new FormData();
      fd.append('file', blob, safeFileName);
      fd.append('model', 'whisper-large-v3');
      fd.append('language', language || 'he');
      fd.append('response_format', 'text');

      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: fd,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Groq API error:', response.status, errorText);
        throw new Error(`Groq API error: ${response.status}`);
      }
      return await response.text();
    });
  } else if (engine === 'openai') {
    const apiKey = userApiKeys?.openai_key || Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured. Please add your OpenAI API key in Settings.');

    return await withRetry(async () => {
      const fd = new FormData();
      fd.append('file', blob, safeFileName);
      fd.append('model', 'whisper-1');
      fd.append('language', language || 'he');
      fd.append('response_format', 'text');

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: fd,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
      }
      return await response.text();
    });
  }

  throw new Error(`Unsupported engine: ${engine}`);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { jobId } = await req.json();
    if (!jobId) throw new Error('jobId is required');

    console.log('Processing transcription job:', jobId);

    const { data: job, error: jobError } = await adminClient
      .from('transcription_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError || !job) throw new Error(`Job not found: ${jobId}`);
    if (job.status === 'completed') {
      return new Response(JSON.stringify({ status: 'already_completed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch user's API keys from cloud
    let userApiKeys: Record<string, string> = {};
    try {
      const { data: keysData } = await adminClient
        .from('user_api_keys')
        .select('*')
        .eq('user_identifier', job.user_id)
        .maybeSingle();
      if (keysData) {
        userApiKeys = keysData as Record<string, string>;
      }
    } catch (e) {
      console.log('Could not fetch user API keys, falling back to env:', e);
    }

    await adminClient.from('transcription_jobs')
      .update({ status: 'processing', progress: 30, updated_at: new Date().toISOString() })
      .eq('id', jobId);

    // Download file
    const { data: fileData, error: dlError } = await adminClient.storage
      .from('audio-files')
      .download(job.file_path);

    if (dlError || !fileData) throw new Error(`Failed to download file: ${dlError?.message}`);

    await adminClient.from('transcription_jobs')
      .update({ progress: 50, updated_at: new Date().toISOString() })
      .eq('id', jobId);

    const engine = job.engine || 'groq';
    const totalChunks = job.total_chunks || 1;
    const startChunk = job.completed_chunks || 0;
    let partialResult = job.partial_result || '';

    if (totalChunks <= 1 || fileData.size <= CHUNK_SIZE) {
      // Single chunk - simple path
      const text = await transcribeBlob(fileData, engine, job.language || 'he', job.file_name || 'audio.webm', userApiKeys);
      partialResult = text;
    } else {
      // Multi-chunk processing with resume
      const actualChunks = Math.ceil(fileData.size / CHUNK_SIZE);
      
      for (let i = startChunk; i < actualChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, fileData.size);
        const chunkBlob = fileData.slice(start, end, fileData.type || 'application/octet-stream');

        console.log(`Processing chunk ${i + 1}/${actualChunks}`);
        
        const chunkText = await transcribeBlob(
          chunkBlob, engine, job.language || 'he', job.file_name || 'audio.webm'
        );

        partialResult += (partialResult ? ' ' : '') + chunkText;

        // Save partial progress
        const chunkProgress = 50 + Math.round(((i + 1) / actualChunks) * 40);
        await adminClient.from('transcription_jobs')
          .update({
            partial_result: partialResult,
            completed_chunks: i + 1,
            progress: chunkProgress,
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId);
      }
    }

    // Complete
    await adminClient.from('transcription_jobs')
      .update({
        status: 'completed',
        result_text: partialResult,
        progress: 100,
        completed_chunks: totalChunks,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    // Cleanup
    await adminClient.storage.from('audio-files').remove([job.file_path]);

    console.log('Job completed:', jobId);

    return new Response(JSON.stringify({ status: 'completed', text: partialResult }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error processing job:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';

    try {
      const { jobId } = await req.clone().json().catch(() => ({ jobId: null }));
      if (jobId) {
        await adminClient.from('transcription_jobs')
          .update({ status: 'failed', error_message: msg, updated_at: new Date().toISOString() })
          .eq('id', jobId);
      }
    } catch {}

    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
