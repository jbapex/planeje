import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { actorUserId, denyModule, loadModuleAccess, type McpActorLike, type ModuleAccess } from './access.js';
import { filterHubTabs, findHubTab, HUB_MODULES } from './hubCatalog.js';
import {
  loadAssistente,
  loadAutomacoes,
  loadClientesLista,
  loadClienteDossie,
  loadCoberturaMes,
  loadDashboardResumo,
  loadIndicadores,
  loadMiniCrm,
  loadOnboarding,
  loadProjetos,
  loadProjetosPendentes,
  loadReunioes,
  loadSolicitacoes,
  loadTarefasPagina,
} from './clienteDossie.js';
import { consultGoogle, consultMensagens, consultMeta, consultPainel, compactMetaResumo } from './liveConsult.js';
import { pageUrl } from './pages.js';

function jsonText(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

function toolError(message: string) {
  return {
    content: [{ type: 'text' as const, text: message }],
    isError: true as const,
  };
}

function todayYmdSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function weekStartMonday(ymd = todayYmdSaoPaulo()): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (dow - 1));
  return d.toISOString().slice(0, 10);
}

function monthRange(ym?: string): { ym: string; since: string; until: string } {
  const today = todayYmdSaoPaulo();
  const stamp = ym && /^\d{4}-\d{2}$/.test(ym.trim()) ? ym.trim() : today.slice(0, 7);
  const parts = stamp.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return { ym: stamp, since: `${stamp}-01`, until: `${stamp}-${pad(last)}` };
}

const FILTROS_LINHA = {
  inicio: z.string().optional().describe('Data inicial YYYY-MM-DD (com fim, vence o mes)'),
  fim: z.string().optional().describe('Data final YYYY-MM-DD'),
  busca: z
    .string()
    .optional()
    .describe('Rastreamento: nome, telefone, campanha ou origem do lead; nos eventos, nome do evento. Painel: id ou parte do nome'),
  linha: z
    .string()
    .optional()
    .describe('Painel: id ou parte do nome da campanha, conjunto ou anúncio (traz a linha inteira, sem corte)'),
  offset: z.number().int().min(0).optional().describe('Pula N linhas (paginação dos leads)'),
  qualificado: z.boolean().optional().describe('Leads: só qualificados (true) ou não (false)'),
  comprou: z.boolean().optional().describe('Leads: só quem comprou (true) ou não (false)'),
};

function isYmd(value?: string): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value.trim()));
}

/** inicio/fim (YYYY-MM-DD) vencem o mês; sem eles, o mês pedido ou o atual. */
function periodFrom(args: { mes?: string; inicio?: string; fim?: string }): { since: string; until: string } {
  if (isYmd(args.inicio) && isYmd(args.fim)) {
    const a = args.inicio.trim();
    const b = args.fim.trim();
    return a <= b ? { since: a, until: b } : { since: b, until: a };
  }
  const range = monthRange(args.mes);
  return { since: range.since, until: range.until };
}

function foldLabel(value: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Na Rotina o KPI pode chamar Agendamentos; no Relatório o slide mostra mensagem iniciada. */
function reportResultLabel(label: string): { gravado: string; no_slide: string } {
  const raw = String(label || '').trim() || 'Agendamentos';
  const noSlide = /agend/.test(foldLabel(raw)) ? 'Mensagens iniciadas' : raw;
  return { gravado: raw, no_slide: noSlide };
}

function sanitizeDispatch(raw: unknown, scheduledAt?: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const phase = String(r.phase || '').trim();
  if (!phase) return null;
  const fileSize = Number(r.file_size || 0);
  const offset = Number(r.offset || 0);
  const percent =
    phase === 'ready' || phase === 'processing'
      ? 100
      : fileSize > 0
        ? Math.min(99, Math.round((offset / fileSize) * 100))
        : 0;
  const when = Date.parse(String(scheduledAt || ''));
  const overdue = Number.isFinite(when) && when <= Date.now();
  const nota = String(r.note || r.error || r.last_error || '').trim().slice(0, 240);
  return {
    phase,
    percent,
    atraso: overdue && (phase === 'processing' || phase === 'uploading' || phase === 'queued'),
    nota: nota || null,
  };
}

function sanitizeMetaConnection(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { status: 'not_connected' };
  }
  const r = raw as Record<string, unknown>;
  return {
    status: r.status ?? 'not_connected',
    credentialLabel: r.credentialLabel ?? null,
    tokenLast4: r.tokenLast4 ?? r.token_last4 ?? null,
    businessId: r.businessId ?? r.business_id ?? null,
    businessName: r.businessName ?? r.business_name ?? null,
    userName: r.userName ?? null,
    adAccountIds: Array.isArray(r.adAccountIds) ? r.adAccountIds : [],
    adAccounts: Array.isArray(r.adAccounts)
      ? (r.adAccounts as Record<string, unknown>[]).map((a) => ({
          id: a.id ?? null,
          name: a.name ?? null,
        }))
      : [],
    pixelId: r.pixelId ?? r.pixel_id ?? null,
    pixelName: r.pixelName ?? r.pixel_name ?? null,
    pageId: r.pageId ?? r.page_id ?? null,
    pageName: r.pageName ?? r.page_name ?? null,
    validatedAt: r.validatedAt ?? null,
    testedAt: r.testedAt ?? null,
    testMessage: r.testMessage ?? null,
  };
}

const TRACKING_KEEP = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'origin_source',
  'gclid',
  'fbclid',
  'ctwaClid',
  'ctwa_clid',
  'campaign_id',
  'campaign_name',
  'adset_id',
  'adset_name',
  'ad_id',
  'ad_name',
  'planeje_link_id',
  'match_code',
  'source_id',
  'sheet_origem',
  'cqc_origem',
  'planeje_labels',
]);

function nameOf(raw: unknown): unknown {
  if (raw && typeof raw === 'object') {
    const rec = raw as { name?: unknown; id?: unknown };
    return rec.name ?? rec.id ?? null;
  }
  return raw ?? null;
}

function sanitizeTracking(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!TRACKING_KEEP.has(k)) continue;
    if (typeof v === 'string' && v.length > 180) out[k] = `${v.slice(0, 24)}…`;
    else out[k] = v;
  }
  const ad = (raw as { meta_ad_details?: { ad?: Record<string, unknown> } }).meta_ad_details?.ad;
  if (ad && typeof ad === 'object') {
    out.anuncio_meta = {
      id: ad.id ?? null,
      anuncio: ad.name ?? null,
      conjunto: nameOf(ad.adset),
      campanha: nameOf(ad.campaign),
    };
  }
  return out;
}

async function requireModule(
  supabase: SupabaseClient,
  actor: McpActorLike | undefined,
  moduleName: string
): Promise<ModuleAccess | { error: string }> {
  const access = await loadModuleAccess(supabase, actor);
  const denied = denyModule(access, moduleName);
  if (denied) return { error: denied };
  return access;
}

async function empresaMap(
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

async function gestorCarteiraIds(
  supabase: SupabaseClient,
  access: ModuleAccess
): Promise<Set<string> | null> {
  if (access.is_admin || !access.user_id) return null;
  const { data } = await supabase
    .from('traffic_client_ops')
    .select('client_id, primary_assignee_id');
  const ids = new Set<string>();
  for (const row of data ?? []) {
    const rec = row as { client_id?: string; primary_assignee_id?: string | null };
    if (rec.client_id && rec.primary_assignee_id === access.user_id) ids.add(rec.client_id);
  }
  const { data: clients } = await supabase
    .from('clientes')
    .select('id,responsavel')
    .eq('responsavel', access.user_id);
  for (const row of clients ?? []) {
    const rec = row as { id?: string };
    if (rec.id) ids.add(rec.id);
  }
  return ids;
}

function publicationTabFilter(aba: string): string[] | null {
  if (aba === 'pending') return ['pending', 'failed'];
  if (aba === 'scheduled') return ['scheduled'];
  if (aba === 'completed') return ['published'];
  return null;
}

async function loadPublicacoes(
  supabase: SupabaseClient,
  opts: { cliente_id?: string; status?: string; limite?: number }
) {
  const n = opts.limite ?? 80;
  let q = supabase
    .from('task_channel_publications')
    .select(
      'id, task_id, channel, destination, format, status, scheduled_for, scheduled_at, published_on, caption, notes, evidence_url, meta_dispatch, created_at, updated_at'
    )
    .order('scheduled_for', { ascending: false })
    .limit(n);
  if (opts.status) q = q.eq('status', opts.status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  let rows = (data ?? []) as Record<string, unknown>[];
  const taskIds = rows.map((r) => String(r.task_id || '')).filter(Boolean);
  let tasks: Record<string, unknown>[] = [];
  if (taskIds.length) {
    let tq = supabase
      .from('tarefas')
      .select('id, title, client_id, status, type, due_date, post_date')
      .in('id', taskIds);
    if (opts.cliente_id) tq = tq.eq('client_id', opts.cliente_id);
    const { data: tdata, error: terr } = await tq;
    if (terr) throw new Error(terr.message);
    tasks = (tdata ?? []) as Record<string, unknown>[];
  }
  const allowed = new Set(tasks.map((t) => String(t.id)));
  if (opts.cliente_id) rows = rows.filter((r) => allowed.has(String(r.task_id)));
  const empresas = await empresaMap(
    supabase,
    tasks.map((t) => String(t.client_id || ''))
  );
  const taskById = new Map(tasks.map((t) => [String(t.id), t]));
  return rows.map((r): Record<string, unknown> => {
    const task = taskById.get(String(r.task_id));
    const clientId = task ? String(task.client_id || '') : '';
    return {
      ...r,
      meta_dispatch: undefined,
      envio: sanitizeDispatch(r.meta_dispatch, r.scheduled_at || r.scheduled_for),
      tarefa: task
        ? { id: task.id, title: task.title, status: task.status, type: task.type, due_date: task.due_date }
        : null,
      cliente_id: clientId || null,
      empresa: clientId ? empresas.get(clientId) ?? null : null,
    };
  });
}

async function loadRotina(
  supabase: SupabaseClient,
  access: ModuleAccess,
  opts: { cliente_id?: string; semana?: string; limite?: number }
) {
  const carteira = await gestorCarteiraIds(supabase, access);
  let settingsQ = supabase.from('traffic_weekly_settings').select('*');
  if (opts.cliente_id) settingsQ = settingsQ.eq('client_id', opts.cliente_id);
  const { data: settings, error: sErr } = await settingsQ;
  if (sErr) throw new Error(sErr.message);

  let opsQ = supabase.from('traffic_client_ops').select('client_id, primary_assignee_id, situation');
  if (opts.cliente_id) opsQ = opsQ.eq('client_id', opts.cliente_id);
  const { data: ops } = await opsQ;

  const week = opts.semana || weekStartMonday();
  const n = opts.limite ?? 80;
  let reviewsQ = supabase
    .from('traffic_weekly_reviews')
    .select(
      'id, client_id, week_start, kind, result_label, metric_mode, investment, contacts, results, analysis, data_note, campaign_metrics, revision, action_mode, action_draft, finalized_at, finalized_by, task_id, created_at, updated_at'
    )
    .gte('week_start', week)
    .order('week_start', { ascending: false })
    .limit(n);
  if (opts.cliente_id) reviewsQ = reviewsQ.eq('client_id', opts.cliente_id);
  const { data: reviews, error: rErr } = await reviewsQ;
  if (rErr) throw new Error(rErr.message);

  const clientIds = [
    ...new Set(
      [
        ...(settings ?? []).map((s) => String((s as { client_id?: string }).client_id || '')),
        ...(reviews ?? []).map((s) => String((s as { client_id?: string }).client_id || '')),
        ...(ops ?? []).map((s) => String((s as { client_id?: string }).client_id || '')),
      ].filter(Boolean)
    ),
  ].filter((id) => !carteira || carteira.has(id));

  const empresas = await empresaMap(supabase, clientIds);
  const opsBy = new Map(
    (ops ?? []).map((o) => {
      const rec = o as { client_id: string; primary_assignee_id?: string; situation?: string };
      return [rec.client_id, rec];
    })
  );
  const settingsBy = new Map(
    (settings ?? []).map((s) => {
      const rec = s as { client_id: string };
      return [rec.client_id, rec];
    })
  );

  const scopedReviews = (reviews ?? []).filter((r) => {
    const id = String((r as { client_id?: string }).client_id || '');
    return !carteira || carteira.has(id);
  }) as Record<string, unknown>[];
  const fills = await loadFillHistory(
    supabase,
    scopedReviews.map((r) => String(r.id || '')).filter(Boolean)
  );

  const clientes = clientIds.map((id) => ({
    id,
    empresa: empresas.get(id) ?? null,
    ops: opsBy.get(id) ?? null,
    settings: settingsBy.get(id) ?? null,
  }));

  return {
    semana_ref: week,
    hoje: todayYmdSaoPaulo(),
    total_clientes: clientes.length,
    clientes,
    revisoes: scopedReviews.map((r) => ({
      ...r,
      resultado: reportResultLabel(String(r.result_label || '')),
      preenchimento: fills.get(String(r.id)) ?? null,
    })),
  };
}

async function loadFillHistory(
  supabase: SupabaseClient,
  reviewIds: string[]
): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>();
  const ids = [...new Set(reviewIds.filter(Boolean))];
  if (!ids.length) return out;
  const { data, error } = await supabase
    .from('traffic_weekly_history')
    .select('id, review_id, event, actor_id, occurred_at, snapshot')
    .in('review_id', ids)
    .order('occurred_at', { ascending: true })
    .limit(400);
  if (error) throw new Error(error.message);
  const actorIds = [
    ...new Set(
      (data ?? [])
        .map((row) => String((row as { actor_id?: string }).actor_id || ''))
        .filter(Boolean)
    ),
  ];
  const names = new Map<string, string>();
  if (actorIds.length) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', actorIds);
    for (const p of profiles ?? []) {
      const rec = p as { id?: string; full_name?: string | null };
      if (rec.id) names.set(rec.id, rec.full_name || '');
    }
  }
  const byReview = new Map<string, Record<string, unknown>[]>();
  for (const row of data ?? []) {
    const rec = row as {
      review_id?: string;
      event?: string;
      actor_id?: string;
      occurred_at?: string;
      snapshot?: { after?: Record<string, unknown> };
    };
    const rid = String(rec.review_id || '');
    if (!rid) continue;
    const after = rec.snapshot?.after;
    const filled = Boolean(
      after &&
        (String(after.analysis || '').trim() ||
          after.investment != null ||
          after.contacts != null ||
          (Array.isArray(after.campaign_metrics) && after.campaign_metrics.length))
    );
    const list = byReview.get(rid) ?? [];
    list.push({
      evento: rec.event,
      em: rec.occurred_at,
      quem: rec.actor_id ? names.get(rec.actor_id) || 'Integrante da equipe' : 'Rotina automática',
      preenchido: filled,
    });
    byReview.set(rid, list);
  }
  for (const [rid, events] of byReview) {
    const first = events.find((e) => e.preenchido);
    const last = [...events].reverse().find((e) => e.preenchido || e.evento === 'finalized');
    out.set(rid, {
      primeiro_em: first?.em ?? null,
      ultimo_em: last?.em ?? null,
      quem: (first?.quem as string) || null,
      alteracoes: [...events].reverse().slice(0, 8),
    });
  }
  return out;
}

