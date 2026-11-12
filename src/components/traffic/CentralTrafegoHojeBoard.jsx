import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlarmClock, AlertTriangle, Clock, ExternalLink, ListTodo } from 'lucide-react';
import { buildCrmRoutineUrl, ymdInSaoPaulo } from '@/lib/trafegoRotina';
import { painelHref } from '@/lib/trafegoPainelHref';

function Column({ title, description, count, tone, empty, icon: Icon, upcoming = [], children }) {
  const [showUpcoming, setShowUpcoming] = useState(false);
  const items = children?.length ? children : null;
  return (
    <section className={`hoje-board-col${tone ? ` is-${tone}` : ''}`}>
      <header className="hoje-board-col-head">
        {Icon ? <Icon className="hoje-board-col-icon" size={15} aria-hidden /> : null}
        <h3>{title}</h3>
        <span className="hoje-board-col-count">{count || 0}</span>
      </header>
      {description ? <p className="hoje-board-card-detail px-3 pb-2">{description}</p> : null}
      <ul className="hoje-board-col-list">
        {items || (
          <li className="hoje-board-empty">
            <span className="hoje-board-empty-label">{empty}</span>
          </li>
        )}
        {upcoming.length ? (
          <li className="hoje-board-upcoming-toggle">
            <button type="button" onClick={() => setShowUpcoming((open) => !open)}>
              {showUpcoming ? 'Ocultar próximas' : `Ver próximas (${upcoming.length})`}
            </button>
          </li>
        ) : null}
        {showUpcoming
          ? upcoming.map((item) => <UpcomingCard key={item.id} item={item} />)
          : null}
      </ul>
    </section>
  );
}

function UpcomingCard({ item }) {
  return (
    <li className="hoje-board-card is-upcoming">
      <p className="hoje-board-card-tag">Próxima</p>
      <p className="hoje-board-card-title">{item.title}</p>
      {item.reason ? <p className="hoje-board-card-detail">{item.reason}</p> : null}
      <div className="hoje-board-card-foot">
        <Link className="hoje-board-card-go" to={item.href || '/paid-traffic/rotina'}>
          Rotina
        </Link>
      </div>
    </li>
  );
}

function cardTag(item) {
  if (item.kind === 'weekly' && item.routineKind === 'optimization') return 'Otimização';
  if (item.kind === 'weekly') return 'Análise';
  if (item.routineKind === 'report') return 'Relatório';
  if (item.routineKind === 'crm') return 'CRM';
  if (item.waitKind === 'revisoes_48h') return 'Revisão 48h';
  if (item.waitKind === 'publicacoes_pendentes') return 'Publicação';
  if (item.waitKind === 'aguardando_cliente') return 'Espera';
  if (item.kind === 'demand' && item.action?.title) return `Demanda · ${item.action.title}`;
  if (item.kind === 'demand') return 'Demanda';
  return item.action?.title || 'Meta';
}

