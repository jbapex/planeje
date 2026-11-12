// Pure rules shared by the editor, diagnostics and the existing automation executor.
export const OPERATIONAL_ACTIONS = new Set(['assign_function', 'reassign_producer']);

export function uniqueIds(value) {
  return [...new Set((Array.isArray(value) ? value : value ? [value] : [])
    .map((id) => String(id).trim()).filter((id) => id && id !== 'null' && id !== 'undefined'))];
}

export function hasOperationalActions(actions = []) {
  return actions.some((action) => OPERATIONAL_ACTIONS.has(action?.type));
}

export function activeStaff(profile) {
  return !!profile && profile.status === 'active' && ['admin', 'superadmin', 'colaborador'].includes(profile.role);
}

export function functionAssignees(fn, profiles) {
  if (!fn || !fn.is_active) throw new Error('A função está indisponível. Confira a configuração do fluxo.');
  const ids = uniqueIds(fn.assignee_ids);
  if (!ids.length) throw new Error(`A função “${fn.name}” está sem responsável. Configure quem recebe a tarefa.`);
  if (ids.some((id) => !activeStaff(profiles.find((p) => p.id === id)))) {
    throw new Error(`A função “${fn.name}” contém uma pessoa indisponível. Confira seus integrantes.`);
  }
  return ids;
}

const latestProducerEvent = (trace, productionStatus) => [...(Array.isArray(trace) ? trace : [])].reverse().find((entry) =>
  productionStatus === '__last_workflow_production__'
    ? entry?.from_workflow_stage_kind === 'production' || ['production', 'design', 'edicao', 'roteiro', 'gravacao'].includes(entry?.from_status)
    : entry?.from_status === productionStatus && entry?.to_status !== productionStatus);

export function producerAssignees(trace, productionStatus, profiles) {
  if (!productionStatus) throw new Error('Selecione a etapa de produção na regra de devolução.');
  const event = latestProducerEvent(trace, productionStatus);
  const ids = uniqueIds(event?.from_assignee_ids);
  if (!ids.length) {
    throw new Error('Esta tarefa não tem registro de quem saiu da etapa de produção. Confira o histórico e escolha o responsável pelo ajuste.');
  }
  if (ids.some((id) => !activeStaff(profiles.find((p) => p.id === id)))) {
    throw new Error('Um responsável da produção está indisponível. Escolha quem fará o ajuste; o histórico será preservado.');
  }
  return ids;
}

export function producerFunctionId(trace, productionStatus) {
  if (!productionStatus) return null;
  const event = latestProducerEvent(trace, productionStatus);
  return event?.from_operational_function_id || null;
}

// Resolve before any matching rule runs: a missing function must not first remove assignees.
export function compileOperationalActions(actions, { functions, profiles, task }) {
  return (actions || []).flatMap((action) => {
    if (action.type === 'assign_function') {
      const config = action.config || {};
      const fn = functions.find((row) => row.id === config.function_id);
      const ids = functionAssignees(fn, profiles);
      if (!['add', 'replace'].includes(config.mode)) throw new Error('Escolha se a função acrescenta ou substitui os responsáveis.');
      const add = { type: 'set_assignee', config: { assignee_ids: ids } };
      const setFunction = { type: 'set_operational_function', config: { function_id: fn.id } };
      return config.mode === 'replace'
        ? [setFunction, { type: 'remove_assignee', config: { assignee_ids: [] } }, add]
        : [setFunction, add];
    }
    if (action.type === 'reassign_producer') {
      const ids = producerAssignees(task?.stage_execution_history, action.config?.production_status, profiles);
      const functionId = producerFunctionId(task?.stage_execution_history, action.config?.production_status);
      return [
        ...(functionId ? [{ type: 'set_operational_function', config: { function_id: functionId } }] : []),
        { type: 'remove_assignee', config: { assignee_ids: [] } },
        { type: 'set_assignee', config: { assignee_ids: ids } },
      ];
    }
    return [action];
  });
}

export function actionConfigurationIssues(actions, { functions = [], profiles = [], statusOptions = [] } = {}) {
  const issues = [];
  for (const action of actions || []) {
    const config = action.config || {};
    if (action.type === 'assign_function') {
      try { functionAssignees(functions.find((fn) => fn.id === config.function_id), profiles); }
      catch (error) { issues.push(error.message); }
      if (!['add', 'replace'].includes(config.mode)) issues.push('Escolha adicionar ou substituir responsáveis.');
    }
    if (action.type === 'set_assignee') {
      for (const id of uniqueIds(config.assignee_ids)) {
        if (!activeStaff(profiles.find((p) => p.id === id))) issues.push('Há um responsável sem perfil ativo. Edite a regra para conferir o destino.');
      }
    }
    if (action.type === 'reassign_producer' && config.production_status !== '__last_workflow_production__' && !statusOptions.some((s) => s.value === config.production_status)) {
      issues.push('Escolha a etapa de produção usada na devolução.');
    }
  }
  return [...new Set(issues)];
}
