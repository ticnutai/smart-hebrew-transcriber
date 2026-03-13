import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://kjjljpllyjnvitemapox.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqamxqcGxseWpudml0ZW1hcG94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNjM2NDksImV4cCI6MjA4ODczOTY0OX0.V6z69-vY-z5c1yA-fAP_X0PKWCzrS2Es4sfOckAet4I';

const supabase = createClient(SUPABASE_URL, ANON_KEY);

async function main() {
  console.log('🔐 Logging in...');
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'jj1212t@gmail.com',
    password: '543211',
  });

  if (error) {
    console.error('Login failed:', error.message);
    return;
  }

  const jwt = data.session.access_token;
  console.log('✅ Logged in');

  // Test 1: Check if the token is configured
  console.log('\n📡 Testing deploy-edge-function...');
  const testCode = `Deno.serve(() => new Response("pong from test " + new Date().toISOString()));`;

  const res = await fetch(`${SUPABASE_URL}/functions/v1/deploy-edge-function`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'apikey': ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      slug: 'test-ping',
      sourceCode: testCode,
    }),
  });

  console.log('Status:', res.status);
  const body = await res.text();
  console.log('Response:', body);

  await supabase.auth.signOut();
  console.log('\n🏁 Done!');
}

main().catch(console.error);
