/**
 * Follow-up da IA da loja (Ápice): se o contato não responder, envia a mensagem configurada.
 * Espelha o bloco «Ativar fluxo se o contato não responder» da Umbler.
 * Puro, sem I/O. Testado em scripts/atendimentoIaFollowup.test.mjs.
 */
import { normalizeFunil, normalizeFollowup } from './atendimentoIaPrompt.js';

export function patchFollowupCancel() {
  return { ia_followup_passo: 0, ia_followup_due_at: null };
}

export function patchFollowupAgendar({ funil = null, passo = 0, nowMs = Date.now() } = {}) {
  const f = normalizeFollowup(normalizeFunil(funil).followup);
  const idx = Number.isInteger(passo) ? passo : 0;
  const item = f.passos[idx];
  if (!f.ativo || !item?.mensagem) return patchFollowupCancel();
  const horas = Number(item.horas) || 4;
  return {
    ia_followup_passo: idx,
    ia_followup_due_at: new Date(nowMs + horas * 3600000).toISOString(),
  };
}

export function decidirFollowupEnvio({
  clienteHabilitada = false,
  conversa = null,
  funil = null,
  nowMs = Date.now(),
} = {}) {
  if (!clienteHabilitada) return { ok: false, reason: 'nao_apice', mensagem: '', passo: 0 };
  if (String(conversa?.status || '') === 'finalizado') {
    return { ok: false, reason: 'finalizada', mensagem: '', passo: 0 };
  }
  if (conversa?.ia_pausada) return { ok: false, reason: 'humano', mensagem: '', passo: 0 };
  const f = normalizeFollowup(normalizeFunil(funil).followup);
  if (!f.ativo) return { ok: false, reason: 'desligado', mensagem: '', passo: 0 };
  const due = conversa?.ia_followup_due_at ? new Date(conversa.ia_followup_due_at).getTime() : 0;
  if (!due || !Number.isFinite(due) || due > nowMs) {
    return { ok: false, reason: 'ainda_nao', mensagem: '', passo: 0 };
  }
  const passo = Number(conversa?.ia_followup_passo) || 0;
  const item = f.passos[passo];
  if (!item?.mensagem) return { ok: false, reason: 'sem_passo', mensagem: '', passo };
  return { ok: true, reason: 'enviar', mensagem: item.mensagem, passo };
}

export function patchAposFollowupEnviado({
  funil = null,
  passoEnviado = 0,
  nowIso = new Date().toISOString(),
} = {}) {
  const nowMs = new Date(nowIso).getTime();
  const base = {
    status: 'entrada',
    status_at: nowIso,
    ia_pausada: false,
    ia_respondeu_em: nowIso,
  };
  return {
    ...base,
    ...patchFollowupAgendar({ funil, passo: (Number(passoEnviado) || 0) + 1, nowMs }),
  };
}
