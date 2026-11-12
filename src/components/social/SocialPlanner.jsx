import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Facebook,
  Film,
  Instagram,
  Plus,
  Search,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import {
  accountsByPlatform,
  clientsWithMetaAccounts,
  fetchClientsSocialAccountsMap,
} from '@/lib/clienteSocialAccounts';
import {
  buildPlannerItems,
  itemsForDay,
  matchesPlannerFilter,
  matchesPlannerSearch,
  movePlannerItemToDay,
  plannerFormatLabel,
  plannerItemCanMove,
  plannerStatusCounts,
  plannerStatusMeta,
  plannerPublicationState,
} from '@/lib/socialPlannerItems';
import { futureScheduleAt } from '@/lib/scheduleSocialComposer';
import ContentPublisher from './ContentPublisher';
import SocialPlannerDetail, { PlannerPreview } from './SocialPlannerDetail';
import './SocialPlannerVisual.css';

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const FILTERS = [
  { id: 'all', label: 'Todos os canais' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'reels', label: 'Reels' },
];

function toPublisherAccount(row) {
  return {
    id: row.meta_id,
    name: row.display_name || row.username || row.meta_id,
    username: row.username || '',
    profile_picture_url: row.profile_picture_url || null,
  };
}

function PlannerCard({ item, compact = false, showClient, dragging, selected, onOpen, onDragStart, onDragEnd }) {
  const skipClick = useRef(false);
  const status = item.publications.length === 1 ? plannerPublicationState(item.publications[0]) : plannerStatusMeta(item.status);
  const movable = plannerItemCanMove(item);
  const clientPrefix = `[${item.clientName}]`;
  const title = item.clientName && item.title.toLowerCase().startsWith(clientPrefix.toLowerCase())
    ? item.title.slice(clientPrefix.length).trim() : item.title;
  return (
    <button
      type="button"
      className={`social-visual-post${compact ? ' is-compact' : ''}${selected ? ' is-selected' : ''}${dragging ? ' is-drag' : ''}`}
      aria-pressed={selected}
      aria-label={compact ? `${item.clientName}: ${title}. ${item.time || 'Sem horário'}. ${item.publications.map((p) => p.channel).join(', ')}. ${status.label}` : undefined}
      title={compact ? `${item.clientName}: ${title} · ${status.label}` : item.title}
      draggable={movable}
      onClick={(event) => {
        if (skipClick.current) { skipClick.current = false; return; }
        onOpen(item, event);
      }}
      onDragStart={(event) => {
        if (!movable) { event.preventDefault(); return; }
        skipClick.current = true;
        event.dataTransfer.setData('text/plain', item.id);
        event.dataTransfer.effectAllowed = 'move';
        onDragStart(item);
      }}
      onDragEnd={() => {
        onDragEnd?.();
        window.setTimeout(() => { skipClick.current = false; }, 80);
      }}
    >
      {compact ? <>
        <span className={`social-visual-state social-month-state is-${status.tone}`} aria-hidden="true" />
        <span className="social-month-time">{item.time || '—'}</span>
        <strong>{showClient ? `${item.clientName}: ` : ''}{title}</strong>
        <span className="social-visual-post-networks" aria-hidden="true">
          {item.instagram ? <Instagram /> : null}{item.facebook ? <Facebook /> : null}
        </span>
      </> : <><span className="social-visual-post-top">
        <span>{item.time || 'Sem horário'}</span>
        <span className="social-visual-post-networks">
          {item.instagram ? <span aria-label="Instagram"><Instagram aria-hidden="true" /></span> : null}
          {item.facebook ? <span aria-label="Facebook"><Facebook aria-hidden="true" /></span> : null}
          {item.other ? <span>{item.publications.map((p) => p.channel).filter((channel) => !['Instagram', 'Facebook'].includes(channel)).join(' · ')}</span> : null}
        </span>
      </span>
      <PlannerPreview item={item} compact />
      <span className="social-visual-post-copy">
        {showClient ? <span className="social-visual-post-client">{item.clientName}</span> : null}
        <strong>{title}</strong>
        <span className="social-visual-post-format">{plannerFormatLabel(item)}</span>
      </span>
      <span className={`social-visual-state is-${status.tone}`}>{status.label}</span></>}
    </button>
  );
}

