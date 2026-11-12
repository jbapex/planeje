import { supabase } from '@/lib/customSupabaseClient';

export async function setCentralTrafegoAllowlist({ enabled, profileIds }) {
  const { data, error } = await supabase.rpc('central_trafego_set_allowlist', {
    p_enabled: enabled,
    p_profile_ids: profileIds || [],
  });
  return { data: data || null, error };
}

export async function fetchCentralTrafegoFlag() {
  const { data, error } = await supabase.rpc('central_trafego_ui_allowed');
  if (error) return { enabled: false, allowed: false, error, loaded: true };

  const { data: settings } = await supabase
    .from('traffic_central_settings')
    .select('enabled')
    .eq('id', true)
    .maybeSingle();

  return {
    enabled: Boolean(settings?.enabled),
    allowed: Boolean(data),
    error: null,
    loaded: true,
  };
}

export async function createTrafficDemand(payload) {
  const { data, error } = await supabase.rpc('create_traffic_demand', {
    p_title: payload.title,
    p_client_id: payload.clientId,
    p_demand_type: payload.demandType,
    p_due_date: payload.dueDate,
    p_priority: payload.priority,
    p_assignee_ids: payload.assigneeIds,
    p_description: payload.description || null,
    p_links: payload.links || [],
    p_campaign: payload.campaign || null,
    p_source_type: payload.sourceType || 'manual',
    p_source_reference: payload.sourceReference || null,
    p_generated_from_task_id: payload.generatedFromTaskId || null,
    p_generation_key: payload.generationKey || null,
    p_next_review_at: payload.nextReviewAt || null,
  });
  return { taskId: data, error };
}

export async function completeTrafficDemand(payload) {
  const { data, error } = await supabase.rpc('complete_traffic_demand', {
    p_task_id: payload.taskId,
    p_completion_summary: payload.summary,
    p_next_action_none: Boolean(payload.nextActionNone),
    p_successor_title: payload.successorTitle || null,
    p_successor_demand_type: payload.successorDemandType || null,
    p_successor_due_date: payload.successorDueDate || null,
    p_successor_priority: payload.successorPriority || null,
    p_successor_assignee_ids: payload.successorAssigneeIds || null,
    p_comment_content: payload.commentContent || null,
    p_attachment_ids: payload.attachmentIds || [],
    p_evidence_campaign_ids: payload.evidenceCampaignIds || [],
    p_terminal_status: payload.terminalStatus || null,
  });
  return { result: data, error };
}

export async function upsertTrafficClientRoutines(payload) {
  const { error } = await supabase.rpc('upsert_traffic_client_routines', {
    p_client_id: payload.clientId,
    p_report_enabled: payload.reportEnabled ?? true,
    p_crm_weekly_enabled: payload.crmWeeklyEnabled ?? false,
    p_report_cadence: payload.reportCadence ?? 15,
    p_group_weekly_enabled: payload.groupWeeklyEnabled ?? true,
  });
  return { error };
}

export async function fetchCentralTrafegoHoje() {
  const { data, error } = await supabase.rpc('central_trafego_hoje');
  return { data: data || null, error };
}

export async function fetchTrafficWeeklyBoard() {
  const { data, error } = await supabase.rpc('traffic_weekly_board');
  return { data: data || null, error };
}

export async function fetchCentralTrafegoSituacao() {
  const { data, error } = await supabase.rpc('central_trafego_situacao');
  return { data: data || null, error };
}

export async function fetchCentralTrafegoCheckupBoard() {
  const { data, error } = await supabase.rpc('central_trafego_checkup_board');
  return { data: data || null, error };
}

export async function confirmTrafficCheckup(payload) {
  const { data, error } = await supabase.rpc('central_trafego_confirm_checkup', {
    p_client_id: payload.clientId,
    p_result: payload.result,
    p_note: payload.note || null,
    p_attention_problem: payload.attentionProblem || null,
    p_attention_assignee_id: payload.attentionAssigneeId || null,
    p_attention_due_date: payload.attentionDueDate || null,
  });
  return { data: data || null, error };
}

export async function upsertTrafficCheckupSettings(payload) {
  const { error } = await supabase.rpc('upsert_traffic_checkup_settings', {
    p_client_id: payload.clientId,
    p_enabled: payload.enabled,
    p_weekdays: payload.weekdays,
    p_expected_time: payload.expectedTime || null,
    p_require_active_campaign: payload.requireActiveCampaign,
    p_require_budget: payload.requireBudget,
    p_check_indicators: payload.indicators || null,
    p_assignee_id: payload.assigneeId || null,
  });
  return { error };
}

export async function upsertTrafficClientOps(payload) {
  const { error } = await supabase.rpc('upsert_traffic_client_ops', {
    p_client_id: payload.clientId,
    p_primary_assignee_id: payload.primaryAssigneeId || null,
    p_situation: payload.situation,
    p_situation_reason: payload.situationReason || null,
    p_resume_at: payload.resumeAt || null,
  });
  return { error };
}

export async function updateClientLimiteMeta(clientId, limiteMeta) {
  const raw = limiteMeta === '' || limiteMeta == null ? null : Number(limiteMeta);
  const value = raw == null || !Number.isFinite(raw) || raw <= 0 ? null : raw;
  const { error } = await supabase.from('clientes').update({ limite_meta: value }).eq('id', clientId);
  return { error };
}

export async function fetchTaskAttachments(taskId) {
  if (!taskId) return { data: [], error: null };
  const { data, error } = await supabase
    .from('task_attachments')
    .select('id, name, url, provider, created_at')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });
  return { data: data || [], error };
}
