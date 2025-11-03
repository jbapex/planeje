// Edge Function para ApexIA - Chat Público com OpenAI
// Esta função aceita requisições públicas (anon) e busca a API key no servidor

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
    // Usa service_role_key para poder acessar a tabela app_secrets sem autenticação do usuário
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

    // 1. Busca a API key do OpenAI - Tenta múltiplas fontes
    let openaiApiKey: string | null = null;
    let sourceUsed = '';

    // Método 1: Variável de ambiente da Edge Function (MAIS FÁCIL E RECOMENDADO)
    openaiApiKey = Deno.env.get('OPENAI_API_KEY') ?? null;
    if (openaiApiKey) {
      sourceUsed = 'variável de ambiente (OPENAI_API_KEY)';
      console.log('✅ API key obtida da variável de ambiente');
    }

    // Método 2: Tabela app_secrets via RPC (fallback)
    if (!openaiApiKey) {
      try {
        const { data: apiKeyData, error: rpcError } = await supabaseAdmin.rpc('get_encrypted_secret', {
          p_secret_name: 'OPENAI_API_KEY'
        });

        if (!rpcError && apiKeyData) {
          openaiApiKey = apiKeyData;
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
    if (!openaiApiKey) {
      try {
        const { data: secretData, error: tableError } = await supabaseAdmin
          .from('app_secrets')
          .select('secret_value')
          .eq('name', 'OPENAI_API_KEY')
          .single();

        if (!tableError && secretData?.secret_value) {
          openaiApiKey = secretData.secret_value;
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
    if (!openaiApiKey) {
      console.error('❌ OpenAI API key não encontrada em nenhuma fonte');
      console.error('Tentou buscar de:');
      console.error('  1. Variável de ambiente OPENAI_API_KEY');
      console.error('  2. RPC get_encrypted_secret');
      console.error('  3. Tabela app_secrets diretamente');
      
      return new Response(
        JSON.stringify({ 
          error: 'Could not retrieve OpenAI API key. Please ensure it\'s set in the Vault and the function has the correct permissions.',
          details: {
            message: 'A chave OPENAI_API_KEY deve ser configurada em uma das seguintes formas:',
            options: [
              '1. Variável de ambiente na Edge Function (Dashboard → Edge Functions → Settings → Secrets → Adicione OPENAI_API_KEY)',
              '2. Tabela app_secrets via RPC get_encrypted_secret',
              '3. Tabela app_secrets via query direta'
            ],
            instructions: 'Para configurar: Dashboard do Supabase → Edge Functions → Settings → Secrets → Adicione OPENAI_API_KEY com sua chave da OpenAI'
          }
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`✅ Usando API key de: ${sourceUsed}`);

    // 2. Extrai as mensagens do body da requisição
    const requestBody = await req.json();
    const { messages, model = 'gpt-4o', stream = true } = requestBody;

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

    // 3. Chama a API da OpenAI (com ou sem streaming)
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        stream,
      }),
    });

    // 4. Verifica se a resposta da OpenAI foi bem-sucedida
    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }

      console.error('Erro na API da OpenAI:', {
        status: openaiResponse.status,
        error: errorData
      });

      // Mensagens de erro específicas
      let errorMessage = 'Erro ao comunicar com a IA';
      if (openaiResponse.status === 401 || openaiResponse.status === 403) {
        errorMessage = 'Chave de API da OpenAI inválida ou expirada';
      } else if (openaiResponse.status === 429) {
        errorMessage = 'Limite de requisições da OpenAI excedido. Tente novamente mais tarde.';
      } else if (openaiResponse.status === 500) {
        errorMessage = 'Erro interno da OpenAI. Tente novamente mais tarde.';
      } else if (errorData?.error?.message) {
        errorMessage = errorData.error.message;
      }

      return new Response(
        JSON.stringify({ error: errorMessage, details: errorData }),
        { 
          status: openaiResponse.status, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // 5. Retorno conforme o modo
    if (stream) {
      // stream SSE para o cliente
      return new Response(openaiResponse.body, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // Sem stream: retorna JSON com o conteúdo completo
    const data = await openaiResponse.json();
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

