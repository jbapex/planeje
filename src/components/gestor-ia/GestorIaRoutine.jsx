import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowUpRight, CalendarDays, ChevronRight, RefreshCw, Search, Table2, Users } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { CAMPAIGN_NUMBERS, campaignTotals, currency, displayDate, displayWeek, lastClosedWeek, saoPauloDate, shiftDate } from '@/lib/trafficWeeklyReview';
import { filledSheetRows } from '@/lib/trafficSheetGrid';
import { normalizeRoutineWeek, routineSavedCatalog, routineSavedSpend, routineValidationState } from '@/lib/gestorIaRoutine';
import { TrafficWeeklyReviewEditor } from '@/components/traffic/TrafficWeeklyRoutine';
import { useGestorRead } from './gestorIaReads';
import { loadGestorMetrics } from './gestorIaData';
import { loadRoutineBoard, loadRoutineSummary, loadRoutineWeek } from './gestorIaRoutineData';
import GestorIaClientAvatar from './GestorIaClientAvatar';
import GestorIaRoutineLeads from './GestorIaRoutineLeads';
import './GestorIaRoutine.css';

function RoutineEditor({ board, profile, modules, clientId, weekStart, choose, close, canReadMeta, canReadLeads }) {
  const [record, setRecord] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [inspecting, setInspecting] = useState(null);
  const client = board.clients.find((item) => item.id === clientId);
  useEffect(() => { if (!canReadLeads) setInspecting(null); }, [canReadLeads]);
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    setError('');
    const timeout = setTimeout(() => controller.abort(), 20000);
    loadRoutineWeek(supabase, { board, profile, modules, clientId, weekStart, signal: controller.signal })
      .then((data) => { if (current) { setRecord(data); setError(''); } })
      .catch((reason) => { if (current) setError(reason.message); })
      .finally(() => clearTimeout(timeout));
    return () => { current = false; controller.abort(); clearTimeout(timeout); };
  }, [board, profile, modules, clientId, weekStart, attempt]);

  const source = useMemo(() => {
    const reads = new Map();
    const read = (accountId, period) => {
      if (!canReadMeta) return Promise.reject(new Error('Leitura Meta indisponível para este acesso.'));
      const key = `${accountId}:${period.since}:${period.until}`;
      if (!reads.has(key)) reads.set(key, loadGestorMetrics(supabase, { profile, modules, clientId, accountId, period }).catch((reason) => { reads.delete(key); throw reason; }));
      return reads.get(key);
    };
    const period = { since: weekStart, until: shiftDate(weekStart, 6) };
    return {
      canPullSpend: canReadMeta,
      linkOnRead: false,
      spendLabel: 'Usar gasto salvo',
      caption: 'Dados salvos · preenchimento manual disponível',
      loadCatalog: async (accountId, platform) => platform === 'meta'
        ? routineSavedCatalog(await read(accountId, period))
        : { status: 'ok', campaigns: [], error: '' },
      loadSpend: async (rows, range) => {
        const metaRows = rows.filter((row) => (row.platform || 'meta') === 'meta');
        if (metaRows.some((row) => (row.campaign_name && !row.campaign_id) || (row.adset_name && !row.adset_id))) throw new Error('Escolha campanha e conjunto no catálogo salvo antes de importar o gasto.');
        if (metaRows.some((row) => row.campaign_id && !row.adset_id && CAMPAIGN_NUMBERS.some((key) => String(row[key] ?? '').trim() !== ''))) throw new Error('Há uma campanha sem conjunto com números preenchidos. Mantenha essa linha e adicione os conjuntos em linhas vazias para preservar os valores.');
        const ids = [...new Set(metaRows.filter((row) => row.account_id && (row.campaign_name || row.campaign_id)).map((row) => row.account_id))];
        const indices = await Promise.all(ids.map(async (accountId) => routineSavedSpend(await read(accountId, range), range)));
        // A grade usa IDs globais de conjunto; nenhuma soma por nome de campanhas.
        return { byId: new Map(indices.flatMap((index) => [...index.byId])), byName: new Map(), list: indices.flatMap((index) => index.list) };
      },
    };
  }, [clientId, weekStart, canReadMeta, profile, modules]);

  if (!client) return <p className="gia-notice" role="alert">Cliente indisponível nesta carteira.</p>;
  if (error) return <div className="gia-empty" role="alert"><p>{error}</p><button type="button" className="gia-action-link" onClick={() => setAttempt((value) => value + 1)}>Tentar novamente</button><button type="button" onClick={close}>Voltar aos clientes</button></div>;
  if (!record) return <p className="gia-status" role="status">Abrindo a semana…</p>;
  return <>
    <TrafficWeeklyReviewEditor review={record.review} previous={record.previous} board={board} clients={board.clients}
      onNavigate={(id, week) => choose(id, week)} onClose={close}
      onSaved={(id) => setRecord((current) => ({ ...current, review: { ...current.review, id } }))}
      sheetView={{ source, onInspectLeads: canReadLeads ? (rows, appointmentsOnly, allRows) => setInspecting({ rows, appointmentsOnly, allRows }) : undefined }} />
    {!canReadLeads && <p className="gia-caption">A consulta dos leads requer acesso ao Rastreamento.</p>}
    {record.review.metric_mode === 'client' && <p className="gia-caption">Esta semana foi registrada em resumo. Os dados originais foram preservados.</p>}
    {canReadLeads && inspecting && <GestorIaRoutineLeads client={client} weekStart={weekStart} selection={inspecting} profile={profile} modules={modules} close={() => setInspecting(null)} />}
  </>;
}

