import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildTrafegoHubModel } from '@/lib/trafegoSaude';
import { operationalDate } from '@/lib/centralTrafego';
import {
  fetchCentralTrafegoCheckupBoard,
  fetchCentralTrafegoSituacao,
  confirmTrafficCheckup,
  upsertTrafficClientOps,
  upsertTrafficCheckupSettings,
  updateClientLimiteMeta,
} from '@/lib/centralTrafegoApi';
import { DEFAULT_CHECKUP_WEEKDAYS, validateCheckupConfirm } from '@/lib/centralTrafegoCheckup';
import { unwrapMoney } from '@/lib/trafegoAcoes';
import { supabase } from '@/lib/customSupabaseClient';

const WAITING_TYPES = new Set(['cobranca_material', 'aprovacao_cliente']);

function mapTask(row, teamById) {
  const details = row.details && typeof row.details === 'object' ? row.details : {};
  const demandType = details.demand_type || row.demand_type || null;
  const origin = details.source_type || details.origin || (row.type === 'paid_traffic' ? 'tarefa' : row.type) || 'tarefa';
  const assigneeIds = row.assignee_ids || [];
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    due_date: row.due_date,
    clientId: row.client_id,
    client_id: row.client_id,
    demand_type: demandType,
    details,
    origin,
    priority: row.priority || details.priority || null,
    waitingClient: WAITING_TYPES.has(demandType),
    assignee_ids: assigneeIds,
    assignee_name: row.assignee_name || teamById?.[assigneeIds[0]] || null,
  };
}

function mapAttachment(row, task) {
  const provider = row.provider || 'link';
  let linkedTo = 'tarefa';
  if (provider === 'google_drive') linkedTo = 'drive';
  const demand = task?.demand_type;
  if (demand === 'aprovacao_cliente') linkedTo = 'aprovacao';
  else if (demand === 'criativo' || demand === 'revisao_72h') linkedTo = 'revisao';
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    provider,
    linkedTo,
    taskId: row.task_id,
    clientId: task?.clientId || task?.client_id || null,
  };
}

function mergeLiveExtras(rows, { tasks, attachments, campaigns, budgets }) {
  const tasksByClient = {};
  const taskById = {};
  for (const task of tasks || []) {
    taskById[task.id] = task;
    const key = task.clientId || task.client_id;
    if (!key) continue;
    if (!tasksByClient[key]) tasksByClient[key] = [];
    tasksByClient[key].push(task);
  }
  const attsByClient = {};
  for (const att of attachments || []) {
    const task = taskById[att.taskId];
    const key = att.clientId || task?.clientId || task?.client_id;
    if (!key) continue;
    if (!attsByClient[key]) attsByClient[key] = [];
    attsByClient[key].push(att);
  }
  const campsByClient = {};
  for (const camp of campaigns || []) {
    const key = camp.client_id || camp.clientId;
    if (!key) continue;
    if (!campsByClient[key]) campsByClient[key] = [];
    campsByClient[key].push({ id: camp.id, name: camp.name || camp.title, status: camp.status, client_id: key });
  }
  return rows.map((row) => ({
    ...row,
    budget: row.budget ?? budgets?.[row.clientId] ?? null,
    tasks: tasksByClient[row.clientId] || row.tasks || [],
    attachments: attsByClient[row.clientId] || row.attachments || [],
    campaigns: campsByClient[row.clientId]?.length ? campsByClient[row.clientId] : row.campaigns || [],
  }));
}

