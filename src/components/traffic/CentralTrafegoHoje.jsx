import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronRight, ExternalLink, LayoutGrid, List, Loader2, Plus, RefreshCw, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCentralTrafegoHoje } from '@/hooks/useCentralTrafegoHoje';
import TrafficPendingConversations from '@/components/traffic/TrafficPendingConversations';
import { useCentralTrafegoCheckup } from '@/hooks/useCentralTrafegoCheckup';
import { useTrafegoHojeMeta } from '@/hooks/useTrafegoHojeMeta';
import CentralTrafegoCheckup from '@/components/traffic/CentralTrafegoCheckup';
import CentralTrafegoDemandaForm from '@/components/traffic/CentralTrafegoDemandaForm';
import CentralTrafegoConcluirDialog from '@/components/traffic/CentralTrafegoConcluirDialog';
import { priorityLabel } from '@/lib/centralTrafego';
import { painelHref } from '@/lib/trafegoPainelHref';
import {
  formatHojeHeadline,
  formatHojeRange,
  formatHojeSpend,
  hojeBriefStats,
  mergeHojeBriefs,
} from '@/lib/trafegoHoje';
import { briefingLook, unreviewedCheckupRows } from '@/lib/centralTrafegoCheckup';
import { buildFazerAgoraQueue } from '@/lib/trafegoFazerAgora';
import { nextActionForAccount } from '@/lib/trafegoProximaAcao';
import {
  buildDnaAlerts,
  readDismissedAlerts,
  writeDismissedAlerts,
} from '@/lib/trafegoAlertasDna';
import { formatCacheAge } from '@/lib/trafegoHojeCache';
import {
  buildCrmRoutineUrl,
  buildRotinaQueue,
  buildUpcomingWeeklyCards,
  buildWeeklyRoutineCards,
  partitionHojeBoard,
  readHojeViewMode,
  waitingRowsFromBuckets,
  withoutWeeklyRoutineDemands,
  writeHojeViewMode,
  ymdInSaoPaulo,
} from '@/lib/trafegoRotina';
import CentralTrafegoHojeBoard from '@/components/traffic/CentralTrafegoHojeBoard';
import './CentralTrafego.css';

const HOJE_SECTIONS = [
  { key: 'urgente', title: 'Urgente', description: 'Alertas críticos e demandas de prioridade alta.' },
  { key: 'atrasado', title: 'Atrasado', description: 'Tarefas com prazo vencido.' },
  { key: 'venceHoje', title: 'Vence hoje', description: 'Tarefas com prazo para hoje.' },
  { key: 'aFazer', title: 'A fazer', description: 'Avisos, prazos futuros e tarefas sem prazo.' },
  { key: 'aguardando', title: 'Aguardando cliente', description: 'Demandas que dependem do cliente.' },
];

function DemandCard({ item, row, overdue, onComplete, painelPeriod }) {
  const demand = item?.demand || row;
  if (!demand) return null;
  const isOverdue = item?.overdue ?? overdue;
  const action = item?.action;
  const clientId = item?.clientId || demand.client_id;
  const prio = priorityLabel(demand.priority);
  const reason =
    item?.reason ||
    `Prazo ${demand.due_date || 'sem data'}${demand.campaigns?.length ? ` · ${demand.campaigns.length} campanha(s)` : ''}`;
  return (
    <li className={`hoje-queue-card is-demand${isOverdue ? ' is-overdue' : ''}`}>
      <div className="hoje-queue-main">
        <div className="hoje-queue-top">
          <span className="hoje-queue-badge is-demand">Demanda</span>
          {action?.title ? (
            <span className={`hoje-queue-badge${action.tone === 'issue' ? ' is-urgent' : ' is-meta'}`}>
              {action.title}
            </span>
          ) : null}
          {prio ? <span className="hoje-queue-meta">{prio}</span> : null}
        </div>
        <h3 className="hoje-queue-title">{demand.title}</h3>
        <p className="hoje-queue-sub">{demand.client_empresa || 'Cliente'}</p>
        <p className="hoje-queue-detail">{reason}</p>
      </div>
      <div className="hoje-queue-actions">
        {action?.code && clientId && painelPeriod ? (
          <Link className="hoje-queue-link" to={painelHref(clientId, { period: painelPeriod, actionCode: action.code })}>
            Painel
          </Link>
        ) : null}
        <Button size="sm" variant="outline" onClick={() => onComplete(demand)}>
          <Check className="h-4 w-4 mr-1" />
          Concluir
        </Button>
      </div>
    </li>
  );
}

