import { messageBodyForDisplay, jidPhoneDigits } from '@/lib/uazapiMessageBody';
import { isStableMediaUrl } from '@/lib/atendimentoMediaDownload';
import { isInboxMediaPurged, ATENDIMENTO_MEDIA_RETENTION_DAYS } from '@/lib/atendimentoMediaRetention';
import { enrichGroupThreadMessages, extractGroupParticipantInfo } from '@/lib/groupParticipantDisplay';

const URL_KEYS = ['URL', 'url', 'mediaUrl', 'media_url', 'downloadUrl', 'directPath', 'link', 'href', 'fileUrl', 'file_url'];

function pickHttpUrl(obj) {
  if (!obj || typeof obj !== 'object') return '';
  for (const k of URL_KEYS) {
    const v = obj[k];
    if (typeof v === 'string' && /^https?:\/\//i.test(v.trim())) return v.trim();
  }
  return '';
}

function normalizeMediaKind(rawType, blockKey, mimetype = null) {
  const fromMime = inferMediaKindFromMimetype(mimetype);
  if (fromMime) return fromMime;

  const t = String(rawType || '').toLowerCase();
  if (blockKey === 'stickerMessage' || t === 'sticker') return 'sticker';
  if (blockKey === 'imageMessage' || t === 'image') return 'image';
  if (blockKey === 'videoMessage' || ['video', 'videoplay', 'ptv'].includes(t)) return 'video';
  if (
    blockKey === 'audioMessage' ||
    blockKey === 'pttMessage' ||
    ['audio', 'ptt', 'myaudio', 'voice', 'voicemessage', 'voice_message'].includes(t)
  ) {
    return 'audio';
  }
  if (blockKey === 'documentMessage' || t === 'document') return 'document';
  return 'file';
}

function inferMediaKindFromMimetype(mimetype) {
  const m = String(mimetype || '').toLowerCase();
  if (!m) return null;
  if (m.startsWith('audio/') || m.includes('ogg') || m.includes('opus')) return 'audio';
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.includes('pdf') || m.includes('msword') || m.includes('document') || m.includes('sheet')) return 'document';
  return null;
}

function getPayloadRootFromRow(row) {
  const raw = row?.raw_payload;
  if (!raw || typeof raw !== 'object') return { raw: null, payload: null, msg: null };
  const payload = raw.data && typeof raw.data === 'object' ? raw.data : raw;
  const message = payload.message ?? raw.message;
  const msg = message && typeof message === 'object' ? message : null;
  return { raw, payload, msg };
}

function hasAudioSignalInPayload(payload, raw, msg) {
  if (msg?.audioMessage || msg?.pttMessage) return true;
  const content = (payload?.content && typeof payload.content === 'object' ? payload.content : null) ||
    (msg?.content && typeof msg.content === 'object' ? msg.content : null);
  if (content) {
    if (content.ptt === true || content.audio === true || content.voice === true) return true;
    if (inferMediaKindFromMimetype(content.mimetype) === 'audio') return true;
  }
  return false;
}

function resolvePayloadMediaType(row) {
  const { raw, payload, msg } = getPayloadRootFromRow(row);
  if (!payload) return null;

  const candidates = [
    row?.type,
    payload.type,
    payload.mediaType,
    payload.mediatype,
    payload.messageType,
    raw?.type,
    typeof payload.content === 'object' ? payload.content?.type : null,
    typeof msg?.content === 'object' ? msg.content?.type : null,
  ]
    .map((v) => String(v || '').toLowerCase().trim())
    .filter(Boolean);

  for (const t of candidates) {
    const k = normalizeMediaKind(t, null);
    if (k !== 'file' || ['audio', 'ptt', 'myaudio', 'voice'].includes(t)) return k;
  }

  if (hasAudioSignalInPayload(payload, raw, msg)) return 'audio';
  return null;
}

export function resolveEffectiveMediaKind(kind, media, row = null) {
  const fromMime = inferMediaKindFromMimetype(media?.mimetype);
  if (fromMime) return fromMime;
  if (row) {
    const fromPayload = resolvePayloadMediaType(row);
    if (fromPayload) return fromPayload;
  }
  const k = String(kind || '').toLowerCase();
  if (['audio', 'ptt', 'myaudio', 'voice'].includes(k)) return 'audio';
  return kind || 'text';
}

function isMediaPlaceholderBody(body) {
  const b = String(body || '').trim();
  if (!b) return true;
  if (b === '(mensagem sem texto)' || b === '(mensagem)') return true;
  if (/^\[[^\]]+\]$/.test(b)) return true;
  return false;
}

function thumbDataUrl(jpegThumbnail) {
  if (!jpegThumbnail) return '';
  const s = String(jpegThumbnail).trim();
  if (!s) return '';
  if (s.startsWith('data:')) return s;
  return `data:image/jpeg;base64,${s}`;
}

