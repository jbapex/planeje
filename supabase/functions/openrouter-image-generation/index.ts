// Edge Function para geração de imagens via OpenRouter
// Suporta modelos como Stable Diffusion, DALL-E, Flux, etc.

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

    // 1. Busca a API key do OpenRouter
    let openrouterApiKey: string | null = null;
    let sourceUsed = '';

    // Método 1: Variável de ambiente da Edge Function (RECOMENDADO)
    openrouterApiKey = Deno.env.get('OPENROUTER_API_KEY') ?? null;
    if (openrouterApiKey) {
      sourceUsed = 'variável de ambiente (OPENROUTER_API_KEY)';
      console.log('✅ API key obtida da variável de ambiente');
    }

    // Método 2: Tabela app_secrets via RPC (fallback)
    if (!openrouterApiKey) {
      try {
        const { data: apiKeyData, error: rpcError } = await supabaseAdmin.rpc('get_encrypted_secret', {
          p_secret_name: 'OPENROUTER_API_KEY'
        });

        if (!rpcError && apiKeyData) {
          openrouterApiKey = apiKeyData;
          sourceUsed = 'tabela app_secrets (RPC)';
          console.log('✅ API key obtida da tabela app_secrets via RPC');
        }
      } catch (rpcError) {
        console.warn('⚠️ Erro ao buscar API key via RPC:', rpcError);
      }
    }

    // Método 3: Buscar diretamente da tabela app_secrets (último recurso)
    if (!openrouterApiKey) {
      try {
        const { data: secretData, error: tableError } = await supabaseAdmin
          .from('app_secrets')
          .select('secret_value')
          .eq('name', 'OPENROUTER_API_KEY')
          .single();

        if (!tableError && secretData?.secret_value) {
          openrouterApiKey = secretData.secret_value;
          sourceUsed = 'tabela app_secrets (query direta)';
          console.log('✅ API key obtida diretamente da tabela app_secrets');
        }
      } catch (tableError) {
        console.warn('⚠️ Erro ao buscar da tabela app_secrets:', tableError);
      }
    }

    if (!openrouterApiKey) {
      return new Response(
        JSON.stringify({ 
          error: 'OpenRouter API key não encontrada',
          details: 'Configure OPENROUTER_API_KEY nas secrets da Edge Function'
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`✅ Usando API key de: ${sourceUsed}`);

    // 2. Extrai os parâmetros do body da requisição
    const requestBody = await req.json();
    const { 
      prompt,
      model = 'black-forest-labs/flux-pro', // Modelo padrão de imagem
      width = 1024,
      height = 1024,
      n = 1,
      quality = 'standard',
      imageBase64, // Para img2img
      strength = 0.7, // Para img2img
    } = requestBody;

    if (!prompt || !prompt.trim()) {
      return new Response(
        JSON.stringify({ error: 'Prompt é obrigatório' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`Gerando imagem com modelo ${model}, prompt: "${prompt.substring(0, 50)}..."`);

    // 3. Prepara o body da requisição para OpenRouter
    // OpenRouter usa o mesmo formato da API OpenAI para geração de imagens
    const openrouterBody: any = {
      model,
      prompt: prompt.trim(),
      n: Math.min(n || 1, 4), // Máximo 4 imagens
      size: `${width}x${height}`,
    };

    // Adicionar qualidade se suportado (DALL-E 3)
    if (quality && (model.includes('dall-e') || model.includes('dalle'))) {
      openrouterBody.quality = quality;
    }

    // Para img2img (transformação de imagem)
    if (imageBase64) {
      openrouterBody.image = imageBase64;
      openrouterBody.strength = strength || 0.7;
    }

    // 4. Chama a API do OpenRouter para geração de imagens
    const openrouterResponse = await fetch('https://openrouter.ai/api/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': supabaseUrl,
        'X-Title': 'JB APEX - Assistente de Projetos',
      },
      body: JSON.stringify(openrouterBody),
    });

    // 5. Verifica se a resposta foi bem-sucedida
    if (!openrouterResponse.ok) {
      const errorText = await openrouterResponse.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }

      console.error('Erro na API do OpenRouter:', {
        status: openrouterResponse.status,
        error: errorData
      });

      let errorMessage = 'Erro ao gerar imagem';
      if (openrouterResponse.status === 401 || openrouterResponse.status === 403) {
        errorMessage = 'Chave de API do OpenRouter inválida ou expirada';
      } else if (openrouterResponse.status === 429) {
        errorMessage = 'Limite de requisições excedido. Tente novamente mais tarde.';
      } else if (errorData?.error?.message) {
        errorMessage = errorData.error.message;
      }

      return new Response(
        JSON.stringify({ error: errorMessage, details: errorData }),
        { 
          status: openrouterResponse.status, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // 6. Processa a resposta
    const data = await openrouterResponse.json();
    
    // OpenRouter retorna no formato OpenAI: { data: [{ url: "...", ... }] }
    const imageUrl = data?.data?.[0]?.url || data?.data?.[0]?.b64_json || null;
    
    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: 'Nenhuma imagem retornada pela API' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        imageUrl,
        model,
        prompt: prompt.trim(),
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

