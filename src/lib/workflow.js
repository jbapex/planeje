import { format, startOfDay, parseISO, isSameDay } from 'date-fns';
import { supabase } from '@/lib/customSupabaseClient';

let automationsCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5000;

/** Limpa cache em memória (chame após criar/editar automações na UI). */
export function clearTaskAutomationsCache() {
  automationsCache = null;
  cacheTimestamp = 0;
}

/** Mensagens de erro para exibir toast (fetch de automações ou falha em runActions). */
export function getAutomationErrorMessages(result) {
  const msgs = [];
  if (!result) return msgs;
  if (result.error?.message) msgs.push(String(result.error.message));
  for (const r of result.results || []) {
    const e = r?.result?.error;
    if (e?.message) msgs.push(String(e.message));
    else if (e && typeof e === 'object' && e.hint) msgs.push(String(e.hint));
  }
  return msgs;
}

function getDueDayStart(dueDateRaw) {
  if (dueDateRaw == null || dueDateRaw === '') return null;
  const s = String(dueDateRaw).trim();
  const datePart = s.length >= 10 ? s.slice(0, 10) : s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return startOfDay(parseISO(datePart));
  }
  return startOfDay(new Date(dueDateRaw));
}

/** Aceita JSONB, string JSON ou string duplamente serializada. */
function parseJsonField(val, fallback = {}) {
  if (val == null || val === '') return fallback;
  if (typeof val === 'string') {
    const t = val.trim();
    if (!t) return fallback;
    try {
      const once = JSON.parse(t);
      if (typeof once === 'string') {
        try {
          const twice = JSON.parse(once);
          return twice && typeof twice === 'object' ? twice : fallback;
        } catch {
          return fallback;
        }
      }
      return once && typeof once === 'object' ? once : fallback;
    } catch {
      return fallback;
    }
  }
  if (typeof val === 'object') return val;
  return fallback;
}

function normalizeStatusList(value) {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) {
    return value
      .map((v) => (v != null && typeof v === 'object' && 'value' in v ? v.value : v))
      .map((v) => String(v).trim())
      .filter(Boolean);
  }
  return [String(value).trim()].filter(Boolean);
}

/** Chave estável para comparar slugs/labels de status (acentos, _, espaços). */
function normalizeStatusComparable(s) {
  const t = String(s)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  return t.replace(/[\s_]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

/** Compara valor de status da tarefa com o configurado (published vs publicado, caixa, acentos, etc.). */
function statusMatchesConfigured(configured, actual) {
  const c = String(configured).trim();
  const a = String(actual).trim();
  if (c === a) return true;
  if (c.toLowerCase() === a.toLowerCase()) return true;
  if (normalizeStatusComparable(c) === normalizeStatusComparable(a)) return true;
  const pub = new Set(['published', 'publicado']);
  if (pub.has(c.toLowerCase()) && pub.has(a.toLowerCase())) return true;
  return false;
}

function listMatchesStatus(list, status) {
  if (!list.length) return true;
  return list.some((item) => statusMatchesConfigured(item, status));
}

function normalizeActions(raw) {
  let arr = raw;
  if (typeof arr === 'string') {
    try {
      arr = JSON.parse(arr);
    } catch {
      return [];
    }
  }
  if (typeof arr === 'string') {
    try {
      arr = JSON.parse(arr);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];

  return arr.map((action) => {
    if (!action || typeof action !== 'object') return action;
    const a = { ...action };
    if (typeof a.config === 'string') {
      try {
        a.config = JSON.parse(a.config);
      } catch {
        a.config = {};
      }
    }
    if (!a.config || typeof a.config !== 'object') a.config = {};
    return a;
  });
}

function normalizeAutomationRow(automation) {
  if (!automation) return automation;
  return {
    ...automation,
    trigger_config: parseJsonField(automation.trigger_config, {}),
    actions: normalizeActions(automation.actions),
  };
}

const getCachedAutomations = async (triggerType) => {
  const now = Date.now();
  if (automationsCache && now - cacheTimestamp < CACHE_TTL) {
    return automationsCache.filter((a) => a.trigger_type === triggerType);
  }

  const { data, error } = await supabase
    .from('task_automations')
    .select('*')
    .eq('is_active', true);

  if (error) {
    return { error };
  }

  automationsCache = data || [];
  cacheTimestamp = now;
  return automationsCache.filter((a) => a.trigger_type === triggerType);
};

export async function runDueDateArrivedAutomations(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) return;
  const todayStart = startOfDay(new Date());
  const todayKey = format(todayStart, 'yyyy-MM-dd');

  for (const task of tasks) {
    if (!task?.id || !task?.due_date) continue;
    const dueDay = getDueDayStart(task.due_date);
    if (!dueDay || !isSameDay(dueDay, todayStart)) continue;

    const dedupeKey = `planeje_due_automation_${task.id}_${todayKey}`;
    try {
      if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(dedupeKey)) {
        continue;
      }
      const res = await executeAutomation(task.id, 'due_date_arrived', { task });
      if (res?.error) {
        console.warn('Automação due_date_arrived:', res.error);
        continue;
      }
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(dedupeKey, '1');
      }
    } catch (e) {
      console.error('runDueDateArrivedAutomations:', e);
    }
  }
}

