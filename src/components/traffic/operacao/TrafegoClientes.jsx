import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatOperationalUpdatedAt, situationLabel } from '@/lib/centralTrafego';
import { checkupOutcomeLabel } from '@/lib/centralTrafegoCheckup';
import {
  ActionLink,
  EmptyState,
  ExceptionRowActions,
  HealthBadge,
  MoneyText,
  SeverityIcon,
  clientHref,
} from '@/components/traffic/operacao/TrafegoOperacaoBits';
import { TrafegoContaFields } from '@/components/traffic/operacao/TrafegoContaFields';

export function TrafegoClientes({ model, basePath }) {
  if (!model.clients.length) {
    return <EmptyState title="Nenhuma conta operacional">Clientes com Meta, campanha ou demanda de tráfego entram aqui.</EmptyState>;
  }
  return (
    <div className="trafego-table-wrap">
      <table className="trafego-table">
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Gestor</th>
            <th>Saúde</th>
            <th>Campanhas</th>
            <th>Orçamento</th>
            <th>Investido</th>
            <th>Saldo</th>
            <th>Previsão</th>
            <th>Indicador</th>
            <th>Atualização</th>
            <th>Próxima ação</th>
          </tr>
        </thead>
        <tbody>
          {model.clients.map((client) => (
            <tr key={client.clientId}>
              <td>
                <Link to={clientHref(basePath, client.clientId)} style={{ fontWeight: 700, color: '#5b21b6', textDecoration: 'none' }}>
                  {client.empresa}
                </Link>
              </td>
              <td>{client.gestorName || 'Sem gestor'}</td>
              <td>
                <HealthBadge health={client.health} />
              </td>
              <td>{client.activeCampaigns}</td>
              <td>
                <MoneyText metric={client.budget} />
              </td>
              <td>
                <MoneyText metric={client.spendMonth} />
              </td>
              <td>
                <MoneyText metric={client.remaining} />
              </td>
              <td>{client.pace.label || 'Dados indisponíveis'}</td>
              <td>{client.primaryIndicator || 'Dados indisponíveis'}</td>
              <td>{formatOperationalUpdatedAt(client.lastUpdate)}</td>
              <td>{client.nextAction?.title || 'Nenhuma'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TrafegoClienteFicha({ client, basePath, ops }) {
  if (!client) {
    return <EmptyState title="Cliente não encontrado">Volte à lista operacional.</EmptyState>;
  }
  const check = client.configChecklist;
  return (
    <div className="trafego-ficha">
      <header className="trafego-ficha-head">
        <div>
          <p className="trafego-head-kicker">Ficha operacional</p>
          <h2 style={{ margin: 0, fontSize: '1.35rem' }}>{client.empresa}</h2>
          <p className="trafego-muted">
            {client.gestorName || 'Sem gestor'} · {situationLabel(client.situation)} · sync {formatOperationalUpdatedAt(client.lastUpdate)}
          </p>
        </div>
        <div className="trafego-line-actions">
          <HealthBadge health={client.health} />
          <ActionLink primary onClick={() => ops?.openDemand?.(client.clientId, { demandType: 'ajuste' })}>
            Criar demanda
          </ActionLink>
          <ActionLink onClick={() => ops?.openSettings?.(client.clientId)}>Check-up</ActionLink>
          <ActionLink to={`${basePath}/checkup`}>Conferir hoje</ActionLink>
          <ActionLink to={`${basePath}/clientes`}>Voltar</ActionLink>
        </div>
      </header>

      <div className="trafego-stack">
        <section className="trafego-panel">
          <h2>Conta operacional</h2>
          <p className="trafego-muted">Gestor, situação e orçamento desta conta. Sem campanha no ar, marque “Sem campanha esperada”.</p>
          <TrafegoContaFields
            client={client}
            team={ops?.team}
            onSaveOps={ops?.saveClientOps}
            onSaveBudget={ops?.saveBudget}
          />
        </section>
        <section className="trafego-panel">
          <h2>Indicadores</h2>
          <div className="trafego-kpis4">
            <div className="trafego-kpi">
              <span>Campanhas ativas</span>
              <strong>{client.activeCampaigns}</strong>
            </div>
            <div className="trafego-kpi">
              <span>Orçamento</span>
              <strong>
                <MoneyText metric={client.budget} />
              </strong>
            </div>
            <div className="trafego-kpi">
              <span>Investido</span>
              <strong>
                <MoneyText metric={client.spendMonth} />
              </strong>
            </div>
            <div className="trafego-kpi">
              <span>Saldo</span>
              <strong>
                <MoneyText metric={client.remaining} />
              </strong>
            </div>
          </div>
        </section>
        <section className="trafego-panel">
          <h2>Resumo operacional</h2>
          <p className="trafego-muted">
            Gestor {check.gestor ? 'ok' : 'pendente'} · Orçamento {check.budget ? 'ok' : 'pendente'} · Meta{' '}
            {check.metaReadable ? 'ok' : 'indisponível'} · Campanha {check.hasActiveCampaign ? 'no ar' : check.campaignExpected ? 'esperada' : 'não esperada'}
          </p>
          {client.exceptions.length ? (
            client.exceptions.map((e) => (
              <div key={e.code} className="trafego-line">
                <SeverityIcon health={e.health} />
                <div>
                  <p>{e.problem}</p>
                  <small>{e.action}</small>
                </div>
                <ExceptionRowActions
                  row={{ ...e, clientId: client.clientId, empresa: client.empresa }}
                  ops={ops}
                  showClient={false}
                />
              </div>
            ))
          ) : (
            <p className="trafego-muted">Sem exceção aberta nesta conta.</p>
          )}
        </section>
        <section className="trafego-panel">
          <h2>Orçamento e projeção</h2>
          <div className="trafego-kpis4">
            <div className="trafego-kpi">
              <span>Meta de performance</span>
              <strong>{client.primaryIndicator || 'Dados indisponíveis'}</strong>
            </div>
            <div className="trafego-kpi">
              <span>Projeção</span>
              <strong>{client.pace.label || 'Dados indisponíveis'}</strong>
            </div>
          </div>
        </section>
        <section className="trafego-panel">
          <h2>Campanhas</h2>
          {client.campaigns.length ? (
            client.campaigns.map((c) => (
              <div key={c.id} className="trafego-line">
                <span />
                <div>
                  <p>{c.name}</p>
                  <small>{c.status}</small>
                </div>
              </div>
            ))
          ) : (
            <p className="trafego-muted">Nenhuma campanha neste cliente.</p>
          )}
        </section>
      </div>

      <div className="trafego-stack">
        <section className="trafego-panel">
          <h2>Próximas ações</h2>
          <div className="trafego-line">
            <SeverityIcon health={client.health} />
            <div>
              <p>{client.nextAction?.title || 'Nenhuma ação aberta'}</p>
              <small>{client.nextAction?.due_date || 'sem prazo'}</small>
            </div>
            {client.nextAction?.task_id ? (
              <ActionLink
                primary
                onClick={() =>
                  ops?.openComplete?.({
                    clientId: client.clientId,
                    taskId: client.nextAction.task_id,
                    taskTitle: client.nextAction.title,
                    code: 'next_action_overdue',
                  })
                }
              >
                Concluir
              </ActionLink>
            ) : (
              <ActionLink primary onClick={() => ops?.openDemand?.(client.clientId, { demandType: 'ajuste' })}>
                Criar demanda
              </ActionLink>
            )}
          </div>
        </section>
        <section className="trafego-panel">
          <h2>Tarefas</h2>
          {client.tasks.length ? (
            client.tasks.map((t) => (
              <div key={t.id} className="trafego-line">
                <span />
                <div>
                  <p>{t.title}</p>
                  <small>
                    {t.due_date || 'sem prazo'} · {t.status}
                  </small>
                </div>
                <ActionLink
                  onClick={() =>
                    ops?.openComplete?.({
                      clientId: client.clientId,
                      taskId: t.id,
                      taskTitle: t.title,
                      code: 'overdue_tasks',
                    })
                  }
                >
                  Concluir
                </ActionLink>
              </div>
            ))
          ) : (
            <p className="trafego-muted">Nenhuma demanda neste recorte.</p>
          )}
        </section>
        <section className="trafego-panel">
          <h2>Último check-up</h2>
          <p className="trafego-muted">
            {client.checkup.result ? checkupOutcomeLabel(client.checkup.result) : 'Ainda não revisado'}
            {client.checkup.actorName ? ` · ${client.checkup.actorName}` : ''}
            {client.checkup.note ? ` · ${client.checkup.note}` : ''}
          </p>
        </section>
        <section className="trafego-panel">
          <h2>Histórico</h2>
          {client.history?.length ? (
            client.history.map((h, i) => (
              <div key={i} className="trafego-line">
                <span />
                <div>
                  <p>{h.text}</p>
                  <small>{h.at}</small>
                </div>
              </div>
            ))
          ) : (
            <p className="trafego-muted">Histórico operacional ainda vazio.</p>
          )}
        </section>
        <section className="trafego-panel">
          <h2>Arquivos / criativos</h2>
          {client.attachments.length ? (
            client.attachments.map((a) => (
              <div key={a.id} className="trafego-line">
                <span />
                <div>
                  <p>{a.name}</p>
                  <small>Vínculo: {a.linkedTo || 'arquivo'}</small>
                </div>
                {a.url ? (
                  <ActionLink href={a.url}>Abrir</ActionLink>
                ) : null}
              </div>
            ))
          ) : (
            <p className="trafego-muted">Sem anexos ou arquivos do Drive neste cliente.</p>
          )}
        </section>
      </div>
    </div>
  );
}

export function TrafegoTarefasBoard({ model, ops }) {
  const [client, setClient] = useState('');
  const [owner, setOwner] = useState('');
  const [priority, setPriority] = useState('');
  const [origin, setOrigin] = useState('');
  const all = useMemo(() => model.clients.flatMap((c) => (c.tasks || []).map((t) => ({ ...t, empresa: c.empresa, gestorName: c.gestorName }))), [model.clients]);
  const filtered = all.filter((t) => {
    if (client && t.clientId !== client && t.client_id !== client) return false;
    if (owner && t.assignee_name !== owner && t.gestorName !== owner) return false;
    if (priority && t.priority !== priority) return false;
    if (origin && (t.origin || t.source_type || t.demand_type) !== origin) return false;
    return true;
  });
  const groups = {
    todo: filtered.filter((t) => !t.waitingClient && t.status !== 'in_progress' && t.status !== 'done' && !t.terminal),
    doing: filtered.filter((t) => t.status === 'in_progress' || t.inProgress),
    waiting: filtered.filter((t) => t.waitingClient || t.demand_type === 'cobranca_material' || t.demand_type === 'aprovacao_cliente'),
    done: filtered.filter((t) => t.terminal || t.status === 'done'),
  };
  const cols = [
    ['todo', 'Para fazer', groups.todo],
    ['doing', 'Em andamento', groups.doing],
    ['waiting', 'Aguardando cliente', groups.waiting],
    ['done', 'Concluídas', groups.done],
  ];
  return (
    <div>
      <div className="trafego-filters">
        <select value={client} onChange={(e) => setClient(e.target.value)}>
          <option value="">Cliente</option>
          {model.clients.map((c) => (
            <option key={c.clientId} value={c.clientId}>
              {c.empresa}
            </option>
          ))}
        </select>
        <select value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">Responsável</option>
          {[...new Set(model.clients.map((c) => c.gestorName).filter(Boolean))].map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">Prioridade</option>
          <option value="high">Alta</option>
          <option value="medium">Média</option>
          <option value="low">Baixa</option>
        </select>
        <select value={origin} onChange={(e) => setOrigin(e.target.value)}>
          <option value="">Origem</option>
          <option value="tarefa">Tarefa</option>
          <option value="checkup">Check-up</option>
          <option value="campanha">Campanha</option>
          <option value="revisao">Revisão</option>
          <option value="aprovacao">Aprovação</option>
          <option value="cobranca_material">Cobrança de material</option>
        </select>
        <button type="button" className="trafego-btn" onClick={() => ops?.openDemand?.()}>
          Criar demanda
        </button>
      </div>
      <div className="trafego-task-cols">
        {cols.map(([key, label, rows]) => (
          <section key={key} className="trafego-panel">
            <h2>
              {label} <span className="trafego-muted">{rows.length}</span>
            </h2>
            {rows.length === 0 ? (
              <p className="trafego-muted">Nada neste estágio.</p>
            ) : (
              rows.map((t) => (
                <div key={t.id} className="trafego-line">
                  <span />
                  <div>
                    <p>{t.title}</p>
                    <small>
                      {t.empresa} · {t.due_date || 'sem prazo'}
                    </small>
                  </div>
                  {key !== 'done' ? (
                    <ActionLink
                      onClick={() =>
                        ops?.openComplete?.({
                          clientId: t.clientId || t.client_id,
                          taskId: t.id,
                          taskTitle: t.title,
                          code: 'overdue_tasks',
                        })
                      }
                    >
                      Concluir
                    </ActionLink>
                  ) : null}
                </div>
              ))
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

export function TrafegoCriativos({ model }) {
  const files = model.clients.flatMap((c) => (c.attachments || []).map((a) => ({ ...a, empresa: c.empresa })));
  if (!files.length) {
    return <EmptyState title="Nenhum criativo neste recorte">Aqui entram anexos e arquivos do Drive já ligados às demandas e campanhas.</EmptyState>;
  }
  return (
    <div className="trafego-panel">
      {files.map((file) => (
        <div key={file.id} className="trafego-line">
          <span />
          <div>
            <p>{file.name}</p>
            <small>
              {file.empresa} · {file.linkedTo || 'arquivo'}
            </small>
          </div>
          {file.url ? <ActionLink href={file.url}>Abrir</ActionLink> : null}
        </div>
      ))}
    </div>
  );
}

function reportPeriodLabel(isoDate) {
  if (!isoDate) return 'Dados indisponíveis';
  const [year, month] = String(isoDate).split('-');
  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const idx = Number(month) - 1;
  if (!year || idx < 0 || idx > 11) return isoDate;
  return `${months[idx]}/${year}`;
}

export function TrafegoRelatorios({ model }) {
  return (
    <div className="trafego-panel">
      <h2>Relatório operacional · {reportPeriodLabel(model.overview.operationalDate)}</h2>
      <p className="trafego-muted">Estrutura visual desta rodada. Geração e envio ainda não entram.</p>
      <div className="trafego-table-wrap" style={{ boxShadow: 'none' }}>
        <table className="trafego-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Investimento</th>
              <th>Situação</th>
              <th>Ações</th>
              <th>Problemas</th>
              <th>Próximos passos</th>
              <th>Check-up</th>
            </tr>
          </thead>
          <tbody>
            {model.clients
              .filter((c) => c.health.status !== 'encerrado')
              .map((client) => (
                <tr key={client.clientId}>
                  <td>
                    <strong>{client.empresa}</strong>
                  </td>
                  <td>
                    <MoneyText metric={client.spendMonth} />
                  </td>
                  <td>
                    <HealthBadge health={client.health} />
                  </td>
                  <td>{client.checkup.result ? 'Check-up confirmado' : 'Ainda sem check-up'}</td>
                  <td>{client.exceptions.length ? client.exceptions.map((e) => e.problem).join(' · ') : 'Nenhum'}</td>
                  <td>{client.nextAction?.title || 'Nenhuma ação aberta'}</td>
                  <td>{client.checkup.result || 'Não revisado'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
