import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { audio, fileName, apiKey } = await req.json();

    if (!audio) {
      throw new Error('No audio data provided');
    }

    const GOOGLE_API_KEY = apiKey || Deno.env.get('GOOGLE_API_KEY');
    if (!GOOGLE_API_KEY) {
      throw new Error('GOOGLE_API_KEY is not configured');
    }

    console.log('Processing audio file with Google:', fileName);

    // Google Speech-to-Text expects base64 encoded audio in the request body
    const requestBody = {
      config: {
        encoding: 'WEBM_OPUS',
        sampleRateHertz: 48000,
        languageCode: 'he-IL',
        enableAutomaticPunctuation: true,
      },
      audio: {
        content: audio
      }
    };

    console.log('Sending to Google Speech-to-Text API...');

    const response = await fetch(
      `https://speech.googleapis.com/v1/speech:recognize?key=${GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google API error:', response.status, errorText);
      if (response.status === 429) {
        throw new Error('חרגת ממגבלת הבקשות של Google. נסה שוב מאוחר יותר.');
      }
      if (response.status === 400) {
        throw new Error('פורמט הקובץ לא נתמך. נסה קובץ אחר.');
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error('מפתח Google שגוי או חסר הרשאות.');
      }
      throw new Error(`Google API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('Google response received');

    // Extract transcription from Google's response format
    const transcription = result.results
      ?.map((r: any) => r.alternatives?.[0]?.transcript || '')
      .join(' ') || '';

    if (!transcription) {
      throw new Error('לא התקבל תמלול מ-Google. ייתכן שהקובץ ריק או לא נתמך.');
    }

    console.log('Google transcription completed successfully, length:', transcription.length);

    return new Response(
      JSON.stringify({ text: transcription }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in transcribe-google:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
