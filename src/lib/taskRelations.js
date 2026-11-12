export const TASK_RELATIONS_SELECT = '*, clientes(id, empresa, postagem_do_cliente), projetos(id, name)';

const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

export function mergeTaskRelations(previous = {}, incoming = {}, { clients = [], projects = [] } = {}) {
  const merged = { ...previous, ...incoming };
  for (const [key, foreignKey, available] of [
    ['clientes', 'client_id', clients],
    ['projetos', 'project_id', projects],
  ]) {
    const id = merged[foreignKey];
    if (!id) {
      merged[key] = null;
    } else if (has(incoming, key) && incoming[key] !== undefined &&
        (!incoming[key]?.id || incoming[key].id === id)) {
      merged[key] = incoming[key];
    } else if (previous[foreignKey] === id && previous[key] &&
        (!previous[key].id || previous[key].id === id)) {
      merged[key] = previous[key];
    } else {
      merged[key] = available.find(item => item.id === id) || null;
    }
  }
  return merged;
}

// INSERT notifications may arrive after the save response or a newer UPDATE.
// In that case enrich the joins, without replacing newer task fields/history.
export function upsertTaskWithRelations(list, incoming, options = {}) {
  const previous = list.find(task => task.id === incoming.id);
  let patch = incoming;
  if (previous && options.relationsOnlyIfExists) {
    patch = {};
    if (previous.client_id === incoming.client_id) patch.clientes = incoming.clientes;
    if (previous.project_id === incoming.project_id) patch.projetos = incoming.projetos;
  }
  const merged = mergeTaskRelations(previous, patch, options);
  if (options.include && !options.include(merged)) return list.filter(task => task.id !== incoming.id);
  if (previous) return list.map(task => task.id === incoming.id ? merged : task);
  return options.insert === false ? list : [...list, merged];
}

export function getTaskClientName(task, clients = []) {
  if (!task.client_id) return 'Sem cliente';
  const joined = task.clientes;
  return (joined && (!joined.id || joined.id === task.client_id) && joined.empresa) ||
    clients.find(client => client.id === task.client_id)?.empresa || 'Cliente indisponível';
}

export async function readTaskAfterAutomations(result, readTask, fallbackTask) {
  // All rules run sequentially. Even an error may follow a successful write.
  const fallback = (result?.results || []).reduce((task, entry) => {
    const updated = entry?.result?.updatedTask;
    return updated ? mergeTaskRelations(task, updated) : task;
  }, fallbackTask);
  try {
    const { data, error } = await readTask();
    if (error) return { task: fallback, error };
    if (!data) return { task: fallback, error: new Error('Tarefa indisponível para conferência.') };
    return { task: data, error: null };
  } catch (error) {
    return { task: fallback, error };
  }
}
