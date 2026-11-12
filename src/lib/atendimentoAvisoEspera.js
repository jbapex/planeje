/** Aviso na tela quando o cliente fica sem resposta. Não envia WhatsApp. */

export const AVISO_ESPERA_PADRAO = {
  habilitado: true,
  primeiroMinutos: 10,
  repetirMinutos: 10,
};

function minutosValidos(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(240, Math.max(1, Math.round(n)));
}

export function normalizarAvisoEspera(row) {
  if (!row) return { ...AVISO_ESPERA_PADRAO };
  return {
    habilitado: row.habilitado !== false,
    primeiroMinutos: minutosValidos(row.primeiro_minutos, AVISO_ESPERA_PADRAO.primeiroMinutos),
    repetirMinutos: minutosValidos(row.repetir_minutos, AVISO_ESPERA_PADRAO.repetirMinutos),
  };
}

/**
 * 0 = primeiro aviso. 1, 2… = cada repetição.
 * Antes do primeiro minuto, não cobra.
 */
export function etapaAvisoEspera(elapsedMs, config) {
  if (!config?.habilitado) return null;
  const first = config.primeiroMinutos * 60000;
  const repeat = Math.max(1, config.repetirMinutos) * 60000;
  if (!Number.isFinite(elapsedMs) || elapsedMs < first) return null;
  return Math.floor((elapsedMs - first) / repeat);
}

export function avisoEsperaVisivelPara({ role, userId, assignedTo }) {
  if (role === 'superadmin' || role === 'admin') return true;
  if (role !== 'colaborador') return false;
  if (!assignedTo) return true;
  return assignedTo === userId;
}

/** Nome de grupo. Número solto não serve. */
export function nomeGrupoAviso(row) {
  const nome = String(row?.display_name || '').trim();
  if (!nome || /^\d+$/.test(nome)) return 'Grupo';
  return nome;
}

function nomeAproveitavel(row) {
  const nome = nomeGrupoAviso(row);
  return nome === 'Grupo' ? '' : nome;
}

/** Os grupos do aviso entram na Minha caixa sem repetir uma pendência que já está aberta. */
export function mesclarAvisosGrupoNaCaixa(itens = [], avisos = []) {
  const abertos = new Set(
    (itens || [])
      .filter((item) => item?.origem === 'conversa' && item.fila === 'cliente_sem_resposta' && !item.resolved_at)
      .map((item) => item.conversation_id)
      .filter(Boolean),
  );
  const extras = (avisos || [])
    .filter((aviso) => aviso?.id && !abertos.has(aviso.id))
    .map((aviso) => ({
      id: `aviso-grupo:${aviso.id}`,
      origem: 'conversa',
      fila: 'cliente_sem_resposta',
      aviso_grupo: true,
      conversation_id: aviso.id,
      conversation_name: aviso.nome || 'Grupo',
      chat_jid: aviso.chatJid || null,
      conversation_status: aviso.status || null,
      cliente_id: aviso.clienteId || null,
      is_group: true,
      last_message_preview: aviso.tempo ? `Há ${aviso.tempo} sem resposta` : 'Grupo sem resposta',
      empresa: aviso.responsavel || 'Grupo',
      estado: 'aberta',
      created_at: aviso.since || null,
      last_activity_at: aviso.since || null,
    }));
  return [...extras, ...(itens || [])];
}

/** Só grupos. O mesmo grupo em mais de um número fica com o relógio que começou antes e com o nome do grupo. */
export function dedupeAguardandoAviso(rows = []) {
  const byKey = new Map();
  rows.forEach((row) => {
    if (!row?.id || !row.awaiting_response_since || !row.is_group) return;
    const key = row.chat_jid ? `g:${row.chat_jid}` : `c:${row.id}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...row });
      return;
    }
    const prevAt = new Date(prev.awaiting_response_since).getTime();
    const nextAt = new Date(row.awaiting_response_since).getTime();
    const keep = Number.isFinite(nextAt) && nextAt < prevAt ? { ...row } : { ...prev };
    const nome = nomeAproveitavel(keep) || nomeAproveitavel(prev) || nomeAproveitavel(row);
    if (nome) keep.display_name = nome;
    byKey.set(key, keep);
  });
  return [...byKey.values()];
}
