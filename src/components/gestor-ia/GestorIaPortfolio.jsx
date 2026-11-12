import React, { Fragment } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Search, SlidersHorizontal } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { readClienteMetaResumo } from '@/lib/clienteMetaSnapshot';
import { isOpenTrafficTask } from '@/lib/trafegoDashboard';
import { adPlatforms, clientGoalPage, clientPage, readClientTargets } from './gestorIaClientModel';
import GestorIaClientMenu from './GestorIaClientMenu';
import GestorIaClientAvatar from './GestorIaClientAvatar';
import GestorIaPortfolioGoal from './GestorIaPortfolioGoal';
import { number, objectiveLabel, periodLabel } from './GestorIaContext';
import { CHART_METRICS, formatMetric, metricValue, objectiveMetricKeys, presetPeriod } from './gestorIaMetricModel';
import { goalMonthPeriod, mediaGoalProgress } from './gestorIaMediaGoalModel';
import { useGestorGoalReadings } from './useGestorGoalReadings';

const columns = [
  ['accounts', 'Contas de anúncio'], ['manager', 'Gestor'], ['goals', 'Metas'], ['spend', 'Investido'], ['tasks', 'Pendências'],
  ['result', 'Resultados'], ['cost', 'Custo por resultado'],
];
const columnKeys = columns.map(([key]) => key);
const columnLabels = Object.fromEntries(columns);
const defaultHidden = ['result', 'cost'];
const filters = [
  ['all', 'Todos', () => true],
  ['attention', 'Em atenção', (row) => row.tasks > 0],
  ['no-goals', 'Sem metas', (row) => row.goalsKnown && !row.goals.length && !row.mediaGoals.length && row.limit === null],
  ['unlinked', 'Sem conta', ({ client }) => client.metaAccounts?.length === 0 && client.googleAccounts?.length === 0],
];
const pageSize = 10;

function initials(value) {
  return String(value || '').trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
}