async function loadGoogleData(supabase: SupabaseClient, clienteId?: string) {
  const filter = (table: string, cols: string) => {
    let q = supabase.from(table).select(cols).eq('is_active', true);
    if (clienteId) q = q.eq('cliente_id', clienteId);
    return q.limit(200);
  };
  const [{ data: ga, error: gaErr }, { data: biz, error: bizErr }, { data: gtm, error: gtmErr }] =
    await Promise.all([
      filter(
        'cliente_google_analytics_properties',
        'id, cliente_id, property_id, property_name, account_id, account_name, is_active, updated_at'
      ),
      filter(
        'cliente_google_business_locations',
        'id, cliente_id, location_name, location_title, account_name, is_active, updated_at'
      ),
      filter(
        'cliente_google_tag_containers',
        'id, cliente_id, account_id, container_id, container_name, public_id, is_active, updated_at'
      ),
    ]);
  if (gaErr) throw new Error(gaErr.message);
  if (bizErr) throw new Error(bizErr.message);
  if (gtmErr) throw new Error(gtmErr.message);
  const clientIds = [
    ...new Set(
      [...(ga ?? []), ...(biz ?? []), ...(gtm ?? [])]
        .map((r) => String((r as { cliente_id?: string }).cliente_id || ''))
        .filter(Boolean)
    ),
  ];
  const empresas = await empresaMap(supabase, clientIds);
  const withEmpresa = (rows: unknown[]) =>
    (rows as Record<string, unknown>[]).map((r) => ({
      ...r,
      empresa: empresas.get(String(r.cliente_id || '')) ?? null,
    }));
  return {
    analytics: withEmpresa(ga ?? []),
    meu_negocio: withEmpresa(biz ?? []),
    tag_manager: withEmpresa(gtm ?? []),
  };
}

