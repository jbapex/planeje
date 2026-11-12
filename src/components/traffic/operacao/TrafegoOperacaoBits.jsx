import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, AlertTriangle, CheckCircle2, HelpCircle, Clock3 } from 'lucide-react';
import { healthLabel, metricDisplay } from '@/lib/trafegoSaude';
import { formatMoney } from '@/lib/trafegoFila';
import { formatOperationalUpdatedAt } from '@/lib/centralTrafego';
import { exceptionActionPlan } from '@/lib/trafegoAcoes';

export function useIsCompact(bp = 980) {
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.innerWidth < bp);
  useEffect(() => {
    const onResize = () => setCompact(window.innerWidth < bp);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [bp]);
  return compact;
}

export function HealthBadge({ health }) {
  const status = typeof health === 'string' ? health : health?.status || 'ok';
  const label = typeof health === 'string' ? healthLabel(status) : health?.label || 'OK';
  return <span className={`trafego-health trafego-health--${status}`}>{label}</span>;
}

export function SeverityIcon({ health }) {
  const status = typeof health === 'string' ? health : health?.status || 'ok';
  const Icon =
    status === 'critico'
      ? AlertCircle
      : status === 'aguardando_cliente'
        ? Clock3
        : status === 'dados_indisponiveis'
          ? HelpCircle
          : status === 'ok' || status === 'pausa' || status === 'encerrado'
            ? CheckCircle2
            : AlertTriangle;
  return (
    <span className={`trafego-sev is-${status}`}>
      <Icon size={16} />
    </span>
  );
}

export function MoneyText({ metric }) {
  return metricDisplay(metric, (v) => formatMoney(v));
}

export function EmptyState({ title, children }) {
  return (
    <div className="trafego-empty">
      {title ? <h3>{title}</h3> : null}
      <p>{children}</p>
    </div>
  );
}

export function taskHref(taskId) {
  return taskId ? `/tasks/list/${encodeURIComponent(String(taskId))}` : '/tasks/list?type=paid_traffic';
}

export function newTaskHref(clientId) {
  const q = new URLSearchParams({ type: 'paid_traffic' });
  if (clientId) q.set('client_id', clientId);
  return `/tasks/list/new?${q.toString()}`;
}

export function clientHref(base, clientId) {
  return `${base}/clientes/${encodeURIComponent(String(clientId))}`;
}

export function ActionLink({ to, href, children, primary, onClick }) {
  const cls = primary ? 'trafego-btn' : 'trafego-btn-ghost';
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick}>
        {children}
      </button>
    );
  }
  if (href && /^https?:/i.test(href)) {
    return (
      <a className={cls} href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  }
  return (
    <Link className={cls} to={to || href}>
      {children}
    </Link>
  );
}

function PlanButton({ plan, row, ops, primary }) {
  if (!plan) return null;
  if (plan.kind === 'ficha') {
    return (
      <ActionLink to={clientHref(ops.basePath, row.clientId)} primary={primary}>
        {plan.label}
      </ActionLink>
    );
  }
  const run = () => {
    if (plan.kind === 'conta') ops.openConta?.(row.clientId, plan.focus);
    else if (plan.kind === 'demand') {
      ops.openDemand?.(row.clientId, { demandType: plan.demandType, title: plan.title });
    } else if (plan.kind === 'complete') ops.openComplete?.(row);
    else if (plan.kind === 'pause') ops.onPause?.(row);
  };
  return (
    <ActionLink primary={primary} onClick={run}>
      {plan.label}
    </ActionLink>
  );
}

export function ExceptionRowActions({ row, ops, showClient = true }) {
  const plan = exceptionActionPlan(row);
  return (
    <div className="trafego-line-actions">
      <PlanButton plan={plan} row={row} ops={ops} primary />
      {plan.secondary ? <PlanButton plan={plan.secondary} row={row} ops={ops} /> : null}
      {showClient ? <ActionLink to={clientHref(ops.basePath, row.clientId)}>Cliente</ActionLink> : null}
    </div>
  );
}

export function LastUpdate({ value }) {
  return formatOperationalUpdatedAt(value);
}

export function formatDay(iso) {
  const day = String(iso || '').slice(0, 10);
  if (!day) return 'Dados indisponíveis';
  const [y, m, d] = day.split('-');
  if (!y || !m || !d) return 'Dados indisponíveis';
  return `${d}/${m}/${y}`;
}