function BoardCard({ item, onComplete, onCreateDemand, painelPeriod }) {
  const isWeekly = item.kind === 'weekly';
  const isRotina = item.kind === 'rotina';
  const isDemand = item.kind === 'demand';
  const isAction = !isWeekly && !isRotina && !isDemand;
  const broke = isAction && item.tone === 'issue';
  const check = isAction && item.tone !== 'issue';
  const overdue = item.overdue || item.demand?.overdue;
  const href = isWeekly
    ? item.href
    : item.clientId && (isAction || item.action?.code)
      ? painelHref(item.clientId, { period: painelPeriod, actionCode: item.action?.code })
      : null;
  const canCreateDemand = isAction && item.action?.demandType && typeof onCreateDemand === 'function';

  return (
    <li className={`hoje-board-card${overdue ? ' is-overdue' : ''}${isWeekly ? ` is-${item.routineKind}` : ''}${isRotina ? ' is-rotina' : ''}${broke ? ' is-broke' : ''}${check ? ' is-check' : ''}${isDemand ? ' is-demand' : ''}`}>
      <p className="hoje-board-card-tag">{cardTag(item)}{item.started ? ' · Em andamento' : ''}</p>
      <p className="hoje-board-card-title">{item.title}</p>
      {item.reason ? <p className="hoje-board-card-detail">{item.reason}</p> : null}
      <div className="hoje-board-card-foot">
        {href ? (
          <Link className="hoje-board-card-go" to={href}>
            {isWeekly && item.routineKind === 'optimization' ? 'Conferir' : isWeekly ? 'Abrir' : 'Painel'}
          </Link>
        ) : null}
        {canCreateDemand ? (
          <button
            type="button"
            className="hoje-board-card-go"
            onClick={() =>
              onCreateDemand({
                clientId: item.clientId,
                demandType: item.action.demandType,
                title: item.action.demandTitle || item.action.title || '',
              })
            }
          >
            Criar demanda
          </button>
        ) : null}
        {isRotina && item.routineKind === 'crm' ? (
          <Link className="hoje-board-card-go" to={buildCrmRoutineUrl(item.clientId, ymdInSaoPaulo())} target="_blank" rel="noreferrer">
            CRM
            <ExternalLink size={12} aria-hidden />
          </Link>
        ) : null}
        {isRotina || isDemand ? (
          <button type="button" className="hoje-board-card-go" onClick={() => onComplete?.(item.demand)}>
            Concluir
          </button>
        ) : null}
      </div>
    </li>
  );
}

export default function CentralTrafegoHojeBoard({
  columns,
  upcoming = { analysis: [], optimization: [] },
  onCompleteDemand,
  onCreateDemand,
  painelPeriod,
}) {
  const { urgente = [], atrasado = [], venceHoje = [], aFazer = [], aguardando = [] } = columns || {};
  const upcomingWork = [...(upcoming.analysis || []), ...(upcoming.optimization || [])];

  return (
    <div className="hoje-kanban" role="region" tabIndex={0} aria-label="Quadro das rotinas de tráfego">
      <Column title="Urgente" count={urgente.length} tone="urgent" icon={AlertTriangle} empty="Sem alertas críticos ou demandas de prioridade alta">
        {urgente.map((item) => (
          <BoardCard key={item.id} item={item} onComplete={onCompleteDemand} onCreateDemand={onCreateDemand} painelPeriod={painelPeriod} />
        ))}
      </Column>
      <Column title="Atrasado" count={atrasado.length} tone="late" icon={AlarmClock} empty="Nada vencido">
        {atrasado.map((item) => (
          <BoardCard key={item.id} item={item} onComplete={onCompleteDemand} onCreateDemand={onCreateDemand} painelPeriod={painelPeriod} />
        ))}
      </Column>
      <Column title="Vence hoje" count={venceHoje.length} tone="routine" icon={Clock} empty="Nada vence hoje">
        {venceHoje.map((item) => (
          <BoardCard key={item.id} item={item} onComplete={onCompleteDemand} onCreateDemand={onCreateDemand} painelPeriod={painelPeriod} />
        ))}
      </Column>
      <Column
        title="A fazer"
        description="Avisos, prazos futuros e tarefas sem prazo."
        count={aFazer.length}
        tone="routine"
        icon={ListTodo}
        empty="Nada no prazo"
        upcoming={upcomingWork}
      >
        {aFazer.map((item) => (
          <BoardCard key={item.id} item={item} onComplete={onCompleteDemand} onCreateDemand={onCreateDemand} painelPeriod={painelPeriod} />
        ))}
      </Column>
      <Column title="Aguardando cliente" count={aguardando.length} tone="wait" icon={Clock} empty="Nada parado no cliente">
        {aguardando.map((item) => (
          <BoardCard key={item.id} item={item} onComplete={onCompleteDemand} onCreateDemand={onCreateDemand} painelPeriod={painelPeriod} />
        ))}
      </Column>
    </div>
  );
}
