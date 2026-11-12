/**
 * Atendimento da loja — agentes de IA.
 * POST { acao: 'testar', ... } / { acao: 'sugerir', ... } com sessão da loja (não envia ao contato).
 * POST { acao: 'responder', cliente_id, contact_id } com a chave de serviço, só a loja habilitada,
 * só se o interruptor auto_responder estiver ligado (quem envia é o webhook + uazapi-send-message).
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchAtendimentoLojaHabilitada } from '../_shared/atendimentoLojaAcesso.ts';
import {
  buildSystemPrompt,
  escolherAgente,
  historicoParaMensagens,
  mensagensDeTeste,
  parseIaAction,
} from '../_shared/atendimentoIaPrompt.js';
import { decidirAutoResposta } from '../_shared/atendimentoIaAuto.js';
import { runCrmIaAgent } from '../_shared/crmIaRuntime.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MODELOS = ['openai/gpt-4o-mini', 'openai/gpt-4o'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type Provedor = { nome: 'openai' | 'openrouter'; key: string };

/** OpenAI direto quando há OPENAI_API_KEY (os modelos são da OpenAI); senão OpenRouter. */
async function provedorIa(admin: ReturnType<typeof createClient>): Promise<Provedor | null> {
  const openai = Deno.env.get('OPENAI_API_KEY');
  if (openai) return { nome: 'openai', key: openai };
  const fromEnv = Deno.env.get('OPENROUTER_API_KEY');
  if (fromEnv) return { nome: 'openrouter', key: fromEnv };
  const { data } = await admin.rpc('get_encrypted_secret', { p_secret_name: 'OPENROUTER_API_KEY' });
  return typeof data === 'string' && data ? { nome: 'openrouter', key: data } : null;
}