export const executeAutomation = async (taskId, triggerType, eventData) => {
  try {
    const automationsResult = await getCachedAutomations(triggerType);

    if (automationsResult.error) {
      console.error('Error fetching automations:', automationsResult.error);
      return { error: automationsResult.error, success: false, results: [] };
    }

    const automations = automationsResult;

    if (!automations || automations.length === 0) {
      return {
        success: true,
        results: [],
        matchedCount: 0,
        message: 'No automations found',
      };
    }

    const results = [];
    for (const automation of automations) {
      const row = normalizeAutomationRow(automation);
      if (!checkTrigger(row, eventData)) continue;
      const result = await runActions(row.actions, taskId);
      results.push({ automationId: automation.id, result });
    }

    const anyError = results.some((r) => r.result?.error);
    return {
      success: !anyError,
      results,
      matchedCount: results.length,
    };
  } catch (error) {
    console.error('Error executing automation:', error);
    return { error, success: false, results: [] };
  }
};

const checkTrigger = (automation, eventData) => {
  const config = parseJsonField(automation.trigger_config, {});
  switch (automation.trigger_type) {
    case 'status_change': {
      const fromList = normalizeStatusList(config.from_status);
      const toList = normalizeStatusList(config.to_status);
      const oldS =
        eventData?.old_status != null ? String(eventData.old_status).trim() : '';
      const newS =
        eventData?.new_status != null ? String(eventData.new_status).trim() : '';
      const fromMatch = listMatchesStatus(fromList, oldS);
      const toMatch = listMatchesStatus(toList, newS);
      return fromMatch && toMatch;
    }
    case 'task_created':
      return true;
    case 'due_date_arrived': {
      const t = eventData?.task;
      if (!t?.due_date) return false;
      const dueDay = getDueDayStart(t.due_date);
      if (!dueDay) return false;
      return isSameDay(dueDay, startOfDay(new Date()));
    }
    default:
      return false;
  }
};

const MOVE_ACTION_TYPES = new Set(['move_task', 'move_task_to_social_media']);

/** Único destino na UI; configs antigas podem vir sem `destination`. */
function shouldRunSocialMediaCompletedMove(action) {
  if (!action || !MOVE_ACTION_TYPES.has(action.type)) return false;
  const dest = action.config?.destination;
  if (dest == null || String(dest).trim() === '') return true;
  return String(dest).trim() === 'social_media_completed';
}

function normalizeAssigneeIdsFromTask(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((id) => String(id))
      .filter((id) => id && id !== 'null' && id !== 'undefined');
  }
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return [];
    try {
      const parsed = JSON.parse(t);
      return normalizeAssigneeIdsFromTask(parsed);
    } catch {
      return [];
    }
  }
  return [];
}

