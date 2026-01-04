// Edge Function para geração de imagens via Runware API
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
    const { 
      prompt, 
      imageBase64, 
      taskType = 'imageInference', // 'imageInference' para text-to-image ou image-to-image
      model = 'rundiffusion:130@100', // Modelo padrão do Runware
      width = 1024,
      height = 1024,
      steps = 30, // Nome correto conforme documentação
      CFGScale = 7.5, // Nome correto conforme documentação (guidanceScale)
      seed,
      strength = 0.7 // Para image-to-image
    } = requestBody;

    // Função auxiliar para buscar API key do Runware
    const getRunwareKey = async (): Promise<string | null> => {
      let apiKey: string | null = Deno.env.get('RUNWARE_API_KEY') ?? null;
      
      if (!apiKey) {
        try {
          const { data: apiKeyData } = await supabaseAdmin.rpc('get_encrypted_secret', {
            p_secret_name: 'RUNWARE_API_KEY'
          });
          if (apiKeyData) apiKey = apiKeyData;
        } catch (e) {
          console.warn('Erro ao buscar Runware key via RPC:', e);
        }
      }

      if (!apiKey) {
        try {
          const { data: secretData } = await supabaseAdmin
            .from('app_secrets')
            .select('value')
            .eq('name', 'RUNWARE_API_KEY')
            .single();
          if (secretData?.value) apiKey = secretData.value;
        } catch (e) {
          console.warn('Erro ao buscar Runware key da tabela:', e);
        }
      }

      return apiKey;
    };

    const runwareApiKey = await getRunwareKey();

    if (!runwareApiKey) {
      return new Response(
        JSON.stringify({ 
          error: 'Chave de API do Runware não encontrada',
          hint: 'Configure RUNWARE_API_KEY nas variáveis de ambiente da Edge Function ou na tabela app_secrets'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validar prompt para text-to-image
    if (!imageBase64 && (!prompt || !prompt.trim())) {
      return new Response(
        JSON.stringify({ error: 'Prompt é obrigatório para text-to-image' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Gerar UUID único para a tarefa (formato UUID v4)
    const taskUUID = crypto.randomUUID();

    // Preparar payload do Runware (formato conforme documentação oficial)
    const runwareTask: Record<string, any> = {
      taskType: 'imageInference', // Sempre imageInference conforme documentação
      taskUUID: taskUUID,
      positivePrompt: prompt || '',
      width: width,
      height: height,
      model: model,
      outputType: 'URL', // Retornar URL da imagem
      outputFormat: 'jpg', // Formato JPG
      includeCost: true,
      numberResults: 1
    };

    // Adicionar parâmetros opcionais apenas se fornecidos
    if (steps) {
      runwareTask.steps = steps;
    }
    if (CFGScale) {
      runwareTask.CFGScale = CFGScale;
    }

    // Se tem seed, adicionar
    if (seed !== undefined && seed !== null) {
      runwareTask.seed = seed;
    }

    // Se tem imagem de referência, é image-to-image
    // Para image-to-image, o Runware requer fazer upload da imagem primeiro para obter um UUID
    if (imageBase64) {
      console.log('📤 Fazendo upload da imagem de referência para Runware...');
      
      // Fazer upload da imagem primeiro via Image Upload API
      const uploadTaskUUID = crypto.randomUUID();
      const uploadTask = {
        taskType: 'imageUpload',
        taskUUID: uploadTaskUUID,
        imageBase64: imageBase64
      };

      const uploadResponse = await fetch('https://api.runware.ai/v1', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${runwareApiKey}`,
        },
        body: JSON.stringify([uploadTask]),
      });

      if (!uploadResponse.ok) {
        const uploadErrorText = await uploadResponse.text();
        console.error('❌ Erro ao fazer upload da imagem:', uploadErrorText);
        return new Response(
          JSON.stringify({ 
            error: 'Erro ao fazer upload da imagem de referência',
            details: uploadErrorText,
            status: uploadResponse.status
          }),
          { status: uploadResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const uploadData = await uploadResponse.json();
      console.log('📥 Resposta do upload:', JSON.stringify(uploadData, null, 2));

      if (uploadData.errors && Array.isArray(uploadData.errors) && uploadData.errors.length > 0) {
        return new Response(
          JSON.stringify({ 
            error: 'Erro ao fazer upload da imagem',
            details: uploadData.errors
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!uploadData.data || !Array.isArray(uploadData.data) || uploadData.data.length === 0) {
        return new Response(
          JSON.stringify({ error: 'Resposta vazia do upload de imagem' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Pegar o UUID da imagem enviada
      const uploadedImageUUID = uploadData.data[0].imageUUID;
      console.log('✅ Imagem enviada com UUID:', uploadedImageUUID);

      // Usar o UUID no seedImage
      runwareTask.seedImage = uploadedImageUUID;
      runwareTask.strength = strength;
      
      // Se não tem prompt, usar um padrão
      if (!prompt || !prompt.trim()) {
        runwareTask.positivePrompt = 'Transform this image';
      }
    }

    // Fazer requisição para o Runware via HTTP REST API
    // Endpoint correto: https://api.runware.ai/v1 (não /v1/tasks)
    // Autenticação via header Authorization: Bearer <API_KEY>
    console.log('📤 Enviando requisição para Runware:', JSON.stringify([runwareTask], null, 2));
    
    const runwareResponse = await fetch('https://api.runware.ai/v1', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${runwareApiKey}`,
      },
      body: JSON.stringify([runwareTask]),
    });

    console.log('📥 Status da resposta Runware:', runwareResponse.status, runwareResponse.statusText);

    if (!runwareResponse.ok) {
      const errorText = await runwareResponse.text();
      console.error('❌ Erro do Runware API:', {
        status: runwareResponse.status,
        statusText: runwareResponse.statusText,
        errorText: errorText,
        headers: Object.fromEntries(runwareResponse.headers.entries())
      });
      
      let errorMessage = 'Erro ao gerar imagem via Runware';
      if (runwareResponse.status === 401 || runwareResponse.status === 403) {
        errorMessage = 'Chave de API do Runware inválida ou expirada';
      } else if (runwareResponse.status === 429) {
        errorMessage = 'Limite de requisições do Runware excedido. Tente novamente mais tarde.';
      } else if (runwareResponse.status === 400) {
        errorMessage = `Parâmetros inválidos: ${errorText}`;
      }
      
      return new Response(
        JSON.stringify({ 
          error: errorMessage,
          details: errorText,
          status: runwareResponse.status
        }),
        { status: runwareResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const runwareData = await runwareResponse.json();
    console.log('📥 Dados recebidos do Runware:', JSON.stringify(runwareData, null, 2));

    // Processar resposta do Runware
    // A resposta pode ter 'data' (array) com resultados ou 'errors' (array) com erros
    if (runwareData.errors && Array.isArray(runwareData.errors) && runwareData.errors.length > 0) {
      console.error('❌ Erros na resposta do Runware:', runwareData.errors);
      const firstError = runwareData.errors[0];
      return new Response(
        JSON.stringify({ 
          error: firstError.message || 'Erro ao processar tarefa no Runware',
          details: runwareData.errors,
          code: firstError.code
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!runwareData.data || !Array.isArray(runwareData.data) || runwareData.data.length === 0) {
      console.error('❌ Resposta sem dados válidos:', runwareData);
      return new Response(
        JSON.stringify({ 
          error: 'Resposta vazia do Runware',
          receivedData: runwareData
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Pegar o primeiro resultado
    const result = runwareData.data[0];
    
    if (!result.imageURL) {
      return new Response(
        JSON.stringify({ error: 'URL da imagem não encontrada na resposta do Runware' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        imageUrl: result.imageURL,
        imageUUID: result.imageUUID,
        taskUUID: result.taskUUID,
        cost: result.cost || null,
        model: result.model || model
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Erro na Edge Function runware-image-generation:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Erro interno ao gerar imagem',
        details: error.message || 'Erro desconhecido'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});