async function loadRelatorio(
  supabase: SupabaseClient,
  access: ModuleAccess,
  opts: { cliente_id: string; mes?: string; atualizar?: boolean }
) {
  const carteira = await gestorCarteiraIds(supabase, access);
  if (carteira && !carteira.has(opts.cliente_id)) {
    throw new Error('Este cliente não está na carteira deste usuário.');
  }
  const range = monthRange(opts.mes);
  const weekFrom = (() => {
    const d = new Date(`${range.since}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 6);
    return d.toISOString().slice(0, 10);
  })();
  const [{ data: cliente }, { data: settings }, { data: reviews, error: rErr }, { data: vendas }, { data: metaAcc }] =
    await Promise.all([
      supabase.from('clientes').select('id, empresa, meta_resumo').eq('id', opts.cliente_id).maybeSingle(),
      supabase
        .from('traffic_weekly_settings')
        .select('result_label, sheet_metrics')
        .eq('client_id', opts.cliente_id)
        .maybeSingle(),
      supabase
        .from('traffic_weekly_reviews')
        .select(
          'id, week_start, kind, result_label, investment, contacts, results, analysis, data_note, campaign_metrics, action_draft, revision, finalized_at, updated_at'
        )
        .eq('client_id', opts.cliente_id)
        .gte('week_start', weekFrom)
        .lte('week_start', range.until)
        .order('week_start', { ascending: true }),
      supabase
        .from('crm_vendas')
        .select('id, valor_total, data_venda')
        .eq('cliente_id', opts.cliente_id)
        .gte('data_venda', range.since)
        .lte('data_venda', range.until)
        .order('data_venda', { ascending: true }),
      supabase
        .from('cliente_meta_accounts')
        .select('meta_account_id, meta_account_name, is_active')
        .eq('cliente_id', opts.cliente_id)
        .eq('is_active', true),
    ]);
  if (rErr) throw new Error(rErr.message);
  if (!cliente) throw new Error('Cliente não encontrado.');
  const rec = cliente as { id: string; empresa?: string; meta_resumo?: unknown };
  const settingsRec = (settings ?? {}) as { result_label?: string; sheet_metrics?: unknown };
  const resultado = reportResultLabel(settingsRec.result_label || 'Agendamentos');
  const reviewList = (reviews ?? []) as Record<string, unknown>[];
  const fills = await loadFillHistory(
    supabase,
    reviewList.map((r) => String(r.id || '')).filter(Boolean)
  );
  const saleRows = (vendas ?? []) as { valor_total?: number; data_venda?: string }[];
  const saleTotal = saleRows.reduce((sum, row) => sum + (Number(row.valor_total) || 0), 0);
  return {
    aviso:
      'Rotina do mês, vendas do CRM e números da Meta. Foto 1080×1920 continua só na tela.',
    mes: range.ym,
    periodo: { inicio: range.since, fim: range.until },
    cliente_id: rec.id,
    empresa: rec.empresa ?? null,
    resultado,
    colunas_planilha: settingsRec.sheet_metrics ?? [],
    contas_meta: metaAcc ?? [],
    meta: await consultMeta(supabase, opts.cliente_id, {
      since: range.since,
      until: range.until,
      atualizar: opts.atualizar,
      salvo: rec.meta_resumo,
    }),
    vendas: { quantidade: saleRows.length, total: saleTotal, itens: saleRows },
    rotina: reviewList.map((r) => ({
      ...r,
      resultado: reportResultLabel(String(r.result_label || settingsRec.result_label || '')),
      preenchimento: fills.get(String(r.id)) ?? null,
    })),
  };
}

async function loadHoje(supabase: SupabaseClient, access: ModuleAccess) {
  const carteira = await gestorCarteiraIds(supabase, access);
  const today = todayYmdSaoPaulo();
  const week = weekStartMonday(today);

  const { data: clients, error: cErr } = await supabase
    .from('clientes')
    .select('id, empresa, etapa, limite_meta, objetivo_meta, meta_custo_mensagem, meta_custo_compra, roas_alvo, responsavel, meta_resumo')
    .eq('etapa', 'closed')
    .order('empresa');
  if (cErr) throw new Error(cErr.message);

  const scoped = (clients ?? []).filter((c) => {
    const rec = c as { id?: string };
    return rec.id && (!carteira || carteira.has(rec.id));
  }) as Record<string, unknown>[];

  const ids = scoped.map((c) => String(c.id));
  const [{ data: reviews }, { data: ops }, { data: settings }, { data: metaAcc }, { data: googleAcc }] =
    await Promise.all([
      supabase
        .from('traffic_weekly_reviews')
        .select(
          'id, client_id, week_start, kind, result_label, finalized_at, task_id, investment, contacts, results'
        )
        .in('client_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
        .gte('week_start', week),
      supabase
        .from('traffic_client_ops')
        .select('client_id, primary_assignee_id, situation')
        .in('client_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']),
      supabase
        .from('traffic_weekly_settings')
        .select('client_id, enabled, review_weekday, optimization_enabled, optimization_weekday, result_label, sheet_metrics')
        .in('client_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']),
      supabase
        .from('cliente_meta_accounts')
        .select('cliente_id, meta_account_id, meta_account_name, is_active')
        .eq('is_active', true)
        .in('cliente_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']),
      supabase
        .from('cliente_google_ads_accounts')
        .select('cliente_id, google_customer_id, google_customer_name, is_active, conversions_enabled')
        .eq('is_active', true)
        .in('cliente_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']),
    ]);

  const taskIds = (reviews ?? [])
    .map((r) => String((r as { task_id?: string }).task_id || ''))
    .filter(Boolean);
  let tasks: Record<string, unknown>[] = [];
  if (taskIds.length) {
    const { data } = await supabase
      .from('tarefas')
      .select('id, title, status, due_date, assignee_ids')
      .in('id', taskIds);
    tasks = (data ?? []) as Record<string, unknown>[];
  }
  const taskById = new Map(tasks.map((t) => [String(t.id), t]));

  return {
    hoje: today,
    semana: week,
    total: scoped.length,
    clientes: scoped.map((c): Record<string, unknown> => {
      const id = String(c.id);
      const revs = (reviews ?? []).filter((r) => String((r as { client_id?: string }).client_id) === id);
      return {
        ...c,
        ops: (ops ?? []).find((o) => String((o as { client_id?: string }).client_id) === id) ?? null,
        rotina: (settings ?? []).find((s) => String((s as { client_id?: string }).client_id) === id) ?? null,
        contas_meta: (metaAcc ?? []).filter(
          (a) => String((a as { cliente_id?: string }).cliente_id) === id
        ),
        contas_google: (googleAcc ?? []).filter(
          (a) => String((a as { cliente_id?: string }).cliente_id) === id
        ),
        meta: compactMetaResumo(c.meta_resumo),
        revisoes_semana: revs.map((r) => {
          const rec = r as { task_id?: string };
          return { ...rec, tarefa: rec.task_id ? taskById.get(rec.task_id) ?? null : null };
        }),
      };
    }),
  };
}

async function loadLeads(
  supabase: SupabaseClient,
  opts: {
    cliente_id: string;
    limite?: number;
    offset?: number;
    busca?: string;
    telefone?: string;
    inicio?: string;
    fim?: string;
    qualificado?: boolean;
    comprou?: boolean;
  }
) {
  const n = Math.min(Math.max(opts.limite ?? 50, 1), 200);
  const from = Math.max(opts.offset ?? 0, 0);
  const digits = String(opts.telefone || '').replace(/\D/g, '');
  const tail = digits.length >= 8 ? digits.slice(-8) : '';
  const busca = String(opts.busca || '')
    .replace(/[%,()*]/g, ' ')
    .trim();
  const buscaDigits = busca.replace(/\D/g, '');

  let contactQ = supabase
    .from('cliente_whatsapp_contact')
    .select(
      'id, cliente_id, phone, from_jid, sender_name, origin_source, utm_source, utm_medium, utm_campaign, utm_content, utm_term, first_seen_at, last_message_at, tracking_data, qualificado, comprou, valor_venda, mini_crm',
      { count: 'exact' }
    )
    .eq('cliente_id', opts.cliente_id);
  let leadQ = supabase
    .from('leads')
    .select(
      'id, nome, whatsapp, origem, status, valor, qualificado, comprou, tracking_data, data_entrada, created_at, utm_source, utm_medium, utm_campaign, utm_content, utm_term',
      { count: 'exact' }
    )
    .eq('cliente_id', opts.cliente_id);

  if (tail) {
    contactQ = contactQ.or(`phone.ilike.%${tail}%,from_jid.ilike.%${tail}%`);
    leadQ = leadQ.ilike('whatsapp', `%${tail}%`);
  }
  if (busca) {
    if (buscaDigits.length >= 6 && buscaDigits.length === busca.replace(/\s/g, '').length) {
      contactQ = contactQ.ilike('phone', `%${buscaDigits.slice(-8)}%`);
      leadQ = leadQ.ilike('whatsapp', `%${buscaDigits.slice(-8)}%`);
    } else {
      contactQ = contactQ.or(
        `sender_name.ilike.%${busca}%,utm_campaign.ilike.%${busca}%,origin_source.ilike.%${busca}%`
      );
      leadQ = leadQ.or(`nome.ilike.%${busca}%,utm_campaign.ilike.%${busca}%,origem.ilike.%${busca}%`);
    }
  }
  if (isYmd(opts.inicio)) {
    contactQ = contactQ.gte('first_seen_at', `${opts.inicio.trim()}T00:00:00-03:00`);
    leadQ = leadQ.gte('created_at', `${opts.inicio.trim()}T00:00:00-03:00`);
  }
  if (isYmd(opts.fim)) {
    contactQ = contactQ.lte('first_seen_at', `${opts.fim.trim()}T23:59:59-03:00`);
    leadQ = leadQ.lte('created_at', `${opts.fim.trim()}T23:59:59-03:00`);
  }
  if (typeof opts.qualificado === 'boolean') {
    contactQ = contactQ.eq('qualificado', opts.qualificado);
    leadQ = leadQ.eq('qualificado', opts.qualificado);
  }
  if (typeof opts.comprou === 'boolean') {
    contactQ = contactQ.eq('comprou', opts.comprou);
    leadQ = leadQ.eq('comprou', opts.comprou);
  }

  const [
    { data: contacts, error: cErr, count: cCount },
    { data: leads, error: lErr, count: lCount },
  ] = await Promise.all([
    contactQ.order('last_message_at', { ascending: false, nullsFirst: false }).range(from, from + n - 1),
    leadQ.order('updated_at', { ascending: false }).range(from, from + n - 1),
  ]);
  const pastEnd = (e: { message?: string; code?: string } | null) =>
    Boolean(e && (e.code === 'PGRST103' || /range not satisfiable/i.test(e.message || '')));
  if (cErr && !pastEnd(cErr)) throw new Error(cErr.message);
  if (lErr && !pastEnd(lErr)) throw new Error(lErr.message);

  const mapRow = (row: Record<string, unknown>): Record<string, unknown> => ({
    ...row,
    tracking_data: sanitizeTracking(row.tracking_data),
  });
  return {
    cliente_id: opts.cliente_id,
    total_contatos: cCount ?? null,
    total_leads: lCount ?? null,
    offset: from,
    limite: n,
    contatos: (contacts ?? []).map((r) => mapRow(r as Record<string, unknown>)),
    leads: (leads ?? []).map((r) => mapRow(r as Record<string, unknown>)),
  };
}

/** Contagem real (não amostra) de contatos do Rastreamento no período e no total. */
async function countLeadsResumo(
  supabase: SupabaseClient,
  clienteId: string,
  periodo: { since: string; until: string }
) {
  const base = () =>
    supabase
      .from('cliente_whatsapp_contact')
      .select('id', { count: 'exact', head: true })
      .eq('cliente_id', clienteId);
  const inPeriod = () =>
    base()
      .gte('first_seen_at', `${periodo.since}T00:00:00-03:00`)
      .lte('first_seen_at', `${periodo.until}T23:59:59-03:00`);
  const [total, contatos, meta, qualificados, compras, venda] = await Promise.all([
    base(),
    inPeriod(),
    inPeriod().eq('origin_source', 'meta_ads'),
    inPeriod().eq('qualificado', true),
    inPeriod().eq('comprou', true),
    supabase
      .from('cliente_whatsapp_contact')
      .select('valor_venda')
      .eq('cliente_id', clienteId)
      .eq('comprou', true)
      .gte('first_seen_at', `${periodo.since}T00:00:00-03:00`)
      .lte('first_seen_at', `${periodo.until}T23:59:59-03:00`)
      .limit(2000),
  ]);
  const err = [total, contatos, meta, qualificados, compras, venda].find((r) => r.error)?.error;
  if (err) throw new Error(err.message);
  const valor = (venda.data ?? []).reduce(
    (sum, r) => sum + (Number((r as { valor_venda?: unknown }).valor_venda) || 0),
    0
  );
  return {
    periodo: { inicio: periodo.since, fim: periodo.until },
    contatos_total_geral: total.count ?? 0,
    contatos_no_periodo: contatos.count ?? 0,
    vindos_de_anuncio_meta: meta.count ?? 0,
    qualificados: qualificados.count ?? 0,
    compras: compras.count ?? 0,
    valor_vendido: Math.round(valor * 100) / 100,
  };
}

async function loadEventos(
  supabase: SupabaseClient,
  opts: { cliente_id: string; limite?: number; inicio?: string; fim?: string; busca?: string }
) {
  const n = Math.min(Math.max(opts.limite ?? 80, 1), 300);
  const evento = String(opts.busca || '').replace(/[%,()*]/g, ' ').trim();
  const scope = <T extends { gte: Function; lte: Function; ilike: Function }>(q: T): T => {
    let out = q;
    if (isYmd(opts.inicio)) out = out.gte('created_at', `${opts.inicio.trim()}T00:00:00-03:00`);
    if (isYmd(opts.fim)) out = out.lte('created_at', `${opts.fim.trim()}T23:59:59-03:00`);
    if (evento) out = out.ilike('event_name', `%${evento}%`);
    return out;
  };
  const [{ data: meta, error: mErr }, { data: google, error: gErr }] = await Promise.all([
    scope(
      supabase
        .from('meta_conversion_event_log')
        .select('id, event_name, success, ctwa_clid, error_message, created_at, contact_id, lead_id')
        .eq('cliente_id', opts.cliente_id)
    )
      .order('created_at', { ascending: false })
      .limit(n),
    scope(
      supabase
        .from('google_conversion_event_log')
        .select(
          'id, event_name, success, gclid, error_message, created_at, contact_id, lead_id, conversion_action, customer_id'
        )
        .eq('cliente_id', opts.cliente_id)
    )
      .order('created_at', { ascending: false })
      .limit(n),
  ]);
  if (mErr) throw new Error(mErr.message);
  if (gErr) throw new Error(gErr.message);
  const summarize = (rows: { success?: boolean }[]) => ({
    total: rows.length,
    enviados: rows.filter((r) => r.success).length,
    falhas: rows.filter((r) => !r.success).length,
  });
  return {
    cliente_id: opts.cliente_id,
    meta: { resumo: summarize(meta ?? []), eventos: meta ?? [] },
    google: { resumo: summarize(google ?? []), eventos: google ?? [] },
  };
}

async function loadIntegracoes(supabase: SupabaseClient, clienteId: string) {
  const [
    { data: cliente, error: cErr },
    { data: metaAcc },
    { data: googleAcc },
    { data: social },
    { data: wa },
    { data: drive },
    { data: links },
    googleData,
  ] = await Promise.all([
    supabase
      .from('clientes')
      .select('id, empresa, meta_rastreamento, meta_ctwa_business_id, meta_ctwa_token_updated_at')
      .eq('id', clienteId)
      .maybeSingle(),
    supabase
      .from('cliente_meta_accounts')
      .select('id, meta_account_id, meta_account_name, is_active, notes, created_at')
      .eq('cliente_id', clienteId),
    supabase
      .from('cliente_google_ads_accounts')
.select(
          'id, google_customer_id, google_customer_name, is_active, conversions_enabled, conv_action_lead, conv_action_qualified, conv_action_purchase, created_at'
        )
      .eq('cliente_id', clienteId),
    supabase
      .from('cliente_social_accounts')
      .select('id, platform, meta_id, display_name, username, page_id, is_active, created_at')
      .eq('cliente_id', clienteId),
    supabase
      .from('cliente_whatsapp_config')
      .select('id, provider, subdomain, instance_status, created_at, updated_at')
      .eq('cliente_id', clienteId),
    supabase
      .from('cliente_google_drive_connection')
      .select('favorite_folder_id, favorite_folder_name, updated_at')
      .eq('cliente_id', clienteId)
      .maybeSingle(),
    supabase
      .from('cliente_rastreamento_links')
      .select('id, slug, label, default_origin, is_default, is_active')
      .eq('cliente_id', clienteId),
    loadGoogleData(supabase, clienteId),
  ]);
  if (cErr) throw new Error(cErr.message);
  if (!cliente) throw new Error('Cliente não encontrado.');
  const rec = cliente as Record<string, unknown>;
  return {
    cliente_id: clienteId,
    empresa: rec.empresa ?? null,
    meta: {
      conexao: sanitizeMetaConnection(rec.meta_rastreamento),
      business_id: rec.meta_ctwa_business_id ?? null,
      token_atualizado_em: rec.meta_ctwa_token_updated_at ?? null,
      contas_anuncio: metaAcc ?? [],
    },
    google_ads: googleAcc ?? [],
    google_dados: googleData,
    redes_sociais: social ?? [],
    whatsapp: wa ?? [],
    google_drive: drive
      ? {
          pasta_favorita_id: (drive as { favorite_folder_id?: string }).favorite_folder_id ?? null,
          pasta_favorita_nome: (drive as { favorite_folder_name?: string }).favorite_folder_name ?? null,
          atualizado_em: (drive as { updated_at?: string }).updated_at ?? null,
        }
      : null,
    links_rastreaveis: links ?? [],
  };
}

async function readAba(
  supabase: SupabaseClient,
  actor: McpActorLike | undefined,
  args: {
    modulo: string;
    aba: string;
    cliente_id?: string;
    semana?: string;
    mes?: string;
    limite?: number;
    telefone?: string;
    cursor?: string;
    atualizar?: boolean;
    inicio?: string;
    fim?: string;
    busca?: string;
    offset?: number;
    qualificado?: boolean;
    comprou?: boolean;
    linha?: string;
  }
) {
  const periodo = periodFrom(args);
  const tab = findHubTab(args.modulo, args.aba) || {
    modulo: args.modulo,
    aba: args.aba,
    label: args.aba,
    path: `/${args.modulo}`,
    description: '',
    area: 'equipe' as const,
    roles: ['superadmin', 'admin', 'colaborador'],
    precisa_cliente: false,
  };
  const accessOrErr = await requireModule(supabase, actor, tab.modulo);
  if ('error' in accessOrErr) throw new Error(accessOrErr.error);
  const access = accessOrErr;
  const role = access.role || 'colaborador';
  if (tab.roles && !tab.roles.includes(role) && access.role !== 'superadmin') {
    throw new Error(`A aba ${tab.label} não está disponível para o papel ${role}.`);
  }
  if (tab.precisa_cliente && !args.cliente_id) {
    return {
      aba: { ...tab, url: pageUrl(tab.path) },
      precisa_cliente: true,
      mensagem: 'Informe cliente_id para ler os dados desta aba.',
    };
  }

  const limite = args.limite ?? 80;
  const modulo = tab.modulo;
  const aba = tab.aba;

  if (modulo === 'paid_traffic' && aba === 'hoje') {
    return { aba: { ...tab, url: pageUrl(tab.path) }, dados: await loadHoje(supabase, access) };
  }
  if (modulo === 'paid_traffic' && (aba === 'rotina' || aba === 'rotina-gestor')) {
    return {
      aba: { ...tab, url: pageUrl(tab.path) },
      dados: await loadRotina(supabase, access, {
        cliente_id: args.cliente_id,
        semana: args.semana,
        limite,
      }),
    };
  }
  if (modulo === 'paid_traffic' && aba === 'relatorio') {
    if (!args.cliente_id) {
      return {
        aba: { ...tab, url: pageUrl(tab.path) },
        precisa_cliente: true,
        mensagem: 'Informe cliente_id (e opcionalmente mes YYYY-MM) para ler o Relatório.',
      };
    }
    return {
      aba: { ...tab, url: pageUrl(tab.path) },
      dados: await loadRelatorio(supabase, access, {
        cliente_id: args.cliente_id,
        mes: args.mes,
        atualizar: args.atualizar,
      }),
    };
  }
  if (modulo === 'paid_traffic' && aba === 'situacao') {
    const carteira = await gestorCarteiraIds(supabase, access);
    let q = supabase
      .from('traffic_client_ops')
      .select('client_id, primary_assignee_id, situation, situation_reason, resume_at');
    if (args.cliente_id) q = q.eq('client_id', args.cliente_id);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = (data ?? []).filter((r) => {
      const id = String((r as { client_id?: string }).client_id || '');
      return !carteira || carteira.has(id);
    });
    const empresas = await empresaMap(
      supabase,
      rows.map((r) => String((r as { client_id?: string }).client_id || ''))
    );
    return {
      aba: { ...tab, url: pageUrl(tab.path) },
      dados: {
        contas: rows.map((r) => {
          const rec = r as { client_id: string };
          return { ...rec, empresa: empresas.get(rec.client_id) ?? null };
        }),
      },
    };
  }
  if (modulo === 'paid_traffic' && aba === 'dashboard') {
    const hoje = await loadHoje(supabase, access);
    let clientes = hoje.clientes.map((c) => ({
      id: c.id,
      empresa: c.empresa,
      limite_meta: c.limite_meta,
      objetivo_meta: c.objetivo_meta,
      contas_meta: c.contas_meta,
      contas_google: c.contas_google,
      meta: c.meta,
      ops: c.ops,
    }));
    if (args.cliente_id) {
      const alvo = clientes.find((c) => c.id === args.cliente_id);
      const aoVivo = await consultMeta(supabase, args.cliente_id, {
        since: periodo.since,
        until: periodo.until,
        atualizar: args.atualizar,
        salvo: alvo?.meta,
      });
      clientes = clientes.map((c) => (c.id === args.cliente_id ? { ...c, meta_ao_vivo: aoVivo } : c));
    }
    return {
      aba: { ...tab, url: pageUrl(tab.path) },
      dados: {
        hoje: hoje.hoje,
        total_carteira: hoje.total,
        clientes,
      },
    };
  }
  if (modulo === 'paid_traffic' && aba === 'fila') {
    let q = supabase
      .from('tarefas')
      .select('id, title, status, client_id, due_date, type, priority, assignee_ids, created_at')
      .eq('type', 'paid_traffic')
      .order('due_date', { ascending: true })
      .limit(limite);
    if (args.cliente_id) q = q.eq('client_id', args.cliente_id);
    const { data, error } = await q;
    if (error) {
      const fallback = await supabase
        .from('tarefas')
        .select('id, title, status, client_id, due_date, type, assignee_ids, created_at')
        .order('due_date', { ascending: true })
        .limit(limite);
      if (fallback.error) throw new Error(fallback.error.message);
      const empresas = await empresaMap(
        supabase,
        (fallback.data ?? []).map((t) => String((t as { client_id?: string }).client_id || ''))
      );
      return {
        aba: { ...tab, url: pageUrl(tab.path) },
        dados: {
          aviso: 'Filtro por tipo de tráfego indisponível; lista geral limitada.',
          tarefas: (fallback.data ?? []).map((t) => {
            const rec = t as { client_id?: string };
            return { ...rec, empresa: rec.client_id ? empresas.get(rec.client_id) ?? null : null };
          }),
        },
      };
    }
    const empresas = await empresaMap(
      supabase,
      (data ?? []).map((t) => String((t as { client_id?: string }).client_id || ''))
    );
    const taskIds = (data ?? []).map((t) => String((t as { id?: string }).id || '')).filter(Boolean);
    let details: Record<string, unknown>[] = [];
    if (taskIds.length) {
      const det = await supabase
        .from('traffic_task_details')
        .select('task_id, demand_type, completion_summary, next_action_none')
        .in('task_id', taskIds);
      if (!det.error) details = (det.data ?? []) as Record<string, unknown>[];
    }
    const detailByTask = new Map(details.map((d) => [String(d.task_id), d]));
    const estrutura = args.cliente_id
      ? await consultPainel(supabase, args.cliente_id, {
          since: periodo.since,
          until: periodo.until,
          atualizar: args.atualizar,
          linha: args.linha || args.busca,
        })
      : null;
    return {
      aba: { ...tab, url: pageUrl(tab.path) },
      dados: {
        aviso: args.cliente_id
          ? 'Campanha, conjunto e anúncio vêm da Meta neste período. Tarefas são as demandas abertas do cliente.'
          : 'Informe cliente_id para campanha, conjunto e anúncio. Sem cliente, só as demandas.',
        estrutura,
        tarefas: (data ?? []).map((t) => {
          const rec = t as { id?: string; client_id?: string };
          return {
            ...rec,
            empresa: rec.client_id ? empresas.get(rec.client_id) ?? null : null,
            demanda: rec.id ? detailByTask.get(rec.id) ?? null : null,
          };
        }),
      },
    };
  }
  if (modulo === 'paid_traffic' && aba === 'campaigns') {
    let q = supabase
      .from('paid_campaigns')
      .select('id, name, status, client_id, budget, description, kpis, ad_sets, assignee_id, created_at')
      .order('created_at', { ascending: false })
      .limit(limite);
    if (args.cliente_id) q = q.eq('client_id', args.cliente_id);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { aba: { ...tab, url: pageUrl(tab.path) }, dados: { campanhas: data ?? [] } };
  }
  if (modulo === 'paid_traffic' && (aba === 'meta-insights' || aba === 'google-insights')) {
    if (!args.cliente_id) {
      const table =
        aba === 'google-insights' ? 'cliente_google_ads_accounts' : 'cliente_meta_accounts';
      const { data, error } = await supabase.from(table).select('*').eq('is_active', true).limit(200);
      if (error) throw new Error(error.message);
      return {
        aba: { ...tab, url: pageUrl(tab.path) },
        dados: {
          aviso: 'Métricas ao vivo ficam na tela; aqui estão as contas vinculadas. Passe cliente_id para filtrar.',
          contas: data ?? [],
        },
      };
    }
    if (aba === 'google-insights') {
      const { data, error } = await supabase
        .from('cliente_google_ads_accounts')
        .select(
          'id, google_customer_id, google_customer_name, is_active, conversions_enabled, conv_action_lead, conv_action_qualified, conv_action_purchase'
        )
        .eq('cliente_id', args.cliente_id);
      if (error) throw new Error(error.message);
      const googleDados = await loadGoogleData(supabase, args.cliente_id);
      return {
        aba: { ...tab, url: pageUrl(tab.path) },
        dados: {
          contas: data ?? [],
          google_dados: googleDados,
          ao_vivo: await consultGoogle(supabase, args.cliente_id, {
            since: periodo.since,
            until: periodo.until,
            atualizar: args.atualizar,
          }),
        },
      };
    }
    const { data, error } = await supabase
      .from('cliente_meta_accounts')
      .select('id, meta_account_id, meta_account_name, is_active, notes')
      .eq('cliente_id', args.cliente_id);
    if (error) throw new Error(error.message);
    return {
      aba: { ...tab, url: pageUrl(tab.path) },
      dados: {
        contas: data ?? [],
        ao_vivo: await consultMeta(supabase, args.cliente_id, {
          since: periodo.since,
          until: periodo.until,
          atualizar: args.atualizar,
        }),
      },
    };
  }

  if (modulo === 'social_media' && aba === 'overview') {
    const { data, error } = await supabase
      .from('cliente_social_accounts')
      .select('id, cliente_id, platform, meta_id, display_name, username, page_id, is_active, created_at')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(limite);
    if (error) throw new Error(error.message);
    let rows = data ?? [];
    if (args.cliente_id) {
      rows = rows.filter((r) => String((r as { cliente_id?: string }).cliente_id) === args.cliente_id);
    }
    const empresas = await empresaMap(
      supabase,
      rows.map((r) => String((r as { cliente_id?: string }).cliente_id || ''))
    );
    return {
      aba: { ...tab, url: pageUrl(tab.path) },
      dados: {
        contas: rows.map((r) => {
          const rec = r as { cliente_id: string };
          return { ...rec, empresa: empresas.get(rec.cliente_id) ?? null };
        }),
      },
    };
  }
  if (modulo === 'social_media') {
    const statuses = publicationTabFilter(aba);
    const pubs = await loadPublicacoes(supabase, {
      cliente_id: args.cliente_id,
      limite,
    });
    const filtered = statuses
      ? pubs.filter((p) => statuses.includes(String(p.status || '')))
      : pubs;
    return {
      aba: { ...tab, url: pageUrl(tab.path) },
      dados: { total: filtered.length, publicacoes: filtered },
    };
  }

  if (modulo === 'rastreamento' && aba === 'leads') {
    const leads = await loadLeads(supabase, {
      cliente_id: args.cliente_id!,
      limite: args.limite ?? 50,
      offset: args.offset,
      busca: args.busca,
      telefone: args.telefone,
      inicio: args.inicio,
      fim: args.fim,
      qualificado: args.qualificado,
      comprou: args.comprou,
    });
    const unico =
      !args.telefone && leads.contatos.length === 1
        ? String((leads.contatos[0] as { phone?: unknown }).phone || '')
        : '';
    const mensagens = await consultMensagens(supabase, {
      clienteId: args.cliente_id!,
      telefone: args.telefone || unico || undefined,
      limite, cursor: args.cursor, actor,
      inicio: args.inicio || (args.mes ? periodo.since : undefined),
      fim: args.fim || (args.mes ? periodo.until : undefined),
    });
    return {
      aba: { ...tab, url: pageUrl(tab.path) },
      dados: { ...leads, mensagens },
    };
  }
  if (modulo === 'rastreamento' && aba === 'eventos') {
    return {
      aba: { ...tab, url: pageUrl(tab.path) },
      dados: await loadEventos(supabase, {
        cliente_id: args.cliente_id!,
        limite,
        inicio: args.inicio,
        fim: args.fim,
        busca: args.busca,
      }),
    };
  }
  if (modulo === 'rastreamento' && aba === 'links') {
    const { data, error } = await supabase
      .from('cliente_rastreamento_links')
      .select(
        'id, slug, label, destination_phone, default_origin, is_default, is_active, created_at, whatsapp_config_id'
      )
      .eq('cliente_id', args.cliente_id!);
    if (error) throw new Error(error.message);
    const ids = (data ?? []).map((r) => String((r as { id?: string }).id || '')).filter(Boolean);
    let clicks: { link_id?: string }[] = [];
    if (ids.length) {
      const { data: clickRows } = await supabase
        .from('cliente_rastreamento_link_clicks')
        .select('id, link_id, created_at, match_code')
        .in('link_id', ids)
        .order('created_at', { ascending: false })
        .limit(limite);
      clicks = (clickRows ?? []) as { link_id?: string }[];
    }
    return {
      aba: { ...tab, url: pageUrl(tab.path) },
      dados: {
        links: (data ?? []).map((link) => {
          const rec = link as { id: string; slug?: string };
          return {
            ...rec,
            url_publica: `https://planeje.jbapex.com.br/r/${rec.slug || ''}`,
            cliques: clicks.filter((c) => c.link_id === rec.id).length,
          };
        }),
      },
    };
  }
  if (modulo === 'rastreamento' && aba === 'integracoes') {
    return {
      aba: { ...tab, url: pageUrl(tab.path) },
      dados: await loadIntegracoes(supabase, args.cliente_id!),
    };
  }
  if (modulo === 'rastreamento' && aba === 'configuracoes') {
    const { data, error } = await supabase
      .from('rastreamento_conversion_rules')
      .select('id, name, trigger_type, trigger_value, match_mode, event_name, active, created_at')
      .eq('cliente_id', args.cliente_id!);
    if (error) throw new Error(error.message);
    return { aba: { ...tab, url: pageUrl(tab.path) }, dados: { gatilhos: data ?? [] } };
  }
  if (modulo === 'rastreamento' && (aba === 'visao' || aba === 'relatorio' || aba === 'funil')) {
    const [resumo, eventos, integ] = await Promise.all([
      countLeadsResumo(supabase, args.cliente_id!, periodo),
      loadEventos(supabase, {
        cliente_id: args.cliente_id!,
        limite: 300,
        inicio: periodo.since,
        fim: periodo.until,
      }),
      loadIntegracoes(supabase, args.cliente_id!),
    ]);
    return {
      aba: { ...tab, url: pageUrl(tab.path) },
      dados: {
        integracoes: {
          meta: integ.meta.conexao,
          google_ads: integ.google_ads,
          google_dados: integ.google_dados,
          redes_sociais: integ.redes_sociais,
        },
        leads_resumo: resumo,
        eventos: {
          periodo: { inicio: periodo.since, fim: periodo.until },
          meta: eventos.meta.resumo,
          google: eventos.google.resumo,
        },
        meta: await consultMeta(supabase, args.cliente_id!, {
          since: periodo.since,
          until: periodo.until,
          atualizar: args.atualizar,
        }),
        mensagens: await consultMensagens(supabase, {
          clienteId: args.cliente_id!,
          telefone: args.telefone,
          limite, cursor: args.cursor, actor,
          inicio: args.inicio || (args.mes ? periodo.since : undefined),
          fim: args.fim || (args.mes ? periodo.until : undefined),
        }),
      },
    };
  }

  if (modulo === 'caixa') {
    let query = supabase
      .from('pendencias_caixa')
      .select('id, origem, pessoa_id, estado, created_at, last_activity_at')
      .order('last_activity_at', { ascending: false })
      .limit(limite);
    if (!access.is_admin) query = query.eq('pessoa_id', access.user_id);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { aba: { ...tab, url: pageUrl(tab.path) }, dados: { pendencias: data ?? [] } };
  }
  if (modulo === 'atendimento') {
    let query = supabase
      .from('atendimento_conversas')
      .select('id, cliente_id, display_name, status, last_message_at, last_message_preview, unread_count')
      .is('archived_at', null)
      .order('last_message_at', { ascending: false })
      .limit(limite);
    if (args.cliente_id) query = query.eq('cliente_id', args.cliente_id);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { aba: { ...tab, url: pageUrl(tab.path) }, dados: { conversas: data ?? [] } };
  }
  if (modulo === 'clients') {
    if (args.cliente_id && (aba === 'resumo' || aba === 'lista' || aba === 'ficha')) {
      return {
        aba: { ...tab, url: pageUrl(`/clients/${args.cliente_id}?aba=resumo`) },
        dados: await loadClienteDossie(supabase, args.cliente_id, { mes: args.mes, limite }, access),
      };
    }
    if (aba === 'escopo' && args.cliente_id) {
      const dossie = await loadClienteDossie(supabase, args.cliente_id, { mes: args.mes, limite }, access);
      return {
        aba: { ...tab, url: pageUrl(`/clients/${args.cliente_id}?aba=escopo`) },
        dados: { cadastro: dossie.cadastro, cobertura: dossie.cobertura, mes: dossie.mes },
      };
    }
    if (aba === 'reunioes') {
      return {
        aba: { ...tab, url: pageUrl(tab.path) },
        dados: await loadReunioes(supabase, { cliente_id: args.cliente_id, limite }),
      };
    }
    if (aba === 'entregas') {
      return {
        aba: { ...tab, url: pageUrl(tab.path) },
        dados: await loadTarefasPagina(supabase, { cliente_id: args.cliente_id, limite, busca: args.busca }),
      };
    }
    if (aba === 'projetos') {
      return {
        aba: { ...tab, url: pageUrl(tab.path) },
        dados: await loadProjetos(supabase, { cliente_id: args.cliente_id, mes: args.mes, limite }),
      };
    }
    return {
      aba: { ...tab, url: pageUrl(tab.path) },
      dados: await loadClientesLista(supabase, {
        cliente_id: args.cliente_id,
        limite,
        busca: args.busca,
      }),
    };
  }
  if (modulo === 'projects') {
    if (aba === 'pendentes') {
      return {
        aba: { ...tab, url: pageUrl(tab.path) },
        dados: await loadProjetosPendentes(supabase, { mes: args.mes, limite }),
      };
    }
    return {
      aba: { ...tab, url: pageUrl(tab.path) },
      dados: await loadProjetos(supabase, { cliente_id: args.cliente_id, mes: args.mes, limite }),
    };
  }
  if (modulo === 'tasks') {
    return {
      aba: { ...tab, url: pageUrl(tab.path) },
      dados: await loadTarefasPagina(supabase, {
        cliente_id: args.cliente_id,
        atrasadas: aba === 'atrasadas',
        concluidas: aba === 'concluidas',
        limite,
        busca: args.busca,
      }),
    };
  }
  if (modulo === 'reports') {
    return {
      aba: { ...tab, url: pageUrl(tab.path) },
      dados: await loadIndicadores(supabase, { mes: args.mes }, access),
    };
  }
  if (modulo === 'onboarding') {
    return {
      aba: { ...tab, url: pageUrl(tab.path) },
      dados: await loadOnboarding(supabase, { cliente_id: args.cliente_id, limite }),
    };
  }
  if (modulo === 'cobertura') {
    return {
      aba: { ...tab, url: pageUrl(tab.path) },
      dados: await loadCoberturaMes(supabase, { mes: args.mes, cliente_id: args.cliente_id }),
    };
  }
  if (modulo === 'mini_crm') {
    return {
      aba: { ...tab, url: pageUrl(tab.path) },
      dados: await loadMiniCrm(supabase, {
        cliente_id: args.cliente_id,
        limite,
        busca: args.busca,
      }),
    };
  }
  if (modulo === 'dashboard') {
    return {
      aba: { ...tab, url: pageUrl(tab.path) },
      dados: await loadDashboardResumo(supabase, access),
    };
  }
  if (modulo === 'requests') {
    return {
      aba: { ...tab, url: pageUrl(tab.path) },
      dados: await loadSolicitacoes(supabase, { cliente_id: args.cliente_id, limite }),
    };
  }
  if (modulo === 'assistant') {
    return {
      aba: { ...tab, url: pageUrl(tab.path) },
      dados: await loadAssistente(supabase, { cliente_id: args.cliente_id, limite }),
    };
  }
  if (modulo === 'automacoes') {
    return {
      aba: { ...tab, url: pageUrl(tab.path) },
      dados: await loadAutomacoes(supabase),
    };
  }
  if (modulo === 'crm') {
    let q = supabase
      .from('leads')
      .select('id, nome, whatsapp, origem, status, valor, qualificado, comprou, cliente_id, created_at')
      .order('updated_at', { ascending: false })
      .limit(limite);
    if (args.cliente_id) q = q.eq('cliente_id', args.cliente_id);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { aba: { ...tab, url: pageUrl(tab.path) }, dados: { leads: data ?? [] } };
  }
  if (modulo === 'settings') {
    return {
      aba: { ...tab, url: pageUrl(tab.path) },
      dados: {
        aviso:
          'Configurações de agência (Meta/Drive/Google Ads/Google dados) não devolvem Client Secret, tokens nem Vault. Use a tela no app para gravar.',
        autenticado: access.user_id
          ? { user_id: access.user_id, role: access.role }
          : { tipo: access.role },
      },
    };
  }

  return {
    aba: { ...tab, url: pageUrl(tab.path) },
    dados: null,
    mensagem: 'Aba catalogada; ainda sem leitor específico. Use listar_abas e a tool relacionada.',
  };
}

