import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ArrowRight, MessageCircle, MoreHorizontal, Plus, RefreshCw, Search, Sparkles } from 'lucide-react';
import { buildConversasUrl } from '@/lib/conversasRoutes';
import { AUDIENCE_FILTER_GROUPS } from '@/lib/atendimentoAudienceFilter';
import { csGroupScope } from '@/lib/csIaGroupNavigation';
import { loadCsGroupInventory } from '@/lib/csIaGroupInventory';
import { buildClientEditUrl } from '@/lib/clientHubRoutes';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import GestorIaPortfolioGoal from '@/components/gestor-ia/GestorIaPortfolioGoal';
import { canSeeCampaignGoals, loadGestorPageCampaignGoals } from '@/components/gestor-ia/gestorIaData';
import { goalMonthPeriod, mediaGoalProgress } from '@/components/gestor-ia/gestorIaMediaGoalModel';
import { createGestorReads, useGestorRead } from '@/components/gestor-ia/gestorIaReads';
import { useGestorGoalReadings } from '@/components/gestor-ia/useGestorGoalReadings';
import CsIaGroupMembers from './CsIaGroupMembers';
import CsIaGroupBinding from './CsIaGroupBinding';
import CsIaGroupInventory from './CsIaGroupInventory';
import CsIaGroupRename from './CsIaGroupRename';
import CsIaGroupRegistration from './CsIaGroupRegistration';
import { loadCsSegments } from './csIaData';
import { csSignalRules, dateTime, filterPortfolio, groupLabel, groupStatus, GROUP_STATUS, HEALTH, ownerLabel, portfolioSegmentOptions, primaryCsSignal, priorityRows, SIGNAL, visibleCsSignals } from './csIaPresentation';

const clientHref = (row) => `/cs-ia/clientes/${encodeURIComponent(row.client_id)}`;

export function linkedGroupUrl(row) {
  const csGroup = csGroupScope(row);
  return csGroup && buildConversasUrl({ audienceFilter: AUDIENCE_FILTER_GROUPS, csGroup });
}

export function CsHealth({ health }) {
  return <span className="cs-health" data-health={health}>{HEALTH[health] || HEALTH.sem_leitura}</span>;
}

export function Header({ title, text, children }) {
  return <header className="gia-header cs-header">
    <div><p className="gia-eyebrow">CS IA · Squad</p><h1>{title}</h1><p className="cs-subtitle">{text}</p></div>
    {children && <div className="cs-actions">{children}</div>}
  </header>;
}

export function SearchField({ label, value, onChange }) {
  return <label className="gia-table-search cs-search">
    <Search aria-hidden="true" /><input type="search" aria-label={label} placeholder={label} value={value} onChange={(event) => onChange(event.target.value)} />
  </label>;
}

export function Filter({ label, options, value, onChange }) {
  return <label className="cs-filter"><span>{label}</span>
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
    </select>
  </label>;
}

function ClientLink({ row, state }) {
  const initials = row.client_name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
  return <Link className="gia-client-name" to={clientHref(row)} state={state}>
    <span className="cs-initials" aria-hidden="true">{initials}</span>
    <span><strong>{row.client_name}</strong>{row.segment && <small className="gia-caption cs-client-segment">{row.segment}</small>}</span>
  </Link>;
}