function resolveMediaUrl(httpUrl, thumb) {
  if (httpUrl && isStableMediaUrl(httpUrl)) {
    return { url: httpUrl, isThumbnail: false };
  }
  const thumbUrl = thumbDataUrl(thumb);
  if (thumbUrl) return { url: thumbUrl, isThumbnail: true };
  return { url: null, isThumbnail: false };
}

/** IDs para tentar no /message/download (stanza, id completo, id interno uazapi). */
export function resolveDownloadMessageIds(row) {
  const ids = [];
  const add = (v) => {
    const s = String(v ?? '').trim();
    if (s && !ids.includes(s)) ids.push(s);
  };

  const fromRaw = extractWaIdsFromRaw(row?.raw_payload);
  if (fromRaw?.stanza) add(fromRaw.stanza);
  if (fromRaw?.full) add(fromRaw.full);

  const raw = row?.raw_payload;
  if (raw && typeof raw === 'object') {
    const payload = raw.data && typeof raw.data === 'object' ? raw.data : raw;
    add(payload.messageid);
    add(payload.messageId);
    add(payload.id);
    const owner = String(payload.owner ?? payload.instance ?? raw.owner ?? '').trim();
    if (fromRaw?.stanza && owner) add(`${owner}:${fromRaw.stanza}`);
    const key = payload.key ?? raw.key;
    if (key && typeof key === 'object' && key.id) add(key.id);
    const message = payload.message ?? raw.message;
    if (message && typeof message === 'object') {
      if (message.key?.id) add(message.key.id);
      if (message.id) add(message.id);
    }
  }

  add(row?.message_id);
  return ids;
}

/** Extrai mídia de uma linha do inbox (raw_payload uazapi). */
export function extractMediaFromInboxRow(row) {
  const raw = row?.raw_payload;
  if (!raw || typeof raw !== 'object') return null;

  const payload = raw.data && typeof raw.data === 'object' ? raw.data : raw;
  const message = payload.message ?? raw.message;
  const msg = message && typeof message === 'object' ? message : null;

  const content =
    (payload.content && typeof payload.content === 'object' ? payload.content : null) ||
    (msg?.content && typeof msg.content === 'object' ? msg.content : null);

  const rowType = String(row?.type || payload?.type || raw?.type || '').toLowerCase();
  const isMediaRowType = ['image', 'sticker', 'video', 'videoplay', 'ptv', 'audio', 'ptt', 'myaudio', 'document', 'file'].includes(
    rowType
  );

  if (content && typeof content === 'object') {
    const httpUrl = pickHttpUrl(content) || pickHttpUrl(msg) || pickHttpUrl(payload);
    const { url, isThumbnail } = resolveMediaUrl(
      httpUrl,
      content.jpegThumbnail || content.thumbnail || payload?.jpegThumbnail || payload?.thumbnail
    );
    const fileName =
      String(content.fileName || content.title || payload?.fileName || payload?.title || '').trim() || null;
    const mimetype = String(content.mimetype || payload?.mimetype || '').trim() || null;
    const caption = String(content.caption || content.text || payload?.caption || '').trim() || null;
    if (isMediaRowType || url || fileName || mimetype) {
      return {
        kind: normalizeMediaKind(rowType, null, mimetype),
        url,
        isThumbnail,
        fileName,
        mimetype,
        caption: caption || null,
      };
    }
  }

  if (hasAudioSignalInPayload(payload, raw, msg)) {
    const httpUrl = pickHttpUrl(content) || pickHttpUrl(payload) || pickHttpUrl(msg);
    const { url, isThumbnail } = resolveMediaUrl(httpUrl, content?.jpegThumbnail || content?.thumbnail);
    return {
      kind: 'audio',
      url,
      isThumbnail,
      fileName: String(content?.fileName || payload?.fileName || '').trim() || null,
      mimetype: String(content?.mimetype || payload?.mimetype || 'audio/ogg').trim() || null,
      caption: null,
    };
  }

  if (isMediaRowType) {
    const httpUrl = pickHttpUrl(payload) || pickHttpUrl(raw) || pickHttpUrl(msg);
    const { url, isThumbnail } = resolveMediaUrl(httpUrl, payload?.jpegThumbnail || payload?.thumbnail);
    return {
      kind: normalizeMediaKind(rowType, null, payload?.mimetype),
      url,
      isThumbnail,
      fileName: String(payload?.fileName || payload?.title || '').trim() || null,
      mimetype: String(payload?.mimetype || '').trim() || null,
      caption: null,
    };
  }

  const blocks = [
    ['imageMessage', msg?.imageMessage],
    ['videoMessage', msg?.videoMessage],
    ['audioMessage', msg?.audioMessage ?? msg?.pttMessage],
    ['documentMessage', msg?.documentMessage],
    ['stickerMessage', msg?.stickerMessage],
  ];

  for (const [key, block] of blocks) {
    if (!block || typeof block !== 'object') continue;
    const httpUrl = pickHttpUrl(block) || pickHttpUrl(content);
    const { url, isThumbnail } = resolveMediaUrl(httpUrl, block.jpegThumbnail || block.thumbnail);
    const fileName = String(block.fileName || block.title || content?.fileName || content?.title || '').trim() || null;
    const mimetype = String(block.mimetype || content?.mimetype || '').trim() || null;
    const caption = String(block.caption || content?.caption || '').trim();
    if (url || httpUrl || block.jpegThumbnail || block.thumbnail) {
      return {
        kind: normalizeMediaKind(rowType, key, mimetype),
        url,
        isThumbnail,
        fileName,
        mimetype,
        caption: caption || null,
      };
    }
    // Bloco de mídia sem URL — será resolvido via /message/download
    return {
      kind: normalizeMediaKind(rowType, key, mimetype),
      url: null,
      isThumbnail: false,
      fileName,
      mimetype,
      caption: caption || null,
    };
  }

  if (content) {
    const httpUrl = pickHttpUrl(content);
    if (httpUrl) {
      const { url, isThumbnail } = resolveMediaUrl(httpUrl, content.jpegThumbnail || content.thumbnail);
      return {
        kind: normalizeMediaKind(rowType, null, content.mimetype),
        url,
        isThumbnail,
        fileName: String(content.fileName || content.title || '').trim() || null,
        mimetype: String(content.mimetype || '').trim() || null,
        caption: String(content.caption || content.text || '').trim() || null,
      };
    }
  }

  const topUrl = pickHttpUrl(payload) || pickHttpUrl(raw);
  if (topUrl && rowType && !['text', 'chat', 'conversation'].includes(rowType)) {
    const { url, isThumbnail } = resolveMediaUrl(topUrl, null);
    return { kind: normalizeMediaKind(rowType, null, payload?.mimetype), url, isThumbnail, fileName: null, mimetype: payload?.mimetype || null, caption: null };
  }

  return null;
}

