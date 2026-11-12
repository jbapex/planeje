/** Junta mensagens da conversa com as notas internas (balão amarelo) na ordem do tempo. */
import { auditDayLabel, auditTimeLabel } from './rastreamentoLeadConversa.js';

function dayKeyOf(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function mergeThreadWithNotes(items = [], notas = [], now = new Date()) {
  const bubbles = (items || []).filter((item) => item && item.type !== 'day');
  const noteItems = (notas || []).map((nota) => ({
    id: `note-${nota.id}`,
    noteId: nota.id,
    type: 'note',
    side: 'nota',
    body: nota.texto,
    at: nota.created_at,
    autorId: nota.autor_id || null,
    autor: nota.autor_nome || 'Atendente',
  }));
  const merged = [...bubbles, ...noteItems].sort(
    (a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime()
  );
  const out = [];
  let lastDay = '';
  merged.forEach((item) => {
    const key = dayKeyOf(item.at);
    if (key && key !== lastDay) {
      out.push({ id: `day-${key}`, type: 'day', label: auditDayLabel(item.at, now) });
      lastDay = key;
    }
    out.push({ type: 'msg', ...item, timeLabel: item.timeLabel || auditTimeLabel(item.at) });
  });
  return out;
}

/** Última entrada (contato) e saída (loja) por contato, a partir das linhas já lidas. */
export function lastActivityByContact(contacts = [], inboxRows = [], sentRows = []) {
  const digitsOf = (value) => String(value || '').split('@')[0].split(':')[0].replace(/\D/g, '');
  const inboundByKey = new Map();
  const outboundByKey = new Map();
  const bump = (map, key, at) => {
    if (!key || !at) return;
    const prev = map.get(key);
    if (!prev || new Date(at).getTime() > new Date(prev).getTime()) map.set(key, at);
  };
  (inboxRows || []).forEach((row) => {
    if (row?.is_group) return;
    const at = row.msg_timestamp || row.created_at;
    bump(inboundByKey, digitsOf(row.from_jid || row.chat_jid), at);
    bump(inboundByKey, digitsOf(row.phone), at);
  });
  (sentRows || []).forEach((row) => {
    bump(outboundByKey, digitsOf(row.chat_jid || row.to_jid), row.created_at);
  });
  const result = new Map();
  (contacts || []).forEach((contact) => {
    const keys = [digitsOf(contact.from_jid), digitsOf(contact.phone)].filter(Boolean);
    let lastInboundAt = null;
    let lastOutboundAt = null;
    keys.forEach((key) => {
      const inAt = inboundByKey.get(key);
      const outAt = outboundByKey.get(key);
      if (inAt && (!lastInboundAt || new Date(inAt) > new Date(lastInboundAt))) lastInboundAt = inAt;
      if (outAt && (!lastOutboundAt || new Date(outAt) > new Date(lastOutboundAt))) lastOutboundAt = outAt;
    });
    result.set(contact.id, { lastInboundAt, lastOutboundAt });
  });
  return result;
}
