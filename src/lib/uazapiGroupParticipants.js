import { supabase } from '@/lib/customSupabaseClient';
import { invokeEdgeFunction } from '@/lib/supabaseFunctions';
import {
  buildGroupParticipantCache,
  digitsOnly,
  formatBrazilPhone,
  isPlausibleWhatsAppPhone,
} from '@/lib/groupParticipantDisplay';

async function getAccessToken() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    return refreshed.session?.access_token || null;
  }
  return session.access_token;
}

function isWeakParticipantName(name, phoneDigits) {
  const n = String(name || '').trim();
  if (!n) return true;
  if (isPlausibleWhatsAppPhone(n) || isPlausibleWhatsAppPhone(digitsOnly(n))) return true;
  const pd = digitsOnly(phoneDigits);
  const nd = digitsOnly(n);
  if (pd && nd && (pd === nd || pd.endsWith(nd) || nd.endsWith(pd))) return true;
  return false;
}

function phonesMatch(a, b) {
  const da = digitsOnly(a);
  const db = digitsOnly(b);
  if (!da || !db) return false;
  return da === db || da.endsWith(db) || db.endsWith(da);
}

function labelFromRemetente(row) {
  const label = String(row?.label || '').trim();
  if (!label) return String(row?.name_match || '').trim() || null;
  const short = label.replace(/\s*[—–-]\s*equipe.*$/i, '').trim();
  return short || label;
}

function matchRemetenteName(phone, remetentes = []) {
  for (const row of remetentes) {
    if (phonesMatch(phone, row.phone)) return labelFromRemetente(row);
  }
  return null;
}

export function participantDisplayLabel(p) {
  const name = String(p?.display_name || p?.displayName || '').trim();
  if (name && !isWeakParticipantName(name, p?.phone)) return name;
  const phone = String(p?.phone || '').trim();
  if (phone) return formatBrazilPhone(phone) || `+${phone}`;
  const jid = String(p?.from_jid || p?.jid || '').trim();
  if (jid) return jid.replace(/@.*$/, '');
  return 'Participante';
}

export function participantSubtitle(p) {
  const name = String(p?.display_name || '').trim();
  const phone = String(p?.phone || '').trim();
  if (name && phone && !isWeakParticipantName(name, phone)) {
    return formatBrazilPhone(phone) || `+${phone}`;
  }
  return null;
}

export function participantAccentKey(p) {
  return p?.phone || p?.from_jid || p?.jid || p?.lid || 'unknown';
}

/**
 * Busca participantes do grupo na uazapi (edge function).
 */
export async function fetchUazapiGroupParticipants({
  groupJid,
  clienteId,
  whatsappConfigId,
  syncContacts = true,
}) {
  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error('Sessão expirada. Faça login novamente.');

  const { data, error } = await invokeEdgeFunction(
    'uazapi-group-info',
    {
      group_jid: groupJid,
      cliente_id: clienteId,
      whatsapp_config_id: whatsappConfigId || undefined,
      sync_contacts: syncContacts,
    },
    accessToken,
  );

  if (error) {
    const msg = data?.error || error.message || 'Erro ao buscar participantes.';
    throw new Error(msg);
  }

  const payload = data;
  return {
    groupName: payload?.group_name || null,
    participants: Array.isArray(payload?.participants) ? payload.participants : [],
    participantCount: payload?.participant_count ?? 0,
  };
}

