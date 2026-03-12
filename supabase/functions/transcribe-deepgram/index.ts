import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const apiKey = formData.get('apiKey') as string;
    const language = formData.get('language') as string || 'auto';
    const diarize = formData.get('diarize') as string;

    if (!file || !apiKey) {
      throw new Error('Missing file or API key');
    }

    // Convert file to array buffer
    const arrayBuffer = await file.arrayBuffer();

    // Map language codes
    const languageMap: Record<string, string> = {
      'he': 'he',
      'yi': 'he', // Use Hebrew for Yiddish as fallback
      'en': 'en',
      'auto': 'multi', // Deepgram's multi-language model
    };

    const deepgramLanguage = languageMap[language] || 'multi';

    // Build Deepgram API URL with optional diarization
    const diarizeParam = diarize === 'true' ? '&diarize=true' : '';
    const response = await fetch(
      `https://api.deepgram.com/v1/listen?language=${deepgramLanguage}&model=nova-2&smart_format=true${diarizeParam}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Token ${apiKey}`,
          'Content-Type': file.type,
        },
        body: arrayBuffer,
      }
    );

    if (!response.ok) {
      throw new Error(`Deepgram API error: ${await response.text()}`);
    }

    const result = await response.json();
    const alt = result.results?.channels?.[0]?.alternatives?.[0];
    const text = alt?.transcript || '';

    if (!text) {
      throw new Error('No transcription received from Deepgram');
    }

    // Extract word-level timestamps with optional speaker info
    const wordTimings = (alt?.words || []).map((w: any) => ({
      word: w.punctuated_word || w.word,
      start: w.start,
      end: w.end,
      speaker: w.speaker !== undefined ? w.speaker : undefined,
    }));

    // If diarization was requested, format text with speaker labels
    let finalText = text;
    if (diarize === 'true' && alt?.words?.length) {
      let currentSpeaker = -1;
      const parts: string[] = [];
      for (const w of alt.words) {
        if (w.speaker !== undefined && w.speaker !== currentSpeaker) {
          currentSpeaker = w.speaker;
          parts.push(`\n[דובר ${currentSpeaker}]: `);
        }
        parts.push((w.punctuated_word || w.word) + ' ');
      }
      finalText = parts.join('').trim();
    }

    return new Response(
      JSON.stringify({ text: finalText, wordTimings }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in transcribe-deepgram:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});