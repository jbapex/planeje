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

    const usableKey = (value: string | null | undefined) => {
      const key = String(value || '').trim();
      return key.startsWith('sk-') ? key : '';
    };

    const readSecretCandidates = async (name: string) => {
      const found: string[] = [];
      const fromEnv = Deno.env.get(name);
      if (fromEnv) found.push(fromEnv);
      try {
        const { data, error } = await supabaseAdmin.rpc('get_encrypted_secret', { p_secret_name: name });
        if (!error && data) found.push(String(data));
      } catch (rpcError) {
        console.warn(`Falha ao ler ${name} via RPC`);
      }
      try {
        const { data, error } = await supabaseAdmin
          .from('app_secrets')
          .select('secret_value')
          .eq('name', name)
          .maybeSingle();
        if (!error && data?.secret_value) found.push(String(data.secret_value));
      } catch (tableError) {
        console.warn(`Falha ao ler ${name} na tabela`);
      }
      return found;
    };

    // A chave colada em Configurações → Integrações fica em app_secrets.
    // Texto que não começa com sk- (ambiente ou tabela) é ignorado.
    const openrouterCandidates = await readSecretCandidates('OPENROUTER_API_KEY');
    const openaiCandidates = await readSecretCandidates('OPENAI_API_KEY');
    let provider: 'openrouter' | 'openai' = 'openrouter';
    let apiKey = openrouterCandidates.map(usableKey).find(Boolean) || '';
    let endpoint = 'https://openrouter.ai/api/v1/chat/completions';
    const providerNotice = '';

    if (!apiKey) {
      console.warn('OPENROUTER_API_KEY ausente ou inválida; usando OpenAI');
      apiKey = openaiCandidates.map(usableKey).find(Boolean) || '';
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: 'Nem o OpenRouter nem a OpenAI têm chave válida. Cole em Configurações → Integrações.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      provider = 'openai';
      endpoint = 'https://api.openai.com/v1/chat/completions';
    } else {
      console.log('Usando chave OpenRouter válida (ambiente ou Configurações)');
    }

    // 2. Extrai os parâmetros do body da requisição
    let requestBody = await req.json();
    if (typeof requestBody === 'string') {
      try {
        requestBody = JSON.parse(requestBody);
      } catch {
        return new Response(JSON.stringify({ error: 'Body JSON inválido' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }
    if (requestBody?.probe === true) {
      return new Response(JSON.stringify({ provider, ready: provider === 'openrouter' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const {
      messages,
      model = 'openai/gpt-4o',
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

    const usedModel = provider === 'openai'
      ? (String(model).startsWith('openai/') ? String(model).slice('openai/'.length) : 'gpt-4o-mini')
      : model;
    const usedStream = provider === 'openai' ? false : stream;
    console.log(`Processando chat com ${messages.length} mensagens, modelo: ${usedModel}, provedor: ${provider}`);

    // 3. Prepara o body da requisição
    const openrouterBody: any = {
      model: usedModel,
      messages,
      stream: usedStream,
    };

    if (temperature !== undefined) {
      openrouterBody.temperature = temperature;
    }
    if (max_tokens !== undefined) {
      openrouterBody.max_tokens = max_tokens;
    }

    // 4. Chama a API do OpenRouter (compatível com OpenAI)
    const openrouterResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(provider === 'openrouter' ? {
          'HTTP-Referer': supabaseUrl,
          'X-Title': 'JB APEX - Assistente de Projetos',
        } : {}),
      },
      body: JSON.stringify(openrouterBody),
    });

    // 5. Chave OpenRouter recusada: a conversa segue na OpenAI já salva.
    if (!openrouterResponse.ok && provider === 'openrouter' && (openrouterResponse.status === 401 || openrouterResponse.status === 403)) {
      const openaiKey = openaiCandidates.map(usableKey).find(Boolean) || '';
      if (openaiKey) {
        console.warn('OpenRouter recusou a chave; respondendo com OpenAI');
        const fallbackModel = String(model).startsWith('openai/') ? String(model).slice('openai/'.length) : 'gpt-4o-mini';
        const fallback = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ...openrouterBody, model: fallbackModel, stream: false }),
        });
        if (fallback.ok) {
          const data = await fallback.json();
          const content = data?.choices?.[0]?.message?.content ?? '';
          return new Response(JSON.stringify({ content }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

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
    if (usedStream) {
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
    const content = `${providerNotice}${data?.choices?.[0]?.message?.content ?? ''}`;
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

