/**
 * Extrai o ID WhatsApp (stanza) a partir de payloads uazapi.
 * O campo `id` interno (ex.: r1a2b3c4) NÃO serve para react/reply/download.
 */

function isInternalUazapiId(id: string): boolean {
  const s = String(id || '').trim();
  if (!s) return true;
  if (/^r[0-9a-f]{7,}$/i.test(s)) return true;
  if (s.includes('@') && s.includes('_')) return true;
  return false;
}

function stanzaFromValue(value: unknown): string {
  const s = String(value ?? '').trim();
  if (!s || isInternalUazapiId(s)) return '';
  if (s.includes(':')) {
    const part = s.split(':').pop()?.trim() || '';
    return isInternalUazapiId(part) ? '' : part;
  }
  return s;
}

export function extractWhatsAppIdsFromRaw(raw: unknown): { stanza: string; full?: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const body = raw as Record<string, unknown>;
  const payload = (body.data && typeof body.data === 'object' ? body.data : body) as Record<string, unknown>;
  const key = (payload.key ?? body.key) as Record<string, unknown> | undefined;
  const msg = (payload.message ?? body.message) as Record<string, unknown> | undefined;
  const msgKey = msg?.key as Record<string, unknown> | undefined;

  const fullIdRaw = String(payload.id ?? body.id ?? '').trim();
  if (fullIdRaw.includes(':')) {
    const stanza = stanzaFromValue(fullIdRaw);
    if (stanza) return { stanza, full: fullIdRaw };
  }

  const ordered = [
    payload.messageid,
    payload.messageId,
    key?.id,
    msgKey?.id,
    payload.id,
    body.id,
  ];

  for (const candidate of ordered) {
    const stanza = stanzaFromValue(candidate);
    if (stanza) {
      const full = String(candidate ?? '').includes(':') ? String(candidate).trim() : undefined;
      return { stanza, full };
    }
  }

  return null;
}

export function extractWhatsAppMessageId(raw: unknown, fallback = ''): string {
  const fromRaw = extractWhatsAppIdsFromRaw(raw);
  if (fromRaw?.stanza) return fromRaw.stanza;
  const fb = stanzaFromValue(fallback);
  return fb;
}

export function pickStoredMessageId(
  payload: Record<string, unknown>,
  body: Record<string, unknown>,
  key: Record<string, unknown> | undefined,
  messageKey: Record<string, unknown> | undefined,
  chatJid: string,
): string {
  const fromRaw = extractWhatsAppIdsFromRaw({ ...body, data: payload });
  if (fromRaw?.stanza) return fromRaw.stanza;

  const ordered = [
    payload.messageid,
    payload.messageId,
    key?.id,
    messageKey?.id,
    payload.id,
    body.id,
  ];

  for (const candidate of ordered) {
    const stanza = stanzaFromValue(candidate);
    if (stanza) return stanza;
  }

  return `${chatJid}_${Date.now()}`;
}

export function pickSentMessageId(resData: Record<string, unknown>): string {
  const ordered = [resData.messageid, resData.messageId, resData.id, (resData.key as Record<string, unknown> | undefined)?.id];
  for (const candidate of ordered) {
    const stanza = stanzaFromValue(candidate);
    if (stanza) return stanza;
  }
  return `sent_${Date.now()}`;
}

export { isInternalUazapiId, stanzaFromValue };
