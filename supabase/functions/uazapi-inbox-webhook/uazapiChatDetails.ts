/**
 * Detalhes de contato/chat na uazapi (foto de perfil, nome).
 */

const PROFILE_PIC_KEYS = [
  'imagePreview',
  'image',
  'pictureUrl',
  'profilePictureUrl',
  'profilePicUrl',
  'avatar',
  'URL',
] as const;

export function pickStr(obj: Record<string, unknown> | null | undefined, ...keys: string[]): string {
  if (!obj || typeof obj !== 'object') return '';
  for (const k of keys) {
    const v = obj[k];
    if (v != null && typeof v === 'string' && v.trim()) return v.trim();
    if (v != null && typeof v === 'number') return String(v);
    if (v != null && typeof v === 'object' && !Array.isArray(v)) {
      const urlVal = (v as Record<string, unknown>)['URL'] ?? (v as Record<string, unknown>)['url'];
      if (urlVal != null && typeof urlVal === 'string' && urlVal.trim()) return urlVal.trim();
    }
  }
  return '';
}

export function pickProfilePicFromChatDetails(data: Record<string, unknown> | null | undefined): string {
  if (!data) return '';
  const pic = pickStr(data, ...PROFILE_PIC_KEYS);
  if (!pic || (!pic.startsWith('http://') && !pic.startsWith('https://') && !pic.startsWith('data:'))) {
    return '';
  }
  return pic;
}

export function pickDisplayNameFromChatDetails(data: Record<string, unknown> | null | undefined): string {
  if (!data) return '';
  return pickStr(
    data,
    'wa_contactName',
    'wa_name',
    'lead_fullName',
    'lead_name',
    'name',
    'pushName',
    'notifyName',
  );
}

export function digitsOnly(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

export function phoneFromChatDetails(data: Record<string, unknown> | null | undefined): string {
  if (!data) return '';
  const fromPhone = digitsOnly(pickStr(data, 'phone'));
  if (fromPhone.length >= 10 && fromPhone.length <= 13) return fromPhone;
  const chatId = pickStr(data, 'wa_chatid', 'chatid');
  if (chatId && !chatId.includes('@g.us') && !/@lid$/i.test(chatId)) {
    const d = digitsOnly(chatId.replace(/@.*$/, ''));
    if (d.length >= 10 && d.length <= 13) return d;
  }
  return '';
}

export async function fetchUazapiChatDetails(
  baseUrl: string,
  token: string,
  number: string,
  preview = true,
): Promise<Record<string, unknown> | null> {
  const num = String(number || '').trim();
  if (!num) return null;

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/details`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        token: token.trim(),
      },
      body: JSON.stringify({ number: num, preview }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return null;
    return data;
  } catch {
    return null;
  }
}

export type UazapiContactSyncInput = {
  clienteId: string;
  whatsappConfigId: string;
  jids: string[];
  phone?: string | null;
  displayName?: string | null;
  profilePicUrl?: string | null;
};

/** Grava/atualiza contato(s) com foto e nome vindos do chat/details. */
export async function upsertWhatsappContacts(
  supabase: ReturnType<typeof import('https://esm.sh/@supabase/supabase-js@2').createClient>,
  input: UazapiContactSyncInput,
) {
  const now = new Date().toISOString();
  const jids = [...new Set(input.jids.filter(Boolean))];
  if (!jids.length && !input.phone) return;

  const name = input.displayName?.trim() || input.phone || null;
  const pic = input.profilePicUrl?.trim() || null;

  const rows = [];
  for (const jid of jids) {
    rows.push({
      cliente_id: input.clienteId,
      from_jid: jid,
      phone: input.phone || null,
      sender_name: name,
      profile_pic_url: pic,
      whatsapp_config_id: input.whatsappConfigId,
      last_message_at: now,
      updated_at: now,
    });
  }
  if (input.phone) {
    const phoneJid = `${input.phone}@s.whatsapp.net`;
    if (!jids.includes(phoneJid)) {
      rows.push({
        cliente_id: input.clienteId,
        from_jid: phoneJid,
        phone: input.phone,
        sender_name: name,
        profile_pic_url: pic,
        whatsapp_config_id: input.whatsappConfigId,
        last_message_at: now,
        updated_at: now,
      });
    }
  }

  for (const row of rows) {
    await supabase.from('cliente_whatsapp_contact').upsert(row, {
      onConflict: 'cliente_id,from_jid',
      ignoreDuplicates: false,
    });
  }
}

export async function syncContactProfileFromChatDetails(
  supabase: ReturnType<typeof import('https://esm.sh/@supabase/supabase-js@2').createClient>,
  baseUrl: string,
  token: string,
  input: {
    clienteId: string;
    whatsappConfigId: string;
    number: string;
    jids?: string[];
    fallbackName?: string | null;
  },
): Promise<{ profilePicUrl: string | null; displayName: string | null; phone: string | null }> {
  const details = await fetchUazapiChatDetails(baseUrl, token, input.number, true);
  const profilePicUrl = pickProfilePicFromChatDetails(details) || null;
  const displayName = pickDisplayNameFromChatDetails(details) || input.fallbackName || null;
  const phone = phoneFromChatDetails(details) || digitsOnly(input.number).slice(0, 13) || null;

  const jids = [...new Set([
    ...(input.jids || []),
    pickStr(details || {}, 'wa_chatid', 'chatid'),
    input.number.includes('@') ? input.number : '',
  ].filter(Boolean))];

  if (jids.length || phone) {
    await upsertWhatsappContacts(supabase, {
      clienteId: input.clienteId,
      whatsappConfigId: input.whatsappConfigId,
      jids,
      phone,
      displayName,
      profilePicUrl,
    });
  }

  return { profilePicUrl, displayName, phone };
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