export default function GestorIaRoutine({ clients, loading, error: portfolioError, profile, modules, canViewField, readStore }) {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const boardRead = useGestorRead(readStore, `rotina:${clients.map((client) => client.id).join(',')}`, !loading && !portfolioError,
    () => loadRoutineBoard(supabase, { profile, modules, clients }));
  const board = boardRead.data;
  const today = board?.today || saoPauloDate();
  const week = normalizeRoutineWeek(params.get('semana')) || lastClosedWeek(today);
  const clientId = params.get('cliente') || '';
  const summaryKey = `rotina-semana:${week}:${clients.map((client) => client.id).join(',')}`;
  const summaryRead = useGestorRead(readStore, summaryKey, Boolean(board) && !clientId,
    () => loadRoutineSummary(supabase, { profile, modules, clientIds: board.clients.map((client) => client.id), weekStart: week }));
  // A entrada relê o banco para refletir salvamentos feitos também na rotina original.
  useEffect(() => {
    if (board && !clientId) void readStore.run(summaryKey,
      () => loadRoutineSummary(supabase, { profile, modules, clientIds: board.clients.map((client) => client.id), weekStart: week }), true);
  }, [board, clientId, modules, profile, readStore, summaryKey, week]);
  const choose = (id, start = week) => setParams({ ...(id ? { cliente: id } : {}), semana: start });
  const records = summaryRead.data || (board?.reviews || []).filter((review) => review.week_start === week && review.kind !== 'optimization');
  const summaryKnown = Array.isArray(summaryRead.data);
  const clientsWithRecords = new Set(records.filter((record) => filledSheetRows(record.campaign_metrics).length || record.investment != null || record.revision > 0).map((record) => record.client_id));
  const summary = campaignTotals(records.flatMap((review) => filledSheetRows(review.campaign_metrics)));
  const displayed = (board?.clients || []).filter((client) => {
    if (search && !client.empresa.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR'))) return false;
    const state = routineValidationState(records.find((record) => record.client_id === client.id));
    if (status === 'all') return true;
    if (status === 'ai') return state === 'rascunho_ia';
    if (status === 'validated') return state === 'validado';
    return clientsWithRecords.has(client.id) === (status === 'filled');
  });
  return <section className="gia-routine">
    <header className="gia-header"><div className="gia-title"><h1>Rotina semanal</h1>{!clientId && board && <span className="gia-title-count">{board.clients.length}</span>}</div>
      {!clientId && <div className="gia-header-actions"><button className="gia-action-link" type="button" disabled={loading || boardRead.refreshing || summaryRead.refreshing} onClick={() => { void boardRead.reload(); void summaryRead.reload(); }}><RefreshCw size={16} aria-hidden="true" />Atualizar lista</button></div>}
    </header>
    {loading ? <p className="gia-status" role="status">Carregando clientes…</p> : portfolioError ? <p className="gia-notice" role="alert">{portfolioError}</p>
      : !board ? boardRead.error ? <div className="gia-notice" role="alert">Não foi possível carregar a rotina. <button type="button" onClick={() => boardRead.reload()}>Tentar novamente</button></div> : <p className="gia-status" role="status">Carregando rotina…</p>
      : clientId ? <RoutineEditor key={`${clientId}:${week}`} board={board} profile={profile} modules={modules} clientId={clientId} weekStart={week} choose={choose} close={() => choose('')}
        canReadMeta={canViewField?.('meta_resumo') === true} canReadLeads={modules.rastreamento === true} />
      : <>
        <div className="gia-routine-overview"><div><Users aria-hidden="true" /><span>Clientes<strong>{board.clients.length}</strong></span></div><div><Table2 aria-hidden="true" /><span>Com preenchimento<strong>{summaryKnown ? clientsWithRecords.size : '—'}</strong></span></div><div><CalendarDays aria-hidden="true" /><span>Agendamentos informados<strong>{summaryKnown ? summary.appointments ?? '—' : '—'}</strong></span></div><div><ArrowUpRight aria-hidden="true" /><span>Investimento informado<strong>{summaryKnown ? currency(summary.spend) : '—'}</strong></span></div></div>
        <div className="gia-routine-filters"><label className="gia-search"><Search aria-hidden="true" /><input aria-label="Buscar cliente da rotina" placeholder="Buscar cliente" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <label className="gia-filter-select"><CalendarDays aria-hidden="true" /><span className="sr-only">Escolher data da semana</span><input type="date" aria-label="Escolher data da semana" value={week} max={today} onChange={(event) => { const selected = normalizeRoutineWeek(event.target.value); if (selected) choose('', selected); }} /></label>
          <span className="gia-caption">{displayWeek(week)}</span>
          <div className="gia-routine-tabs" aria-label="Situação da planilha">{[['all', 'Todos'], ['empty', 'A preencher'], ['ai', 'Rascunho da IA'], ['filled', 'Preenchidos'], ['validated', 'Validados']].map(([key, label]) => <button type="button" key={key} aria-pressed={status === key} onClick={() => setStatus(key)}>{label}</button>)}</div>
        </div>
        {boardRead.error && <p className="gia-notice" role="status">Não foi possível atualizar. Exibindo a consulta anterior.</p>}
        {summaryRead.error && <p className="gia-notice" role="alert">Não foi possível consultar o preenchimento desta semana. Tente atualizar a lista.</p>}
        <div className="gia-routine-clients"><table><thead><tr><th scope="col">Cliente</th>{canViewField?.('responsavel') === true && <th scope="col">Gestor</th>}<th scope="col">Planilha da semana</th><th scope="col">Investimento</th><th scope="col">Agendamentos</th><th scope="col"><span className="sr-only">Abrir</span></th></tr></thead><tbody>
          {displayed.map((client) => { const record = records.find((item) => item.client_id === client.id); const total = campaignTotals(filledSheetRows(record?.campaign_metrics));
            const state = routineValidationState(record);
            const label = { a_preencher: 'A preencher', rascunho_ia: 'Rascunho da IA', em_revisao: 'Em revisão', validado: 'Validado' }[state];
            return <tr key={client.id}><td><button type="button" className="gia-routine-client" onClick={() => choose(client.id)}><GestorIaClientAvatar client={client} /><span>{client.empresa}<small>{client.accounts.length} conta(s)</small></span></button></td>{canViewField?.('responsavel') === true && <td>{client.manager_name || client.gestorName || 'Não informado'}</td>}<td><span className={`gia-routine-state${state === 'rascunho_ia' ? ' is-ai' : summaryKnown && clientsWithRecords.has(client.id) ? ' is-filled' : ''}`}>{!summaryKnown ? summaryRead.error ? 'Indisponível' : 'Consultando…' : label}</span></td><td>{summaryKnown ? currency(record?.metric_mode === 'client' ? record.investment : total.spend) : '—'}</td><td>{summaryKnown ? total.appointments ?? '—' : '—'}</td><td><button type="button" className="gia-icon-button" aria-label={`Abrir semana de ${client.empresa}`} onClick={() => choose(client.id)}><ChevronRight aria-hidden="true" /></button></td></tr>;
          })}
        </tbody></table>{!displayed.length && <div className="gia-empty"><p>{board.clients.length ? 'Nenhum cliente neste filtro.' : 'Nenhum cliente disponível na sua carteira.'}</p></div>}</div>
        <p className="gia-caption gia-routine-note">Semana de {displayDate(week)} · segunda a domingo</p>
      </>}
  </section>;
}