function mapLiveRows(situacao, checkup) {
  const board = Object.fromEntries((checkup?.clients || []).map((row) => [row.client_id, row]));
  return (situacao?.rows || []).map((row) => {
    const check = board[row.client_id] || {};
    const spend = unwrapMoney(check.spend_month);
    const budget = unwrapMoney(check.budget);
    const metaOk = Boolean(row.meta_resumo) && !row.meta_resumo?.permError;
    return {
      clientId: row.client_id,
      empresa: row.empresa,
      gestorId: row.gestor_id,
      gestorName: row.gestor_name,
      situation: row.situation,
      situationReason: row.situation_reason || null,
      resumeAt: row.resume_at || null,
      requireActiveCampaign: check.require_active_campaign,
      requireBudget: check.require_budget,
      checkupSettings: check.settings || null,
      activeCampaigns: row.active_campaigns,
      spendMonth: spend.available ? spend.amount : row.meta_resumo?.spend,
      spendMonthAvailable: spend.available || metaOk,
      budget: budget.available ? budget.amount : null,
      snapshot: row.meta_resumo,
      nextAction: row.next_action,
      nextActionOverdue: row.next_action_overdue,
      openTasks: row.open_tasks,
      overdueTasks: row.overdue_tasks,
      updated_at: row.updated_at,
      due: check.due !== false,
      checkup: check.run || {
        result: row.checkup_result,
        confirmed_at: row.checkup_confirmed_at,
        actor_name: row.checkup_actor_name,
        attention_problem: row.checkup_problem,
        task_id: row.checkup_task_id,
        task_title: row.checkup_task_title,
        note: row.checkup_note,
      },
      campaigns: row.campaigns_without_demand || [],
      tasks: [],
      attachments: [],
      indicators: check.indicators,
      primaryIndicator: row.meta_resumo?.inferredGoal || null,
    };
  });
}

function teamFromPreview(rows) {
  const seen = new Map();
  for (const row of rows || []) {
    if (row.gestorId && !seen.has(row.gestorId)) {
      seen.set(row.gestorId, { id: row.gestorId, full_name: row.gestorName || row.gestorId });
    }
  }
  return [...seen.values()];
}

async function fetchLiveExtras(clientIds, team) {
  const teamById = Object.fromEntries((team || []).map((p) => [p.id, p.full_name]));
  const [{ data: taskRows }, { data: campaignRows }, { data: budgetRows }] = await Promise.all([
    supabase.from('tarefas').select('id, title, status, client_id, type, due_date, assignee_ids, details').eq('type', 'paid_traffic'),
    supabase.from('paid_campaigns').select('id, name, status, client_id'),
    clientIds.length
      ? supabase.from('clientes').select('id, limite_meta').in('id', clientIds)
      : Promise.resolve({ data: [] }),
  ]);
  const mappedTasks = (taskRows || []).map((row) => mapTask(row, teamById));
  const taskIds = mappedTasks.map((t) => t.id).filter(Boolean);
  let attachments = [];
  if (taskIds.length) {
    const { data: attRows } = await supabase
      .from('task_attachments')
      .select('id, name, url, provider, task_id')
      .in('task_id', taskIds);
    const byId = Object.fromEntries(mappedTasks.map((t) => [t.id, t]));
    attachments = (attRows || []).map((row) => mapAttachment(row, byId[row.task_id]));
  }
  const budgets = Object.fromEntries((budgetRows || []).map((row) => [row.id, row.limite_meta]));
  return { tasks: mappedTasks, attachments, campaigns: campaignRows || [], budgets };
}