/** Enriquece participantes com nome (contatos, mensagens do grupo, equipe cadastrada) e fotos. */
export async function enrichParticipantsWithAvatars(clienteId, participants, options = {}) {
  if (!clienteId || !participants?.length) return participants || [];

  const groupJid = String(options.groupJid || '').trim();
  const jids = new Set();
  const phones = new Set();
  for (const p of participants) {
    if (p.from_jid) jids.add(p.from_jid);
    if (p.jid) jids.add(p.jid);
    if (p.lid) jids.add(p.lid);
    if (p.phone) {
      phones.add(String(p.phone).replace(/\D/g, ''));
      jids.add(`${String(p.phone).replace(/\D/g, '')}@s.whatsapp.net`);
    }
  }

  const picByJid = new Map();
  const picByPhone = new Map();
  const nameByJid = new Map();
  const nameByPhone = new Map();

  const jidList = [...jids].filter(Boolean);
  const phoneList = [...phones].filter(Boolean);

  const contactQueries = [];
  if (jidList.length) {
    contactQueries.push(
      supabase
        .from('cliente_whatsapp_contact')
        .select('from_jid, phone, profile_pic_url, sender_name')
        .eq('cliente_id', clienteId)
        .in('from_jid', jidList),
    );
  }
  if (phoneList.length) {
    contactQueries.push(
      supabase
        .from('cliente_whatsapp_contact')
        .select('from_jid, phone, profile_pic_url, sender_name')
        .eq('cliente_id', clienteId)
        .in('phone', phoneList),
    );
  }

  const [contactResults, remetenteRes, inboxRes] = await Promise.all([
    Promise.all(contactQueries),
    supabase
      .from('atendimento_grupo_remetente_interno')
      .select('label, phone, name_match, cliente_id')
      .or(`cliente_id.eq.${clienteId},cliente_id.is.null`),
    groupJid
      ? supabase
          .from('cliente_whatsapp_inbox')
          .select('sender_jid, sender_name, phone, raw_payload, is_group')
          .eq('cliente_id', clienteId)
          .eq('chat_jid', groupJid)
          .eq('is_group', true)
          .order('created_at', { ascending: false })
          .limit(250)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const remetentes = remetenteRes.error ? [] : remetenteRes.data || [];
  const inboxCache =
    !inboxRes.error && inboxRes.data?.length ? buildGroupParticipantCache(inboxRes.data) : null;

  for (const res of contactResults) {
    for (const row of res.data || []) {
      const pic = String(row.profile_pic_url || '').trim();
      const senderName = String(row.sender_name || '').trim();
      const phoneKey = digitsOnly(row.phone);
      if (row.from_jid && pic) picByJid.set(row.from_jid, pic);
      if (phoneKey && pic) picByPhone.set(phoneKey, pic);
      if (senderName && !isWeakParticipantName(senderName, phoneKey)) {
        if (row.from_jid) nameByJid.set(row.from_jid, senderName);
        if (phoneKey) nameByPhone.set(phoneKey, senderName);
      }
    }
  }

  return participants.map((p) => {
    const phoneKey = digitsOnly(p.phone);
    let displayName = String(p.display_name || '').trim();
    if (isWeakParticipantName(displayName, phoneKey)) displayName = '';

    const fromContact =
      (p.from_jid && nameByJid.get(p.from_jid)) ||
      (p.jid && nameByJid.get(p.jid)) ||
      (p.lid && nameByJid.get(p.lid)) ||
      (phoneKey && nameByPhone.get(phoneKey)) ||
      null;

    if (fromContact && isWeakParticipantName(displayName, phoneKey)) {
      displayName = fromContact;
    }

    if (isWeakParticipantName(displayName, phoneKey) && inboxCache?.size) {
      const cacheKey = phoneKey ? `phone:${phoneKey}` : p.from_jid || p.jid || p.lid || null;
      const cached = cacheKey ? inboxCache.get(cacheKey) : null;
      if (cached?.name) displayName = cached.name;
    }

    if (isWeakParticipantName(displayName, phoneKey)) {
      const fromTeam = matchRemetenteName(phoneKey, remetentes);
      if (fromTeam) displayName = fromTeam;
    }

    const avatarUrl =
      (p.from_jid && picByJid.get(p.from_jid)) ||
      (p.jid && picByJid.get(p.jid)) ||
      (p.lid && picByJid.get(p.lid)) ||
      (phoneKey && picByPhone.get(phoneKey)) ||
      p.avatar_url ||
      null;

    const next = { ...p };
    if (displayName && !isWeakParticipantName(displayName, phoneKey)) {
      next.display_name = displayName;
    }
    if (avatarUrl) next.avatar_url = avatarUrl;
    return next;
  });
}
