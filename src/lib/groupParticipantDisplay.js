import { jidPhoneDigits } from '@/lib/uazapiMessageBody';
import { storedPhotoIsStale } from '@/lib/atendimentoFotoUrl';

export function isLidJid(jid) {
  return /@lid$/i.test(String(jid || '').trim());
}

export function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '');
}

/** IDs internos do WhatsApp (@lid) — não são telefone. */
export function isLikelyLidDigits(digits) {
  const d = digitsOnly(digits);
  if (!d) return false;
  return d.length > 13;
}

export function isPlausibleWhatsAppPhone(digits) {
  const d = digitsOnly(digits);
  if (!d || d.length < 10 || d.length > 13) return false;
  return !isLikelyLidDigits(d);
}

export function formatBrazilPhone(digits) {
  const d = digitsOnly(digits);
  if (!isPlausibleWhatsAppPhone(d)) return null;

  if (d.startsWith('55') && d.length >= 12) {
    const ddd = d.slice(2, 4);
    const rest = d.slice(4);
    if (rest.length === 9) return `+55 ${ddd} ${rest.slice(0, 5)}-${rest.slice(5)}`;
    if (rest.length === 8) return `+55 ${ddd} ${rest.slice(0, 4)}-${rest.slice(4)}`;
  }
  if (d.length === 11) return `+55 ${d.slice(0, 2)} ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `+55 ${d.slice(0, 2)} ${d.slice(2, 6)}-${d.slice(6)}`;
  return `+${d}`;
}

function pickStr(...values) {
  for (const v of values) {
    const s = String(v ?? '').trim();
    if (s) return s;
  }
  return '';
}

function phoneDigitsFromJid(jid) {
  const s = String(jid || '').trim();
  if (!s || isLidJid(s)) return null;
  const d = jidPhoneDigits(s);
  return isPlausibleWhatsAppPhone(d) ? d : null;
}

function resolveGroupNameSet(row, payload, raw) {
  const chatObj = payload?.chat ?? raw?.chat;
  return new Set(
    [
      row?.group_name,
      chatObj?.name,
      chatObj?.wa_name,
      payload?.groupName,
      payload?.subject,
      raw?.groupName,
    ]
      .map((n) => String(n || '').trim())
      .filter(Boolean)
  );
}

function cleanParticipantName(name, groupNames) {
  const n = String(name || '').trim();
  if (!n) return '';
  if (groupNames.has(n)) return '';
  if (isLikelyLidDigits(n)) return '';
  if (isPlausibleWhatsAppPhone(n)) return '';
  return n;
}

const PROFILE_PIC_KEYS = ['imagePreview', 'image', 'pictureUrl', 'profilePictureUrl', 'profilePicUrl', 'avatar'];

function pickProfilePicUrl(...objects) {
  for (const obj of objects) {
    if (!obj || typeof obj !== 'object') continue;
    for (const key of PROFILE_PIC_KEYS) {
      const v = String(obj[key] ?? '').trim();
      if (v && (v.startsWith('http://') || v.startsWith('https://') || v.startsWith('data:'))) {
        return v;
      }
    }
  }
  return null;
}

function participantAvatarFromPayload(senderObj, contactObj) {
  return pickProfilePicUrl(senderObj, contactObj);
}

function buildParticipantInfo(name, phoneDigits, avatarUrl, accentFallback) {
  const phoneFormatted = phoneDigits ? formatBrazilPhone(phoneDigits) : null;
  const base = { avatarUrl: avatarUrl || null, phoneDigits: phoneDigits || null };

  if (name && phoneFormatted) {
    return { ...base, primary: name, secondary: phoneFormatted, accentKey: name };
  }
  if (name) {
    return { ...base, primary: name, secondary: null, accentKey: name };
  }
  if (phoneFormatted) {
    return { ...base, primary: phoneFormatted, secondary: null, accentKey: phoneDigits };
  }
  return { ...base, primary: 'Participante', secondary: null, accentKey: accentFallback || 'unknown' };
}

function isWeakParticipantLabel(label) {
  const s = String(label || '').trim();
  return !s || s === 'Participante' || isPlausibleWhatsAppPhone(s);
}

/**
 * Nome + telefone + avatar do participante em grupo (estilo WhatsApp).
 */
export function extractGroupParticipantInfo(row) {
  const raw = row?.raw_payload;
  const payload = raw?.data && typeof raw.data === 'object' ? raw.data : raw;
  const message = payload?.message ?? raw?.message;
  const msg = message && typeof message === 'object' ? message : null;
  const messageKey = msg?.key;
  const key = payload?.key ?? raw?.key ?? messageKey;
  const senderObj = payload?.sender ?? raw?.sender;
  const contactObj = payload?.contact ?? raw?.contact;
  const groupNames = resolveGroupNameSet(row, payload, raw);

  const name = cleanParticipantName(
    pickStr(
      msg?.senderName,
      msg?.pushName,
      msg?.notifyName,
      payload?.pushName,
      payload?.notifyName,
      payload?.senderName,
      payload?.verifiedName,
      raw?.pushName,
      raw?.notifyName,
      raw?.senderName,
      messageKey?.pushName,
      messageKey?.notifyName,
      senderObj?.pushName,
      senderObj?.notifyName,
      senderObj?.name,
      senderObj?.senderName,
      senderObj?.verifiedName,
      contactObj?.pushName,
      contactObj?.notifyName,
      contactObj?.name,
      contactObj?.senderName,
      row?.sender_name
    ),
    groupNames
  );

  let phoneDigits =
    phoneDigitsFromJid(
      pickStr(msg?.sender_pn, msg?.senderPn, payload?.sender_pn, payload?.senderPn, raw?.sender_pn, raw?.senderPn)
    ) || null;

  if (!phoneDigits && row?.phone) {
    const fromRow = digitsOnly(row.phone);
    if (isPlausibleWhatsAppPhone(fromRow)) phoneDigits = fromRow;
  }

  if (!phoneDigits && row?.sender_name) {
    const fromSenderName = digitsOnly(row.sender_name);
    if (isPlausibleWhatsAppPhone(fromSenderName)) phoneDigits = fromSenderName;
  }

  if (!phoneDigits) {
    phoneDigits =
      phoneDigitsFromJid(pickStr(key?.participant, messageKey?.participant, payload?.participant, payload?.author)) ||
      phoneDigitsFromJid(row?.sender_jid);
  }

  const avatarUrl = participantAvatarFromPayload(senderObj, contactObj);

  return buildParticipantInfo(name, phoneDigits, avatarUrl, row?.sender_jid || phoneDigits);
}

function participantCacheKey(row, info) {
  if (info?.phoneDigits) return `phone:${info.phoneDigits}`;
  return row?.sender_jid || null;
}

/** Melhor nome/foto por participante, cruzando todas as mensagens do grupo. */
export function buildGroupParticipantCache(inboxRows) {
  const cache = new Map();

  for (const row of inboxRows || []) {
    if (!row?.is_group) continue;
    const info = extractGroupParticipantInfo(row);
    const key = participantCacheKey(row, info);
    if (!key) continue;

    const prev = cache.get(key) || {
      name: null,
      phoneDigits: null,
      secondary: null,
      avatarUrl: null,
    };

    const nextName =
      prev.name ||
      (info.primary && !isWeakParticipantLabel(info.primary) && !isPlausibleWhatsAppPhone(info.primary)
        ? info.primary
        : null);

    cache.set(key, {
      name: nextName,
      phoneDigits: prev.phoneDigits || info.phoneDigits || null,
      secondary: prev.secondary || info.secondary || null,
      avatarUrl: prev.avatarUrl || info.avatarUrl || null,
    });
  }

  return cache;
}

export function applyGroupParticipantCache(messages, cache) {
  if (!cache?.size) return messages || [];

  return (messages || []).map((msg) => {
    if (!msg.isGroup || msg.direction === 'out') return msg;

    const key =
      (msg.senderPhoneDigits ? `phone:${msg.senderPhoneDigits}` : null) || msg.senderJid || null;
    const cached = key ? cache.get(key) : null;
    if (!cached) return msg;

    let senderName = msg.senderName;
    let senderSubtitle = msg.senderSubtitle;
    let senderAvatarUrl = msg.senderAvatarUrl;
    let senderPhoneDigits = msg.senderPhoneDigits;

    if (cached.name && isWeakParticipantLabel(senderName)) {
      senderName = cached.name;
      senderSubtitle =
        cached.secondary || (cached.phoneDigits ? formatBrazilPhone(cached.phoneDigits) : null);
    } else if (!senderSubtitle && cached.secondary) {
      senderSubtitle = cached.secondary;
    } else if (!senderSubtitle && cached.phoneDigits && senderName && !isPlausibleWhatsAppPhone(senderName)) {
      senderSubtitle = formatBrazilPhone(cached.phoneDigits);
    }

    if (!senderPhoneDigits && cached.phoneDigits) senderPhoneDigits = cached.phoneDigits;
    if (!senderAvatarUrl && cached.avatarUrl) senderAvatarUrl = cached.avatarUrl;

    return { ...msg, senderName, senderSubtitle, senderAvatarUrl, senderPhoneDigits };
  });
}

/** Busca fotos salvas em cliente_whatsapp_contact para participantes do grupo. */
export async function loadGroupParticipantAvatarMap(supabase, clienteId, inboxRows) {
  const map = new Map();
  if (!supabase || !clienteId) return map;

  const groupRows = (inboxRows || []).filter((r) => r?.is_group);
  const jids = new Set();
  const phones = new Set();

  for (const row of groupRows) {
    if (row.sender_jid) jids.add(row.sender_jid);
    const info = extractGroupParticipantInfo(row);
    if (info.phoneDigits) {
      phones.add(info.phoneDigits);
      jids.add(`${info.phoneDigits}@s.whatsapp.net`);
    }
    const rowPhone = digitsOnly(row.phone);
    if (isPlausibleWhatsAppPhone(rowPhone)) {
      phones.add(rowPhone);
      jids.add(`${rowPhone}@s.whatsapp.net`);
    }
  }

  const jidList = [...jids].filter(Boolean);
  const phoneList = [...phones].filter(Boolean);
  const queries = [];

  if (jidList.length) {
    queries.push(
      supabase
        .from('cliente_whatsapp_contact')
        .select('from_jid, phone, profile_pic_url')
        .eq('cliente_id', clienteId)
        .in('from_jid', jidList)
    );
  }
  if (phoneList.length) {
    queries.push(
      supabase
        .from('cliente_whatsapp_contact')
        .select('from_jid, phone, profile_pic_url')
        .eq('cliente_id', clienteId)
        .in('phone', phoneList)
    );
  }

  const results = await Promise.all(queries);
  for (const res of results) {
    for (const c of res.data || []) {
      const pic = String(c.profile_pic_url || '').trim();
      if (!pic) continue;
      if (c.from_jid) map.set(`jid:${c.from_jid}`, pic);
      const pd = digitsOnly(c.phone);
      if (pd) map.set(`phone:${pd}`, pic);
    }
  }
  return map;
}

export function resolveAvatarFromMap(avatarMap, senderJid, phoneDigits) {
  if (!avatarMap?.size) return null;
  if (senderJid && avatarMap.has(`jid:${senderJid}`)) return avatarMap.get(`jid:${senderJid}`);
  if (phoneDigits && avatarMap.has(`phone:${phoneDigits}`)) return avatarMap.get(`phone:${phoneDigits}`);
  return null;
}

export function enrichGroupThreadMessages(messages, inboxRows, avatarMap) {
  const cache = buildGroupParticipantCache(inboxRows);
  let enriched = applyGroupParticipantCache(messages, cache);

  if (!avatarMap?.size) return enriched;

  return enriched.map((msg) => {
    if (!msg.isGroup || msg.direction === 'out') return msg;
    const url = resolveAvatarFromMap(avatarMap, msg.senderJid, msg.senderPhoneDigits);
    if (!url || storedPhotoIsStale(url)) return msg;
    if (msg.senderAvatarUrl && !storedPhotoIsStale(msg.senderAvatarUrl)) return msg;
    return { ...msg, senderAvatarUrl: url };
  });
}