export function useTrafegoOperacao({ preview = false, previewLoader = null } = {}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [raw, setRaw] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [team, setTeam] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const today = operationalDate();

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (preview) {
        if (typeof previewLoader !== 'function') {
          throw new Error('Preview local indisponível neste ambiente.');
        }
        const data = await previewLoader();
        const rows = data?.rows || [];
        const previewTasks = data?.tasks || rows.flatMap((row) => row.tasks || []);
        setRaw(rows);
        setTasks(previewTasks);
        setTeam(data?.team || teamFromPreview(rows));
        setCampaigns(rows.flatMap((row) => (row.campaigns || []).map((c) => ({ ...c, client_id: row.clientId }))));
        return;
      }
      const [sit, board] = await Promise.all([fetchCentralTrafegoSituacao(), fetchCentralTrafegoCheckupBoard()]);
      if (sit.error) throw sit.error;
      const nextTeam = sit.data?.team || board.data?.team || [];
      const clientIds = (sit.data?.rows || []).map((row) => row.client_id).filter(Boolean);
      const extras = await fetchLiveExtras(clientIds, nextTeam).catch(() => ({
        tasks: [],
        attachments: [],
        campaigns: [],
        budgets: {},
      }));
      const merged = mergeLiveExtras(mapLiveRows(sit.data, board.error ? null : board.data), extras);
      setRaw(merged);
      setTasks(extras.tasks || []);
      setTeam(nextTeam);
      setCampaigns(extras.campaigns || []);
    } catch (e) {
      setError(e?.message || String(e));
      setRaw([]);
      setTasks([]);
      setTeam([]);
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, [preview, previewLoader]);

  useEffect(() => {
    reload();
  }, [reload]);

  const model = useMemo(
    () => buildTrafegoHubModel(raw, { operationalDate: today, tasks }),
    [raw, tasks, today]
  );

  const confirmCheckup = useCallback(
    async (client, payload) => {
      const parsed = validateCheckupConfirm({
        clientId: client.clientId,
        result: payload.result,
        note: payload.note,
        attentionProblem: payload.problem,
        attentionAssigneeId: payload.result === 'needs_attention' ? client.gestorId : null,
        attentionDueDate: payload.due,
      });
      if (!parsed.ok) return { ok: false, error: parsed.errors[0] };
      if (preview) {
        setRaw((prev) =>
          prev.map((row) =>
            row.clientId === client.clientId
              ? {
                  ...row,
                  checkup: {
                    result: payload.result,
                    confirmed_at: new Date().toISOString(),
                    actor_name: 'Preview',
                    note: payload.note,
                    attention_problem: payload.problem,
                    attention_due_date: payload.due,
                  },
                }
              : row
          )
        );
        return { ok: true };
      }
      const { error: err } = await confirmTrafficCheckup({
        clientId: client.clientId,
        result: payload.result,
        note: payload.note,
        attentionProblem: payload.problem,
        attentionAssigneeId: client.gestorId,
        attentionDueDate: payload.due,
      });
      if (err) return { ok: false, error: err.message || String(err) };
      await reload();
      return { ok: true };
    },
    [preview, reload]
  );

  const saveClientOps = useCallback(
    async (client, patch) => {
      const next = {
        primaryAssigneeId: patch.primaryAssigneeId === undefined ? client.gestorId : patch.primaryAssigneeId,
        situation: patch.situation || client.situation || 'active',
        situationReason: patch.situationReason === undefined ? client.situationReason : patch.situationReason,
        resumeAt: patch.resumeAt === undefined ? client.resumeAt : patch.resumeAt,
      };
      if (preview) {
        setRaw((prev) =>
          prev.map((row) =>
            row.clientId === client.clientId
              ? {
                  ...row,
                  gestorId: next.primaryAssigneeId,
                  gestorName: team.find((p) => p.id === next.primaryAssigneeId)?.full_name || row.gestorName,
                  situation: next.situation,
                  situationReason: next.situationReason,
                  resumeAt: next.resumeAt,
                  requireActiveCampaign:
                    next.situation === 'no_campaign_expected' || next.situation === 'closed'
                      ? false
                      : row.requireActiveCampaign,
                }
              : row
          )
        );
        return { ok: true };
      }
      const { error: err } = await upsertTrafficClientOps({
        clientId: client.clientId,
        primaryAssigneeId: next.primaryAssigneeId || null,
        situation: next.situation,
        situationReason: next.situationReason || null,
        resumeAt: next.resumeAt || null,
      });
      if (err) return { ok: false, error: err.message || String(err) };
      if (next.situation === 'no_campaign_expected' || next.situation === 'closed') {
        await upsertTrafficCheckupSettings({
          clientId: client.clientId,
          enabled: client.checkupSettings?.enabled !== false,
          weekdays: client.checkupSettings?.weekdays || DEFAULT_CHECKUP_WEEKDAYS,
          expectedTime: client.checkupSettings?.expected_time || null,
          requireActiveCampaign: false,
          requireBudget: Boolean(client.checkupSettings?.require_budget ?? client.requireBudget),
          indicators: client.checkupSettings?.check_indicators,
          assigneeId: next.primaryAssigneeId || null,
        });
      }
      await reload();
      return { ok: true };
    },
    [preview, reload, team]
  );

  const saveBudget = useCallback(
    async (client, limiteMeta) => {
      if (preview) {
        const amount = Number(limiteMeta);
        setRaw((prev) =>
          prev.map((row) =>
            row.clientId === client.clientId
              ? { ...row, budget: Number.isFinite(amount) && amount > 0 ? amount : null }
              : row
          )
        );
        return { ok: true };
      }
      const { error: err } = await updateClientLimiteMeta(client.clientId, limiteMeta);
      if (err) return { ok: false, error: err.message || String(err) };
      await reload();
      return { ok: true };
    },
    [preview, reload]
  );

  return { loading, error, model, reload, confirmCheckup, saveClientOps, saveBudget, team, campaigns };
}