function PortfolioActions({ row, state }) {
  const to = clientHref(row);
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><button className="gia-icon-button gia-menu-trigger" type="button" aria-label={`Ações de ${row.client_name}`}>
      <MoreHorizontal aria-hidden="true" />
    </button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="gia-context-menu">
      <DropdownMenuItem asChild><Link to={to} state={state}>Abrir ficha de CS</Link></DropdownMenuItem>
      <DropdownMenuItem asChild><Link to={buildClientEditUrl(encodeURIComponent(row.client_id))} state={{ backOnClose: true }}>Editar cadastro</Link></DropdownMenuItem>
      <DropdownMenuItem asChild><Link to={to} state={{ ...state, csClientAction: 'assessment' }}>Editar avaliação</Link></DropdownMenuItem>
      <DropdownMenuItem asChild><Link to={to} state={{ ...state, csClientAction: 'close' }}>Encerrar acompanhamento</Link></DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
const queueDraftActions = {
  resposta_pendente: 'approach', pedido_sem_solucao: 'approach', reclamacao: 'approach', saida_participante: 'approach', retorno_cliente: 'approach',
  critico: 'meeting', cancelamento: 'meeting', inatividade: 'meeting', queda: 'meeting', atencao: 'meeting',
};
export function CsIaToday({ rows, settings, settingsError, onReload, refreshing, onOpenAtlas }) {
  const [search, setSearch] = useState('');
  const [signal, setSignal] = useState('');
  const [priority, setPriority] = useState('');
  const rules = csSignalRules(settings);
  const pending = priorityRows(rows, { search, signal, priority, rules });
  const activity = rows.filter((row) => row.group_status === 'linked' && row.last_activity_at)
    .sort((a, b) => Date.parse(b.last_activity_at) - Date.parse(a.last_activity_at)).slice(0, 5);
  const healthCounts = new Map();
  for (const row of rows) healthCounts.set(row.health, (healthCounts.get(row.health) || 0) + 1);
  return <div className="gia-stack cs-section">
    <Header title="Hoje" text="Veja quais clientes precisam de atenção e o motivo.">
      {onOpenAtlas && <button type="button" className="gia-action-link gia-primary-action" onClick={() => onOpenAtlas('triage')}><Sparkles aria-hidden="true" />Perguntar ao CS IA</button>}
      <Link to="/cs-ia/carteira" className="gia-action-link">Ver carteira <ArrowRight aria-hidden="true" /></Link>
      <button type="button" className="gia-action-link" disabled={refreshing} onClick={onReload}><RefreshCw aria-hidden="true" />{refreshing ? 'Atualizando…' : 'Atualizar dados'}</button>
    </Header>
    <div className="cs-today-grid">
      <section className="gia-panel cs-queue" aria-labelledby="cs-queue-title">
        <div className="gia-section-heading"><h2 id="cs-queue-title">Espera você</h2><span className="gia-caption" role="status">{pending.length} {pending.length === 1 ? 'cliente' : 'clientes'}</span></div>
        <details className="cs-help"><summary>Como priorizamos</summary><p>Casos críticos aparecem primeiro, seguidos de respostas pendentes, inatividade e outros acompanhamentos. Em cada grupo, a menor nota vem primeiro. O filtro inclui sinais simultâneos e conserva essa ordem.</p></details>
        {settingsError && <p role="status" className="gia-caption">Os limites de queda e inatividade estão indisponíveis. A fila mostra os sinais já registrados.</p>}
        <div className="gia-filters cs-filters">
          <SearchField label="Buscar cliente, grupo ou responsável" value={search} onChange={setSearch} />
          <Filter label="Sinal" value={signal} onChange={setSignal} options={[[ '', 'Todos os sinais' ], ...Object.entries(SIGNAL).filter(([key]) => key !== 'em_dia')]} />
          <Filter label="Prioridade" value={priority} onChange={setPriority} options={[[ '', 'Todas as prioridades' ], ['critical', 'Críticos'], ['other', 'Demais acompanhamentos']]} />
        </div>
        {pending.length ? <ul className="cs-queue-list">
          {pending.map((row) => {
            const group = linkedGroupUrl(row);
            const primarySignal = primaryCsSignal(row);
            const additional = visibleCsSignals(row, rules).filter(key => key !== (signal || primarySignal));
            const purpose = Object.hasOwn(queueDraftActions, primarySignal) ? queueDraftActions[primarySignal] : null;
            const action = purpose === 'approach' ? 'Preparar abordagem' : 'Preparar reunião';
            return <li key={row.client_id} className="cs-queue-row">
              <div className="cs-row-identity"><ClientLink row={row} /><span className="gia-caption">{ownerLabel(row)}</span>
                {onOpenAtlas && purpose && <button type="button" className="gia-action-link cs-queue-action" aria-label={`${action} para ${row.client_name}`}
                  onClick={() => onOpenAtlas(purpose, undefined, row.client_id)}>{action}</button>}
              </div>
              <div className="cs-signal"><strong>{SIGNAL[signal || primarySignal]}</strong>
                {additional.length > 0 && <span className="gia-caption">Outros sinais · {additional.map(key => SIGNAL[key]).join(' · ')}</span>}
                {row.group_status === 'linked' && row.awaiting_since && <span className="gia-caption">Cliente aguarda a equipe desde {dateTime(row.awaiting_since)}</span>}
                {row.group_status === 'linked' && row.group_departure_at && <span className="gia-caption">Saída registrada em {dateTime(row.group_departure_at)}</span>}</div>
              <CsHealth health={row.health} />
              {group && <Link className="gia-icon-button" to={group} title="Abrir grupo no Atendimento" aria-label={`Abrir grupo no Atendimento para ${row.client_name}`}><MessageCircle aria-hidden="true" /></Link>}
            </li>;
          })}
        </ul> : <p className="gia-empty">{search || signal || priority ? 'Nenhum cliente nestes filtros.' : 'Nenhum acompanhamento pendente na carteira disponível.'}</p>}
      </section>
      <aside className="gia-stack">
        <section className="gia-panel" aria-label="Saúde da carteira">
          <div className="gia-section-heading"><h2>Saúde da carteira</h2><span className="gia-caption">{rows.length} {rows.length === 1 ? 'cliente' : 'clientes'}</span></div>
          <ul className="cs-summary">
            {Object.keys(HEALTH).map((health) => <li key={health}><CsHealth health={health} /><strong>{healthCounts.get(health) || 0}</strong></li>)}
          </ul>
        </section>
        <section className="gia-panel" aria-label="Atividade recente">
          <div className="gia-section-heading"><h2>Atividade recente</h2></div>
          {activity.length ? <ul className="cs-summary cs-activity">
            {activity.map((row) => <li key={row.client_id}><Link className="gia-row-link" to={clientHref(row)}>{row.client_name}</Link><time className="gia-caption" dateTime={row.last_activity_at}>{dateTime(row.last_activity_at)}</time></li>)}
          </ul> : <p className="gia-caption">Nenhuma atividade disponível nos grupos vinculados.</p>}
        </section>
      </aside>
    </div>
  </div>;
}

const sortable = ['client_name', 'health', 'score', 'owner_name'];
const pageSize = 10;
export function CsIaPortfolio({ rows, canManage, modules }) {
  const { profile, canViewField } = useAuth();
  const { search } = useLocation();
  const portfolioState = { csPortfolioSearch: search };
  const [params, setParams] = useSearchParams();
  const showGoals = canSeeCampaignGoals(profile, modules, canViewField);
  const canReadSegments = canViewField?.('nicho') === true;
  const readStore = useMemo(createGestorReads, [profile?.id, showGoals, canReadSegments]);
  const segmentRead = useGestorRead(readStore, 'segmentos', canReadSegments && rows.length > 0, () => loadCsSegments(supabase));
  const segments = canReadSegments && !segmentRead.error && !segmentRead.refreshing
    ? new Map(segmentRead.data?.map(({ client_id, segment }) => [client_id, segment])) : new Map();
  const portfolioRows = segments.size ? rows.map(row => ({ ...row, segment: segments.get(row.client_id) })) : rows;
  const showSegments = portfolioRows.some(row => row.segment !== undefined);
  const requestedSegment = canReadSegments ? params.get('segmento') || '' : '';
  const waitingForSegments = Boolean(requestedSegment && rows.length > 0 && !segmentRead.error &&
    (segmentRead.data === undefined || segmentRead.refreshing));
  const sortKey = params.get('ordem');
  const filters = { search: params.get('busca') || '', health: params.get('saude') || '', owner: params.get('responsavel') || '',
    group: params.get('vinculo') || '', segment: showSegments ? requestedSegment : '',
    sort: sortable.includes(sortKey) ? sortKey : 'client_name', descending: params.get('direcao') === 'desc' };
  const requestedPage = Math.max(1, Number.parseInt(params.get('pagina'), 10) || 1);
  const owners = [...new Map(rows.filter((row) => row.owner_id && row.owner_name).map((row) => [row.owner_id, row.owner_name]))]
    .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  const visible = waitingForSegments ? [] : filterPortfolio(portfolioRows, filters);
  const pages = Math.max(1, Math.ceil(visible.length / pageSize));
  const page = Math.min(requestedPage, pages);
  const onPage = visible.slice((page - 1) * pageSize, page * pageSize);
  const ids = onPage.map(({ client_id }) => client_id).sort();
  const pageGoals = useGestorRead(readStore, JSON.stringify(['metas', ids]), showGoals && ids.length > 0,
    () => loadGestorPageCampaignGoals(supabase, ids));
  const goals = !pageGoals.error && !pageGoals.refreshing ? pageGoals.data : null;
  const month = goalMonthPeriod();
  const progress = useGestorGoalReadings(readStore, Object.values(goals || {}).flatMap(items =>
    items.filter(goal => goal.is_primary).map(goal => goal.id)), month);

  function filter(key, value) {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== 'pagina') next.delete('pagina');
      return next;
    }, { replace: key === 'busca' });
  }

  function sort(key) {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set('ordem', key);
      if (filters.sort === key && !filters.descending) next.set('direcao', 'desc');
      else next.delete('direcao');
      next.delete('pagina');
      return next;
    });
  }

  function goalCell(row) {
    if (!goals) return pageGoals.error ? 'Consulta indisponível' : 'Consultando…';
    const available = goals[row.client_id];
    if (!available) return 'Acesso indisponível';
    const primary = available.find(goal => goal.is_primary);
    const query = new URLSearchParams({ aba: 'metas', mes_meta: month.since.slice(0, 7) });
    if (primary) query.set('conta', primary.account_id);
    const to = `${clientHref(row)}?${query}`;
    if (!primary) return <Link className="gia-row-link" to={to} state={portfolioState} aria-label={`Metas de ${row.client_name}`}>
      {available.length ? `${available.length} ${available.length === 1 ? 'meta ativa' : 'metas ativas'}` : 'Ver metas'}</Link>;
    const saved = progress.data?.[primary.id];
    const reading = progress.data && mediaGoalProgress(primary, saved?.accountId === primary.account_id ? saved.reading : null, month, available);
    return <GestorIaPortfolioGoal to={to} state={portfolioState} goal={primary} progress={reading} unavailable={Boolean(progress.error)} />;
  }

  const columns = [['client_name', 'Cliente'], ['health', 'Saúde'], ['score', 'Nota'], ['', 'Variação em 7 dias'], ['', 'Sinal'], ['', 'Última atividade'], ['', 'Grupo'], ['owner_name', 'Responsável']];
  if (showGoals) columns.push(['', 'Meta de campanha do mês']);
  if (canManage) columns.push(['', 'Ações']);
  return <div className="gia-stack cs-section">
    <Header title="Carteira" text="Acompanhe a saúde dos clientes e abra a ficha para ver as evidências.">
      <Link className="gia-action-link" to="/cs-ia/encerrados">Contas encerradas</Link>
      {canManage && <Link className="gia-action-link gia-primary-action" to={buildClientEditUrl()} state={portfolioState}>
        <Plus aria-hidden="true" /> Novo cliente
      </Link>}
      {canManage && <Link className="gia-action-link" to="/clients">Gerenciar clientes <ArrowRight aria-hidden="true" /></Link>}
    </Header>
    <div className="gia-filters cs-filters">
      <SearchField label={showSegments ? 'Buscar cliente, grupo, responsável ou segmento' : 'Buscar cliente, grupo ou responsável'}
        value={filters.search} onChange={(value) => filter('busca', value)} />
      <Filter label="Saúde" value={filters.health} onChange={(value) => filter('saude', value)} options={[[ '', 'Todas as faixas' ], ...Object.entries(HEALTH)]} />
      <Filter label="Responsável" value={filters.owner} onChange={(value) => filter('responsavel', value)} options={[[ '', 'Todos os responsáveis' ], ['unassigned', 'Sem responsável'], ...owners]} />
      <Filter label="Vínculo" value={filters.group} onChange={(value) => filter('vinculo', value)} options={[[ '', 'Todos os vínculos' ], ...Object.entries(GROUP_STATUS)]} />
      {showSegments && <Filter label="Segmento" value={filters.segment} onChange={(value) => filter('segmento', value)}
        options={portfolioSegmentOptions(portfolioRows, filters.segment)} />}
      {(filters.search || filters.health || filters.owner || filters.group || filters.segment) && <button type="button" className="gia-action-link" onClick={() => setParams({})}>Limpar filtros</button>}
    </div>
    {segmentRead.error && <div className="cs-actions"><p role="alert" className="gia-caption">{segmentRead.error.message}</p>
      <button type="button" className="gia-action-link" onClick={() => segmentRead.reload()}>Tentar novamente os segmentos</button></div>}
    <div className="gia-panel cs-table-panel">
      <div className="gia-table-wrap" tabIndex={0} role="region" aria-label="Tabela da carteira">
        <table className="cs-table"><caption className="sr-only">Carteira de clientes de CS</caption><thead><tr>
          {columns.map(([key, label]) => <th key={label} scope="col" aria-sort={key === filters.sort ? filters.descending ? 'descending' : 'ascending' : undefined}>
            {key ? <button className="cs-sort" type="button" onClick={() => sort(key)}>{label}{key === filters.sort ? filters.descending ? ' ↓' : ' ↑' : ''}</button> : label}
          </th>)}
        </tr></thead><tbody>
          {onPage.map((row) => <tr key={row.client_id}>
            <td><ClientLink row={row} state={portfolioState} /></td><td><CsHealth health={row.health} /></td><td>{row.score ?? '—'}</td>
            <td>{row.score_delta == null ? '—' : `${row.score_delta > 0 ? '+' : ''}${row.score_delta} pts`}</td><td>{SIGNAL[primaryCsSignal(row)] || '—'}</td>
            <td>{dateTime(row.group_status === 'linked' ? row.last_activity_at : null)}</td><td>{groupLabel(row)}</td><td>{ownerLabel(row)}</td>
            {showGoals && <td>{goalCell(row)}</td>}
            {canManage && <td><PortfolioActions row={row} state={portfolioState} /></td>}
          </tr>)}
          {!onPage.length && <tr><td colSpan={columns.length} className="gia-empty">
            {waitingForSegments ? 'Consultando segmentos…' : 'Nenhum cliente corresponde aos filtros.'}
          </td></tr>}
        </tbody></table>
      </div>
      <footer className="cs-pagination">
        <span className="gia-caption" role="status">{visible.length} de {rows.length} {rows.length === 1 ? 'cliente' : 'clientes'}</span>
        <div className="cs-actions">
          <button type="button" className="gia-action-link" disabled={page <= 1} onClick={() => filter('pagina', page - 1)}>Anterior</button>
          <span className="gia-caption">Página {page} de {pages}</span>
          <button type="button" className="gia-action-link" disabled={page >= pages} onClick={() => filter('pagina', page + 1)}>Próxima</button>
        </div>
      </footer>
      {(pageGoals.error || progress.error) && <button type="button" className="gia-action-link" onClick={() => {
        if (pageGoals.error) void pageGoals.reload();
        else void progress.reload();
      }}>Tentar novamente a leitura de metas</button>}
    </div>
  </div>;
}

