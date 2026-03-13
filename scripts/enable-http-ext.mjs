import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://kjjljpllyjnvitemapox.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqamxqcGxseWpudml0ZW1hcG94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNjM2NDksImV4cCI6MjA4ODczOTY0OX0.V6z69-vY-z5c1yA-fAP_X0PKWCzrS2Es4sfOckAet4I';

const supabase = createClient(SUPABASE_URL, ANON_KEY);

async function main() {
  console.log('🔐 Logging in...');
  const { data } = await supabase.auth.signInWithPassword({
    email: 'jj1212t@gmail.com', password: '543211',
  });
  if (!data.session) { console.error('Login failed'); return; }
  const jwt = data.session.access_token;

  // Try calling run-migration with a mode that could bypass execute_sql_admin 
  // First let's try the SQL directly through the edge function
  // The edge function's adminClient has service_role_key
  
  // Attempt 1: Try execute_sql_admin directly with CREATE EXTENSION
  console.log('\n📋 Attempt 1: execute_sql_admin for CREATE EXTENSION...');
  const { data: d1, error: e1 } = await supabase.rpc('execute_sql_admin', {
    sql_text: "CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions"
  });
  console.log('  data:', d1, 'error:', e1?.message);

  // Attempt 2: Try exec_sql
  console.log('\n📋 Attempt 2: exec_sql...');
  const { data: d2, error: e2 } = await supabase.rpc('exec_sql', {
    query: "CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions"
  });
  console.log('  data:', d2, 'error:', e2?.message);

  // Attempt 3: Check what DB functions exist for SQL execution
  console.log('\n📋 Attempt 3: List available SQL exec functions...');
  const { data: d3 } = await supabase.rpc('exec_sql_return', {
    query: "SELECT json_agg(row_to_json(t)) FROM (SELECT proname, prosecdef FROM pg_proc WHERE proname LIKE '%sql%' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')) t"
  });
  console.log('  SQL functions:', JSON.stringify(d3));

  await supabase.auth.signOut();
}

main().catch(console.error);
