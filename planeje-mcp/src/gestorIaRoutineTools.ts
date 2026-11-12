import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { denyModule, loadModuleAccess, type McpActorLike } from './access.js';
import { maskRoutinePhone, maskRoutineText, normalizeRoutineWeek, routineLeadSummary, selectRoutineLeads } from '../../src/lib/gestorIaRoutine.js';

const week = z.string().refine(value => Boolean(value) && normalizeRoutineWeek(value) === value,
  'Informe a segunda-feira de uma semana válida no formato YYYY-MM-DD.');
const revision = z.number().int().nonnegative().optional()
  .describe('Versão obtida em gestor_ia_ler_semana; obrigatória para alterar uma revisão existente. Omitir somente na criação.');
const amount = z.number().finite().nonnegative().nullable().optional();
const count = z.number().finite().int().nonnegative().nullable().optional();
const identifier = z.string().max(256).optional();
const label = z.string().max(500).optional();
const campaignLine = z.object({
  id: z.string().uuid().optional(), platform: z.enum(['meta', 'google']).optional(),
  account_link_id: z.string().uuid().or(z.literal('')).optional(), account_id: identifier, account_name: label,
  campaign_id: identifier, campaign_name: label, adset_id: identifier, adset_name: label, conversion_label: label,
  spend: amount, conversions: amount, calls: count, daily_budget: amount, cpc: amount, messages: count,
  appointments: count, target_message_cost: amount, conversion_value: amount, simulacoes: count,
  cpf_bom: count, compras: count, orcamentos: count, lead_qualificado: count,
}).strict();
const scope = { cliente_id: z.string().uuid(), semana: week };
type Json = Record<string, unknown>;
type RoutineAction = 'panel' | 'read' | 'save' | 'suggest' | 'leads';
const maskedTextFields = new Set(['empresa', 'analysis', 'data_note', 'ai_suggestion', 'result_label',
  'account_name', 'campaign_name', 'adset_name', 'ad_name', 'conversion_label', 'sender_name']);

class RoutineError extends Error {}
function jsonText(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}
function failure(error: unknown) {
  return { content: [{ type: 'text' as const, text: error instanceof RoutineError ? error.message
    : 'Não foi possível validar a conta ou consultar a rotina. Tente novamente.' }], isError: true as const };
}
function record(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
}
function records(value: unknown): Json[] {
  if (!Array.isArray(value) || value.some(item => !item || typeof item !== 'object' || Array.isArray(item))) {
    throw new RoutineError('A rotina retornou uma resposta inválida. Tente novamente.');
  }
  return value;
}
function fields(value: unknown, keys: readonly string[]) {
  const source = record(value);
  return Object.fromEntries(keys.filter(key => Object.hasOwn(source, key)).map(key => {
    const item = source[key];
    return [key, maskedTextFields.has(key) && typeof item === 'string' ? maskRoutineText(item) : item];
  }));
}
const lineKeys = Object.keys(campaignLine.shape);
function reviewResult(data: Json) {
  const review = data.review == null ? null : {
    ...fields(data.review, ['id', 'client_id', 'week_start', 'kind', 'metric_mode', 'investment', 'contacts', 'results',
      'analysis', 'data_note', 'revision', 'fill_origin', 'validation_state', 'ai_suggestion', 'finalized_at', 'updated_at',
      'action_mode', 'action_task_id', 'task_id', 'task_due_date', 'result_label']),
    campaign_metrics: Array.isArray(record(data.review).campaign_metrics)
      ? (record(data.review).campaign_metrics as unknown[]).map(row => fields(row, lineKeys)) : [],
  };
  return { cliente_id: data.cliente_id, semana: data.semana, review };
}
function safeLead(value: unknown) {
  const lead = record(value);
  return { ...fields(lead, ['id', 'cliente_id', 'sender_name', 'first_seen_at', 'qualificado', 'comprou',
    'routineAppointment', 'routineScheduled', 'routineScheduleSource', 'routineCrmOutdated', 'routineMatchReason',
    'routineMatchMethod', 'routineCohort', 'routineScheduledAt']),
    routineOrigin: fields(lead.routineOrigin, ['account_id', 'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_name']),
    phone: maskRoutinePhone(lead.phone) };
}

