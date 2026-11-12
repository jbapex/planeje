/**
 * Inbox da loja (Ápice): JID do contato 1:1 e patch da ficha em cliente_atend_conversas.
 * Independente da IA — a lista Conversas precisa da ficha/contato mesmo se o automático pular.
 */

import { patchFollowupCancel } from './atendimentoIaFollowup.js';

export function jidParaContatoLoja({ isGroup = false, chatJid = '', fromJid = '' } = {}) {
  if (isGroup) return null;
  const jid = String(chatJid || fromJid || '').trim();
  if (!jid || jid === 'unknown') return null;
  return jid;
}

/** Eco do envio da própria IA no webhook (fromMe). Não pausa o automático. */
export const JANELA_ECO_IA_MS = 120000;

export function isEcoDaIa({ fromMe = false, existing = null, nowIso = new Date().toISOString(), janelaMs = JANELA_ECO_IA_MS } = {}) {
  if (!fromMe || !existing?.ia_respondeu_em) return false;
  const last = new Date(existing.ia_respondeu_em).getTime();
  const now = new Date(nowIso).getTime();
  return Number.isFinite(last) && Number.isFinite(now) && now - last >= 0 && now - last < janelaMs;
}

/**
 * Estado da conversa da loja ao gravar uma mensagem.
 * Entrada = loja falou por último; Esperando = contato falou (ou reabriu finalizada).
 * Equipe falando (Planeje ou WhatsApp da loja) marca ia_pausada.
 * O eco fromMe da própria IA não pausa — senão o automático só responde a primeira mensagem.
 * Não desfaz ia_pausada na entrada do contato.
 */
export function patchLojaConversaOnMessage({
  fromMe = false,
  existing = null,
  nowIso = new Date().toISOString(),
} = {}) {
  const eco = isEcoDaIa({ fromMe, existing, nowIso });
  const cancelarFollowup = patchFollowupCancel();
  if (!existing) {
    return {
      status: fromMe ? 'entrada' : 'esperando',
      status_at: nowIso,
      ia_pausada: Boolean(fromMe) && !eco,
      ...cancelarFollowup,
    };
  }
  if (fromMe) {
    if (existing.status === 'finalizado') return eco ? {} : { ia_pausada: true, ...cancelarFollowup };
    if (eco) return { status: 'entrada', status_at: nowIso };
    return { status: 'entrada', status_at: nowIso, ia_pausada: true, ...cancelarFollowup };
  }
  if (existing.status === 'finalizado') {
    return { status: 'esperando', status_at: nowIso, ...cancelarFollowup };
  }
  return { status: 'esperando', status_at: nowIso, ...cancelarFollowup };
}
