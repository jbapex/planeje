import { supabase } from '@/lib/customSupabaseClient';

/**
 * Chama openai-chat ou openrouter-chat no Supabase (service role lê a chave no servidor).
 * Evita depender de getOpenAIKey() no browser — mesma chave salva em Configurações funciona aqui.
 */
export async function invokeProjectsAiChat({
  messages,
  model = '',
  openaiModel = 'gpt-3.5-turbo',
  temperature = 0.7,
  max_tokens = 500,
}) {
  if (!messages?.length) {
    throw new Error('Mensagens vazias');
  }

  const { data: provRaw, error: provErr } = await supabase.rpc('get_encrypted_secret', {
    p_secret_name: 'PROJECTS_AI_PROVIDER',
  });
  if (provErr) {
    console.warn('PROJECTS_AI_PROVIDER:', provErr.message);
  }
  const provider = (provRaw || 'openai').toString().trim().toLowerCase();
  const normalizedModel = String(model || '').trim();
  const hasExplicitModel = normalizedModel.length > 0;
  const inferredOpenAiModel = normalizedModel.startsWith('openai/')
    ? normalizedModel.slice('openai/'.length)
    : normalizedModel;
  const useOpenRouter = hasExplicitModel
    ? normalizedModel.includes('/')
    : provider === 'openrouter';

  const { data: modelRaw } = await supabase.rpc('get_encrypted_secret', {
    p_secret_name: 'PROJECTS_OPENROUTER_MODEL',
  });
  const openrouterModel = hasExplicitModel
    ? normalizedModel
    : (modelRaw || 'openai/gpt-4o-mini').toString().trim();
  const finalOpenAiModel = hasExplicitModel ? inferredOpenAiModel : openaiModel;

  const fnName = useOpenRouter ? 'openrouter-chat' : 'openai-chat';
  const body = useOpenRouter
    ? { messages, model: openrouterModel, stream: false, temperature, max_tokens }
    : { messages, model: finalOpenAiModel, stream: false, temperature, max_tokens };

  const { data, error } = await supabase.functions.invoke(fnName, { body });

  if (error) {
    const payload = data && typeof data === 'object' ? data : {};
    const hint =
      (typeof payload.error === 'string' && payload.error) ||
      payload.error?.message ||
      payload.details?.message ||
      error.message;
    throw new Error(
      hint || 'Falha ao chamar a IA no servidor. Verifique Configurações e se as Edge Functions estão deployadas.'
    );
  }

  if (data?.error) {
    const msg = typeof data.error === 'string' ? data.error : data.error?.message;
    throw new Error(msg || 'Erro retornado pela função de IA');
  }

  const text = data?.content;
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Resposta vazia da IA');
  }

  return text.trim();
}
