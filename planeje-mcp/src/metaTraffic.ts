/** Read-only Meta reporting. Fixed GET endpoints; credentials never leave this module. */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadApprovedTeamUser } from './accountAccess.js';
import type { McpActorLike } from './access.js';

export type Row = Record<string, any>;
export const META_VERSION = 'v24.0';
const CURSOR_KEY = randomBytes(32);
const MSG = 'onsite_conversion.messaging_conversation_started_7d';
const PROFILE = 'instagram_profile_visits';
export function ymd(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) !== s) throw new Error('Data inválida: use YYYY-MM-DD.');
  return s;
}
export function period(inicio?: string, fim?: string) {
  if (!inicio || !fim) throw new Error('inicio e fim são obrigatórios.');
  ymd(inicio); ymd(fim);
  const dias = (Date.parse(fim) - Date.parse(inicio)) / 86400000 + 1;
  if (dias < 1 || dias > 366) throw new Error('Período deve ter de 1 a 366 dias, em ordem crescente.');
  return { inicio, fim, dias };
}
export function numberOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v); return Number.isFinite(n) ? n : null;
}
function divide(a: number | null, b: number | null, scale = 1) { return a != null && b != null && b > 0 ? a / b * scale : null; }
export function clean(value: any): any {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k]) => !/token|secret|paging|^next$|^previous$/i.test(k)).map(([k,v]) => [k,clean(v)]));
  if (typeof value === 'string' && /^[{[]/.test(value.trim()) && /"[^"]*(?:token|secret|paging)[^"]*"\s*:/i.test(value)) { try { return JSON.stringify(clean(JSON.parse(value))); } catch { /* plain text */ } }
  if (typeof value === 'string') return value.replace(/(access_token|appsecret_proof|client_secret)=([^&\s]+)/gi, '$1=[redacted]');
  return value;
}
export function encodeCursor(scope: string, after: string) {
  const body = Buffer.from(JSON.stringify({ scope, after, exp: Date.now() + 3600000 })).toString('base64url');
  return body + '.' + createHmac('sha256', CURSOR_KEY).update(body).digest('base64url');
}
export function decodeCursor(scope: string, cursor?: string) {
  if (!cursor) return undefined;
  try {
    const [body, mac] = cursor.split('.');
    if (!body || !mac) throw 0;
    const expected = createHmac('sha256', CURSOR_KEY).update(body).digest();
    const supplied = Buffer.from(mac, 'base64url');
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw 0;
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (decoded.scope !== scope || decoded.exp < Date.now() || typeof decoded.after !== 'string' || decoded.after.length > 4096) throw 0;
    return decoded.after as string;
  } catch { throw new Error('Cursor inválido, vencido ou pertencente a outro filtro. Reinicie a consulta.'); }
}

/** Mirror current team/account policy, recheck state and fail closed on permission query errors. */
export async function requireTraffic(supabase: SupabaseClient, actor?: McpActorLike, moduleName = 'paid_traffic') {
  if (!actor || actor.type === 'anon') throw new Error('Acesso autenticado da equipe obrigatório.');
  if (actor.type === 'admin_key') return;
  const current = await loadApprovedTeamUser(supabase, actor.user_id);
  if (!current || current.role !== actor.role) throw new Error('Conta inativa, sessão revogada ou papel alterado. Reconecte.');
  if (current.role === 'superadmin') return;
  const [global, personal] = await Promise.all([
    supabase.from('module_settings').select('is_enabled').eq('module_name', moduleName).maybeSingle(),
    supabase.from('user_module_permissions').select('is_enabled').eq('module_name', moduleName).eq('user_id', actor.user_id).maybeSingle(),
  ]);
  if (global.error || personal.error) throw new Error('Não foi possível validar a permissão do módulo.');
  if ((personal.data?.is_enabled ?? global.data?.is_enabled ?? true) !== true) throw new Error('Módulo não habilitado para este usuário.');
}
export async function linkedAccounts(supabase: SupabaseClient, cliente_id: string, conta_id?: string) {
  const c = await supabase.from('clientes').select('id, empresa').eq('id', cliente_id).maybeSingle();
  if (c.error || !c.data) throw new Error('Cliente não encontrado ou indisponível.');
  const r = await supabase.from('cliente_meta_accounts').select('id,cliente_id,meta_account_id,meta_account_name,is_active,created_at').eq('cliente_id', cliente_id).order('id');
  if (r.error) throw new Error('Não foi possível consultar vínculos Meta.');
  const all = (r.data ?? []) as Row[];
  const selected = conta_id ? all.filter(x => x.meta_account_id === conta_id) : all.filter(x => x.is_active === true);
  if (conta_id && selected.length !== 1) throw new Error('Conta Meta não vinculada ao cliente informado.');
  return { cliente: c.data, contas: all, selected };
}
export class MetaReadError extends Error {
  constructor(public code: number, public subcode: number | null, public field: string | null = null) { super(`Meta indisponível (código ${code}${subcode ? '/' + subcode : ''}).`); }
}
export class MetaReader {
  private token: string | undefined;
  private unsupported = new Map<string, Set<string>>();
  constructor(private supabase: SupabaseClient, private http: typeof fetch = fetch) {}
  private async credential() {
    if (this.token) return this.token;
    const r = await this.supabase.rpc('get_encrypted_secret', { p_secret_name: 'META_SYSTEM_USER_ACCESS_TOKEN' });
    if (r.error || !r.data || typeof r.data !== 'string') throw new Error('Credencial de leitura Meta indisponível no servidor.');
    this.token = r.data.trim(); return this.token;
  }
  async get(path: string, params: Record<string, string> = {}): Promise<Row> {
    if (!/^act_\d+(\/(insights|campaigns|adsets|ads|activities))?$/.test(path)) throw new Error('Endpoint de leitura não permitido.');
    const token = await this.credential();
    let res: Response;
    try { res = await this.http(`https://graph.facebook.com/${META_VERSION}/${path}?${new URLSearchParams(params)}`, { method: 'GET', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(45000), redirect: 'error' }); }
    catch { throw new Error('Tempo esgotado ou falha de rede ao consultar Meta.'); }
    let body: Row;
    try { body = await res.json() as Row; } catch { throw new Error('Resposta inválida da Meta.'); }
    if (body.error || !res.ok) {
      const message = String(body.error?.message ?? '');
      // Only field names are retained, never provider messages or request URLs.
      const field = message.match(/nonexisting field \((\w+)\)/i)?.[1] ?? message.match(/(\w+) is not valid for fields/i)?.[1] ?? null;
      throw new MetaReadError(Number(body.error?.code ?? res.status), body.error?.error_subcode ?? null, field);
    }
    return body;
  }
  async page(account: string, resource: string, params: Record<string,string>, optional: string[] = []) {
    const known = this.unsupported.get(resource) ?? new Set<string>();
    const omitted = optional.filter(f => known.has(f));
    if (params.fields) params = { ...params, fields: params.fields.split(',').filter(f => !known.has(f)).join(',') };
    for (let tries = 0; tries <= optional.length; tries++) {
      try { return { body: await this.get(`${account}/${resource}`, params), omitted }; }
      catch (e) {
        if (!(e instanceof MetaReadError) || e.code !== 100 || !e.field || !optional.includes(e.field)) throw e;
        const fields = params.fields?.split(',') ?? [];
        if (!fields.includes(e.field)) throw e;
        params = { ...params, fields: fields.filter(f => f !== e.field).join(',') }; omitted.push(e.field); known.add(e.field); this.unsupported.set(resource, known);
      }
    }
    throw new Error('Campos Meta indisponíveis.');
  }
  async all(account: string, resource: string, params: Record<string,string>, optional: string[] = []) {
    const rows: Row[] = []; let after: string | undefined; const seen = new Set<string>(); const omitted = new Set<string>();
    for (let page = 0; page < 100; page++) {
      const p = await this.page(account, resource, { ...params, limit: '100', ...(after ? { after } : {}) }, optional);
      p.omitted.forEach(f => omitted.add(f));
      if (!Array.isArray(p.body.data)) throw new Error('Lista Meta inválida.');
      rows.push(...p.body.data);
      const next = p.body.paging?.next ? p.body.paging?.cursors?.after : undefined;
      if (!next) return { rows, complete: true, omitted: [...omitted] };
      if (seen.has(next)) throw new Error('Paginação Meta repetida.');
      seen.add(next); after = next;
    }
    return { rows, complete: false, omitted: [...omitted] };
  }
}
export const FIELDS = {
  campanhas: 'id,name,account_id,objective,status,effective_status,daily_budget,lifetime_budget,budget_remaining,created_time,updated_time,start_time,stop_time',
  conjuntos: 'id,name,account_id,campaign_id,status,effective_status,optimization_goal,billing_event,destination_type,daily_budget,lifetime_budget,targeting,attribution_spec,promoted_object,created_time,updated_time,start_time,end_time',
  anuncios: 'id,name,account_id,campaign_id,adset_id,status,effective_status,created_time,updated_time,tracking_specs,creative{id,name,title,body,url_tags,object_story_id,effective_object_story_id,object_story_spec,asset_feed_spec,thumbnail_url,image_hash,video_id}',
  historico: 'event_time,event_type,translated_event_type,object_id,object_name,object_type,actor_id,actor_name,application_id,application_name,extra_data',
  metricas: 'account_id,account_currency,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,date_start,date_stop,objective,optimization_goal,attribution_setting,spend,reach,impressions,frequency,clicks,inline_link_clicks,cpm,ctr,cpc,actions,cost_per_action_type,instagram_profile_visits,results,cost_per_result',
};
export const OPTIONAL_METRICS = ['instagram_profile_visits', 'results', 'cost_per_result', 'optimization_goal', 'attribution_setting'];
export function insightParams(args: Row, range: ReturnType<typeof period>) {
  const levels: Row = { conta: 'account', campanha: 'campaign', conjunto: 'adset', anuncio: 'ad' };
  return { fields: FIELDS.metricas, level: levels[args.nivel ?? 'campanha'], time_range: JSON.stringify({ since: range.inicio, until: range.fim }), time_increment: args.granularidade === 'dia' ? '1' : 'all_days', action_report_time: 'impression', use_unified_attribution_setting: 'true', ...(args.campanha_id ? { filtering: JSON.stringify([{ field: 'campaign.id', operator: 'IN', value: [args.campanha_id] }]) } : {}) };
}
function actionValue(actions: any, type: string) { return Array.isArray(actions) ? numberOrNull(actions.find(x => x.action_type === type)?.value) : null; }
export function resultFamily(type: string | null) { return type && /profile_visit/i.test(type) ? 'visitas_perfil' : type && /messaging_conversation_started/i.test(type) ? 'mensagens' : type ? 'outros' : 'nao_informado'; }
export function normalizeInsight(r: Row, cliente_id: string, conta_id: string) {
  const spend = numberOrNull(r.spend), profile = numberOrNull(r.instagram_profile_visits) ?? actionValue(r.actions, PROFILE);
  const messages = actionValue(r.actions, MSG);
  const types: Row[] = Array.isArray(r.results) ? r.results.map((x: Row) => ({ tipo: x.indicator ?? x.action_type ?? null, quantidade: numberOrNull((x.values?.find((v: Row) => v.attribution_windows?.includes('default')) ?? (x.values?.length === 1 ? x.values[0] : null))?.value ?? x.value), origem: 'meta.results' })) : [];
  const main = types.length === 1 && types[0]?.tipo ? types[0] : null;
  const metrics = { investimento: spend, alcance: numberOrNull(r.reach), impressoes: numberOrNull(r.impressions), frequencia: numberOrNull(r.frequency), cliques: numberOrNull(r.clicks), cliques_link: numberOrNull(r.inline_link_clicks), cpm: numberOrNull(r.cpm), ctr: numberOrNull(r.ctr), cpc: numberOrNull(r.cpc), conversas_iniciadas: messages, custo_por_conversa: divide(spend, messages), visitas_perfil: profile, custo_por_visita: divide(spend, profile), resultado: main?.quantidade ?? null, custo_por_resultado: main ? divide(spend, main.quantidade) : null };
  return { cliente_id, conta_id, campanha_id: r.campaign_id ?? null, conjunto_id: r.adset_id ?? null, anuncio_id: r.ad_id ?? null, campanha_nome: r.campaign_name ?? null, conjunto_nome: r.adset_name ?? null, anuncio_nome: r.ad_name ?? null, inicio: r.date_start ?? null, fim: r.date_stop ?? null, moeda: r.account_currency ?? null, objetivo: r.objective ?? null, otimizacao: r.optimization_goal ?? null, atribuicao: r.attribution_setting ?? null, resultado_tipo: main?.tipo ?? null, familia_resultado: resultFamily(main?.tipo ?? null), resultados_por_tipo: types, metricas: metrics, ausentes: Object.entries(metrics).filter(([,v]) => v == null).map(([k]) => k), definicoes: { conversas: MSG, visitas: PROFILE, ctr: 'cliques totais / impressões × 100; não CTR de link', custo: 'investimento / quantidade; null se ausente ou zero' }, acoes_meta: clean(r.actions ?? null), custos_acoes_meta: clean(r.cost_per_action_type ?? null), resultados_meta: clean(r.results ?? null), custos_resultados_meta: clean(r.cost_per_result ?? null) };
}
export function audience(r?: Row) {
  const t = r?.targeting;
  return t?.custom_audiences?.length ? 'publico_personalizado_potencial_remarketing' : t ? 'sem_publico_personalizado_incluido' : 'nao_informado';
}
export function normalizeEntity(r: Row, recurso: string, cliente_id: string, conta_id: string) {
  const money = (v: any) => numberOrNull(v) == null ? null : Number(v) / 100;
  const out: Row = { ...clean(r), cliente_id, conta_id, fotografia_em: new Date().toISOString(), estado: 'configuracao_atual', orcamento_diario: money(r.daily_budget), orcamento_total: money(r.lifetime_budget), unidade_orcamento: 'moeda da conta; campos originais da Meta em centavos', campanha_id: recurso === 'campanhas' ? r.id : r.campaign_id ?? null, conjunto_id: recurso === 'conjuntos' ? r.id : r.adset_id ?? null, anuncio_id: recurso === 'anuncios' ? r.id : null };
  if (recurso === 'conjuntos') out.publico = { grupo: audience(r), evidencia: clean(r.targeting ?? null), nota: 'Público personalizado é indício, não prova de remarketing. Configuração atual não reconstitui a configuração histórica.' };
  if (recurso === 'anuncios') {
    const creative = r.creative ?? {};
    const variants: Row[] = [];
    const addUtm = (origem: string, query: string) => {
      const utms = Object.fromEntries([...new URLSearchParams(query).entries()].filter(([k]) => k.startsWith('utm_')));
      if (Object.keys(utms).length) variants.push({ origem, utms });
    };
    if (creative.url_tags) addUtm('creative.url_tags',creative.url_tags);
    const urls = [creative.object_story_spec?.link_data?.link, creative.object_story_spec?.video_data?.call_to_action?.value?.link, ...(creative.asset_feed_spec?.link_urls ?? []).map((x: Row) => x.website_url)];
    for (const url of urls) if (typeof url === 'string') { try { addUtm('creative.destination_url',new URL(url).search); } catch { /* no URL fabricated */ } }
    out.utms = variants[0]?.utms ?? null;
    out.utms_variantes = variants;
    out.utm_origem = variants[0]?.origem ?? null;
    out.utm_nota = 'Macros preservadas sem resolução inventada; variantes podem ter destinos diferentes.';
    out.ausentes = [!variants.length ? 'utms' : null, !r.creative ? 'criativo' : null].filter(Boolean);
  }
  return out;
}
export function historyParams(range: ReturnType<typeof period>, timezone: string) {
  // Meta accepts Unix timestamps. Resolve account-local midnight (including non-Brazil accounts).
  const boundary = (date: string) => {
    let ms = Date.parse(date + 'T00:00:00Z');
    for (let i = 0; i < 3; i++) {
      const f = new Intl.DateTimeFormat('sv-SE', { timeZone: timezone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23' }).format(new Date(ms)).replace(' ', 'T');
      ms += Date.parse(date + 'T00:00:00Z') - Date.parse(f + 'Z');
    }
    return Math.floor(ms / 1000);
  };
  const next = new Date(Date.parse(range.fim) + 86400000).toISOString().slice(0,10);
  return { fields: FIELDS.historico, since: String(boundary(range.inicio)), until: String(boundary(next) - 1) };
}
export function normalizeHistory(r: Row, cliente_id: string, conta_id: string) {
  let details = r.extra_data;
  if (typeof details === 'string') { try { details = JSON.parse(details); } catch { /* keep original */ } }
  const code = details?.run_status?.new_value;
  const newStatus = String(details?.new_value ?? '').toLowerCase();
  const statusDestino = /run_status/.test(String(r.event_type)) ? (code === 1 || /^(ativo|active)$/.test(newStatus) ? 'ativo' : code === 2 || /^(pausado|paused)$/.test(newStatus) ? 'pausado' : null) : null;
  const nivel = ({ CAMPAIGN_GROUP: 'campanha', CAMPAIGN: 'conjunto', ADGROUP: 'anuncio' } as Row)[r.object_type] ?? 'outro';
  return { ...clean(r), cliente_id, conta_id, nivel_objeto: nivel, campanha_id: nivel === 'campanha' ? String(r.object_id) : null, conjunto_id: nivel === 'conjunto' ? String(r.object_id) : null, anuncio_id: nivel === 'anuncio' ? String(r.object_id) : null, origem: 'meta.activities', status_destino: statusDestino, detalhes: clean(details ?? null), nota: 'Eventos disponíveis na Meta; ausência não comprova ausência de alteração. object_id preserva campanha/conjunto/anúncio.' };
}

/** Meta add_children does not reliably include descendants; enumerate explicit object IDs. */
export async function campaignHistoryFilter(reader: MetaReader, account: string, campaign: string) {
  const owned = await reader.page(account, 'campaigns', { fields: 'id', filtering: JSON.stringify([{ field: 'id', operator: 'IN', value: [campaign] }]), limit: '1' });
  if (!owned.body.data?.some((r: Row) => r.id === campaign)) throw new Error('Campanha não encontrada nesta conta Meta.');
  const params = { fields: 'id,campaign_id', filtering: JSON.stringify([{ field: 'campaign.id', operator: 'IN', value: [campaign] }]) };
  const sets = await reader.all(account, 'adsets', params);
  const ads = await reader.all(account, 'ads', params);
  if (!sets.complete || !ads.complete) throw new Error('Catálogo de filhos incompleto; consulte histórico sem filtro de campanha.');
  const children = [...new Set([...sets.rows,...ads.rows].map(r => String(r.id)))];
  // Keep the GET bounded; account-level history remains available for larger catalogs.
  if (children.length > 200) throw new Error('Campanha com mais de 200 objetos filhos; consulte histórico por conta e cruze object_id com conjuntos/anúncios.');
  return { oid: campaign, ...(children.length ? { extra_oids: JSON.stringify(children) } : {}) };
}

export async function consultMetaTraffic(supabase: SupabaseClient, actor: McpActorLike | undefined, args: Row, reader = new MetaReader(supabase)) {
  await requireTraffic(supabase, actor);
  const links = await linkedAccounts(supabase, args.cliente_id, args.conta_id);
  const recurso = args.recurso ?? 'metricas';
  if (recurso === 'metricas' || recurso === 'historico') period(args.inicio,args.fim);
  else if (args.inicio || args.fim) throw new Error('Período aplica-se a metricas ou historico. Catálogo/contas são atuais; consulte métricas para atividade no período.');
  const scope = JSON.stringify({ ...args, cursor: undefined });
  const after = decodeCursor(scope, args.cursor);
  const limit = args.limite ?? 50;
  const base = { versao_schema: '1.0', origem: 'meta_marketing_api', api_versao: META_VERSION, consultado_em: new Date().toISOString(), cliente: links.cliente, recurso };
  if (recurso === 'contas') {
    const offset = Number(after ?? 0); const rows = (args.conta_id ? links.selected : links.contas).slice(offset, offset + limit);
    const hasMore = offset + limit < (args.conta_id ? links.selected : links.contas).length;
    return { ...base, origem: 'planeje.cliente_meta_accounts', dados: rows, paginacao: { limite: limit, tem_mais: hasMore, proximo_cursor: hasMore ? encodeCursor(scope, String(offset + limit)) : null } };
  }
  if (links.selected.length !== 1) throw new Error('Informe conta_id dentre os vínculos retornados por recurso=contas (nenhuma ou múltiplas contas ativas).');
  const account = links.selected[0]!.meta_account_id;
  const info = await reader.get(account, { fields: 'id,name,currency,timezone_name,account_status' });
  if (!info.timezone_name) throw new Error('Fuso da conta Meta ausente; não é seguro datar o relatório.');
  let range: ReturnType<typeof period> | null = null;
  let params: Row; let edge: string;
  if (recurso === 'metricas') { range = period(args.inicio, args.fim); params = insightParams(args, range); edge = 'insights'; }
  else if (recurso === 'historico') {
    range = period(args.inicio, args.fim); params = { ...historyParams(range, info.timezone_name), ...(args.categoria_historico ? { category: args.categoria_historico } : {}) }; edge = 'activities';
    if (args.campanha_id) {
      params = { ...params, ...await campaignHistoryFilter(reader,account,args.campanha_id) };
    }
  } else {
    const edges: Row = { campanhas: 'campaigns', conjuntos: 'adsets', anuncios: 'ads' }; edge = edges[recurso];
    if (!edge) throw new Error('Recurso inválido.');
    params = { fields: FIELDS[recurso as keyof typeof FIELDS] };
    if (args.campanha_id) params.filtering = JSON.stringify([{ field: recurso === 'campanhas' ? 'id' : 'campaign.id', operator: 'IN', value: [args.campanha_id] }]);
  }
  const page = await reader.page(account, edge, { ...params, limit: String(limit), ...(after ? { after } : {}) }, recurso === 'metricas' ? OPTIONAL_METRICS : []);
  if (!Array.isArray(page.body.data)) throw new Error('Lista Meta inválida.');
  const rows = page.body.data.map((r: Row) => recurso === 'metricas' ? normalizeInsight(r, args.cliente_id, account) : recurso === 'historico' ? normalizeHistory(r, args.cliente_id, account) : normalizeEntity(r, recurso, args.cliente_id, account));
  const next = page.body.paging?.next ? page.body.paging?.cursors?.after : null;
  return { ...base, conta: clean(info), periodo: range, granularidade: recurso === 'metricas' ? args.granularidade ?? 'periodo' : null, dados: rows, campos_indisponiveis: page.omitted, paginacao: { limite: limit, retornados: rows.length, tem_mais: Boolean(next), proximo_cursor: next ? encodeCursor(scope, next) : null }, notas: ['Siga todas as páginas antes de totalizar. Métricas ausentes são null, não zero.', 'Alcance e frequência não podem ser somados entre dias, anúncios ou conjuntos.', 'Resultados identificados pela Meta; ações diferentes nunca são somadas como resultado genérico.', 'Catálogo e segmentação são atuais; use histórico para alterações. Sem dependência de CRM externo.'] };
}

export function delta(a: number | null, b: number | null) { return { anterior: a, atual: b, diferenca: a != null && b != null ? b - a : null, variacao_percentual: a != null && a !== 0 && b != null ? (b - a) / a * 100 : null }; }
export function aggregate(rows: Row[]) {
  const sum = (k: string) => rows.length && rows.every(x => x.metricas[k] != null) ? rows.reduce((n,x) => n + x.metricas[k], 0) : null;
  const investimento = sum('investimento'), conversas = sum('conversas_iniciadas'), visitas = sum('visitas_perfil'), resultado = sum('resultado');
  const impressoes = sum('impressoes'), cliques = sum('cliques');
  return { investimento, conversas_iniciadas: conversas, visitas_perfil: visitas, resultado, custo_por_resultado: divide(investimento, resultado), custo_por_conversa: divide(investimento, conversas), custo_por_visita: divide(investimento, visitas), impressoes, cliques, cpm: divide(investimento, impressoes, 1000), ctr: divide(cliques, impressoes, 100), alcance: null, frequencia: null };
}
export function compareRows(a: Row[], b: Row[], adsets: Row[]) {
  const index = new Map(adsets.map(x => [x.id,x]));
  const key = (r: Row) => JSON.stringify([r.moeda, r.objetivo, r.otimizacao, r.resultado_tipo, r.atribuicao, audience(index.get(r.conjunto_id))]);
  const keys = new Set([...a,...b].map(key));
  return [...keys].map(k => {
    const before = a.filter(x => key(x) === k), after = b.filter(x => key(x) === k);
    const m1 = aggregate(before), m2 = aggregate(after);
    const [moeda, objetivo, otimizacao, resultado_tipo, atribuicao, publico] = JSON.parse(k);
    return { moeda, objetivo, otimizacao, resultado_tipo, familia_resultado: resultFamily(resultado_tipo), atribuicao, publico_configuracao_atual: publico, antes_linhas: before.length, depois_linhas: after.length, metricas: Object.fromEntries(Object.keys(m1).map(m => [m, delta(m1[m as keyof typeof m1], m2[m as keyof typeof m2])])) };
  });
}

export function summarizeChanges(events: Row[]) {
  const patterns: Record<string, RegExp> = { criacao: /^create_/, status: /run_status|delivery/, orcamento: /budget/, publico: /target|audience/, criativo: /creative|image|video|ad_creative/, otimizacao: /optimization|bid_strategy/ };
  const result = Object.fromEntries(Object.entries(patterns).map(([categoria,pattern]) => {
    const selected = events.filter(x => pattern.test(String(x.event_type)));
    return [categoria,{ total: selected.length, eventos: selected.slice(0,10), truncado: selected.length > 10 }];
  }));
  for (const [name,status] of [['pausas','pausado'],['ativacoes','ativo']]) { const selected = events.filter(x => x.status_destino === status); result[name!] = { total: selected.length, eventos: selected.slice(0,10), truncado: selected.length > 10 }; }
  return result;
}

const comparisonCache = new Map<string, { at: number; report: Row }>();
function comparisonPage(report: Row, offset: number, limit: number, scope: string) {
  const total = report.campanhas.length;
  return { ...report, campanhas: report.campanhas.slice(offset,offset+limit), paginacao: { total_campanhas: total, limite: limit, tem_mais: offset+limit < total, proximo_cursor: offset+limit < total ? encodeCursor(scope,String(offset+limit)) : null } };
}
export async function compareMetaTraffic(supabase: SupabaseClient, actor: McpActorLike | undefined, args: Row, reader = new MetaReader(supabase)) {
  await requireTraffic(supabase, actor);
  const a = period(args.inicio_anterior, args.fim_anterior), b = period(args.inicio_atual, args.fim_atual);
  if (a.dias !== b.dias) throw new Error('A comparação exige períodos com a mesma quantidade de dias.');
  const links = await linkedAccounts(supabase, args.cliente_id, args.conta_id);
  if (links.selected.length !== 1) throw new Error('Informe uma conta Meta vinculada.');
  const account = links.selected[0]!.meta_account_id;
  const scope = JSON.stringify({ ...args, cursor: undefined });
  const offset = Number(decodeCursor(scope, args.cursor) ?? 0), limit = args.limite ?? 50;
  const cacheKey = JSON.stringify([actor?.type,actor?.type === 'user' ? actor.user_id : null,scope]);
  for (const [key,value] of comparisonCache) if (Date.now() - value.at > 600000) comparisonCache.delete(key);
  const cached = comparisonCache.get(cacheKey);
  if (cached) return comparisonPage(cached.report,offset,limit,scope);
  if (args.cursor) throw new Error('Fotografia da comparação expirou. Reinicie sem cursor.');
  const info = await reader.get(account, { fields: 'id,name,currency,timezone_name,account_status' });
  if (!info.timezone_name) throw new Error('Fuso da conta ausente.');
  // Sequential bounded reads avoid multiplying the account rate limit.
  const before = await reader.all(account, 'insights', insightParams({ ...args, nivel: 'conjunto', granularidade: 'periodo' }, a), OPTIONAL_METRICS);
  const after = await reader.all(account, 'insights', insightParams({ ...args, nivel: 'conjunto', granularidade: 'periodo' }, b), OPTIONAL_METRICS);
  const campaigns = await reader.all(account, 'campaigns', { fields: FIELDS.campanhas });
  const sets = await reader.all(account, 'adsets', { fields: FIELDS.conjuntos });
  if (args.campanha_id && !campaigns.rows.some(r => r.id === args.campanha_id)) throw new Error('Campanha não encontrada no catálogo desta conta.');
  const rowsA = before.rows.map(r => normalizeInsight(r, args.cliente_id, account));
  const rowsB = after.rows.map(r => normalizeInsight(r, args.cliente_id, account));
  const ids = [...new Set([...rowsA,...rowsB].map(r => r.campanha_id).filter(Boolean))].sort();
  const perCampaign = ids.map(id => {
    const ca = rowsA.filter(r => r.campanha_id === id), cb = rowsB.filter(r => r.campanha_id === id);
    return { campanha_id: id, nome: cb[0]?.campanha_nome ?? ca[0]?.campanha_nome, investimento: delta(aggregate(ca).investimento, aggregate(cb).investimento), grupos: compareRows(ca,cb,sets.rows) };
  }).sort((x,y) => (y.investimento.atual ?? 0) - (x.investimento.atual ?? 0) || x.campanha_id.localeCompare(y.campanha_id));
  const historyFilter = args.campanha_id ? await campaignHistoryFilter(reader,account,args.campanha_id) : {};
  const histories: Row[] = [];
  for (const [nome, range] of [['anterior',a],['atual',b]] as const) {
    try {
      const h = await reader.all(account, 'activities', { ...historyParams(range, info.timezone_name), ...historyFilter });
      histories.push({ periodo: nome, disponivel: true, paginacao_completa: h.complete, eventos: h.rows.map(r => normalizeHistory(r, args.cliente_id, account)) });
    } catch (e) { histories.push({ periodo: nome, disponivel: false, paginacao_completa: false, eventos: null, motivo: e instanceof Error ? e.message : 'Histórico indisponível.' }); }
  }
  const selected = args.campanha_id ? campaigns.rows.filter(r => r.id === args.campanha_id) : campaigns.rows;
  const created = (range: ReturnType<typeof period>) => selected.filter(r => {
    if (!r.created_time) return false;
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: info.timezone_name }).format(new Date(r.created_time));
    return date >= range.inicio && date <= range.fim;
  }).map(r => normalizeEntity(r, 'campanhas', args.cliente_id, account));
  const report = { versao_schema: '1.0', origem: 'meta_marketing_api', api_versao: META_VERSION, cliente: links.cliente, conta: clean(info), consultado_em: new Date().toISOString(), periodos: { anterior: a, atual: b }, cobertura: { metricas_completas: before.complete && after.complete, catalogo_completo: campaigns.complete && sets.complete, historico: histories.map(({eventos,...h}) => h), campos_indisponiveis: [...new Set([...before.omitted,...after.omitted])] }, investimento_total: delta(aggregate(rowsA).investimento, aggregate(rowsB).investimento), grupos_separados: compareRows(rowsA,rowsB,sets.rows), campanhas: perCampaign, paginacao: { total_campanhas: perCampaign.length, limite: limit, tem_mais: offset + limit < perCampaign.length, proximo_cursor: offset + limit < perCampaign.length ? encodeCursor(scope,String(offset + limit)) : null }, campanhas_criadas: { anterior: created(a), atual: created(b) }, alteracoes: { disponivel: histories.every(h => h.disponivel), consulta: 'consultar_trafego_meta recurso=historico nos períodos indicados; campanha_id filtra a campanha e object_ids de filhos explicitamente vinculados no catálogo atual', resumo: histories.map(h => ({ periodo: h.periodo, eventos_consultados: h.eventos?.length ?? null, tipos: h.eventos ? [...new Set(h.eventos.map((x: Row) => x.event_type))] : null, por_categoria: h.eventos ? summarizeChanges(h.eventos) : null, exemplos: h.eventos?.slice(0,20) ?? null, truncado: h.eventos?.length > 20 })) }, notas: ['Totais percorrem até 100 páginas por origem; cobertura informa interrupção. Comparação por conjunto para separar objetivos/otimizações/resultados/moedas/atribuição.', 'Sem linhas em um período significa ausência de linha reportada, não zero confirmado. Divisão por zero e dado ausente retornam null.', 'Segmentação e catálogo são fotografia atual, sem inferir configuração passada. Públicos personalizados são separados como potencial remarketing, sem afirmar intenção.', 'Histórico pode ter retenção/permissões limitadas. Nenhum evento não prova nenhuma alteração. Para pausas/orçamento/público/criativo, consultar eventos e detalhes.', 'Catálogo não garante objetos excluídos. Campanhas novas usam created_time, nunca apenas primeira impressão.', 'Alcance e frequência agregados são null para evitar soma de pessoas repetidas. Consulte nível=conta ou campanha e granularidade=periodo para alcance deduplicado.', 'Resultados de mídia não comprovam causa da queda comercial. IDs, datas e UTMs permitem cruzamento externo independente.'] };
  if (comparisonCache.size >= 5) comparisonCache.delete(comparisonCache.keys().next().value!);
  comparisonCache.set(cacheKey, { at: Date.now(), report });
  return comparisonPage(report,offset,limit,scope);
}
