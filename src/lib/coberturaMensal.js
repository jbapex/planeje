/**
 * Cobertura Mensal — lógica alinhada à migration resumo_cobertura_mensal.
 * Usada no frontend e como fallback se a RPC ainda não existir no Supabase.
 */

import { countsAsPlanejado, isBriefingExempt } from './briefingObrigatorio.js';

export function monthBounds(mesDate) {
  const d = mesDate instanceof Date ? mesDate : new Date(`${mesDate}T12:00:00`);
  const inicio = new Date(d.getFullYear(), d.getMonth(), 1);
  const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const toIso = (x) => {
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, '0');
    const day = String(x.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  return {
    inicio: toIso(inicio),
    fim: toIso(fim),
    mesRef: toIso(inicio),
    label: inicio.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
  };
}

export function normalizeTipoServico(tipoServico, tipoContrato, contratado) {
  const ts = String(tipoServico || '').trim().toLowerCase();
  if (['execucao_completa', 'execução_completa', 'execucao completa'].includes(ts)) {
    return 'execucao_completa';
  }
  if (ts.includes('social')) return 'social_apenas';
  if (/tr[aá]fego/.test(ts)) return 'trafego_apenas';
  const tc = String(tipoContrato || '').toLowerCase();
  if (/(ads|google|meta)/.test(tc) && contratado === 0) return 'trafego_apenas';
  return 'indefinido';
}

export function sumEntregaveis(entregaveis) {
  const e = entregaveis && typeof entregaveis === 'object' ? entregaveis : {};
  return (
    Number(e.posts || 0) +
    Number(e.videos || 0) +
    Number(e.stories || 0) +
    Number(e.anuncios || 0) +
    Number(e.carrosseis || 0)
  );
}

export function tierFromValor(valor) {
  if (valor == null || valor === '') return '—';
  const n = Number(valor);
  if (n >= 2000) return 'A';
  if (n >= 1500) return 'B';
  return 'C';
}

export function statusCobertura(tipoNorm, contratado, coberturaPct) {
  if (tipoNorm === 'trafego_apenas') return 'nao_aplicavel';
  if (!contratado) return 'sem_escopo';
  if (coberturaPct >= 1) return 'coberto';
  if (coberturaPct >= 0.6) return 'parcial';
  return 'descoberto';
}

export function statusMeta(status) {
  return (
    {
      coberto: { label: 'Coberto', emoji: '🟢', tone: 'ok' },
      acima: { label: 'Acima do escopo', emoji: '🟣', tone: 'info' },
      parcial: { label: 'Parcial', emoji: '🟡', tone: 'warn' },
      descoberto: { label: 'Descoberto', emoji: '🔴', tone: 'danger' },
      sem_escopo: { label: 'Sem escopo', emoji: '⚪', tone: 'muted' },
      nao_aplicavel: { label: 'Tráfego apenas', emoji: '➖', tone: 'muted' },
    }[status] || { label: status, emoji: '?', tone: 'muted' }
  );
}

export const OPERATIONAL_COVERAGE_TYPES = [
  ['posts', 'Posts'],
  ['carrosseis', 'Carrosséis'],
  ['videos', 'Vídeos'],
  ['stories', 'Stories'],
  ['anuncios', 'Anúncios'],
];

export function normalizeOperationalCoverageRow(row) {
  const contratado = Number(row?.contratado) || 0;
  const planejado = Number(row?.planejado) || 0;
  const entregue = Number(row?.entregue) || 0;
  return {
    ...row,
    contratado,
    planejado,
    planejado_no_plano: Number(row?.planejado_no_plano) || 0,
    improviso: Number(row?.improviso) || 0,
    aguardando_tarefa: Number(row?.aguardando_tarefa) || 0,
    em_execucao: Number.isFinite(Number(row?.em_execucao))
      ? Math.max(Number(row.em_execucao), 0)
      : Math.max(planejado - entregue, 0),
    entregue,
    atrasadas: Number(row?.atrasadas) || 0,
    publicacoes_total: Number(row?.publicacoes_total) || 0,
    publicacoes_publicadas: Number(row?.publicacoes_publicadas) || 0,
    falta_planejar: Number.isFinite(Number(row?.falta_planejar))
      ? Math.max(Number(row.falta_planejar), 0)
      : Math.max(contratado - planejado, 0),
    por_tipo: row?.por_tipo && typeof row.por_tipo === 'object' ? row.por_tipo : {},
  };
}

export function aggregateOperationalCoverage(rows, mesRef) {
  const normalized = (rows || []).map(normalizeOperationalCoverageRow);
  const content = normalized.filter((row) => row.status_cobertura !== 'nao_aplicavel');
  const sum = (key) => content.reduce((total, row) => total + (Number(row[key]) || 0), 0);
  const contratado = sum('contratado');
  const planejado = sum('planejado');
  const gateProblems = content.filter((row) => (
    ['descoberto', 'sem_escopo'].includes(row.status_cobertura) || !row.tem_plano_mes
  ));
  return {
    mes_referencia: mesRef,
    clientes_ativos: normalized.length,
    clientes_conteudo: content.length,
    contratado_total: contratado,
    planejado_total: planejado,
    planejado_no_plano_total: sum('planejado_no_plano'),
    improviso_total: sum('improviso'),
    aguardando_tarefa_total: sum('aguardando_tarefa'),
    em_execucao_total: sum('em_execucao'),
    entregue_total: sum('entregue'),
    falta_planejar_total: sum('falta_planejar'),
    atrasadas_total: sum('atrasadas'),
    publicacoes_total: sum('publicacoes_total'),
    publicacoes_publicadas: sum('publicacoes_publicadas'),
    cobertura_geral: contratado === 0 ? null : Math.round((planejado / contratado) * 100) / 100,
    qtd_descoberto: content.filter((row) => row.status_cobertura === 'descoberto').length,
    qtd_parcial: content.filter((row) => row.status_cobertura === 'parcial').length,
    qtd_coberto: content.filter((row) => row.status_cobertura === 'coberto').length,
    qtd_acima: content.filter((row) => row.status_cobertura === 'acima').length,
    qtd_sem_escopo: content.filter((row) => row.status_cobertura === 'sem_escopo').length,
    qtd_nao_aplicavel: normalized.filter((row) => row.status_cobertura === 'nao_aplicavel').length,
    qtd_sem_plano: content.filter((row) => !row.tem_plano_mes).length,
    gate_liberado: gateProblems.length === 0,
  };
}

/**
 * @param {object} opts
 * @param {Array} opts.clientes — etapa closed
 * @param {Array} opts.tarefas — due_date no mês
 * @param {Array} opts.projetos — com mes_referencia
 * @param {Map|object} opts.profilesById — id → { full_name, role, status }
 * @param {boolean} [opts.exigirResponsavelAtivo=false]
 * @param {string} opts.mesRef — YYYY-MM-01
 * @param {string} [opts.hoje] — YYYY-MM-DD
 */
export function computeCoberturaMensal({
  clientes,
  tarefas,
  projetos,
  profilesById,
  exigirResponsavelAtivo = false,
  mesRef,
  hoje,
}) {
  const today = hoje || new Date().toISOString().slice(0, 10);
  const getProfile = (id) => {
    if (!id) return null;
    if (profilesById instanceof Map) return profilesById.get(id) || null;
    return profilesById?.[id] || null;
  };

  const planosByCliente = new Map();
  for (const p of projetos || []) {
    if (!p?.client_id || !p?.mes_referencia) continue;
    const mes = String(p.mes_referencia).slice(0, 7);
    if (mes !== String(mesRef).slice(0, 7)) continue;
    if (!planosByCliente.has(p.client_id)) planosByCliente.set(p.client_id, p.id);
  }

  const tasksByCliente = new Map();
  for (const t of tarefas || []) {
    if (!t?.client_id) continue;
    if (!tasksByCliente.has(t.client_id)) {
      tasksByCliente.set(t.client_id, {
        planejado: 0,
        planejado_no_plano: 0,
        planejado_com_briefing: 0,
        planejado_rascunho: 0,
        entregue: 0,
        atrasadas: 0,
        sem_briefing: 0,
      });
    }
    const bucket = tasksByCliente.get(t.client_id);
    const planejada = countsAsPlanejado({
      briefing_completo: t.briefing_completo,
      briefing_legado: t.briefing_legado ?? true, // sem coluna = legado (pré-migration)
      briefing_estado: t.briefing_estado,
      type: t.type,
      description: t.description,
    });

    if (planejada) {
      bucket.planejado += 1;
      const planoId = planosByCliente.get(t.client_id);
      if (t.project_id && planoId && t.project_id === planoId) {
        bucket.planejado_no_plano += 1;
      }
      if (t.briefing_completo) bucket.planejado_com_briefing += 1;
      if (t.status !== 'completed' && t.due_date && t.due_date < today) bucket.atrasadas += 1;

      const type = String(t.type || '').toLowerCase();
      const contentTypes = ['arte', 'video', 'vídeo', 'carrossel', 'social_media', 'reels', 'story', 'stories', 'post'];
      if (
        contentTypes.includes(type) &&
        !t.briefing_completo &&
        !isBriefingExempt(t.type)
      ) {
        bucket.sem_briefing += 1;
      }
    } else {
      bucket.planejado_rascunho += 1;
    }
    if (t.status === 'completed') bucket.entregue += 1;
  }

  const rows = (clientes || []).map((c) => {
    const contratado = sumEntregaveis(c.entregaveis);
    const tipoNorm = normalizeTipoServico(c.tipo_servico, c.tipo_contrato, contratado);
    const stats = tasksByCliente.get(c.id) || {
      planejado: 0,
      planejado_no_plano: 0,
      planejado_com_briefing: 0,
      planejado_rascunho: 0,
      entregue: 0,
      atrasadas: 0,
      sem_briefing: 0,
    };
    const planoId = planosByCliente.get(c.id) || null;
    const profile = getProfile(c.responsavel);
    const responsavel_existe = Boolean(profile && profile.role !== 'cliente');
    const responsavel_ativo = Boolean(responsavel_existe && profile.status === 'active');
    const responsavel_valido = exigirResponsavelAtivo ? responsavel_ativo : responsavel_existe;
    const cobertura_pct =
      tipoNorm === 'trafego_apenas' || contratado === 0
        ? null
        : Math.round((stats.planejado / contratado) * 100) / 100;
    const status = statusCobertura(tipoNorm, contratado, cobertura_pct ?? 0);
    const briefing_completude_pct =
      stats.planejado === 0
        ? null
        : Math.round((stats.planejado_com_briefing / stats.planejado) * 100) / 100;

    let responsavel_nome = 'SEM RESPONSÁVEL VÁLIDO';
    if (responsavel_existe && responsavel_ativo) responsavel_nome = profile.full_name || responsavel_nome;
    else if (responsavel_existe) responsavel_nome = `${profile.full_name || '—'} (cadastro pendente)`;

    return {
      cliente_id: c.id,
      empresa: c.empresa,
      tier: tierFromValor(c.valor),
      valor: c.valor != null ? Number(c.valor) : null,
      tipo_servico_norm: tipoNorm,
      plano_id: planoId,
      tem_plano_mes: Boolean(planoId),
      responsavel_id: c.responsavel || null,
      responsavel_nome,
      responsavel_existe,
      responsavel_ativo,
      responsavel_valido,
      contratado,
      planejado: stats.planejado,
      planejado_no_plano: stats.planejado_no_plano,
      improviso: Math.max(stats.planejado - stats.planejado_no_plano, 0),
      planejado_com_briefing: stats.planejado_com_briefing,
      planejado_rascunho: stats.planejado_rascunho,
      entregue: stats.entregue,
      atrasadas: stats.atrasadas,
      sem_briefing: stats.sem_briefing,
      briefing_completude_pct,
      cobertura_pct,
      status_cobertura: status,
    };
  });

  rows.sort((a, b) => {
    const rank = (s) =>
      ({ descoberto: 0, parcial: 1, coberto: 2, sem_escopo: 3, nao_aplicavel: 4 }[s] ?? 5);
    const r = rank(a.status_cobertura) - rank(b.status_cobertura);
    if (r !== 0) return r;
    return (b.valor || 0) - (a.valor || 0);
  });

  return rows;
}

export function aggregateCobertura(rows, mesRef) {
  const conteudo = (rows || []).filter((r) => r.status_cobertura !== 'nao_aplicavel');
  const sum = (arr, key) => arr.reduce((n, r) => n + (Number(r[key]) || 0), 0);
  const contratado = sum(conteudo, 'contratado');
  const planejado = sum(conteudo, 'planejado');
  const problemas = (rows || []).filter(
    (r) =>
      r.status_cobertura === 'descoberto' ||
      r.status_cobertura === 'sem_escopo' ||
      (r.status_cobertura !== 'nao_aplicavel' && !r.tem_plano_mes),
  );

  return {
    mes_referencia: mesRef,
    clientes_ativos: (rows || []).length,
    clientes_conteudo: conteudo.length,
    contratado_total: contratado,
    planejado_total: planejado,
    planejado_no_plano_total: sum(conteudo, 'planejado_no_plano'),
    improviso_total: sum(conteudo, 'improviso'),
    planejado_com_briefing_total: sum(conteudo, 'planejado_com_briefing'),
    planejado_rascunho_total: sum(conteudo, 'planejado_rascunho'),
    entregue_total: sum(conteudo, 'entregue'),
    cobertura_geral: contratado === 0 ? null : Math.round((planejado / contratado) * 100) / 100,
    briefing_completude_pct:
      planejado === 0
        ? null
        : Math.round((sum(conteudo, 'planejado_com_briefing') / planejado) * 100) / 100,
    qtd_descoberto: (rows || []).filter((r) => r.status_cobertura === 'descoberto').length,
    qtd_parcial: (rows || []).filter((r) => r.status_cobertura === 'parcial').length,
    qtd_coberto: (rows || []).filter((r) => r.status_cobertura === 'coberto').length,
    qtd_sem_escopo: (rows || []).filter((r) => r.status_cobertura === 'sem_escopo').length,
    qtd_nao_aplicavel: (rows || []).filter((r) => r.status_cobertura === 'nao_aplicavel').length,
    qtd_sem_plano: conteudo.filter((r) => !r.tem_plano_mes).length,
    atrasadas_total: sum(rows || [], 'atrasadas'),
    sem_briefing_total: sum(rows || [], 'sem_briefing'),
    clientes_sem_responsavel: (rows || []).filter((r) => !r.responsavel_valido).length,
    fee_sem_responsavel: sum(
      (rows || []).filter((r) => !r.responsavel_valido),
      'valor',
    ),
    gate_liberado: problemas.length === 0,
  };
}

/** Dias até o dia 25 do mês de referência (ou dias após, negativo). */
export function diasAteFechamentoPlano(mesRef, hoje = new Date()) {
  const d = typeof mesRef === 'string' ? new Date(`${mesRef}T12:00:00`) : mesRef;
  const deadline = new Date(d.getFullYear(), d.getMonth(), 25);
  const today = startOfDayLocal(hoje);
  const dl = startOfDayLocal(deadline);
  return Math.round((dl - today) / 86400000);
}

function startOfDayLocal(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function shouldShowGateBanner(mesRef, gateLiberado, hoje = new Date()) {
  if (gateLiberado) return null;
  const day = hoje.getDate();
  const currentMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  const nextMesDate = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
  const nextMes = `${nextMesDate.getFullYear()}-${String(nextMesDate.getMonth() + 1).padStart(2, '0')}`;
  const viewing = String(mesRef).slice(0, 7);

  // Banner importa para o mês seguinte a partir do dia 20
  if (viewing === nextMes && day >= 20) {
    return day >= 26 ? 'critical' : 'warning';
  }
  // Se estiver vendo o mês atual depois do dia 25 e gate fechado — aviso suave
  if (viewing === currentMes && day >= 26) return 'critical';
  return null;
}
