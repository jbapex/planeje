/**
 * Cobertura mensal — lógica espelhada de src/lib/coberturaMensal.js para o MCP.
 */

export type StatusCobertura =
  | 'descoberto'
  | 'parcial'
  | 'coberto'
  | 'sem_escopo'
  | 'nao_aplicavel';

export type TipoServicoNorm =
  | 'execucao_completa'
  | 'social_apenas'
  | 'trafego_apenas'
  | 'indefinido';

type ClienteRow = {
  id: string;
  empresa?: string | null;
  valor?: number | string | null;
  tipo_servico?: string | null;
  tipo_contrato?: string | null;
  entregaveis?: Record<string, unknown> | null;
  responsavel?: string | null;
};

type TarefaRow = {
  id?: string;
  client_id?: string | null;
  project_id?: string | null;
  status?: string | null;
  due_date?: string | null;
  type?: string | null;
  description?: string | null;
  briefing_completo?: boolean | null;
  briefing_legado?: boolean | null;
  briefing_estado?: string | null;
};

type ProjetoRow = {
  id: string;
  client_id?: string | null;
  mes_referencia?: string | null;
  status?: string | null;
};

type ProfileRow = {
  id: string;
  full_name?: string | null;
  role?: string | null;
  status?: string | null;
};

export type CoberturaRow = {
  cliente_id: string;
  empresa: string | null | undefined;
  tier: string;
  valor: number | null;
  tipo_servico_norm: TipoServicoNorm;
  tem_plano_mes: boolean;
  responsavel_nome: string;
  responsavel_valido: boolean;
  contratado: number;
  planejado: number;
  planejado_no_plano: number;
  improviso: number;
  planejado_com_briefing: number;
  planejado_rascunho: number;
  entregue: number;
  atrasadas: number;
  sem_briefing: number;
  briefing_completude_pct: number | null;
  cobertura_pct: number | null;
  status_cobertura: StatusCobertura;
};

export type CoberturaAgregado = {
  mes_referencia: string;
  clientes_ativos: number;
  clientes_conteudo: number;
  contratado_total: number;
  planejado_total: number;
  planejado_com_briefing_total: number;
  planejado_rascunho_total: number;
  cobertura_geral: number | null;
  briefing_completude_pct: number | null;
  qtd_descoberto: number;
  qtd_parcial: number;
  qtd_coberto: number;
  qtd_sem_escopo: number;
  qtd_nao_aplicavel: number;
  qtd_sem_plano: number;
  atrasadas_total: number;
  sem_briefing_total: number;
  clientes_sem_responsavel: number;
  fee_sem_responsavel: number;
  gate_liberado: boolean;
};

