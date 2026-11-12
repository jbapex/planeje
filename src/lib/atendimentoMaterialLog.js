/** Classificação e formatação do log de envios (Conversas). */

const URL_RE = /https?:\/\/[^\s]+/i;

export function classifyOutboundBody(body) {
  const text = String(body || '').trim();
  if (!text) return { sendKind: 'text', label: '(mensagem vazia)', fileName: null };

  const lower = text.toLowerCase();
  if (text.startsWith('[Imagem]') || lower.startsWith('[image]')) {
    return { sendKind: 'image', label: text, fileName: text.replace(/^\[[^\]]+\]\s*/, '') || null };
  }
  if (text.startsWith('[Áudio]') || lower.startsWith('[audio]') || lower.startsWith('[ptt]')) {
    return { sendKind: 'audio', label: text, fileName: text.replace(/^\[[^\]]+\]\s*/, '') || null };
  }
  if (text.startsWith('[Documento]') || lower.startsWith('[document]')) {
    return { sendKind: 'document', label: text, fileName: text.replace(/^\[[^\]]+\]\s*/, '') || null };
  }
  if (lower.startsWith('[video]')) {
    return { sendKind: 'video', label: text, fileName: null };
  }
  if (URL_RE.test(text) && text.length < 300) {
    const onlyUrl = text.match(URL_RE)?.[0];
    if (onlyUrl && text.replace(/\s/g, '') === onlyUrl.replace(/\s/g, '')) {
      return { sendKind: 'link', label: onlyUrl, fileName: null };
    }
    if (URL_RE.test(text)) {
      return { sendKind: 'link', label: text.slice(0, 200), fileName: null };
    }
  }
  return { sendKind: 'text', label: text.slice(0, 200), fileName: null };
}

export function sendKindLabel(kind) {
  const map = {
    text: 'Texto',
    link: 'Link',
    image: 'Imagem',
    document: 'Documento',
    audio: 'Áudio',
    video: 'Vídeo',
  };
  return map[kind] || 'Envio';
}

export function formatMaterialLogTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function mergeMaterialLogEntries(logRows, sentRows, agentNames = {}) {
  const byKey = new Map();

  (logRows || []).forEach((row) => {
    const key = row.message_id ? `mid:${row.message_id}` : `log:${row.id}`;
    byKey.set(key, {
      id: row.id,
      sendKind: row.send_kind,
      label: row.label,
      fileName: row.file_name,
      at: row.created_at,
      agentName: row.sent_by ? agentNames[row.sent_by] || null : null,
      source: 'log',
    });
  });

  (sentRows || []).forEach((row) => {
    const key = row.message_id ? `mid:${row.message_id}` : `sent:${row.id}`;
    if (byKey.has(key)) return;
    const classified = classifyOutboundBody(row.body);
    byKey.set(key, {
      id: row.id,
      sendKind: classified.sendKind,
      label: classified.label,
      fileName: classified.fileName,
      at: row.created_at,
      agentName: row.sent_by ? agentNames[row.sent_by] || null : null,
      source: 'sent',
    });
  });

  return Array.from(byKey.values()).sort(
    (a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime()
  );
}

export const SEND_KIND_FILTER_OPTIONS = [
  { value: 'all', label: 'Todos os tipos' },
  { value: 'text', label: 'Texto' },
  { value: 'link', label: 'Link' },
  { value: 'image', label: 'Imagem' },
  { value: 'document', label: 'Documento' },
  { value: 'audio', label: 'Áudio' },
  { value: 'video', label: 'Vídeo' },
];

export const PERIOD_FILTER_OPTIONS = [
  { value: '7', label: 'Últimos 7 dias' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' },
  { value: '0', label: 'Todo o período' },
];

export const AUDIENCE_FILTER_OPTIONS = [
  { value: 'all', label: 'Todos os contatos' },
  { value: 'base', label: 'Só clientes da base' },
];

export function mergeGlobalMaterialLogEntries(logRows, sentRows, agentNames = {}, convByJid = {}) {
  const byKey = new Map();

  (logRows || []).forEach((row) => {
    const key = row.message_id ? `mid:${row.message_id}` : `log:${row.id}`;
    const conv = convByJid[row.chat_jid];
    byKey.set(key, {
      id: row.id,
      chatJid: row.chat_jid,
      conversationId: row.conversation_id,
      sendKind: row.send_kind,
      label: row.label,
      fileName: row.file_name,
      at: row.created_at,
      sentBy: row.sent_by,
      agentName: row.sent_by ? agentNames[row.sent_by] || null : null,
      contactName: conv?.display_name || null,
      isGroup: conv?.is_group || String(row.chat_jid || '').includes('@g.us'),
      source: 'log',
    });
  });

  (sentRows || []).forEach((row) => {
    const key = row.message_id ? `mid:${row.message_id}` : `sent:${row.id}`;
    if (byKey.has(key)) return;
    const classified = classifyOutboundBody(row.body);
    const conv = convByJid[row.chat_jid];
    byKey.set(key, {
      id: row.id,
      chatJid: row.chat_jid,
      conversationId: null,
      sendKind: classified.sendKind,
      label: classified.label,
      fileName: classified.fileName,
      at: row.created_at,
      sentBy: row.sent_by,
      agentName: row.sent_by ? agentNames[row.sent_by] || null : null,
      contactName: conv?.display_name || null,
      isGroup: conv?.is_group || String(row.chat_jid || '').includes('@g.us'),
      source: 'sent',
    });
  });

  return Array.from(byKey.values()).sort(
    (a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime()
  );
}

export function computeMaterialLogStats(entries) {
  return (entries || []).reduce(
    (acc, e) => {
      acc.total += 1;
      acc[e.sendKind] = (acc[e.sendKind] || 0) + 1;
      return acc;
    },
    { total: 0 }
  );
}