export function CsIaGroups({ rows, canManage, onReload, readStore }) {
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('');
  const [registrationNotice, setRegistrationNotice] = useState('');
  const showClients = !['inventory', 'archived'].includes(group);
  const showInventory = canManage && (!group || !showClients);
  const mode = group === 'archived' ? 'archived' : 'unlinked';
  const inventoryKey = `inventario-grupos:${mode}`;
  const readInventory = useCallback(() => loadCsGroupInventory(supabase, mode), [mode]);
  const inventory = useGestorRead(readStore, inventoryKey, showInventory, readInventory);
  useEffect(() => {
    if (!showInventory) return;
    const refresh = () => { void readStore.run(inventoryKey, readInventory, true); };
    const whenVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    refresh();
    document.addEventListener('visibilitychange', whenVisible);
    return () => document.removeEventListener('visibilitychange', whenVisible);
  }, [inventoryKey, readInventory, readStore, showInventory]);
  const visible = filterPortfolio(rows, { search, group });
  const filters = [[ '', 'Todos os vínculos' ], ['linked', 'Vinculados'], ['unlinked', 'Clientes sem grupo'], ['unavailable', 'Vínculo indisponível']];
  if (canManage) filters.push(['inventory', 'Grupos sem vínculo'], ['archived', 'Arquivados']);
  async function refreshGroups() {
    // Uma leitura iniciada antes da gravação pode devolver o vínculo ou o nome anterior.
    await Promise.all([readStore.get('radar').request, readStore.get(inventoryKey).request]);
    await Promise.all([onReload(), inventory.reload()]);
  }
  function registrationSaved({ created }) {
    setRegistrationNotice(created ? 'Grupo registrado. Ele já pode ser vinculado a um cliente.' : 'Este grupo já está registrado no canal.');
    if (created) {
      setGroup('inventory');
      setSearch('');
    }
    void refreshGroups();
  }

  return <div className="gia-stack cs-section">
    <Header title="Grupos" text="Consulte os vínculos da carteira com as conversas autorizadas do Atendimento.">
      <Link className="gia-action-link" to="/conversas/canais">Ver canais <ArrowRight aria-hidden="true" /></Link>
      {canManage && <button type="button" className="gia-action-link" onClick={refreshGroups}>Atualizar grupos</button>}
      {canManage && <CsIaGroupRegistration store={readStore} onSaved={registrationSaved} />}
    </Header>
    {registrationNotice && <p className="cs-success" role="status">{registrationNotice}</p>}
    <div className="gia-filters cs-filters">
      <SearchField label={showClients ? 'Buscar grupo ou cliente' : 'Buscar grupo ou canal'} value={search} onChange={setSearch} />
      <Filter label="Vínculo" value={group} onChange={setGroup} options={filters} />
    </div>
    {showClients && <section className="gia-stack" aria-label="Clientes da carteira"><h2>Clientes da carteira</h2>
    {visible.length ? <ul className="cs-card-grid">
      {visible.map((row) => {
        const url = linkedGroupUrl(row);
        return <li key={row.client_id} className="gia-panel cs-card">
          <p className="gia-caption">{groupStatus(row)}</p>
          <h2>{row.group_status === 'linked' ? groupLabel(row) : row.client_name}</h2>
          <p className="gia-caption">{row.group_status === 'linked' ? row.client_name : row.group_status === 'unavailable' ? 'O grupo vinculado não está disponível para esta sessão.' : 'Nenhum grupo vinculado para este cliente.'}</p>
          {url && <p>Última atividade · {dateTime(row.last_activity_at)}</p>}
          <div className="cs-actions">
            <CsIaGroupMembers key={JSON.stringify([row.conversation_id, row.wa_client_id, row.channel_id, row.group_jid])} row={row} canManage={canManage} />
            {url && <Link className="gia-action-link" to={url}><MessageCircle aria-hidden="true" /> Abrir grupo no Atendimento</Link>}
            {canManage && url && <CsIaGroupRename key={`nome:${JSON.stringify([row.conversation_id, row.wa_client_id, row.channel_id, row.group_jid])}`}
              source={{ id: row.conversation_id, wa_cliente_id: row.wa_client_id, whatsapp_config_id: row.channel_id, chat_jid: row.group_jid }}
              displayName={`${groupLabel(row)} · ${row.client_name}`} onSaved={refreshGroups} />}
            {canManage && <CsIaGroupBinding row={row} onSaved={refreshGroups} />}
            <Link className="gia-row-link" to={clientHref(row)}>Ficha de CS</Link>
          </div>
        </li>;
      })}
    </ul> : <p className="gia-empty">Nenhum grupo ou cliente corresponde aos filtros.</p>}</section>}
    {showInventory && <CsIaGroupInventory mode={mode} inventory={inventory} search={search} rows={rows} onSaved={refreshGroups} store={readStore} />}
  </div>;
}
