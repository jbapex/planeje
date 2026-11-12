/**
 * Caixa Dot — responde no app (Entrega B).
 * POST { thread_id, retry? } com sessão da equipe.
 * Sem WhatsApp, sem CAPI. Tools só leitura: ver_cliente, listar_minhas_tarefas.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  DOT_TOOLS,
  buildDotSystemPrompt,
  formatClienteResumo,
  formatTarefasResumo,
  historicoParaMensagens,
  parseToolCallArgs,
  sanitizeDotReply,
} from '../_shared/caixaDotIa.js';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TEAM = new Set(['superadmin', 'admin', 'colaborador']);
const MODEL = 'gpt-4o-mini';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type Provedor = { nome: 'openai' | 'openrouter'; key: string };

async function provedorIa(admin: ReturnType<typeof createClient>): Promise<Provedor | null> {
  const openai = Deno.env.get('OPENAI_API_KEY');
  if (openai) return { nome: 'openai', key: openai };
  const fromEnv = Deno.env.get('OPENROUTER_API_KEY');
  if (fromEnv) return { nome: 'openrouter', key: fromEnv };
  const { data: oai } = await admin.rpc('get_encrypted_secret', { p_secret_name: 'OPENAI_API_KEY' });
  if (typeof oai === 'string' && oai) return { nome: 'openai', key: oai };
  const { data: or } = await admin.rpc('get_encrypted_secret', { p_secret_name: 'OPENROUTER_API_KEY' });
  return typeof or === 'string' && or ? { nome: 'openrouter', key: or } : null;
}

async function chamarIa(
  provedor: Provedor,
  messages: Array<Record<string, unknown>>,
  { withTools = true } = {}
) {
  const isOpenAi = provedor.nome === 'openai';
  const url = isOpenAi
    ? 'https://api.openai.com/v1/chat/completions'
    : 'https://openrouter.ai/api/v1/chat/completions';
  const headers: Record<string, string> = {
    Authorization: `Bearer ${provedor.key}`,
    'Content-Type': 'application/json',
  };
  if (!isOpenAi) {
    headers['HTTP-Referer'] = Deno.env.get('SUPABASE_URL') || 'https://planeje.jbapex.com.br';
    headers['X-Title'] = 'Planeje - Caixa Dot';
  }
  const body: Record<string, unknown> = {
    model: isOpenAi ? MODEL : `openai/${MODEL}`,
    messages,
    temperature: 0.35,
    max_tokens: 700,
  };
  if (withTools) {
    body.tools = DOT_TOOLS;
    body.tool_choice = 'auto';
  }
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!res.ok) {
    if (res.status === 429) throw new Error('O Dot está com muitas chamadas agora. Tente de novo em instantes.');
    if (res.status === 401 || res.status === 403) throw new Error('A chave da IA não foi aceita.');
    throw new Error(
      data?.error?.message
        ? `IA: ${String(data.error.message).slice(0, 160)}`
        : 'O Dot não respondeu.'
    );
  }
  return data?.choices?.[0]?.message || null;
}

async function loadContextoBase(admin: ReturnType<typeof createClient>, thread: any, ownerId: string) {
  const bits: string[] = [];
  if (thread.cliente_id) {
    const { data } = await admin
      .from('clientes')
      .select('id, empresa, etapa, nicho')
      .eq('id', thread.cliente_id)
      .maybeSingle();
    bits.push(`Cliente do tópico: ${formatClienteResumo(data)}`);
  }
  if (thread.task_id) {
    const { data } = await admin
      .from('tarefas')
      .select('id, title, status, due_date, client_id')
      .eq('id', thread.task_id)
      .maybeSingle();
    if (data) {
      bits.push(
        `Tarefa do tópico: ${data.title || '—'} · ${data.status || '—'} · prazo ${
          data.due_date ? String(data.due_date).slice(0, 10) : '—'
        } · id ${data.id}`
      );
    }
  }
  const { data: tarefas } = await admin
    .from('tarefas')
    .select('id, title, status, due_date, client_id, owner_id, assignee_ids, clientes(empresa)')
    .or(`owner_id.eq.${ownerId},assignee_ids.cs.{"${ownerId}"}`)
    .neq('status', 'completed')
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(8);
  bits.push('Tarefas abertas do colaborador (amostra):\n' + formatTarefasResumo(tarefas || []));
  return bits.join('\n\n');
}

async function runTool(
  admin: ReturnType<typeof createClient>,
  name: string,
  args: Record<string, unknown>,
  ownerId: string
) {
  if (name === 'ver_cliente') {
    const clienteId = typeof args.cliente_id === 'string' ? args.cliente_id.trim() : '';
    const busca = typeof args.busca === 'string' ? args.busca.trim() : '';
    if (clienteId && UUID_RE.test(clienteId)) {
      const { data } = await admin
        .from('clientes')
        .select('id, empresa, etapa, nicho')
        .eq('id', clienteId)
        .maybeSingle();
      return formatClienteResumo(data);
    }
    if (busca) {
      const { data } = await admin
        .from('clientes')
        .select('id, empresa, etapa, nicho')
        .ilike('empresa', `%${busca}%`)
        .limit(5);
      if (!data?.length) return 'Nenhum cliente com esse nome.';
      return data.map((row) => formatClienteResumo(row)).join('\n');
    }
    return 'Informe cliente_id ou busca.';
  }
  if (name === 'listar_minhas_tarefas') {
    const limite = Math.min(25, Math.max(1, Number(args.limite) || 12));
    const { data } = await admin
      .from('tarefas')
      .select('id, title, status, due_date, clientes(empresa)')
      .or(`owner_id.eq.${ownerId},assignee_ids.cs.{"${ownerId}"}`)
      .neq('status', 'completed')
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(limite);
    return formatTarefasResumo(data || []);
  }
  return `Ferramenta desconhecida: ${name}`;
}

async function markError(
  admin: ReturnType<typeof createClient>,
  threadId: string,
  message: string
) {
  await admin
    .from('caixa_dot_threads')
    .update({
      status: 'erro',
      last_error: String(message || 'Falha do Dot').slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq('id', threadId);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return json({ error: 'Configuração do servidor incompleta' }, 500);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Não autenticado' }, 401);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'JSON inválido' }, 400);
  }

  const threadId = String(body.thread_id || '').trim();
  if (!UUID_RE.test(threadId)) return json({ error: 'thread_id inválido' }, 400);

  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: authData, error: authError } = await caller.auth.getUser();
  if (authError || !authData?.user) return json({ error: 'Sessão inválida' }, 401);
  const userId = authData.user.id;

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: profile } = await admin
    .from('profiles')
    .select('id, full_name, role, status')
    .eq('id', userId)
    .maybeSingle();
  if (!profile || profile.status !== 'active' || !TEAM.has(String(profile.role || ''))) {
    return json({ error: 'Apenas equipe ativa pode usar o Dot' }, 403);
  }

  const { data: thread, error: threadError } = await admin
    .from('caixa_dot_threads')
    .select('*')
    .eq('id', threadId)
    .maybeSingle();
  if (threadError || !thread) return json({ error: 'Tópico não encontrado' }, 404);

  const isAdmin = profile.role === 'admin' || profile.role === 'superadmin';
  if (thread.owner_id !== userId && !isAdmin) {
    return json({ error: 'Este tópico não é seu' }, 403);
  }
  if (['feita', 'arquivada'].includes(thread.status)) {
    return json({ error: 'Tópico encerrado. Reabra ou crie outro.' }, 400);
  }

  await admin
    .from('caixa_dot_threads')
    .update({
      status: 'aguardando_dot',
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', threadId);

  try {
    const provedor = await provedorIa(admin);
    if (!provedor) throw new Error('Chave da IA não configurada no servidor.');

    const { data: owner } = await admin
      .from('profiles')
      .select('id, full_name')
      .eq('id', thread.owner_id)
      .maybeSingle();

    const { data: msgs } = await admin
      .from('caixa_dot_messages')
      .select('id, role, body, created_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
      .limit(40);

    const contextoBase = await loadContextoBase(admin, thread, thread.owner_id);
    const system = buildDotSystemPrompt({
      ownerName: owner?.full_name || profile.full_name,
      thread,
      contextoBase,
    });
    let messages: Array<Record<string, unknown>> = [
      { role: 'system', content: system },
      ...historicoParaMensagens(msgs || []),
    ];
    if (messages.length < 2) {
      messages.push({
        role: 'user',
        content: 'Resuma o que você já sabe deste tópico e o próximo passo útil.',
      });
    }

    let finalText = '';
    let toolRounds = 0;
    while (toolRounds < 3) {
      const reply = await chamarIa(provedor, messages, { withTools: true });
      if (!reply) throw new Error('A IA voltou vazia.');
      const toolCalls = Array.isArray(reply.tool_calls) ? reply.tool_calls : [];
      if (!toolCalls.length) {
        finalText = sanitizeDotReply(reply.content);
        break;
      }
      messages.push({
        role: 'assistant',
        content: reply.content || null,
        tool_calls: toolCalls,
      });
      for (const call of toolCalls) {
        const name = String(call?.function?.name || '');
        const args = parseToolCallArgs(call?.function?.arguments);
        const result = await runTool(admin, name, args, thread.owner_id);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: String(result).slice(0, 3500),
        });
      }
      toolRounds += 1;
    }

    if (!finalText) {
      const reply = await chamarIa(provedor, messages, { withTools: false });
      finalText = sanitizeDotReply(reply?.content);
    }
    if (!finalText) throw new Error('O Dot voltou sem texto.');

    const { data: saved, error: saveError } = await admin
      .from('caixa_dot_messages')
      .insert({
        thread_id: threadId,
        role: 'dot',
        body: finalText,
        meta: { origem: 'caixa-dot-ia', tools_rounds: toolRounds },
        created_by_id: null,
      })
      .select('id, created_at')
      .single();
    if (saveError) throw new Error(saveError.message);

    await admin
      .from('caixa_dot_threads')
      .update({
        status: 'respondido',
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', threadId);

    return json({
      ok: true,
      thread_id: threadId,
      message_id: saved.id,
      status: 'respondido',
      resposta: finalText,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[caixa-dot-ia]', msg.slice(0, 200));
    await markError(admin, threadId, msg);
    return json({ error: msg, status: 'erro' }, 500);
  }
});
