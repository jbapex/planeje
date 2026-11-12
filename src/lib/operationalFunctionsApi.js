import { supabase } from '@/lib/customSupabaseClient';

export async function fetchOperationalFunctions() {
  const { data, error } = await supabase.from('task_operational_functions')
    .select('id,name,assignee_ids,is_active,created_by,updated_at').order('name').order('id');
  if (error) throw error;
  return data || [];
}

export async function resolveOperationalContext(taskId, actions) {
  const functionIds = [...new Set(actions.filter((a) => a.type === 'assign_function')
    .map((a) => a.config?.function_id).filter(Boolean))];
  const needsTrace = actions.some((a) => a.type === 'reassign_producer');
  const [functionResult, taskResult] = await Promise.all([
    functionIds.length ? supabase.from('task_operational_functions').select('*').in('id', functionIds) : { data: [] },
    needsTrace ? supabase.from('tarefas').select('id,stage_execution_history,workflow_template_id,workflow_stage_key').eq('id', taskId).single() : { data: {} },
  ]);
  if (functionResult.error) throw functionResult.error;
  if (taskResult.error) throw taskResult.error;
  const ids = new Set((functionResult.data || []).flatMap((f) => f.assignee_ids || []));
  for (const event of taskResult.data?.stage_execution_history || []) {
    for (const id of event.from_assignee_ids || []) ids.add(id);
  }
  const result = ids.size ? await supabase.from('profiles').select('id,full_name,status,role').in('id', [...ids]) : { data: [] };
  if (result.error) throw result.error;
  return { functions: functionResult.data || [], profiles: result.data || [], task: taskResult.data };
}
