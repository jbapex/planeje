import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, RefreshCw, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import ContatosMessagePeriodPicker from '@/components/crm/ContatosMessagePeriodPicker';
import { RastreamentoSectionTitle } from '@/components/crm/RastreamentoUi';
import { formatFunilSpend } from '@/lib/funilMetrics';
import { collectAdAccountIds } from '@/lib/hubResultsSummary';
import {
  buildFunnelPaths,
  buildOverviewDashboard,
  dailyDifferenceLabel,
  fetchHubCapiEventCounts,
  fetchHubDailyInsights,
  fetchHubOverviewContacts,
  formatOverviewMoney,
  formatRoasX,
  funnelBadgeInk,
  funnelStageCaption,
  funnelStageColor,
} from '@/lib/hubOverviewDashboard';
import { loadRastreamentoConversionRules } from '@/lib/applyRastreamentoConversionRules';
import { CONVERSION_EVENT_NAMES } from '@/lib/rastreamentoConversionRules';
import { messagePeriodTriggerLabel } from '@/lib/contatosMessagePeriod';
import { defaultRastreamentoPeriod, periodBoundsSaoPaulo } from '@/lib/rastreamentoPeriod';

function MetricCard({ label, value, hint, actionLabel, onAction }) {
  return (
    <div className="rastreamento-resultados__card">
      <p className="rastreamento-resultados__label">{label}</p>
      <p className="rastreamento-resultados__value">{value}</p>
      {hint ? <p className="rastreamento-resultados__hint">{hint}</p> : null}
      {actionLabel && onAction ? (
        <Button type="button" variant="link" className="h-auto px-0 mt-1 text-xs" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

function mobileWidth(value, first) {
  if (first <= 0 || !value) return '0%';
  return `${Math.max(18, Math.min(100, Math.round((value / first) * 100)))}%`;
}

function FunnelChart({ stages, description }) {
  const items = stages || [];
  const paths = buildFunnelPaths(items.map((stage) => stage.value));
  const funnelLabel = items.map((stage) => `${stage.label}: ${stage.value}`).join(', ');
  const first = Math.max(Number(items[0]?.value) || 0, 1);
  return (
    <section className="rt-funnel-board" aria-label={`Funil de conversão. ${funnelLabel}`}>
      <div className="rt-funnel-board__head">
        <div>
          <p className="rt-kicker">Funil integrado</p>
          <RastreamentoSectionTitle
            as="h3"
            title="Conversão por etapas"
            help="Conversas Meta vêm do Gerenciador. Conversas reais são as que chegaram no WhatsApp com rastreio de anúncio, pela primeira mensagem no mesmo período das outras abas. As etapas seguintes são os gatilhos ativos em Jornada e gatilhos. A contagem usa CAPI com sucesso; Qualificado e Compra usam o comercial do contato se ainda não houver CAPI; Checkout também lê Insights. Não envia evento."
            helpLabel="Sobre o funil"
          />
          {description ? <p>{description}</p> : null}
        </div>
        <span className="rt-funnel-board__count">
          {items.length} {items.length === 1 ? 'etapa' : 'etapas'}
        </span>
      </div>
      <div className="rt-funnel-board__stages" style={{ '--rt-funnel-count': items.length }}>
        {items.map((stage, index) => {
          const color = funnelStageColor(index);
          return (
            <div className="rt-funnel-board__stage" key={stage.key} style={{ '--rt-funnel-color': color }}>
              <div className="rt-funnel-board__name">
                <span style={{ backgroundColor: color, color: funnelBadgeInk(color) }}>{index + 1}</span>
                <div className="rt-funnel-board__copy">
                  <strong>{stage.label}</strong>
                  {stage.hint ? <em>{stage.hint}</em> : null}
                </div>
              </div>
              <b>{stage.value}</b>
              <small>{funnelStageCaption(index, items)}</small>
              <div className="rt-funnel-board__cost">
                <span>{stage.costLabel}</span>
                <strong>{formatOverviewMoney(stage.cost)}</strong>
              </div>
            </div>
          );
        })}
      </div>
      <svg
        className="rt-funnel-board__chart"
        viewBox="0 0 1000 176"
        preserveAspectRatio="none"
        role="img"
        aria-label={funnelLabel}
      >
        {paths.map((path, index) => (
          <path d={path.d} fill={path.color} key={`${items[index]?.key || index}-shape`} />
        ))}
      </svg>
      <div className="rt-funnel-board__mobile">
        {items.map((stage, index) => {
          const color = funnelStageColor(index);
          return (
            <div className="rt-funnel-board__mobile-stage" key={`${stage.key}-mobile`}>
              <div className="rt-funnel-board__mobile-main">
                <span style={{ backgroundColor: color, color: funnelBadgeInk(color) }}>{index + 1}</span>
                <div className="rt-funnel-board__copy">
                  <strong>{stage.label}</strong>
                  {stage.hint ? <em>{stage.hint}</em> : null}
                </div>
                <b>{stage.value}</b>
              </div>
              <small>{funnelStageCaption(index, items)}</small>
              <div className="rt-funnel-board__cost">
                <span>{stage.costLabel}</span>
                <strong>{formatOverviewMoney(stage.cost)}</strong>
              </div>
              <span
                className="rt-funnel-board__band"
                style={{
                  '--rt-funnel-color': color,
                  '--rt-funnel-mobile-width': mobileWidth(stage.value, first),
                }}
                aria-hidden="true"
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DailyChart({ points, metaTotal, realTotal }) {
  const scrollerRef = useRef(null);
  const viewportRef = useRef(null);
  const dragRef = useRef(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [tip, setTip] = useState(null);
  const maximum = Math.max(1, ...points.flatMap((point) => [point.metaConversations, point.realConversations]));
  const viewWidth = Math.max(760, points.length * 54 + 92);
  const viewHeight = 240;
  const plotTop = 16;
  const plotBottom = 188;
  const plotHeight = plotBottom - plotTop;
  const plotLeft = 40;
  const plotRight = viewWidth - 16;
  const plotWidth = plotRight - plotLeft;
  const groupWidth = plotWidth / Math.max(points.length, 1);
  const barWidth = Math.min(15, Math.max(6, groupWidth * 0.28));
  const labelEvery = Math.max(1, Math.ceil(points.length / 10));
  const barH = (value) => (value / maximum) * plotHeight;
  const formatDate = (date) => {
    const [, month, day] = String(date).split('-');
    return `${day}/${month}`;
  };

  const syncScrollButtons = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) {
      setCanGoBack(false);
      setCanGoForward(false);
      return;
    }
    setCanGoBack(el.scrollLeft > 4);
    setCanGoForward(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return undefined;
    const align = () => {
      el.scrollLeft = Math.max(0, el.scrollWidth - el.clientWidth);
      syncScrollButtons();
    };
    const frame = requestAnimationFrame(align);
    const onScroll = () => syncScrollButtons();
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [points.length, viewWidth, syncScrollButtons]);

  const scrollByAmount = (delta) => {
    scrollerRef.current?.scrollBy({ left: delta, behavior: 'smooth' });
  };

  const moveTip = (event, point) => {
    const wrap = viewportRef.current;
    if (!wrap || dragRef.current?.moved) return;
    const box = wrap.getBoundingClientRect();
    setTip({
      key: point.date,
      date: formatDate(point.date),
      meta: point.metaConversations,
      real: point.realConversations,
      x: event.clientX - box.left,
      y: event.clientY - box.top,
    });
  };

  const onPointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (!event.target.closest?.('svg')) return;
    const el = scrollerRef.current;
    if (!el) return;
    dragRef.current = { x: event.clientX, left: el.scrollLeft, moved: false };
  };

  const onPointerMove = (event) => {
    const drag = dragRef.current;
    const el = scrollerRef.current;
    if (!drag || !el) return;
    const dx = event.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < 6) return;
    if (!drag.moved) {
      drag.moved = true;
      el.setPointerCapture(event.pointerId);
      el.classList.add('is-dragging');
      setTip(null);
    }
    el.scrollLeft = drag.left - dx;
  };

  const endDrag = (event) => {
    const el = scrollerRef.current;
    const drag = dragRef.current;
    dragRef.current = null;
    if (el) {
      el.classList.remove('is-dragging');
      if (drag?.moved && el.hasPointerCapture?.(event.pointerId)) el.releasePointerCapture(event.pointerId);
    }
  };

  if (!points.length) {
    return (
      <p className="rt-daily__empty">Sincronize o período para ver a comparação diária.</p>
    );
  }

  return (
    <div className="rt-daily__viewport" ref={viewportRef}>
      <button
        type="button"
        className="rt-daily__nav"
        aria-label="Ver dias anteriores"
        disabled={!canGoBack}
        onClick={() => scrollByAmount(-320)}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <div
        className="rt-daily__scroll"
        ref={scrollerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <svg
          className="rt-daily__chart"
          viewBox={`0 0 ${viewWidth} ${viewHeight}`}
          width={viewWidth}
          height={viewHeight}
          role="img"
          aria-label={`Comparação diária. Meta ${metaTotal}, conversas reais ${realTotal}.`}
        >
          {[0, 0.5, 1].map((ratio) => {
            const y = plotBottom - ratio * plotHeight;
            return (
              <g key={ratio}>
                <line className="rt-daily__grid" x1={plotLeft} x2={plotRight} y1={y} y2={y} />
                <text className="rt-daily__axis" x={plotLeft - 8} y={y + 4} textAnchor="end">
                  {Math.round(maximum * ratio)}
                </text>
              </g>
            );
          })}
          {points.map((point, index) => {
            const center = plotLeft + groupWidth * index + groupWidth / 2;
            const metaHeight = barH(point.metaConversations);
            const realHeight = barH(point.realConversations);
            const showLabel = index % labelEvery === 0 || index === points.length - 1;
            const hovered = tip?.key === point.date;
            return (
              <g key={point.date}>
                <rect
                  className={`rt-daily__hit${hovered ? ' is-on' : ''}`}
                  x={center - groupWidth / 2}
                  y={plotTop}
                  width={groupWidth}
                  height={plotBottom - plotTop}
                  onMouseEnter={(event) => moveTip(event, point)}
                  onMouseMove={(event) => moveTip(event, point)}
                  onMouseLeave={() => setTip(null)}
                />
                <rect
                  className="rt-daily__bar rt-daily__bar--meta"
                  x={center - barWidth - 1.5}
                  y={plotBottom - metaHeight}
                  width={barWidth}
                  height={Math.max(metaHeight, 0)}
                  rx="3"
                  pointerEvents="none"
                />
                <rect
                  className="rt-daily__bar rt-daily__bar--real"
                  x={center + 1.5}
                  y={plotBottom - realHeight}
                  width={barWidth}
                  height={Math.max(realHeight, 0)}
                  rx="3"
                  pointerEvents="none"
                />
                {hovered ? (
                  <>
                    <text
                      className="rt-daily__value"
                      x={center - barWidth - 1.5 + barWidth / 2}
                      y={plotBottom - metaHeight - 6}
                      textAnchor="middle"
                    >
                      {point.metaConversations}
                    </text>
                    <text
                      className="rt-daily__value"
                      x={center + 1.5 + barWidth / 2}
                      y={plotBottom - realHeight - 6}
                      textAnchor="middle"
                    >
                      {point.realConversations}
                    </text>
                  </>
                ) : null}
                {showLabel ? (
                  <text className="rt-daily__date" x={center} y={plotBottom + 22} textAnchor="middle">
                    {formatDate(point.date)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
      <button
        type="button"
        className="rt-daily__nav"
        aria-label="Ver dias seguintes"
        disabled={!canGoForward}
        onClick={() => scrollByAmount(320)}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
      {tip ? (
        <div className="rt-daily__tip" style={{ left: tip.x, top: tip.y }} role="status">
          <strong>{tip.date}</strong>
          <span>
            Meta <b>{tip.meta}</b>
          </span>
          <span>
            Conversas reais <b>{tip.real}</b>
          </span>
        </div>
      ) : null}
    </div>
  );
}

export default function RastreamentoOverviewDashboard({ clienteId, onOpenLeads, since, until, onPeriodChange }) {
  const fallback = useMemo(() => defaultRastreamentoPeriod(), []);
  const [localSince, setLocalSince] = useState(since || fallback.since);
  const [localUntil, setLocalUntil] = useState(until || fallback.until);
  const sinceValue = since || localSince;
  const untilValue = until || localUntil;
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const applyPeriod = useCallback(
    ({ from, to }) => {
      setLocalSince(from);
      setLocalUntil(to);
      if (from && to) onPeriodChange?.({ since: from, until: to });
    },
    [onPeriodChange],
  );

  const load = useCallback(async () => {
    if (!clienteId || !sinceValue || !untilValue) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { sinceIso, untilIso } = periodBoundsSaoPaulo(sinceValue, untilValue);
      const clientePromise = supabase
        .from('clientes')
        .select('meta_rastreamento')
        .eq('id', clienteId)
        .maybeSingle();
      const contactsPromise = fetchHubOverviewContacts(supabase, {
        clienteId,
        sinceIso,
        untilIso,
      });
      const rulesPromise = loadRastreamentoConversionRules(clienteId).catch(() => []);
      const capiPromise = fetchHubCapiEventCounts(supabase, {
        clienteId,
        sinceIso,
        untilIso,
        eventNames: CONVERSION_EVENT_NAMES.map((item) => item.value),
      });
      const clienteRow = await clientePromise;
      const adAccountIds = collectAdAccountIds(clienteRow?.data?.meta_rastreamento);
      const [contacts, insights, rules, capi] = await Promise.all([
        contactsPromise,
        fetchHubDailyInsights((name, opts) => supabase.functions.invoke(name, opts), {
          clienteId,
          adAccountIds,
          since: sinceValue,
          until: untilValue,
        }),
        rulesPromise,
        capiPromise,
      ]);
      if (contacts.error && !contacts.rows.length) throw new Error(contacts.error);
      const dashboard = buildOverviewDashboard({
        since: sinceValue,
        until: untilValue,
        insightRows: insights.rows,
        contactRows: contacts.rows,
        checkoutCount: capi.counts?.InitiateCheckout || 0,
        activeRules: rules,
        capiCounts: capi.counts,
      });
      setData({
        ...dashboard,
        spendError: dashboard.spend <= 0 ? insights.errors[0] || null : null,
        contactError: contacts.error,
        hasAdAccounts: adAccountIds.length > 0,
      });
    } catch (e) {
      setError(e?.message || 'Erro ao carregar a visão geral');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [clienteId, sinceValue, untilValue]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const periodLabel = useMemo(() => messagePeriodTriggerLabel(sinceValue, untilValue), [sinceValue, untilValue]);
  const funnelSummary = data
    ? `${periodLabel}: ${(data.funnel || []).map((stage) => `${stage.value} ${stage.label}`).join(', ')}.`
    : '';

  return (
    <section className="rastreamento-resultados rastreamento-resultados--embedded" aria-label="Cockpit da operação">
      <div className="rastreamento-resultados__head rt-overview-head">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <TrendingUp className="h-4 w-4 text-violet-500 shrink-0" />
            <RastreamentoSectionTitle
              title="Cockpit da operação"
              help="Investimento das contas Meta, conversas que a Meta reportou, conversas reais no WhatsApp (origem de anúncio, primeira mensagem), funil com os gatilhos ativos da jornada e o gráfico dia a dia. O período é o mesmo de Leads e Eventos. Não envia evento à Meta."
              helpLabel="Sobre o cockpit"
            />
          </div>
          <p className="rt-overview-kicker">{periodLabel} cruzando investimento, conversas reais e o que a Meta registrou.</p>
        </div>
        <div className="rt-overview-toolbar">
          <ContatosMessagePeriodPicker
            compact
            fromIso={sinceValue}
            toIso={untilValue}
            onChangePeriod={applyPeriod}
          />
          <Button type="button" variant="outline" size="sm" className="h-8 rounded-xl shrink-0 bg-white border-slate-200" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            <span className="ml-1.5">Atualizar</span>
          </Button>
        </div>
      </div>

      {error ? <p className="text-xs text-destructive px-1">{error}</p> : null}

      {loading && !data ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="rt-overview-chips" aria-label="Recorte ativo">
            <span>{periodLabel}</span>
            <span>
              {data?.trackedRate == null
                ? 'Aguardando conversas da Meta'
                : `${data.trackedRate}% rastreadas`}
            </span>
            {data?.hasAdAccounts ? <span>Contas Meta ligadas</span> : <span>Sem conta Meta</span>}
          </div>

          <div className="rastreamento-resultados__grid rt-overview-kpis">
            <MetricCard
              label="Investimento"
              value={formatFunilSpend(data?.spend || 0)}
              hint={data?.spendError && !(data?.spend) ? data.spendError : periodLabel}
            />
            <MetricCard
              label="Conversas Meta"
              value={String(data?.metaConversations ?? 0)}
              hint="Inícios de conversa no Gerenciador — não é WhatsApp"
            />
            <MetricCard
              label="Conversas reais"
              value={String(data?.realConversations ?? 0)}
              hint={
                data?.trackedRate == null
                  ? 'WhatsApp com anúncio · primeira mensagem'
                  : `${data.trackedRate}% das conversas Meta`
              }
              actionLabel="Ver leads"
              onAction={onOpenLeads}
            />
            <MetricCard
              label="Receita tráfego"
              value={formatFunilSpend(data?.valorTotal || 0)}
              hint={`ROAS ${formatRoasX(data?.roas)}`}
            />
            <MetricCard
              label="Qualificados"
              value={String(data?.qualificados ?? 0)}
              hint={data?.cpl ? `CPL ${formatFunilSpend(data.cpl)}` : 'Custo por conversa real'}
            />
            <MetricCard
              label="Compras"
              value={String(data?.vendas ?? 0)}
              hint={onOpenLeads ? 'Marque a venda no lead' : periodLabel}
            />
          </div>

          <FunnelChart stages={data?.funnel || []} description={funnelSummary} />

          <section className="rt-overview-panel" aria-labelledby="rt-daily-title">
            <div className="rt-overview-panel__head rt-daily-head">
              <div>
                <p className="rt-kicker">Conciliação diária</p>
                <h3 id="rt-daily-title" className="rt-section-title">Meta × conversas reais</h3>
                <p>Compare os volumes dia a dia e veja onde a Meta e o WhatsApp divergem.</p>
              </div>
              <strong className="rt-daily-diff">
                {dailyDifferenceLabel(data?.metaDailyTotal || 0, data?.realDailyTotal || 0)}
              </strong>
            </div>
            <div className="rt-daily-legend" aria-label="Legenda">
              <span>
                <i className="rt-daily-legend__meta" aria-hidden="true" />
                Meta <strong>{data?.metaDailyTotal ?? 0}</strong>
              </span>
              <span>
                <i className="rt-daily-legend__real" aria-hidden="true" />
                Conversas reais <strong>{data?.realDailyTotal ?? 0}</strong>
              </span>
            </div>
            <DailyChart
              points={data?.points || []}
              metaTotal={data?.metaDailyTotal || 0}
              realTotal={data?.realDailyTotal || 0}
            />
          </section>
        </>
      )}
    </section>
  );
}
