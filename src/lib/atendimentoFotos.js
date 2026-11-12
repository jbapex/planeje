import { supabase } from '@/lib/customSupabaseClient';
import { storedPhotoIsStale } from '@/lib/atendimentoFotoUrl';

const cache = new Map();
let queue = [];
let timer = null;

function photoKey(item) {
  return `${item.whatsapp_config_id}|${item.jid}`;
}

function remember(item, url) {
  cache.set(photoKey(item), url || null);
}

async function sendBatch(items) {
  try {
    const { data, error } = await supabase.functions.invoke('uazapi-chat-photo', { body: { items } });
    if (error) throw error;
    items.forEach((item) => remember(item, null));
    (data?.photos || []).forEach((photo) => {
      if (!photo?.jid) return;
      cache.set(`${photo.whatsapp_config_id}|${photo.jid}`, photo.url || null);
    });
  } catch {
    items.forEach((item) => remember(item, null));
  }
}

async function flush() {
  const jobs = queue.splice(0, queue.length);
  const pending = [];
  const seen = new Set();
  jobs.forEach((job) => {
    job.items.forEach((item) => {
      const key = photoKey(item);
      if (cache.has(key) || seen.has(key)) return;
      seen.add(key);
      pending.push(item);
    });
  });

  for (let i = 0; i < pending.length; i += 12) {
    await sendBatch(pending.slice(i, i + 12));
  }

  jobs.forEach((job) => job.resolve());
  if (queue.length) {
    clearTimeout(timer);
    timer = setTimeout(flush, 80);
  }
}

function enqueue(items) {
  return new Promise((resolve) => {
    queue.push({ items, resolve });
    clearTimeout(timer);
    timer = setTimeout(flush, 80);
  });
}

/** Pede a cópia nova das fotos que ainda estão vazias ou no link expirado do WhatsApp. */
export function refreshAtendimentoPhotos(items) {
  const wanted = (items || [])
    .filter((item) => item?.jid && item?.whatsapp_config_id)
    .slice(0, 24);
  if (!wanted.length) return Promise.resolve([]);
  const missing = wanted.filter((item) => !cache.has(photoKey(item)));
  const done = () => wanted.map((item) => ({
    jid: item.jid,
    whatsapp_config_id: item.whatsapp_config_id,
    url: cache.get(photoKey(item)) || null,
  }));
  if (!missing.length) return Promise.resolve(done());
  return enqueue(missing).then(done);
}

export function photoTargetsFromThread(conversation, messages) {
  if (!conversation?.whatsapp_config_id) return [];
  const configId = conversation.whatsapp_config_id;
  const items = [];
  const seen = new Set();
  const push = (jid) => {
    const value = String(jid || '').trim();
    if (!value || !value.includes('@') || seen.has(value)) return;
    seen.add(value);
    items.push({ jid: value, whatsapp_config_id: configId });
  };

  if (storedPhotoIsStale(conversation.profile_pic_url)) push(conversation.chat_jid);

  (messages || []).forEach((msg) => {
    if (!msg?.isGroup || msg.direction === 'out') return;
    if (msg.senderAvatarUrl && !storedPhotoIsStale(msg.senderAvatarUrl)) return;
    if (msg.senderPhoneDigits) push(`${msg.senderPhoneDigits}@s.whatsapp.net`);
    else push(msg.senderJid);
  });

  return items.slice(0, 12);
}

export function applyThreadPhotos(messages, photos) {
  const urls = new Map((photos || []).filter((photo) => photo?.url).map((photo) => [photo.jid, photo.url]));
  if (!urls.size) return messages;
  let changed = false;
  const next = (messages || []).map((msg) => {
    if (!msg?.isGroup || msg.direction === 'out') return msg;
    if (msg.senderAvatarUrl && !storedPhotoIsStale(msg.senderAvatarUrl)) return msg;
    const url = urls.get(msg.senderJid)
      || (msg.senderPhoneDigits ? urls.get(`${msg.senderPhoneDigits}@s.whatsapp.net`) : null);
    if (!url) return msg;
    changed = true;
    return { ...msg, senderAvatarUrl: url };
  });
  return changed ? next : messages;
}

export { storedPhotoIsStale };
