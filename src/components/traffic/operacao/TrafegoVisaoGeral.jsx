import { useState } from 'react';
import { formatMoney } from '@/lib/trafegoFila';
import {
  ActionLink,
  EmptyState,
  HealthBadge,
  SeverityIcon,
  clientHref,
  ExceptionRowActions,
} from '@/components/traffic/operacao/TrafegoOperacaoBits';

export default function TrafegoVisaoGeral({ model, basePath, ops }) {
  const o = model.overview;
  const overdueRows = model.clients.filter((c) => (c.overdueTasks || 0) > 0 || c.nextActionOverdue);
  const waitingRows = model.clients.filter((c) => c.health.status === 'aguardando_cliente');

  return (
    <div>
      <div className="trafego-stats">
        <div className={`trafego-stat${o.checkup.unreviewed ? ' is-warn' : ' is-ok'}`}>
          <span>Revisados hoje</span>
          <strong>
            {o.checkup.reviewed}/{o.checkup.total}
          </strong>
        </div>
        <div className={`trafego-stat${o.healthCounts.critico ? ' is-danger' : ''}`}>
          <span>Críticos</span>
          <strong>{o.healthCounts.critico}</strong>
        </div>
        <div className={`trafego-stat${o.waitingCount ? ' is-warn' : ''}`}>
          <span>Aguardando cliente</span>
          <strong>{o.waitingCount}</strong>
        </div>
        <div className={`trafego-stat${o.overdueCount ? ' is-danger' : ''}`}>
          <span>Tarefas vencidas</span>
          <strong>{o.overdueCount}</strong>
        </div>
      </div>

      <div className="trafego-layout">
        <section className="trafego-panel">
          <h2>Prioridades de hoje</h2>
          {o.todayPriorities.length === 0 ? (
            <EmptyState title="Nada crítico na fila">Quando um cliente sair do ritmo, ele aparece aqui.</EmptyState>
          ) : (
            o.todayPriorities.map((row) => (
              <div key={`${row.clientId}-${row.code}`} className="trafego-line">
                <SeverityIcon health={row.health} />
                <div>
                  <p>{row.empresa}</p>
                  <small>
                    {row.problem}
                    {row.reason && row.reason !== row.problem ? ` · ${row.reason}` : ''}
                  </small>
                </div>
                <ExceptionRowActions row={row} ops={ops} />
              </div>
            ))
          )}
        </section>

        <div className="trafego-stack">
          <section className="trafego-panel">
            <h2>Ritmo da carteira</h2>
            {o.paceRows.map((row) => (
              <div key={row.clientId} className="trafego-line">
                <SeverityIcon health={row.health} />
                <div>
                  <p>{row.empresa}</p>
                  <small>
                    {row.pace.available ? row.pace.label : 'Dados indisponíveis'}
                    {row.spendMonth.available && row.budget.available
                      ? ` · ${formatMoney(row.spendMonth.value)} / ${formatMoney(row.budget.value)}`
                      : ''}
                  </small>
                </div>
                <ActionLink to={clientHref(basePath, row.clientId)}>Ficha</ActionLink>
              </div>
            ))}
          </section>
          <section className="trafego-panel">
            <h2>Tarefas vencidas</h2>
            {overdueRows.length === 0 ? (
              <p className="trafego-muted">Nenhuma demanda atrasada.</p>
            ) : (
              overdueRows.map((row) => (
                <div key={row.clientId} className="trafego-line">
                  <SeverityIcon health={row.health} />
                  <div>
                    <p>{row.empresa}</p>
                    <small>{row.nextAction?.title || `${row.overdueTasks} demanda(s)`}</small>
                  </div>
                  <div className="trafego-line-actions">
                    {row.nextAction?.task_id ? (
                      <ActionLink
                        primary
                        onClick={() =>
                          ops.openComplete?.({
                            clientId: row.clientId,
                            taskId: row.nextAction.task_id,
                            taskTitle: row.nextAction.title,
                            code: 'overdue_tasks',
                          })
                        }
                      >
                        Concluir
                      </ActionLink>
                    ) : (
                      <ActionLink primary onClick={() => ops.openDemand?.(row.clientId, { demandType: 'ajuste' })}>
                        Criar demanda
                      </ActionLink>
                    )}
                    <ActionLink to={clientHref(basePath, row.clientId)}>Cliente</ActionLink>
                  </div>
                </div>
              ))
            )}
          </section>
          <section className="trafego-panel">
            <h2>Aguardando cliente</h2>
            {waitingRows.length === 0 ? (
              <p className="trafego-muted">Nada parado no cliente.</p>
            ) : (
              waitingRows.map((row) => (
                <div key={row.clientId} className="trafego-line">
                  <SeverityIcon health={row.health} />
                  <div>
                    <p>{row.empresa}</p>
                    <small>{row.nextAction?.title || 'Cobrar material, acesso ou aprovação'}</small>
                  </div>
                  <div className="trafego-line-actions">
                    <ActionLink
                      primary
                      onClick={() => ops.openDemand?.(row.clientId, { demandType: 'cobranca_material' })}
                    >
                      Cobrar
                    </ActionLink>
                    <ActionLink to={clientHref(basePath, row.clientId)}>Ficha</ActionLink>
                  </div>
                </div>
              ))
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

const FILTERS = [
  { id: 'todos', label: 'Todos' },
  { id: 'critico', label: 'Críticos' },
  { id: 'atencao', label: 'Atenção' },
  { id: 'aguardando_cliente', label: 'Aguardando cliente' },
  { id: 'dados_indisponiveis', label: 'Dados indisponíveis' },
];

function filterRows(rows, filter) {
  if (filter === 'todos') return rows;
  if (filter === 'critico') return rows.filter((r) => r.health?.status === 'critico' || r.bucket === 'critico');
  if (filter === 'atencao') {
    return rows.filter((r) => r.health?.status === 'atencao' || ['atencao', 'tarefa_vencida', 'campanha_esperada_sem_atividade', 'orcamento_ausente'].includes(r.bucket));
  }
  return rows.filter((r) => r.health?.status === filter || r.bucket === filter);
}

export function TrafegoCentralOperacoes({ model, basePath, ops }) {
  const [filter, setFilter] = useState('todos');
  const rows = filterRows(model.alertas, filter);
  if (!model.alertas.length) {
    return <EmptyState title="Operação sem exceção agora">Clientes no ritmo não entram nesta fila.</EmptyState>;
  }
  return (
    <div>
      <div className="trafego-filters">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`trafego-chip${filter === item.id ? ' is-on' : ''}`}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="trafego-table-wrap trafego-queue-desktop">
        <table className="trafego-table">
          <thead>
            <tr>
              <th>Sev.</th>
              <th>Cliente</th>
              <th>Problema</th>
              <th>Responsável</th>
              <th>Prazo</th>
              <th>Tarefa</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.clientId}-${row.code}`}>
                <td>
                  <SeverityIcon health={row.health} />
                </td>
                <td>
                  <strong>{row.empresa}</strong>
                  <HealthBadge health={row.health} />
                </td>
                <td>
                  <strong>{row.problem}</strong>
                  <small>{row.reason}</small>
                </td>
                <td>{row.ownerName || 'Dados indisponíveis'}</td>
                <td>{row.dueDate || 'Dados indisponíveis'}</td>
                <td>{row.taskTitle || '—'}</td>
                <td>
                  <ExceptionRowActions row={row} ops={ops} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="trafego-mobile-queue">
        {rows.map((row) => (
          <div key={`${row.clientId}-${row.code}`} className="trafego-panel" style={{ marginBottom: 8 }}>
            <div className="trafego-line">
              <SeverityIcon health={row.health} />
              <div>
                <p>{row.empresa}</p>
                <small>
                  {row.problem} · {row.ownerName || 'Dados indisponíveis'} · {row.dueDate || 'sem prazo'}
                </small>
              </div>
            </div>
            <ExceptionRowActions row={row} ops={ops} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TrafegoAlertas({ model, ops }) {
  if (!model.alertas.length) {
    return <EmptyState title="Nenhum alerta acionável">A mesma regra de saúde da Central alimenta esta lista.</EmptyState>;
  }
  return (
    <div className="trafego-panel">
      {model.alertas.map((row) => (
        <div key={`${row.clientId}-${row.code}`} className="trafego-line">
          <SeverityIcon health={row.health} />
          <div>
            <p>{row.empresa}</p>
            <small>
              {row.problem} · {row.action}
            </small>
          </div>
          <ExceptionRowActions row={row} ops={ops} />
        </div>
      ))}
    </div>
  );
}
