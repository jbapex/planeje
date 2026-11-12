import { monthEnd, monthStart, shiftMonth } from './collaboratorIndicators.js';

const PAGE = 1000;

/** Lê todas as linhas, de mil em mil: o servidor nunca devolve mais que isso. */
export async function fetchAllRows(build, { orderBy = 'id' } = {}) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().order(orderBy, { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE) return rows;
  }
}

const TASK_FIELDS = [
  'id', 'created_at', 'title', 'type', 'status', 'client_id', 'project_id', 'assignee_ids', 'due_date', 'post_date',
  'customer_promised_date', 'recording_scheduled_on', 'production_delivered_at', 'workflow_template_id',
  'workflow_stage_key', 'review_round', 'status_history', 'stage_execution_history',
].join(', ');

export async function loadCollaboratorIndicatorData(supabase, { month, selfId = null }) {
  const start = monthStart(month);
  const end = monthEnd(month);
  const nextStart = shiftMonth(month, 1);

  let peopleQuery = supabase.from('profiles').select('id, full_name, avatar_url, role, status').in('role', ['colaborador', 'admin', 'superadmin']);
  if (selfId) peopleQuery = peopleQuery.eq('id', selfId);

  const [
    peopleResult, profilesResult, tasks, templatesResult, deadlineChanges, projects, clientsResult,
    opsResult, reviewsResult, checkupsResult, publications, reworkResult, onboardingResult, snapshotsResult, goalsResult,
  ] = await Promise.all([
    peopleQuery,
    supabase.from('collaborator_indicator_profiles').select('profile_id, indicator_profile'),
    fetchAllRows(() => supabase.from('tarefas').select(TASK_FIELDS)),
    supabase.from('task_workflow_templates').select('id, name, stages'),
    fetchAllRows(() => supabase.from('task_deadline_changes').select('id, task_id, field, old_value, new_value, source, changed_by, changed_at')),
    fetchAllRows(() => supabase.from('projetos').select('id, mes_referencia').not('mes_referencia', 'is', null)),
    supabase.from('clientes').select('id, empresa, responsavel, etapa, meta_custo_mensagem, meta_custo_compra').order('empresa'),
    supabase.from('traffic_client_ops').select('client_id, primary_assignee_id'),
    supabase.from('traffic_weekly_reviews').select('id, client_id, week_start, kind, task_id, finalized_at, finalized_by, investment, contacts, results, metric_mode, campaign_metrics').gte('week_start', shiftMonth(month, -1)).lt('week_start', shiftMonth(month, 2)),
    supabase.from('traffic_checkup_runs').select('client_id, operational_date, confirmed_by, confirmed_at').gte('operational_date', start).lte('operational_date', end),
    fetchAllRows(() => supabase.from('task_channel_publications').select('id, task_id, evidence_url, meta_post_id, status')),
    supabase.from('task_rework_events').select('id, task_id, kind, reason, notes, created_by, created_at'),
    supabase.from('client_onboarding_stages').select('id, title, pending_side, sla_days, state, task_id, started_at, completed_at, client_onboardings(client_id)'),
    supabase.from('indicator_month_snapshots').select('kind, reference_month, source, rows, taken_at').eq('reference_month', start),
    supabase.from('client_result_goals').select('client_id, reference_month, leads_goal, agendamentos_goal, vendas_goal').eq('reference_month', start),
  ]);

  for (const result of [peopleResult, profilesResult, templatesResult, clientsResult, opsResult, reviewsResult, checkupsResult, reworkResult, onboardingResult, snapshotsResult, goalsResult]) {
    if (result.error) throw result.error;
  }

  const profileByPerson = new Map((profilesResult.data || []).map((row) => [row.profile_id, row.indicator_profile]));
  const people = (peopleResult.data || []).map((person) => ({ ...person, indicator_profile: profileByPerson.get(person.id) || null }));

  const goals = goalsResult.data || [];
  const goalClients = goals.filter((goal) => goal.leads_goal != null || goal.agendamentos_goal != null || goal.vendas_goal != null).map((goal) => goal.client_id);
  let crmContacts = [];
  let miniCrmConfigs = [];
  if (goalClients.length) {
    const [contacts, configs] = await Promise.all([
      fetchAllRows(() => supabase.from('cliente_whatsapp_contact')
        .select('id, cliente_id, first_seen_at, origin_source, utm_source, tracking_data, mini_crm, comprou')
        .in('cliente_id', goalClients).gte('first_seen_at', `${start}T00:00:00-03:00`).lt('first_seen_at', `${nextStart}T00:00:00-03:00`)),
      supabase.from('mini_crm_config').select('cliente_id, statuses, columns').in('cliente_id', goalClients),
    ]);
    if (configs.error) throw configs.error;
    crmContacts = contacts;
    miniCrmConfigs = configs.data || [];
  }

  const snapshots = Object.fromEntries((snapshotsResult.data || []).map((row) => [row.kind, row]));

  return {
    month: start,
    people,
    tasks,
    templates: templatesResult.data || [],
    deadlineChanges,
    projects,
    clients: clientsResult.data || [],
    trafficOps: opsResult.data || [],
    reviews: reviewsResult.data || [],
    checkups: checkupsResult.data || [],
    publications,
    reworkEvents: reworkResult.data || [],
    onboardingStages: (onboardingResult.data || []).map((stage) => ({ ...stage, client_id: stage.client_onboardings?.client_id || null })),
    snapshots,
    goals,
    crmContacts,
    miniCrmConfigs,
  };
}
