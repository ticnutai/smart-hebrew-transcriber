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

    // Get job details
    const { data: job, error: jobError } = await adminClient
      .from('transcription_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    if (job.status === 'completed') {
      return new Response(JSON.stringify({ status: 'already_completed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update status to processing
    await adminClient.from('transcription_jobs')
      .update({ status: 'processing', progress: 30, updated_at: new Date().toISOString() })
      .eq('id', jobId);

    // Download file from storage
    const { data: fileData, error: dlError } = await adminClient.storage
      .from('audio-files')
      .download(job.file_path);

    if (dlError || !fileData) {
      throw new Error(`Failed to download file: ${dlError?.message}`);
    }

    await adminClient.from('transcription_jobs')
      .update({ progress: 50, updated_at: new Date().toISOString() })
      .eq('id', jobId);

    // Determine which API to call based on engine
    const engine = job.engine || 'groq';
    let transcriptionText = '';

    if (engine === 'groq') {
      // Get API key from the job metadata or env
      const apiKey = Deno.env.get('GROQ_API_KEY');
      if (!apiKey) throw new Error('GROQ_API_KEY not configured');

      const safeFileName = sanitizeFileName(job.file_name || 'audio.webm');
      
      transcriptionText = await withRetry(async () => {
        const fd = new FormData();
        fd.append('file', fileData, safeFileName);
        fd.append('model', 'whisper-large-v3');
        fd.append('language', job.language || 'he');
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
      const apiKey = Deno.env.get('OPENAI_API_KEY');
      if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

      const safeFileName = sanitizeFileName(job.file_name || 'audio.webm');

      transcriptionText = await withRetry(async () => {
        const fd = new FormData();
        fd.append('file', fileData, safeFileName);
        fd.append('model', 'whisper-1');
        fd.append('language', job.language || 'he');
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

    await adminClient.from('transcription_jobs')
      .update({ progress: 90, updated_at: new Date().toISOString() })
      .eq('id', jobId);

    // Update job with result
    await adminClient.from('transcription_jobs')
      .update({
        status: 'completed',
        result_text: transcriptionText,
        progress: 100,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    // Clean up audio file from storage
    await adminClient.storage.from('audio-files').remove([job.file_path]);

    console.log('Job completed successfully:', jobId);

    return new Response(JSON.stringify({ status: 'completed', text: transcriptionText }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error processing job:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';

    // Try to update the job as failed
    try {
      const { jobId } = await req.clone().json().catch(() => ({ jobId: null }));
      if (jobId) {
        await adminClient.from('transcription_jobs')
          .update({
            status: 'failed',
            error_message: msg,
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId);
      }
    } catch {}

    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
