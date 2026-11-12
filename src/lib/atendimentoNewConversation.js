import { normalizePhoneNumber, getPhoneVariations } from '@/lib/leadUtils';
import { jidPhoneDigits } from '@/lib/uazapiMessageBody';
import { formatBrazilPhone } from '@/lib/groupParticipantDisplay';
import { mergeGroupConversationsForList } from '@/lib/atendimentoGroupConversationDedup';
import { ATENDIMENTO_STATUS } from '@/hooks/useAtendimentoConversations';

export const NEW_CONV_DESTINO_CONTACT = 'contact';
export const NEW_CONV_DESTINO_GROUP = 'group';

export const NEW_CONV_FILTER_ALL = 'all';
export const NEW_CONV_FILTER_CONTACT = 'contact';
export const NEW_CONV_FILTER_GROUP = 'group';

export const NEW_CONV_FILTER_OPTIONS = [
  { value: NEW_CONV_FILTER_ALL, label: 'Todos' },
  { value: NEW_CONV_FILTER_CONTACT, label: 'Contatos' },
  { value: NEW_CONV_FILTER_GROUP, label: 'Grupos' },
];

export function phoneToWhatsAppJid(phone) {
  const raw = String(phone || '').trim();
  if (!raw) return null;
  if (raw.includes('@')) {
    const jid = raw.includes(':') ? raw.split(':')[0] : raw;
    if (jid.includes('@g.us') || jid.includes('@lid')) return null;
    return jid;
  }
  const digits = normalizePhoneNumber(raw);
  if (!digits || digits.length < 10) return null;
  return `${digits}@s.whatsapp.net`;
}

export function formatContactPhoneLabel(phone) {
  const digits = normalizePhoneNumber(phone) || String(phone || '').replace(/\D/g, '');
  return formatBrazilPhone(digits) || (digits ? `+${digits}` : '');
}

function contactRowToOption(row, source) {
  const jid = row.from_jid?.includes('@') ? row.from_jid : phoneToWhatsAppJid(row.phone);
  if (!jid || jid.includes('@g.us')) return null;
  const phone = row.phone || jidPhoneDigits(jid);
  const name = String(row.sender_name || row.nome || '').trim();
  return {
    id: `${source}-${row.id || jid}`,
    name: name || formatContactPhoneLabel(phone) || jidPhoneDigits(jid),
    phone,
    jid,
    profilePicUrl: row.profile_pic_url || null,
    source,
  };
}

export async function searchAtendimentoContacts(supabase, clienteId, query) {
  const q = String(query || '').trim();
  if (!q || q.length < 2 || !clienteId) return [];

  const digits = q.replace(/\D/g, '');
  const options = [];
  const seen = new Set();

  const push = (opt) => {
    if (!opt?.jid || seen.has(opt.jid)) return;
    seen.add(opt.jid);
    options.push(opt);
  };

  if (digits.length >= 8) {
    const tail = digits.slice(-9);
    const { data } = await supabase
      .from('cliente_whatsapp_contact')
      .select('id, from_jid, phone, sender_name, profile_pic_url')
      .eq('cliente_id', clienteId)
      .ilike('phone', `%${tail}%`)
      .limit(20);
    (data || []).forEach((row) => {
      const opt = contactRowToOption(row, 'contato');
      if (opt) push(opt);
    });
  }

  const { data: byName } = await supabase
    .from('cliente_whatsapp_contact')
    .select('id, from_jid, phone, sender_name, profile_pic_url')
    .eq('cliente_id', clienteId)
    .ilike('sender_name', `%${q}%`)
    .limit(20);
  (byName || []).forEach((row) => {
    const opt = contactRowToOption(row, 'contato');
    if (opt) push(opt);
  });

  const leadFilter = digits.length >= 8
    ? `nome.ilike.%${q}%,whatsapp.ilike.%${digits.slice(-9)}%`
    : `nome.ilike.%${q}%`;
  const { data: leads } = await supabase
    .from('leads')
    .select('id, nome, whatsapp')
    .eq('cliente_id', clienteId)
    .or(leadFilter)
    .limit(15);
  (leads || []).forEach((row) => {
    const opt = contactRowToOption({ ...row, sender_name: row.nome, phone: row.whatsapp, from_jid: null }, 'lead');
    if (opt) push(opt);
  });

  const existing = await findExistingConversationByPhone(supabase, clienteId, digits);
  if (existing) {
    push({
      id: `conv-${existing.id}`,
      name: existing.display_name || formatContactPhoneLabel(jidPhoneDigits(existing.chat_jid)),
      phone: jidPhoneDigits(existing.chat_jid),
      jid: existing.chat_jid,
      profilePicUrl: existing.profile_pic_url,
      source: 'conversa',
      conversationId: existing.id,
    });
  }

  return options.slice(0, 25);
}

