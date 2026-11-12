import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { denyModule, loadModuleAccess, type McpActorLike } from './access.js';
import { decodeCursor, encodeCursor, ymd } from './metaTraffic.js';

export const researchInputSchema = z.object({
  cliente_id: z.string().uuid(),
  tipo: z.enum(['origens', 'observacoes', 'canais']),
  contact_id: z.string().uuid().optional().describe('Opcional para origens/observacoes; omitir pesquisa o cliente inteiro.'),
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Dia inicial YYYY-MM-DD em America/Sao_Paulo; apenas históricos.'),
  fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Dia final inclusivo YYYY-MM-DD em America/Sao_Paulo; apenas históricos.'),
  limite: z.number().int().min(1).max(500).optional(),
  cursor: z.string().max(12000).optional(),
});

type ResearchOptions = z.infer<typeof researchInputSchema>;
type Row = Record<string, unknown>;
const cursorStateSchema = z.object({
  snapshot: z.string().datetime(),
  read: z.number().int().nonnegative(),
  phase: z.number().int().min(0).max(1),
  position: z.object({ at: z.string().nullable(), id: z.string().min(1) }).nullable(),
  contactJid: z.string().optional(),
});
const ORIGIN_FIELDS = 'id,cliente_id,from_jid,source,message_id,origin_source,clicked_at,message_at,received_at,recorded_at,event_at,attribution';
const OBSERVATION_FIELDS = 'id,cliente_id,contact_id,body,kind,author_id,author_name,created_at';
const SOURCE_FIELDS = 'id,cliente_id,name,phone';
const CONFIG_FIELDS = 'id,cliente_id,name,provider,instance_status,created_at,updated_at,archived_at';
const ATTRIBUTION_FIELDS = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'gclid', 'fbclid', 'ctwa_clid', 'source_id', 'ad_id', 'planeje_click_id', 'planeje_link_id',
  'planeje_match_code', 'method', 'campaign_name', 'adset_name', 'ad_name']);
const localDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function dayBoundary(value?: string, next = false) {
  if (!value) return undefined;
  const utc = Date.parse(`${ymd(value)}T00:00:00Z`) + (next ? 86400000 : 0);
  const target = new Date(utc).toISOString().slice(0, 10);
  let low = utc - 86400000, high = utc + 86400000;
  // Search the civil-day boundary, including historical DST days without midnight.
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const parts = localDay.formatToParts(middle);
    const date = ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-');
    if (date < target) low = middle + 1;
    else high = middle;
  }
  return new Date(low).toISOString();
}

function safeAttribution(value: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'string') continue;
    if (ATTRIBUTION_FIELDS.has(key)) result[key] = item;
    if (key === 'source_url') {
      try {
        const url = new URL(item);
        if (url.protocol === 'http:' || url.protocol === 'https:') result[key] = url.origin + url.pathname;
      } catch { /* Invalid source URLs are not attribution evidence. */ }
    }
  }
  return result;
}

