import { richTextHasContent } from './richText.js';

const textHasValue = (value) => typeof value === 'string' && value.trim().length > 0;

export function projectPlanHasContent(plan) {
  if (!plan) return false;
  if (textHasValue(plan.objetivo) || richTextHasContent(plan.contexto_ia)) return true;
  if (Object.values(plan.estrategia_comunicacao || {}).some(textHasValue)) return true;
  if (Object.values(plan.trafego_pago || {}).some((value) => textHasValue(String(value ?? '')))) return true;
  if ((plan.conteudo_criativos?.fases || []).some((item) => textHasValue(item?.nome) || textHasValue(item?.descricao))) return true;
  return Array.isArray(plan.materiais) && plan.materiais.length > 0;
}

export function projectPlanOverview(project, plan, tasks = []) {
  const projectTasks = tasks.filter((task) => task.project_id === project.id);
  const materialsCount = Array.isArray(plan?.materiais) ? plan.materiais.length : 0;
  const hasContent = projectPlanHasContent(plan);
  return {
    hasContent,
    materialsCount,
    tasksCount: projectTasks.length,
    label: hasContent ? (materialsCount ? `${materialsCount} ${materialsCount === 1 ? 'item planejado' : 'itens planejados'}` : 'Plano em construção') : 'Plano vazio — abra para começar',
  };
}
