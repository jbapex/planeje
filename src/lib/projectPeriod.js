import { planMateriaisAsRows } from './campaignPlanMateriais.js';

export function monthKey(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})(?:-|$)/);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) return '';
  return `${match[1]}-${match[2]}`;
}
export function projectPeriod(project) {
  const start = monthKey(project?.mes_referencia);
  return { start, end: monthKey(project?.mes_fim) || start };
}
export function projectCoversMonth(project, referenceMonth) {
  const { start, end } = projectPeriod(project);
  const month = monthKey(referenceMonth);
  return Boolean(start && month && start <= month && month <= end);
}
export function projectPeriodError(start, end) {
  if (!monthKey(start) || !monthKey(end)) return 'Escolha o mês inicial e o mês final do projeto.';
  if (monthKey(end) < monthKey(start)) return 'O mês final deve ser igual ou posterior ao mês inicial.';
  return null;
}
export function projectMonths(project) {
  const { start, end } = projectPeriod(project);
  if (!start || end < start) return [];
  const result = [];
  let [year, month] = start.split('-').map(Number);
  while (result.length < 1200) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    if (key > end) break;
    result.push(key);
    if (++month > 12) { month = 1; year++; }
  }
  return result;
}
export function formatProjectMonth(value) {
  const key = monthKey(value);
  if (!key) return 'Sem período';
  return new Date(`${key}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
}
export function projectPeriodLabel(project) {
  const { start, end } = projectPeriod(project);
  return start === end ? formatProjectMonth(start) : `${formatProjectMonth(start)} a ${formatProjectMonth(end)}`;
}
// Publication determines the month; a production deadline can belong to the previous month.
// The linked task is authoritative after creation, including changes made directly in Tarefas.
export function materialReferenceMonth(material, project, task) {
  return monthKey(task?.post_date) || monthKey(material?.data_postagem || material?.data_publicacao)
    || monthKey(material?.mes_referencia) || projectPeriod(project).start;
}
export function projectMaterialsForMonth(plan, project, referenceMonth, tasks = []) {
  const materials = planMateriaisAsRows(plan);
  const { start, end } = projectPeriod(project);
  // Preserve existing monthly plans, including undated legacy materials.
  if (start === end) return projectCoversMonth(project, referenceMonth) ? materials : [];
  const tasksByMaterial = new Map(tasks.filter((task) => task.plan_material_id != null).map((task) => [String(task.plan_material_id), task]));
  return materials.filter((material) => materialReferenceMonth(material, project, tasksByMaterial.get(String(material.id))) === monthKey(referenceMonth));
}
