import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PROJECT_REF = 'kjjljpllyjnvitemapox';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const managementToken = Deno.env.get('SUPABASE_MANAGEMENT_TOKEN');

    if (!managementToken) {
      return new Response(JSON.stringify({ error: 'SUPABASE_MANAGEMENT_TOKEN is not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify the user is admin
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check admin role
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roleData } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { slug, sourceCode } = await req.json();

    if (!slug || typeof slug !== 'string') {
      return new Response(JSON.stringify({ error: 'slug is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!sourceCode || typeof sourceCode !== 'string') {
      return new Response(JSON.stringify({ error: 'sourceCode is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Deploying edge function: ${slug} (${sourceCode.length} bytes)`);
    const startTime = Date.now();

    // First, check if the function already exists
    const checkRes = await fetch(
      `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/${slug}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${managementToken}`,
        },
      }
    );
    await checkRes.text(); // consume body

    const functionExists = checkRes.status === 200;

    // Build multipart form data with the source code as a file
    const encoder = new TextEncoder();
    const boundary = '----FormBoundary' + crypto.randomUUID().replace(/-/g, '');
    
    // Create the file content as index.ts
    const fileContent = sourceCode;
    
    let body: string;
    let contentType: string;
    let method: string;
    let url: string;

    if (functionExists) {
      // UPDATE existing function using PATCH with multipart
      method = 'PATCH';
      url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/${slug}`;
    } else {
      // CREATE new function using POST with multipart  
      method = 'POST';
      url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions`;
    }

    // Use multipart/form-data as required by the Management API
    const formData = new FormData();
    
    // The Management API expects a file upload with the function code
    const blob = new Blob([fileContent], { type: 'application/typescript' });
    formData.append('slug', slug);
    formData.append('name', slug);
    formData.append('verify_jwt', 'false');
    formData.append('import_map', 'false');
    formData.append('entrypoint_path', 'index.ts');

    // For the file, we need to send it as a .tar.gz or as raw file
    // The Management API v1 expects the body as an eszip or raw source
    // Let's try with the raw body approach using application/json first
    // Actually the Management API expects multipart with file

    // Simpler approach: use the v1 API with the body as the source
    const deployRes = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${managementToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        slug: functionExists ? undefined : slug,
        name: slug,
        body: sourceCode,
        verify_jwt: false,
        entrypoint_path: 'index.ts',
      }),
    });

    const deployBody = await deployRes.text();
    const executionTime = Date.now() - startTime;

    let deployResult: any;
    try {
      deployResult = JSON.parse(deployBody);
    } catch {
      deployResult = { raw: deployBody };
    }

    if (!deployRes.ok) {
      console.error(`Deploy failed: ${deployRes.status}`, deployBody);
      return new Response(JSON.stringify({
        status: 'error',
        error: deployResult.message || deployResult.error || `Deploy failed with status ${deployRes.status}`,
        details: deployResult,
        executionTime,
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Deploy succeeded for ${slug} in ${executionTime}ms`);

    return new Response(JSON.stringify({
      status: 'success',
      slug,
      action: functionExists ? 'updated' : 'created',
      executionTime,
      details: deployResult,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('Deploy edge function error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