function UpcomingRoutineCard({ item }) {
  return (
    <li className="hoje-queue-card is-upcoming">
      <div className="hoje-queue-main">
        <div className="hoje-queue-top">
          <span className="hoje-queue-badge is-upcoming">Próxima</span>
        </div>
        <h3 className="hoje-queue-title">{item.title}</h3>
        <p className="hoje-queue-detail">
          {item.routineKind === 'optimization' ? 'Otimização' : 'Análise da semana'} · {item.reason}
        </p>
      </div>
      <div className="hoje-queue-actions">
        <Link className="hoje-queue-link" to={item.href || '/paid-traffic/rotina'}>
          Rotina
        </Link>
      </div>
    </li>
  );
}

function RoutineCard({ item, onComplete }) {
  const isWeekly = item.kind === 'weekly';
  const isReport = item.routineKind === 'report';
  const isOptimization = item.routineKind === 'optimization';
  const badge = isWeekly
    ? isOptimization
      ? 'Otimização'
      : 'Análise da semana'
    : isReport
      ? 'Relatório'
      : 'CRM semanal';
  return (
    <li className={`hoje-queue-card is-rotina${item.overdue ? ' is-overdue' : ''}`}>
      <div className="hoje-queue-main">
        <div className="hoje-queue-top">
          <span className="hoje-queue-badge is-rotina">{badge}</span>
        </div>
        <h3 className="hoje-queue-title">{item.title}</h3>
        <p className="hoje-queue-detail">
          {item.reason}
          {isWeekly
            ? ' · Fica aqui até concluir'
            : isReport
              ? ' · PDF no Canva → anexar ao concluir'
              : ' · Preencher comprou/não comprou'}
        </p>
      </div>
      <div className="hoje-queue-actions">
        {isWeekly ? (
          <Link className="hoje-queue-link" to={item.href}>
            {isOptimization ? 'Conferir campanhas' : 'Abrir análise'}
          </Link>
        ) : null}
        {!isWeekly && !isReport ? (
          <Link
            className="hoje-queue-link"
            to={buildCrmRoutineUrl(item.clientId, ymdInSaoPaulo())}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink className="h-3.5 w-3.5 inline mr-1" />
            Abrir CRM
          </Link>
        ) : null}
        {!isWeekly ? (
          <Button size="sm" variant="outline" onClick={() => onComplete(item.demand)}>
            <Check className="h-4 w-4 mr-1" />
            Concluir
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function ActionCard({ item, painelPeriod, onCreateDemand }) {
  const toneClass = item.tone === 'warn' ? ' is-warn' : item.tone === 'issue' ? ' is-overdue' : '';
  return (
    <li className={`hoje-queue-card is-meta${toneClass}`}>
      <div className="hoje-queue-main">
        <div className="hoje-queue-top">
          <span className={`hoje-queue-badge${item.tone === 'issue' ? ' is-urgent' : ' is-meta'}`}>
            {item.action?.title || 'Meta'}
          </span>
        </div>
        <h3 className="hoje-queue-title">{item.title}</h3>
        <p className="hoje-queue-detail">{item.reason}</p>
      </div>
      <div className="hoje-queue-actions">
        <Link className="hoje-queue-link" to={painelHref(item.clientId, { period: painelPeriod, actionCode: item.action?.code })}>
          Painel
        </Link>
        {item.action?.demandType ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              onCreateDemand({
                clientId: item.clientId,
                demandType: item.action.demandType,
                title: item.action.demandTitle,
              })
            }
          >
            <Plus className="h-4 w-4 mr-1" />
            Criar demanda
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function deliveryClass(delivery) {
  if (delivery.tone === 'issue') return 'is-issue';
  if (delivery.active) return 'is-active';
  return 'is-paused';
}

function AccountBrief({ brief, period }) {
  const [open, setOpen] = useState(false);
  const setCount = Number(brief.sets || 0);
  const next = nextActionForAccount({ brief });

  return (
    <article className={`hoje-meta-card${brief.alert || next ? ' is-alert' : ''}${open ? ' is-open' : ''}`}>
      <header className="hoje-meta-card-head">
        <button
          type="button"
          className="hoje-meta-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronRight className={`hoje-meta-chevron${open ? ' is-open' : ''}`} />
          <span className="hoje-meta-toggle-copy">
            <span className="hoje-meta-name">{brief.client.empresa}</span>
            <span>
              {brief.delivering
                ? `${brief.delivering} conjunto${brief.delivering === 1 ? '' : 's'} no ar`
                : 'Nada veiculando'}
              {brief.resultLines[0] ? ` · ${brief.resultLines[0]}` : ''}
              {setCount ? ` · ${setCount} conjunto${setCount === 1 ? '' : 's'}` : ''}
            </span>
          </span>
        </button>
        <div className="hoje-meta-head-side">
          <strong>{formatHojeSpend(brief.spend)}</strong>
          <Link
            className="hoje-meta-painel"
            to={painelHref(brief.client.id, { period, actionCode: next?.code })}
            onClick={(e) => e.stopPropagation()}
          >
            Painel
          </Link>
        </div>
      </header>
      {next ? (
        <p className={`hoje-meta-alert is-${next.tone}`}>
          {next.title} — {next.detail || next.action}
        </p>
      ) : brief.alert ? (
        <p className="hoje-meta-alert">{brief.alert}</p>
      ) : null}
      {open ? (
        <ul className="hoje-meta-sets">
          {brief.groups.map((group) => (
            <li key={group.campaignId}>
              <p className="hoje-meta-camp">{group.campaignName}</p>
              {group.rows.map((row) => (
                <div key={row.id} className="hoje-meta-row">
                  <span className="hoje-meta-set-name">{row.name}</span>
                  <span className={`hoje-meta-pill ${row.toggle.on ? 'is-on' : 'is-off'}`}>{row.toggle.label}</span>
                  <span
                    className={`hoje-meta-pill ${deliveryClass(row.delivery)}`}
                    title={row.delivery.detail || row.delivery.label}
                  >
                    {row.delivery.label}
                  </span>
                  <span className="hoje-meta-result">{row.result.line}</span>
                  <span className="hoje-meta-spend">{formatHojeSpend(row.result.spend)}</span>
                </div>
              ))}
            </li>
          ))}
        </ul>
      ) : setCount ? (
        <button type="button" className="hoje-meta-expand" onClick={() => setOpen(true)}>
          Ver conjuntos
        </button>
      ) : null}
    </article>
  );
}

export default function CentralTrafegoHoje() {
  const { loading, error, buckets, clients, campaigns, team, weeklyReviews, weeklyClients, weeklyToday, reload } = useCentralTrafegoHoje();
  const checkup = useCentralTrafegoCheckup();
  const meta = useTrafegoHojeMeta();
  const [createOpen, setCreateOpen] = useState(false);
  const [demandPreset, setDemandPreset] = useState(null);
  const [completeTask, setCompleteTask] = useState(null);
  const [showUpcomingList, setShowUpcomingList] = useState(false);
  const [hojeTab, setHojeTab] = useState('agora');
  const [hojeView, setHojeView] = useState(() => readHojeViewMode());
  const [dismissedDna, setDismissedDna] = useState(() =>
    readDismissedAlerts(meta.periods?.todayYmd)
  );

  useEffect(() => {
    setDismissedDna(readDismissedAlerts(meta.periods?.todayYmd));
  }, [meta.periods?.todayYmd]);

  if (loading && !clients.length && !meta.dayRows.length) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[240px] gap-2 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p>Carregando o Hoje do gestor…</p>
      </div>
    );
  }

  const atrasadas = withoutWeeklyRoutineDemands(buckets.atrasadas || []);
  const vencemHoje = withoutWeeklyRoutineDemands(buckets.vencem_hoje || []);
  const checkupPendingRows = unreviewedCheckupRows(checkup.groups);
  const mergedBriefs = mergeHojeBriefs(meta.dayRows, meta.weekRows);
  const savedReady = !loading;
  const metaPending = meta.loading && !meta.dayRows.length;
  const filaPronta = savedReady || !metaPending;
  const painelPeriod = meta.periods.week || meta.periods.today;
  const agoraQueue = filaPronta
    ? buildFazerAgoraQueue({
        dayRows: mergedBriefs,
        weekRows: [],
        atrasadas,
        vencemHoje,
      })
    : [];
  const rotinaQueue = buildRotinaQueue(buckets.rotina || []);
  const weeklyTodayYmd = weeklyToday || meta.periods?.todayYmd || ymdInSaoPaulo();
  const weeklyCards = buildWeeklyRoutineCards(weeklyReviews, weeklyTodayYmd);
  const upcomingAnalysis = buildUpcomingWeeklyCards(weeklyClients, {
    openReviews: weeklyReviews,
    today: weeklyTodayYmd,
    kind: 'analysis',
  });
  const upcomingOptimization = buildUpcomingWeeklyCards(weeklyClients, {
    openReviews: weeklyReviews,
    today: weeklyTodayYmd,
    kind: 'optimization',
  });
  const upcomingCards = [...upcomingAnalysis, ...upcomingOptimization];
  const boardColumns = partitionHojeBoard({
    agoraQueue,
    rotinaQueue,
    weeklyCards,
    waitingRows: waitingRowsFromBuckets(buckets),
    today: weeklyTodayYmd,
  });
  const hojeCount = HOJE_SECTIONS.reduce((total, section) => total + boardColumns[section.key].length, 0);
  const allDnaAlerts = filaPronta
    ? buildDnaAlerts(mergedBriefs, { dismissedIds: dismissedDna })
    : [];
  const dnaAlerts = allDnaAlerts.filter((alert) => {
    const already = agoraQueue.some(
      (item) =>
        item.clientId === alert.clientId &&
        (item.action?.code === alert.code || item.action?.code === alert.action?.code)
    );
    return !already;
  });
  const dnaAlreadyInAgora = allDnaAlerts.length - dnaAlerts.length;
  const dismissDna = (id) => {
    const next = [...new Set([...dismissedDna, id])];
    setDismissedDna(next);
    writeDismissedAlerts(meta.periods.todayYmd, next);
  };
  const openCreateDemand = (preset = null) => {
    setDemandPreset(preset);
    setCreateOpen(true);
  };
  const dayStats = hojeBriefStats(meta.dayRows);
  const weekStats = hojeBriefStats(meta.weekRows);
  const headline = formatHojeHeadline(meta.periods.todayYmd);
  const showWeekTab = Boolean(meta.periods.showWeekTab);
  const activeTab = showWeekTab || hojeTab !== 'semana' ? hojeTab : 'dia';
  const checkupPending = Number(checkup.summary?.unreviewed || 0);
  const checkupAlerts = checkupPendingRows.filter((row) =>
    briefingLook(row, mergedBriefs.find((brief) => brief.client?.id === row.client_id), {
      metaLoading: meta.loading,
      weekLoading: meta.weekLoading,
    }).tone === 'alert'
  ).length;
  const tabs = [
    {
      id: 'agora',
      label: 'Fazer agora',
      count: hojeCount,
      tone: boardColumns.urgente.length ? 'is-urgent' : boardColumns.atrasado.length || boardColumns.venceHoje.length ? 'is-warn' : '',
    },
    { id: 'dia', label: 'Tráfego do dia', count: dayStats.alertas, tone: dayStats.alertas ? 'is-warn' : '' },
    showWeekTab
      ? { id: 'semana', label: 'Últimos 7 dias', count: weekStats.alertas, tone: weekStats.alertas ? 'is-warn' : '' }
      : null,
    {
      id: 'checkup',
      label: 'Check-up',
      count: checkupAlerts || checkupPending,
      tone: checkupAlerts ? 'is-warn' : '',
    },
  ].filter(Boolean);

  const refreshAll = () => {
    reload();
    checkup.reload();
    meta.reload();
  };

  const metaAge =
    meta.fetchedAt && !meta.loading && !meta.weekLoading ? formatCacheAge(meta.fetchedAt) : '';

  return (
    <div className={`central-trafego${hojeView === 'board' && activeTab === 'agora' && filaPronta ? ' is-board' : ''}`}>
      <div className="central-trafego-toolbar">
        <p className="central-trafego-toolbar-copy">
          {headline}
          {metaAge ? <span className="hoje-cache-age"> · Meta {metaAge}</span> : null}
          {meta.loading && meta.dayRows.length ? <span className="hoje-cache-age"> · atualizando</span> : null}
        </p>
        <div className="central-trafego-toolbar-actions">
          <TrafficPendingConversations />
          {activeTab === 'agora' ? (
            <div className="hoje-view-toggle" role="group" aria-label="Visualização">
              <Button
                size="sm"
                variant={hojeView === 'list' ? 'secondary' : 'ghost'}
                onClick={() => {
                  setHojeView('list');
                  writeHojeViewMode('list');
                }}
              >
                <List className="h-4 w-4 mr-1" />
                Lista
              </Button>
              <Button
                size="sm"
                variant={hojeView === 'board' ? 'secondary' : 'ghost'}
                onClick={() => {
                  setHojeView('board');
                  writeHojeViewMode('board');
                }}
              >
                <LayoutGrid className="h-4 w-4 mr-1" />
                Quadro
              </Button>
            </div>
          ) : null}
          <Button
            size="sm"
            onClick={() => openCreateDemand()}
          >
            <Plus className="h-4 w-4 mr-1" />
            Criar demanda
          </Button>
          <Button size="sm" variant="secondary" onClick={refreshAll} disabled={meta.loading || meta.weekLoading}>
            {meta.loading || meta.weekLoading ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" />
            )}
            Atualizar
          </Button>
        </div>
      </div>

      {error ? <p className="central-trafego-error">{error}</p> : null}
      {meta.error ? <p className="central-trafego-error">{meta.error}</p> : null}
      {meta.limitWarning ? <p className="central-trafego-error">{meta.limitWarning}</p> : null}

      <div className="hoje-tabs" role="tablist" aria-label="Seções de hoje">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`hoje-tab${activeTab === tab.id ? ' is-active' : ''}`}
            onClick={() => setHojeTab(tab.id)}
          >
            {tab.label}
            {tab.count ? <span className={`hoje-tab-count ${tab.tone}`}>{tab.count}</span> : null}
          </button>
        ))}
      </div>

      {activeTab === 'semana' && showWeekTab ? (
        <section className="hoje-block">
          <div className="hoje-block-head">
            <div>
              <p className="central-trafego-kicker">Semana que fechou</p>
              <h2>Últimos 7 dias · {formatHojeRange(meta.periods.week)}</h2>
              <p>Contas recolhidas. Abra só a que quiser ver conjunto a conjunto.</p>
            </div>
          </div>
          <div className="central-trafego-stats">
            <div className="central-trafego-stat">
              <span>Gasto</span>
              <strong>{meta.weekLoading && !weekStats.spend ? '…' : formatHojeSpend(weekStats.spend)}</strong>
            </div>
            <div className={`central-trafego-stat${weekStats.noAr ? ' is-ok' : ''}`}>
              <span>Veicularam</span>
              <strong>{weekStats.noAr}</strong>
            </div>
            <div className={`central-trafego-stat${weekStats.alertas ? ' is-warn' : ''}`}>
              <span>Com alerta</span>
              <strong>{weekStats.alertas}</strong>
            </div>
          </div>
          {meta.weekLoading && !meta.weekRows.length ? (
            <p className="hoje-meta-loading">
              <Loader2 className="h-4 w-4 animate-spin" /> Lendo a semana na Meta…
            </p>
          ) : (
            <div className="hoje-meta-list">
              {meta.weekRows.map((brief) => (
                <AccountBrief key={`w-${brief.client.id}`} brief={brief} period={meta.periods.week} />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {activeTab === 'dia' ? (
        <section className="hoje-block">
          <div className="hoje-block-head">
            <div>
              <p className="central-trafego-kicker">Tráfego do dia</p>
              <h2>Como está cada conjunto hoje</h2>
              <p>
                Ligado e veiculação separados. Clique na conta para ver os conjuntos.
                {meta.progress?.total ? ` · Meta ${meta.progress.done}/${meta.progress.total}` : ''}
              </p>
            </div>
          </div>
          <div className="central-trafego-stats">
            <div className="central-trafego-stat">
              <span>Gasto hoje</span>
              <strong>{meta.loading && !dayStats.spend ? '…' : formatHojeSpend(dayStats.spend)}</strong>
            </div>
            <div className={`central-trafego-stat${dayStats.noAr ? ' is-ok' : ''}`}>
              <span>Contas no ar</span>
              <strong>{dayStats.noAr}</strong>
            </div>
            <div className={`central-trafego-stat${dayStats.alertas ? ' is-warn' : ''}`}>
              <span>Paradas / alerta</span>
              <strong>{dayStats.alertas}</strong>
            </div>
          </div>
          {meta.loading && !meta.dayRows.length ? (
            <p className="hoje-meta-loading">
              <Loader2 className="h-4 w-4 animate-spin" /> Buscando o dia na Meta…
            </p>
          ) : (
            <div className="hoje-meta-list">
              {meta.dayRows.map((brief) => (
                <AccountBrief key={brief.client.id} brief={brief} period={meta.periods.today} />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {activeTab === 'agora' ? (
        <div className={`hoje-agora-shell${hojeView === 'board' && filaPronta ? ' is-board' : ''}`}>
          {hojeView === 'board' && filaPronta ? (
            <CentralTrafegoHojeBoard
              columns={boardColumns}
              upcoming={{ analysis: upcomingAnalysis, optimization: upcomingOptimization }}
              onCompleteDemand={setCompleteTask}
              onCreateDemand={openCreateDemand}
              painelPeriod={painelPeriod}
            />
          ) : (
            <>
              {!filaPronta ? (
                <p className="hoje-meta-loading">
                  <Loader2 className="h-4 w-4 animate-spin" /> Abrindo a fila salva…
                </p>
              ) : null}
              {filaPronta && metaPending ? (
                <p className="hoje-meta-loading">
                  <Loader2 className="h-4 w-4 animate-spin" /> Atualizando alertas da Meta. A fila salva continua abaixo.
                </p>
              ) : null}
              {filaPronta ? HOJE_SECTIONS.map((section) => (
                <section key={section.key} className="hoje-section">
                  <header className="hoje-section-head">
                    <div>
                      <h2 className="hoje-section-title">{section.title}</h2>
                      <p className="hoje-section-copy">{section.description}</p>
                    </div>
                    <span className={'hoje-section-count' + (section.key === 'urgente' ? ' is-urgent' : '')}>
                      {boardColumns[section.key].length}
                    </span>
                  </header>
                  {boardColumns[section.key].length ? (
                    <ul className="hoje-queue-list">
                      {boardColumns[section.key].map((item) =>
                        item.kind === 'weekly' || item.kind === 'rotina' ? (
                          <RoutineCard key={item.id} item={item} onComplete={setCompleteTask} />
                        ) : item.kind === 'demand' ? (
                          <DemandCard key={item.id} item={item} painelPeriod={painelPeriod} onComplete={setCompleteTask} />
                        ) : (
                          <ActionCard key={item.id} item={item} painelPeriod={painelPeriod} onCreateDemand={openCreateDemand} />
                        )
                      )}
                    </ul>
                  ) : (
                    <p className="hoje-section-copy">Nenhum item neste grupo.</p>
                  )}
                  {section.key === 'aFazer' && upcomingCards.length ? (
                    <div className="hoje-upcoming-list">
                      <Button size="sm" variant="ghost" onClick={() => setShowUpcomingList((open) => !open)}>
                        {showUpcomingList ? 'Ocultar próximas' : 'Ver próximas (' + upcomingCards.length + ')'}
                      </Button>
                      {showUpcomingList ? (
                        <ul className="hoje-queue-list">
                          {upcomingCards.map((item) => (
                            <UpcomingRoutineCard key={item.id} item={item} />
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              )) : null}

              {filaPronta ? (
                <section className="hoje-section hoje-section-ia">
              <header className="hoje-section-head">
                <div>
                  <h2 className="hoje-section-title">
                    <Sparkles className="h-4 w-4 inline mr-1.5" />
                    Alertas da IA
                  </h2>
                  <p className="hoje-section-copy">DNA da ficha e qualidade dos 7 dias — verificar antes de virar demanda.</p>
                </div>
              </header>

              {dnaAlerts.length ? (
                <ul className="hoje-queue-list">
                  {dnaAlerts.map((item) => (
                    <li
                      key={item.id}
                      className={`hoje-queue-card is-dna${item.tone === 'issue' ? ' is-overdue' : ' is-warn'}`}
                    >
                      <div className="hoje-queue-main">
                        <div className="hoje-queue-top">
                          <span className="hoje-queue-badge is-dna">{item.alertTitle}</span>
                        </div>
                        <h3 className="hoje-queue-title">{item.title}</h3>
                        <p className="hoje-queue-detail">{item.reason}</p>
                      </div>
                      <div className="hoje-queue-actions">
                        <Link
                          className="hoje-queue-link"
                          to={painelHref(item.clientId, { period: painelPeriod, actionCode: item.action?.code })}
                        >
                          Verificar
                        </Link>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            openCreateDemand({
                              clientId: item.clientId,
                              demandType: item.action.demandType,
                              title: item.action.demandTitle,
                            })
                          }
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Criar demanda
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="hoje-queue-dismiss"
                          aria-label="Dispensar alerta hoje"
                          onClick={() => dismissDna(item.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="central-trafego-empty hoje-ia-empty">
                  <h3>Nenhum alerta extra</h3>
                  {dnaAlreadyInAgora > 0 ? (
                    <p>
                      {dnaAlreadyInAgora} alerta{dnaAlreadyInAgora === 1 ? '' : 's'} já{' '}
                      {dnaAlreadyInAgora === 1 ? 'está' : 'estão'} em Fazer agora.
                    </p>
                  ) : (
                    <p>Quando a meta da ficha ou os 7 dias pedirem conferência, aparece aqui.</p>
                  )}
                </div>
              )}
                </section>
              ) : null}
            </>
          )}

        </div>
      ) : null}

      {activeTab === 'checkup' ? (
        <CentralTrafegoCheckup
          mode="briefing"
          loading={checkup.loading}
          error={checkup.error}
          summary={checkup.summary}
          groups={checkup.groups}
          team={checkup.team?.length ? checkup.team : team}
          reload={checkup.reload}
          onReloadRelated={reload}
          metaBriefs={mergedBriefs}
          metaLoading={meta.loading}
          weekLoading={meta.weekLoading}
        />
      ) : null}

      <CentralTrafegoDemandaForm
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setDemandPreset(null);
        }}
        clients={clients}
        campaigns={campaigns}
        team={team}
        presetClientId={demandPreset?.clientId}
        presetDemandType={demandPreset?.demandType}
        presetTitle={demandPreset?.title}
        onSaved={() => {
          reload();
          checkup.reload();
        }}
      />
      <CentralTrafegoConcluirDialog
        open={Boolean(completeTask)}
        onOpenChange={(v) => !v && setCompleteTask(null)}
        task={completeTask}
        campaigns={completeTask?.campaigns?.length ? completeTask.campaigns : campaigns}
        team={team}
        onSaved={() => {
          reload();
          checkup.reload();
        }}
      />
    </div>
  );
}
