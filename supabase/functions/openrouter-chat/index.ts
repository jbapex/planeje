// Edge Function para Assistente de Projetos - Chat com OpenRouter
// Esta função usa OpenRouter para acesso a múltiplos modelos de LLM

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

    // 1. Busca a API key do OpenRouter - Tenta múltiplas fontes
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
        } else if (rpcError) {
          console.warn('⚠️ Erro ao buscar API key via RPC:', rpcError.message || rpcError);
        }
      } catch (rpcError) {
        console.warn('⚠️ Exceção ao buscar API key via RPC:', rpcError);
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
        } else if (tableError) {
          console.warn('⚠️ Erro ao buscar da tabela app_secrets:', tableError.message || tableError);
        }
      } catch (tableError) {
        console.warn('⚠️ Exceção ao buscar da tabela app_secrets:', tableError);
      }
    }

    // Se ainda não encontrou, retorna erro detalhado
    if (!openrouterApiKey) {
      console.error('❌ OpenRouter API key não encontrada em nenhuma fonte');
      
      return new Response(
        JSON.stringify({ 
          error: 'Could not retrieve OpenRouter API key. Please ensure it\'s set in the Vault and the function has the correct permissions.',
          details: {
            message: 'A chave OPENROUTER_API_KEY deve ser configurada em uma das seguintes formas:',
            options: [
              '1. Variável de ambiente na Edge Function (Dashboard → Edge Functions → Settings → Secrets → Adicione OPENROUTER_API_KEY)',
              '2. Tabela app_secrets via RPC get_encrypted_secret',
              '3. Tabela app_secrets via query direta'
            ],
            instructions: 'Para configurar: Dashboard do Supabase → Edge Functions → Settings → Secrets → Adicione OPENROUTER_API_KEY com sua chave do OpenRouter'
          }
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
      messages, 
      model = 'openai/gpt-4o', // Modelo padrão do OpenRouter
      stream = true,
      temperature,
      max_tokens,
    } = requestBody;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Mensagens inválidas ou vazias' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`Processando chat com ${messages.length} mensagens, modelo: ${model}`);

    // 3. Prepara o body da requisição para OpenRouter
    const openrouterBody: any = {
      model,
      messages,
      stream,
    };

    if (temperature !== undefined) {
      openrouterBody.temperature = temperature;
    }
    if (max_tokens !== undefined) {
      openrouterBody.max_tokens = max_tokens;
    }

    // 4. Chama a API do OpenRouter (compatível com OpenAI)
    const openrouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': supabaseUrl, // Opcional mas recomendado pelo OpenRouter
        'X-Title': 'JB APEX - Assistente de Projetos', // Opcional
      },
      body: JSON.stringify(openrouterBody),
    });

    // 5. Verifica se a resposta do OpenRouter foi bem-sucedida
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

      // Mensagens de erro específicas
      let errorMessage = 'Erro ao comunicar com a IA';
      if (openrouterResponse.status === 401 || openrouterResponse.status === 403) {
        errorMessage = 'Chave de API do OpenRouter inválida ou expirada';
      } else if (openrouterResponse.status === 429) {
        errorMessage = 'Limite de requisições do OpenRouter excedido. Tente novamente mais tarde.';
      } else if (openrouterResponse.status === 500) {
        errorMessage = 'Erro interno do OpenRouter. Tente novamente mais tarde.';
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

    // 6. Retorno conforme o modo
    if (stream) {
      // Stream SSE para o cliente
      return new Response(openrouterResponse.body, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // Sem stream: retorna JSON com o conteúdo completo
    const data = await openrouterResponse.json();
    const content = data?.choices?.[0]?.message?.content ?? '';
    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    // Erro inesperado
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