async function consultHistory(supabase: SupabaseClient, opts: ResearchOptions, actor?: McpActorLike) {
  if (opts.tipo === 'canais' && (opts.contact_id || opts.inicio || opts.fim)) {
    throw new Error('Canais é um catálogo atual do cliente; contact_id, inicio e fim aplicam-se apenas a origens/observacoes.');
  }
  const start = dayBoundary(opts.inicio), end = dayBoundary(opts.fim, true);
  if (start && end && start >= end) throw new Error('Período inválido: inicio deve ser anterior ou igual a fim.');
  const filters = { cliente_id: opts.cliente_id, tipo: opts.tipo, contact_id: opts.contact_id ?? null,
    inicio: opts.inicio ?? null, fim: opts.fim ?? null };
  const identity = actor?.type === 'user' ? { type: actor.type, user_id: actor.user_id, role: actor.role }
    : { type: actor?.type ?? 'anon' };
  const scope = JSON.stringify({ leitor: 'historico-cliente-v1', ...filters, actor: identity });
  const decoded = decodeCursor(scope, opts.cursor);
  const state = decoded ? cursorStateSchema.parse(JSON.parse(decoded))
    : { snapshot: new Date().toISOString(), read: 0, phase: 0, position: null, contactJid: undefined } as z.infer<typeof cursorStateSchema>;
  const access = await loadModuleAccess(supabase, actor);
  const denied = denyModule(access, opts.tipo === 'observacoes' ? 'mini_crm' : 'rastreamento');
  if (denied) throw new Error(denied);
  const client = await supabase.from('clientes').select('id').eq('id', opts.cliente_id).maybeSingle();
  if (client.error || !client.data) throw new Error('Cliente não encontrado ou indisponível.');
  if (opts.contact_id) {
    const contact = await supabase.from('cliente_whatsapp_contact').select('id,from_jid')
      .eq('cliente_id', opts.cliente_id).eq('id', opts.contact_id).maybeSingle();
    if (contact.error || !contact.data) throw new Error('Contato não encontrado ou indisponível neste cliente.');
    if (opts.tipo === 'origens') {
      if (typeof contact.data.from_jid !== 'string' || !contact.data.from_jid) throw new Error('Contato sem vínculo de origem disponível.');
      if (state.contactJid && state.contactJid !== contact.data.from_jid) throw new Error('Vínculo do contato mudou. Reinicie a consulta.');
      state.contactJid = contact.data.from_jid;
    }
  }
  const limit = opts.limite ?? 100;
  let rows: Row[] = [], source = '';
  const phases = opts.tipo === 'origens' ? 1 : 2;
  while (state.phase < phases) {
    const origins = opts.tipo === 'origens', observations = opts.tipo === 'observacoes';
    const undated = observations && state.phase === 1;
    source = origins ? 'contact_attribution_history' : observations ? 'mini_crm_observation_history'
      : state.phase === 0 ? 'mini_crm_message_sources' : 'cliente_whatsapp_config';
    const fields = origins ? ORIGIN_FIELDS : observations ? OBSERVATION_FIELDS : state.phase === 0 ? SOURCE_FIELDS : CONFIG_FIELDS;
    let query = supabase.from(source).select(fields).eq('cliente_id', opts.cliente_id);
    const time = origins ? 'event_at' : 'created_at';
    if (origins || observations) {
      if (opts.contact_id) query = origins ? query.eq('from_jid', state.contactJid!) : query.eq('contact_id', opts.contact_id);
      if (undated) query = query.is('created_at', null);
      else {
        query = query.lte(origins ? 'recorded_at' : 'created_at', state.snapshot);
        if (start) query = query.gte(time, start);
        if (end) query = query.lt(time, end);
        query = query.order(time, { ascending: true });
      }
    } else if (state.phase === 1) query = query.lte('created_at', state.snapshot);
    const position = state.position;
    if (position) {
      if ((origins || observations) && !undated) {
        if (!position.at || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(position.at)
          || !Number.isFinite(Date.parse(position.at)) || !z.string().uuid().safeParse(position.id).success) {
          throw new Error('Posição histórica inválida. Reinicie a consulta.');
        }
        query = query.or(`${time}.gt.${position.at},and(${time}.eq.${position.at},id.gt.${position.id})`);
      } else query = query.gt('id', position.id);
    }
    const result = await query.order('id', { ascending: true }).limit(limit);
    if (result.error) throw new Error(`Não foi possível ler ${source}; pesquisa incompleta. Repita com o mesmo cursor.`);
    rows = (result.data ?? []) as unknown as Row[];
    if (rows.length) {
      const last = rows.at(-1)!;
      if (typeof last.id !== 'string' || ((origins || observations) && !undated && typeof last[time] !== 'string')) {
        throw new Error('Registro histórico sem posição válida; pesquisa incompleta.');
      }
      state.position = { id: last.id, at: (origins || observations) && !undated ? last[time] as string : null };
      break;
    }
    // Only an empty page proves exhaustion when PostgREST imposes a lower row cap.
    state.phase++;
    state.position = null;
  }
  const finished = state.phase >= phases;
  state.read += rows.length;
  const next = finished ? null : encodeCursor(scope, JSON.stringify(state));
  const channels = opts.tipo === 'canais';
  return {
    versao_schema: '1.0', filtros: filters,
    dados: rows.map(row => ({ ...row, fonte: source,
      ...(opts.tipo === 'origens' ? { attribution: safeAttribution(row.attribution) } : {}),
      ...(opts.tipo === 'observacoes' ? { data_indisponivel: row.created_at == null } : {}),
    })),
    cobertura: {
      somente_registros_existentes: true, captura_historica_completa: null,
      catalogo_atual: channels, snapshot_registros: state.snapshot,
      periodo: { inicio_inclusivo: start ?? null, fim_exclusivo: end ?? null, fuso: 'America/Sao_Paulo' },
      observacoes_sem_data: opts.tipo === 'observacoes' ? 'incluidas_sem_atribuicao_ao_periodo' : null,
      ausencia_de_registros: finished && state.read === 0,
    },
    paginacao: { limite: limit, retornados: rows.length, total_lidos: state.read, concluido: finished,
      tem_mais: !finished, proximo_cursor: next },
    continuacao: next ? { ferramenta: 'consultar_historico_cliente', argumentos: { ...opts, limite: limit, cursor: next } } : null,
    notas: [
      'Siga o cursor até concluido=true. total_lidos conta registros retornados nesta pesquisa, não o universo histórico.',
      'A consulta lê apenas registros existentes. Ausência de registro não comprova ausência de atividade; captura histórica completa não foi demonstrada.',
      channels ? 'Os canais são o catálogo atual de fontes e configurações. Cadastro, conexão e estado não comprovam mensagens capturadas nem cobertura histórica.'
        : 'O snapshot é um corte de registros, não uma transação imutável. Exclusões e alterações posteriores podem afetar a pesquisa.',
      ...(opts.tipo === 'observacoes' ? ['Observações legadas sem data aparecem após as datadas, mesmo com período; sua ocorrência no período e seu corte de snapshot são desconhecidos.'] : []),
      ...(channels ? ['O catálogo de fontes não possui datas de criação; mudanças durante a paginação podem alterar os resultados.'] : []),
    ],
  };
}

export function registerResearchTools(mcp: McpServer, supabase: SupabaseClient, actor?: McpActorLike): void {
  mcp.registerTool('consultar_historico_cliente', {
    title: 'Consultar histórico do cliente',
    description: 'Pesquisa somente leitura por cliente: origens, observacoes integrais ou catálogo atual de canais. contact_id opcional pesquisa um contato; omitir percorre o cliente. Sem teto total: siga cursor até paginacao.concluido=true. inicio/fim são dias de São Paulo. Canais não aceita contato/período e não comprova captura completa; observações legadas sem data são identificadas separadamente.',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: researchInputSchema,
  }, async args => {
    try {
      const opts = researchInputSchema.parse(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(await consultHistory(supabase, opts, actor), null, 2) }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: error instanceof z.ZodError ? 'Parâmetros ou cursor inválidos.'
        : error instanceof Error ? error.message : 'Não foi possível consultar o histórico.' }], isError: true as const };
    }
  });
}