export function registerHubTools(
  mcp: McpServer,
  supabase: SupabaseClient,
  actor?: McpActorLike
): void {
  mcp.registerTool(
    'meus_modulos',
    {
      title: 'Módulos e abas deste usuário',
      description:
        'O que a sessão autenticada pode ver no Planeje (papel, módulos ligados e abas). Use antes de ler tráfego, redes ou rastreamento.',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const access = await loadModuleAccess(supabase, actor);
        if (!access.is_team) {
          return toolError('Esta sessão não é da equipe interna.');
        }
        const papel = access.role || 'colaborador';
        const abas = filterHubTabs({ papel }).filter((t) => moduleOk(access, t.modulo));
        return jsonText({
          user_id: access.user_id,
          role: papel,
          admin: access.is_admin,
          modulos: HUB_MODULES.map((m) => ({
            ...m,
            habilitado: moduleOk(access, m.name),
          })),
          abas,
        });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'listar_abas',
    {
      title: 'Listar abas do Planeje',
      description:
        'Catálogo de abas: Clientes, Projetos, Tarefas, Relatórios, Onboarding, Cobertura, Mini CRM, Início, Solicitações, Assistente, Tráfego, Redes, Rastreamento e Configurações. Filtros: modulo, busca, papel.',
      inputSchema: z.object({
        modulo: z.string().optional(),
        busca: z.string().optional(),
        papel: z.string().optional(),
      }),
    },
    async (args) => {
      const abas = filterHubTabs(args);
      return jsonText({ total: abas.length, base_url: pageUrl('/'), abas });
    }
  );

  mcp.registerTool(
    'ler_aba',
    {
      title: 'Ler uma aba do Planeje',
      description:
        'Lê a aba de verdade: ficha do cliente (resumo/escopo/reuniões/entregas/projetos), Projetos, Tarefas, Indicadores, Onboarding, Cobertura, Mini CRM, Início, Solicitações, Assistente, Automações, Hoje, Rotina, Relatório, Painel, Insights, Google e Rastreamento. Passe modulo + aba. cliente_id nas abas do cliente (obrigatório na ficha e no Mini CRM). mes YYYY-MM. busca filtra nome/título. Não devolve tokens.',
      inputSchema: z.object({
        modulo: z.string().min(1),
        aba: z.string().min(1),
        cliente_id: z.string().uuid().optional(),
        semana: z.string().optional().describe('YYYY-MM-DD (segunda) para a Rotina'),
        mes: z.string().optional().describe('YYYY-MM'),
        telefone: z.string().optional().describe('Telefone do lead para ler a conversa no Rastreamento'),
        cursor: z.string().max(12000).optional().describe('Continuação das mensagens; prefira a ferramenta e argumentos devolvidos em continuacao.'),
        atualizar: z.boolean().optional().describe('Busca de novo na Meta/Google mesmo com resumo recente'),
        limite: z.number().int().positive().max(200).optional(),
        ...FILTROS_LINHA,
      }),
    },
    async (args) => {
      try {
        const dados = await readAba(supabase, actor, args);
        return jsonText(dados);
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'ver_cliente',
    {
      title: 'Ver dossiê do cliente',
      description:
        'Tudo da ficha: cadastro (sem tokens), etiquetas, tipo de serviço, projetos, tarefas abertas, Mini CRM, reuniões, onboarding, cobertura do mês e solicitações. Obrigatório: cliente_id. Opcional: mes YYYY-MM.',
      inputSchema: z.object({
        cliente_id: z.string().uuid(),
        mes: z.string().optional().describe('YYYY-MM'),
        limite: z.number().int().positive().max(200).optional(),
      }),
    },
    async ({ cliente_id, mes, limite }) => {
      try {
        const access = await requireModule(supabase, actor, 'clients');
        if ('error' in access) return toolError(access.error);
        return jsonText(await loadClienteDossie(supabase, cliente_id, { mes, limite }, access));
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'listar_projetos',
    {
      title: 'Listar projetos',
      description: 'Projetos da agência. Filtros: cliente_id, mes YYYY-MM, status. Use ver_cliente para o dossiê junto com tarefas.',
      inputSchema: z.object({
        cliente_id: z.string().uuid().optional(),
        mes: z.string().optional().describe('YYYY-MM'),
        status: z.string().optional(),
        limite: z.number().int().positive().max(500).optional(),
      }),
    },
    async ({ cliente_id, mes, status, limite }) => {
      try {
        const access = await requireModule(supabase, actor, 'projects');
        if ('error' in access) return toolError(access.error);
        return jsonText(await loadProjetos(supabase, { cliente_id, mes, status, limite }));
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'listar_publicacoes_sociais',
    {
      title: 'Listar publicações de Redes Sociais',
      description:
        'Publicações por canal: A publicar, agendados, publicados, falhou. Inclui barra de envio (phase/percent/atraso). Filtros: cliente_id, status (pending|scheduled|published|failed|cancelled).',
      inputSchema: z.object({
        cliente_id: z.string().uuid().optional(),
        status: z.enum(['pending', 'scheduled', 'published', 'failed', 'cancelled']).optional(),
        limite: z.number().int().positive().max(200).optional(),
      }),
    },
    async (args) => {
      try {
        const access = await requireModule(supabase, actor, 'social_media');
        if ('error' in access) return toolError(access.error);
        const publicacoes = await loadPublicacoes(supabase, args);
        return jsonText({ total: publicacoes.length, publicacoes });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'listar_contas_sociais',
    {
      title: 'Listar contas Instagram/Facebook ligadas',
      description: 'cliente_social_accounts ativas (sem token). Filtro opcional por cliente_id.',
      inputSchema: z.object({
        cliente_id: z.string().uuid().optional(),
        incluir_inativas: z.boolean().optional(),
      }),
    },
    async ({ cliente_id, incluir_inativas }) => {
      try {
        const access = await requireModule(supabase, actor, 'social_media');
        if ('error' in access) return toolError(access.error);
        let q = supabase
          .from('cliente_social_accounts')
          .select(
            'id, cliente_id, platform, meta_id, display_name, username, page_id, is_active, created_at'
          )
          .order('created_at', { ascending: false });
        if (cliente_id) q = q.eq('cliente_id', cliente_id);
        if (!incluir_inativas) q = q.eq('is_active', true);
        const { data, error } = await q.limit(300);
        if (error) throw new Error(error.message);
        const empresas = await empresaMap(
          supabase,
          (data ?? []).map((r) => String((r as { cliente_id?: string }).cliente_id || ''))
        );
        return jsonText({
          total: data?.length ?? 0,
          contas: (data ?? []).map((r) => {
            const rec = r as { cliente_id: string };
            return { ...rec, empresa: empresas.get(rec.cliente_id) ?? null };
          }),
        });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'ver_rotina_semanal',
    {
      title: 'Ver Rotina semanal de tráfego',
      description:
        'Clientes da rotina, KPI/colunas (orçamentos, lead qualificado), revisões da semana e quando foi preenchido. Opcional: cliente_id, semana (segunda YYYY-MM-DD).',
      inputSchema: z.object({
        cliente_id: z.string().uuid().optional(),
        semana: z.string().optional(),
        limite: z.number().int().positive().max(200).optional(),
      }),
    },
    async (args) => {
      try {
        const access = await requireModule(supabase, actor, 'paid_traffic');
        if ('error' in access) return toolError(access.error);
        return jsonText(await loadRotina(supabase, access, args));
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'ver_revisao_semanal',
    {
      title: 'Ver uma revisão/otimização da Rotina',
      description:
        'Uma linha da Rotina (análise ou otimização) com campaign_metrics, texto, data do preenchimento e alterações. Passe id ou cliente_id + semana + kind.',
      inputSchema: z.object({
        id: z.string().uuid().optional(),
        cliente_id: z.string().uuid().optional(),
        semana: z.string().optional(),
        kind: z.enum(['review', 'optimization']).optional(),
      }),
    },
    async (args) => {
      try {
        const access = await requireModule(supabase, actor, 'paid_traffic');
        if ('error' in access) return toolError(access.error);
        let q = supabase.from('traffic_weekly_reviews').select('*');
        if (args.id) q = q.eq('id', args.id);
        else {
          if (!args.cliente_id || !args.semana) {
            throw new Error('Informe id, ou cliente_id + semana.');
          }
          q = q.eq('client_id', args.cliente_id).eq('week_start', args.semana);
          if (args.kind) q = q.eq('kind', args.kind);
        }
        const { data, error } = await q.limit(4);
        if (error) throw new Error(error.message);
        if (!data?.length) return jsonText({ encontrada: false });
        const empresas = await empresaMap(
          supabase,
          data.map((r) => String((r as { client_id?: string }).client_id || ''))
        );
        const fills = await loadFillHistory(
          supabase,
          data.map((r) => String((r as { id?: string }).id || '')).filter(Boolean)
        );
        return jsonText({
          revisoes: data.map((r) => {
            const rec = r as { id: string; client_id: string; result_label?: string };
            return {
              ...rec,
              empresa: empresas.get(rec.client_id) ?? null,
              resultado: reportResultLabel(String(rec.result_label || '')),
              preenchimento: fills.get(rec.id) ?? null,
            };
          }),
        });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'ver_hoje_trafego',
    {
      title: 'Ver aba Hoje do tráfego',
      description:
        'Carteira do gestor com rotina da semana, contas Meta/Google e tarefas de análise/otimização. Colaborador vê só a carteira dele.',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const access = await requireModule(supabase, actor, 'paid_traffic');
        if ('error' in access) return toolError(access.error);
        return jsonText(await loadHoje(supabase, access));
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'listar_leads_rastreamento',
    {
      title: 'Listar leads do Rastreamento',
      description:
        'Contatos WhatsApp rastreados e leads do CRM do cliente (UTM/gclid/ctwa resumidos, Mini CRM, qualificado, comprou). Traz o total e pagina com offset. Ache um lead por busca (nome, telefone, campanha, origem) ou telefone; filtre por inicio/fim (entrada), qualificado ou comprou. Obrigatório: cliente_id.',
      inputSchema: z.object({
        cliente_id: z.string().uuid(),
        limite: z.number().int().positive().max(200).optional(),
        telefone: z.string().optional(),
        inicio: FILTROS_LINHA.inicio,
        fim: FILTROS_LINHA.fim,
        busca: FILTROS_LINHA.busca,
        offset: FILTROS_LINHA.offset,
        qualificado: FILTROS_LINHA.qualificado,
        comprou: FILTROS_LINHA.comprou,
      }),
    },
    async (args) => {
      try {
        const access = await requireModule(supabase, actor, 'rastreamento');
        if ('error' in access) return toolError(access.error);
        return jsonText(await loadLeads(supabase, args));
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'listar_eventos_rastreamento',
    {
      title: 'Listar eventos CAPI e Google Ads',
      description:
        'Logs de Meta (meta_conversion_event_log) e Google (google_conversion_event_log) do cliente. Filtre por inicio/fim e pelo nome do evento em busca (ex.: Purchase, QualifiedLead). Sem payload bruto da API.',
      inputSchema: z.object({
        cliente_id: z.string().uuid(),
        limite: z.number().int().positive().max(300).optional(),
        inicio: FILTROS_LINHA.inicio,
        fim: FILTROS_LINHA.fim,
        busca: FILTROS_LINHA.busca,
      }),
    },
    async (args) => {
      try {
        const access = await requireModule(supabase, actor, 'rastreamento');
        if ('error' in access) return toolError(access.error);
        return jsonText(await loadEventos(supabase, args));
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'listar_links_rastreaveis',
    {
      title: 'Listar links rastreáveis',
      description: 'Links /r/:slug do cliente (WhatsApp, origem, cliques recentes). Obrigatório: cliente_id.',
      inputSchema: z.object({
        cliente_id: z.string().uuid(),
        limite: z.number().int().positive().max(200).optional(),
      }),
    },
    async ({ cliente_id, limite }) => {
      try {
        const access = await requireModule(supabase, actor, 'rastreamento');
        if ('error' in access) return toolError(access.error);
        const dados = await readAba(supabase, actor, {
          modulo: 'rastreamento',
          aba: 'links',
          cliente_id,
          limite,
        });
        return jsonText(dados);
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'ver_integracoes_cliente',
    {
      title: 'Ver integrações do cliente',
      description:
        'Status Meta (BM/Pixel/Página/contas), Google Ads (conversões), Analytics/Meu Negócio/GTM, Instagram/Facebook, WhatsApp e Drive. Sem tokens nem Client Secret.',
      inputSchema: z.object({
        cliente_id: z.string().uuid(),
      }),
    },
    async ({ cliente_id }) => {
      try {
        const access = await requireModule(supabase, actor, 'rastreamento');
        if ('error' in access) return toolError(access.error);
        return jsonText(await loadIntegracoes(supabase, cliente_id));
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'listar_contas_google_ads',
    {
      title: 'Listar contas Google Ads vinculadas',
      description:
        'cliente_google_ads_accounts ativas (customer_id, nome, conversões ligadas). Filtro opcional por cliente_id.',
      inputSchema: z.object({
        cliente_id: z.string().uuid().optional(),
        incluir_inativas: z.boolean().optional(),
      }),
    },
    async ({ cliente_id, incluir_inativas }) => {
      try {
        const access = await requireModule(supabase, actor, 'paid_traffic');
        if ('error' in access) return toolError(access.error);
        let q = supabase
          .from('cliente_google_ads_accounts')
.select(
          'id, cliente_id, google_customer_id, google_customer_name, is_active, conversions_enabled, conv_action_lead, conv_action_qualified, conv_action_purchase, created_at'
        );
        if (cliente_id) q = q.eq('cliente_id', cliente_id);
        if (!incluir_inativas) q = q.eq('is_active', true);
        const { data, error } = await q.order('created_at', { ascending: true });
        if (error) throw new Error(error.message);
        const empresas = await empresaMap(
          supabase,
          (data ?? []).map((r) => String((r as { cliente_id?: string }).cliente_id || ''))
        );
        return jsonText({
          total: data?.length ?? 0,
          contas: (data ?? []).map((r) => {
            const rec = r as { cliente_id: string };
            return { ...rec, empresa: empresas.get(rec.cliente_id) ?? null };
          }),
        });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'ver_relatorio_trafego',
    {
      title: 'Ver Relatório de tráfego do mês',
      description:
        'Relatório do mês: Rotina, vendas e números da Meta. Se o resumo salvo estiver velho, busca de novo. Obrigatório: cliente_id. Opcional: mes (YYYY-MM) e atualizar.',
      inputSchema: z.object({
        cliente_id: z.string().uuid(),
        mes: z.string().optional(),
        atualizar: z.boolean().optional(),
      }),
    },
    async (args) => {
      try {
        const access = await requireModule(supabase, actor, 'paid_traffic');
        if ('error' in access) return toolError(access.error);
        return jsonText(await loadRelatorio(supabase, access, args));
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'listar_google_dados',
    {
      title: 'Listar Analytics, Meu Negócio e Tag Manager',
      description:
        'Propriedades GA4, locais do Meu Negócio e containers GTM já vinculados ao cliente. Sem tokens. Filtro opcional: cliente_id.',
      inputSchema: z.object({
        cliente_id: z.string().uuid().optional(),
      }),
    },
    async ({ cliente_id }) => {
      try {
        const access = await requireModule(supabase, actor, 'rastreamento');
        if ('error' in access) {
          const traffic = await requireModule(supabase, actor, 'paid_traffic');
          if ('error' in traffic) return toolError(access.error);
        }
        const vinculos = await loadGoogleData(supabase, cliente_id);
        if (!cliente_id) return jsonText(vinculos);
        const range = monthRange();
        const ao_vivo = await consultGoogle(supabase, cliente_id, {
          since: range.since,
          until: range.until,
        });
        return jsonText({ ...vinculos, ao_vivo });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'consultar_trafego',
    {
      title: 'Consultar Tráfego pago',
      description:
        'Lê uma aba do Tráfego pago. aba=painel ou fila devolve campanha, conjunto e anúncio da Meta com gasto, resultados, custo por resultado, CTR, CPC, conversas, leads e compras (precisa de cliente_id); linha=id ou nome traz só aquela campanha/conjunto/anúncio sem corte. Também: hoje, rotina, relatorio, dashboard, situacao, campaigns, meta-insights, google-insights. Se o dado não estiver salvo ou estiver velho, busca. mes YYYY-MM ou inicio/fim YYYY-MM-DD. atualizar=true força a busca.',
      inputSchema: z.object({
        aba: z.string().min(1),
        cliente_id: z.string().uuid().optional(),
        semana: z.string().optional(),
        mes: z.string().optional(),
        atualizar: z.boolean().optional(),
        limite: z.number().int().positive().max(200).optional(),
        inicio: FILTROS_LINHA.inicio,
        fim: FILTROS_LINHA.fim,
        linha: FILTROS_LINHA.linha,
      }),
    },
    async (args) => {
      try {
        return jsonText(await readAba(supabase, actor, { modulo: 'paid_traffic', ...args }));
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'ver_painel_trafego',
    {
      title: 'Ver Painel de tráfego (campanha, conjunto, anúncio)',
      description:
        'O mesmo Painel do Tráfego pago: campanhas, conjuntos e anúncios da conta Meta do cliente, com status, orçamento, gasto, impressões, cliques, alcance, resultados, custo por resultado, CTR, CPC, conversas, leads e compras no período. Obrigatório: cliente_id. Opcional: mes YYYY-MM ou inicio/fim YYYY-MM-DD, linha (id ou parte do nome de uma campanha, conjunto ou anúncio, traz a linha inteira) e atualizar=true. Não pausa nem muda orçamento.',
      inputSchema: z.object({
        cliente_id: z.string().uuid(),
        mes: z.string().optional(),
        inicio: FILTROS_LINHA.inicio,
        fim: FILTROS_LINHA.fim,
        linha: FILTROS_LINHA.linha,
        atualizar: z.boolean().optional(),
      }),
    },
    async (args) => {
      try {
        const access = await requireModule(supabase, actor, 'paid_traffic');
        if ('error' in access) return toolError(access.error);
        const range = periodFrom(args);
        return jsonText(
          await consultPainel(supabase, args.cliente_id, {
            since: range.since,
            until: range.until,
            atualizar: args.atualizar,
            linha: args.linha,
          })
        );
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'consultar_rastreamento',
    {
      title: 'Consultar Rastreamento',
      description:
        'Lê uma aba do Rastreamento: visao, leads, relatorio, funil, eventos, links, integracoes, configuracoes. Visão/relatório/funil contam todos os contatos do período (não amostra). Leads traz o total, pagina com offset e acha um lead por busca (nome, telefone, campanha, origem), telefone, qualificado ou comprou. Eventos filtra por nome em busca. Passe telefone para a conversa de um lead. mes YYYY-MM ou inicio/fim YYYY-MM-DD. cliente_id obrigatório.',
      inputSchema: z.object({
        aba: z.string().min(1),
        cliente_id: z.string().uuid(),
        telefone: z.string().optional(),
        cursor: z.string().max(12000).optional().describe('Continuação das mensagens, sem teto total.'),
        mes: z.string().optional(),
        atualizar: z.boolean().optional(),
        limite: z.number().int().positive().max(200).optional(),
        inicio: FILTROS_LINHA.inicio,
        fim: FILTROS_LINHA.fim,
        busca: FILTROS_LINHA.busca,
        offset: FILTROS_LINHA.offset,
        qualificado: FILTROS_LINHA.qualificado,
        comprou: FILTROS_LINHA.comprou,
      }),
    },
    async (args) => {
      try {
        return jsonText(await readAba(supabase, actor, { modulo: 'rastreamento', ...args }));
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'ver_mensagens_rastreamento',
    {
      title: 'Pesquisar mensagens do cliente ou contato',
      description:
        'Lê entrada, saída e webhooks Chatvolt/Zapper/Meta/Uazapi, com texto integral disponível, evidências e sem teto total. Permite pesquisar atividade em todo o cliente omitindo telefone, inclusive contatos antigos. cliente_id obrigatório; telefone opcional. Para um grupo ou conversa específica, informe seu chat_jid exato; grupos exigem esse filtro. limite controla somente a página (padrão 100). Repita nesta ferramenta com cursor e mesmos filtros até paginacao.concluido=true, sem nova autorização por página. inicio/fim filtram datas em São Paulo. Fontes ausentes são declaradas; não envia nem consulta serviços externos.',
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      inputSchema: z.object({
        cliente_id: z.string().uuid(),
        telefone: z.string().optional(),
        chat_jid: z.string().max(256).regex(/^(?:\d{5,20}(?:-\d{1,20})?@g\.us|\d{5,20}@(?:s\.whatsapp\.net|c\.us|lid))$/)
          .optional().describe('JID exato da conversa ou grupo autorizado deste cliente, como 120363000000000000@g.us.'),
        limite: z.number().int().positive().max(500).optional().describe('Mensagens por página, não limite total do histórico.'),
        cursor: z.string().max(12000).optional(),
        inicio: FILTROS_LINHA.inicio,
        fim: FILTROS_LINHA.fim,
        canal: z.string().optional().describe('Canal informado pelo webhook, como whatsapp ou instagram.'),
        direcao: z.enum(['lead', 'equipe']).optional(),
        busca: z.string().optional().describe('Trecho literal no texto integral da mensagem.'),
      }),
    },
    async (args) => {
      try {
        const access = await requireModule(supabase, actor, 'rastreamento');
        if ('error' in access) return toolError(access.error);
        const result = await consultMensagens(supabase, {
          clienteId: args.cliente_id,
          telefone: args.telefone,
          chatJid: args.chat_jid,
          limite: args.limite, cursor: args.cursor, inicio: args.inicio, fim: args.fim, actor,
          canal: args.canal, direcao: args.direcao, busca: args.busca,
        });
        return jsonText({ ...result, continuacao: result.continuacao
          ? { ...result.continuacao, ferramenta: 'ver_mensagens_rastreamento' } : null });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  const onboardingUser = () => {
    const id = actorUserId(actor);
    if (!id) throw new Error('Use o token de uma pessoa da equipe para alterar o onboarding.');
    return id;
  };

  mcp.registerTool(
    'iniciar_onboarding',
    {
      title: 'Iniciar checklist de onboarding',
      description:
        'Cria o checklist do cliente a partir de um modelo ativo. Nenhuma tarefa abre sozinha. Só gestor. Se o cliente já tem onboarding ativo, devolve o mesmo. Obrigatório: cliente_id, modelo_id, responsavel_id (pessoa da equipe para as linhas sem responsável fixo).',
      inputSchema: z.object({
        cliente_id: z.string().uuid(),
        modelo_id: z.string().uuid(),
        responsavel_id: z.string().uuid(),
      }),
    },
    async (args) => {
      try {
        const access = await requireModule(supabase, actor, 'onboarding');
        if ('error' in access) return toolError(access.error);
        const { data, error } = await supabase.rpc('start_client_onboarding', {
          p_client: args.cliente_id,
          p_template: args.modelo_id,
          p_assignee: args.responsavel_id,
          p_actor: onboardingUser(),
        });
        if (error) return toolError(error.message);
        return jsonText({ onboarding_id: data });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'virar_tarefa_onboarding',
    {
      title: 'Virar tarefa uma linha do checklist',
      description:
        'Abre a tarefa real da linha, com o responsável e o prazo em dias úteis já gravados. O prazo começa agora. Linha já aberta devolve a mesma tarefa. Obrigatório: etapa_id (id da linha do checklist).',
      inputSchema: z.object({
        etapa_id: z.string().uuid(),
      }),
    },
    async ({ etapa_id }) => {
      try {
        const access = await requireModule(supabase, actor, 'onboarding');
        if ('error' in access) return toolError(access.error);
        const { data, error } = await supabase.rpc('open_client_onboarding_stage', {
          p_stage: etapa_id,
          p_actor: onboardingUser(),
        });
        if (error) return toolError(error.message);
        return jsonText({ tarefa_id: data });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'ajustar_etapa_onboarding',
    {
      title: 'Ajustar linha do checklist de onboarding',
      description:
        'Grava responsável, se depende da equipe ou do cliente, dias úteis, prazo (só se a linha já é tarefa) e o texto do que fazer. Obrigatório: etapa_id, responsavel_id, depende_de (internal ou client), dias_uteis.',
      inputSchema: z.object({
        etapa_id: z.string().uuid(),
        responsavel_id: z.string().uuid(),
        depende_de: z.enum(['internal', 'client']),
        dias_uteis: z.number().int().min(0).max(365),
        prazo: z.string().optional(),
        instrucoes: z.string().optional(),
      }),
    },
    async (args) => {
      try {
        const access = await requireModule(supabase, actor, 'onboarding');
        if ('error' in access) return toolError(access.error);
        const { error } = await supabase.rpc('update_client_onboarding_stage', {
          p_stage: args.etapa_id,
          p_assignee: args.responsavel_id,
          p_side: args.depende_de,
          p_days: args.dias_uteis,
          p_due: args.prazo || null,
          p_instructions: args.instrucoes ?? '',
          p_actor: onboardingUser(),
        });
        if (error) return toolError(error.message);
        return jsonText({ ok: true, etapa_id: args.etapa_id });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'concluir_etapa_onboarding',
    {
      title: 'Concluir linha do checklist de onboarding',
      description:
        'Conclui a tarefa da linha e marca o item. Não abre a próxima. A entrada só termina quando todas as linhas estão concluídas. Obrigatório: etapa_id.',
      inputSchema: z.object({
        etapa_id: z.string().uuid(),
      }),
    },
    async ({ etapa_id }) => {
      try {
        const access = await requireModule(supabase, actor, 'onboarding');
        if ('error' in access) return toolError(access.error);
        const { data, error } = await supabase.rpc('complete_client_onboarding_stage', {
          p_stage: etapa_id,
          p_actor: onboardingUser(),
        });
        if (error) return toolError(error.message);
        return jsonText({ onboarding_id: data });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  const checklistManager = async () => {
    const access = await requireModule(supabase, actor, 'onboarding');
    if ('error' in access) return access;
    const id = onboardingUser();
    return { access, id, manager: access.role === 'superadmin' || access.role === 'admin' };
  };

  const loadChecklistRow = async (checklistId: string) => {
    const { data, error } = await supabase
      .from('client_checklists')
      .select('id, client_id, title, items, owner_id')
      .eq('id', checklistId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Checklist não encontrado.');
    return data as { id: string; client_id: string; title: string; owner_id: string | null; items: Array<Record<string, unknown>> };
  };

  const saveChecklistItems = async (checklistId: string, items: Array<Record<string, unknown>>) => {
    const { error } = await supabase.from('client_checklists').update({ items }).eq('id', checklistId);
    if (error) throw new Error(error.message);
  };

  const syncChecklistTask = async (item: Record<string, unknown>) => {
    const taskId = typeof item.task_id === 'string' ? item.task_id : '';
    if (!taskId) return;
    const assignee = typeof item.assignee_id === 'string' ? item.assignee_id : '';
    const { error } = await supabase.from('tarefas').update({
      title: String(item.title || 'Tarefa de onboarding'),
      assignee_ids: assignee ? [assignee] : [],
      due_date: item.due_date || null,
      status: item.is_completed ? 'completed' : 'todo',
      description: item.note || item.description || null,
    }).eq('id', taskId);
    if (error) throw new Error(error.message);
  };

  mcp.registerTool(
    'listar_checklist_onboarding',
    {
      title: 'Listar checklist em colunas',
      description:
        'Lê as listas da tela Onboarding em colunas (client_checklists). Cada item tem título, responsável, prazo, se está concluído e a tarefa ligada, se já virou tarefa. cliente_id é opcional.',
      inputSchema: z.object({
        cliente_id: z.string().uuid().optional(),
      }),
    },
    async ({ cliente_id }) => {
      try {
        const access = await requireModule(supabase, actor, 'onboarding');
        if ('error' in access) return toolError(access.error);
        let q = supabase.from('client_checklists').select('id, client_id, title, items').order('created_at', { ascending: true });
        if (cliente_id) q = q.eq('client_id', cliente_id);
        const { data, error } = await q;
        if (error) return toolError(error.message);
        const rows = (data ?? []) as Array<{ id: string; client_id: string; title: string; items: Array<Record<string, unknown>> | null }>;
        return jsonText({
          listas: rows.map((row) => ({
            checklist_id: row.id,
            cliente_id: row.client_id,
            titulo: row.title,
            itens: (row.items ?? []).map((item) => ({
              item_id: item.id,
              titulo: item.title,
              responsavel_id: item.assignee_id ?? null,
              prazo: item.due_date ?? null,
              concluido: Boolean(item.is_completed),
              tarefa_id: item.task_id ?? null,
            })),
          })),
        });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'adicionar_item_checklist',
    {
      title: 'Adicionar item no checklist em colunas',
      description:
        'Acrescenta uma linha na lista do cliente, como “Adicionar nova tarefa” na tela. Não cria a tarefa sozinha. Só gestor. Obrigatório: cliente_id, titulo. responsavel_id e prazo (AAAA-MM-DD) são opcionais. Sem prazo, vale o fim de hoje.',
      inputSchema: z.object({
        cliente_id: z.string().uuid(),
        titulo: z.string().min(1),
        responsavel_id: z.string().uuid().optional(),
        prazo: z.string().optional(),
      }),
    },
    async (args) => {
      try {
        const gate = await checklistManager();
        if ('error' in gate) return toolError(gate.error);
        if (!gate.manager) return toolError('Só administrador inclui item no checklist.');
        const due = args.prazo ? `${args.prazo.slice(0, 10)}T23:59:59.000-03:00` : `${todayYmdSaoPaulo()}T23:59:59.000-03:00`;
        const item = {
          id: crypto.randomUUID(),
          title: args.titulo.trim(),
          is_completed: false,
          completed_at: null,
          description: '',
          due_date: due,
          assignee_id: args.responsavel_id ?? null,
          note: null,
          subtasks: [],
        };
        const { data: existing, error: readError } = await supabase
          .from('client_checklists')
          .select('id, items')
          .eq('client_id', args.cliente_id)
          .order('created_at', { ascending: true })
          .limit(1);
        if (readError) return toolError(readError.message);
        const row = (existing ?? [])[0] as { id: string; items: Array<Record<string, unknown>> | null } | undefined;
        if (row) {
          await saveChecklistItems(row.id, [...(row.items ?? []), item]);
          return jsonText({ checklist_id: row.id, item_id: item.id });
        }
        const { data: created, error: insertError } = await supabase
          .from('client_checklists')
          .insert({ client_id: args.cliente_id, title: 'Checklist', items: [item], owner_id: gate.id })
          .select('id')
          .single();
        if (insertError) return toolError(insertError.message);
        return jsonText({ checklist_id: created.id, item_id: item.id });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'ajustar_item_checklist',
    {
      title: 'Ajustar item do checklist em colunas',
      description:
        'Grava título, responsável, prazo ou conclusão de uma linha do checklist em colunas. Se a linha já é tarefa, a tarefa recebe a mesma alteração. Obrigatório: checklist_id, item_id.',
      inputSchema: z.object({
        checklist_id: z.string().uuid(),
        item_id: z.string().uuid(),
        titulo: z.string().optional(),
        responsavel_id: z.string().uuid().nullable().optional(),
        prazo: z.string().nullable().optional(),
        concluido: z.boolean().optional(),
      }),
    },
    async (args) => {
      try {
        const gate = await checklistManager();
        if ('error' in gate) return toolError(gate.error);
        const row = await loadChecklistRow(args.checklist_id);
        const items = [...(row.items ?? [])];
        const index = items.findIndex((item) => item.id === args.item_id);
        const current = items[index];
        if (!current) return toolError('Item não encontrado neste checklist.');
        const assignee = typeof current.assignee_id === 'string' ? current.assignee_id : '';
        if (!gate.manager && assignee !== gate.id) return toolError('Só o responsável ou um gestor ajusta esta linha.');
        const next = { ...current };
        if (args.titulo !== undefined) next.title = args.titulo.trim();
        if (args.responsavel_id !== undefined) next.assignee_id = args.responsavel_id;
        if (args.prazo !== undefined) next.due_date = args.prazo ? `${args.prazo.slice(0, 10)}T23:59:59.000-03:00` : null;
        if (args.concluido !== undefined) {
          next.is_completed = args.concluido;
          next.completed_at = args.concluido ? new Date().toISOString() : null;
        }
        items[index] = next;
        await saveChecklistItems(row.id, items);
        await syncChecklistTask(next);
        return jsonText({ checklist_id: row.id, item_id: args.item_id, tarefa_id: next.task_id ?? null });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'virar_tarefa_checklist',
    {
      title: 'Virar tarefa um item do checklist em colunas',
      description:
        'Cria a tarefa real da linha (responsável e prazo já gravados no item) e guarda o vínculo. Linha que já é tarefa devolve a mesma. Obrigatório: checklist_id, item_id. Gestor, ou o responsável da linha.',
      inputSchema: z.object({
        checklist_id: z.string().uuid(),
        item_id: z.string().uuid(),
      }),
    },
    async (args) => {
      try {
        const gate = await checklistManager();
        if ('error' in gate) return toolError(gate.error);
        const row = await loadChecklistRow(args.checklist_id);
        const items = [...(row.items ?? [])];
        const index = items.findIndex((item) => item.id === args.item_id);
        const current = items[index];
        if (!current) return toolError('Item não encontrado neste checklist.');
        if (typeof current.task_id === 'string' && current.task_id) return jsonText({ tarefa_id: current.task_id });
        const assignee = typeof current.assignee_id === 'string' ? current.assignee_id : '';
        if (!gate.manager && assignee !== gate.id) return toolError('Só o responsável ou um gestor transforma esta linha em tarefa.');
        const assigneeIds = assignee ? [assignee] : [gate.id];
        const { data: task, error } = await supabase.from('tarefas').insert({
          title: String(current.title || 'Tarefa de onboarding').trim(),
          client_id: row.client_id,
          owner_id: gate.id,
          assignee_ids: assigneeIds,
          status: 'todo',
          type: 'onboarding',
          due_date: current.due_date || null,
          description: current.note || current.description || null,
          status_history: [{ status: 'todo', user_id: gate.id, assignee_ids: assigneeIds, timestamp: new Date().toISOString() }],
        }).select('id').single();
        if (error) return toolError(error.message);
        items[index] = { ...current, task_id: task.id, assignee_id: assignee || gate.id };
        await saveChecklistItems(row.id, items);
        return jsonText({ tarefa_id: task.id });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );
}

function moduleOk(access: ModuleAccess, name: string): boolean {
  return denyModule(access, name) === null;
}
