/**
 * Decisão do "Responder sozinho" (IA automática da loja Ápice).
 * Pura: sem I/O. Testada em scripts/atendimentoIaAuto.test.mjs.
 * O webhook comum só chega aqui se a loja for a habilitada; outras lojas saem antes.
 */
import { escolherAgente, normalizeFunil } from './atendimentoIaPrompt.js';
import { patchFollowupAgendar, patchFollowupCancel } from './atendimentoIaFollowup.js';

export const IA_AUTO_COOLDOWN_MS = 12000;

export function decidirAutoResposta({
  clienteHabilitada = false,
  fromMe = false,
  isGroup = false,
  hasText = false,
  conversa = null,
  agentes = [],
  setorId = null,
  nowMs = Date.now(),
} = {}) {
  if (!clienteHabilitada) return { ok: false, reason: 'nao_apice', agente: null };
  if (fromMe) return { ok: false, reason: 'from_me', agente: null };
  if (isGroup) return { ok: false, reason: 'grupo', agente: null };
  if (!hasText) return { ok: false, reason: 'sem_texto', agente: null };
  if (String(conversa?.status || '') === 'finalizado') return { ok: false, reason: 'finalizada', agente: null };
  if (conversa?.ia_pausada) return { ok: false, reason: 'humano', agente: null };
  const lastIa = conversa?.ia_respondeu_em ? new Date(conversa.ia_respondeu_em).getTime() : 0;
  if (lastIa && Number.isFinite(lastIa) && nowMs - lastIa < IA_AUTO_COOLDOWN_MS) {
    return { ok: false, reason: 'anti_loop', agente: null };
  }
  const agente = escolherAgente(agentes, { setorId: setorId || conversa?.setor_id || null, soAutoResponder: true });
  if (!agente) return { ok: false, reason: 'desligado', agente: null };
  return { ok: true, reason: 'responder', agente };
}

/** Depois de enviar (ou só transferir): marca a conversa. Transfer para e não responde mais. */
export function patchAposRespostaIa({ action = null, funil = null, nowIso = new Date().toISOString() } = {}) {
  if (action === 'transfer') {
    const f = normalizeFunil(funil);
    const patch = {
      status: 'esperando',
      status_at: nowIso,
      ia_pausada: true,
      ia_respondeu_em: nowIso,
    };
    if (f.destino_tipo === 'setor' && f.destino_setor_id) patch.setor_id = f.destino_setor_id;
    return { ...patch, ...patchFollowupCancel() };
  }
  return {
    status: 'entrada',
    status_at: nowIso,
    ia_pausada: false,
    ia_respondeu_em: nowIso,
    ...patchFollowupAgendar({ funil, passo: 0, nowMs: new Date(nowIso).getTime() }),
  };
}