async function applyMoveToSocialMediaCompleted(taskId, currentUpdatedTask) {
  const { error: rpcErr } = await supabase.rpc('move_task_to_social_media', {
    task_id: taskId,
  });
  if (!rpcErr) {
    const { data: fresh } = await supabase.from('tarefas').select('*').eq('id', taskId).maybeSingle();
    return { error: null, updatedTask: fresh || currentUpdatedTask };
  }

  console.warn('[workflow] RPC move_task_to_social_media falhou, tentando UPDATE direto:', rpcErr?.message || rpcErr);

  const patchFull = { type: 'social_media', status: 'completed', assignee_ids: [] };
  const r1 = await supabase.from('tarefas').update(patchFull).eq('id', taskId).select().single();
  if (!r1.error) {
    return { error: null, updatedTask: r1.data };
  }

  const patchLite = { type: 'social_media', status: 'completed' };
  const r2 = await supabase.from('tarefas').update(patchLite).eq('id', taskId).select().single();
  if (!r2.error) {
    return { error: null, updatedTask: r2.data };
  }

  return { error: r2.error || r1.error || rpcErr, updatedTask: currentUpdatedTask };
}

const runActions = async (actions, taskId) => {
  actions = normalizeActions(actions);
  if (actions.length === 0) {
    return { success: true, message: 'No actions' };
  }

  const phase1 = actions.filter((a) => !MOVE_ACTION_TYPES.has(a.type));
  const phase2 = actions.filter((a) => MOVE_ACTION_TYPES.has(a.type));

  const { data: task, error: fetchError } = await supabase
    .from('tarefas')
    .select('assignee_ids, status_history, status, priority')
    .eq('id', taskId)
    .single();

  if (fetchError) {
    console.error('Error fetching task for actions:', fetchError);
    return { error: fetchError };
  }

  let currentAssignees = normalizeAssigneeIdsFromTask(task.assignee_ids);
  const originalAssignees = [...currentAssignees];
  const updates = {};
  let hasAssigneeChanges = false;

  const removeAssigneeActions = phase1.filter((a) => a.type === 'remove_assignee');
  const hasRemoveAllAction = removeAssigneeActions.some(
    (a) =>
      !a.config?.assignee_ids ||
      (Array.isArray(a.config.assignee_ids) && a.config.assignee_ids.length === 0)
  );

  const allIdsToRemove = new Set();
  removeAssigneeActions.forEach((action) => {
    if (
      action.config?.assignee_ids &&
      Array.isArray(action.config.assignee_ids) &&
      action.config.assignee_ids.length > 0
    ) {
      action.config.assignee_ids.forEach((id) => {
        const idStr = String(id);
        if (idStr && idStr !== 'null' && idStr !== 'undefined') {
          allIdsToRemove.add(idStr);
        }
      });
    }
  });

  for (const action of phase1) {
    const config = action.config || {};

    switch (action.type) {
      case 'change_status':
        if (config.status) {
          updates.status = config.status;
        }
        break;
      case 'change_priority':
        if (config.priority) {
          updates.priority = config.priority;
        }
        break;
      case 'set_assignee': {
        let assigneesToAdd = [];
        if (Array.isArray(config.assignee_ids)) {
          assigneesToAdd = config.assignee_ids
            .map((id) => String(id).trim())
            .filter((id) => id && id !== 'null' && id !== 'undefined');
        } else if (config.assignee_ids != null && config.assignee_ids !== '') {
          const singleId = String(config.assignee_ids).trim();
          if (singleId && singleId !== 'null' && singleId !== 'undefined') {
            assigneesToAdd = [singleId];
          }
        }
        if (assigneesToAdd.length > 0) {
          const beforeAdd = currentAssignees.length;
          currentAssignees = [...new Set([...currentAssignees, ...assigneesToAdd])];
          if (currentAssignees.length !== beforeAdd) {
            hasAssigneeChanges = true;
          }
        }
        break;
      }
      case 'remove_assignee':
        if (
          config.assignee_ids &&
          Array.isArray(config.assignee_ids) &&
          config.assignee_ids.length > 0
        ) {
          const idsToRemove = new Set(
            config.assignee_ids
              .map((id) => String(id))
              .filter((id) => id && id !== 'null' && id !== 'undefined')
          );
          const beforeRemove = currentAssignees.length;
          currentAssignees = currentAssignees.filter((id) => !idsToRemove.has(String(id)));
          if (currentAssignees.length !== beforeRemove) {
            hasAssigneeChanges = true;
          } else {
            hasAssigneeChanges = true;
          }
        } else {
          const beforeRemove = currentAssignees.length;
          currentAssignees = [];
          if (beforeRemove > 0) {
            hasAssigneeChanges = true;
          } else {
            hasAssigneeChanges = true;
          }
        }
        break;
      case 'reassign_previous':
        if (!hasRemoveAllAction && config.from_status && task.status_history) {
          const historyReversed = [...(task.status_history || [])].reverse();
          const previousEntry = historyReversed.find(
            (h) => h.status === config.from_status && h.user_id
          );
          if (previousEntry && previousEntry.user_id) {
            const newAssignee = String(previousEntry.user_id);
            if (!allIdsToRemove.has(newAssignee)) {
              if (JSON.stringify(currentAssignees) !== JSON.stringify([newAssignee])) {
                currentAssignees = [newAssignee];
                hasAssigneeChanges = true;
              }
            }
          }
        }
        break;
      default:
        break;
    }
  }

  currentAssignees = [
    ...new Set(
      currentAssignees.map((id) => String(id)).filter((id) => id && id !== 'null' && id !== 'undefined')
    ),
  ];
  const normalizedOriginal = [
    ...new Set(
      originalAssignees.map((id) => String(id)).filter((id) => id && id !== 'null' && id !== 'undefined')
    ),
  ];

  const originalSorted = [...normalizedOriginal].sort();
  const currentSorted = [...currentAssignees].sort();
  const hasRealChanges = JSON.stringify(originalSorted) !== JSON.stringify(currentSorted);

  const hasRemoveAction = phase1.some((a) => a.type === 'remove_assignee');
  const hasSetAction = phase1.some((a) => a.type === 'set_assignee');

  const assigneeBlockWillRun =
    hasRealChanges || hasAssigneeChanges || hasRemoveAction || hasSetAction;

  if (updates.status != null && updates.status !== task.status && !assigneeBlockWillRun) {
    const baseHist = Array.isArray(task.status_history) ? [...task.status_history] : [];
    baseHist.push({
      status: updates.status,
      user_id: null,
      assignee_ids: currentAssignees,
      timestamp: new Date().toISOString(),
      automation: true,
    });
    updates.status_history = baseHist;
  }

  if (assigneeBlockWillRun) {
    updates.assignee_ids = currentAssignees;
    const baseHist = Array.isArray(updates.status_history)
      ? [...updates.status_history]
      : Array.isArray(task.status_history)
        ? [...task.status_history]
        : [];
    baseHist.push({
      status: updates.status || task.status,
      assignee_ids: currentAssignees,
      timestamp: new Date().toISOString(),
      automation: true,
    });
    updates.status_history = baseHist;
  }

  let updatedTask = null;
  if (Object.keys(updates).length > 0) {
    const { data: updatedRow, error: updateError } = await supabase
      .from('tarefas')
      .update(updates)
      .eq('id', taskId)
      .select()
      .single();

    if (updateError) {
      console.error('Error applying automation updates:', updateError);
      return { error: updateError };
    }
    updatedTask = updatedRow;
  }

  let moveActionsSeen = 0;
  let moveActionsApplied = 0;
  for (const action of phase2) {
    if (!MOVE_ACTION_TYPES.has(action.type)) continue;
    moveActionsSeen += 1;
    if (!shouldRunSocialMediaCompletedMove(action)) {
      continue;
    }
    moveActionsApplied += 1;
    const { error: moveErr, updatedTask: afterMove } = await applyMoveToSocialMediaCompleted(
      taskId,
      updatedTask
    );
    if (moveErr) {
      console.error('Error moving task:', moveErr);
      return { error: moveErr, updatedTask };
    }
    if (afterMove) {
      updatedTask = afterMove;
    }
  }

  if (updatedTask) {
    return { success: true, updates, updatedTask };
  }
  if (moveActionsApplied > 0) {
    return { success: true, message: 'Move completed', moved: true };
  }
  if (moveActionsSeen > 0 && moveActionsApplied === 0) {
    return {
      error: {
        message:
          'Ação "Mover para..." sem destino válido. Edite a automação e escolha "Redes Sociais (Concluído)".',
      },
      updatedTask,
    };
  }
  return { success: true, message: 'No updates needed' };
};
