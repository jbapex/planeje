import { differenceInCalendarDays, parseISO, startOfDay, startOfMonth } from 'date-fns';
import { getDueDayStart } from '@/lib/accountPulse';

export function daysUntilVencimento(vencimento, today = startOfDay(new Date())) {
  const due = getDueDayStart(vencimento);
  if (!due) return null;
  return differenceInCalendarDays(due, today);
}

/** Mesmo recorte do card Ativos em Clientes: contrato fechado. */
export function isClienteAtivoNaCarteira(client) {
  return String(client?.etapa || '') === 'closed';
}

export function isContratoVencido(client, today = startOfDay(new Date())) {
  if (client?.etapa !== 'closed') return false;
  const days = daysUntilVencimento(client.vencimento, today);
  return days != null && days < 0;
}

export function isContratoVencendo(client, today = startOfDay(new Date()), windowDays = 30) {
  if (client?.etapa !== 'closed') return false;
  const days = daysUntilVencimento(client.vencimento, today);
  return days != null && days >= 0 && days <= windowDays;
}

export function isNovoNoMes(client, today = new Date()) {
  if (!client?.created_at) return false;
  try {
    const raw = String(client.created_at);
    const datePart = raw.length >= 10 ? raw.slice(0, 10) : raw;
    const created = /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? startOfDay(parseISO(datePart)) : startOfDay(new Date(raw));
    return created >= startOfMonth(today);
  } catch {
    return false;
  }
}

export function formatCompactMoney(n) {
  const value = Number(n) || 0;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value);
}

export function computeCarteiraKpis(clients, { atRiskIds = new Set(), today = startOfDay(new Date()) } = {}) {
  const list = clients || [];
  const ativos = list.filter((c) => c.etapa === 'closed');
  const perdidos = list.filter((c) => c.etapa === 'lost');
  const mrr = ativos.reduce((sum, c) => sum + (Number(c.valor) || 0), 0);
  const ticket = ativos.length ? mrr / ativos.length : 0;
  const risco = list.filter((c) => c.etapa !== 'lost' && atRiskIds.has(c.id));
  const vencendo = ativos.filter((c) => isContratoVencendo(c, today, 30));
  const vencidos = ativos.filter((c) => isContratoVencido(c, today));
  const novos = list.filter((c) => isNovoNoMes(c, today));

  return {
    total: list.length,
    ativos: ativos.length,
    perdidos: perdidos.length,
    mrr,
    ticket,
    risco: risco.length,
    vencendo: vencendo.length,
    vencidos: vencidos.length,
    novos: novos.length,
  };
}

export function clientMatchesCarteiraFocus(client, focus, { atRiskIds = new Set(), today = startOfDay(new Date()) } = {}) {
  if (!focus || focus === 'all') return true;
  switch (focus) {
    case 'ativos':
      return client.etapa === 'closed';
    case 'risco':
      return client.etapa !== 'lost' && atRiskIds.has(client.id);
    case 'vencendo':
      return isContratoVencendo(client, today, 30);
    case 'vencidos':
      return isContratoVencido(client, today);
    case 'perdidos':
      return client.etapa === 'lost';
    case 'novos':
      return isNovoNoMes(client, today);
    default:
      return true;
  }
}

export function formatVencimentoLabel(vencimento, today = startOfDay(new Date())) {
  const days = daysUntilVencimento(vencimento, today);
  if (days == null) return 'Sem vencimento';
  if (days < 0) return `Vencido há ${Math.abs(days)}d`;
  if (days === 0) return 'Vence hoje';
  if (days === 1) return 'Vence amanhã';
  if (days <= 30) return `Vence em ${days}d`;
  return `Vence em ${days}d`;
}

export function formatVencimentoDate(vencimento) {
  const due = getDueDayStart(vencimento);
  if (!due) return null;
  return due.toLocaleDateString('pt-BR');
}

export function vencimentoTone(client, today = startOfDay(new Date()), windowDays = 30) {
  if (isContratoVencido(client, today)) return 'overdue';
  if (isContratoVencendo(client, today, windowDays)) return 'due';
  if (daysUntilVencimento(client?.vencimento, today) == null) return 'empty';
  return 'ok';
}

export function sortCarteiraByVencimento(clients, today = startOfDay(new Date())) {
  return [...(clients || [])].sort((a, b) => {
    const da = daysUntilVencimento(a.vencimento, today);
    const db = daysUntilVencimento(b.vencimento, today);
    if (da == null && db == null) {
      return String(a.empresa || '').localeCompare(String(b.empresa || ''), 'pt-BR');
    }
    if (da == null) return 1;
    if (db == null) return -1;
    if (da !== db) return da - db;
    return String(a.empresa || '').localeCompare(String(b.empresa || ''), 'pt-BR');
  });
}