export default function SocialPlanner({
  publications = [],
  clients = [],
  selectedClientId = 'all',
  onOpenItem,
  onCreated,
}) {
  const { toast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [mode, setMode] = useState('weeks');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [dayOpen, setDayOpen] = useState(null);
  const [composer, setComposer] = useState(null);
  const [accountsMap, setAccountsMap] = useState(new Map());
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [composeClientId, setComposeClientId] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [draggingId, setDraggingId] = useState('');
  const [dropDay, setDropDay] = useState('');
  const [moving, setMoving] = useState(false);
  const selectedCardRef = useRef(null);
  const detailRef = useRef(null);
  const gridRef = useRef(null);
  const [monthHeight, setMonthHeight] = useState(520);

  const allItems = useMemo(() => {
    const scoped = (publications || []).filter((pub) => (
      (selectedClientId === 'all' || pub.task?.client_id === selectedClientId)
      && (filter !== 'instagram' || String(pub.channel).toLowerCase() === 'instagram')
      && (filter !== 'facebook' || String(pub.channel).toLowerCase() === 'facebook')
    ));
    return buildPlannerItems(scoped)
      .filter((item) => matchesPlannerFilter(item, filter))
      .filter((item) => matchesPlannerSearch(item, query));
  }, [publications, selectedClientId, filter, query]);

  const days = useMemo(() => {
    const first = mode === 'weeks' ? startOfWeek(currentDate, { weekStartsOn: 1 }) : startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
    const last = mode === 'weeks' ? endOfWeek(currentDate, { weekStartsOn: 1 }) : endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
    return eachDayOfInterval({ start: first, end: last });
  }, [currentDate, mode]);
  const periodItems = allItems.filter((item) => item.date >= days[0] && item.date <= endOfWeek(days[days.length - 1], { weekStartsOn: 1 }));
  const counts = plannerStatusCounts(periodItems);
  const items = statusFilter === 'all' ? periodItems : periodItems.filter((item) => item.status === statusFilter);
  const selectedItem = items.find((item) => item.id === selectedId) || null;
  const weekCount = days.length / 7;
  const visibleLimit = mode === 'weeks' ? 5 : Math.max(0, Math.min(3, Math.floor(((monthHeight - 29) / weekCount - 64) / 30)));
  const metaClients = useMemo(
    () => clientsWithMetaAccounts(clients, accountsMap),
    [clients, accountsMap],
  );
  const composeClient = metaClients.find((c) => c.id === composeClientId) || null;
  const accounts = accountsMap.get(composeClientId) || [];

  const clientIdsKey = (clients || []).map((client) => client.id).join(',');

  useLayoutEffect(() => {
    if (mode !== 'month') return undefined;
    const grid = gridRef.current;
    const main = grid.closest('main');
    const page = grid.closest('.social-ws') || grid.parentElement;
    const resize = () => {
      const bottom = Math.min(window.innerHeight, main?.getBoundingClientRect().bottom ?? window.innerHeight);
      const padding = main ? parseFloat(window.getComputedStyle(main).paddingBottom) || 0 : 0;
      // Compensate scrolling so opening a dialog or resizing never grows the month below the viewport.
      const top = grid.getBoundingClientRect().top + (main?.scrollTop || 0) + window.scrollY;
      setMonthHeight(Math.max(weekCount * 52 + 29, Math.floor(bottom - top - padding - 4)));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(page);
    if (main) observer.observe(main);
    window.addEventListener('resize', resize);
    return () => { observer.disconnect(); window.removeEventListener('resize', resize); };
  }, [mode, weekCount, selectedClientId]);

  useEffect(() => {
    const ids = clientIdsKey ? clientIdsKey.split(',') : [];
    if (!ids.length) {
      setAccountsMap(new Map());
      setAccountsLoading(false);
      return undefined;
    }
    let active = true;
    setAccountsLoading(true);
    fetchClientsSocialAccountsMap(supabase, ids)
      .then((map) => {
        if (active) setAccountsMap(map);
      })
      .catch(() => {
        if (active) setAccountsMap(new Map());
      })
      .finally(() => {
        if (active) setAccountsLoading(false);
      });
    return () => { active = false; };
  }, [clientIdsKey]);

  useEffect(() => {
    if (!composer || accountsLoading) return;
    if (composeClientId && metaClients.some((client) => client.id === composeClientId)) return;
    setComposeClientId(metaClients[0]?.id || '');
  }, [composer, accountsLoading, metaClients, composeClientId]);

  const { pages, instagram } = accountsByPlatform(accounts);
  const publisherPages = pages.map(toPublisherAccount);
  const publisherIg = instagram.map(toPublisherAccount);

  const goToday = () => setCurrentDate(new Date());
  const goPrev = () => setCurrentDate((date) => mode === 'weeks' ? subWeeks(date, 1) : subMonths(date, 1));
  const goNext = () => setCurrentDate((date) => mode === 'weeks' ? addWeeks(date, 1) : addMonths(date, 1));

  const openComposer = (kind, day = null) => {
    const preferred = selectedClientId !== 'all' && metaClients.some((client) => client.id === selectedClientId)
      ? selectedClientId
      : (metaClients[0]?.id || '');
    setComposeClientId(preferred);
    const scheduled = day
      ? futureScheduleAt(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0, 0))
      : null;
    setComposer({
      format: kind === 'reel' ? 'REELS' : 'IMAGE',
      scheduled,
    });
  };

  const handleChip = (item, event) => {
    if (event?.currentTarget.closest('.social-visual-planner')) selectedCardRef.current = event.currentTarget;
    setSelectedId(item.id);
  };

  const persistMove = async (item, day) => {
    if (!plannerItemCanMove(item)) return;
    const next = movePlannerItemToDay(item, format(day, 'yyyy-MM-dd'), item.time);
    if (!next || item.dayKey === format(day, 'yyyy-MM-dd')) {
      setDraggingId('');
      setDropDay('');
      return;
    }
    setMoving(true);
    try {
      for (const publication of item.publications) {
        if (publication.status === 'published' || publication.status === 'cancelled') continue;
        const { error } = await supabase
          .from('task_channel_publications')
          .update({
            scheduled_for: next.scheduled_for,
            scheduled_at: next.scheduled_at,
          })
          .eq('id', publication.id);
        if (error) throw error;
      }
      toast({ title: 'Post movido', description: format(day, "d 'de' MMMM", { locale: ptBR }) });
      onCreated?.();
    } catch (error) {
      toast({ title: 'Não deu para mover', description: error.message, variant: 'destructive' });
    } finally {
      setMoving(false);
      setDraggingId('');
      setDropDay('');
    }
  };

  const onDropDay = (day, event) => {
    event.preventDefault();
    const id = event.dataTransfer.getData('text/plain') || draggingId;
    const item = items.find((row) => row.id === id);
    if (item) void persistMove(item, day);
  };

  const renderCard = (item) => (
    <PlannerCard key={item.id} item={item} compact={mode === 'month'} showClient={selectedClientId === 'all'}
      selected={selectedId === item.id} dragging={draggingId === item.id} onOpen={handleChip}
      onDragStart={(next) => setDraggingId(next.id)}
      onDragEnd={() => { setDraggingId(''); setDropDay(''); }} />
  );

  const renderDay = (day) => {
    const dayItems = itemsForDay(items, day);
    const extra = Math.max(0, dayItems.length - visibleLimit);
    const shown = extra ? dayItems.slice(0, visibleLimit) : dayItems;
    const outside = mode === 'month' && !isSameMonth(day, currentDate);
    const key = format(day, 'yyyy-MM-dd');
    const dateLabel = <span className="social-visual-date"><span className="social-visual-day-name">{format(day, 'EEE', { locale: ptBR })}</span><span className="social-visual-day-number">{format(day, 'd')}</span>{dayItems.length ? <span className="social-visual-day-count">{dayItems.length}</span> : null}</span>;
    return (
      <div
        key={day.toISOString()}
        className={`social-pl-day${isToday(day) ? ' is-today' : ''}${outside ? ' is-out' : ''}${dropDay === key ? ' is-drop' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          setDropDay(key);
        }}
        onDragLeave={() => {
          setDropDay((current) => (current === key ? '' : current));
        }}
        onDrop={(event) => onDropDay(day, event)}
      >
        <div className="social-pl-day-head">
          {mode === 'month' ? <button type="button" className="social-month-open-day"
            aria-label={`${format(day, "d 'de' MMMM", { locale: ptBR })}: ${dayItems.length} ${dayItems.length === 1 ? 'conteúdo' : 'conteúdos'}`}
            onClick={(event) => { selectedCardRef.current = event.currentTarget; setDayOpen(day); }}
          >{dateLabel}</button> : dateLabel}
          <button
            type="button"
            className="social-pl-add"
            aria-label={`Criar post em ${format(day, 'dd/MM')}`}
            onClick={() => openComposer('post', day)}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="social-pl-day-list">
          {shown.map(renderCard)}
          {extra > 0 && visibleLimit > 0 ? (
            <button
              type="button"
              className="social-pl-more"
              onClick={(event) => { selectedCardRef.current = event.currentTarget; setDayOpen(day); }}
            >
              + mais {extra}
            </button>
          ) : null}
          {!dayItems.length && mode === 'weeks' ? <span className="social-visual-day-empty">Sem conteúdo</span> : null}
        </div>
      </div>
    );
  };

  return (
    <div className="social-pl social-visual-planner">
      <header className="social-pl-toolbar">
        <div className="social-pl-nav">
          <h2>{mode === 'weeks' ? `${format(days[0], 'dd MMM', { locale: ptBR })} – ${format(days[6], 'dd MMM yyyy', { locale: ptBR })}` : format(currentDate, 'MMMM yyyy', { locale: ptBR })}</h2>
          <button type="button" className="social-pl-arrow" onClick={goPrev} aria-label="Anterior">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" className="social-pl-arrow" onClick={goNext} aria-label="Seguinte">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button type="button" className="social-pl-today" onClick={goToday}>Hoje</button>
        </div>
        <div className="social-pl-mode" role="group" aria-label="Período">
          <button
            type="button"
            className={mode === 'weeks' ? 'is-on' : ''}
            aria-pressed={mode === 'weeks'}
            onClick={() => setMode('weeks')}
          >
            Semanal
          </button>
          <button
            type="button"
            className={mode === 'month' ? 'is-on' : ''}
            aria-pressed={mode === 'month'}
            onClick={() => setMode('month')}
          >
            Mensal
          </button>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="social-pl-create">
              Novo conteúdo
              <ChevronDown className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openComposer('post')}>
              <Plus className="h-4 w-4" />
              Criar post
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openComposer('reel')}>
              <Film className="h-4 w-4" />
              Criar reel
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="social-pl-tools social-ed-tools">
          <label className="social-ed-search"><Search className="h-4 w-4" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar conteúdo…" aria-label="Buscar conteúdo" /></label>
          <label><span className="sr-only">Canal</span><select aria-label="Canal do calendário" value={filter} onChange={(event) => setFilter(event.target.value)}>{FILTERS.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</select></label>
        </div>
      </header>
      <div className="social-visual-controls">
        <div className="social-visual-filters" role="group" aria-label="Situação do conteúdo">
          {[['all', 'Todos', periodItems.length], ['scheduled', 'Programados', counts.scheduled], ['pending', 'Planejados', counts.pending], ['failed', 'Atenção', counts.failed], ['published', 'Publicados', counts.published]].map(([value, label, count]) => (
            <button type="button" key={value} aria-pressed={statusFilter === value} onClick={() => setStatusFilter(value)}>{label} <span>{count}</span></button>
          ))}
        </div>
      </div>
      <div className="social-visual-workspace">
        <div>
          {!items.length ? <p className="social-visual-empty" role="status">Nenhum conteúdo neste período e filtro. Use Novo conteúdo ou escolha outro período.</p> : null}
          <div ref={gridRef} className={`social-pl-grid ${mode === 'weeks' ? 'is-visual-week' : 'is-month'}`}
            style={mode === 'month' ? { height: monthHeight, gridTemplateRows: `28px repeat(${weekCount}, minmax(0, 1fr))` } : undefined}>
            {WEEKDAYS.map((day) => <div key={day} className="social-pl-weekday">{day}</div>)}
            {days.map(renderDay)}
          </div>
        </div>
      </div>

      <Dialog open={Boolean(selectedItem)} onOpenChange={(open) => { if (!open) setSelectedId(''); }}>
        <DialogContent ref={detailRef} className="social-visual-detail-dialog" overlayClassName="bg-slate-950/25 backdrop-blur-[2px]" aria-describedby={undefined} onOpenAutoFocus={(event) => { event.preventDefault(); detailRef.current?.focus({ preventScroll: true }); }} onCloseAutoFocus={(event) => { event.preventDefault(); selectedCardRef.current?.focus(); }}>
          <DialogHeader><DialogTitle>Detalhes do conteúdo</DialogTitle></DialogHeader>
          <SocialPlannerDetail item={selectedItem} publications={publications} onOpenItem={(...args) => { selectedCardRef.current = null; setSelectedId(''); onOpenItem?.(...args); }} />
        </DialogContent>
      </Dialog>

      {moving ? <p className="social-ed-moving" role="status">Salvando nova data…</p> : null}

      <Dialog open={Boolean(dayOpen)} onOpenChange={(open) => { if (!open) setDayOpen(null); }}>
        <DialogContent className="social-visual-day-dialog max-w-md" aria-describedby={undefined}
          onCloseAutoFocus={(event) => { event.preventDefault(); if (!selectedId && !composer) selectedCardRef.current?.focus({ preventScroll: true }); }}>
          <DialogHeader>
            <DialogTitle>
              {dayOpen ? format(dayOpen, "EEEE, d 'de' MMMM", { locale: ptBR }) : 'Dia'}
            </DialogTitle>
          </DialogHeader>
          {dayOpen && !itemsForDay(items, dayOpen).length ? <p className="social-visual-footnote">Nenhum conteúdo neste dia e filtro.</p> : null}
          <div className="social-pl-day-list" style={{ maxHeight: '60vh', overflow: 'auto' }}>
            {dayOpen ? itemsForDay(items, dayOpen).map((item) => (
              <PlannerCard
                key={item.id}
                item={item}
                showClient={selectedClientId === 'all'}
                dragging={false}
                onOpen={(next) => {
                  setDayOpen(null);
                  handleChip(next);
                }}
                onHover={() => {}}
                onLeave={() => {}}
                onDragStart={() => {}}
                onDragEnd={() => {}}
              />
            )) : null}
          </div>
          <button type="button" className="social-visual-open" onClick={() => { openComposer('post', dayOpen); setDayOpen(null); }}><Plus className="h-4 w-4" />Criar conteúdo neste dia</button>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(composer)} onOpenChange={(open) => { if (!open) setComposer(null); }}>
        <DialogContent className="meta-composer-dialog max-h-[94vh] max-w-6xl overflow-hidden p-0 sm:p-0">
          <DialogHeader className="px-5 pt-5 pb-2 sm:px-6 shrink-0">
            <DialogTitle>{composer?.format === 'REELS' ? 'Criar reel' : 'Criar post'}</DialogTitle>
          </DialogHeader>
          <div className="px-5 pb-5 sm:px-6 sm:pb-6 overflow-y-auto max-h-[calc(94vh-3.5rem)]">
            {accountsLoading ? (
              <p className="social-ws-empty">Carregando contas da Meta…</p>
            ) : metaClients.length === 0 ? (
              <p className="social-ws-empty">
                Nenhum cliente tem Instagram ou Facebook ligados. Liga a conta em Perfil e feed para publicar na Meta.
              </p>
            ) : (
              <ContentPublisher
                key={composeClientId || 'composer'}
                type={publisherIg.length ? 'instagram' : 'pages'}
                pages={publisherPages}
                instagramAccounts={publisherIg}
                selectedPage={publisherPages[0]?.id || ''}
                selectedInstagram={publisherIg[0]?.id || ''}
                clientId={composeClientId}
                clientName={composeClient?.empresa || ''}
                clientOptions={metaClients}
                onClientChange={setComposeClientId}
                initialFormat={composer?.format}
                initialScheduledTime={composer?.scheduled}
                initialWhenMode={composer?.scheduled ? 'schedule' : 'now'}
                onClose={() => setComposer(null)}
                onFormatChange={(format) => {
                  setComposer((current) => {
                    if (!current || current.format === format) return current;
                    return { ...current, format };
                  });
                }}
                onSuccess={() => {
                  setComposer(null);
                  onCreated?.();
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
