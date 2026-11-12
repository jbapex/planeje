/**
 * Leitura da ficha do cliente e das páginas operacionais (projetos, tarefas,
 * Mini CRM, reuniões, onboarding, cobertura, indicadores). Sem tokens.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { computeCoberturaFromRows, monthBounds } from './coberturaMensal.js';
import { denyModule, reportsAccess, type ModuleAccess } from './access.js';

const CLIENTE_SAFE =
  'id, empresa, nome_contato, email, telefone, instagram, nicho, etapa, tipo_contrato, tipo_servico, postagem_do_cliente, valor, vencimento, responsavel, owner_id, publico_alvo, tom_de_voz, sobre_empresa, entregaveis, etiquetas, painel_cor, logo_urls, objetivo_meta, meta_custo_mensagem, meta_custo_compra, roas_alvo, limite_meta, cidade, estado, mini_crm_show_untracked, created_at, updated_at';

const CLIENTE_MIN =
  'id, empresa, etapa, nicho, instagram, tipo_contrato, tipo_servico, valor, responsavel, etiquetas, entregaveis';

const PROJETO_COLS = 'id, name, status, client_id, mes_referencia, created_at, updated_at';
const PROJETO_MIN = 'id, name, status, client_id';

const TAREFA_COLS =
  'id, title, status, client_id, project_id, due_date, post_date, type, priority, assignee_ids, briefing_estado, briefing_completo, created_at, updated_at';
const TAREFA_MIN = 'id, title, status, client_id, project_id, due_date, type, assignee_ids, created_at';

const SOLICITACAO_COLS = 'id, client_id, title, description, status, priority, origem, created_at';
const SOLICITACAO_MIN = 'id, client_id, title, status, created_at';

function todayYmd(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function mesAtual(ym?: string): string {
  const stamp = ym && /^\d{4}-\d{2}$/.test(ym.trim()) ? ym.trim() : todayYmd().slice(0, 7);
  return stamp;
}

async function maybe<T>(
  promise: PromiseLike<{ data: T | null; error: { message: string } | null }>
): Promise<{ data: T | null; erro: string | null }> {
  const { data, error } = await promise;
  return { data: data ?? null, erro: error?.message ?? null };
}

async function loadEmpresas(
  supabase: SupabaseClient,
  ids: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return map;
  const { data } = await supabase.from('clientes').select('id,empresa').in('id', uniq);
  for (const row of data ?? []) {
    const rec = row as { id?: string; empresa?: string | null };
    if (rec.id) map.set(rec.id, rec.empresa ?? '');
  }
  return map;
}

export async function loadClienteCadastro(supabase: SupabaseClient, clienteId: string) {
  const full = await maybe(
    supabase.from('clientes').select(CLIENTE_SAFE).eq('id', clienteId).maybeSingle()
  );
  if (!full.erro && full.data) return { cliente: full.data, aviso: null };
  const min = await maybe(
    supabase.from('clientes').select(CLIENTE_MIN).eq('id', clienteId).maybeSingle()
  );
  if (min.erro) throw new Error(min.erro);
  if (!min.data) throw new Error('Cliente não encontrado.');
  return { cliente: min.data, aviso: full.erro };
}

export async function loadProjetos(
  supabase: SupabaseClient,
  opts: { cliente_id?: string; mes?: string; limite?: number; status?: string }
) {
  const n = opts.limite ?? 80;
  const full = await maybe(
    (() => {
      let q = supabase.from('projetos').select(PROJETO_COLS).order('created_at', { ascending: false }).limit(n);
      if (opts.cliente_id) q = q.eq('client_id', opts.cliente_id);
      if (opts.status) q = q.eq('status', opts.status);
      if (opts.mes && /^\d{4}-\d{2}$/.test(opts.mes)) {
        const bounds = monthBounds(`${opts.mes}-01`);
        q = q.gte('mes_referencia', bounds.inicio).lte('mes_referencia', bounds.fim);
      }
      return q;
    })()
  );
  const min = full.erro
    ? await maybe(
        (() => {
          let q = supabase.from('projetos').select(PROJETO_MIN).order('created_at', { ascending: false }).limit(n);
          if (opts.cliente_id) q = q.eq('client_id', opts.cliente_id);
          if (opts.status) q = q.eq('status', opts.status);
          return q;
        })()
      )
    : full;
  if (min.erro) throw new Error(min.erro);
  const rows = min.data ?? [];
  const empresas = await loadEmpresas(
    supabase,
    rows.map((r) => String(r.client_id || ''))
  );
  return {
    total: rows.length,
    projetos: rows.map((r) => ({
      ...r,
      empresa: r.client_id ? empresas.get(String(r.client_id)) ?? null : null,
    })),
  };
}

export async function loadTarefasPagina(
  supabase: SupabaseClient,
  opts: {
    cliente_id?: string;
    status?: string;
    atrasadas?: boolean;
    concluidas?: boolean;
    limite?: number;
    busca?: string;
  }
) {
  const n = opts.limite ?? 80;
  const today = todayYmd();
  const runTarefas = async (full: boolean) => {
    let q = (full
      ? supabase.from('tarefas').select(TAREFA_COLS)
      : supabase.from('tarefas').select(TAREFA_MIN)
    ).order('due_date', { ascending: true }).limit(n);
    if (opts.cliente_id) q = q.eq('client_id', opts.cliente_id);
    if (opts.concluidas) q = q.eq('status', 'completed');
    else if (opts.status) q = q.eq('status', opts.status);
    else q = q.neq('status', 'completed');
    if (opts.atrasadas) q = q.lt('due_date', today);
    if (opts.busca) q = q.ilike('title', `%${opts.busca}%`);
    return maybe(q);
  };
  const full = await runTarefas(true);
  const min = full.erro ? await runTarefas(false) : full;
  if (min.erro) throw new Error(min.erro);
  const rows = min.data ?? [];
  const empresas = await loadEmpresas(
    supabase,
    rows.map((r) => String(r.client_id || ''))
  );
  return {
    hoje: today,
    total: rows.length,
    tarefas: rows.map((r) => {
      const due = typeof r.due_date === 'string' ? r.due_date : '';
      const late = Boolean(due && due < today && r.status !== 'completed');
      return {
        ...r,
        empresa: r.client_id ? empresas.get(String(r.client_id)) ?? null : null,
        atrasada: late,
        dias_atraso: late && due ? Math.max(0, Math.round((Date.parse(`${today}T12:00:00`) - Date.parse(`${due}T12:00:00`)) / 86400000)) : 0,
      };
    }),
  };
}

export async function loadMiniCrm(
  supabase: SupabaseClient,
  opts: { cliente_id?: string; limite?: number; busca?: string }
) {
  const n = opts.limite ?? 80;
  let q = supabase
    .from('cliente_whatsapp_contact')
    .select(
      'id, cliente_id, sender_name, phone, from_jid, first_seen_at, last_message_at, qualificado, comprou, mini_crm, tracking_data'
    )
    .not('mini_crm', 'is', null)
    .order('last_message_at', { ascending: false })
    .limit(n);
  if (opts.cliente_id) q = q.eq('cliente_id', opts.cliente_id);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  let rows = (data ?? []) as Record<string, unknown>[];
  const busca = opts.busca?.trim().toLowerCase();
  if (busca) {
    rows = rows.filter((r) => {
      const nome = String(r.sender_name || '');
      const fone = String(r.phone || '');
      const crm = (r.mini_crm && typeof r.mini_crm === 'object' ? r.mini_crm : {}) as Record<string, unknown>;
      return (
        nome.toLowerCase().includes(busca) ||
        fone.includes(busca) ||
        String(crm.contato_nome || '').toLowerCase().includes(busca) ||
        String(crm.contato_telefone || '').includes(busca) ||
        String(crm.status || '').toLowerCase().includes(busca)
      );
    });
  }
  const empresas = await loadEmpresas(
    supabase,
    rows.map((r) => String(r.cliente_id || ''))
  );
  return {
    total: rows.length,
    leads: rows.map((r) => {
      const crm = (r.mini_crm && typeof r.mini_crm === 'object' ? r.mini_crm : {}) as Record<string, unknown>;
      return {
        id: r.id,
        cliente_id: r.cliente_id,
        empresa: r.cliente_id ? empresas.get(String(r.cliente_id)) ?? null : null,
        nome: crm.contato_nome || r.sender_name || null,
        telefone: crm.contato_telefone || r.phone || null,
        status: crm.status || null,
        valor: crm.valor ?? null,
        data_venda: crm.data_venda ?? null,
        qualificado: r.qualificado ?? crm.qualificado ?? null,
        comprou: r.comprou ?? null,
        first_seen_at: r.first_seen_at,
        last_message_at: r.last_message_at,
        mini_crm: crm,
      };
    }),
  };
}

export async function loadReunioes(
  supabase: SupabaseClient,
  opts: { cliente_id?: string; limite?: number }
) {
  const n = opts.limite ?? 40;
  let q = supabase
    .from('cliente_reunioes')
    .select('id, cliente_id, titulo, meet_code, status, marcada_para, iniciada_em, encerrada_em, created_at')
    .order('marcada_para', { ascending: false })
    .limit(n);
  if (opts.cliente_id) q = q.eq('cliente_id', opts.cliente_id);
  const found = await maybe(q);
  if (found.erro) throw new Error(found.erro);
  const rows = (found.data ?? []) as Record<string, unknown>[];
  const ids = rows.map((r) => String(r.id || '')).filter(Boolean);
  let falas: Record<string, unknown>[] = [];
  if (ids.length) {
    const f = await maybe(
      supabase
        .from('cliente_reuniao_falas')
        .select('id, reuniao_id, nome, texto, inicio_em, ordem')
        .in('reuniao_id', ids)
        .order('ordem', { ascending: true })
        .limit(400)
    );
    falas = (f.data ?? []) as Record<string, unknown>[];
  }
  const empresas = await loadEmpresas(
    supabase,
    rows.map((r) => String(r.cliente_id || ''))
  );
  return {
    total: rows.length,
    reunioes: rows.map((r) => {
      const id = String(r.id || '');
      const doEncontro = falas.filter((f) => String(f.reuniao_id || '') === id);
      return {
        ...r,
        empresa: r.cliente_id ? empresas.get(String(r.cliente_id)) ?? null : null,
        falas: doEncontro.length,
        conversa: doEncontro.slice(0, 40),
      };
    }),
  };
}

export async function loadOnboarding(
  supabase: SupabaseClient,
  opts: { cliente_id?: string; limite?: number }
) {
  const n = opts.limite ?? 80;
  let q = supabase.from('client_onboardings').select('*').order('started_at', { ascending: false }).limit(n);
  if (opts.cliente_id) q = q.eq('client_id', opts.cliente_id);
  const runs = await maybe(q);
  if (runs.erro) throw new Error(runs.erro);
  const list = (runs.data ?? []) as Record<string, unknown>[];
  const runIds = list.map((r) => String(r.id || '')).filter(Boolean);
  const stages = runIds.length
    ? await maybe(
        supabase.from('client_onboarding_stages').select('*').in('onboarding_id', runIds).order('position')
      )
    : { data: [] as unknown[], erro: null };
  let listasQuery = supabase.from('client_checklists').select('id, client_id, title, items').order('created_at').limit(n);
  if (opts.cliente_id) listasQuery = listasQuery.eq('client_id', opts.cliente_id);
  const listas = await maybe(listasQuery);
  if (listas.erro) throw new Error(listas.erro);
  const listaRows = (listas.data ?? []) as Record<string, unknown>[];
  const empresas = await loadEmpresas(
    supabase,
    [...list.map((r) => String(r.client_id || '')), ...listaRows.map((r) => String(r.client_id || ''))]
  );
  const stageRows = (stages.data ?? []) as Record<string, unknown>[];
  return {
    total: list.length,
    onboardings: list.map((r) => {
      const id = String(r.id || '');
      const etapas = stageRows.filter((s) => String(s.onboarding_id || s.run_id || '') === id);
      const feitas = etapas.filter((s) => String(s.state || '') === 'completed').length;
      return {
        ...r,
        empresa: r.client_id ? empresas.get(String(r.client_id)) ?? null : null,
        etapas: etapas.length,
        concluidas: feitas,
        checklist: etapas.map((s) => ({
          id: s.id,
          posicao: s.position,
          titulo: s.title,
          estado: s.state,
          depende_de: s.pending_side,
          responsavel_id: s.assignee_id,
          dias_uteis: s.sla_days,
          tarefa_id: s.task_id,
          instrucoes: s.instructions,
        })),
      };
    }),
    etapas: stageRows,
    colunas: listaRows.map((row) => ({
      checklist_id: row.id,
      cliente_id: row.client_id,
      empresa: row.client_id ? empresas.get(String(row.client_id)) ?? null : null,
      titulo: row.title,
      itens: (Array.isArray(row.items) ? row.items : []).map((item) => {
        const line = item as Record<string, unknown>;
        return {
          item_id: line.id,
          titulo: line.title,
          responsavel_id: line.assignee_id ?? null,
          prazo: line.due_date ?? null,
          concluido: Boolean(line.is_completed),
          tarefa_id: line.task_id ?? null,
        };
      }),
    })),
  };
}

export async function loadCoberturaMes(
  supabase: SupabaseClient,
  opts: { mes?: string; cliente_id?: string }
) {
  const mes = mesAtual(opts.mes);
  const bounds = monthBounds(`${mes}-01`);
  const [clientes, tarefas, projetos, profiles] = await Promise.all([
    maybe(
      supabase
        .from('clientes')
        .select('id, empresa, valor, tipo_servico, tipo_contrato, entregaveis, responsavel')
        .limit(500)
    ),
    maybe(
      supabase
        .from('tarefas')
        .select(
          'id, client_id, project_id, status, due_date, type, description, briefing_completo, briefing_legado, briefing_estado'
        )
        .gte('due_date', bounds.inicio)
        .lte('due_date', bounds.fim)
        .limit(4000)
    ),
    maybe(
      supabase
        .from('projetos')
        .select('id, client_id, mes_referencia, status')
        .gte('mes_referencia', bounds.inicio)
        .lte('mes_referencia', bounds.fim)
        .limit(800)
    ),
    maybe(supabase.from('profiles').select('id, full_name, role, status').limit(200)),
  ]);
  if (clientes.erro) throw new Error(clientes.erro);
  const computed = computeCoberturaFromRows({
    clientes: (clientes.data ?? []) as never,
    tarefas: (tarefas.data ?? []) as never,
    projetos: (projetos.data ?? []) as never,
    profiles: (profiles.data ?? []) as never,
    mesRef: bounds.mesRef,
  });
  const rows = opts.cliente_id
    ? computed.rows.filter((r) => r.cliente_id === opts.cliente_id)
    : computed.rows;
  return {
    mes,
    periodo: { inicio: bounds.inicio, fim: bounds.fim },
    agregado: computed.agregado,
    aviso: tarefas.erro || projetos.erro || profiles.erro || null,
    clientes: rows,
  };
}

export async function loadIndicadores(supabase: SupabaseClient, opts: { mes?: string }, access: ModuleAccess) {
  const denied = denyModule(access, 'reports');
  if (denied) throw new Error(denied);
  const mes = mesAtual(opts.mes);
  const scope = reportsAccess(access);
  let profileQuery = supabase.from('collaborator_indicator_profiles').select('profile_id, indicator_profile, updated_at');
  if (scope === 'self') profileQuery = profileQuery.eq('profile_id', access.user_id!);
  const omitted = { data: [], erro: null };
  const [perfis, metas, fotos] = await Promise.all([
    maybe(profileQuery),
    scope === 'all' ? maybe(
      supabase
        .from('client_result_goals')
        .select('client_id, reference_month, leads_goal, agendamentos_goal, vendas_goal')
        .eq('reference_month', `${mes}-01`)
    ) : omitted,
    scope === 'all' ? maybe(
      supabase
        .from('indicator_month_snapshots')
        .select('id, kind, reference_month, source, taken_at, taken_by')
        .eq('reference_month', `${mes}-01`)
    ) : omitted,
  ]);
  const profileIds = ((perfis.data ?? []) as { profile_id?: string }[]).map((p) => String(p.profile_id || ''));
  const names = new Map<string, string>();
  if (profileIds.length) {
    const { data } = await supabase.from('profiles').select('id, full_name').in('id', profileIds);
    for (const row of data ?? []) {
      const rec = row as { id?: string; full_name?: string | null };
      if (rec.id) names.set(rec.id, rec.full_name ?? '');
    }
  }
  return {
    mes,
    escopo: scope,
    omitidos: scope === 'self' ? ['metas_globais', 'fotos_da_equipe'] : [],
    aviso: 'Números calculados ficam na tela #/reports; aqui vão perfil, metas do mês e as fotos automáticas.',
    pessoas: ((perfis.data ?? []) as { profile_id: string; indicator_profile: string; updated_at?: string }[]).map(
      (p) => ({
        ...p,
        nome: names.get(p.profile_id) ?? null,
      })
    ),
    metas: metas.data ?? [],
    fotos: fotos.data ?? [],
    erro: perfis.erro || metas.erro || fotos.erro,
  };
}

export async function loadSolicitacoes(
  supabase: SupabaseClient,
  opts: { cliente_id?: string; limite?: number }
) {
  const n = opts.limite ?? 80;
  const run = async (full: boolean) => {
    let q = (full
      ? supabase.from('solicitacoes').select(SOLICITACAO_COLS)
      : supabase.from('solicitacoes').select(SOLICITACAO_MIN)
    ).order('created_at', { ascending: false }).limit(n);
    if (opts.cliente_id) q = q.eq('client_id', opts.cliente_id);
    return maybe(q);
  };
  const full = await run(true);
  const min = full.erro ? await run(false) : full;
  if (min.erro) throw new Error(min.erro);
  const rows = min.data ?? [];
  const empresas = await loadEmpresas(
    supabase,
    rows.map((r) => String(r.client_id || ''))
  );
  return {
    total: rows.length,
    solicitacoes: rows.map((r) => ({
      ...r,
      empresa: r.client_id ? empresas.get(String(r.client_id)) ?? null : null,
    })),
  };
}

export async function loadAutomacoes(supabase: SupabaseClient) {
  const full = await maybe(
    supabase.from('automacoes_config').select('nome, ativo, descricao, updated_at').order('nome')
  );
  if (!full.erro) return { total: (full.data ?? []).length, automacoes: full.data ?? [] };
  const min = await maybe(supabase.from('automacoes_config').select('nome, ativo, updated_at').order('nome'));
  if (min.erro) throw new Error(min.erro);
  return { total: (min.data ?? []).length, automacoes: min.data ?? [], aviso: full.erro };
}

export async function loadAssistente(
  supabase: SupabaseClient,
  opts: { cliente_id?: string; limite?: number }
) {
  const n = opts.limite ?? 40;
  let q = supabase
    .from('assistant_project_conversations')
    .select('id, title, mode, client_id, owner_id, updated_at, created_at, tags')
    .order('updated_at', { ascending: false })
    .limit(n);
  if (opts.cliente_id) q = q.eq('client_id', opts.cliente_id);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return { total: data?.length ?? 0, conversas: data ?? [] };
}

async function countRows(
  promise: PromiseLike<{ count: number | null; error: { message: string } | null }>
): Promise<{ count: number | null; erro: string | null }> {
  const { count, error } = await promise;
  return { count: count ?? null, erro: error?.message ?? null };
}

export async function loadDashboardResumo(supabase: SupabaseClient, access: ModuleAccess) {
  const denied = denyModule(access, 'dashboard');
  if (denied) throw new Error(denied);
  const today = todayYmd();
  const omitted = { count: null, erro: 'Módulo indisponível para esta sessão.' };
  let caixaQuery = supabase.from('pendencias_caixa').select('id', { count: 'exact', head: true }).neq('estado', 'arquivada');
  if (!access.is_admin) caixaQuery = caixaQuery.eq('pessoa_id', access.user_id!);
  const [atrasadas, abertas, onboard, caixa] = await Promise.all([
    !denyModule(access, 'tasks') ? countRows(
      supabase
        .from('tarefas')
        .select('id', { count: 'exact', head: true })
        .neq('status', 'completed')
        .lt('due_date', today)
    ) : omitted,
    !denyModule(access, 'requests') ? countRows(supabase.from('solicitacoes').select('id', { count: 'exact', head: true }).neq('status', 'concluida')) : omitted,
    !denyModule(access, 'onboarding') ? countRows(supabase.from('client_onboardings').select('id', { count: 'exact', head: true })) : omitted,
    countRows(caixaQuery),
  ]);
  return {
    hoje: today,
    tarefas_atrasadas: atrasadas.count,
    solicitacoes_abertas: abertas.count,
    onboardings: onboard.count,
    pendencias_caixa: caixa.count,
    aviso: 'Início da agência. Use listar_tarefas_atrasadas, ler_aba requests/lista e ler_aba onboarding/kanban para o detalhe.',
    erros: {
      atrasadas: atrasadas.erro,
      solicitacoes: abertas.erro,
      onboarding: onboard.erro,
      caixa: caixa.erro,
    },
  };
}

export async function loadProjetosPendentes(supabase: SupabaseClient, opts: { mes?: string; limite?: number }) {
  const mes = mesAtual(opts.mes);
  const bounds = monthBounds(`${mes}-01`);
  const [projetos, skips, clientes] = await Promise.all([
    loadProjetos(supabase, { mes, limite: opts.limite ?? 200 }),
    maybe(
      supabase
        .from('project_plan_skips')
        .select('id, client_id, mes_referencia, created_at')
        .gte('mes_referencia', bounds.inicio)
        .lte('mes_referencia', bounds.fim)
    ),
    maybe(
      supabase
        .from('clientes')
        .select('id, empresa, tipo_servico, tipo_contrato, entregaveis, etapa')
        .limit(400)
    ),
  ]);
  const comPlano = new Set(projetos.projetos.map((p) => String(p.client_id || '')));
  const pulados = new Set(
    ((skips.data ?? []) as { client_id?: string }[]).map((s) => String(s.client_id || ''))
  );
  const semPlano = ((clientes.data ?? []) as Record<string, unknown>[]).filter((c) => {
    const id = String(c.id || '');
    if (!id || comPlano.has(id) || pulados.has(id)) return false;
    const ts = String(c.tipo_servico || '').toLowerCase();
    if (ts === 'so_trafego' || ts === 'trafego_apenas') return false;
    return String(c.etapa || '') !== 'lost';
  });
  return {
    mes,
    projetos_do_mes: projetos.projetos,
    pulados: skips.data ?? [],
    sem_plano_automatico: semPlano,
    aviso: skips.erro || clientes.erro,
  };
}

export async function loadClienteDossie(
  supabase: SupabaseClient,
  clienteId: string,
  opts: { mes?: string; limite?: number },
  access: ModuleAccess
) {
  const denied = denyModule(access, 'clients');
  if (denied) throw new Error(denied);
  const mes = mesAtual(opts.mes);
  const limite = opts.limite ?? 60;
  const canRead = (module: string) => !denyModule(access, module);
  const [cadastro, projetos, tarefas, mini, reunioes, onboarding, cobertura, solicitacoes] = await Promise.all([
    loadClienteCadastro(supabase, clienteId),
    canRead('projects') ? loadProjetos(supabase, { cliente_id: clienteId, limite }) : null,
    canRead('tasks') ? loadTarefasPagina(supabase, { cliente_id: clienteId, limite }) : null,
    canRead('mini_crm') ? loadMiniCrm(supabase, { cliente_id: clienteId, limite }) : null,
    loadReunioes(supabase, { cliente_id: clienteId, limite: 20 }),
    canRead('onboarding') ? loadOnboarding(supabase, { cliente_id: clienteId, limite: 20 }) : null,
    canRead('tasks') && canRead('projects') ? loadCoberturaMes(supabase, { mes, cliente_id: clienteId }) : null,
    canRead('requests') ? loadSolicitacoes(supabase, { cliente_id: clienteId, limite: 20 }) : null,
  ]);
  return {
    cliente_id: clienteId,
    mes,
    cadastro: cadastro.cliente,
    projetos: projetos?.projetos ?? null,
    tarefas: tarefas?.tarefas ?? null,
    mini_crm: mini?.leads ?? null,
    reunioes: reunioes.reunioes,
    onboarding: onboarding?.onboardings ?? null,
    cobertura: cobertura?.clientes[0] ?? null,
    solicitacoes: solicitacoes?.solicitacoes ?? null,
    modulos_omitidos: ['projects', 'tasks', 'mini_crm', 'onboarding', 'requests'].filter(module => !canRead(module)),
    totais: {
      projetos: projetos?.total ?? null,
      tarefas_abertas: tarefas?.total ?? null,
      mini_crm: mini?.total ?? null,
      reunioes: reunioes.total,
      onboardings: onboarding?.total ?? null,
      solicitacoes: solicitacoes?.total ?? null,
    },
  };
}

export async function loadClientesLista(
  supabase: SupabaseClient,
  opts: { cliente_id?: string; limite?: number; busca?: string }
) {
  const n = opts.limite ?? 200;
  let q = supabase.from('clientes').select(CLIENTE_SAFE).order('empresa').limit(n);
  if (opts.cliente_id) q = q.eq('id', opts.cliente_id);
  if (opts.busca) q = q.ilike('empresa', `%${opts.busca}%`);
  const full = await maybe(q);
  if (!full.erro) return { clientes: full.data ?? [], aviso: null };
  let q2 = supabase.from('clientes').select(CLIENTE_MIN).order('empresa').limit(n);
  if (opts.cliente_id) q2 = q2.eq('id', opts.cliente_id);
  const { data, error } = await q2;
  if (error) throw new Error(error.message);
  return { clientes: data ?? [], aviso: full.erro };
}
