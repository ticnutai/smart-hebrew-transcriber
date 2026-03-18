// Test the full editTranscriptCloud flow: DB proxy -> edge function fallback
import { createClient } from '@supabase/supabase-js';

const s = createClient(
  'https://kjjljpllyjnvitemapox.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqamxqcGxseWpudml0ZW1hcG94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNjM2NDksImV4cCI6MjA4ODczOTY0OX0.V6z69-vY-z5c1yA-fAP_X0PKWCzrS2Es4sfOckAet4I'
);

async function editTranscriptCloud(params) {
  const { text, action, model, customPrompt, toneStyle, targetLanguage } = params;

  // Try DB proxy first
  try {
    const { data, error } = await s.rpc('edit_transcript_proxy', {
      p_text: text,
      p_action: action,
      p_model: model || 'gemini-2.5-flash',
      p_custom_prompt: customPrompt || null,
      p_tone_style: toneStyle || null,
      p_target_language: targetLanguage || null,
    });

    const result = data;
    if (!error && result && !result.error && result.text) {
      return { text: result.text, engine: 'DB proxy' };
    }
    const proxyError = error?.message || result?.error || 'Unknown';
    console.log(`DB proxy result: ${proxyError} → falling back to edge function`);
  } catch (e) {
    console.log('DB proxy exception:', e.message, '→ falling back');
  }

  // Fallback: edge function
  const body = { text, action };
  if (model) body.model = model;
  if (customPrompt) body.customPrompt = customPrompt;
  if (toneStyle) body.toneStyle = toneStyle;
  if (targetLanguage) body.targetLanguage = targetLanguage;

  const { data, error } = await s.functions.invoke('edit-transcript', { body });
  if (error) throw new Error('Edge function error: ' + error.message);
  if (!data?.text) throw new Error('No text from edge function');
  return { text: data.text, engine: 'edge function' };
}

async function main() {
  await s.auth.signInWithPassword({ email: 'jj1212t@gmail.com', password: process.env.ADMIN_PASSWORD || '' });
  console.log('Testing editTranscriptCloud...\n');
  
  try {
    const result = await editTranscriptCloud({
      text: 'שלום עולם, זה משפט בעברית לבדיקה.',
      action: 'grammar',
      model: 'google/gemini-2.5-flash',
    });
    console.log('✅ SUCCESS via:', result.engine);
    console.log('Result text:', result.text.substring(0, 200));
  } catch (e) {
    console.error('❌ FAILED:', e.message);
  }
}

main();
