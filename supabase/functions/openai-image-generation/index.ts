// Edge Function para geração de imagens com múltiplos modelos (DALL-E 2, DALL-E 3, Gemini Imagen)
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

    // Extrai os parâmetros da requisição
    const requestBody = await req.json();
    const { prompt, size = '1024x1024', quality = 'standard', style = 'vivid', n = 1, imageBase64, useVariation = false, model = 'dall-e-3' } = requestBody;

    // Função auxiliar para buscar API key do OpenAI
    const getOpenAIKey = async (): Promise<string | null> => {
      let apiKey: string | null = Deno.env.get('OPENAI_API_KEY') ?? null;
      
      if (!apiKey) {
        try {
          const { data: apiKeyData } = await supabaseAdmin.rpc('get_encrypted_secret', {
            p_secret_name: 'OPENAI_API_KEY'
          });
          if (apiKeyData) apiKey = apiKeyData;
        } catch (e) {
          console.warn('Erro ao buscar OpenAI key via RPC:', e);
        }
      }

      if (!apiKey) {
        try {
          const { data: secretData } = await supabaseAdmin
            .from('app_secrets')
            .select('secret_value')
            .eq('name', 'OPENAI_API_KEY')
            .single();
          if (secretData?.secret_value) apiKey = secretData.secret_value;
        } catch (e) {
          console.warn('Erro ao buscar OpenAI key da tabela:', e);
        }
      }

      return apiKey;
    };

    // Função auxiliar para buscar API key do Gemini
    const getGeminiKey = async (): Promise<string | null> => {
      let apiKey: string | null = Deno.env.get('GEMINI_API_KEY') ?? null;
      
      if (!apiKey) {
        try {
          const { data: apiKeyData } = await supabaseAdmin.rpc('get_encrypted_secret', {
            p_secret_name: 'GEMINI_API_KEY'
          });
          if (apiKeyData) apiKey = apiKeyData;
        } catch (e) {
          console.warn('Erro ao buscar Gemini key via RPC:', e);
        }
      }

      if (!apiKey) {
        try {
          const { data: secretData } = await supabaseAdmin
            .from('app_secrets')
            .select('secret_value')
            .eq('name', 'GEMINI_API_KEY')
            .single();
          if (secretData?.secret_value) apiKey = secretData.secret_value;
        } catch (e) {
          console.warn('Erro ao buscar Gemini key da tabela:', e);
        }
      }

      return apiKey;
    };

    // Se há imagem de referência e useVariation é true, usar Image Variation
    // IMPORTANTE: Verificar isso ANTES de validar o prompt, pois variações não precisam de prompt
    if (imageBase64 && useVariation) {
      // Gemini Imagen não suporta variações, então sempre usa DALL-E 2 para variações
      const variationModel = model === 'gemini-imagen-3' ? 'dall-e-2' : (model === 'dall-e-3' ? 'dall-e-2' : model);
      console.log(`Gerando variação de imagem com ${variationModel}...`);

      // Converter base64 para buffer binário
      let imageData = imageBase64;
      if (imageData.startsWith('data:image')) {
        // Remove o prefixo data:image/...;base64,
        imageData = imageData.split(',')[1];
      }

      // Decodificar base64 para bytes
      const binaryString = atob(imageData);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Criar FormData para upload da imagem
      // DALL-E 2 Image Variations requer imagem PNG quadrada (mesma largura e altura)
      // Buscar API key do OpenAI para variações (sempre usa DALL-E 2)
      const openaiApiKey = await getOpenAIKey();
      if (!openaiApiKey) {
        return new Response(
          JSON.stringify({ error: 'OpenAI API key não encontrada' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const formData = new FormData();
      const imageBlob = new Blob([bytes], { type: 'image/png' });
      formData.append('image', imageBlob, 'image.png');
      formData.append('n', '1');
      formData.append('size', size === '1024x1024' ? '1024x1024' : '256x256'); // DALL-E 2 só suporta 256x256 ou 1024x1024

      const openaiResponse = await fetch('https://api.openai.com/v1/images/variations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
        },
        body: formData,
      });

      const data = await openaiResponse.json();

      if (!openaiResponse.ok) {
        console.error('Erro na API da OpenAI (variação):', data);
        let errorMessage = 'Erro ao gerar variação da imagem';
        
        if (openaiResponse.status === 400) {
          errorMessage = data.error?.message || 'Imagem inválida ou muito grande';
        } else if (openaiResponse.status === 401 || openaiResponse.status === 403) {
          errorMessage = 'Chave de API da OpenAI inválida ou expirada';
        } else if (openaiResponse.status === 429) {
          errorMessage = 'Limite de requisições da OpenAI excedido. Tente novamente mais tarde.';
        }

        return new Response(
          JSON.stringify({ 
            error: errorMessage,
            details: data.error || data
          }),
          { 
            status: openaiResponse.status, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      if (data.data && data.data.length > 0 && data.data[0].url) {
        return new Response(
          JSON.stringify({
            success: true,
            imageUrl: data.data[0].url,
            method: 'variation',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: 'Resposta inválida da OpenAI (variação)' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Caso contrário, usar modelo selecionado com prompt
    // Validar prompt apenas se NÃO for uma variação de imagem
    if (!imageBase64 || !useVariation) {
      if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        return new Response(
          JSON.stringify({ error: 'Prompt é obrigatório e deve ser uma string não vazia' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Se o modelo for Gemini Imagen, usar API do Gemini
    if (model === 'gemini-imagen-3') {
      console.log(`Gerando imagem com Gemini Imagen 3. Prompt: "${prompt.substring(0, 50)}..."`);
      
      const geminiApiKey = await getGeminiKey();
      if (!geminiApiKey) {
        console.error('GEMINI_API_KEY não encontrada');
        return new Response(
          JSON.stringify({ 
            error: 'Gemini API key não encontrada. Configure GEMINI_API_KEY nas variáveis de ambiente do Supabase.',
            hint: 'Acesse: Supabase Dashboard → Settings → Edge Functions → Secrets → Adicione GEMINI_API_KEY'
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Gemini API key encontrada. Tamanho:', geminiApiKey.length);

      try {
        // IMPORTANTE: Gemini Imagen 3 pode não estar disponível via Generative Language API
        // Pode requerer Vertex AI com autenticação OAuth2
        // Vamos tentar o endpoint mais comum primeiro
        
        console.log('Tentando endpoint do Gemini Imagen...');
        
        // Endpoint: Generative Language API
        // Nota: Este endpoint pode não existir para Imagen 3
        const genLangEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:generateImages?key=${geminiApiKey}`;
        
        console.log('Endpoint:', genLangEndpoint.replace(geminiApiKey, 'KEY_HIDDEN'));
        
        const requestBody = {
          prompt: prompt.trim(),
          number_of_images: 1,
          aspect_ratio: size === '1024x1024' ? '1:1' : size === '1792x1024' ? '16:9' : '9:16',
        };
        
        console.log('Request body:', JSON.stringify(requestBody));
        
        let geminiResponse;
        let responseText;
        
        try {
          // Tentar com Generative Language API
          geminiResponse = await fetch(genLangEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          });

          console.log('Response status:', geminiResponse.status);
          console.log('Response headers:', Object.fromEntries(geminiResponse.headers.entries()));

          // Ler o texto da resposta primeiro para debug
          responseText = await geminiResponse.text();
          console.log('Response text length:', responseText.length);
          console.log('Response text (primeiros 1000 chars):', responseText.substring(0, 1000));

          // Verificar se a resposta está vazia
          if (!responseText || responseText.trim().length === 0) {
            console.error('Resposta vazia da API do Gemini');
            // Verificar se é erro de saldo/quota pelo status code
            if (geminiResponse.status === 429 || geminiResponse.status === 402) {
              throw new Error('Saldo ou quota insuficiente na conta do Google/Gemini. Verifique sua conta no Google Cloud Console.');
            }
            throw new Error('Resposta vazia da API do Gemini. Pode ser saldo insuficiente, endpoint incorreto ou API key inválida.');
          }

          // Verificar se a resposta contém indicadores de erro de saldo/quota
          const responseLower = responseText.toLowerCase();
          if (responseLower.includes('quota') || responseLower.includes('billing') || 
              responseLower.includes('insufficient') || responseLower.includes('credit') ||
              responseLower.includes('payment') || responseLower.includes('limit exceeded')) {
            console.error('Possível erro de saldo/quota detectado na resposta');
            throw new Error('Saldo ou quota insuficiente na conta do Google/Gemini. Verifique sua conta e adicione créditos se necessário.');
          }

          // Tentar fazer parse do JSON
          let geminiData;
          try {
            geminiData = JSON.parse(responseText);
          } catch (parseError) {
            console.error('Erro ao fazer parse do JSON:', parseError);
            console.error('Resposta completa:', responseText);
            // Verificar se a resposta contém HTML (pode ser página de erro)
            if (responseText.includes('<html') || responseText.includes('<!DOCTYPE')) {
              throw new Error('A API do Gemini retornou uma página HTML ao invés de JSON. Isso pode indicar erro de autenticação, saldo insuficiente ou endpoint incorreto.');
            }
            throw new Error(`Resposta inválida da API do Gemini: ${responseText.substring(0, 200)}`);
          }

          if (!geminiResponse.ok) {
            console.error('Erro na API do Gemini:', geminiData);
            
            // Tratamento específico para erros comuns
            let errorMessage = 'Erro ao gerar imagem com Gemini';
            let hint: string | undefined = undefined;
            
            if (geminiResponse.status === 429) {
              errorMessage = 'Quota excedida ou limite de requisições atingido na conta do Google/Gemini.';
              hint = 'Verifique sua conta no Google Cloud Console e adicione créditos ou aguarde o reset da quota.';
            } else if (geminiResponse.status === 402) {
              errorMessage = 'Pagamento necessário. Saldo insuficiente na conta do Google/Gemini.';
              hint = 'Adicione créditos na sua conta do Google Cloud Console para continuar usando o Gemini Imagen.';
            } else if (geminiResponse.status === 404) {
              errorMessage = 'Endpoint do Gemini Imagen não encontrado. O modelo pode não estar disponível ou requer Vertex AI.';
              hint = 'O Gemini Imagen 3 pode requerer Vertex AI ao invés da Generative Language API. Consulte a documentação do Google Cloud.';
            } else if (geminiResponse.status === 403) {
              errorMessage = 'Acesso negado ao Gemini Imagen. Verifique se sua API key tem permissão para usar Imagen 3.';
              hint = 'Verifique se a API key tem as permissões corretas e se o billing está ativado na conta do Google Cloud.';
            } else if (geminiResponse.status === 401) {
              errorMessage = 'API key do Gemini inválida ou expirada. Verifique a GEMINI_API_KEY no Supabase.';
              hint = 'Verifique se a GEMINI_API_KEY está configurada corretamente no Supabase Dashboard (Settings → Edge Functions → Secrets).';
            } else if (geminiData.error?.message) {
              errorMessage = geminiData.error.message;
              // Verificar se a mensagem de erro menciona saldo/quota
              const errorMsgLower = errorMessage.toLowerCase();
              if (errorMsgLower.includes('quota') || errorMsgLower.includes('billing') || 
                  errorMsgLower.includes('insufficient') || errorMsgLower.includes('credit') ||
                  errorMsgLower.includes('payment')) {
                hint = 'Verifique sua conta no Google Cloud Console e adicione créditos se necessário.';
              }
            } else if (geminiData.error?.code) {
              errorMessage = `Erro ${geminiData.error.code}: ${geminiData.error.message || 'Erro desconhecido'}`;
            }
            
            return new Response(
              JSON.stringify({ 
                error: errorMessage,
                details: geminiData.error || geminiData,
                status: geminiResponse.status,
                hint: hint
              }),
              { 
                status: geminiResponse.status || 500, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            );
          }

          // Tentar diferentes estruturas de resposta possíveis
          const imageUrl = geminiData.generatedImages?.[0]?.imageUrl || 
                          geminiData.generatedImages?.[0]?.url ||
                          geminiData.images?.[0]?.imageUrl ||
                          geminiData.images?.[0]?.url || 
                          geminiData.imageUrl ||
                          geminiData.predictions?.[0]?.bytesBase64Encoded ||
                          geminiData.bytesBase64Encoded;
          
          if (imageUrl) {
            // Se for base64, converter para data URL
            const finalImageUrl = imageUrl.startsWith('data:') || imageUrl.startsWith('http') 
              ? imageUrl 
              : `data:image/png;base64,${imageUrl}`;
            
            return new Response(
              JSON.stringify({
                success: true,
                imageUrl: finalImageUrl,
                model: 'gemini-imagen-3',
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // Log da estrutura completa para debug
          console.log('Estrutura completa da resposta:', JSON.stringify(geminiData, null, 2));
          
          return new Response(
            JSON.stringify({ 
              error: 'Resposta inválida do Gemini - nenhuma URL de imagem encontrada',
              details: geminiData
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (fetchError) {
          console.error('Erro ao chamar Gemini API:', fetchError);
          console.error('Tipo do erro:', fetchError.constructor?.name);
          console.error('Stack trace:', fetchError.stack);
          
          // Se já temos a resposta mas houve erro no parse
          if (geminiResponse && responseText) {
            console.error('Resposta recebida mas inválida:', responseText.substring(0, 500));
          }
          
          // Se o erro for de parse JSON, pode ser que a resposta não seja JSON
          if (fetchError.message && (fetchError.message.includes('JSON') || fetchError.message.includes('Unexpected end'))) {
            const errorDetails = responseText 
              ? `Resposta recebida: ${responseText.substring(0, 200)}`
              : 'Nenhuma resposta recebida';
            throw new Error(`Erro ao processar resposta da API do Gemini: ${fetchError.message}. ${errorDetails}. O endpoint pode não existir ou a resposta não é JSON válido.`);
          }
          
          throw fetchError;
        }
      } catch (geminiError) {
        console.error('Erro completo ao processar Gemini:', geminiError);
        console.error('Tipo do erro:', geminiError.constructor?.name);
        console.error('Mensagem:', geminiError.message);
        console.error('Stack:', geminiError.stack);
        
        const errorMessage = geminiError.message || geminiError.toString();
        const errorLower = errorMessage.toLowerCase();
        const isJsonError = errorMessage.includes('JSON') || errorMessage.includes('Unexpected end');
        const isQuotaError = errorLower.includes('quota') || errorLower.includes('saldo') || 
                            errorLower.includes('billing') || errorLower.includes('insufficient') ||
                            errorLower.includes('credit') || errorLower.includes('payment');
        
        let finalError = '';
        let hint = '';
        
        if (isQuotaError) {
          finalError = 'Saldo ou quota insuficiente na conta do Google/Gemini.';
          hint = 'Verifique sua conta no Google Cloud Console (https://console.cloud.google.com/) e adicione créditos se necessário. O Gemini Imagen requer uma conta com billing ativado.';
        } else if (isJsonError) {
          finalError = 'O endpoint do Gemini Imagen 3 pode não estar disponível via Generative Language API. O modelo pode requerer Vertex AI ou não estar disponível para sua conta.';
          hint = 'O Gemini Imagen 3 pode não estar disponível via Generative Language API. Considere usar DALL-E 3 ou DALL-E 2, ou configure Vertex AI para usar o Gemini Imagen. Também verifique se há saldo suficiente na conta do Google.';
        } else {
          finalError = 'Erro ao conectar com a API do Gemini. Verifique a configuração da API key e o endpoint.';
          hint = 'Certifique-se de que a GEMINI_API_KEY está configurada corretamente no Supabase (Settings → Edge Functions → Secrets), que há saldo suficiente na conta do Google, e que o modelo Imagen 3 está disponível para sua conta.';
        }
        
        return new Response(
          JSON.stringify({ 
            error: finalError,
            details: errorMessage,
            hint: hint
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Caso contrário, usar OpenAI (DALL-E 2 ou DALL-E 3)
    const openaiApiKey = await getOpenAIKey();
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: 'OpenAI API key não encontrada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const dalleModel = model === 'dall-e-2' ? 'dall-e-2' : 'dall-e-3';
    console.log(`Gerando imagem com ${dalleModel}. Prompt: "${prompt.substring(0, 50)}..."`);

    // Chama a API da OpenAI para gerar imagem
    const openaiResponse = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: dalleModel,
        prompt: prompt.trim(),
        size: size, // 1024x1024, 1792x1024, ou 1024x1792 (DALL-E 3) ou 256x256, 512x512, 1024x1024 (DALL-E 2)
        ...(dalleModel === 'dall-e-3' ? {
          quality: quality, // standard ou hd (apenas DALL-E 3)
          style: style, // vivid ou natural (apenas DALL-E 3)
        } : {}),
        n: dalleModel === 'dall-e-3' ? 1 : n, // DALL-E 3 sempre retorna 1 imagem
      }),
    });

    const data = await openaiResponse.json();

    if (!openaiResponse.ok) {
      console.error('Erro na API da OpenAI:', data);
      let errorMessage = 'Erro ao gerar imagem';
      
      if (openaiResponse.status === 401 || openaiResponse.status === 403) {
        errorMessage = 'Chave de API da OpenAI inválida ou expirada';
      } else if (openaiResponse.status === 429) {
        errorMessage = 'Limite de requisições da OpenAI excedido. Tente novamente mais tarde.';
      } else if (openaiResponse.status === 400) {
        errorMessage = data.error?.message || 'Prompt inválido ou muito longo';
      } else if (openaiResponse.status === 500) {
        errorMessage = 'Erro interno da OpenAI. Tente novamente mais tarde.';
      }

      return new Response(
        JSON.stringify({ 
          error: errorMessage,
          details: data.error || data
        }),
        { 
          status: openaiResponse.status, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Retorna a URL da imagem gerada
    if (data.data && data.data.length > 0 && data.data[0].url) {
      return new Response(
        JSON.stringify({
          success: true,
          imageUrl: data.data[0].url,
          revisedPrompt: data.data[0].revised_prompt || prompt, // DALL-E 3 pode revisar o prompt
          model: dalleModel,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Resposta inválida da OpenAI' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Erro inesperado:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Erro ao processar requisição' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