function contactAllowedForChannels(row, allowedWhatsappConfigIds) {
  if (!allowedWhatsappConfigIds?.length) return true;
  if (!row?.whatsapp_config_id) return true;
  return allowedWhatsappConfigIds.includes(row.whatsapp_config_id);
}

function isPrivateChatJid(jid) {
  const j = String(jid || '').toLowerCase();
  if (!j || j.includes('@g.us')) return false;
  return j.includes('@s.whatsapp.net') || j.includes('@lid') || !j.includes('@');
}

/**
 * Lista contatos já conhecidos (WhatsApp + conversas 1:1), ordenados por última interação.
 * Usado na aba Contatos de Nova conversa — sem precisar buscar antes.
 */
export async function loadAtendimentoContactList(
  supabase,
  clienteId,
  { limit = 200, allowedWhatsappConfigIds } = {},
) {
  if (!clienteId) return [];

  const seen = new Set();
  const options = [];

  const push = (opt) => {
    if (!opt?.jid || seen.has(opt.jid)) return;
    seen.add(opt.jid);
    options.push(opt);
  };

  const { data: contacts } = await supabase
    .from('cliente_whatsapp_contact')
    .select('id, from_jid, phone, sender_name, profile_pic_url, last_message_at, whatsapp_config_id')
    .eq('cliente_id', clienteId)
    .order('last_message_at', { ascending: false })
    .limit(limit);

  (contacts || []).forEach((row) => {
    if (!isPrivateChatJid(row.from_jid)) return;
    if (!contactAllowedForChannels(row, allowedWhatsappConfigIds)) return;
    const opt = contactRowToOption(row, 'contato');
    if (opt) {
      push({
        ...opt,
        kind: NEW_CONV_DESTINO_CONTACT,
        lastMessageAt: row.last_message_at,
      });
    }
  });

  const { data: conversas } = await supabase
    .from('atendimento_conversas')
    .select('id, chat_jid, display_name, profile_pic_url, last_message_at, whatsapp_config_id')
    .eq('cliente_id', clienteId)
    .eq('is_group', false)
    .order('last_message_at', { ascending: false })
    .limit(limit);

  (conversas || []).forEach((row) => {
    if (!isPrivateChatJid(row.chat_jid)) return;
    if (!contactAllowedForChannels(row, allowedWhatsappConfigIds)) return;
    push({
      id: `conv-${row.id}`,
      kind: NEW_CONV_DESTINO_CONTACT,
      name: row.display_name || formatContactPhoneLabel(jidPhoneDigits(row.chat_jid)),
      phone: jidPhoneDigits(row.chat_jid),
      jid: row.chat_jid,
      profilePicUrl: row.profile_pic_url,
      source: 'conversa',
      conversationId: row.id,
      lastMessageAt: row.last_message_at,
    });
  });

  return options.sort(
    (a, b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime(),
  );
}

/** Grupos já conhecidos no atendimento (deduplicados por chat_jid). */
export async function loadAtendimentoGroupList(
  supabase,
  clienteId,
  { limit = 200, allowedWhatsappConfigIds } = {},
) {
  if (!clienteId) return [];

  const { data } = await supabase
    .from('atendimento_conversas')
    .select('id, chat_jid, display_name, profile_pic_url, last_message_at, whatsapp_config_id, status')
    .eq('cliente_id', clienteId)
    .eq('is_group', true)
    .order('last_message_at', { ascending: false })
    .limit(Math.min(limit * 3, 600));

  const filtered = (data || []).filter((row) => contactAllowedForChannels(row, allowedWhatsappConfigIds));
  const merged = mergeGroupConversationsForList(filtered, { channelFilter: 'all' });

  return merged.map((row) => ({
    id: `group-${row.chat_jid}`,
    kind: NEW_CONV_DESTINO_GROUP,
    name: row.display_name || 'Grupo',
    phone: null,
    jid: row.chat_jid,
    profilePicUrl: row.profile_pic_url,
    source: 'grupo',
    conversationId: row.id,
    lastMessageAt: row.last_message_at,
  }));
}

/** Contatos 1:1 + grupos para Nova conversa. */
export async function loadAtendimentoDestinoList(supabase, clienteId, options = {}) {
  const [contacts, groups] = await Promise.all([
    loadAtendimentoContactList(supabase, clienteId, options),
    loadAtendimentoGroupList(supabase, clienteId, options),
  ]);
  return [...contacts, ...groups].sort(
    (a, b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime(),
  );
}

export function countAtendimentoDestinoByKind(options = []) {
  const counts = {
    [NEW_CONV_FILTER_ALL]: options.length,
    [NEW_CONV_FILTER_CONTACT]: 0,
    [NEW_CONV_FILTER_GROUP]: 0,
  };
  options.forEach((item) => {
    if (item.kind === NEW_CONV_DESTINO_GROUP) counts[NEW_CONV_FILTER_GROUP] += 1;
    else counts[NEW_CONV_FILTER_CONTACT] += 1;
  });
  return counts;
}

export function filterAtendimentoDestinoOptions(options, { query, kindFilter = NEW_CONV_FILTER_ALL } = {}) {
  let list = options || [];
  if (kindFilter === NEW_CONV_FILTER_CONTACT) {
    list = list.filter((item) => item.kind !== NEW_CONV_DESTINO_GROUP);
  } else if (kindFilter === NEW_CONV_FILTER_GROUP) {
    list = list.filter((item) => item.kind === NEW_CONV_DESTINO_GROUP);
  }
  return filterAtendimentoContactOptions(list, query);
}

export function filterAtendimentoContactOptions(options, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return options || [];
  const digits = q.replace(/\D/g, '');
  return (options || []).filter((item) => {
    const name = String(item.name || '').toLowerCase();
    const phone = String(item.phone || '').replace(/\D/g, '');
    const jidDigits = jidPhoneDigits(item.jid);
    if (name.includes(q)) return true;
    if (digits.length >= 4 && (phone.includes(digits) || jidDigits.includes(digits))) return true;
    return false;
  });
}

async function findExistingConversationByPhone(supabase, clienteId, digits) {
  if (!digits || digits.length < 10) return null;
  const variations = getPhoneVariations(digits);
  for (const v of variations) {
    const jid = phoneToWhatsAppJid(v);
    if (!jid) continue;
    const { data } = await supabase
      .from('atendimento_conversas')
      .select('id, chat_jid, display_name, profile_pic_url')
      .eq('cliente_id', clienteId)
      .eq('chat_jid', jid)
      .maybeSingle();
    if (data) return data;
  }
  return null;
}

/**
 * Cria ou reabre conversa 1:1 já em atendimento (usuário pode enviar na hora).
 */
export async function openAtendimentoConversation({
  supabase,
  clienteId,
  userId,
  phoneOrJid,
  displayName,
  whatsappConfigId,
  profilePicUrl,
}) {
  const chatJid = phoneOrJid?.includes('@') ? String(phoneOrJid).trim() : phoneToWhatsAppJid(phoneOrJid);
  if (!chatJid) {
    throw new Error('Informe um número de WhatsApp válido com DDD.');
  }
  const isGroup = chatJid.includes('@g.us');
  if (!whatsappConfigId) {
    throw new Error('Selecione um canal WhatsApp.');
  }

  const { data: filaCanal } = await supabase
    .from('atendimento_fila_canais')
    .select('fila_id')
    .eq('whatsapp_config_id', whatsappConfigId)
    .maybeSingle();

  const phoneDigits = jidPhoneDigits(chatJid);
  const display = isGroup
    ? String(displayName || '').trim() || 'Grupo'
    : String(displayName || '').trim() ||
      formatContactPhoneLabel(phoneDigits) ||
      phoneDigits ||
      chatJid.replace(/@.*$/, '');

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('atendimento_conversas')
    .upsert(
      {
        cliente_id: clienteId,
        whatsapp_config_id: whatsappConfigId,
        chat_jid: chatJid,
        is_group: isGroup,
        display_name: display,
        status: ATENDIMENTO_STATUS.EM_ATENDIMENTO,
        assigned_to: userId,
        fila_id: filaCanal?.fila_id ?? null,
        last_message_at: now,
        profile_pic_url: profilePicUrl || null,
        updated_at: now,
      },
      { onConflict: 'cliente_id,whatsapp_config_id,chat_jid' }
    )
    .select('*')
    .single();

  if (error) throw error;
  return data;
}
