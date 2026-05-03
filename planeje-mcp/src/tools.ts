import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  type TableColumnMap,
  introspectColumns,
  pickExistingColumns,
} from './introspect.js';

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

export function registerPlanejeTools(
  mcp: McpServer,
  supabase: SupabaseClient,
  columns: TableColumnMap
): void {
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
      const n = limite ?? 200;
      const { data, error } = await supabase.from('clientes').select('*').limit(n);
      if (error) return toolError(`Supabase (listar_clientes): ${error.message}`);
      return jsonText({ total: data?.length ?? 0, clientes: data });
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
        'Lista tarefas (colunas principais). Paginação: limit padrão 20. Sem status informado, exclui concluídas (status ≠ completed). Filtros: client_id, project_id, status, responsavel_id (assignee_ids), cursor_due_date (due_date > cursor para próxima página). Ordenação: due_date ascendente. next_cursor: due_date do último item se houver página cheia, senão null.',
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

        const rows = data ?? [];
        let next_cursor: string | null = null;
        if (rows.length === n && rows.length > 0) {
          const last = rows[rows.length - 1];
          const rec = typeof last === 'object' && last !== null ? (last as Record<string, unknown>) : null;
          const dd = rec?.due_date;
          next_cursor = typeof dd === 'string' && dd.length > 0 ? dd : null;
        }

        return jsonText({
          limite: n,
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
        'Contagem de tarefas por status e por responsável. Usa team_members se existir no schema; senão profiles.',
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
      const idToName = new Map<string, string>();

      const teamCols = columns.team_members ?? [];
      const hasTeamMembers = teamCols.length > 0;

      if (hasTeamMembers) {
        const idCol = teamCols.includes('id')
          ? 'id'
          : teamCols.includes('user_id')
            ? 'user_id'
            : 'id';
        const namePick = pickExistingColumns('team_members', columns, [
          'full_name',
          'nome',
          'name',
          'email',
        ]);
        const nameCol = namePick[0];
        if (nameCol && uuidKeys.length) {
          const { data: members, error: memErr } = await supabase
            .from('team_members')
            .select('*')
            .in(idCol, uuidKeys);
          if (memErr)
            return toolError(`Supabase (resumo_agencia team_members): ${memErr.message}`);
          for (const m of members ?? []) {
            const rec = m as Record<string, unknown>;
            const id = String(rec[idCol] ?? '');
            const label = String(rec[nameCol] ?? id);
            if (id) idToName.set(id, label);
          }
        }
      } else {
        const namePick = pickExistingColumns('profiles', columns, ['full_name', 'email']);
        const nameCol = namePick[0] ?? 'full_name';
        if (uuidKeys.length) {
          const { data: profs, error: pErr } = await supabase
            .from('profiles')
            .select('*')
            .in('id', uuidKeys);
          if (pErr) return toolError(`Supabase (resumo_agencia profiles): ${pErr.message}`);
          for (const p of profs ?? []) {
            const rec = p as Record<string, unknown>;
            const id = String(rec.id ?? '');
            const label = String(rec[nameCol] ?? id);
            if (id) idToName.set(id, label);
          }
        }
      }

      const porResponsavel: { chave: string; tarefas_como_responsavel: number }[] = [];
      for (const [k, v] of byAssignee) {
        const label = idToName.get(k) ?? k;
        porResponsavel.push({ chave: label, tarefas_como_responsavel: v });
      }
      porResponsavel.sort((a, b) => b.tarefas_como_responsavel - a.tarefas_como_responsavel);

      const porStatus = [...byStatus.entries()]
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count);

      return jsonText({
        amostra_linhas: rows.length,
        truncado: rows.length >= cap,
        fonte_membros: hasTeamMembers ? 'team_members' : 'profiles',
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
        'Todos os registros de profiles com colunas id, full_name, role e status (intersecção com o schema introspectado). Sem filtros.',
      inputSchema: z.object({}),
    },
    async () => {
      const wanted = ['id', 'full_name', 'role', 'status'] as const;
      const selectList = pickExistingColumns('profiles', columns, [...wanted]);
      const selectStr = selectList.length > 0 ? selectList.join(',') : 'id, full_name, role';

      const { data, error } = await supabase
        .from('profiles')
        .select(selectStr)
        .order('full_name', { ascending: true });
      if (error) return toolError(`Supabase (listar_equipe): ${error.message}`);
      return jsonText({ total: data?.length ?? 0, membros: data });
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
      inputSchema: z.object({
        cliente_id: z.string().uuid(),
        data_inicio: z.string().optional(),
        data_fim: z.string().optional(),
        limit: z.number().int().positive().max(500).optional(),
      }),
    },
    async ({ cliente_id, data_inicio, data_fim, limit }) => {
      try {
        const n = limit ?? 90;
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
        const { data, error } = await q.order('data_referencia', { ascending: false }).limit(n);
        if (error) throw new Error(`Supabase (ver_resultados_cliente): ${error.message}`);
        const rows = data ?? [];
        return jsonText({ cliente_id, total: rows.length, resultados: rows });
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
      title: 'Ver campanhas pagas',
      description:
        'Lista paid_campaigns com filtros opcionais client_id e status (até 300 linhas por segurança).',
      inputSchema: z.object({
        client_id: z.string().uuid().optional(),
        status: z.string().optional(),
      }),
    },
    async ({ client_id, status }) => {
      const cols = [
        'id',
        'client_id',
        'name',
        'description',
        'status',
        'budget',
        'kpis',
        'ad_sets',
      ];
      const selectStr = pickExistingColumns('paid_campaigns', columns, cols).join(',') || '*';
      let q = supabase.from('paid_campaigns').select(selectStr);
      if (client_id) q = q.eq('client_id', client_id);
      if (status != null && String(status).trim() !== '') {
        q = q.eq('status', String(status).trim());
      }
      const { data, error } = await q.order('created_at', { ascending: false }).limit(300);
      if (error) return toolError(`Supabase (ver_campanhas_pagas): ${error.message}`);
      return jsonText({ total: data?.length ?? 0, campanhas: data });
    }
  );

  mcp.registerTool(
    'criar_campanha_paga',
    {
      title: 'Criar campanha paga',
      description:
        'INSERT em paid_campaigns. Obrigatórios: client_id, name. Opcionais: status (padrão ativa), objetivo (ou description se objetivo não existir), plataforma, orcamento (mapeia para budget/orcamento), data_inicio, data_fim, meta_id. Campos filtrados por introspectColumns(paid_campaigns).',
      inputSchema: z.object({
        client_id: z.string().uuid(),
        name: z.string().min(1),
        status: z.string().optional(),
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
        'UPDATE em paid_campaigns por id. Mesmos campos opcionais de criar_campanha_paga + id obrigatório. objetivo/orcamento seguem o mesmo mapeamento para colunas do schema; updated_at se existir.',
      inputSchema: z.object({
        id: z.string().uuid(),
        client_id: z.string().uuid().optional(),
        name: z.string().min(1).optional(),
        status: z.string().optional(),
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
      const cols = ['id', 'task_id', 'user_id', 'content', 'created_at'];
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
        'INSERT em task_comments. Obrigatórios: task_id, content. user_id fixo (Josias). created_at pelo banco.',
      inputSchema: z.object({
        task_id: z.string().uuid(),
        content: z.string().min(1),
      }),
    },
    async ({ task_id, content }) => {
      const base: Record<string, unknown> = {
        task_id,
        user_id: JOSIAS_USER_ID,
        content,
      };
      const row = buildInsertRow(columns, 'task_comments', base);
      const { data, error } = await supabase.from('task_comments').insert(row).select().single();
      if (error) return toolError(`Supabase (adicionar_comentario): ${error.message}`);
      return jsonText({ comentario: data });
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
}