export function monthBounds(mesDate: string | Date): {
  inicio: string;
  fim: string;
  mesRef: string;
} {
  const d = mesDate instanceof Date ? mesDate : new Date(`${String(mesDate).slice(0, 10)}T12:00:00`);
  const inicio = new Date(d.getFullYear(), d.getMonth(), 1);
  const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const toIso = (x: Date) => {
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, '0');
    const day = String(x.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  return { inicio: toIso(inicio), fim: toIso(fim), mesRef: toIso(inicio) };
}

function sumEntregaveis(entregaveis: Record<string, unknown> | null | undefined): number {
  const e = entregaveis && typeof entregaveis === 'object' ? entregaveis : {};
  return (
    Number(e.posts || 0) +
    Number(e.videos || 0) +
    Number(e.stories || 0) +
    Number(e.anuncios || 0) +
    Number(e.carrosseis || 0)
  );
}

function normalizeTipoServico(
  tipoServico: string | null | undefined,
  tipoContrato: string | null | undefined,
  contratado: number,
): TipoServicoNorm {
  const ts = String(tipoServico || '').trim().toLowerCase();
  if (['execucao_completa', 'execução_completa', 'execucao completa'].includes(ts)) return 'execucao_completa';
  if (ts.includes('social')) return 'social_apenas';
  if (/tr[aá]fego/.test(ts)) return 'trafego_apenas';
  const tc = String(tipoContrato || '').toLowerCase();
  if (/(ads|google|meta)/.test(tc) && contratado === 0) return 'trafego_apenas';
  return 'indefinido';
}

function tierFromValor(valor: number | string | null | undefined): string {
  if (valor == null || valor === '') return '—';
  const n = Number(valor);
  if (n >= 2000) return 'A';
  if (n >= 1500) return 'B';
  return 'C';
}

function statusCobertura(
  tipoNorm: TipoServicoNorm,
  contratado: number,
  coberturaPct: number,
): StatusCobertura {
  if (tipoNorm === 'trafego_apenas') return 'nao_aplicavel';
  if (!contratado) return 'sem_escopo';
  if (coberturaPct >= 1) return 'coberto';
  if (coberturaPct >= 0.6) return 'parcial';
  return 'descoberto';
}

export function computeCoberturaFromRows({
  clientes,
  tarefas,
  projetos,
  profiles,
  mesRef,
  exigirResponsavelAtivo = false,
}: {
  clientes: ClienteRow[] | null | undefined;
  tarefas: TarefaRow[] | null | undefined;
  projetos: ProjetoRow[] | null | undefined;
  profiles: ProfileRow[] | null | undefined;
  mesRef: string;
  exigirResponsavelAtivo?: boolean;
}): { rows: CoberturaRow[]; agregado: CoberturaAgregado } {
  const today = new Date().toISOString().slice(0, 10);
  const profilesById = new Map((profiles || []).map((p) => [p.id, p]));

  const planosByCliente = new Map<string, string>();
  for (const p of projetos || []) {
    if (!p?.client_id || !p?.mes_referencia) continue;
    if (String(p.mes_referencia).slice(0, 7) !== String(mesRef).slice(0, 7)) continue;
    if (!planosByCliente.has(p.client_id)) planosByCliente.set(p.client_id, p.id);
  }

  const isenta = (type: string | null | undefined) =>
    ['trafego_recorrente', 'paid_traffic', 'trafego', 'reuniao', 'reunião', 'financeiro', 'interno', 'administrativo', 'onboarding'].includes(
      String(type || '').toLowerCase(),
    );
  const contaPlanejada = (t: TarefaRow) =>
    Boolean(t.briefing_legado ?? true) || Boolean(t.briefing_completo) || isenta(t.type);

  type TaskBucket = {
    planejado: number;
    planejado_no_plano: number;
    planejado_com_briefing: number;
    planejado_rascunho: number;
    entregue: number;
    atrasadas: number;
    sem_briefing: number;
  };
  const tasksByCliente = new Map<string, TaskBucket>();
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
    const bucket = tasksByCliente.get(t.client_id)!;
    if (contaPlanejada(t)) {
      bucket.planejado += 1;
      const planoId = planosByCliente.get(t.client_id);
      if (t.project_id && planoId && t.project_id === planoId) bucket.planejado_no_plano += 1;
      if (t.briefing_completo) bucket.planejado_com_briefing += 1;
      if (t.status !== 'completed' && t.due_date && t.due_date < today) bucket.atrasadas += 1;
      const type = String(t.type || '').toLowerCase();
      if (
        ['arte', 'video', 'vídeo', 'carrossel', 'social_media', 'reels', 'story', 'stories', 'post'].includes(type) &&
        !t.briefing_completo &&
        !isenta(t.type)
      ) {
        bucket.sem_briefing += 1;
      }
    } else {
      bucket.planejado_rascunho += 1;
    }
    if (t.status === 'completed') bucket.entregue += 1;
  }

  const rows: CoberturaRow[] = (clientes || []).map((c) => {
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
    const profile = profilesById.get(c.responsavel || '') as ProfileRow | undefined;
    const responsavel_existe = Boolean(profile && profile.role !== 'cliente');
    const responsavel_ativo = Boolean(responsavel_existe && profile?.status === 'active');
    const responsavel_valido = exigirResponsavelAtivo ? responsavel_ativo : responsavel_existe;
    const cobertura_pct =
      tipoNorm === 'trafego_apenas' || contratado === 0
        ? null
        : Math.round((stats.planejado / contratado) * 100) / 100;
    const status = statusCobertura(tipoNorm, contratado, cobertura_pct ?? 0);
    let responsavel_nome = 'SEM RESPONSÁVEL VÁLIDO';
    if (responsavel_existe && responsavel_ativo) responsavel_nome = profile?.full_name || responsavel_nome;
    else if (responsavel_existe) responsavel_nome = `${profile?.full_name || '—'} (cadastro pendente)`;

    return {
      cliente_id: c.id,
      empresa: c.empresa,
      tier: tierFromValor(c.valor),
      valor: c.valor != null ? Number(c.valor) : null,
      tipo_servico_norm: tipoNorm,
      tem_plano_mes: Boolean(planosByCliente.get(c.id)),
      responsavel_nome,
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
      briefing_completude_pct:
        stats.planejado === 0
          ? null
          : Math.round((stats.planejado_com_briefing / stats.planejado) * 100) / 100,
      cobertura_pct,
      status_cobertura: status,
    };
  });

  const rankMap: Record<StatusCobertura, number> = {
    descoberto: 0,
    parcial: 1,
    coberto: 2,
    sem_escopo: 3,
    nao_aplicavel: 4,
  };

  rows.sort((a, b) => {
    const r = rankMap[a.status_cobertura] - rankMap[b.status_cobertura];
    if (r !== 0) return r;
    return (b.valor || 0) - (a.valor || 0);
  });

  const conteudo = rows.filter((r) => r.status_cobertura !== 'nao_aplicavel');
  const sum = (arr: CoberturaRow[], key: keyof CoberturaRow) =>
    arr.reduce((n, r) => n + (Number(r[key]) || 0), 0);
  const contratado = sum(conteudo, 'contratado');
  const planejado = sum(conteudo, 'planejado');
  const problemas = rows.filter(
    (r) =>
      r.status_cobertura === 'descoberto' ||
      r.status_cobertura === 'sem_escopo' ||
      (r.status_cobertura !== 'nao_aplicavel' && !r.tem_plano_mes),
  );

  const agregado: CoberturaAgregado = {
    mes_referencia: mesRef,
    clientes_ativos: rows.length,
    clientes_conteudo: conteudo.length,
    contratado_total: contratado,
    planejado_total: planejado,
    planejado_com_briefing_total: sum(conteudo, 'planejado_com_briefing'),
    planejado_rascunho_total: sum(conteudo, 'planejado_rascunho'),
    cobertura_geral: contratado === 0 ? null : Math.round((planejado / contratado) * 100) / 100,
    briefing_completude_pct:
      planejado === 0
        ? null
        : Math.round((sum(conteudo, 'planejado_com_briefing') / planejado) * 100) / 100,
    qtd_descoberto: rows.filter((r) => r.status_cobertura === 'descoberto').length,
    qtd_parcial: rows.filter((r) => r.status_cobertura === 'parcial').length,
    qtd_coberto: rows.filter((r) => r.status_cobertura === 'coberto').length,
    qtd_sem_escopo: rows.filter((r) => r.status_cobertura === 'sem_escopo').length,
    qtd_nao_aplicavel: rows.filter((r) => r.status_cobertura === 'nao_aplicavel').length,
    qtd_sem_plano: conteudo.filter((r) => !r.tem_plano_mes).length,
    atrasadas_total: sum(rows, 'atrasadas'),
    sem_briefing_total: sum(rows, 'sem_briefing'),
    clientes_sem_responsavel: rows.filter((r) => !r.responsavel_valido).length,
    fee_sem_responsavel: sum(
      rows.filter((r) => !r.responsavel_valido),
      'valor',
    ),
    gate_liberado: problemas.length === 0,
  };

  return { rows, agregado };
}