export function resolveInboxMessageKind(row) {
  const fromPayload = resolvePayloadMediaType(row);
  if (fromPayload) return fromPayload;

  const t = String(row?.type || '').toLowerCase();
  if (['image', 'sticker'].includes(t)) return 'image';
  if (['video', 'videoplay', 'ptv'].includes(t)) return 'video';
  if (['audio', 'ptt', 'myaudio', 'voice', 'voicemessage'].includes(t)) return 'audio';
  if (t === 'document') return 'document';
  const media = extractMediaFromInboxRow(row);
  if (media?.kind && media.kind !== 'file') return media.kind;
  if (media?.kind === 'file' && inferMediaKindFromMimetype(media.mimetype)) {
    return inferMediaKindFromMimetype(media.mimetype);
  }
  return media?.kind || 'text';
}

function expandMessageIdVariants(id) {
  const out = new Set();
  const s = String(id || '').trim();
  if (!s) return out;
  out.add(s);
  const stanza = stanzaFromValue(s);
  if (stanza) out.add(stanza);
  if (s.includes(':')) {
    const part = s.split(':').pop()?.trim();
    if (part) out.add(part);
  }
  return out;
}

function collectThreadMessageIdVariants(msg) {
  const out = new Set();
  const add = (id) => expandMessageIdVariants(id).forEach((v) => out.add(v));
  add(msg?.uazapiMessageId);
  add(msg?.uazapiInternalId);
  (msg?.downloadMessageIds || []).forEach(add);
  return out;
}

export function getInboxRowDedupeVariants(row) {
  const out = new Set();
  const add = (id) => expandMessageIdVariants(id).forEach((v) => out.add(v));
  add(resolveUazapiMessageId(row));
  add(row?.message_id);
  (resolveDownloadMessageIds(row) || []).forEach(add);
  return out;
}

export function getThreadMessageDedupeVariants(msg) {
  return collectThreadMessageIdVariants(msg);
}

export function inboxRowContentFingerprint(row) {
  const fromMe = isFromMeInboxRow(row);
  const at = row?.msg_timestamp || row?.created_at;
  const ts = at ? Math.floor(new Date(at).getTime() / 2000) : 0;
  const body = String(row?.body || '').trim();
  const sender = String(row?.sender_jid || row?.phone || row?.sender_name || '').trim();
  const type = String(row?.type || 'text').toLowerCase();
  return `${fromMe ? 'out' : 'in'}|${sender}|${ts}|${type}|${body}`;
}

export function threadMessageContentFingerprint(msg) {
  const at = msg?.at ? Math.floor(new Date(msg.at).getTime() / 2000) : 0;
  const body = String(msg?.body || '').trim();
  const sender = String(msg?.senderKey || msg?.senderJid || msg?.senderName || '').trim();
  const kind = String(msg?.kind || 'text');
  return `${msg?.direction || 'in'}|${sender}|${at}|${kind}|${body}`;
}

export function sentRowContentFingerprint(row) {
  const at = row?.created_at;
  const ts = at ? Math.floor(new Date(at).getTime() / 2000) : 0;
  const body = String(row?.body || '').trim();
  return `out|${ts}|${body}`;
}

