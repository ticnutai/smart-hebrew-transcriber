import { createClient } from '@supabase/supabase-js';
const s = createClient('https://kjjljpllyjnvitemapox.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqamxqcGxseWpudml0ZW1hcG94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNjM2NDksImV4cCI6MjA4ODczOTY0OX0.V6z69-vY-z5c1yA-fAP_X0PKWCzrS2Es4sfOckAet4I');
async function t() {
  await s.auth.signInWithPassword({email:'jj1212t@gmail.com',password:'543211'});
  
  // Test the DB proxy directly with google API approach
  const {data, error} = await s.rpc('edit_transcript_proxy', {
    p_text: 'שלום עולם, זה בדיקה',
    p_action: 'summarize',
  });
  console.log('PROXY RESULT:', JSON.stringify(data));
  if (error) console.log('PROXY ERROR:', error.message);
}
t();
