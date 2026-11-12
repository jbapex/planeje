import { supabase } from '@/lib/customSupabaseClient';
import { AUDIENCE_FILTER_GROUPS } from '@/lib/atendimentoAudienceFilter';
import { buildConversasUrl } from '@/lib/conversasRoutes';
import { loadCsGroupInventory } from '@/lib/csIaGroupInventory';

export function sameChatJid(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

export function whatsappGroupChannelLabel(group) {
  const reference = group.whatsapp_config_id?.slice(-8);
  return [group.channel_name || 'Canal do Atendimento', reference].filter(Boolean).join(' · ');
}

export function grupoFromEntregaveis(entregaveis) {
  const g = entregaveis?.whatsapp_grupo;
  if (!g?.chat_jid) return null;
  return {
    chat_jid: g.chat_jid,
    display_name: g.display_name || null,
    conversation_id: g.conversation_id || null,
    wa_cliente_id: g.wa_cliente_id || null,
  };
}

export function buildGrupoConversasUrl(grupo) {
  if (!grupo?.chat_jid) return null;
  return buildConversasUrl({
    chatJid: grupo.chat_jid,
    audienceFilter: AUDIENCE_FILTER_GROUPS,
    clienteId: grupo.wa_cliente_id || undefined,
  });
}

function normalizeName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(mkt|marketing|jb|novo|grupo|equipe)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function suggestGrupoForCliente(empresa, groups) {
  const target = normalizeName(empresa);
  if (!target || !groups?.length) return null;
  const tokens = target.split(' ').filter((t) => t.length >= 3);
  let best = null;
  let bestScore = 0;
  for (const g of groups) {
    const n = normalizeName(g.display_name || g.chat_jid);
    if (!n) continue;
    let score = 0;
    if (n.includes(target) || target.includes(n)) score += 5;
    for (const t of tokens) {
      if (n.includes(t)) score += 2;
    }
    if (score > bestScore) {
      bestScore = score;
      best = g;
    }
  }
  return bestScore >= 2 ? best : null;
}

export async function listWhatsappGroups({ forCs = false } = {}) {
  if (forCs) return loadCsGroupInventory(supabase, 'unlinked');
  const { data, error } = await supabase.from('atendimento_conversas')
    .select('id, chat_jid, display_name, cliente_id, whatsapp_config_id, last_message_at')
    .eq('is_group', true).is('archived_at', null).order('last_message_at', { ascending: false }).limit(300);
  if (error) throw error;
  const seen = new Set();
  const out = [];
  for (const row of data || []) {
    const jid = String(row.chat_jid || '').toLowerCase();
    if (!jid || seen.has(jid)) continue;
    seen.add(jid);
    out.push({
      id: row.id,
      chat_jid: row.chat_jid,
      display_name: row.display_name || row.chat_jid,
      wa_cliente_id: row.cliente_id,
      whatsapp_config_id: row.whatsapp_config_id,
    });
  }
  return out;
}

export async function loadCsGroupBinding(clienteId) {
  const { data, error } = await supabase.rpc('cs_ia_group_binding', { p_client_id: clienteId });
  if (error || typeof data?.version !== 'string') throw new Error('Vínculo indisponível para esta sessão.');
  return data;
}

export async function saveCsGroupBinding(clienteId, version, group) {
  const { data, error } = await supabase.rpc('cs_ia_set_group_binding', {
    p_client_id: clienteId, p_version: version, p_conversation_id: group?.id ?? null,
    p_wa_client_id: group?.wa_cliente_id ?? null, p_channel_id: group?.whatsapp_config_id ?? null, p_group_jid: group?.chat_jid ?? null,
  });
  if (error?.code === '40001') throw new Error('O vínculo mudou. Atualize os grupos antes de salvar.');
  if (error?.code === '23505') throw new Error('Este grupo já está vinculado a outro cliente.');
  if (error?.code === '55000') throw new Error('Restaure o grupo no CS antes de vincular.');
  if (error || data !== true) throw new Error('Não foi possível alterar o vínculo. Confira o acesso ao cliente e ao canal.');
}

function grupoFromTableRow(row) {
  if (!row?.chat_jid) return null;
  return {
    chat_jid: row.chat_jid,
    display_name: row.display_name || null,
    conversation_id: row.conversation_id || null,
    wa_cliente_id: row.wa_cliente_id || null,
    source: 'table',
  };
}

async function persistGrupoEntregaveis(clienteId, grupo) {
  const { data: client, error } = await supabase
    .from('clientes')
    .select('entregaveis')
    .eq('id', clienteId)
    .maybeSingle();
  if (error) throw error;
  const entregaveis = { ...(client?.entregaveis && typeof client.entregaveis === 'object' ? client.entregaveis : {}) };
  if (grupo) entregaveis.whatsapp_grupo = grupo;
  else delete entregaveis.whatsapp_grupo;
  const { error: uErr } = await supabase.from('clientes').update({ entregaveis }).eq('id', clienteId);
  if (uErr) throw uErr;
}

export async function loadClienteGrupos(clienteIds) {
  const map = {};
  if (!clienteIds?.length) return map;

  const { data, error } = await supabase
    .from('cliente_whatsapp_grupo')
    .select('cliente_id, conversation_id, chat_jid, display_name, wa_cliente_id')
    .in('cliente_id', clienteIds);

  if (!error && data) {
    for (const row of data) {
      const g = grupoFromTableRow(row);
      if (g) map[row.cliente_id] = g;
    }
  }

  const missing = clienteIds.filter((id) => !map[id]);
  if (missing.length) {
    const { data: clients, error: cErr } = await supabase
      .from('clientes')
      .select('id, entregaveis')
      .in('id', missing);
    if (cErr && !Object.keys(map).length) throw error || cErr;
    for (const c of clients || []) {
      const g = grupoFromEntregaveis(c.entregaveis);
      if (g) map[c.id] = { ...g, source: 'entregaveis' };
    }
  }
  return map;
}

export async function loadClienteGrupo(clienteId) {
  if (!clienteId) return null;
  const map = await loadClienteGrupos([clienteId]);
  return map[clienteId] || null;
}

export async function saveClienteGrupo(clienteId, group) {
  if (!clienteId || !group?.chat_jid) throw new Error('Grupo inválido');
  const payload = {
    cliente_id: clienteId,
    conversation_id: group.id || group.conversation_id || null,
    chat_jid: group.chat_jid,
    display_name: group.display_name || null,
    wa_cliente_id: group.wa_cliente_id || group.cliente_id || null,
    updated_at: new Date().toISOString(),
  };
  const entregaveisGrupo = {
    chat_jid: payload.chat_jid,
    display_name: payload.display_name,
    conversation_id: payload.conversation_id,
    wa_cliente_id: payload.wa_cliente_id,
  };

  const { error } = await supabase.from('cliente_whatsapp_grupo').upsert(payload, { onConflict: 'cliente_id' });
  try {
    await persistGrupoEntregaveis(clienteId, entregaveisGrupo);
  } catch (e) {
    if (error) throw error;
    throw e;
  }
  return { source: error ? 'entregaveis' : 'table' };
}

export async function clearClienteGrupo(clienteId) {
  if (!clienteId) return;
  await supabase.from('cliente_whatsapp_grupo').delete().eq('cliente_id', clienteId);
  await persistGrupoEntregaveis(clienteId, null);
}

export async function lookupConversationByChatJid(chatJid, waClienteId) {
  const jid = String(chatJid || '').trim();
  if (!jid) return null;
  let query = supabase
    .from('atendimento_conversas')
    .select('id, chat_jid, status, cliente_id, is_group, display_name, whatsapp_config_id, fila_id, assigned_to')
    .is('archived_at', null)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(8);
  if (waClienteId) query = query.eq('cliente_id', waClienteId);
  const { data, error } = await query.eq('chat_jid', jid);
  if (error) throw error;
  if (data?.[0]) return data[0];
  const { data: loose, error: looseErr } = await supabase
    .from('atendimento_conversas')
    .select('id, chat_jid, status, cliente_id, is_group, display_name, whatsapp_config_id, fila_id, assigned_to')
    .is('archived_at', null)
    .ilike('chat_jid', jid)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(8);
  if (looseErr) return null;
  return (loose || []).find((row) => sameChatJid(row.chat_jid, jid)) || null;
}