/** Only this service RPC writes drafts; it repeats actor, module and client ACL checks transactionally. */
export function registerGestorIaRoutineTools(mcp: McpServer, db: SupabaseClient, actor?: McpActorLike): void {
  async function access(leads = false) {
    if (actor?.type !== 'user') throw new RoutineError('Use a sessão de uma pessoa ativa da equipe para acessar o Gestor IA.');
    const current = await loadModuleAccess(db, actor);
    const denied = denyModule(current, 'paid_traffic') || (leads ? denyModule(current, 'rastreamento') : null);
    if (denied) throw new RoutineError(denied);
    return actor.user_id;
  }
  async function rpc(userId: string, action: RoutineAction, semana: string, clienteId: string | null, payload: Json = {}) {
    const { data, error } = await db.rpc('gestor_ia_routine_mcp', {
      p_actor: userId, p_action: action, p_client: clienteId, p_week: semana, p_payload: payload,
    });
    if (error) {
      if (error.code === '40001') throw new RoutineError('A revisão mudou. Use gestor_ia_ler_semana novamente e envie a revision atual.');
      if (error.code === '55000') throw new RoutineError('Semana validada: somente a equipe humana pode reabri-la antes de outro rascunho IA.');
      if (error.code === '42501') throw new RoutineError('Acesso negado à rotina deste cliente para a pessoa da sessão.');
      if (error.code === '22023') throw new RoutineError('Dados inválidos para a rotina. Confira semana, linhas e versão.');
      throw new RoutineError('Não foi possível consultar ou salvar a rotina. Tente novamente.');
    }
    const result = record(data);
    if (action !== 'leads' && (result.semana !== semana || (clienteId && result.cliente_id !== clienteId))) {
      throw new RoutineError('A resposta da rotina não corresponde ao cliente e à semana solicitados.');
    }
    return result;
  }

  mcp.registerTool('gestor_ia_listar_painel', {
    title: 'Listar painel semanal do Gestor IA',
    description: 'Lista somente clientes autorizados da carteira, estado e totais da semana informada pela segunda-feira. Leitura local; não consulta Meta ou Google.',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: z.object({ semana: week }).strict(),
  }, async ({ semana }) => {
    try {
      const result = await rpc(await access(), 'panel', semana, null);
      return jsonText({ semana, clientes: records(result.clientes).map(client => fields(client,
        ['cliente_id', 'empresa', 'status', 'fill_origin', 'revision', 'investment', 'appointments', 'review_id'])) });
    } catch (error) { return failure(error); }
  });

  mcp.registerTool('gestor_ia_ler_semana', {
    title: 'Ler revisão semanal do Gestor IA',
    description: 'Lê a revisão existente do cliente/semana e sua revision para edição concorrente. Não cria nem conclui a semana. Sem chamadas Meta/Google.',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: z.object(scope).strict(),
  }, async ({ cliente_id, semana }) => {
    try { return jsonText(reviewResult(await rpc(await access(), 'read', semana, cliente_id))); }
    catch (error) { return failure(error); }
  });

  mcp.registerTool('gestor_ia_salvar_semana', {
    title: 'Salvar rascunho IA da semana',
    description: 'Grava linhas canônicas de campaign_metrics e análise opcional sempre como rascunho IA. Não valida, conclui, reabre ou altera campanhas. Leia a semana e informe revision ao editar; semana validada exige reabertura humana.',
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: z.object({ ...scope, linhas: z.array(campaignLine).max(50), analise: z.string().max(10000).optional(), revision }).strict(),
  }, async ({ cliente_id, semana, linhas, analise, revision: version }) => {
    try {
      return jsonText(reviewResult(await rpc(await access(), 'save', semana, cliente_id,
        { linhas, ...(analise === undefined ? {} : { analise }), ...(version === undefined ? {} : { revision: version }) })));
    } catch (error) { return failure(error); }
  });

  mcp.registerTool('gestor_ia_sugerir_acao', {
    title: 'Sugerir próxima ação da semana',
    description: 'Salva sugestão textual IA para avaliação humana, sem criar tarefa nem concluir a revisão. Leia a semana e informe revision ao editar; semana validada exige reabertura humana.',
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: z.object({ ...scope, texto: z.string().trim().min(1).max(10000), revision }).strict(),
  }, async ({ cliente_id, semana, texto, revision: version }) => {
    try {
      return jsonText(reviewResult(await rpc(await access(), 'suggest', semana, cliente_id,
        { texto, ...(version === undefined ? {} : { revision: version }) })));
    } catch (error) { return failure(error); }
  });

  mcp.registerTool('gestor_ia_ver_leads', {
    title: 'Ver leads seguros da semana',
    description: 'Leads com telefone mascarado. modo entrada (padrão): primeira entrada na semana de Brasília; modo agendados_na_semana: marcações comprovadas no histórico daquela semana, com novos e antigos separados. conjunto_ids filtra IDs dos conjuntos da revisão; omitir ou [] inclui origens históricas no segundo modo. Vínculo por nome é identificado e ambiguidades ficam em unmatchedLeads, junto de Google/manuais. summary separa novos/antigos; CPA usa apenas novos agendados e gasto Meta representado. Não consulta Meta/Google nem retorna mensagens brutas. Exige Tráfego e Rastreamento.',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: z.object({ ...scope, conjunto_ids: z.array(z.string().trim().min(1).max(256)).max(1000).optional(),
      somente_agendados: z.boolean().optional(), modo: z.enum(['entrada', 'agendados_na_semana']).default('entrada') }).strict(),
  }, async ({ cliente_id, semana, conjunto_ids, somente_agendados, modo }) => {
    try {
      const userId = await access(true);
      const saved = await rpc(userId, 'read', semana, cliente_id);
      const metrics = record(saved.review).campaign_metrics;
      const allRows = Array.isArray(metrics) ? metrics : [];
      let rows = allRows;
      if (conjunto_ids?.length) {
        const wanted = new Set(conjunto_ids);
        rows = rows.filter(row => wanted.has(String(record(row).adset_id ?? '')));
        if ([...wanted].some(id => !rows.some(row => record(row).adset_id === id))) {
          throw new RoutineError('Conjunto não encontrado na revisão deste cliente e desta semana. Leia gestor_ia_ler_semana e use os IDs registrados.');
        }
      }
      const result = await rpc(userId, 'leads', semana, cliente_id, { modo });
      const selected = selectRoutineLeads(records(result.contacts), {
        clientId: cliente_id, weekStart: semana, rows, allRows, mode: modo,
        originCatalog: result.origin_catalog == null ? [] : records(result.origin_catalog),
        appointmentEvents: modo === 'agendados_na_semana' ? records(result.appointment_events) : [], config: result.config, niche: typeof result.niche === 'string' ? result.niche : '',
        appointmentsOnly: somente_agendados ?? false, messages: records(result.messages),
      });
      return jsonText({ cliente_id, semana, modo, leads: selected.leads.map(safeLead),
        summary: routineLeadSummary(selected, rows), originRows: selected.originRows.map(row => fields(row,
          ['account_id', 'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'spend', 'readOnly', 'status',
            'novos', 'antigos', 'agendamentos', 'agendamentosNovos', 'agendamentosAntigos', 'cpa'])),
        unmatchedLeads: selected.unmatchedLeads.map(safeLead), unattributed: selected.unattributed,
        unresolvedRows: selected.unresolvedRows, total: selected.leads.length, totalSemCorrespondencia: selected.unmatchedLeads.length });
    } catch (error) { return failure(error); }
  });
}
