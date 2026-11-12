/** The same identity is used by planning, calendar and task tracking. Titles are presentation only. */
export function findTaskForPlanMaterial(tasks, projectId, materialId) {
  if (!projectId || materialId == null || String(materialId).trim() === '') return null;
  return (tasks || []).find((task) => task.project_id === projectId
    && task.plan_material_id != null
    && String(task.plan_material_id) === String(materialId)) || null;
}

export function normalizePlanMaterialChannels(material) {
  const selected = Array.isArray(material?.canais) ? material.canais
    : Array.isArray(material?.plataformas) ? material.plataformas
      : String(material?.plataforma || '').split(/[,;|]/);
  const names = {
    instagram: 'Instagram', facebook: 'Facebook', linkedin: 'LinkedIn', tiktok: 'TikTok',
    youtube: 'YouTube', site: 'Site', 'google meu negocio': 'Google Meu Negócio',
    'google business': 'Google Meu Negócio', 'google business profile': 'Google Meu Negócio', outro: 'Outro',
  };
  const channels = selected.filter((value) => typeof value === 'string' && value.trim()).map((value) => {
    const key = value.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    return names[key] || 'Outro';
  });
  return [...new Set(channels)];
}

/** Caller must persist its current plan before this call. No draft payload can bypass the saved plan. */
export async function createTaskFromPlanMaterial(client, projectId, materialId) {
  if (!projectId || materialId == null || String(materialId).trim() === '') {
    throw new Error('Salve o projeto e o material antes de criar a tarefa.');
  }
  const { data, error } = await client.rpc('create_task_from_plan_material', {
    p_project_id: projectId,
    p_material_id: String(materialId),
  });
  if (error) throw error;
  if (!data?.task?.id) throw new Error('Não foi possível confirmar a tarefa. Atualize o planejamento e tente novamente.');
  return { task: data.task, created: data.created === true };
}

/** Historic tasks are linked only after the user chooses the exact task. */
export async function linkTaskToPlanMaterial(client, projectId, materialId, taskId) {
  if (!projectId || !taskId || materialId == null || String(materialId).trim() === '') {
    throw new Error('Escolha o material e a tarefa que deseja vincular.');
  }
  const { data, error } = await client.rpc('link_task_to_plan_material', {
    p_project_id: projectId, p_material_id: String(materialId), p_task_id: taskId,
  });
  if (error) throw error;
  if (!data?.task?.id) throw new Error('Não foi possível confirmar o vínculo. Atualize o planejamento e tente novamente.');
  return { task: data.task, linked: data.linked === true };
}