export default function GestorIaPortfolio({ clients, canManageClients, readStore, goalReadingRevision }) {
  const { canViewField } = useAuth();
  const [params, setParams] = useSearchParams();
  const search = params.get('carteira_busca') || '';
  const needle = search.trim().toLocaleLowerCase('pt-BR');
  const filter = filters.find(([key]) => key === params.get('carteira_filtro')) || filters[0];
  const days = ['7', '14', '30'].find((value) => value === params.get('carteira_dias')) || '30';
  const range = presetPeriod(`last${days}`);
  const hidden = params.has('carteira_ocultas') ? params.get('carteira_ocultas').split(',').filter((key) => columnKeys.includes(key)) : defaultHidden;
  const orderedKeys = [...new Set([...(params.get('carteira_ordem') || '').split(',').filter((key) => columnKeys.includes(key)), ...columnKeys])];
  const displayedColumns = orderedKeys.filter((key) => !hidden.includes(key));
  const view = (key) => canViewField?.(key) === true;
  const groupByManager = view('responsavel') && params.get('carteira_grupo') === 'gestor';
  const groupLabel = (row) => groupByManager ? row.client.gestorName || 'Gestor não informado' : row.tasks > 0 ? 'Precisa de você' : 'Outros clientes';
  const goalsKnown = ['meta_custo_mensagem', 'meta_custo_compra', 'roas_alvo', 'valor', 'limite_meta'].every(view);
  const rows = clients.map((client) => ({
    client, goalsKnown: goalsKnown && client.mediaGoals !== null, goals: readClientTargets(client, canViewField), mediaGoals: client.mediaGoals || [],
    tasks: client.tasks?.filter(isOpenTrafficTask).length,
    limit: view('valor') && view('limite_meta') && metricValue(client, 'limite_meta') > 0 ? metricValue(client, 'limite_meta') : null,
  }));
  const visible = rows.filter((row) => {
    const names = adPlatforms.flatMap(([, field, , name]) => (row.client[field] || []).map((account) => account[name]));
    return filter[2](row) && [row.client.empresa, ...names].join(' ').toLocaleLowerCase('pt-BR').includes(needle);
  }).sort((a, b) => (groupByManager ? groupLabel(a).localeCompare(groupLabel(b), 'pt-BR') : 0) || Number(b.tasks > 0) - Number(a.tasks > 0));
  const groupCounts = new Map();
  visible.forEach((row) => { const label = groupLabel(row); groupCounts.set(label, (groupCounts.get(label) || 0) + 1); });
  const attention = rows.filter((row) => row.tasks > 0).length;
  const totalTasks = rows.reduce((total, row) => total + (row.tasks || 0), 0);
  const pages = Math.max(1, Math.ceil(visible.length / pageSize));
  const requestedPage = Number.parseInt(params.get('carteira_pagina'), 10) || 1;
  const page = Math.min(Math.max(1, requestedPage), pages);
  const pageRows = visible.slice((page - 1) * pageSize, page * pageSize);
  const month = goalMonthPeriod();
  const primaryIds = displayedColumns.includes('goals') && view('meta_resumo') && view('valor')
    ? pageRows.flatMap(({ mediaGoals }) => mediaGoals.filter(({ is_active, is_primary }) => is_active && is_primary).map(({ id }) => id)) : [];
  const goalRead = useGestorGoalReadings(readStore, primaryIds, month, goalReadingRevision);
  const decisionParams = new URLSearchParams(params);
  decisionParams.delete('cliente');
  decisionParams.delete('conta');

  function change(key, value) {
    setParams((old) => {
      const next = new URLSearchParams(old);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== 'carteira_pagina') next.delete('carteira_pagina');
      return next;
    }, { replace: key === 'carteira_busca' });
  }

  function changeColumns(order, hiddenKeys) {
    setParams((old) => {
      const next = new URLSearchParams(old);
      next.set('carteira_ordem', order.join(','));
      next.set('carteira_ocultas', hiddenKeys.join(','));
      return next;
    }, { replace: true });
  }

  function moveColumn(index, direction) {
    const next = [...orderedKeys];
    const target = index + direction;
    [next[index], next[target]] = [next[target], next[index]];
    changeColumns(next, hidden);
  }

  return <div className="gia-stack gia-portfolio">
    <div className="gia-portfolio-controls">
      <div className="gia-list-toolbar">
        <div className="gia-period-switch" aria-label="Janela dos resumos salvos">
          {['7', '14', '30'].map((value) => <button key={value} type="button" aria-pressed={days === value} onClick={() => change('carteira_dias', value)}>{value} dias</button>)}
        </div>
        <label className="gia-table-search"><Search aria-hidden="true" /><input type="search" aria-label="Buscar cliente ou conta" placeholder="Buscar cliente ou conta" value={search} onChange={(event) => change('carteira_busca', event.target.value)} /></label>
        <div className="gia-pills" aria-label="Filtrar carteira">
          {filters.map(([key, label, matches]) => <button key={key} type="button" aria-pressed={filter[0] === key} onClick={() => change('carteira_filtro', key)}>{label}<span>{rows.filter(matches).length}</span></button>)}
        </div>
      </div>
      <div className="gia-portfolio-tools">
        <span className="gia-caption">Resumos salvos · {periodLabel(range)}</span>
        {view('responsavel') && <button type="button" className="gia-compare" role="switch" aria-checked={groupByManager} onClick={() => change('carteira_grupo', groupByManager ? '' : 'gestor')}><i aria-hidden="true" />Agrupar por gestor</button>}
        <details className="gia-column-picker"><summary><SlidersHorizontal aria-hidden="true" />Colunas{hidden.length > 0 ? ` −${hidden.length}` : ''}</summary>
          <fieldset className="gia-ordered-columns"><legend className="sr-only">Colunas da carteira</legend>
            {orderedKeys.map((key, index) => <div key={key}>
              <label><input type="checkbox" checked={!hidden.includes(key)} onChange={(event) => changeColumns(orderedKeys, event.target.checked ? hidden.filter((item) => item !== key) : [...hidden, key])} />{columnLabels[key]}</label>
              <button className="gia-icon-button" type="button" disabled={index === 0} onClick={() => moveColumn(index, -1)} aria-label={`Subir ${columnLabels[key]}`}><ChevronUp aria-hidden="true" /></button>
              <button className="gia-icon-button" type="button" disabled={index === orderedKeys.length - 1} onClick={() => moveColumn(index, 1)} aria-label={`Descer ${columnLabels[key]}`}><ChevronDown aria-hidden="true" /></button>
            </div>)}
            <button className="gia-action-link" type="button" onClick={() => changeColumns(columnKeys, defaultHidden)}>Restaurar padrão</button>
          </fieldset>
        </details>
        <Link className="gia-action-link" to={{ pathname: '/gestor-ia/carteira/contas', search: params.toString() }}>Contas de anúncio</Link>
      </div>
    </div>
    <section className="gia-table-frame" aria-label="Carteira de clientes">
      <div className="gia-table-wrap"><table>
        <caption className="sr-only">Clientes da carteira</caption>
        <thead><tr><th scope="col">Cliente</th>{displayedColumns.map((key) => <th key={key} scope="col">{columnLabels[key]}</th>)}<th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
        <tbody>{pageRows.map((row, index) => {
          const { client, tasks, goals, limit, mediaGoals } = row;
          const primary = mediaGoals.find((goal) => goal.is_primary);
          const savedGoal = primary && goalRead.data?.[primary.id];
          const progress = primary && goalRead.data && mediaGoalProgress(primary,
            savedGoal?.accountId === primary.account_id ? savedGoal.reading : null, month, mediaGoals);
          const snapshot = view('meta_resumo') ? readClienteMetaResumo(client) : null;
          const savedRange = snapshot?.period;
          const inRange = savedRange?.since >= range.since && savedRange?.until <= range.until && savedRange.since <= savedRange.until;
          const spend = inRange && !snapshot.permError && !snapshot.rateLimited ? metricValue(snapshot, 'spend') : null;
          const objective = view('objetivo_meta') && objectiveLabel(client.objetivo_meta);
          const manager = view('responsavel') ? client.gestorName : '';
          const firstTask = client.tasks?.find(isOpenTrafficTask);
          const accounts = (client.metaAccounts?.length || 0) + (client.googleAccounts?.length || 0);
          const needsAttention = tasks > 0;
          const group = groupLabel(row);
          const groupStart = index === 0 || groupLabel(pageRows[index - 1]) !== group;
          const { resultKey, costKey } = objectiveMetricKeys(client.objetivo_meta);
          const outcome = spend !== null && view('objetivo_meta') && ['mensagens', 'leads', 'compras'].includes(client.objetivo_meta) ? snapshot : null;
          const cells = {
            accounts: <div className="gia-account-badges">{adPlatforms.map(([label, key]) => client[key]?.length > 0 && <span key={key} className="gia-badge">{label} · {client[key].length}</span>)}{!accounts && <span className="gia-caption">{client.metaAccounts === null || client.googleAccounts === null ? 'Indisponível' : 'Sem conta'}</span>}</div>,
            manager: manager ? <span className="gia-manager"><span className="gia-initials" aria-hidden="true">{initials(manager)}</span>{manager}</span> : '—',
            goals: primary ? <GestorIaPortfolioGoal to={clientGoalPage(client, params, primary)} goal={primary} progress={progress} unavailable={!goalRead.data && Boolean(goalRead.error)} />
              : mediaGoals.length > 0 ? <Link className="gia-row-link" to={clientGoalPage(client, params, mediaGoals[0])}>{mediaGoals.length} {mediaGoals.length === 1 ? 'meta ativa' : 'metas ativas'}</Link>
                : goals.length || limit !== null ? <><strong>{goals[0] ? goals[0].label + ' · ' + goals[0].value : 'Limite Meta'}</strong>{limit !== null && <small>{goals.length ? 'Limite · ' : ''}{number(limit, 2)}</small>}</> : '—',
            spend: <><span className="gia-table-value">{formatMetric(spend, CHART_METRICS[0], snapshot?.currency)}</span>{spend !== null ? <small>{periodLabel(savedRange)}</small> : savedRange && !inRange && <small>Fora da janela</small>}</>,
            tasks: needsAttention ? <><strong>{tasks} {tasks === 1 ? 'tarefa em aberto' : 'tarefas em aberto'}</strong>{firstTask?.title && <small className="gia-task-excerpt">{firstTask.title}</small>}</> : tasks === 0 ? 'Nenhuma' : '—',
            result: <>{number(metricValue(outcome, resultKey))}{outcome && <small>{objective}</small>}</>,
            cost: formatMetric(metricValue(outcome, costKey), { unit: 'money' }, snapshot?.currency),
          };
          return <Fragment key={client.id}>
            {groupStart && <tr className="gia-portfolio-group"><td colSpan={displayedColumns.length + 2}><strong>{group}</strong><span>{groupCounts.get(group)}</span>{needsAttention && !groupByManager && <span>Tarefas em aberto</span>}</td></tr>}
            <tr>
              <td><Link className="gia-client-name" aria-label={`Abrir cliente ${client.empresa}`} to={clientPage(client.id, params)}>
                <GestorIaClientAvatar client={client} /><span><strong>{client.empresa}</strong><small>{[`${accounts} ${accounts === 1 ? 'conta' : 'contas'}`, objective].filter(Boolean).join(' · ')}</small></span><ChevronRight aria-hidden="true" />
              </Link></td>
              {displayedColumns.map((key) => <td key={key}>{cells[key]}</td>)}
              <td className="gia-row-actions"><GestorIaClientMenu compact label={`Ações de ${client.empresa}`} destination={(tab) => clientPage(client.id, params, tab)} /></td>
            </tr>
          </Fragment>;
        })}
        {!pageRows.length && <tr><td colSpan={displayedColumns.length + 2} className="gia-empty">Nenhum cliente para estes filtros.</td></tr>}
        </tbody>
      </table></div>
      <footer className="gia-table-footer gia-portfolio-footer">
        <div><span><strong>{clients.length}</strong> {clients.length === 1 ? 'cliente' : 'clientes'}</span><span className="gia-attention-text">{attention} em atenção</span><span>{totalTasks} {totalTasks === 1 ? 'tarefa em aberto' : 'tarefas em aberto'}</span><Link to={{ pathname: '/gestor-ia/decisoes', search: decisionParams.toString() }}>Abrir a fila</Link></div>
        <div><span>{visible.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, visible.length)} de {visible.length}</span>
          <button type="button" className="gia-icon-button" aria-label="Página anterior da carteira" disabled={page === 1} onClick={() => change('carteira_pagina', String(page - 1))}><ChevronLeft aria-hidden="true" /></button>
          <span className="gia-table-value">{page} / {pages}</span>
          <button type="button" className="gia-icon-button" aria-label="Próxima página da carteira" disabled={page === pages} onClick={() => change('carteira_pagina', String(page + 1))}><ChevronRight aria-hidden="true" /></button>
        </div>
      </footer>
    </section>
    <div className="gia-portfolio-meta"><span>{groupByManager ? 'Agrupado por gestor' : 'Ordenado por pendências'}</span>{canManageClients && <Link to="/clients">Gerenciar clientes e acessos</Link>}</div>
  </div>;
}
