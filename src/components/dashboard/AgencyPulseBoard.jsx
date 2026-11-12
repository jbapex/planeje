import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Building,
  CheckSquare,
  MessageSquare,
  RefreshCw,
  Target,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { buildClientConversasUrl, buildClientHubUrl, buildClientTasksUrl } from '@/lib/clientHubRoutes';
import { cn } from '@/lib/utils';

function formatPct(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `${Math.round(Number(n) * 100)}%`;
}

function PulseKpi({ icon: Icon, label, value, sub, tone, onClick }) {
  const className = cn('planeje-pulse-kpi', tone && `planeje-pulse-kpi--${tone}`);
  const inner = (
    <>
      <p className="planeje-pulse-kpi-label">
        <span className="planeje-pulse-kpi-icon" aria-hidden="true">
          <Icon className="w-3.5 h-3.5" />
        </span>
        {label}
      </p>
      <p className="planeje-pulse-kpi-value">{value}</p>
      <p className="planeje-pulse-kpi-sub">{sub}</p>
    </>
  );
  if (!onClick) return <div className={className}>{inner}</div>;
  return (
    <button type="button" className={className} onClick={onClick}>
      {inner}
    </button>
  );
}

function AccountRow({ account, detail, fact, to }) {
  return (
    <Link to={to} className="planeje-pulse-row">
      <Avatar className="h-8 w-8 rounded-lg shrink-0">
        <AvatarImage src={account.logo} alt="" className="object-cover" />
        <AvatarFallback className="rounded-lg bg-slate-100 dark:bg-slate-700">
          <Building className="w-3.5 h-3.5 text-slate-400" />
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="planeje-pulse-row-name">{account.empresa}</p>
        <p className="planeje-pulse-row-meta">{detail}</p>
      </div>
      <span className="planeje-pulse-fact">{fact}</span>
    </Link>
  );
}

function PulseColumn({ icon: Icon, title, count, empty, tone, children }) {
  return (
    <section className={cn('planeje-pulse-col', tone && `planeje-pulse-col--${tone}`)} id={`pulse-${tone || 'col'}`}>
      <header className="planeje-pulse-col-head">
        <div className="planeje-pulse-col-icon">
          <Icon className="w-4 h-4" />
        </div>
        <h3 className="planeje-pulse-col-title">{title}</h3>
        <span className="planeje-pulse-col-count">{count}</span>
      </header>
      <div className="planeje-pulse-col-body">
        {count === 0 ? <p className="planeje-pulse-empty">{empty}</p> : children}
      </div>
    </section>
  );
}

function cobDetail(account) {
  const status = account.cobertura?.status_cobertura;
  if (status === 'descoberto') return 'Sem a entrega do mês';
  if (status === 'parcial') return 'Cobertura pela metade';
  if (status === 'sem_escopo') return 'Ainda sem escopo';
  return account.cobMeta?.label || 'Cobertura do mês';
}

function lateDetail(account) {
  if (account.today) return `${account.today} também vence hoje`;
  return 'Em atraso';
}

export default function AgencyPulseBoard({ loading, error, summary, refresh }) {

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (loading) {
    return (
      <div className="planeje-pulse">
        <div className="planeje-dashboard-skeleton planeje-dashboard-skeleton--hero" style={{ height: 88 }} />
        <div className="planeje-pulse-cols">
          {[0, 1, 2].map((i) => (
            <div key={i} className="planeje-dashboard-skeleton" style={{ height: 220, borderRadius: 16 }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="planeje-pulse">
      <div className="planeje-pulse-toolbar">
        <div>
          <p className="planeje-pulse-kicker">Pulso da carteira</p>
          <h2 className="planeje-pulse-heading">O que pede ação agora</h2>
        </div>
        <button type="button" className="planeje-pulse-refresh" onClick={refresh}>
          <RefreshCw className="w-3.5 h-3.5" />
          Atualizar
        </button>
      </div>

      {error && (
        <p className="planeje-pulse-error">Não foi possível carregar o pulso: {error}</p>
      )}

      <div className="planeje-pulse-kpis">
        <PulseKpi
          icon={AlertTriangle}
          label="Em risco"
          value={summary.atRisk.length}
          sub={`de ${summary.total} contas`}
          tone={summary.atRisk.length ? 'danger' : 'ok'}
        />
        <PulseKpi
          icon={Target}
          label="Descobertas"
          value={summary.uncovered.length}
          sub="cobertura do mês"
          tone={summary.uncovered.length ? 'danger' : 'ok'}
          onClick={() => scrollTo('pulse-uncovered')}
        />
        <PulseKpi
          icon={MessageSquare}
          label="Conversas paradas"
          value={summary.stalled.length}
          sub="na instância da agência"
          tone={summary.stalled.length ? 'warn' : 'ok'}
          onClick={() => scrollTo('pulse-stalled')}
        />
        <PulseKpi
          icon={CheckSquare}
          label="Entregas atrasadas"
          value={summary.late.length}
          sub={`${summary.overdueTasks} tarefa${summary.overdueTasks === 1 ? '' : 's'} em atraso`}
          tone={summary.late.length ? 'danger' : 'ok'}
          onClick={() => scrollTo('pulse-late')}
        />
      </div>

      {summary.atRisk.length === 0 ? (
        <div className="planeje-pulse-clear">
          <p>Carteira no ritmo.</p>
          <span>Nenhuma conta descoberta, com conversa parada ou entrega atrasada.</span>
        </div>
      ) : (
        <div className="planeje-pulse-cols">
          <PulseColumn
            icon={Target}
            title="Descobertas"
            count={summary.uncovered.length}
            empty="Nenhuma conta descoberta neste mês."
            tone="uncovered"
          >
            {summary.uncovered.map((account) => (
              <AccountRow
                key={account.id}
                account={account}
                detail={cobDetail(account)}
                fact={formatPct(account.cobertura?.cobertura_pct)}
                to={buildClientHubUrl(account.id)}
              />
            ))}
          </PulseColumn>

          <PulseColumn
            icon={MessageSquare}
            title="Conversas paradas"
            count={summary.stalled.length}
            empty="Nenhuma conversa pendente na carteira."
            tone="stalled"
          >
            {summary.stalled.map((account) => (
              <AccountRow
                key={account.id}
                account={account}
                detail="Sem resposta"
                fact={String(account.pendingConversas)}
                to={buildClientConversasUrl(account.id)}
              />
            ))}
          </PulseColumn>

          <PulseColumn
            icon={CheckSquare}
            title="Entregas atrasadas"
            count={summary.late.length}
            empty="Nenhuma entrega atrasada."
            tone="late"
          >
            {summary.late.map((account) => (
              <AccountRow
                key={account.id}
                account={account}
                detail={lateDetail(account)}
                fact={String(account.overdue)}
                to={buildClientTasksUrl(account.id)}
              />
            ))}
          </PulseColumn>
        </div>
      )}

      {summary.atRisk.length > 0 && (
        <p className="planeje-pulse-footnote">
          <AlertTriangle className="w-3.5 h-3.5" />
          Clique na conta para abrir. As conversas desta lista são só da instância da agência.
          {' '}
          <Link to="/clients" className="planeje-pulse-footnote-link">Ver carteira</Link>
          {' · '}
          <Link to={buildClientHubUrl(summary.atRisk[0].id)} className="planeje-pulse-footnote-link">
            Abrir pior conta
          </Link>
        </p>
      )}
    </div>
  );
}
