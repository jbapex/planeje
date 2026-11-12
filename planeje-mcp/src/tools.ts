import { installToolAuthorization } from './toolAuthorization.js';
import { registerResearchTools } from './researchTools.js';
import { loadClientesLista } from './clienteDossie.js';
import { registerMetaTrafficTools } from './metaTrafficTools.js';
import { requireTraffic, ymd } from './metaTraffic.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  type TableColumnMap,
  introspectColumns,
  pickExistingColumns,
} from './introspect.js';
import { registerAtendimentoTools } from './atendimentoTools.js';
import { registerHubTools } from './hubTools.js';
import { registerMetaTools } from './metaTools.js';
import { computeCoberturaFromRows, monthBounds } from './coberturaMensal.js';
import {
  emptyRespostas,
  mergeRespostas,
  newBriefingToken,
  normalizePerguntasInput,
  publicBriefingUrl,
  validatePerguntas,
} from './briefingCliente.js';

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

function buildInsertRow(
  columns: TableColumnMap,
  table: string,
  row: Record<string, unknown>
): Record<string, unknown> {
  const allowed = new Set(columns[table] ?? []);
  if (allowed.size === 0) return row;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (allowed.has(k) && v !== undefined) out[k] = v;
  }
  return out;
}

/** Valores expostos pelo MCP → valores usados na tabela `solicitacoes` do Planeje. */
function normalizeSolicitacaoStatusParaDb(status: string): string {
  const map: Record<string, string> = {
    em_analise: 'analise',
    cancelada: 'rejeitada',
  };
  return map[status] ?? status;
}

async function getSolicitacoesTable(supabase: SupabaseClient): Promise<string> {
  for (const t of ['solicitacoes', 'task_solicitations'] as const) {
    const { error } = await supabase.from(t).select('id').limit(1);
    if (!error) return t;
  }
  throw new Error('Tabela de solicitações não encontrada');
}

/** Primeira tabela da lista que existir no PostgREST (probe com select limit 1). */
async function firstExistingTable(
  supabase: SupabaseClient,
  tables: readonly string[]
): Promise<string> {
  for (const t of tables) {
    const { error } = await supabase.from(t).select('*').limit(1);
    if (!error) return t;
  }
  throw new Error(`Nenhuma das tabelas encontrada: ${tables.join(', ')}`);
}

async function getMembrosTable(supabase: SupabaseClient): Promise<string> {
  return firstExistingTable(supabase, ['profiles', 'team_members']);
}

/** Padrão seguro para uso em filtros PostgREST `ilike` (evita quebra do `.or()` por vírgula). */
function padraoIlike(term: string): string {
  const t = term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/,/g, ' ');
  return `%${t}%`;
}

function mapCampanhaPagaFields(
  allowed: Set<string>,
  src: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    if (v === undefined) continue;
    if (k === 'objetivo') {
      if (allowed.has('objetivo')) out.objetivo = v;
      else if (allowed.has('description')) out.description = v;
      continue;
    }
    if (k === 'orcamento') {
      if (allowed.has('budget')) out.budget = v;
      else if (allowed.has('orcamento')) out.orcamento = v;
      continue;
    }
    if (allowed.has(k)) out[k] = v;
  }
  return out;
}

const JOSIAS_USER_ID = '07d65b46-dd33-4ce6-a98f-8940374c534c';

const entregaveisClienteSchema = z
  .object({
    posts: z.number().optional(),
    videos: z.number().optional(),
    stories: z.number().optional(),
    anuncios: z.number().optional(),
    carrosseis: z.number().optional(),
  })
  .optional();

const etapaClienteSchema = z.enum(['prospect', 'negotiation', 'closed', 'lost']).optional();

const camposClienteCriarSchema = {
  empresa: z.string().min(1),
  nome_contato: z.string().optional(),
  responsavel: z.string().uuid().optional(),
  etapa: etapaClienteSchema,
  nicho: z.string().optional(),
  instagram: z.string().optional(),
  tipo_contrato: z.string().optional(),
  valor: z.number().optional(),
  vencimento: z.string().optional(),
  publico_alvo: z.string().optional(),
  tom_de_voz: z.string().optional(),
  sobre_empresa: z.string().optional(),
  etiquetas: z.array(z.string()).optional(),
  tipo_servico: z.string().optional(),
  entregaveis: entregaveisClienteSchema,
};

const camposClienteAtualizarExtras = {
  objetivo_meta: z.string().optional(),
  meta_custo_mensagem: z.number().optional(),
  meta_custo_compra: z.number().optional(),
  roas_alvo: z.number().optional(),
  limite_meta: z.number().optional(),
};

const solicitacaoPrioritySchema = z.enum(['baixa', 'media', 'alta']).optional();
const solicitacaoStatusSchema = z
  .enum(['aberta', 'em_analise', 'concluida', 'cancelada'])
  .optional();

const membroStatusSchema = z.enum(['ativo', 'inativo']).optional();

const EQUIPE_ROLES = ['admin', 'colaborador', 'superadmin'] as const;

export type PlanejeToolsActor =
  | { type: 'user'; user_id: string; role: string }
  | { type: 'admin_key' }
  | { type: 'anon' };

/** Data civil de hoje em America/Sao_Paulo (YYYY-MM-DD). */
function todayYmdSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

/** Dias de atraso: 0 se due_date >= hoje; null se sem data. */
function diasAtraso(dueDate: unknown, today = todayYmdSaoPaulo()): number | null {
  if (typeof dueDate !== 'string' || !dueDate.trim()) return null;
  const d = dueDate.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  if (d >= today) return 0;
  const t0 = Date.parse(`${d}T12:00:00Z`);
  const t1 = Date.parse(`${today}T12:00:00Z`);
  if (Number.isNaN(t0) || Number.isNaN(t1)) return null;
  return Math.max(0, Math.round((t1 - t0) / 86_400_000));
}

function briefingFilaFromClienteStatus(status: unknown): string {
  const s = String(status ?? 'rascunho').toLowerCase();
  if (s === 'enviado') return 'aguardando_cliente';
  if (s === 'completo') return 'completo';
  return 'aguardando_equipe';
}

async function loadEmpresaByClientIds(
  supabase: SupabaseClient,
  clientIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ids = [...new Set(clientIds.filter(Boolean))];
  if (ids.length === 0) return map;
  const { data } = await supabase.from('clientes').select('id,empresa').in('id', ids);
  for (const c of data ?? []) {
    const rec = c as { id?: string; empresa?: string | null };
    if (rec.id) map.set(rec.id, rec.empresa ?? '');
  }
  return map;
}

async function loadPeopleByIds(
  supabase: SupabaseClient,
  columns: TableColumnMap,
  ids: string[]
): Promise<Map<string, { id: string; full_name: string; role: string | null }>> {
  const map = new Map<string, { id: string; full_name: string; role: string | null }>();
  const uniq = [...new Set(ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))];
  if (uniq.length === 0) return map;

  const profileCols = pickExistingColumns('profiles', columns, ['id', 'full_name', 'role', 'nome', 'name']);
  if (profileCols.includes('id')) {
    const selectStr = profileCols.join(',');
    const { data } = await supabase.from('profiles').select(selectStr).in('id', uniq);
    for (const p of data ?? []) {
      const rec = p as unknown as Record<string, unknown>;
      const id = String(rec.id ?? '');
      if (!id) continue;
      const full_name = String(rec.full_name ?? rec.nome ?? rec.name ?? id);
      const role = typeof rec.role === 'string' ? rec.role : null;
      map.set(id, { id, full_name, role });
    }
  }

  const missing = uniq.filter((id) => !map.has(id));
  const teamCols = columns.team_members ?? [];
  if (missing.length && teamCols.length) {
    const idCol = teamCols.includes('id') ? 'id' : teamCols.includes('user_id') ? 'user_id' : 'id';
    const namePick = pickExistingColumns('team_members', columns, ['full_name', 'nome', 'name']);
    const nameCol = namePick[0] ?? 'full_name';
    const { data } = await supabase.from('team_members').select('*').in(idCol, missing);
    for (const m of data ?? []) {
      const rec = m as Record<string, unknown>;
      const id = String(rec[idCol] ?? '');
      if (!id || map.has(id)) continue;
      map.set(id, {
        id,
        full_name: String(rec[nameCol] ?? id),
        role: typeof rec.role === 'string' ? rec.role : null,
      });
    }
  }

  return map;
}

async function enrichTarefasRows(
  supabase: SupabaseClient,
  columns: TableColumnMap,
  rows: Record<string, unknown>[],
  today = todayYmdSaoPaulo()
): Promise<Record<string, unknown>[]> {
  const clientIds = rows
    .map((r) => (typeof r.client_id === 'string' ? r.client_id : ''))
    .filter(Boolean);
  const assigneeIds: string[] = [];
  for (const r of rows) {
    const aids = r.assignee_ids;
    if (Array.isArray(aids)) {
      for (const a of aids) if (typeof a === 'string') assigneeIds.push(a);
    }
    if (typeof r.owner_id === 'string') assigneeIds.push(r.owner_id);
  }

  const [empresas, people] = await Promise.all([
    loadEmpresaByClientIds(supabase, clientIds),
    loadPeopleByIds(supabase, columns, assigneeIds),
  ]);

  return rows.map((r) => {
    const aids = Array.isArray(r.assignee_ids)
      ? r.assignee_ids.filter((x): x is string => typeof x === 'string')
      : [];
    const assignee_names = aids.map((id) => people.get(id)?.full_name ?? id);
    const clientId = typeof r.client_id === 'string' ? r.client_id : null;
    return {
      ...r,
      empresa: clientId ? (empresas.get(clientId) ?? null) : null,
      assignee_names,
      dias_atraso: diasAtraso(r.due_date, today),
    };
  });
}

