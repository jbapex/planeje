// Edge Function para testar modelos de geração de imagem disponíveis
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Configuração do servidor incompleta' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Busca a API key do OpenAI
    let openaiApiKey: string | null = null;
    
    openaiApiKey = Deno.env.get('OPENAI_API_KEY') ?? null;
    
    if (!openaiApiKey) {
      try {
        const { data: apiKeyData } = await supabaseAdmin.rpc('get_encrypted_secret', {
          p_secret_name: 'OPENAI_API_KEY'
        });
        if (apiKeyData) openaiApiKey = apiKeyData;
      } catch (e) {
        console.warn('Erro ao buscar via RPC:', e);
      }
    }

    if (!openaiApiKey) {
      try {
        const { data: secretData } = await supabaseAdmin
          .from('app_secrets')
          .select('secret_value')
          .eq('name', 'OPENAI_API_KEY')
          .single();
        if (secretData?.secret_value) openaiApiKey = secretData.secret_value;
      } catch (e) {
        console.warn('Erro ao buscar da tabela:', e);
      }
    }

    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: 'OpenAI API key não encontrada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const modelsToTest = [
      { name: 'DALL-E 3', model: 'dall-e-3' },
      { name: 'DALL-E 2', model: 'dall-e-2' },
      { name: 'GPT-Image-1', model: 'gpt-image-1' },
      { name: 'GPT-Image-1.5', model: 'gpt-image-1.5' },
    ];

    const results = [];

    for (const { name, model } of modelsToTest) {
      try {
        const response = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: model,
            prompt: 'A simple red circle on white background',
            n: 1,
            size: '1024x1024',
          }),
        });

        const data = await response.json();

        if (response.ok) {
          results.push({
            name,
            model,
            available: true,
            imageUrl: data.data?.[0]?.url || null,
            message: 'Modelo disponível e funcionando!',
          });
        } else {
          results.push({
            name,
            model,
            available: false,
            error: data.error?.message || 'Erro desconhecido',
            code: data.error?.code || response.status,
          });
        }
      } catch (error) {
        results.push({
          name,
          model,
          available: false,
          error: error.message || 'Erro ao testar modelo',
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        results,
        summary: {
          available: results.filter(r => r.available).map(r => r.name),
          unavailable: results.filter(r => !r.available).map(r => r.name),
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

