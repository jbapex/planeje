import { isBefore, isSameDay, parseISO, startOfDay } from 'date-fns';
import { ATENDIMENTO_STATUS } from '@/hooks/useAtendimentoConversations';
import { statusMeta } from '@/lib/coberturaMensal';
import { getEffectiveTaskDeadline } from '@/lib/taskUrgency';
import { rewritePublicStorageUrl } from '@/lib/publicStorageUrl';

export { isAgencyEmpresa, representedClientId } from '@/lib/pulseClientMatch';

export const PULSE_DONE_STATUS = new Set([
  'published',
  'concluido',
  'concluído',
  'done',
  'completed',
  'delivered',
  'entregue',
  'cancelled',
  'canceled',
  'cancelado',
  'archived',
  'arquivado',
]);

export function getDueDayStart(dueDateRaw) {
  if (dueDateRaw == null || dueDateRaw === '') return null;
  const s = String(dueDateRaw).trim();
  const datePart = s.length >= 10 ? s.slice(0, 10) : s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return startOfDay(parseISO(datePart));
  }
  const d = new Date(dueDateRaw);
  if (Number.isNaN(d.getTime())) return null;
  return startOfDay(d);
}

export function isOpenTask(status) {
  return !PULSE_DONE_STATUS.has(String(status || '').trim().toLowerCase());
}

export function classifyOpenTaskDue(task, today = startOfDay(new Date())) {
  if (!isOpenTask(task?.status)) return null;
  const effectiveDue = getEffectiveTaskDeadline(task).value;
  const due = getDueDayStart(effectiveDue);
  if (!due) return null;
  if (isBefore(due, today)) return 'overdue';
  if (isSameDay(due, today)) return 'today';
  return 'upcoming';
}

export function isPendingConversa(row) {
  const unread = Number(row?.unread_count) || 0;
  return unread > 0 || row?.status === ATENDIMENTO_STATUS.AGUARDANDO;
}

export function accountHealth({ cobertura, overdue, pendingConversas, vencimento }) {
  let score = 100;
  const cobStatus = cobertura?.status_cobertura;
  if (cobStatus === 'descoberto') score -= 28;
  else if (cobStatus === 'parcial') score -= 12;
  else if (cobStatus === 'sem_escopo') score -= 8;
  score -= Math.min(30, (overdue || 0) * 8);
  score -= Math.min(20, (pendingConversas || 0) * 4);
  if (vencimento) {
    const due = getDueDayStart(vencimento);
    if (due) {
      const today = startOfDay(new Date());
      if (isBefore(due, today)) score -= 18;
      else {
        const days = Math.round((due - today) / 86400000);
        if (days <= 7) score -= 8;
      }
    }
  }
  return Math.max(0, Math.min(100, score));
}

export function healthMood(score, overdue, pendingConversas) {
  if (score >= 85 && overdue === 0 && pendingConversas === 0) return { label: 'Conta saudável', tone: 'ok' };
  if (score >= 70) return { label: 'No ritmo', tone: 'ok' };
  if (score >= 45) return { label: 'Atenção', tone: 'warn' };
  return { label: 'Risco operacional', tone: 'danger' };
}

export const UNCOVERED_COBERTURA = new Set(['descoberto', 'parcial', 'sem_escopo']);

export function buildAccountPulse({ client, cobertura, overdueCount, todayCount, pendingConversas, aguardando }) {
  const overdue = overdueCount || 0;
  const pending = pendingConversas || 0;
  const score = accountHealth({
    cobertura,
    overdue,
    pendingConversas: pending,
    vencimento: client?.vencimento,
  });
  const mood = healthMood(score, overdue, pending);
  const cobStatus = cobertura?.status_cobertura || null;
  const uncovered = Boolean(cobStatus && UNCOVERED_COBERTURA.has(cobStatus));
  const stalled = pending > 0;
  const late = overdue > 0;
  return {
    id: client.id,
    empresa: client.empresa,
    logo: rewritePublicStorageUrl(client.logo_urls?.[0] || '') || null,
    etapa: client.etapa,
    vencimento: client.vencimento,
    responsavel: client.responsavel,
    score,
    mood,
    cobertura,
    cobMeta: cobStatus ? statusMeta(cobStatus) : null,
    overdue,
    today: todayCount || 0,
    pendingConversas: pending,
    aguardando: aguardando || 0,
    flags: {
      uncovered,
      stalled,
      late,
      atRisk: uncovered || stalled || late,
    },
  };
}

export function summarizeAgencyPulse(accounts) {
  const list = accounts || [];
  const atRisk = list.filter((a) => a.flags.atRisk).sort((a, b) => a.score - b.score);
  const uncovered = list
    .filter((a) => a.flags.uncovered)
    .sort((a, b) => {
      const rank = (s) => ({ descoberto: 0, parcial: 1, sem_escopo: 2 }[s] ?? 3);
      const r = rank(a.cobertura?.status_cobertura) - rank(b.cobertura?.status_cobertura);
      if (r !== 0) return r;
      return a.score - b.score;
    });
  const stalled = list.filter((a) => a.flags.stalled).sort((a, b) => b.pendingConversas - a.pendingConversas || a.score - b.score);
  const late = list.filter((a) => a.flags.late).sort((a, b) => b.overdue - a.overdue || a.score - b.score);
  const overdueTasks = list.reduce((n, a) => n + a.overdue, 0);
  const pendingConversas = list.reduce((n, a) => n + a.pendingConversas, 0);
  const avgScore = list.length
    ? Math.round(list.reduce((n, a) => n + a.score, 0) / list.length)
    : 100;
  return {
    total: list.length,
    atRisk,
    uncovered,
    stalled,
    late,
    overdueTasks,
    pendingConversas,
    avgScore,
  };
}

export function getAgencyPulseMessage(summary) {
  const n = summary.atRisk.length;
  if (!n) {
    return 'Carteira no ritmo. Nenhuma conta descoberta, com conversa parada ou entrega atrasada.';
  }
  const parts = [];
  if (summary.uncovered.length) {
    parts.push(`${summary.uncovered.length} descoberta${summary.uncovered.length > 1 ? 's' : ''}`);
  }
  if (summary.stalled.length) {
    parts.push(`${summary.stalled.length} com conversa parada`);
  }
  if (summary.late.length) {
    parts.push(`${summary.late.length} com entrega atrasada`);
  }
  return `${n} conta${n > 1 ? 's' : ''} pede${n > 1 ? 'm' : ''} ação agora. ${parts.join(', ')}.`;
}

export function getAgencyPulseMood(summary) {
  if (summary.atRisk.length === 0) return 'Tudo em dia';
  if (summary.uncovered.some((a) => a.cobertura?.status_cobertura === 'descoberto') || summary.late.length >= 5) {
    return 'Atenção necessária';
  }
  return 'Priorize a carteira';
}