async function chamarIa(provedor: Provedor, modelo: string, messages: Array<{ role: string; content: string }>) {
  const isOpenAi = provedor.nome === 'openai';
  const url = isOpenAi ? 'https://api.openai.com/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
  const headers: Record<string, string> = {
    Authorization: `Bearer ${provedor.key}`,
    'Content-Type': 'application/json',
  };
  if (!isOpenAi) {
    headers['HTTP-Referer'] = Deno.env.get('SUPABASE_URL') || 'https://planeje.jbapex.com.br';
    headers['X-Title'] = 'Planeje - Atendimento da loja';
  }
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: isOpenAi ? modelo.replace(/^openai\//, '') : modelo,
      messages,
      temperature: 0.4,
      max_tokens: 500,
    }),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!res.ok) {
    if (res.status === 429) throw new Error('A IA está com muitas chamadas agora. Tente de novo em instantes.');
    if (res.status === 401 || res.status === 403) throw new Error('A chave da IA não foi aceita pelo provedor.');
    throw new Error(data?.error?.message ? `IA: ${String(data.error.message).slice(0, 160)}` : 'A IA não respondeu.');
  }
  const resposta = String(data?.choices?.[0]?.message?.content || '').trim();
  if (!resposta) throw new Error('A IA voltou sem texto.');
  return { resposta, tokens: Number(data?.usage?.total_tokens) || null };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !serviceKey || !anonKey) return json({ error: 'Configuração do servidor incompleta' }, 500);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Não autenticado' }, 401);
  const authToken = authHeader.slice(7);
  const isService = Boolean(serviceKey) && authToken === serviceKey;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'JSON inválido' }, 400);
  }

  const acao = String(body.acao || '');
  const admin = createClient(supabaseUrl, serviceKey);
  let userId: string | null = null;
  let crmStaff = false;
  let clienteId = String(body.cliente_id || '').trim();

  if (isService) {
    if (acao !== 'responder' && acao !== 'followup') return json({ error: 'Ação inválida' }, 400);
    if (!UUID_RE.test(clienteId) || !(await fetchAtendimentoLojaHabilitada(admin, clienteId))) {
      return json({ error: 'Agentes de IA não estão liberados para esta loja' }, 403);
    }
  } else {
    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: callerData, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !callerData?.user) return json({ error: 'Sessão inválida' }, 401);
    userId = callerData.user.id;

    const { data: profile } = await admin.from('profiles').select('role, cliente_id, status').eq('id', userId).maybeSingle();
    clienteId = String(body.cliente_id || profile?.cliente_id || '').trim();
    if (!UUID_RE.test(clienteId) || !(await fetchAtendimentoLojaHabilitada(admin, clienteId))) {
      return json({ error: 'Agentes de IA não estão liberados para esta loja' }, 403);
    }
    if (['superadmin','admin','colaborador'].includes(profile?.role)) {
      if (profile.status !== 'active' || (acao !== 'testar' && acao !== 'sugerir')) return json({ error: 'Acesso não autorizado' }, 403);
      const authorization = await callerClient.rpc('crm_ia_workspace', { p_action: 'authorize_ai', p_client_id: clienteId,
        p_payload: { agent_id: body.agente_id || null, contact_id: body.contact_id || null, channel_id: body.whatsapp_config_id || null, mode: acao } });
      if (authorization.error || authorization.data?.allowed !== true) return json({ error: 'Acesso não autorizado' }, 403);
      crmStaff = true;
    } else if (profile?.role !== 'cliente' || profile?.cliente_id !== clienteId) {
      return json({ error: 'Só a equipe da loja usa os agentes de IA' }, 403);
    }
    if (!crmStaff) {
      const { data: nivel } = await admin.rpc('cliente_atend_nivel_de', { p_user_id: userId, p_cliente_id: clienteId });
      if (!nivel) return json({ error: 'Sem acesso ao atendimento desta loja' }, 403);

    if (acao !== 'testar' && acao !== 'sugerir') return json({ error: 'Ação inválida' }, 400);
      if (acao === 'testar' && nivel !== 'admin') return json({ error: 'Só o administrador da loja testa os agentes' }, 403);
    }
  }

  // Service reads must never run before the caller's existing conversation ACL.
  if (!isService && !crmStaff && acao === 'sugerir') {
    if (!UUID_RE.test(String(body.contact_id || ''))) return json({ error: 'contact_id inválido' }, 400);
    const access = await admin.rpc('cliente_atend_pode_ver_contato_de', {
      p_user_id: userId, p_cliente_id: clienteId, p_contact_id: body.contact_id,
    });
    if (access.error || access.data !== true) return json({ error: 'Sem acesso a esta conversa' }, 403);
  }

  try {
    const typed = await runCrmIaAgent({ db: admin, clientId: clienteId, mode: acao, contactId: body.contact_id,
      channelId: body.whatsapp_config_id, agentId: body.agente_id, messageId: body.message_id, userId, previewMessages: body.mensagens,
      callModel: async (model, messages) => {
        const provider = await provedorIa(admin);
        if (!provider) throw new Error('A chave da IA não está configurada no servidor');
        return chamarIa(provider, MODELOS.includes(model) ? model : MODELOS[0], messages);
      } });
    if (typed.handled) return json(typed);
    if (acao === 'followup') return json({ ok: true, skipped: 'not_typed', resposta: '' });
  } catch {
    console.error('[atendimento-ia] typed_runtime_failed');
    return json({ error: 'Não foi possível confirmar o resultado. Confira a fila antes de tentar novamente.' }, 502);
  }

  const [{ data: agentes }, { data: loja }] = await Promise.all([
    admin
      .from('cliente_atend_ia_agentes')
      .select('id, nome, objetivo, instrucoes, tom, modelo, base_ids, setor_ids, ativo, auto_responder, funil')
      .eq('cliente_id', clienteId)
      .order('created_at'),
    admin.from('clientes').select('empresa, nome_contato').eq('id', clienteId).maybeSingle(),
  ]);
  const lojaNome = loja?.empresa || loja?.nome_contato || '';

  let agente: any = null;
  let contatoNome = '';
  let messages: Array<{ role: string; content: string }> = [];
  let contactId: string | null = null;

  if (acao === 'testar') {
    if (body.agente && typeof body.agente === 'object') {
      agente = {
        nome: String(body.agente.nome || 'Assistente').slice(0, 60),
        objetivo: String(body.agente.objetivo || '').slice(0, 500),
        instrucoes: String(body.agente.instrucoes || '').slice(0, 8000),
        tom: String(body.agente.tom || 'cordial'),
        modelo: String(body.agente.modelo || 'openai/gpt-4o-mini'),
        base_ids: Array.isArray(body.agente.base_ids) ? body.agente.base_ids : [],
        id: UUID_RE.test(String(body.agente.id || '')) ? body.agente.id : null,
      };
    } else {
      agente = (agentes || []).find((a: any) => a.id === body.agente_id) || null;
    }
    if (!agente) return json({ error: 'Agente não encontrado' }, 404);
    messages = mensagensDeTeste(body.mensagens);
    if (!messages.length || messages[messages.length - 1].role !== 'user') {
      return json({ error: 'Escreva uma mensagem de cliente para testar' }, 400);
    }
  } else {
    contactId = String(body.contact_id || '').trim();
    if (!UUID_RE.test(contactId)) return json({ error: 'contact_id inválido' }, 400);
    if (acao !== 'responder' && !crmStaff) {
      const { data: podeVer } = await admin.rpc('cliente_atend_pode_ver_contato_de', {
        p_user_id: userId,
        p_cliente_id: clienteId,
        p_contact_id: contactId,
      });
      if (podeVer !== true) return json({ error: 'Sem acesso a esta conversa' }, 403);
    }

    const [{ data: contato }, { data: conversa }] = await Promise.all([
      admin
        .from('cliente_whatsapp_contact')
        .select('id, sender_name, phone, from_jid, mini_crm')
        .eq('cliente_id', clienteId)
        .eq('id', contactId)
        .maybeSingle(),
      admin
        .from('cliente_atend_conversas')
        .select('setor_id, status, ia_pausada, ia_respondeu_em')
        .eq('cliente_id', clienteId)
        .eq('contact_id', contactId)
        .maybeSingle(),
    ]);
    if (!contato) return json({ error: 'Contato não encontrado' }, 404);
    if (acao === 'responder') {
      const gate = decidirAutoResposta({
        clienteHabilitada: true,
        fromMe: false,
        isGroup: false,
        hasText: true,
        conversa,
        agentes: agentes || [],
        setorId: conversa?.setor_id || null,
      });
      if (!gate.ok) {
        console.log('[atendimento-ia] responder pular', gate.reason, contactId);
        return json({ ok: true, skipped: gate.reason, resposta: '', action: null });
      }
      agente = gate.agente;
    } else {
      agente = escolherAgente(agentes || [], {
        agenteId: UUID_RE.test(String(body.agente_id || '')) ? body.agente_id : null,
        setorId: conversa?.setor_id || null,
      });
    }
    if (!agente) return json({ error: 'Nenhum agente de IA ativo nesta loja' }, 404);

    contatoNome = String(contato.mini_crm?.contato_nome || contato.sender_name || '').split(/\s+/)[0] || '';
    if (!/^[0-9]+@(s\.whatsapp\.net|c\.us|lid)$/.test(contato.from_jid || '')) return json({ error: 'Conversa individual inválida' }, 400);
    let channelQuery = admin.from('cliente_whatsapp_config').select('id').eq('cliente_id', clienteId).is('archived_at', null);
    if (body.whatsapp_config_id) channelQuery = channelQuery.eq('id', body.whatsapp_config_id);
    const channelRead = await channelQuery.limit(2);
    if (channelRead.error || channelRead.data?.length !== 1) return json({ error: 'Escolha o canal exato desta conversa' }, 409);
    const exactChannel = channelRead.data[0].id;
    const [{ data: inboxRows, error: inboxError }, { data: sentRows, error: sentError }] = await Promise.all([
      admin
        .from('cliente_whatsapp_inbox')
        .select('id, body, msg_timestamp, created_at')
        .eq('cliente_id', clienteId)
        .eq('whatsapp_config_id', exactChannel)
        .eq('is_group', false)
        .or(`chat_jid.eq.${contato.from_jid},from_jid.eq.${contato.from_jid}`)
        .order('created_at', { ascending: false })
        .limit(40),
      admin
            .from('cliente_whatsapp_sent')
            .select('id, body, created_at')
            .eq('cliente_id', clienteId)
            .eq('whatsapp_config_id', exactChannel)
            .or(`chat_jid.eq.${contato.from_jid},to_jid.eq.${contato.from_jid}`)
            .order('created_at', { ascending: false })
            .limit(40),
    ]);
    if (inboxError || sentError) return json({ error: 'Não foi possível carregar o contexto desta conversa' }, 502);
    messages = historicoParaMensagens({ inboxRows: inboxRows || [], sentRows: sentRows || [] });
    if (!messages.length) return json({ error: 'A conversa ainda não tem texto para a IA ler' }, 400);
  }

  const baseIds = (agente.base_ids || []).filter((id: string) => UUID_RE.test(String(id)));
  let bases: Array<{ nome: string; conteudo: string }> = [];
  if (baseIds.length) {
    const { data } = await admin
      .from('cliente_atend_ia_bases')
      .select('id, nome, conteudo')
      .eq('cliente_id', clienteId)
      .in('id', baseIds);
    bases = data || [];
  }

  const provedor = await provedorIa(admin);
  if (!provedor) return json({ error: 'A chave da IA não está configurada no servidor' }, 500);
  const modelo = MODELOS.includes(agente.modelo) ? agente.modelo : MODELOS[0];
  const system = buildSystemPrompt({ agente, bases, lojaNome, contatoNome });
  const extra =
    acao === 'sugerir'
      ? [{ role: 'system', content: 'Escreva só a próxima mensagem da loja para este contato. Ela será revisada por uma pessoa antes de ir.' }]
      : acao === 'responder'
        ? [{ role: 'system', content: 'Esta mensagem será enviada agora no WhatsApp. Escreva só o texto. Se o critério fechou, avise a passagem e coloque o JSON de transferência na última linha.' }]
        : [];

  try {
    const { resposta, tokens } = await chamarIa(provedor, modelo, [{ role: 'system', content: system }, ...messages, ...extra]);
    const parsed = parseIaAction(resposta);
    await admin.from('cliente_atend_ia_log').insert({
      cliente_id: clienteId,
      agente_id: agente.id || null,
      contact_id: contactId,
      user_id: userId,
      acao,
      modelo,
      tokens,
    });
    return json({
      ok: true,
      resposta: parsed.texto || resposta,
      action: parsed.action,
      reason: parsed.reason,
      agente: { id: agente.id || null, nome: agente.nome, funil: agente.funil || null },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'A IA não respondeu.';
    console.error('[atendimento-ia]', acao, msg.slice(0, 180));
    return json({ error: msg }, 502);
  }
});