function threadMessageMatchesTarget(msg, targetId) {
  const targets = expandMessageIdVariants(targetId);
  const msgIds = collectThreadMessageIdVariants(msg);
  for (const t of targets) {
    if (msgIds.has(t)) return true;
  }
  return false;
}

function mergeReactionLists(into, list) {
  const map = new Map((into || []).map((r) => [r.emoji, r.count]));
  (list || []).forEach((r) => {
    const emoji = r.emoji || '👍';
    map.set(emoji, (map.get(emoji) || 0) + (r.count || 1));
  });
  return Array.from(map, ([emoji, count]) => ({ emoji, count }));
}

function findReactionsForMessage(msg, reactionsByTarget) {
  let merged = [];
  for (const alias of collectThreadMessageIdVariants(msg)) {
    if (reactionsByTarget.has(alias)) {
      merged = mergeReactionLists(merged, reactionsByTarget.get(alias));
    }
  }
  return merged;
}

export function resolveSentDownloadMessageIds(row) {
  const ids = [];
  const add = (v) => {
    const s = String(v ?? '').trim();
    if (s && !ids.includes(s)) ids.push(s);
  };
  add(row?.message_id);
  add(row?.uazapi_internal_id);
  const stanza = stanzaFromValue(row?.message_id);
  if (stanza && stanza !== row?.message_id) add(stanza);
  if (row?.message_id?.includes(':')) add(row.message_id.split(':').pop());
  return ids;
}

export const ATENDIMENTO_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

function isInternalUazapiId(id) {
  const s = String(id || '').trim();
  if (!s) return true;
  if (/^r[0-9a-f]{6,}$/i.test(s)) return true;
  if (/^sent_\d+$/i.test(s)) return true;
  if (/@.+_\d{13,}$/.test(s)) return true;
  return false;
}

function stanzaFromValue(value) {
  const s = String(value ?? '').trim();
  if (!s || isInternalUazapiId(s)) return '';
  if (s.includes(':')) {
    const part = s.split(':').pop()?.trim() || '';
    return isInternalUazapiId(part) ? '' : part;
  }
  return s;
}

function extractWaIdsFromRaw(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const body = raw;
  const payload = raw.data && typeof raw.data === 'object' ? raw.data : raw;
  const key = payload.key ?? body.key;
  const msg = payload.message ?? body.message;
  const msgKey = msg?.key;

  const fullIdRaw = String(payload.id ?? body.id ?? '').trim();
  if (fullIdRaw.includes(':')) {
    const stanza = stanzaFromValue(fullIdRaw);
    if (stanza) return { stanza, full: fullIdRaw };
  }

  for (const candidate of [
    msg?.messageid,
    msg?.messageId,
    payload.messageid,
    payload.messageId,
    body.messageid,
    body.messageId,
    msgKey?.id,
    msgKey?.ID,
    key?.id,
    key?.ID,
    payload.id,
    body.id,
  ]) {
    const stanza = stanzaFromValue(candidate);
    if (stanza) {
      return {
        stanza,
        full: String(candidate ?? '').includes(':') ? String(candidate).trim() : undefined,
      };
    }
  }
  return null;
}

/** ID WhatsApp usado em react/reply/download (não o id interno rXXXX da uazapi). */
export function resolveUazapiMessageId(row) {
  const fromRaw = extractWaIdsFromRaw(row?.raw_payload);
  if (fromRaw?.stanza) return fromRaw.stanza;
  const stored = row?.message_id || '';
  const stanza = stanzaFromValue(stored);
  return stanza || stored || null;
}

export function canReactToThreadMessage(msg) {
  return msg?.direction === 'in' && Boolean(msg?.id) && !msg?.deleted;
}

function isDeletedMessageBody(body) {
  const t = String(body || '').trim().toLowerCase();
  return t.includes('mensagem foi apagada') || t.includes('apagada para todos');
}

function getPayloadRoot(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const payload = raw.data && typeof raw.data === 'object' ? raw.data : raw;
  return payload && typeof payload === 'object' ? payload : null;
}

function getMessageObj(payload, raw) {
  const message = payload?.message ?? raw?.message;
  return message && typeof message === 'object' ? message : null;
}

function quotePreviewText(text, kind) {
  const t = String(text || '').trim();
  if (t) return t.length > 120 ? `${t.slice(0, 120)}…` : t;
  if (kind === 'image' || kind === 'sticker') return '📷 Foto';
  if (kind === 'video') return '🎬 Vídeo';
  if (kind === 'audio') return '🎵 Áudio';
  if (kind === 'document') return '📄 Documento';
  return 'Mensagem';
}