/** Briefing de cliente (`cliente_briefings`) — registrado primeiro para o ChatGPT não descartar no limite de tools. */
function registerBriefingClienteTools(
  mcp: McpServer,
  supabase: SupabaseClient,
  columns: TableColumnMap,
  actor?: PlanejeToolsActor
): void {
  mcp.registerTool(
    'listar_briefings',
    {
      title: 'Listar briefings de cliente',
      description:
        'Lista questionários em cliente_briefings (aba Briefing do cadastro). Não é briefing de tarefa. Fila: aguardando_equipe (rascunho), aguardando_cliente (enviado), completo.',
      inputSchema: z.object({
        fila: z.enum(['aguardando_equipe', 'aguardando_cliente', 'completo', 'todos']).optional(),
        cliente_id: z.string().optional(),
        limite: z.number().int().positive().max(300).optional(),
      }),
    },
    async ({ fila, cliente_id, limite }) => {
      try {
        const n = limite ?? 100;
        const filtroFila = fila ?? 'todos';
        const statusMap: Record<string, string | null> = {
          aguardando_equipe: 'rascunho',
          aguardando_cliente: 'enviado',
          completo: 'completo',
          todos: null,
        };
        const statusDb = statusMap[filtroFila];

        let q = supabase
          .from('cliente_briefings')
          .select('id, cliente_id, owner_id, status, titulo, token, perguntas, created_at, updated_at, clientes(empresa)')
          .order('updated_at', { ascending: false })
          .limit(n);
        if (cliente_id) q = q.eq('cliente_id', cliente_id);
        if (statusDb) q = q.eq('status', statusDb);

        const { data, error } = await q;
        if (error) throw new Error(`Supabase (listar_briefings): ${error.message}`);

        const ownerIds = (data ?? [])
          .map((b) => (b as { owner_id?: string }).owner_id)
          .filter((id): id is string => typeof id === 'string');
        const people = await loadPeopleByIds(supabase, columns, ownerIds);

        const briefings = (data ?? []).map((raw) => {
          const b = raw as Record<string, unknown>;
          const status = b.status;
          const ownerId = typeof b.owner_id === 'string' ? b.owner_id : null;
          const clientes = b.clientes as { empresa?: string } | null;
          return {
            id: b.id,
            cliente_id: b.cliente_id,
            empresa: clientes?.empresa ?? null,
            titulo: b.titulo,
            status,
            fila: briefingFilaFromClienteStatus(status),
            token: b.token,
            link_publico: typeof b.token === 'string' ? publicBriefingUrl(b.token) : null,
            qtd_perguntas: Array.isArray(b.perguntas) ? b.perguntas.length : 0,
            owner_id: ownerId,
            owner_name: ownerId ? (people.get(ownerId)?.full_name ?? null) : null,
            created_at: b.created_at,
            updated_at: b.updated_at,
          };
        });

        const contagem = {
          aguardando_equipe: briefings.filter((b) => b.fila === 'aguardando_equipe').length,
          aguardando_cliente: briefings.filter((b) => b.fila === 'aguardando_cliente').length,
          completo: briefings.filter((b) => b.fila === 'completo').length,
        };

        return jsonText({
          filtro_fila: filtroFila,
          total: briefings.length,
          contagem,
          mapa_status: {
            rascunho: 'aguardando_equipe',
            enviado: 'aguardando_cliente',
            completo: 'completo',
          },
          briefings,
        });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'criar_briefing',
    {
      title: 'Criar briefing do cliente',
      description:
        'Cria o questionário na aba Briefing do cadastro (cliente_briefings). NÃO cria tarefa. cliente_id obrigatório. Sem perguntas_json usa o modelo padrão de 12 perguntas. status inicial rascunho. Devolve link /#/b/{token}.',
      inputSchema: z.object({
        cliente_id: z.string().min(1).describe('UUID do cliente'),
        titulo: z.string().optional(),
        perguntas_json: z
          .string()
          .optional()
          .describe('JSON opcional: array de {texto, categoria?, tipo?}. Vazio = 12 perguntas padrão.'),
        owner_id: z.string().optional(),
      }),
    },
    async ({ cliente_id, titulo, perguntas_json, owner_id }) => {
      try {
        const { data: cliente, error: clienteError } = await supabase
          .from('clientes')
          .select('id, empresa')
          .eq('id', cliente_id)
          .maybeSingle();
        if (clienteError) throw new Error(`Supabase (criar_briefing): ${clienteError.message}`);
        if (!cliente) throw new Error('criar_briefing: cliente_id não encontrado.');

        let perguntasRaw: unknown;
        if (perguntas_json?.trim()) {
          try {
            perguntasRaw = JSON.parse(perguntas_json);
          } catch {
            throw new Error('criar_briefing: perguntas_json não é um JSON válido.');
          }
        }
        const perguntasNorm = normalizePerguntasInput(perguntasRaw);
        const valid = validatePerguntas(perguntasNorm);
        if (!valid.ok) throw new Error(`criar_briefing: ${valid.reason ?? 'perguntas inválidas'}`);

        const ownerId =
          owner_id
          ?? (actor?.type === 'user' ? actor.user_id : null)
          ?? JOSIAS_USER_ID;
        const token = newBriefingToken();
        const base: Record<string, unknown> = {
          cliente_id,
          owner_id: ownerId,
          titulo: (titulo ?? 'Briefing').trim() || 'Briefing',
          status: 'rascunho',
          perguntas: perguntasNorm,
          respostas: emptyRespostas(perguntasNorm),
          token,
        };
        const row = buildInsertRow(columns, 'cliente_briefings', base);
        const { data, error } = await supabase
          .from('cliente_briefings')
          .insert(row)
          .select()
          .single();
        if (error) throw new Error(`Supabase (criar_briefing): ${error.message}`);

        return jsonText({
          briefing: data,
          empresa: cliente.empresa ?? null,
          fila: 'aguardando_equipe',
          personalizado: Boolean(perguntasRaw),
          qtd_perguntas: perguntasNorm.length,
          link_publico: publicBriefingUrl(token),
        });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'atualizar_briefing',
    {
      title: 'Atualizar briefing do cliente',
      description:
        'Atualiza um briefing em cliente_briefings (não é tarefa). id obrigatório. status: rascunho|enviado|completo. perguntas_json substitui o questionário; respostas_json só das perguntas atuais.',
      inputSchema: z.object({
        id: z.string().min(1).describe('UUID do briefing'),
        titulo: z.string().optional(),
        perguntas_json: z.string().optional().describe('JSON array de {texto, categoria?, tipo?}'),
        respostas_json: z.string().optional().describe('JSON objeto id_pergunta → resposta'),
        status: z.enum(['rascunho', 'enviado', 'completo']).optional(),
      }),
    },
    async ({ id, titulo, perguntas_json, respostas_json, status }) => {
      try {
        const { data: atual, error: loadError } = await supabase
          .from('cliente_briefings')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (loadError) throw new Error(`Supabase (atualizar_briefing): ${loadError.message}`);
        if (!atual) throw new Error('atualizar_briefing: briefing não encontrado.');

        let perguntasIncoming: unknown;
        if (perguntas_json?.trim()) {
          try {
            perguntasIncoming = JSON.parse(perguntas_json);
          } catch {
            throw new Error('atualizar_briefing: perguntas_json não é um JSON válido.');
          }
        }
        let respostasIncoming: Record<string, unknown> | null = null;
        if (respostas_json?.trim()) {
          try {
            const parsed = JSON.parse(respostas_json);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
              throw new Error('atualizar_briefing: respostas_json deve ser um objeto JSON.');
            }
            respostasIncoming = parsed as Record<string, unknown>;
          } catch (e) {
            if (e instanceof Error && e.message.startsWith('atualizar_briefing:')) throw e;
            throw new Error('atualizar_briefing: respostas_json não é um JSON válido.');
          }
        }

        const perguntasNorm = perguntasIncoming
          ? normalizePerguntasInput(perguntasIncoming)
          : normalizePerguntasInput(atual.perguntas);
        const valid = validatePerguntas(perguntasNorm);
        if (!valid.ok) throw new Error(`atualizar_briefing: ${valid.reason ?? 'perguntas inválidas'}`);

        const patch: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };
        if (titulo !== undefined) patch.titulo = titulo.trim() || 'Briefing';
        if (status !== undefined) patch.status = status;
        if (perguntasIncoming) patch.perguntas = perguntasNorm;
        if (perguntasIncoming || respostasIncoming) {
          patch.respostas = mergeRespostas(
            perguntasNorm,
            (respostasIncoming ?? (atual.respostas as Record<string, unknown> | null)) as Record<string, unknown>
          );
        }

        const row = buildInsertRow(columns, 'cliente_briefings', patch);
        const { data, error } = await supabase
          .from('cliente_briefings')
          .update(row)
          .eq('id', id)
          .select()
          .single();
        if (error) throw new Error(`Supabase (atualizar_briefing): ${error.message}`);

        const token = typeof data?.token === 'string' ? data.token : null;
        return jsonText({
          briefing: data,
          fila: briefingFilaFromClienteStatus(data?.status),
          qtd_perguntas: perguntasNorm.length,
          link_publico: token ? publicBriefingUrl(token) : null,
        });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );
}

/** Caixa + Caixa Dot — registrado cedo para o ChatGPT não descartar no limite de ~55 tools. */
function registerCaixaDotTools(
  mcp: McpServer,
  supabase: SupabaseClient,
  actor?: PlanejeToolsActor
): void {
  mcp.registerTool(
    'listar_caixa',
    {
      title: 'Listar Minha caixa',
      description:
        'Lista as três filas da Caixa: pedidos_internos, cliente_sem_resposta e respondido_hoje. Só profile status=active entra; pending devolve vazio. Título de grupo = display_name; empresa = cliente representado (nunca JB APEX). Arquivada/expirada ficam fora do badge. Pedido explícito de cliente não some em 7 dias. Em sessão pessoal usa o autenticado; admin/superadmin pode informar pessoa_id.',
      inputSchema: z.object({
        pessoa_id: z.string().uuid().optional(),
      }),
    },
    async ({ pessoa_id }) => {
      try {
        const actorId = actor?.type === 'user' ? actor.user_id : null;
        const actorRole = actor?.type === 'user' ? actor.role : null;
        const target = pessoa_id ?? actorId;

        if (!target) {
          throw new Error('listar_caixa: informe pessoa_id ao usar autenticação administrativa.');
        }
        if (
          actor?.type === 'user'
          && target !== actorId
          && !['admin', 'superadmin'].includes(actorRole ?? '')
        ) {
          throw new Error('listar_caixa: colaborador só pode consultar a própria caixa.');
        }

        const { data, error } = await supabase.rpc('listar_pendencias_caixa', {
          p_pessoa_id: target,
        });
        if (error) throw new Error(`Supabase (listar_caixa): ${error.message}`);
        return jsonText(data);
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'agir_pendencia_caixa',
    {
      title: 'Agir em pendência da caixa',
      description:
        'Executa estou_nisso, feito, nao_e_comigo ou arquivar em um item da Caixa. arquivar some da fila aberta e não muda atendimento_conversas.status. feito encerra a conversa. nao_e_comigo desatribui.',
      inputSchema: z.object({
        id: z.string().uuid(),
        acao: z.enum(['estou_nisso', 'feito', 'nao_e_comigo', 'arquivar']),
        actor_id: z.string().uuid().optional(),
      }),
    },
    async ({ id, acao, actor_id }) => {
      try {
        const sessionActorId = actor?.type === 'user' ? actor.user_id : null;
        const effectiveActorId = sessionActorId ?? actor_id;
        if (!effectiveActorId) {
          throw new Error(
            'agir_pendencia_caixa: actor_id é obrigatório ao usar autenticação administrativa.'
          );
        }
        if (actor?.type === 'user' && actor_id && actor_id !== sessionActorId) {
          throw new Error('agir_pendencia_caixa: actor_id deve ser o usuário autenticado.');
        }

        const { data, error } = await supabase.rpc('agir_pendencia_caixa', {
          p_id: id,
          p_acao: acao,
          p_actor_id: effectiveActorId,
        });
        if (error) throw new Error(`Supabase (agir_pendencia_caixa): ${error.message}`);
        return jsonText(data);
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'criar_demanda_caixa',
    {
      title: 'Criar demanda na Caixa Dot',
      description:
        'Cria um tópico Demanda na Minha caixa (#/caixa → Dot) para um colaborador. Informe profile_id OU nome (full_name). Campos: titulo, corpo, prioridade opcional (baixa|normal|alta), cliente_id, task_id, href. Não envia WhatsApp nem chama IA. O histórico fica no Planeje.',
      inputSchema: z.object({
        titulo: z.string().min(1).max(200),
        corpo: z.string().min(1).max(8000),
        profile_id: z.string().uuid().optional(),
        nome: z.string().min(1).max(120).optional(),
        prioridade: z.enum(['baixa', 'normal', 'alta']).optional(),
        cliente_id: z.string().uuid().optional(),
        task_id: z.string().uuid().optional(),
        href: z.string().max(500).optional(),
      }),
    },
    async (args) => {
      try {
        if (!args.profile_id && !args.nome) {
          return toolError('Informe profile_id ou nome do destinatário.');
        }

        let ownerId = args.profile_id ?? null;
        let ownerName: string | null = null;
        if (ownerId) {
          const { data: person, error: personError } = await supabase
            .from('profiles')
            .select('id, full_name, role, status')
            .eq('id', ownerId)
            .maybeSingle();
          if (personError) throw new Error(personError.message);
          if (!person) return toolError('profile_id não encontrado.');
          if (!['superadmin', 'admin', 'colaborador'].includes(String(person.role || ''))) {
            return toolError('Destinatário precisa ser da equipe interna.');
          }
          ownerName = person.full_name || null;
        } else {
          const nome = String(args.nome || '').trim();
          const { data: matches, error: matchError } = await supabase
            .from('profiles')
            .select('id, full_name, role, status')
            .ilike('full_name', nome)
            .in('role', ['superadmin', 'admin', 'colaborador'])
            .limit(5);
          if (matchError) throw new Error(matchError.message);
          const rows = matches || [];
          if (rows.length === 0) {
            const { data: soft, error: softError } = await supabase
              .from('profiles')
              .select('id, full_name, role, status')
              .ilike('full_name', `%${nome}%`)
              .in('role', ['superadmin', 'admin', 'colaborador'])
              .limit(5);
            if (softError) throw new Error(softError.message);
            const [person] = soft ?? [];
            if (!person) return toolError(`Nenhuma pessoa da equipe com nome parecido com "${nome}".`);
            if (soft.length > 1) {
              return toolError(
                `Várias pessoas batem com "${nome}": ${soft.map((p) => `${p.full_name} (${p.id})`).join('; ')}. Use profile_id.`
              );
            }
            ownerId = person.id;
            ownerName = person.full_name || null;
          } else if (rows.length > 1) {
            return toolError(
              `Várias pessoas com esse nome: ${rows.map((p) => `${p.full_name} (${p.id})`).join('; ')}. Use profile_id.`
            );
          } else {
            const [person] = rows;
            if (!person) return toolError(`Nenhuma pessoa da equipe com nome parecido com "${nome}".`);
            ownerId = person.id;
            ownerName = person.full_name || null;
          }
        }

        const actorLabel =
          actor?.type === 'user'
            ? actor.user_id
            : actor?.type === 'admin_key'
              ? 'admin_key'
              : 'mcp';
        const createdById = actor?.type === 'user' ? actor.user_id : null;
        const title = String(args.titulo).replace(/\s+/g, ' ').trim();
        const body = String(args.corpo).trim();
        const preview = body.length > 160 ? `${body.slice(0, 159)}…` : body;

        const { data: thread, error: threadError } = await supabase
          .from('caixa_dot_threads')
          .insert({
            owner_id: ownerId,
            kind: 'demanda',
            origin: 'mcp',
            title,
            status: 'aberta',
            priority: args.prioridade || 'normal',
            cliente_id: args.cliente_id || null,
            task_id: args.task_id || null,
            href: args.href || null,
            created_by_kind: 'mcp',
            created_by_id: createdById,
            created_by_label: actorLabel,
            last_message_preview: preview,
            unread_for_owner: true,
          })
          .select('id, owner_id, title, status, priority, created_at')
          .single();
        if (threadError) throw new Error(`Supabase (caixa_dot_threads): ${threadError.message}`);

        const { data: message, error: messageError } = await supabase
          .from('caixa_dot_messages')
          .insert({
            thread_id: thread.id,
            role: 'system',
            body,
            meta: { origem: 'mcp', criado_por: actorLabel },
            created_by_id: createdById,
          })
          .select('id, created_at')
          .single();
        if (messageError) throw new Error(`Supabase (caixa_dot_messages): ${messageError.message}`);

        return jsonText({
          thread_id: thread.id,
          message_id: message.id,
          owner_id: ownerId,
          owner_name: ownerName,
          title: thread.title,
          status: thread.status,
          prioridade: thread.priority,
          rota: '/caixa',
          nota: 'Demanda criada na Caixa Dot. Sem WhatsApp. O Dot responde no app (#/caixa), não pelo ChatGPT.',
        });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'listar_demandas_caixa',
    {
      title: 'Listar demandas da Caixa Dot',
      description:
        'Lista tópicos da Caixa Dot. Colaborador vê só os próprios. Admin/superadmin/admin_key vê a equipe (filtre com profile_id). Opcionais: status, limite (padrão 50, máx 200).',
      inputSchema: z.object({
        profile_id: z.string().uuid().optional(),
        status: z
          .enum(['aberta', 'aguardando_dot', 'respondido', 'feita', 'arquivada'])
          .optional(),
        limite: z.number().int().positive().max(200).optional(),
      }),
    },
    async ({ profile_id, status, limite }) => {
      try {
        const actorId = actor?.type === 'user' ? actor.user_id : null;
        const actorRole = actor?.type === 'user' ? actor.role : null;
        const isAdmin =
          actor?.type === 'admin_key' || ['admin', 'superadmin'].includes(actorRole ?? '');
        const target = profile_id ?? (isAdmin ? null : actorId);

        if (!isAdmin && profile_id && profile_id !== actorId) {
          return toolError('Colaborador só lista a própria Caixa Dot.');
        }
        if (!isAdmin && !actorId) {
          return toolError('Sessão sem usuário para listar a Caixa Dot.');
        }

        let q = supabase
          .from('caixa_dot_threads')
          .select(
            'id, owner_id, kind, origin, title, status, priority, cliente_id, task_id, href, created_by_kind, created_by_label, last_message_at, last_message_preview, unread_for_owner, created_at'
          )
          .order('last_message_at', { ascending: false })
          .limit(limite ?? 50);
        if (target) q = q.eq('owner_id', target);
        if (status) q = q.eq('status', status);
        else q = q.in('status', ['aberta', 'aguardando_dot', 'respondido']);

        const { data, error } = await q;
        if (error) throw new Error(`Supabase (listar_demandas_caixa): ${error.message}`);

        const ownerIds = [...new Set((data || []).map((row) => row.owner_id))];
        const names = new Map<string, string>();
        if (ownerIds.length) {
          const { data: people } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', ownerIds);
          for (const person of people || []) {
            names.set(person.id, person.full_name || person.id);
          }
        }

        const demandas = (data || []).map((row) => ({
          ...row,
          owner_name: names.get(row.owner_id) || null,
        }));

        return jsonText({
          total: demandas.length,
          filtro_owner: target,
          demandas,
        });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

}

export function registerPlanejeTools(
  mcp: McpServer,
  supabase: SupabaseClient,
  columns: TableColumnMap,
  actor?: PlanejeToolsActor
): void {
  installToolAuthorization(mcp, supabase, actor);
  registerResearchTools(mcp, supabase, actor);
  registerBriefingClienteTools(mcp, supabase, columns, actor);
  registerCaixaDotTools(mcp, supabase, actor);
  registerHubTools(mcp, supabase, actor);
  registerMetaTrafficTools(mcp, supabase, actor);

  mcp.registerTool(
    'listar_clientes',
    {
      title: 'Listar clientes',
      description: 'Lista registros da tabela clientes (limite configurável).',
      inputSchema: z.object({
        limite: z.number().int().positive().max(500).optional(),
      }),
    },
    async ({ limite }) => {
      try {
        const result = await loadClientesLista(supabase, { limite: limite ?? 200 });
        return jsonText({ ...result, total: result.clientes.length });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'criar_cliente',
    {
      title: 'Criar cliente',
      description:
        'INSERT em clientes. Obrigatório: empresa. Opcionais conforme schema. etapa: prospect | negotiation | closed | lost (padrão prospect). owner_id padrão Josias se a coluna existir. entregaveis: objeto com posts, videos, stories, anuncios, carrosseis (números opcionais).',
      inputSchema: z.object(camposClienteCriarSchema),
    },
    async (args) => {
      try {
        const allowed = introspectColumns('clientes', columns);
        const row: Record<string, unknown> = {
          empresa: args.empresa,
          etapa: args.etapa ?? 'prospect',
        };

        if (args.nome_contato !== undefined) row.nome_contato = args.nome_contato === '' ? null : args.nome_contato;
        if (args.responsavel !== undefined) row.responsavel = args.responsavel ?? null;
        if (args.nicho !== undefined) row.nicho = args.nicho === '' ? null : args.nicho;
        if (args.instagram !== undefined) row.instagram = args.instagram === '' ? null : args.instagram;
        if (args.tipo_contrato !== undefined) row.tipo_contrato = args.tipo_contrato === '' ? null : args.tipo_contrato;
        if (args.valor !== undefined) row.valor = args.valor;
        if (args.vencimento !== undefined) row.vencimento = args.vencimento === '' ? null : args.vencimento;
        if (args.publico_alvo !== undefined) row.publico_alvo = args.publico_alvo === '' ? null : args.publico_alvo;
        if (args.tom_de_voz !== undefined) row.tom_de_voz = args.tom_de_voz === '' ? null : args.tom_de_voz;
        if (args.sobre_empresa !== undefined) row.sobre_empresa = args.sobre_empresa === '' ? null : args.sobre_empresa;
        if (args.etiquetas !== undefined) row.etiquetas = args.etiquetas;
        if (args.tipo_servico !== undefined) row.tipo_servico = args.tipo_servico === '' ? null : args.tipo_servico;
        if (args.entregaveis !== undefined && args.entregaveis != null) {
          row.entregaveis = args.entregaveis;
        }

        if (allowed.has('owner_id')) {
          row.owner_id = JOSIAS_USER_ID;
        }

        const filtered = buildInsertRow(columns, 'clientes', row);
        const { data, error } = await supabase.from('clientes').insert(filtered).select().maybeSingle();
        if (error) throw new Error(`Supabase (criar_cliente): ${error.message}`);
        if (!data) throw new Error('criar_cliente: não foi possível ler o registro após o insert.');
        return jsonText({ cliente: data });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'atualizar_cliente',
    {
      title: 'Atualizar cliente',
      description:
        'UPDATE em clientes por id. Todos os campos de criar_cliente como opcionais, mais objetivo_meta, meta_custo_mensagem, meta_custo_compra, roas_alvo, limite_meta. Campos filtrados pelo schema; updated_at se existir.',
      inputSchema: z.object({
        id: z.string().uuid(),
        empresa: z.string().min(1).optional(),
        nome_contato: z.string().optional(),
        responsavel: z.string().uuid().nullable().optional(),
        etapa: etapaClienteSchema,
        nicho: z.string().optional(),
        instagram: z.string().optional(),
        tipo_contrato: z.string().optional(),
        valor: z.number().nullable().optional(),
        vencimento: z.string().optional(),
        publico_alvo: z.string().optional(),
        tom_de_voz: z.string().optional(),
        sobre_empresa: z.string().optional(),
        etiquetas: z.array(z.string()).optional(),
        tipo_servico: z.string().optional(),
        entregaveis: entregaveisClienteSchema,
        ...camposClienteAtualizarExtras,
      }),
    },
    async (args) => {
      try {
        const { id, ...rest } = args;
        const allowed = introspectColumns('clientes', columns);
        const patch: Record<string, unknown> = {};

        if (rest.empresa !== undefined) patch.empresa = rest.empresa;
        if (rest.nome_contato !== undefined) patch.nome_contato = rest.nome_contato === '' ? null : rest.nome_contato;
        if (rest.responsavel !== undefined) patch.responsavel = rest.responsavel;
        if (rest.etapa !== undefined) patch.etapa = rest.etapa;
        if (rest.nicho !== undefined) patch.nicho = rest.nicho === '' ? null : rest.nicho;
        if (rest.instagram !== undefined) patch.instagram = rest.instagram === '' ? null : rest.instagram;
        if (rest.tipo_contrato !== undefined) patch.tipo_contrato = rest.tipo_contrato === '' ? null : rest.tipo_contrato;
        if (rest.valor !== undefined) patch.valor = rest.valor;
        if (rest.vencimento !== undefined) patch.vencimento = rest.vencimento === '' ? null : rest.vencimento;
        if (rest.publico_alvo !== undefined) patch.publico_alvo = rest.publico_alvo === '' ? null : rest.publico_alvo;
        if (rest.tom_de_voz !== undefined) patch.tom_de_voz = rest.tom_de_voz === '' ? null : rest.tom_de_voz;
        if (rest.sobre_empresa !== undefined) patch.sobre_empresa = rest.sobre_empresa === '' ? null : rest.sobre_empresa;
        if (rest.etiquetas !== undefined) patch.etiquetas = rest.etiquetas;
        if (rest.tipo_servico !== undefined) patch.tipo_servico = rest.tipo_servico === '' ? null : rest.tipo_servico;
        if (rest.entregaveis !== undefined && rest.entregaveis != null) {
          patch.entregaveis = rest.entregaveis;
        }
        if (rest.objetivo_meta !== undefined) patch.objetivo_meta = rest.objetivo_meta === '' ? null : rest.objetivo_meta;
        if (rest.meta_custo_mensagem !== undefined) patch.meta_custo_mensagem = rest.meta_custo_mensagem;
        if (rest.meta_custo_compra !== undefined) patch.meta_custo_compra = rest.meta_custo_compra;
        if (rest.roas_alvo !== undefined) patch.roas_alvo = rest.roas_alvo;
        if (rest.limite_meta !== undefined) patch.limite_meta = rest.limite_meta;

        const userKeys = Object.keys(patch).filter((k) => allowed.has(k));
        if (userKeys.length === 0) {
          throw new Error(
            'atualizar_cliente: nenhum campo válido foi informado. Envie ao menos um atributo que exista na tabela clientes (ex.: empresa, etapa, valor, entregaveis).'
          );
        }

        if (allowed.has('updated_at')) {
          patch.updated_at = new Date().toISOString();
        }

        const row = buildInsertRow(columns, 'clientes', patch);
        const substantive = Object.keys(row).filter((k) => k !== 'updated_at');
        if (substantive.length === 0) {
          throw new Error(
            'atualizar_cliente: os campos enviados não correspondem a colunas da tabela clientes neste ambiente (schema desatualizado?).'
          );
        }

        const { data, error } = await supabase.from('clientes').update(row).eq('id', id).select().maybeSingle();
        if (error) throw new Error(`Supabase (atualizar_cliente): ${error.message}`);
        if (!data) {
          throw new Error(
            'atualizar_cliente: nenhum cliente encontrado com este id, ou nenhuma linha foi atualizada.'
          );
        }
        return jsonText({ cliente: data });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'buscar_projeto',
    {
      title: 'Buscar projetos por cliente',
      description: 'Projetos do cliente (coluna client_id ou cliente_id conforme o schema introspectado).',
      inputSchema: z.object({
        cliente_id: z.string().uuid(),
        limite: z.number().int().positive().max(500).optional(),
      }),
    },
    async ({ cliente_id, limite }) => {
      const n = limite ?? 100;
      const cols = columns.projetos ?? [];
      const clientCol = cols.includes('client_id')
        ? 'client_id'
        : cols.includes('cliente_id')
          ? 'cliente_id'
          : 'client_id';
      const { data, error } = await supabase
        .from('projetos')
        .select('*')
        .eq(clientCol, cliente_id)
        .limit(n);
      if (error) return toolError(`Supabase (buscar_projeto): ${error.message}`);
      return jsonText({ filtro_coluna: clientCol, total: data?.length ?? 0, projetos: data });
    }
  );

  mcp.registerTool(
    'listar_tarefas',
    {
      title: 'Listar tarefas',
      description:
        'Lista tarefas enriquecidas: empresa (nome do cliente), assignee_names, dias_atraso. Paginação: limit padrão 20. Sem status informado, exclui concluídas (status ≠ completed). Filtros: client_id, project_id, status, responsavel_id (assignee_ids), cursor_due_date (due_date > cursor). Ordenação: due_date ascendente. Use listar_status_tarefas para values canônicos; listar_tarefas_atrasadas para só atrasadas.',
      inputSchema: z.object({
        client_id: z.string().uuid().optional(),
        project_id: z.string().uuid().optional(),
        status: z.string().optional(),
        limit: z.number().int().positive().max(500).optional(),
        responsavel_id: z.string().uuid().optional(),
        cursor_due_date: z.string().optional(),
      }),
    },
    async ({ client_id, project_id, status, limit, responsavel_id, cursor_due_date }) => {
      try {
        const n = limit ?? 20;
        const statusExplicito = status != null && String(status).trim() !== '';
        const tCols = introspectColumns('tarefas', columns);
        const today = todayYmdSaoPaulo();

        const taskCols = [
          'id',
          'title',
          'description',
          'status',
          'due_date',
          'project_id',
          'client_id',
          'owner_id',
          'type',
          'priority',
          'assignee_ids',
          'post_date',
          'plataforma',
          'briefing_estado',
          'briefing_completo',
        ];
        const selectList = pickExistingColumns('tarefas', columns, taskCols);
        const selectStr = selectList.length > 0 ? selectList.join(',') : '*';

        let q = supabase.from('tarefas').select(selectStr);
        if (client_id) q = q.eq('client_id', client_id);
        if (project_id && tCols.has('project_id')) q = q.eq('project_id', project_id);
        if (statusExplicito) {
          q = q.eq('status', String(status).trim());
        } else {
          q = q.neq('status', 'completed');
        }
        if (responsavel_id) q = q.contains('assignee_ids', [responsavel_id]);
        const cur = cursor_due_date?.trim();
        if (cur && tCols.has('due_date')) q = q.gt('due_date', cur);

        const { data, error } = await q.order('due_date', { ascending: true }).limit(n);
        if (error) throw new Error(`Supabase (listar_tarefas): ${error.message}`);

        const raw = (data ?? []) as unknown as Record<string, unknown>[];
        const rows = await enrichTarefasRows(supabase, columns, raw, today);
        let next_cursor: string | null = null;
        if (rows.length === n && rows.length > 0) {
          const dd = rows[rows.length - 1]?.due_date;
          next_cursor = typeof dd === 'string' && dd.length > 0 ? dd : null;
        }

        return jsonText({
          limite: n,
          hoje: today,
          exclui_completed_padrao: !statusExplicito,
          total: rows.length,
          tarefas: rows,
          next_cursor,
        });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'listar_tarefas_atrasadas',
    {
      title: 'Listar tarefas atrasadas',
      description:
        'Tarefas com due_date < hoje (America/Sao_Paulo) e status ≠ completed. Mesmo enriquecimento de listar_tarefas (empresa, assignee_names, dias_atraso).',
      inputSchema: z.object({
        client_id: z.string().uuid().optional(),
        responsavel_id: z.string().uuid().optional(),
        limit: z.number().int().positive().max(500).optional(),
      }),
    },
    async ({ client_id, responsavel_id, limit }) => {
      try {
        const n = limit ?? 50;
        const today = todayYmdSaoPaulo();
        const taskCols = [
          'id',
          'title',
          'description',
          'status',
          'due_date',
          'project_id',
          'client_id',
          'owner_id',
          'type',
          'priority',
          'assignee_ids',
          'post_date',
          'plataforma',
          'briefing_estado',
          'briefing_completo',
        ];
        const selectList = pickExistingColumns('tarefas', columns, taskCols);
        const selectStr = selectList.length > 0 ? selectList.join(',') : '*';

        let q = supabase
          .from('tarefas')
          .select(selectStr)
          .neq('status', 'completed')
          .lt('due_date', today);
        if (client_id) q = q.eq('client_id', client_id);
        if (responsavel_id) q = q.contains('assignee_ids', [responsavel_id]);

        const { data, error } = await q.order('due_date', { ascending: true }).limit(n);
        if (error) throw new Error(`Supabase (listar_tarefas_atrasadas): ${error.message}`);

        const raw = (data ?? []) as unknown as Record<string, unknown>[];
        const rows = await enrichTarefasRows(supabase, columns, raw, today);
        return jsonText({
          hoje: today,
          limite: n,
          total: rows.length,
          tarefas: rows,
        });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'listar_status_tarefas',
    {
      title: 'Listar status canônicos de tarefas',
      description:
        'Catálogo de task_statuses (value, label, color, sort_order). Use o campo value ao filtrar/atualizar tarefas — evita status inventados. Values “estranhos” (ex.: dezembro, uuid_scheduled) existem no banco e são canônicos neste ambiente.',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const cols = pickExistingColumns('task_statuses', columns, [
          'id',
          'value',
          'label',
          'color',
          'sort_order',
        ]);
        const selectStr = cols.length > 0 ? cols.join(',') : 'id,value,label,color,sort_order';
        let q = supabase.from('task_statuses').select(selectStr);
        if (cols.includes('sort_order')) q = q.order('sort_order', { ascending: true });
        const { data, error } = await q;
        if (error) throw new Error(`Supabase (listar_status_tarefas): ${error.message}`);
        return jsonText({
          total: data?.length ?? 0,
          statuses: data ?? [],
          nota: 'O value “completed” também é usado no histórico mesmo sem linha em task_statuses.',
        });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'resolver_pessoa',
    {
      title: 'Resolver pessoa por UUID',
      description:
        'Resolve um UUID órfão (assignee_ids, owner_id, etc.) para full_name + role em profiles (fallback team_members). Retorna encontrado=false se não existir.',
      inputSchema: z.object({
        id: z.string().uuid(),
      }),
    },
    async ({ id }) => {
      try {
        const people = await loadPeopleByIds(supabase, columns, [id]);
        const person = people.get(id);
        if (!person) {
          return jsonText({
            encontrado: false,
            id,
            mensagem: 'UUID não encontrado em profiles nem team_members.',
          });
        }

        const extraCols = pickExistingColumns('profiles', columns, [
          'id',
          'full_name',
          'role',
          'status',
          'cliente_id',
        ]);
        let detalhe: Record<string, unknown> | null = null;
        if (extraCols.includes('id')) {
          const { data } = await supabase
            .from('profiles')
            .select(extraCols.join(','))
            .eq('id', id)
            .maybeSingle();
          if (data) detalhe = data as unknown as Record<string, unknown>;
        }

        return jsonText({
          encontrado: true,
          id: person.id,
          full_name: person.full_name,
          role: person.role,
          eh_equipe: person.role != null && (EQUIPE_ROLES as readonly string[]).includes(person.role),
          profile: detalhe,
        });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'criar_tarefa',
    {
      title: 'Criar tarefa',
      description:
        'Insere em tarefas. Campos filtrados pelas colunas introspectadas; inclui status_history inicial se a coluna existir.',
      inputSchema: z.object({
        title: z.string().min(1),
        client_id: z.string().uuid(),
        owner_id: z.string().uuid(),
        project_id: z.string().uuid().optional(),
        description: z.string().optional(),
        status: z.string().optional(),
        assignee_ids: z.array(z.string().uuid()).optional(),
        type: z.string().optional(),
        due_date: z.string().optional(),
        post_date: z.string().optional(),
        plataforma: z.string().optional(),
        priority: z.string().optional(),
      }),
    },
    async (args) => {
      const base: Record<string, unknown> = {
        title: args.title,
        client_id: args.client_id,
        owner_id: args.owner_id,
      };
      if (args.project_id) base.project_id = args.project_id;
      if (args.description !== undefined) base.description = args.description;
      if (args.status) base.status = args.status;
      if (args.assignee_ids) base.assignee_ids = args.assignee_ids;
      if (args.type !== undefined) base.type = args.type;
      if (args.due_date !== undefined) base.due_date = args.due_date || null;
      if (args.post_date !== undefined) base.post_date = args.post_date || null;
      if (args.plataforma !== undefined) base.plataforma = args.plataforma || null;
      if (args.priority !== undefined) base.priority = args.priority;

      const hasHistory = (columns.tarefas ?? []).includes('status_history');
      if (hasHistory && args.status) {
        base.status_history = [
          {
            status: args.status,
            user_id: args.owner_id,
            assignee_ids: args.assignee_ids ?? [],
            timestamp: new Date().toISOString(),
          },
        ];
      }

      const row = buildInsertRow(columns, 'tarefas', base);
      const { data, error } = await supabase.from('tarefas').insert(row).select().single();
      if (error) return toolError(`Supabase (criar_tarefa): ${error.message}`);
      return jsonText({ tarefa: data });
    }
  );

  mcp.registerTool(
    'buscar_leads',
    {
      title: 'Buscar leads recentes',
      description: 'Leads ordenados por created_at descendente.',
      inputSchema: z.object({
        limite: z.number().int().positive().max(200).optional(),
        cliente_id: z.string().uuid().optional(),
      }),
    },
    async ({ limite, cliente_id }) => {
      const n = limite ?? 50;
      let q = supabase.from('leads').select('*');
      if (cliente_id) q = q.eq('cliente_id', cliente_id);
      const { data, error } = await q
        .order('created_at', { ascending: false })
        .limit(n);
      if (error) return toolError(`Supabase (buscar_leads): ${error.message}`);
      return jsonText({ total: data?.length ?? 0, leads: data });
    }
  );

  mcp.registerTool(
    'resumo_agencia',
    {
      title: 'Resumo da agência (tarefas)',
      description:
        'Contagem de tarefas por status e por responsável. por_responsavel traz id, full_name, role e total (não só UUID). Use listar_status_tarefas para labels dos status.',
      inputSchema: z.object({
        max_linhas: z.number().int().positive().max(20000).optional(),
      }),
    },
    async ({ max_linhas }) => {
      const cap = max_linhas ?? 8000;
      const pageSize = 1000;
      const rows: { status: string | null; assignee_ids: string[] | null }[] = [];
      let from = 0;
      const wanted = pickExistingColumns('tarefas', columns, ['status', 'assignee_ids']);
      const selectStr =
        wanted.length > 0 ? wanted.join(',') : 'status,assignee_ids';

      while (rows.length < cap) {
        const to = from + pageSize - 1;
        const { data, error } = await supabase
          .from('tarefas')
          .select(selectStr)
          .range(from, to);
        if (error) return toolError(`Supabase (resumo_agencia fetch): ${error.message}`);
        const batch = (data ?? []) as unknown as Record<string, unknown>[];
        for (const r of batch) {
          const row = r;
          const aid = row.assignee_ids;
          rows.push({
            status: (typeof row.status === 'string' ? row.status : null) ?? null,
            assignee_ids: Array.isArray(aid)
              ? aid.filter((x): x is string => typeof x === 'string')
              : null,
          });
        }
        if (batch.length < pageSize) break;
        from += pageSize;
      }

      const byStatus = new Map<string, number>();
      const byAssignee = new Map<string, number>();
      for (const r of rows) {
        const st = r.status ?? '(sem status)';
        byStatus.set(st, (byStatus.get(st) ?? 0) + 1);
        const ids = r.assignee_ids ?? [];
        if (ids.length === 0) {
          byAssignee.set('(sem responsável)', (byAssignee.get('(sem responsável)') ?? 0) + 1);
        } else {
          for (const id of ids) {
            byAssignee.set(id, (byAssignee.get(id) ?? 0) + 1);
          }
        }
      }

      const uuidKeys = [...byAssignee.keys()].filter((k) => /^[0-9a-f-]{36}$/i.test(k));
      const people = await loadPeopleByIds(supabase, columns, uuidKeys);

      // Labels canônicos de status (task_statuses)
      const statusLabel = new Map<string, string>();
      {
        const { data: sts } = await supabase
          .from('task_statuses')
          .select('value,label')
          .limit(200);
        for (const s of sts ?? []) {
          const rec = s as { value?: string; label?: string };
          if (rec.value) statusLabel.set(rec.value, rec.label || rec.value);
        }
      }

      const porResponsavel: {
        id: string | null;
        full_name: string;
        role: string | null;
        tarefas_como_responsavel: number;
      }[] = [];
      for (const [k, v] of byAssignee) {
        if (k === '(sem responsável)') {
          porResponsavel.push({
            id: null,
            full_name: '(sem responsável)',
            role: null,
            tarefas_como_responsavel: v,
          });
          continue;
        }
        const person = people.get(k);
        porResponsavel.push({
          id: k,
          full_name: person?.full_name ?? k,
          role: person?.role ?? null,
          tarefas_como_responsavel: v,
        });
      }
      porResponsavel.sort((a, b) => b.tarefas_como_responsavel - a.tarefas_como_responsavel);

      const porStatus = [...byStatus.entries()]
        .map(([status, count]) => ({
          status,
          label: statusLabel.get(status) ?? status,
          count,
        }))
        .sort((a, b) => b.count - a.count);

      return jsonText({
        amostra_linhas: rows.length,
        truncado: rows.length >= cap,
        fonte_membros: 'profiles',
        por_status: porStatus,
        por_responsavel: porResponsavel,
      });
    }
  );

  mcp.registerTool(
    'listar_solicitacoes',
    {
      title: 'Listar solicitações abertas',
      description:
        'Solicitações com status aberta ou em análise. Tabela resolvida via getSolicitacoesTable (solicitacoes ou task_solicitations).',
      inputSchema: z.object({
        limite: z.number().int().positive().max(300).optional(),
      }),
    },
    async ({ limite }) => {
      try {
        const n = limite ?? 100;
        const table = await getSolicitacoesTable(supabase);
        const { data, error } = await supabase
          .from(table)
          .select('*, clientes(empresa)')
          .in('status', ['aberta', 'analise'])
          .order('created_at', { ascending: false })
          .limit(n);
        if (error) throw new Error(`Supabase (listar_solicitacoes): ${error.message}`);
        return jsonText({ total: data?.length ?? 0, solicitacoes: data, tabela: table });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'criar_solicitacao',
    {
      title: 'Criar solicitação',
      description:
        'INSERT na tabela de solicitações (nome via introspecção em tempo de execução). Obrigatórios: title, description. Opcionais: client_id, origem (padrão Claude), priority baixa|media|alta (padrão media), status aberta|em_analise|concluida|cancelada (padrão aberta; em_analise→analise, cancelada→rejeitada no DB), prazo. owner_id opcional; se a coluna existir e não for informado, usa Josias.',
      inputSchema: z.object({
        title: z.string().min(1),
        description: z.string().min(1),
        client_id: z.string().uuid().optional(),
        origem: z.string().optional(),
        priority: solicitacaoPrioritySchema,
        status: solicitacaoStatusSchema,
        prazo: z.string().optional(),
        owner_id: z.string().uuid().optional(),
      }),
    },
    async (args) => {
      try {
        const table = await getSolicitacoesTable(supabase);
        const allowed = introspectColumns(table, columns);
        const row: Record<string, unknown> = {
          title: args.title,
          description: args.description,
          origem: args.origem?.trim() || 'Claude',
          priority: args.priority ?? 'media',
          status: normalizeSolicitacaoStatusParaDb(args.status ?? 'aberta'),
        };
        if (args.client_id) row.client_id = args.client_id;
        if (args.prazo !== undefined) row.prazo = args.prazo === '' ? null : args.prazo;

        if (args.owner_id !== undefined) {
          row.owner_id = args.owner_id;
        } else if (allowed.has('owner_id')) {
          row.owner_id = JOSIAS_USER_ID;
        }

        const filtered = buildInsertRow(columns, table, row);
        const { data, error } = await supabase.from(table).insert(filtered).select().maybeSingle();
        if (error) throw new Error(`Supabase (criar_solicitacao): ${error.message}`);
        if (!data) throw new Error('criar_solicitacao: não foi possível ler o registro após o insert.');
        return jsonText({ solicitacao: data });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'atualizar_solicitacao',
    {
      title: 'Atualizar solicitação',
      description:
        'UPDATE por id na tabela de solicitações. Campos opcionais: status, priority, owner_id, title, description, prazo (filtrados pelo schema). status em_analise/cancelada são normalizados para o DB.',
      inputSchema: z.object({
        id: z.string().uuid(),
        status: solicitacaoStatusSchema,
        priority: solicitacaoPrioritySchema,
        owner_id: z.string().uuid().nullable().optional(),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        prazo: z.string().optional(),
      }),
    },
    async (args) => {
      try {
        const { id, ...rest } = args;
        const table = await getSolicitacoesTable(supabase);
        const allowed = introspectColumns(table, columns);
        const patch: Record<string, unknown> = {};

        if (rest.status !== undefined) patch.status = normalizeSolicitacaoStatusParaDb(rest.status);
        if (rest.priority !== undefined) patch.priority = rest.priority;
        if (rest.owner_id !== undefined) patch.owner_id = rest.owner_id;
        if (rest.title !== undefined) patch.title = rest.title;
        if (rest.description !== undefined) patch.description = rest.description;
        if (rest.prazo !== undefined) patch.prazo = rest.prazo === '' ? null : rest.prazo;

        const userKeys = Object.keys(patch).filter((k) => allowed.has(k));
        if (userKeys.length === 0) {
          throw new Error(
            'atualizar_solicitacao: nenhum campo válido informado. Envie ao menos um de status, priority, owner_id, title, description ou prazo.'
          );
        }

        if (allowed.has('updated_at')) {
          patch.updated_at = new Date().toISOString();
        }

        const row = buildInsertRow(columns, table, patch);
        const substantive = Object.keys(row).filter((k) => k !== 'updated_at');
        if (substantive.length === 0) {
          throw new Error(
            'atualizar_solicitacao: nenhum campo corresponde a colunas desta tabela neste ambiente.'
          );
        }

        const { data, error } = await supabase.from(table).update(row).eq('id', id).select().maybeSingle();
        if (error) throw new Error(`Supabase (atualizar_solicitacao): ${error.message}`);
        if (!data) {
          throw new Error(
            'atualizar_solicitacao: nenhum registro encontrado com este id ou nada foi atualizado.'
          );
        }
        return jsonText({ solicitacao: data });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'deletar_solicitacao',
    {
      title: 'Deletar solicitação',
      description: 'DELETE por id na tabela de solicitações resolvida em tempo de execução.',
      inputSchema: z.object({
        id: z.string().uuid(),
      }),
    },
    async ({ id }) => {
      try {
        const table = await getSolicitacoesTable(supabase);
        const { error } = await supabase.from(table).delete().eq('id', id);
        if (error) throw new Error(`Supabase (deletar_solicitacao): ${error.message}`);
        return jsonText({ deletado: id });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'listar_equipe',
    {
      title: 'Listar equipe',
      description:
        'Lista profiles. Padrão papel=equipe (admin|colaborador|superadmin) — não mistura usuários cliente. Use papel=cliente ou papel=todos para outros conjuntos.',
      inputSchema: z.object({
        papel: z.enum(['equipe', 'cliente', 'todos']).optional(),
      }),
    },
    async ({ papel }) => {
      const filtro = papel ?? 'equipe';
      const wanted = ['id', 'full_name', 'role', 'status', 'cliente_id'] as const;
      const selectList = pickExistingColumns('profiles', columns, [...wanted]);
      const selectStr = selectList.length > 0 ? selectList.join(',') : 'id, full_name, role';

      let q = supabase.from('profiles').select(selectStr).order('full_name', { ascending: true });
      if (filtro === 'equipe') {
        q = q.in('role', [...EQUIPE_ROLES]);
      } else if (filtro === 'cliente') {
        q = q.eq('role', 'cliente');
      }

      const { data, error } = await q;
      if (error) return toolError(`Supabase (listar_equipe): ${error.message}`);
      return jsonText({
        filtro_papel: filtro,
        roles_equipe: [...EQUIPE_ROLES],
        total: data?.length ?? 0,
        membros: data,
      });
    }
  );

  mcp.registerTool(
    'criar_membro',
    {
      title: 'Criar membro (profile ou team)',
      description:
        'INSERT em profiles se a tabela existir; senão em team_members (firstExistingTable). Obrigatório: full_name. Opcionais: role, email, status ativo|inativo (padrão ativo). Campos filtrados pelo schema.',
      inputSchema: z.object({
        full_name: z.string().min(1),
        role: z.string().optional(),
        email: z.string().optional(),
        status: membroStatusSchema,
      }),
    },
    async (args) => {
      try {
        const table = await getMembrosTable(supabase);
        const row: Record<string, unknown> = {
          full_name: args.full_name,
          status: args.status ?? 'ativo',
        };
        if (args.role !== undefined && args.role !== '') row.role = args.role;
        if (args.email !== undefined && args.email.trim() !== '') row.email = args.email.trim();

        const filtered = buildInsertRow(columns, table, row);
        const { data, error } = await supabase.from(table).insert(filtered).select().maybeSingle();
        if (error) throw new Error(`Supabase (criar_membro): ${error.message}`);
        if (!data) throw new Error('criar_membro: não foi possível ler o registro após o insert.');
        return jsonText({ membro: data, tabela: table });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'atualizar_membro',
    {
      title: 'Atualizar membro',
      description:
        'UPDATE por id na mesma tabela usada em criar_membro (profiles ou team_members). Campos opcionais: full_name, role, email, status. Atualiza updated_at se existir.',
      inputSchema: z.object({
        id: z.string().uuid(),
        full_name: z.string().min(1).optional(),
        role: z.string().optional(),
        email: z.string().optional(),
        status: membroStatusSchema,
      }),
    },
    async (args) => {
      try {
        const { id, ...rest } = args;
        const table = await getMembrosTable(supabase);
        const allowed = introspectColumns(table, columns);
        const patch: Record<string, unknown> = {};

        if (rest.full_name !== undefined) patch.full_name = rest.full_name;
        if (rest.role !== undefined) patch.role = rest.role === '' ? null : rest.role;
        if (rest.email !== undefined) patch.email = rest.email === '' ? null : rest.email;
        if (rest.status !== undefined) patch.status = rest.status;

        const userKeys = Object.keys(patch).filter((k) => allowed.has(k));
        if (userKeys.length === 0) {
          throw new Error(
            'atualizar_membro: nenhum campo válido informado. Envie ao menos um de full_name, role, email ou status.'
          );
        }

        if (allowed.has('updated_at')) {
          patch.updated_at = new Date().toISOString();
        }

        const row = buildInsertRow(columns, table, patch);
        const substantive = Object.keys(row).filter((k) => k !== 'updated_at');
        if (substantive.length === 0) {
          throw new Error(
            'atualizar_membro: os campos enviados não existem nesta tabela no schema atual.'
          );
        }

        const { data, error } = await supabase.from(table).update(row).eq('id', id).select().maybeSingle();
        if (error) throw new Error(`Supabase (atualizar_membro): ${error.message}`);
        if (!data) {
          throw new Error('atualizar_membro: nenhum registro encontrado com este id ou nada foi atualizado.');
        }
        return jsonText({ membro: data, tabela: table });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'buscar_plano_campanha',
    {
      title: 'Buscar plano de campanha',
      description: 'Plano de campanha (campaign_plans) por project_id.',
      inputSchema: z.object({
        project_id: z.string().uuid(),
      }),
    },
    async ({ project_id }) => {
      const planCols = [
        'id',
        'project_id',
        'objetivo',
        'estrategia_comunicacao',
        'conteudo_criativos',
        'trafego_pago',
        'cronograma',
        'roteiros',
        'materiais',
      ];
      const selectList = pickExistingColumns('campaign_plans', columns, planCols);
      const selectStr = selectList.length > 0 ? selectList.join(',') : '*';

      const { data, error } = await supabase
        .from('campaign_plans')
        .select(selectStr)
        .eq('project_id', project_id)
        .maybeSingle();
      if (error) return toolError(`Supabase (buscar_plano_campanha): ${error.message}`);
      return jsonText({ plano: data });
    }
  );

  mcp.registerTool(
    'atualizar_tarefa',
    {
      title: 'Atualizar tarefa',
      description:
        'UPDATE em tarefas por id. Campos opcionais (só os que existirem no schema): status, assignee_ids, due_date, description, title, type, plataforma, post_date, priority, project_id (null desvincula do projeto). Atualiza updated_at quando a coluna existir. Retorna o registro atualizado.',
      inputSchema: z.object({
        id: z.string().uuid(),
        status: z.string().min(1).optional(),
        assignee_ids: z.array(z.string().uuid()).optional(),
        due_date: z.string().optional(),
        description: z.string().optional(),
        title: z.string().optional(),
        type: z.string().optional(),
        plataforma: z.string().optional(),
        post_date: z.string().optional(),
        priority: z.string().optional(),
        project_id: z.string().uuid().nullable().optional(),
      }),
    },
    async (args) => {
      try {
        const {
          id,
          status,
          assignee_ids,
          due_date,
          description,
          title,
          type,
          plataforma,
          post_date,
          priority,
          project_id,
        } = args;

        const allowed = introspectColumns('tarefas', columns);
        const patch: Record<string, unknown> = {};

        if (status !== undefined) patch.status = status;
        if (assignee_ids !== undefined) patch.assignee_ids = assignee_ids;
        if (due_date !== undefined) patch.due_date = due_date === '' ? null : due_date;
        if (description !== undefined) patch.description = description === '' ? null : description;
        if (title !== undefined) patch.title = title === '' ? null : title;
        if (type !== undefined) patch.type = type === '' ? null : type;
        if (plataforma !== undefined) patch.plataforma = plataforma === '' ? null : plataforma;
        if (post_date !== undefined) patch.post_date = post_date === '' ? null : post_date;
        if (priority !== undefined) patch.priority = priority === '' ? null : priority;
        if (project_id !== undefined) patch.project_id = project_id;

        const userKeys = Object.keys(patch).filter((k) => allowed.has(k));
        if (userKeys.length === 0) {
          throw new Error(
            'atualizar_tarefa: informe ao menos um campo opcional existente no schema (ex.: status, title, project_id).'
          );
        }

        if (allowed.has('updated_at')) {
          patch.updated_at = new Date().toISOString();
        }

        const row = buildInsertRow(columns, 'tarefas', patch);
        const substantive = Object.keys(row).filter((k) => k !== 'updated_at');
        if (substantive.length === 0) {
          throw new Error(
            'atualizar_tarefa: nenhum dos campos informados existe na tabela tarefas (schema atual).'
          );
        }

        const { data, error } = await supabase
          .from('tarefas')
          .update(row)
          .eq('id', id)
          .select()
          .single();
        if (error) throw new Error(`Supabase (atualizar_tarefa): ${error.message}`);
        return jsonText({ tarefa: data });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'ver_resultados_cliente',
    {
      title: 'Ver resultados diários do cliente',
      description:
        'SELECT em cliente_resultados_diarios. Obrigatório: cliente_id. Opcionais: data_inicio, data_fim (YYYY-MM-DD) com gte/lte em data_referencia; limit padrão 90 (máx. 500). Ordenação: data_referencia descendente.',
      annotations: { readOnlyHint: true, destructiveHint: false },
      inputSchema: z.object({
        cliente_id: z.string().uuid(),
        data_inicio: z.string().optional(),
        data_fim: z.string().optional(),
        limit: z.number().int().positive().max(500).optional(),
        offset: z.number().int().min(0).default(0),
      }),
    },
    async ({ cliente_id, data_inicio, data_fim, limit, offset }) => {
      try {
        await requireTraffic(supabase, actor, 'clients');
        const n = limit ?? 90;
        if (data_inicio) ymd(data_inicio);
        if (data_fim) ymd(data_fim);
        if (data_inicio && data_fim && data_inicio > data_fim) throw new Error('Período invertido.');
        const cols = [
          'id',
          'cliente_id',
          'data_referencia',
          'leads',
          'visitas_agendadas',
          'visitas_realizadas',
          'vendas',
          'faturamento',
          'investimento',
          'observacoes',
        ];
        const selectStr =
          pickExistingColumns('cliente_resultados_diarios', columns, cols).join(',') || '*';
        let q = supabase.from('cliente_resultados_diarios').select(selectStr).eq('cliente_id', cliente_id);
        const di = data_inicio?.trim();
        const df = data_fim?.trim();
        if (di) q = q.gte('data_referencia', di);
        if (df) q = q.lte('data_referencia', df);
        const { data, error } = await q.order('data_referencia', { ascending: false }).order('id').range(offset, offset + n);
        if (error) throw new Error(`Supabase (ver_resultados_cliente): ${error.message}`);
        const rows = (data ?? []).slice(0,n);
        return jsonText({ cliente_id, origem: 'planeje.cliente_resultados_diarios', nota: 'Resultados comerciais registrados no Planeje; não são Insights Meta nem dados de CRM externo.', periodo: { inicio: data_inicio ?? null, fim: data_fim ?? null }, total: rows.length, paginacao: { offset, limit: n, tem_mais: (data?.length ?? 0) > n, proximo_offset: (data?.length ?? 0) > n ? offset + n : null }, resultados: rows });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'ver_oportunidades_crm',
    {
      title: 'Ver oportunidades CRM',
      description: 'Lista crm_oportunidades com filtros opcionais por cliente e etapa.',
      inputSchema: z.object({
        cliente_id: z.string().uuid().optional(),
        status_etapa: z.string().optional(),
        limit: z.number().int().positive().max(500).optional(),
      }),
    },
    async ({ cliente_id, status_etapa, limit }) => {
      const n = limit ?? 20;
      const cols = [
        'id',
        'cliente_id',
        'lead_nome',
        'lead_telefone',
        'origem_canal',
        'origem_campanha',
        'status_etapa',
        'valor_previsto',
        'probabilidade',
        'venda_confirmada',
        'venda_valor_real',
        'data_criacao',
        'observacoes_resumo',
      ];
      const selectStr = pickExistingColumns('crm_oportunidades', columns, cols).join(',') || '*';
      let q = supabase.from('crm_oportunidades').select(selectStr);
      if (cliente_id) q = q.eq('cliente_id', cliente_id);
      if (status_etapa != null && String(status_etapa).trim() !== '') {
        q = q.eq('status_etapa', String(status_etapa).trim());
      }
      const { data, error } = await q
        .order('data_criacao', { ascending: false })
        .limit(n);
      if (error) return toolError(`Supabase (ver_oportunidades_crm): ${error.message}`);
      return jsonText({ total: data?.length ?? 0, oportunidades: data });
    }
  );

  mcp.registerTool(
    'ver_campanhas_pagas',
    {
      title: 'Ver solicitações internas de campanhas pagas',
      description:
        'Solicitações internas do Planeje, não catálogo nem resultados Meta. Para Meta use consultar_trafego_meta. Lista paid_campaigns: *, clientes(id, empresa), profiles!assignee_id(id, full_name, avatar_url). Filtros opcionais: client_id, status. Ordenação created_at desc, limite 300.',
      annotations: { readOnlyHint: true, destructiveHint: false },
      inputSchema: z.object({
        client_id: z.string().uuid().optional(),
        status: z.string().optional(),
        limit: z.number().int().min(1).max(300).default(100),
        offset: z.number().int().min(0).default(0),
      }),
    },
    async ({ client_id, status, limit, offset }) => {
      try {
      await requireTraffic(supabase, actor);
      const selectStr =
        '*, clientes(id, empresa), profiles!assignee_id(id, full_name, avatar_url)';
      let q = supabase.from('paid_campaigns').select(selectStr);
      if (actor?.type === 'user' && actor.role === 'colaborador') q = q.or(`owner_id.eq.${actor.user_id},assignee_id.eq.${actor.user_id}`);
      if (client_id) q = q.eq('client_id', client_id);
      if (status != null && String(status).trim() !== '') {
        q = q.eq('status', String(status).trim());
      }
      const { data, error } = await q.order('created_at', { ascending: false }).order('id').range(offset, offset + limit);
      if (error) return toolError(`Supabase (ver_campanhas_pagas): ${error.message}`);
      return jsonText({ origem: 'planeje.paid_campaigns', total: Math.min(data?.length ?? 0,limit), campanhas: data?.slice(0,limit) ?? [], paginacao: { offset, limit, tem_mais: (data?.length ?? 0) > limit, proximo_offset: (data?.length ?? 0) > limit ? offset + limit : null } });
      } catch (e) { return toolError(e instanceof Error ? e.message : 'Falha de permissão.'); }
    }
  );

  mcp.registerTool(
    'criar_campanha_paga',
    {
      title: 'Criar campanha paga',
      description:
        'INSERT em paid_campaigns. Obrigatórios: client_id, name. Opcionais: status (padrão ativa), assignee_id (uuid, FK profiles), ad_sets e kpis (JSON), objetivo/description, plataforma, orcamento/budget, data_inicio, data_fim, meta_id. Campos filtrados por introspectColumns + buildInsertRow.',
      inputSchema: z.object({
        client_id: z.string().uuid(),
        name: z.string().min(1),
        status: z.string().optional(),
        assignee_id: z.string().uuid().optional(),
        ad_sets: z.any().optional(),
        kpis: z.any().optional(),
        objetivo: z.string().optional(),
        plataforma: z.string().optional(),
        orcamento: z.number().optional(),
        data_inicio: z.string().optional(),
        data_fim: z.string().optional(),
        meta_id: z.string().optional(),
      }),
    },
    async (args) => {
      try {
        const allowed = introspectColumns('paid_campaigns', columns);
        const src: Record<string, unknown> = {
          client_id: args.client_id,
          name: args.name,
          status: args.status?.trim() || 'ativa',
        };
        if (args.assignee_id !== undefined) src.assignee_id = args.assignee_id;
        if (args.ad_sets !== undefined) src.ad_sets = args.ad_sets;
        if (args.kpis !== undefined) src.kpis = args.kpis;
        if (args.objetivo !== undefined) src.objetivo = args.objetivo === '' ? null : args.objetivo;
        if (args.plataforma !== undefined) src.plataforma = args.plataforma === '' ? null : args.plataforma;
        if (args.orcamento !== undefined) src.orcamento = args.orcamento;
        if (args.data_inicio !== undefined) src.data_inicio = args.data_inicio === '' ? null : args.data_inicio;
        if (args.data_fim !== undefined) src.data_fim = args.data_fim === '' ? null : args.data_fim;
        if (args.meta_id !== undefined) src.meta_id = args.meta_id === '' ? null : args.meta_id;

        const mapped = mapCampanhaPagaFields(allowed, src);
        const row = buildInsertRow(columns, 'paid_campaigns', mapped);
        const { data, error } = await supabase.from('paid_campaigns').insert(row).select().maybeSingle();
        if (error) throw new Error(`Supabase (criar_campanha_paga): ${error.message}`);
        if (!data) throw new Error('criar_campanha_paga: não foi possível ler o registro após o insert.');
        return jsonText({ campanha: data });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'atualizar_campanha_paga',
    {
      title: 'Atualizar campanha paga',
      description:
        'UPDATE em paid_campaigns por id. Mesmos campos opcionais de criar_campanha_paga (incl. assignee_id, ad_sets, kpis) + id obrigatório. objetivo/orcamento seguem o mesmo mapeamento; updated_at se existir.',
      inputSchema: z.object({
        id: z.string().uuid(),
        client_id: z.string().uuid().optional(),
        name: z.string().min(1).optional(),
        status: z.string().optional(),
        assignee_id: z.string().uuid().nullable().optional(),
        ad_sets: z.any().optional(),
        kpis: z.any().optional(),
        objetivo: z.string().optional(),
        plataforma: z.string().optional(),
        orcamento: z.number().nullable().optional(),
        data_inicio: z.string().optional(),
        data_fim: z.string().optional(),
        meta_id: z.string().optional(),
      }),
    },
    async (args) => {
      try {
        const { id, ...rest } = args;
        const allowed = introspectColumns('paid_campaigns', columns);
        const src: Record<string, unknown> = {};
        if (rest.client_id !== undefined) src.client_id = rest.client_id;
        if (rest.name !== undefined) src.name = rest.name;
        if (rest.status !== undefined) src.status = rest.status;
        if (rest.assignee_id !== undefined) src.assignee_id = rest.assignee_id;
        if (rest.ad_sets !== undefined) src.ad_sets = rest.ad_sets;
        if (rest.kpis !== undefined) src.kpis = rest.kpis;
        if (rest.objetivo !== undefined) src.objetivo = rest.objetivo === '' ? null : rest.objetivo;
        if (rest.plataforma !== undefined) src.plataforma = rest.plataforma === '' ? null : rest.plataforma;
        if (rest.orcamento !== undefined) src.orcamento = rest.orcamento;
        if (rest.data_inicio !== undefined) src.data_inicio = rest.data_inicio === '' ? null : rest.data_inicio;
        if (rest.data_fim !== undefined) src.data_fim = rest.data_fim === '' ? null : rest.data_fim;
        if (rest.meta_id !== undefined) src.meta_id = rest.meta_id === '' ? null : rest.meta_id;

        const mapped = mapCampanhaPagaFields(allowed, src);
        const patch = buildInsertRow(columns, 'paid_campaigns', mapped);
        const userKeys = Object.keys(patch).filter((k) => allowed.has(k));
        if (userKeys.length === 0) {
          throw new Error(
            'atualizar_campanha_paga: nenhum campo válido informado para atualizar (verifique o schema paid_campaigns).'
          );
        }
        if (allowed.has('updated_at')) {
          patch.updated_at = new Date().toISOString();
        }
        const substantive = Object.keys(patch).filter((k) => k !== 'updated_at');
        if (substantive.length === 0) {
          throw new Error(
            'atualizar_campanha_paga: nenhum campo corresponde a colunas desta tabela neste ambiente.'
          );
        }

        const { data, error } = await supabase
          .from('paid_campaigns')
          .update(patch)
          .eq('id', id)
          .select()
          .maybeSingle();
        if (error) throw new Error(`Supabase (atualizar_campanha_paga): ${error.message}`);
        if (!data) {
          throw new Error(
            'atualizar_campanha_paga: nenhum registro encontrado com este id ou nada foi atualizado.'
          );
        }
        return jsonText({ campanha: data });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'chamar_rpc_criar_campanha',
    {
      title: 'Chamar RPC create_ad_from_structure',
      description:
        'Invoca supabase.rpc("create_ad_from_structure", { form_data }). Obrigatório: form_data (objeto completo enviado à RPC). Retorno bruto da RPC.',
      inputSchema: z.object({
        form_data: z.any(),
      }),
    },
    async ({ form_data }) => {
      try {
        const { data, error } = await supabase.rpc('create_ad_from_structure', {
          form_data,
        });
        if (error) {
          return toolError(`Supabase (chamar_rpc_criar_campanha): ${error.message}`);
        }
        return jsonText({ resultado: data });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'listar_status_campanhas',
    {
      title: 'Listar status de campanhas pagas',
      description: 'SELECT * em paid_campaign_statuses ordenado por sort_order ascendente.',
      inputSchema: z.object({}),
    },
    async () => {
      const { data, error } = await supabase
        .from('paid_campaign_statuses')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) return toolError(`Supabase (listar_status_campanhas): ${error.message}`);
      return jsonText({ total: data?.length ?? 0, status: data });
    }
  );

  mcp.registerTool(
    'criar_status_campanha',
    {
      title: 'Criar status de campanha paga',
      description:
        'INSERT em paid_campaign_statuses. Obrigatórios: label, value (slug), color, sort_order. Campos filtrados por introspectColumns + buildInsertRow.',
      inputSchema: z.object({
        label: z.string().min(1),
        value: z.string().min(1),
        color: z.string().min(1),
        sort_order: z.number().int(),
      }),
    },
    async (args) => {
      try {
        const row = buildInsertRow(columns, 'paid_campaign_statuses', {
          label: args.label,
          value: args.value,
          color: args.color,
          sort_order: args.sort_order,
        });
        const { data, error } = await supabase
          .from('paid_campaign_statuses')
          .insert(row)
          .select()
          .maybeSingle();
        if (error) throw new Error(`Supabase (criar_status_campanha): ${error.message}`);
        if (!data) throw new Error('criar_status_campanha: insert sem retorno.');
        return jsonText({ status: data });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'deletar_status_campanha',
    {
      title: 'Deletar status de campanha paga',
      description: 'DELETE em paid_campaign_statuses por id.',
      inputSchema: z.object({
        id: z.string().uuid(),
      }),
    },
    async ({ id }) => {
      try {
        const { error } = await supabase.from('paid_campaign_statuses').delete().eq('id', id);
        if (error) throw new Error(`Supabase (deletar_status_campanha): ${error.message}`);
        return jsonText({ deletado: id });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'ver_anexos_tarefa',
    {
      title: 'Ver anexos da tarefa',
      description: 'SELECT name, url em task_attachments filtrado por task_id (obrigatório).',
      inputSchema: z.object({
        task_id: z.string().uuid(),
      }),
    },
    async ({ task_id }) => {
      try {
        const wanted = ['name', 'url'];
        const selectStr =
          pickExistingColumns('task_attachments', columns, wanted).join(',') || 'name,url';
        const { data, error } = await supabase
          .from('task_attachments')
          .select(selectStr)
          .eq('task_id', task_id);
        if (error) throw new Error(`Supabase (ver_anexos_tarefa): ${error.message}`);
        return jsonText({ task_id, total: data?.length ?? 0, anexos: data });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'listar_observacoes_cliente',
    {
      title: 'Listar observações Meta do cliente',
      description:
        'SELECT em cliente_meta_observations com join profiles(full_name, avatar_url), filtro cliente_id obrigatório, ordenação created_at descendente.',
      inputSchema: z.object({
        cliente_id: z.string().uuid(),
      }),
    },
    async ({ cliente_id }) => {
      try {
        const selectStr = '*, profiles(full_name, avatar_url)';
        const { data, error } = await supabase
          .from('cliente_meta_observations')
          .select(selectStr)
          .eq('cliente_id', cliente_id)
          .order('created_at', { ascending: false });
        if (error) throw new Error(`Supabase (listar_observacoes_cliente): ${error.message}`);
        return jsonText({ cliente_id, total: data?.length ?? 0, observacoes: data });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'criar_observacao_cliente',
    {
      title: 'Criar observação Meta do cliente',
      description:
        'INSERT em cliente_meta_observations. Obrigatórios: cliente_id, observation. user_id opcional (padrão JOSIAS_USER_ID).',
      inputSchema: z.object({
        cliente_id: z.string().uuid(),
        observation: z.string().min(1),
        user_id: z.string().uuid().optional(),
      }),
    },
    async (args) => {
      try {
        const row = buildInsertRow(columns, 'cliente_meta_observations', {
          cliente_id: args.cliente_id,
          observation: args.observation.trim(),
          user_id: args.user_id ?? JOSIAS_USER_ID,
        });
        const { data, error } = await supabase
          .from('cliente_meta_observations')
          .insert(row)
          .select()
          .maybeSingle();
        if (error) throw new Error(`Supabase (criar_observacao_cliente): ${error.message}`);
        if (!data) throw new Error('criar_observacao_cliente: insert sem retorno.');
        return jsonText({ observacao: data });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'listar_contas_meta_cliente',
    {
      title: 'Listar contas Meta vinculadas ao cliente',
      description:
        'SELECT em cliente_meta_accounts por cliente_id. Colunas: id, meta_account_id, meta_account_name, is_active, notes, created_at. Por padrão apenas is_active = true; use incluir_inativas true para listar todas.',
      annotations: { readOnlyHint: true, destructiveHint: false },
      inputSchema: z.object({
        cliente_id: z.string().uuid(),
        incluir_inativas: z.boolean().optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    },
    async ({ cliente_id, incluir_inativas, limit, offset }) => {
      try {
        await requireTraffic(supabase, actor);
        const wanted = [
          'id',
          'meta_account_id',
          'meta_account_name',
          'is_active',
          'notes',
          'created_at',
        ];
        const selectStr =
          pickExistingColumns('cliente_meta_accounts', columns, wanted).join(',') ||
          'id, meta_account_id, meta_account_name, is_active, notes, created_at';
        let q = supabase
          .from('cliente_meta_accounts')
          .select(selectStr)
          .eq('cliente_id', cliente_id);
        if (!incluir_inativas) {
          q = q.eq('is_active', true);
        }
        const { data, error } = await q.order('created_at', { ascending: true }).order('id').range(offset, offset + limit);
        if (error) throw new Error(`Supabase (listar_contas_meta_cliente): ${error.message}`);
        return jsonText({ cliente_id, origem: 'planeje.cliente_meta_accounts', total: Math.min(data?.length ?? 0,limit), contas: data?.slice(0,limit) ?? [], paginacao: { offset, limit, tem_mais: (data?.length ?? 0) > limit, proximo_offset: (data?.length ?? 0) > limit ? offset + limit : null } });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'vincular_conta_meta',
    {
      title: 'Vincular conta Meta Ads ao cliente',
      description:
        'INSERT em cliente_meta_accounts. Obrigatórios: cliente_id, meta_account_id (ex. act_…), meta_account_name. Opcionais: notes, is_active (default true). Campos filtrados por buildInsertRow.',
      inputSchema: z.object({
        cliente_id: z.string().uuid(),
        meta_account_id: z.string().min(1),
        meta_account_name: z.string().min(1),
        notes: z.string().optional(),
        is_active: z.boolean().optional(),
      }),
    },
    async (args) => {
      try {
        const row = buildInsertRow(columns, 'cliente_meta_accounts', {
          cliente_id: args.cliente_id,
          meta_account_id: args.meta_account_id.trim(),
          meta_account_name: args.meta_account_name.trim(),
          notes: args.notes === undefined ? undefined : args.notes === '' ? null : args.notes,
          is_active: args.is_active ?? true,
        });
        const { data, error } = await supabase
          .from('cliente_meta_accounts')
          .insert(row)
          .select()
          .maybeSingle();
        if (error) throw new Error(`Supabase (vincular_conta_meta): ${error.message}`);
        if (!data) throw new Error('vincular_conta_meta: insert sem retorno.');
        return jsonText({ conta: data });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'atualizar_conta_meta',
    {
      title: 'Atualizar vínculo conta Meta do cliente',
      description:
        'UPDATE em cliente_meta_accounts por id. Opcionais: meta_account_name, is_active, notes. Campos filtrados por introspectColumns + buildInsertRow; updated_at se existir no schema.',
      inputSchema: z.object({
        id: z.string().uuid(),
        meta_account_name: z.string().optional(),
        is_active: z.boolean().optional(),
        notes: z.string().nullable().optional(),
      }),
    },
    async (args) => {
      try {
        const { id, ...rest } = args;
        const allowed = introspectColumns('cliente_meta_accounts', columns);
        const src: Record<string, unknown> = {};
        if (rest.meta_account_name !== undefined) {
          src.meta_account_name =
            rest.meta_account_name === '' ? null : rest.meta_account_name.trim();
        }
        if (rest.is_active !== undefined) src.is_active = rest.is_active;
        if (rest.notes !== undefined) src.notes = rest.notes === '' ? null : rest.notes;

        const patch = buildInsertRow(columns, 'cliente_meta_accounts', src);
        if (allowed.has('updated_at')) {
          patch.updated_at = new Date().toISOString();
        }
        const keys = Object.keys(patch).filter((k) => k !== 'updated_at');
        if (keys.length === 0) {
          throw new Error('atualizar_conta_meta: nenhum campo para atualizar.');
        }

        const { data, error } = await supabase
          .from('cliente_meta_accounts')
          .update(patch)
          .eq('id', id)
          .select()
          .maybeSingle();
        if (error) throw new Error(`Supabase (atualizar_conta_meta): ${error.message}`);
        if (!data) {
          throw new Error('atualizar_conta_meta: registro não encontrado ou nada atualizado.');
        }
        return jsonText({ conta: data });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'invocar_meta_ads_api',
    {
      title: 'Invocar Edge Function meta-ads-api',
      description:
        'supabase.functions.invoke("meta-ads-api", { body }). Body: { action, adAccountId: ad_account_id, ...params }. Obrigatórios: action, ad_account_id. Opcional: params (objeto com time_range, metrics, etc.).',
      inputSchema: z.object({
        action: z.string().min(1),
        ad_account_id: z.string().min(1),
        params: z.any().optional(),
      }),
    },
    async ({ action, ad_account_id, params }) => {
      try {
        const extras =
          params != null && typeof params === 'object' && !Array.isArray(params)
            ? { ...(params as Record<string, unknown>) }
            : {};
        const body: Record<string, unknown> = {
          action,
          adAccountId: ad_account_id,
          ...extras,
        };
        const { data, error } = await supabase.functions.invoke('meta-ads-api', { body });
        if (error) {
          return toolError(`Supabase (invocar_meta_ads_api): ${error.message}`);
        }
        return jsonText({ resultado: data });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'deletar_campanha_paga',
    {
      title: 'Deletar campanha paga',
      description: 'DELETE em paid_campaigns por id.',
      inputSchema: z.object({
        id: z.string().uuid(),
      }),
    },
    async ({ id }) => {
      try {
        const { error } = await supabase.from('paid_campaigns').delete().eq('id', id);
        if (error) throw new Error(`Supabase (deletar_campanha_paga): ${error.message}`);
        return jsonText({ deletado: id });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'buscar_tarefas_por_texto',
    {
      title: 'Buscar tarefas por texto',
      description:
        'Busca case-insensitive em title ou description (ilike). Obrigatório: termo (min. 2 caracteres). Opcionais: client_id, incluir_completed (default false), limit default 20 (máx. 100). Ordenação: due_date descendente.',
      inputSchema: z.object({
        termo: z.string().min(2),
        client_id: z.string().uuid().optional(),
        incluir_completed: z.boolean().optional(),
        limit: z.number().int().positive().max(100).optional(),
      }),
    },
    async ({ termo, client_id, incluir_completed, limit }) => {
      try {
        const t = termo.trim();
        if (t.length < 2) {
          throw new Error('buscar_tarefas_por_texto: informe um termo com pelo menos 2 caracteres.');
        }
        const n = limit ?? 20;
        const wanted = [
          'id',
          'title',
          'description',
          'status',
          'due_date',
          'project_id',
          'client_id',
          'type',
        ];
        const selectStr = pickExistingColumns('tarefas', columns, wanted).join(',') || '*';
        const pat = padraoIlike(t);
        let q = supabase
          .from('tarefas')
          .select(selectStr)
          .or(`title.ilike.${pat},description.ilike.${pat}`);
        if (client_id) q = q.eq('client_id', client_id);
        if (incluir_completed !== true) q = q.neq('status', 'completed');
        const { data, error } = await q.order('due_date', { ascending: false }).limit(n);
        if (error) throw new Error(`Supabase (buscar_tarefas_por_texto): ${error.message}`);
        const rows = data ?? [];
        return jsonText({ termo: t, total: rows.length, tarefas: rows });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'ver_comentarios_tarefa',
    {
      title: 'Ver comentários da tarefa',
      description: 'Comentários (task_comments) de uma tarefa, por task_id, mais antigos primeiro.',
      inputSchema: z.object({
        task_id: z.string().uuid(),
      }),
    },
    async ({ task_id }) => {
      const cols = [
        'id',
        'task_id',
        'user_id',
        'content',
        'created_at',
        'pendencia_caixa',
        'origem',
      ];
      const selectStr = pickExistingColumns('task_comments', columns, cols).join(',') || '*';
      const { data, error } = await supabase
        .from('task_comments')
        .select(selectStr)
        .eq('task_id', task_id)
        .order('created_at', { ascending: true })
        .limit(500);
      if (error) return toolError(`Supabase (ver_comentarios_tarefa): ${error.message}`);
      return jsonText({ total: data?.length ?? 0, comentarios: data });
    }
  );

  mcp.registerTool(
    'criar_projeto',
    {
      title: 'Criar projeto',
      description:
        'INSERT em projetos (id gerado pelo banco). Obrigatórios: name, client_id, owner_id. Opcionais: status (padrão planejamento), mes_referencia, data_evento (datas ISO YYYY-MM-DD).',
      inputSchema: z.object({
        name: z.string().min(1),
        client_id: z.string().uuid(),
        owner_id: z.string().uuid(),
        status: z.string().optional(),
        mes_referencia: z.string().optional(),
        data_evento: z.string().optional(),
      }),
    },
    async (args) => {
      const base: Record<string, unknown> = {
        name: args.name,
        client_id: args.client_id,
        owner_id: args.owner_id,
        status: args.status?.trim() || 'planejamento',
      };
      if (args.mes_referencia !== undefined && args.mes_referencia !== '') {
        base.mes_referencia = args.mes_referencia;
      }
      if (args.data_evento !== undefined && args.data_evento !== '') {
        base.data_evento = args.data_evento;
      } else if (args.data_evento === '') {
        base.data_evento = null;
      }

      const row = buildInsertRow(columns, 'projetos', base);
      const { data, error } = await supabase.from('projetos').insert(row).select().single();
      if (error) return toolError(`Supabase (criar_projeto): ${error.message}`);
      return jsonText({ projeto: data });
    }
  );

  mcp.registerTool(
    'atualizar_projeto',
    {
      title: 'Atualizar projeto',
      description:
        'UPDATE em projetos por id. Campos opcionais (intersecção com o schema): name, status, mes_referencia, data_evento (string ISO), owner_id. Atualiza updated_at quando existir. Retorna o projeto atualizado.',
      inputSchema: z.object({
        id: z.string().uuid(),
        name: z.string().min(1).optional(),
        status: z.string().min(1).optional(),
        mes_referencia: z.string().optional(),
        data_evento: z.string().optional(),
        owner_id: z.string().uuid().optional(),
      }),
    },
    async ({ id, name, status, mes_referencia, data_evento, owner_id }) => {
      try {
        const allowed = introspectColumns('projetos', columns);
        const patch: Record<string, unknown> = {};

        if (name !== undefined) patch.name = name;
        if (status !== undefined) patch.status = status;
        if (mes_referencia !== undefined) {
          patch.mes_referencia = mes_referencia === '' ? null : mes_referencia;
        }
        if (data_evento !== undefined) {
          patch.data_evento = data_evento === '' ? null : data_evento;
        }
        if (owner_id !== undefined) patch.owner_id = owner_id;

        const userKeys = Object.keys(patch).filter((k) => allowed.has(k));
        if (userKeys.length === 0) {
          throw new Error(
            'atualizar_projeto: informe ao menos um campo opcional existente no schema (name, status, mes_referencia, data_evento, owner_id).'
          );
        }

        if (allowed.has('updated_at')) {
          patch.updated_at = new Date().toISOString();
        }

        const row = buildInsertRow(columns, 'projetos', patch);
        const substantive = Object.keys(row).filter((k) => k !== 'updated_at');
        if (substantive.length === 0) {
          throw new Error(
            'atualizar_projeto: nenhum dos campos informados existe na tabela projetos (schema atual).'
          );
        }

        const { data, error } = await supabase
          .from('projetos')
          .update(row)
          .eq('id', id)
          .select()
          .single();
        if (error) throw new Error(`Supabase (atualizar_projeto): ${error.message}`);
        return jsonText({ projeto: data });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'adicionar_comentario',
    {
      title: 'Adicionar comentário em tarefa',
      description:
        'INSERT em task_comments. Obrigatórios: task_id, content. user_id fixo (Josias). Com pendencia_caixa=true, cria item só para assignees com profile status=active (nunca o UUID órfão a9b2a0f6-053d-44d2-b5b0-3c0d823c4e91). Sem parse do texto.',
      inputSchema: z.object({
        task_id: z.string().uuid(),
        content: z.string().min(1),
        pendencia_caixa: z.boolean().optional(),
      }),
    },
    async ({ task_id, content, pendencia_caixa }) => {
      const taskCommentCols = introspectColumns('task_comments', columns);
      if (pendencia_caixa && !taskCommentCols.has('pendencia_caixa')) {
        return toolError(
          'adicionar_comentario: migration da Caixa ainda não aplicada (coluna pendencia_caixa ausente).'
        );
      }

      const base: Record<string, unknown> = {
        task_id,
        user_id: JOSIAS_USER_ID,
        content,
      };
      if (pendencia_caixa !== undefined) {
        base.pendencia_caixa = pendencia_caixa;
        base.origem = pendencia_caixa ? 'gestor' : 'comentario';
      }
      const row = buildInsertRow(columns, 'task_comments', base);
      const { data, error } = await supabase.from('task_comments').insert(row).select().single();
      if (error) return toolError(`Supabase (adicionar_comentario): ${error.message}`);

      let pendencias: unknown[] = [];
      if (pendencia_caixa && data?.id) {
        const { data: pendingRows, error: pendingError } = await supabase
          .from('pendencias_caixa')
          .select('id,pessoa_id,estado,created_at')
          .eq('task_comment_id', data.id);
        if (pendingError) {
          return toolError(
            `Comentário criado, mas não foi possível confirmar a Caixa: ${pendingError.message}`
          );
        }
        pendencias = pendingRows ?? [];
      }

      return jsonText({
        comentario: data,
        pendencia_caixa: Boolean(pendencia_caixa),
        pendencias_criadas: pendencias.length,
        pendencias,
      });
    }
  );

  mcp.registerTool(
    'criar_plano_campanha',
    {
      title: 'Criar ou atualizar plano de campanha',
      description:
        'Um registro por project_id: se já existir plano para o projeto, faz UPDATE; senão INSERT. Campos opcionais em JSON conforme o schema (objetivo, estrategia_comunicacao, conteudo_criativos, trafego_pago, cronograma, roteiros, materiais).',
      inputSchema: z.object({
        project_id: z.string().uuid(),
        objetivo: z.string().optional(),
        estrategia_comunicacao: z.unknown().optional(),
        conteudo_criativos: z.unknown().optional(),
        trafego_pago: z.unknown().optional(),
        cronograma: z.unknown().optional(),
        roteiros: z.unknown().optional(),
        materiais: z.unknown().optional(),
      }),
    },
    async (args) => {
      const { project_id, objetivo, estrategia_comunicacao, conteudo_criativos, trafego_pago, cronograma, roteiros, materiais } =
        args;

      const patch: Record<string, unknown> = {};
      if (objetivo !== undefined) patch.objetivo = objetivo;
      if (estrategia_comunicacao !== undefined) patch.estrategia_comunicacao = estrategia_comunicacao;
      if (conteudo_criativos !== undefined) patch.conteudo_criativos = conteudo_criativos;
      if (trafego_pago !== undefined) patch.trafego_pago = trafego_pago;
      if (cronograma !== undefined) patch.cronograma = cronograma;
      if (roteiros !== undefined) patch.roteiros = roteiros;
      if (materiais !== undefined) patch.materiais = materiais;

      const { data: existente, error: selErr } = await supabase
        .from('campaign_plans')
        .select('id')
        .eq('project_id', project_id)
        .maybeSingle();
      if (selErr) return toolError(`Supabase (criar_plano_campanha select): ${selErr.message}`);

      if (existente?.id) {
        const row = buildInsertRow(columns, 'campaign_plans', patch);
        if (Object.keys(row).length === 0) {
          const { data: full, error: readErr } = await supabase
            .from('campaign_plans')
            .select('*')
            .eq('id', existente.id)
            .single();
          if (readErr) return toolError(`Supabase (criar_plano_campanha read): ${readErr.message}`);
          return jsonText({ plano: full, atualizado: false });
        }
        const { data, error } = await supabase
          .from('campaign_plans')
          .update(row)
          .eq('id', existente.id)
          .select()
          .single();
        if (error) return toolError(`Supabase (criar_plano_campanha update): ${error.message}`);
        return jsonText({ plano: data, atualizado: true });
      }

      const insertBase: Record<string, unknown> = { project_id, ...patch };
      const row = buildInsertRow(columns, 'campaign_plans', insertBase);
      const { data, error } = await supabase.from('campaign_plans').insert(row).select().single();
      if (error) return toolError(`Supabase (criar_plano_campanha insert): ${error.message}`);
      return jsonText({ plano: data, atualizado: false });
    }
  );

  mcp.registerTool(
    'deletar_tarefa',
    {
      title: 'Deletar tarefa',
      description: 'DELETE em tarefas pelo id. Retorna confirmação e o id removido.',
      inputSchema: z.object({
        id: z.string().uuid(),
      }),
    },
    async ({ id }) => {
      const { data, error } = await supabase.from('tarefas').delete().eq('id', id).select('id');
      if (error) return toolError(`Supabase (deletar_tarefa): ${error.message}`);
      const removidos = data ?? [];
      if (removidos.length === 0) {
        return jsonText({ ok: false, mensagem: 'Nenhuma linha encontrada com este id.', id });
      }
      return jsonText({ ok: true, id, removido: removidos[0] });
    }
  );

  registerMetaTools(mcp);
  registerAtendimentoTools(mcp, supabase, columns, actor);

  mcp.registerTool(
    'resumo_cobertura_mensal',
    {
      title: 'Resumo cobertura mensal',
      description:
        'Contratado (entregaveis) × planejado/entregue (tarefas) por cliente closed no mês. Use apenas_problemas para ver só 🔴/⚪/sem plano; somente_agregado para 1 linha de KPIs.',
      inputSchema: z.object({
        mes: z.string().optional().describe('YYYY-MM ou YYYY-MM-DD (default: mês atual)'),
        apenas_problemas: z.boolean().optional(),
        somente_agregado: z.boolean().optional(),
        exigir_responsavel_ativo: z.boolean().optional(),
      }),
    },
    async ({ mes, apenas_problemas, somente_agregado, exigir_responsavel_ativo }) => {
      try {
        const raw = (mes || new Date().toISOString().slice(0, 10)).trim();
        const mesDate = /^\d{4}-\d{2}$/.test(raw) ? `${raw}-01` : raw;
        const { inicio, fim, mesRef } = monthBounds(mesDate);
        const exigir = exigir_responsavel_ativo === true;

        // Tenta RPC
        const { data: rpcRows, error: rpcErr } = await supabase.rpc('resumo_cobertura_mensal', {
          p_mes: mesRef,
          p_exigir_responsavel_ativo: exigir,
        });

        let rows: Record<string, unknown>[] = [];
        let agregado: Record<string, unknown> | null = null;
        let fonte = 'rpc';

        if (!rpcErr && Array.isArray(rpcRows)) {
          rows = rpcRows as Record<string, unknown>[];
          const { data: agg } = await supabase.rpc('resumo_cobertura_agregado', {
            p_mes: mesRef,
            p_exigir_responsavel_ativo: exigir,
          });
          agregado = (Array.isArray(agg) ? agg[0] : agg) as Record<string, unknown> | null;
        } else {
          fonte = 'client';
          const [{ data: clientes }, { data: tarefas }, { data: projetos }, { data: profiles }] =
            await Promise.all([
              supabase
                .from('clientes')
                .select('id, empresa, etapa, valor, tipo_servico, tipo_contrato, entregaveis, responsavel')
                .eq('etapa', 'closed'),
              supabase
                .from('tarefas')
                .select(
                  'id, client_id, project_id, status, due_date, type, description, briefing_completo, briefing_legado, briefing_estado',
                )
                .gte('due_date', inicio)
                .lte('due_date', fim)
                .not('client_id', 'is', null),
              supabase
                .from('projetos')
                .select('id, client_id, mes_referencia, status')
                .not('mes_referencia', 'is', null)
                .gte('mes_referencia', inicio)
                .lte('mes_referencia', fim),
              supabase
                .from('profiles')
                .select('id, full_name, role, status')
                .in('role', ['superadmin', 'admin', 'colaborador']),
            ]);

          const computed = computeCoberturaFromRows({
            clientes: clientes || [],
            tarefas: tarefas || [],
            projetos: projetos || [],
            profiles: profiles || [],
            mesRef,
            exigirResponsavelAtivo: exigir,
          });
          rows = computed.rows as unknown as Record<string, unknown>[];
          agregado = computed.agregado as unknown as Record<string, unknown>;
        }

        if (somente_agregado) {
          return jsonText({ fonte, agregado });
        }

        let out = rows;
        if (apenas_problemas) {
          out = rows.filter((r) => {
            const st = String(r.status_cobertura || '');
            return st === 'descoberto' || st === 'sem_escopo' || (st !== 'nao_aplicavel' && !r.tem_plano_mes);
          });
        }

        return jsonText({
          fonte,
          total: out.length,
          agregado,
          clientes: out,
        });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );
}
