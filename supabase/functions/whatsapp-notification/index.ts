import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { phone, message, instanceName = 'jbapex-instance' } = await req.json();

    if (!phone || !message) {
      return new Response(
        JSON.stringify({ error: 'phone e message são obrigatórios' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Obter configurações do Evolution API
    const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

    if (!evolutionApiUrl || !evolutionApiKey) {
      console.error('EVOLUTION_API_URL:', evolutionApiUrl ? 'configurado' : 'NÃO configurado');
      console.error('EVOLUTION_API_KEY:', evolutionApiKey ? 'configurado' : 'NÃO configurado');
      
      return new Response(
        JSON.stringify({ 
          error: 'EVOLUTION_API_URL ou EVOLUTION_API_KEY não configuradas',
          details: 'Verifique se os secrets foram configurados corretamente no Supabase'
        }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Formatar número (remover caracteres especiais)
    const formattedPhone = phone.replace(/\D/g, '');

    // Validar formato do número (deve ter pelo menos 10 dígitos)
    if (formattedPhone.length < 10) {
      return new Response(
        JSON.stringify({ error: 'Número de telefone inválido. Use formato: código do país + DDD + número (ex: 5511999999999)' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('Enviando mensagem:', {
      phone: formattedPhone,
      instanceName,
      messageLength: message.length
    });

    // Enviar mensagem via Evolution API
    const response = await fetch(
      `${evolutionApiUrl}/message/sendText/${instanceName}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionApiKey,
        },
        body: JSON.stringify({
          number: formattedPhone,
          text: message,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('Erro do Evolution API:', data);
      throw new Error(data.message || data.error || 'Erro ao enviar mensagem');
    }

    console.log('Mensagem enviada com sucesso:', data);

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId: data.key?.id,
        data 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Erro ao processar requisição:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: 'Verifique os logs da Edge Function para mais detalhes'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