/** Extrai citação (reply) de raw_payload uazapi/Baileys. */
export function extractQuotedFromInboxRow(row) {
  const raw = row?.raw_payload;
  const payload = getPayloadRoot(raw);
  if (!payload) return null;

  const quotedId =
    String(payload.quoted || payload.quotedMessageId || payload.replyid || '').trim() || null;

  const msg = getMessageObj(payload, raw);
  const blocks = [
    msg?.extendedTextMessage,
    msg?.imageMessage,
    msg?.videoMessage,
    msg?.audioMessage,
    msg?.documentMessage,
    msg?.conversation && typeof msg.conversation === 'object' ? msg : null,
  ].filter(Boolean);

  for (const block of blocks) {
    const ctx = block?.contextInfo;
    if (!ctx || typeof ctx !== 'object') continue;
    const stanzaId = String(ctx.stanzaId || ctx.stanzaID || quotedId || '').trim();
    const qm = ctx.quotedMessage;
    if (!stanzaId && !qm) continue;

    let author = String(ctx.participant || ctx.remoteJid || '').replace(/@.*$/, '') || row?.sender_name || 'Contato';
    if (ctx.quotedMessage?.senderName) author = ctx.quotedMessage.senderName;

    let text = '';
    if (qm && typeof qm === 'object') {
      const qExt = qm.extendedTextMessage;
      const qConv = qm.conversation;
      text =
        (typeof qConv === 'string' ? qConv : '') ||
        (qExt?.text ? String(qExt.text) : '') ||
        (qm.imageMessage?.caption ? String(qm.imageMessage.caption) : '') ||
        (qm.documentMessage?.fileName ? String(qm.documentMessage.fileName) : '') ||
        '';
    }

    return {
      messageId: stanzaId || quotedId,
      author,
      text: quotePreviewText(text, qm?.imageMessage ? 'image' : qm?.videoMessage ? 'video' : 'text'),
    };
  }

  if (quotedId) {
    return { messageId: quotedId, author: row?.sender_name || 'Contato', text: 'Mensagem' };
  }
  return null;
}

