import { createClient } from '@supabase/supabase-js';
const sb = createClient('https://kjjljpllyjnvitemapox.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqamxqcGxseWpudml0ZW1hcG94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNjM2NDksImV4cCI6MjA4ODczOTY0OX0.V6z69-vY-z5c1yA-fAP_X0PKWCzrS2Es4sfOckAet4I');
await sb.auth.signInWithPassword({email:'jj1212t@gmail.com',password:'543211'});

// List all extensions
const {data: d1, error: e1} = await sb.rpc('exec_sql_return', {
  query: "SELECT json_agg(extname ORDER BY extname) as exts FROM pg_extension"
});
console.log('All extensions:', JSON.stringify(d1));
if (e1) console.log('Error:', JSON.stringify(e1));

// Try to create http extension
console.log('\nTrying CREATE EXTENSION http...');
const {data: d2, error: e2} = await sb.rpc('exec_sql', {
  query: "CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions"
});
console.log('Create result:', JSON.stringify(d2));
if (e2) console.log('Create error:', JSON.stringify(e2));

// Check again
const {data: d3, error: e3} = await sb.rpc('exec_sql_return', {
  query: "SELECT json_agg(extname ORDER BY extname) as exts FROM pg_extension"
});
console.log('\nExtensions after:', JSON.stringify(d3));
if (e3) console.log('Error:', JSON.stringify(e3));

process.exit(0);
