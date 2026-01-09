// Edge Function para busca no Google
// Usa Google Custom Search API para buscar informações na web

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Inicializa Supabase Admin Client para acessar secrets
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados');
      return new Response(
        JSON.stringify({ error: 'Configuração do servidor incompleta' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Busca as chaves da API do Google
    let googleApiKey: string | null = null;
    let googleCx: string | null = null;

    // Buscar API Key
    googleApiKey = Deno.env.get('GOOGLE_API_KEY') ?? null;
    if (!googleApiKey) {
      try {
        const { data: apiKeyData } = await supabaseAdmin.rpc('get_encrypted_secret', {
          p_secret_name: 'GOOGLE_API_KEY'
        });
        if (apiKeyData) googleApiKey = apiKeyData;
      } catch (e) {
        console.warn('Erro ao buscar GOOGLE_API_KEY:', e);
      }
    }

    // Buscar Custom Search Engine ID (CX)
    googleCx = Deno.env.get('GOOGLE_CX') ?? null;
    if (!googleCx) {
      try {
        const { data: cxData } = await supabaseAdmin.rpc('get_encrypted_secret', {
          p_secret_name: 'GOOGLE_CX'
        });
        if (cxData) googleCx = cxData;
      } catch (e) {
        console.warn('Erro ao buscar GOOGLE_CX:', e);
      }
    }

    if (!googleApiKey || !googleCx) {
      return new Response(
        JSON.stringify({ 
          error: 'Google API Key ou Custom Search Engine ID não configurados',
          details: {
            message: 'Configure GOOGLE_API_KEY e GOOGLE_CX nas secrets do Supabase',
            instructions: 'Dashboard → Edge Functions → Settings → Secrets'
          }
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // 2. Extrai a query do body
    const requestBody = await req.json();
    const { query, num = 5 } = requestBody;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Query de busca inválida ou vazia' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`Buscando no Google: "${query}"`);

    // 3. Chama a Google Custom Search API
    const searchUrl = new URL('https://www.googleapis.com/customsearch/v1');
    searchUrl.searchParams.set('key', googleApiKey);
    searchUrl.searchParams.set('cx', googleCx);
    searchUrl.searchParams.set('q', query);
    searchUrl.searchParams.set('num', Math.min(num, 10).toString()); // Máximo 10 resultados

    const googleResponse = await fetch(searchUrl.toString());

    if (!googleResponse.ok) {
      const errorText = await googleResponse.text();
      console.error('Erro na Google Search API:', errorText);
      
      return new Response(
        JSON.stringify({ 
          error: 'Erro ao buscar no Google',
          details: errorText
        }),
        { 
          status: googleResponse.status, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const searchData = await googleResponse.json();

    // 4. Formatar resultados
    const results = (searchData.items || []).map((item: any) => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet,
      displayLink: item.displayLink,
    }));

    return new Response(
      JSON.stringify({ 
        results,
        searchInformation: searchData.searchInformation || {}
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Erro inesperado na Edge Function:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Erro interno do servidor',
        message: error.message,
        details: error.stack
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

