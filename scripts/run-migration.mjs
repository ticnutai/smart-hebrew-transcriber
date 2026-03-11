// Run migration: add new columns to user_preferences
import { createClient } from '@supabase/supabase-js';

const url = 'https://kjjljpllyjnvitemapox.supabase.co';
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqamxqcGxseWpudml0ZW1hcG94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNjM2NDksImV4cCI6MjA4ODczOTY0OX0.V6z69-vY-z5c1yA-fAP_X0PKWCzrS2Es4sfOckAet4I';

const supabase = createClient(url, key);

// Sign in first (need authenticated user with admin role for exec_sql)
const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.log('Usage: node scripts/run-migration.mjs <email> <password>');
  process.exit(1);
}

const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
if (authError) {
  console.error('Auth error:', authError.message);
  process.exit(1);
}

const sql = `
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS engine text DEFAULT 'groq';
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS source_language text DEFAULT 'auto';
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS custom_themes jsonb DEFAULT '[]'::jsonb;
`;

const { data, error } = await supabase.rpc('exec_sql', { query: sql });
if (error) {
  console.error('Migration error:', error.message);
  process.exit(1);
}
console.log('Migration successful:', data);