function firstNonEmpty(...vals) {
  for (const value of vals) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

function lowerType(value) {
  return String(value || '').toLowerCase().replace(/[^a-z]/g, '');
}

function isReactionTypeName(...vals) {
  return vals.some((value) => {
    const t = lowerType(value);
    return t === 'reaction' || t === 'reactionmessage';
  });
}

function reactionTargetFromKey(key) {
  if (!key || typeof key !== 'object') return '';
  return firstNonEmpty(key.id, key.ID, key.Id);
}

/** Evento de reação inbound (não exibir como mensagem). */
export function extractReactionEventFromInboxRow(row) {
  const type = String(row?.type || '').toLowerCase();
  const raw = row?.raw_payload;
  const payload = getPayloadRoot(raw);
  const msg = getMessageObj(payload, raw);
  const messageType = String(payload?.messageType ?? payload?.type ?? type ?? '').toLowerCase();
  const content =
    (msg?.content && typeof msg.content === 'object' ? msg.content : null) ||
    (payload?.content && typeof payload.content === 'object' ? payload.content : null);
  const reactionBlock =
    (msg?.reactionMessage && typeof msg.reactionMessage === 'object' ? msg.reactionMessage : null) ||
    (content?.reactionMessage && typeof content.reactionMessage === 'object' ? content.reactionMessage : null);

  const looksLikeReaction =
    Boolean(reactionBlock) ||
    isReactionTypeName(type, messageType, msg?.type, msg?.messageType, payload?.type, payload?.messageType) ||
    Boolean(msg?.reaction) ||
    Boolean(content && typeof content === 'object' && (content.text || content.key) && (msg?.reaction || content.key));

  if (!looksLikeReaction) return null;

  const targetId = firstNonEmpty(
    reactionTargetFromKey(reactionBlock?.key),
    reactionTargetFromKey(content?.key),
    msg?.reaction,
    payload?.reaction,
    content?.reaction,
    payload?.quoted,
    payload?.targetMessageID,
    payload?.targetMessageId,
    payload?.target_message_id,
  );
  const emoji = firstNonEmpty(
    reactionBlock?.text,
    content?.text,
    msg?.text,
    row?.body,
    payload?.text,
    payload?.emoji,
  );

  return {
    targetMessageId: targetId,
    emoji: emoji || '👍',
    senderName: row?.sender_name || 'Contato',
  };
}

export function extractIsForwardedFromInboxRow(row) {
  const raw = row?.raw_payload;
  const payload = getPayloadRoot(raw);
  if (!payload) return false;
  if (payload.forward === true || payload.isForwarded === true) return true;

  const msg = getMessageObj(payload, raw);
  const blocks = [msg?.extendedTextMessage, msg?.imageMessage, msg?.videoMessage, msg?.documentMessage];
  for (const block of blocks) {
    const ctx = block?.contextInfo;
    if (ctx?.isForwarded === true || ctx?.forwardingScore > 0) return true;
  }
  return false;
}

export function isReactionInboxRow(row) {
  return Boolean(extractReactionEventFromInboxRow(row));
}

export function messagePreviewForReply(msg) {
  if (!msg) return '';
  if (msg.body?.trim()) return msg.body.trim();
  if (msg.kind === 'image') return '📷 Foto';
  if (msg.kind === 'video') return '🎬 Vídeo';
  if (msg.kind === 'audio') return '🎵 Áudio';
  if (msg.kind === 'document') return '📄 Documento';
  return 'Mensagem';
}

/** Resolve quotes e agrega reações na thread. */
export function enrichThreadMessages(messages, inboxRows = []) {
  const byUazapiId = new Map();
  (messages || []).forEach((m) => {
    if (m.uazapiMessageId) byUazapiId.set(m.uazapiMessageId, m);
  });

  const reactionsByTarget = new Map();
  (inboxRows || []).forEach((row) => {
    const ev = extractReactionEventFromInboxRow(row);
    if (!ev?.targetMessageId) return;
    const list = [{ emoji: ev.emoji || '👍', count: 1 }];
    expandMessageIdVariants(ev.targetMessageId).forEach((key) => {
      const prev = reactionsByTarget.get(key) || [];
      reactionsByTarget.set(key, mergeReactionLists(prev, list));
    });
  });

  return (messages || []).map((msg) => {
    let quoteUpdated = false;
    let nextQuote = msg.quote;
    if (msg.quote?.messageId && !msg.quote.text) {
      const ref = byUazapiId.get(msg.quote.messageId);
      if (ref) {
        nextQuote = {
          ...msg.quote,
          author: ref.senderName || msg.quote.author,
          text: messagePreviewForReply(ref),
        };
        quoteUpdated = true;
      }
    }
    const reactions = findReactionsForMessage(msg, reactionsByTarget);
    const reactionsChanged =
      reactions.length > 0
        ? JSON.stringify(reactions) !== JSON.stringify(msg.reactions || [])
        : Boolean(msg.reactions?.length);

    if (!quoteUpdated && !reactionsChanged) return msg;

    const next = { ...msg };
    if (quoteUpdated) next.quote = nextQuote;
    if (reactions.length) next.reactions = reactions;
    else if (msg.reactions?.length) next.reactions = reactions;
    return next;
  });
}

/** Aplica uma reação recebida em tempo real à mensagem alvo (inclui mensagens enviadas). */
export function applyReactionInboxRow(messages, row) {
  const ev = extractReactionEventFromInboxRow(row);
  if (!ev?.targetMessageId) return messages || [];

  return (messages || []).map((msg) => {
    if (!threadMessageMatchesTarget(msg, ev.targetMessageId)) return msg;

    if (!ev.emoji) {
      return { ...msg, reactions: (msg.reactions || []).filter((r) => r.emoji !== ev.emoji) };
    }

    const reactions = [...(msg.reactions || [])];
    const existing = reactions.find((r) => r.emoji === ev.emoji);
    if (existing) existing.count += 1;
    else reactions.push({ emoji: ev.emoji || '👍', count: 1 });
    return { ...msg, reactions };
  });
}

export function isFromMeInboxRow(row) {
  const raw = row?.raw_payload;
  if (!raw || typeof raw !== 'object') return false;

  const payload = raw.data && typeof raw.data === 'object' ? raw.data : raw;
  const message = payload.message ?? raw.message;
  const msg = message && typeof message === 'object' ? message : null;
  const key = payload.key ?? raw.key ?? msg?.key;

  for (const candidate of [
    payload.fromMe,
    raw.fromMe,
    payload.wasSentByApi,
    raw.wasSentByApi,
    msg?.fromMe,
    key?.fromMe,
  ]) {
    if (candidate === true) return true;
    if (candidate === false) return false;
  }
  return false;
}

function pickStrFromPayload(...values) {
  for (const v of values) {
    const s = String(v ?? '').trim();
    if (s) return s;
  }
  return '';
}

/** Nome do participante em mensagem de grupo (extrai do raw_payload se o banco tiver só o nome do grupo). */
export function extractGroupParticipantFromInboxRow(row) {
  return extractGroupParticipantInfo(row).primary;
}

export function resolveInboxSenderDisplayName(row) {
  if (!row?.is_group) return row?.sender_name || null;
  return extractGroupParticipantInfo(row).primary;
}

export function resolveInboxSenderSubtitle(row) {
  if (!row?.is_group) return null;
  return extractGroupParticipantInfo(row).secondary;
}

const GROUP_SENDER_HUES = [145, 185, 205, 265, 300, 15, 35, 55];

/** Cor estável por participante (estilo WhatsApp Web). */
export function groupSenderAccentColor(name) {
  const s = String(name || '').trim();
  if (!s) return 'var(--wa-green-dark)';
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = s.charCodeAt(i) + ((h << 5) - h);
  const hue = GROUP_SENDER_HUES[Math.abs(h) % GROUP_SENDER_HUES.length];
  return `hsl(${hue} 48% 36%)`;
}

export function mapInboxRowToThreadMessage(row) {
  if (isReactionInboxRow(row)) return null;

  const fromMe = isFromMeInboxRow(row);

  const media = extractMediaFromInboxRow(row);
  const body = messageBodyForDisplay(row);
  let kind = resolveEffectiveMediaKind(media?.kind || resolveInboxMessageKind(row), media, row);
  const caption = media?.caption;
  const textBody =
    kind !== 'text' && isMediaPlaceholderBody(body)
      ? caption || ''
      : kind !== 'text' && body.startsWith('[') && caption
        ? caption
        : kind !== 'text' && body.startsWith('[') && !caption
          ? ''
          : body;

  const participant = !fromMe && row.is_group ? extractGroupParticipantInfo(row) : null;
  const senderName = fromMe ? 'Você' : row.is_group ? participant.primary : row.sender_name;
  const senderSubtitle = !fromMe && row.is_group ? participant.secondary : null;

  return {
    id: row.id,
    direction: fromMe ? 'out' : 'in',
    body: textBody,
    at: row.msg_timestamp || row.created_at,
    createdAt: row.created_at || row.msg_timestamp,
    senderName,
    senderSubtitle,
    senderJid: row.sender_jid || null,
    senderPhoneDigits: participant?.phoneDigits || null,
    senderKey: participant?.phoneDigits
      ? `phone:${participant.phoneDigits}`
      : participant?.accentKey || row.sender_jid || row.id,
    senderAvatarUrl: participant?.avatarUrl || null,
    senderAccent:
      row.is_group && !fromMe && senderName ? groupSenderAccentColor(participant?.accentKey || senderName) : null,
    isGroup: row.is_group,
    kind,
    media,
    mediaPurged: isInboxMediaPurged(row),
    uazapiMessageId: resolveUazapiMessageId(row),
    downloadMessageIds: resolveDownloadMessageIds(row),
    whatsappConfigId: row.whatsapp_config_id || null,
    ack: fromMe ? 'sent' : null,
    quote: extractQuotedFromInboxRow(row),
    isForwarded: extractIsForwardedFromInboxRow(row),
    reactions: [],
  };
}

export function mapAckStatusFromRow(row) {
  const raw = String(row?.ack_status ?? '').trim().toLowerCase();
  if (raw === 'read' || raw === 'played' || raw === 'viewed') return 'read';
  if (raw === 'delivered' || raw === 'delivery_ack') return 'delivered';
  if (raw === 'pending') return 'pending';
  return 'sent';
}

export function createOptimisticOutgoingMessage({
  body,
  kind = 'text',
  whatsappConfigId,
  quote = null,
}) {
  const clientTempId = `opt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id: clientTempId,
    clientTempId,
    direction: 'out',
    body,
    at: new Date().toISOString(),
    senderName: 'Atendente',
    kind,
    media: null,
    uazapiMessageId: null,
    whatsappConfigId: whatsappConfigId || null,
    ack: 'pending',
    quote,
    isForwarded: false,
    reactions: [],
    deleted: false,
    optimistic: true,
  };
}

function sortThreadMessages(list) {
  return [...(list || [])].sort(
    (a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime()
  );
}

export function mergeSentRowIntoMessages(messages, row) {
  const mapped = mapSentRowToThreadMessage(row);
  if (!mapped) return messages || [];

  const prev = messages || [];
  const byId = prev.findIndex((m) => m.id === mapped.id);
  if (byId >= 0) {
    const next = [...prev];
    next[byId] = { ...next[byId], ...mapped };
    return sortThreadMessages(next);
  }

  const optIdx = prev.findIndex(
    (m) =>
      m.optimistic &&
      !m.upload &&
      (m.clientTempId === mapped.clientTempId ||
        (m.body === mapped.body && Math.abs(new Date(m.at) - new Date(mapped.at)) < 120000))
  );
  if (optIdx >= 0) {
    const next = [...prev];
    next[optIdx] = mapped;
    return sortThreadMessages(next);
  }

  if (prev.some((m) => m.id === mapped.id)) return prev;
  return sortThreadMessages([...prev, mapped]);
}

export function mergeInboxRowIntoMessages(messages, row, inboxRowsForEnrich = []) {
  const mapped = mapInboxRowToThreadMessage(row);
  const prev = messages || [];

  if (mapped) {
    if (prev.some((m) => m.id === mapped.id)) return prev;
    const merged = sortThreadMessages([...prev, mapped]);
    const needsQuoteEnrich = prev.some(
      (m) => m.quote?.messageId && !m.quote?.text && mapped.uazapiMessageId === m.quote.messageId
    );
    if (needsQuoteEnrich) {
      return enrichThreadMessages(merged, inboxRowsForEnrich.length ? inboxRowsForEnrich : [row]);
    }
    return merged;
  }

  if (extractReactionEventFromInboxRow(row)) {
    if (inboxRowsForEnrich.length > 1) {
      return enrichThreadMessages(prev, inboxRowsForEnrich);
    }
    return applyReactionInboxRow(prev, row);
  }

  return prev;
}

export function patchMessageAcks(messages, updates) {
  if (!updates?.length) return messages || [];
  const byId = new Map(updates.map((u) => [u.id, u.ack_status]));
  let changed = false;
  const next = (messages || []).map((msg) => {
    const ackStatus = byId.get(msg.id);
    if (ackStatus == null) return msg;
    const ack = mapAckStatusFromRow({ ack_status: ackStatus });
    if (msg.ack === ack) return msg;
    changed = true;
    return { ...msg, ack };
  });
  return changed ? next : messages || [];
}

export function mapSentRowToThreadMessage(row) {
  const body = row.body?.trim() || '(mensagem enviada)';
  const deleted = isDeletedMessageBody(body);
  let kind = 'text';
  const lower = body.toLowerCase();
  if (body.startsWith('[Imagem]') || lower.startsWith('[image]')) kind = 'image';
  else if (body.startsWith('[Documento]') || body.startsWith('[Áudio]') || lower.startsWith('[document]') || lower.startsWith('[audio]') || lower.startsWith('[ptt]')) {
    kind = body.startsWith('[Áudio]') || lower.includes('audio') || lower.includes('ptt') ? 'audio' : 'document';
  } else if (lower.startsWith('[video]')) kind = 'video';

  const retentionMs = ATENDIMENTO_MEDIA_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const at = row.created_at ? new Date(row.created_at).getTime() : NaN;
  const mediaPurged = kind !== 'text' && Number.isFinite(at) && Date.now() - at > retentionMs;

  return {
    id: row.id,
    direction: 'out',
    body: deleted ? 'Esta mensagem foi apagada' : kind === 'text' ? body : body.replace(/^\[[^\]]+\]\s*/, '') || body,
    at: row.created_at,
    createdAt: row.created_at,
    senderName: 'Atendente',
    kind: deleted ? 'text' : kind,
    media: deleted ? null : null,
    mediaPurged: deleted ? false : mediaPurged,
    uazapiMessageId: resolveUazapiMessageId(row),
    uazapiInternalId: row.uazapi_internal_id || null,
    downloadMessageIds: resolveSentDownloadMessageIds(row),
    whatsappConfigId: row.whatsapp_config_id || null,
    ack: deleted ? null : mapAckStatusFromRow(row),
    quote: null,
    isForwarded: false,
    reactions: [],
    deleted,
  };
}

export function formatBubbleTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function formatDateSeparatorLabel(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const diffDays = Math.round((startOf(now) - startOf(d)) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return 'Hoje';
  if (diffDays === 1) return 'Ontem';
  return d.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

export function dayKey(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function groupSenderKey(msg) {
  return msg?.senderKey || msg?.senderJid || msg?.senderName || msg?.id || '';
}

function isSameIncomingGroupSender(a, b) {
  if (!a || !b) return false;
  if (!a.isGroup || a.direction !== 'in') return false;
  if (!b.isGroup || b.direction !== 'in') return false;
  if (dayKey(a.at) !== dayKey(b.at)) return false;
  return groupSenderKey(a) === groupSenderKey(b);
}

/** WhatsApp: nome, telefone e avatar só na primeira mensagem consecutiva do participante. */
export function applyGroupSenderAvatars(messages) {
  const list = messages || [];
  return list.map((msg, i) => {
    if (!msg.isGroup || msg.direction === 'out') {
      return {
        ...msg,
        showSenderHeader: false,
        showSenderAvatar: false,
        groupContinuesFromPrev: false,
        groupContinuesToNext: false,
      };
    }

    const prev = list[i - 1];
    const next = list[i + 1];
    const sameSenderPrev = isSameIncomingGroupSender(prev, msg);
    const sameSenderNext = isSameIncomingGroupSender(msg, next);
    const showSenderHeader = !sameSenderPrev;
    const showSenderAvatar = !sameSenderPrev;

    if (
      msg.showSenderHeader === showSenderHeader &&
      msg.showSenderAvatar === showSenderAvatar &&
      msg.groupContinuesFromPrev === sameSenderPrev &&
      msg.groupContinuesToNext === sameSenderNext
    ) {
      return msg;
    }

    return {
      ...msg,
      showSenderHeader,
      showSenderAvatar,
      groupContinuesFromPrev: sameSenderPrev,
      groupContinuesToNext: sameSenderNext,
    };
  });
}

export function enrichMessagesWithGroupAvatars(messages, inboxRows, avatarMap) {
  return enrichGroupThreadMessages(messages, inboxRows, avatarMap);
}

/** Insere itens { type: 'date', label, id } entre mensagens (preserva referência das mensagens). */
export function messagesWithDateSeparators(messages) {
  const out = [];
  let lastDay = null;
  for (const msg of messages || []) {
    const dk = dayKey(msg.at);
    if (dk && dk !== lastDay) {
      out.push({
        type: 'date',
        id: `date-${dk}`,
        label: formatDateSeparatorLabel(msg.at),
      });
      lastDay = dk;
    }
    out.push(msg);
  }
  return out;
}
