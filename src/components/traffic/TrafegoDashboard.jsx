import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { format, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarIcon, Loader2, MessageSquare, RefreshCw, Columns, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useTrafegoFila } from '@/hooks/useTrafegoFila';
import { useTrafegoPainelColumns } from '@/hooks/useTrafegoPainelColumns';
import TrafegoVincularGrupoDialog from '@/components/traffic/TrafegoVincularGrupoDialog';
import ClientMetaDetailView from '@/components/traffic/ClientMetaDetailView';
import { ClienteMetaResumoInline } from '@/components/traffic/ClienteMetaResumoCell';
import TrafegoMetaWriteDialog from '@/components/traffic/TrafegoMetaWriteDialog';
import TrafegoMotivoParadoDialog from '@/components/traffic/TrafegoMotivoParadoDialog';
import TrafegoAdPreviewDialog from '@/components/traffic/TrafegoAdPreviewDialog';
import CentralTrafegoDemandaForm from '@/components/traffic/CentralTrafegoDemandaForm';
import { supabase } from '@/lib/customSupabaseClient';
import { buildGrupoConversasUrl } from '@/lib/clienteWhatsappGrupo';
import { buildClientEditUrl } from '@/lib/clientHubRoutes';
import { BLOQUEIO_LABEL, clientHealth, formatMoney } from '@/lib/trafegoFila';
import { buildBudgetDraft, buildStatusDraft, entityIsOn, explainMetaWriteError, listAds } from '@/lib/metaAdsetWrite';
import { NEXT_ACTIONS, adsetMatchesAction } from '@/lib/trafegoProximaAcao';
import {
  buildMetaSnapshot,
  entityResultLine,
  extractEntityMetrics,
  fetchAdsForAdset,
  fetchAdsetsForCampaigns,
  fetchCampaignsForAccounts,
  metricsFromSnapshot,
  objectiveKpiCards,
  OBJECTIVE_LABELS,
  campaignObjectiveKey,
  metaToggleStatus,
  metaVeiculacaoStatus,
  saveClienteMetaResumo,
  readClienteMetaResumo,
} from '@/lib/clienteMetaSnapshot';
import { shouldKeepPreviousMeta } from '@/lib/trafegoHojeCache';
import {
  formatPainelCacheAge,
  isTabCacheFresh,
  painelCacheHasData,
  PAINEL_TAB_TTL_MS,
  readPainelTabCache,
  writePainelTabCache,
} from '@/lib/trafegoTabCache';
import { PAINEL_COLUMN_GROUPS } from '@/lib/trafegoPainelMetrics';
import {
  PAINEL_PERIOD_PRESETS,
  formatPainelPeriodLabel,
  periodWindowLabel,
  resolvePainelPeriod,
} from '@/lib/trafegoPainelHref';
import { PainelTableBody, PainelTableHead } from '@/components/traffic/TrafegoPainelTable';
import '@/components/clients/Clients.css';
import './TrafegoFila.css';
import './CentralTrafego.css';

function campaignStatus(item) {
  return metaVeiculacaoStatus(item);
}

function deliveryClass(delivery) {
  if (delivery.tone === 'issue') return 'is-issue';
  if (delivery.active) return 'is-active';
  return 'is-paused';
}

function VeiculacaoCell({ item, onAskWhy, bloqueioLabel }) {
  const delivery = metaVeiculacaoStatus(item);
  const title = [delivery.label, delivery.detail, bloqueioLabel].filter(Boolean).join(' — ');
  return (
    <td title={title}>
      <span className={`trafego-dash-camp-status ${deliveryClass(delivery)}`}>{delivery.label}</span>
      {delivery.detail && delivery.tone === 'issue' ? (
        <small className="trafego-dash-delivery-detail">{delivery.detail}</small>
      ) : null}
      {bloqueioLabel ? <small className="trafego-dash-delivery-why">{bloqueioLabel}</small> : null}
      {delivery.needsWhy && onAskWhy && !bloqueioLabel ? (
        <button type="button" className="trafego-dash-why" onClick={() => onAskWhy(item)}>
          Por quê?
        </button>
      ) : null}
    </td>
  );
}

function CampaignMark({ name, onOpen }) {
  return (
    <span className="trafego-dash-camp-mark">
      <span className="trafego-dash-camp-pip" aria-hidden="true" />
      <span className="trafego-dash-camp-tag">Campanha</span>
      <button type="button" className="trafego-dash-name" onClick={onOpen}>
        {name || 'Campanha'}
      </button>
    </span>
  );
}

function MetaSwitch({ item, level, campaign, siblingAdsets, parentAdset, onAsk }) {
  const on = entityIsOn(item);
  const noun = level === 'campaign' ? 'campanha' : level === 'ad' ? 'anúncio' : 'conjunto';
  return (
    <td className="trafego-dash-switch-cell">
      <Switch
        checked={on}
        onCheckedChange={() => onAsk({ item, level, campaign, siblingAdsets, parentAdset })}
        aria-label={on ? `Desligar ${item?.name || noun}` : `Ligar ${item?.name || noun}`}
        className={`trafego-dash-switch ${on ? 'is-on' : 'is-off'}`}
      />
    </td>
  );
}

function parseIsoDate(value) {
  if (!value) return undefined;
  const d = new Date(`${value}T12:00:00`);
  return isValid(d) ? d : undefined;
}

function PainelDatePicker({ id, label, value, onChange }) {
  const selected = parseIsoDate(value);
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <Popover>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" className="trafego-dash-date-btn">
            <CalendarIcon className="h-3.5 w-3.5 mr-1" aria-hidden />
            {selected ? format(selected, 'dd/MM/yyyy', { locale: ptBR }) : 'Escolher data'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            onSelect={(day) => onChange(day ? format(day, 'yyyy-MM-dd') : '')}
            locale={ptBR}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function itemResult(item, objective) {
  const metrics = extractEntityMetrics(item);
  const result = entityResultLine(objective || item.campaign_objective || item.objective, metrics);
  return { ...metrics, ...result };
}

function itemIsRelevant(item) {
  const toggle = metaToggleStatus(item);
  const delivery = metaVeiculacaoStatus(item);
  const metrics = extractEntityMetrics(item);
  return toggle.on || delivery.active || metrics.spend > 0;
}

function objectiveLabel(objective) {
  const key = campaignObjectiveKey(objective);
  return OBJECTIVE_LABELS[key] || 'Outros';
}

export default function TrafegoDashboard() {
  const { toast } = useToast();
  const { visibleKeys, toggleColumn, resetColumns, allColumns } = useTrafegoPainelColumns();
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const { loading, refreshing, error, portfolio, reload } = useTrafegoFila({ skipMetrics: true });
  const [groupRow, setGroupRow] = useState(null);
  const [metaClient, setMetaClient] = useState(null);
  const [writeDraft, setWriteDraft] = useState(null);
  const [fetchTick, setFetchTick] = useState(0);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [periodError, setPeriodError] = useState(null);
  const [liveSnapshot, setLiveSnapshot] = useState(null);
  const [liveCampaigns, setLiveCampaigns] = useState([]);
  const [liveAdsets, setLiveAdsets] = useState([]);
  const [adsetsLoading, setAdsetsLoading] = useState(false);
  const [dataFetchedAt, setDataFetchedAt] = useState(0);
  const [showingStaleData, setShowingStaleData] = useState(false);
  const [motivoDraft, setMotivoDraft] = useState(null);
  const [previewAd, setPreviewAd] = useState(null);
  const [localBloqueio, setLocalBloqueio] = useState(null);
  const [demandOpen, setDemandOpen] = useState(false);
  const { user, profile } = useAuth();
  const team = useMemo(
    () => (user ? [{ id: user.id, full_name: profile?.full_name || 'Eu' }] : []),
    [user, profile]
  );

  const clientId = searchParams.get('client_id') || '';
  const actionCode = searchParams.get('acao') || '';
  const actionHint = NEXT_ACTIONS[actionCode] || null;
  const periodKey = searchParams.get('periodo') || 'mes';
  const customFrom = searchParams.get('from') || '';
  const customTo = searchParams.get('to') || '';
  const period = useMemo(
    () => resolvePainelPeriod(periodKey, customFrom, customTo),
    [periodKey, customFrom, customTo]
  );
  const periodReady = periodKey !== 'custom' || Boolean(customFrom && customTo);

  const clients = useMemo(() => portfolio.map((r) => r.client), [portfolio]);
  const selectedRow = useMemo(
    () => portfolio.find((r) => r.client.id === clientId) || null,
    [portfolio, clientId]
  );
  const selectedClient = selectedRow?.client || null;
  const metaDisconnected = Boolean(selectedClient && !(selectedRow?.accounts || []).length);
  const windowLabel = periodWindowLabel(periodKey, period);
  const bloqueioLabel =
    BLOQUEIO_LABEL[localBloqueio || selectedRow?.bloqueio] ||
    (localBloqueio || selectedRow?.bloqueio ? 'Parado (motivo operacional)' : '');

  useEffect(() => {
    setMetaClient(null);
    setLocalBloqueio(null);
    setMotivoDraft(null);
    setPreviewAd(null);
    setFetchTick(0);
  }, [clientId, period.since, period.until]);

  const askWhy = (item) => {
    if (!selectedClient?.id) return;
    setMotivoDraft({
      itemName: item?.name || '',
      initialBloqueio: localBloqueio || selectedRow?.bloqueio || '',
    });
  };

  const patchSearch = (mutator) => {
    const next = new URLSearchParams(searchParams);
    mutator(next);
    setSearchParams(next, { replace: true });
  };

  const onClientChange = (id) => {
    patchSearch((next) => {
      if (id) next.set('client_id', id);
      else next.delete('client_id');
    });
  };

  const onPeriodChange = (key) => {
    patchSearch((next) => {
      next.set('periodo', key);
      if (key === 'custom') {
        if (!next.get('from')) next.set('from', period.since);
        if (!next.get('to')) next.set('to', period.until);
      } else {
        next.delete('from');
        next.delete('to');
      }
    });
  };

  const onCustomDate = (field, value) => {
    patchSearch((next) => {
      next.set('periodo', 'custom');
      if (value) next.set(field, value);
      else next.delete(field);
    });
  };

  useEffect(() => {
    if (!selectedClient || !periodReady || metaDisconnected) {
      setLiveSnapshot(null);
      setLiveCampaigns([]);
      setLiveAdsets([]);
      setPeriodError(null);
      setPeriodLoading(false);
      setAdsetsLoading(false);
      setDataFetchedAt(0);
      setShowingStaleData(false);
      return undefined;
    }

    const cached = readPainelTabCache(selectedClient.id, period.since, period.until);
    const hasCached = painelCacheHasData(cached);
    const cacheFresh = cached && isTabCacheFresh(cached.fetchedAt, PAINEL_TAB_TTL_MS);

    const applyCache = (box) => {
      if (!painelCacheHasData(box)) return false;
      setLiveSnapshot(box.liveSnapshot);
      setLiveCampaigns(box.liveCampaigns);
      setLiveAdsets(box.liveAdsets);
      setDataFetchedAt(Number(box.fetchedAt) || 0);
      return true;
    };

    if (hasCached) applyCache(cached);

    if (cacheFresh && fetchTick === 0) {
      setPeriodLoading(false);
      setAdsetsLoading(false);
      setPeriodError(null);
      setShowingStaleData(false);
      return undefined;
    }

    let cancelled = false;
    setPeriodError(null);
    setPeriodLoading(!hasCached);
    setAdsetsLoading(false);
    (async () => {
      try {
        const fetched = await fetchCampaignsForAccounts(selectedRow.accounts || [], period);
        if (cancelled) return;

        const campaigns = fetched.campaigns || [];
        const blockedByLimit = fetched.rateLimited && campaigns.length === 0 && hasCached;

        if (blockedByLimit) {
          setPeriodError(fetched.errorMessage || 'A Meta limitou as chamadas. Mostrando a última consulta.');
          setShowingStaleData(true);
          return;
        }

        const snapshot = buildMetaSnapshot(fetched);
        const hasNewCampaigns = campaigns.length > 0;

        if (hasNewCampaigns) {
          setLiveCampaigns(campaigns);
          setLiveSnapshot(snapshot);
        } else if (!hasCached) {
          setLiveCampaigns([]);
          setLiveSnapshot(null);
        }

        if (fetched.permError && fetched.errorMessage) {
          const raw = String(fetched.errorMessage);
          setPeriodError(
            /permission|ads_read|ads_management|sem permiss/i.test(raw)
              ? 'Sem permissão de leitura nesta conta Meta.'
              : raw
          );
          if (hasCached && !hasNewCampaigns) setShowingStaleData(true);
        }

        if (!hasNewCampaigns) {
          setPeriodLoading(false);
          return;
        }

        setPeriodLoading(false);
        setAdsetsLoading(true);
        const adsets = await fetchAdsetsForCampaigns(campaigns, period, selectedRow.accounts || []);
        if (cancelled) return;

        const nextAdsets = adsets.length ? adsets : hasCached ? cached.liveAdsets : adsets;
        if (!adsets.length && hasCached && fetched.rateLimited) {
          setPeriodError(fetched.errorMessage || 'A Meta limitou as chamadas. Mostrando a última consulta.');
          setShowingStaleData(true);
        } else {
          setLiveAdsets(nextAdsets);
          setShowingStaleData(false);
          const now = Date.now();
          setDataFetchedAt(now);
          writePainelTabCache(selectedClient.id, period.since, period.until, {
            liveSnapshot: snapshot,
            liveCampaigns: campaigns,
            liveAdsets: nextAdsets,
          });
        }

        const monthPeriod = resolvePainelPeriod('mes');
        if (selectedClient?.id && period.since === monthPeriod.since && period.until === monthPeriod.until) {
          const previous = readClienteMetaResumo(selectedClient);
          if (!shouldKeepPreviousMeta(fetched, previous)) {
            saveClienteMetaResumo(selectedClient.id, snapshot).catch((e) =>
              console.warn('Não gravou resumo Meta do painel', e)
            );
          }
        }
      } catch (e) {
        if (cancelled) return;
        if (hasCached) {
          applyCache(cached);
          setShowingStaleData(true);
        } else {
          setLiveCampaigns([]);
          setLiveSnapshot(null);
          setLiveAdsets([]);
        }
        setPeriodError(e?.message || String(e));
      } finally {
        if (!cancelled) {
          setPeriodLoading(false);
          setAdsetsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedClient, selectedRow, period.since, period.until, periodReady, fetchTick, metaDisconnected]);

  const metrics = metricsFromSnapshot(liveSnapshot);
  const monthLike =
    periodKey === 'mes' ||
    periodKey === 'mes_passado' ||
    (period.since === resolvePainelPeriod('mes').since && period.until === resolvePainelPeriod('mes').until);
  const healthClient =
    monthLike
      ? selectedClient
      : selectedClient
        ? { ...selectedClient, limite_meta: null }
        : null;
  const health = selectedClient && metrics ? clientHealth(healthClient, metrics) : null;
  const spendLabel =
    monthLike && selectedClient?.limite_meta
      ? `${formatMoney(metrics?.spend)} / ${formatMoney(selectedClient.limite_meta)}`
      : formatMoney(metrics?.spend);
  const resultCards = useMemo(() => objectiveKpiCards(liveSnapshot), [liveSnapshot]);
  const campaignGroups = useMemo(() => {
    const relevantCampaigns = [...liveCampaigns]
      .filter(itemIsRelevant)
      .sort((a, b) => {
        const aActive = campaignStatus(a).active ? 0 : 1;
        const bActive = campaignStatus(b).active ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        return extractEntityMetrics(b).spend - extractEntityMetrics(a).spend;
      });
    const adsetsByCampaign = new Map();
    for (const adset of liveAdsets) {
      const cid = String(adset.campaign_id || '');
      if (!cid) continue;
      if (!adsetsByCampaign.has(cid)) adsetsByCampaign.set(cid, []);
      adsetsByCampaign.get(cid).push(adset);
    }
    return relevantCampaigns.map((campaign) => {
      const raw = adsetsByCampaign.get(String(campaign.id)) || [];
      const visible = raw.filter((adset) => {
        const s = String(adset.effective_status || adset.status || '').toUpperCase();
        return s !== 'DELETED' && s !== 'ARCHIVED';
      });
      const adsets = visible.filter(itemIsRelevant);
      return { campaign, adsets: adsets.length ? adsets : visible };
    });
  }, [liveCampaigns, liveAdsets]);
  const activeAdsets = liveAdsets.filter((a) => campaignStatus(a).active).length;

  const refreshAll = async () => {
    await reload();
    setFetchTick((n) => n + 1);
  };

  const askStatusWrite = async ({ item, level, campaign, siblingAdsets, parentAdset }) => {
    let entity = item;
    if (level === 'adset' && !entityIsOn(item) && item?.ads == null) {
      const ads = await fetchAdsForAdset(item.id, period);
      entity = { ...item, ads };
      setLiveAdsets((prev) =>
        prev.map((row) => (String(row.id) === String(item.id) ? { ...row, ads } : row))
      );
    }
    setWriteDraft(
      buildStatusDraft({
        clientName: selectedClient?.empresa,
        entity,
        adset: level === 'ad' ? parentAdset : entity,
        level,
        campaign,
        siblingAdsets,
      })
    );
  };

  const revealAds = async (adset) => {
    if (!adset?.id || adset.ads != null) return;
    const ads = await fetchAdsForAdset(adset.id, period);
    setLiveAdsets((prev) =>
      prev.map((row) => (String(row.id) === String(adset.id) ? { ...row, ads } : row))
    );
  };

  const applyLocalWrites = (writes) => {
    for (const write of writes || []) {
      const status = write.status;
      const id = String(write.objectId || write.adsetId || '');
      if (!status || !id) continue;
      if (write.level === 'campaign') {
        setLiveCampaigns((prev) =>
          prev.map((row) =>
            String(row.id) === id ? { ...row, status, configured_status: status } : row
          )
        );
      }
      if (write.level === 'adset') {
        setLiveAdsets((prev) =>
          prev.map((row) =>
            String(row.id) === id ? { ...row, status, configured_status: status } : row
          )
        );
      }
      if (write.level === 'ad') {
        setLiveAdsets((prev) =>
          prev.map((row) => {
            const ads = listAds(row);
            if (!ads.some((ad) => String(ad.id) === id)) return row;
            return {
              ...row,
              ads: ads.map((ad) =>
                String(ad.id) === id ? { ...ad, status, configured_status: status } : ad
              ),
            };
          })
        );
      }
    }
  };

  const applyAdsetWrite = async (payload) => {
    const writes = payload?.writes?.length
      ? payload.writes
      : [{ objectId: payload.adsetId, level: 'adset', status: payload.status, daily_budget: payload.daily_budget, lifetime_budget: payload.lifetime_budget }];
    for (const write of writes) {
      const { data, error: fnError } = await supabase.functions.invoke('meta-ads-api', {
        body: { action: 'update-adset', ...write, adsetId: write.objectId || write.adsetId },
      });
      if (fnError) throw fnError;
      if (data?.error) {
        const look = explainMetaWriteError(data.error);
        const fail = new Error(look.detail);
        fail.metaWrite = look;
        throw fail;
      }
    }
    applyLocalWrites(writes);
    toast({ title: writes.length > 1 ? `${writes.length} alterações na Meta` : 'Alterado na Meta' });
    setFetchTick((n) => n + 1);
  };

  const detailDate = {
    from: new Date(`${period.since}T12:00:00`),
    to: new Date(`${period.until}T12:00:00`),
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[280px] gap-2 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p>Carregando painel de tráfego…</p>
      </div>
    );
  }

  return (
    <div className="trafego-dash">
      <div className="trafego-dash-filters">
        <div className="trafego-dash-field">
          <label htmlFor="trafego-dash-client">Cliente</label>
          <select
            id="trafego-dash-client"
            value={clientId}
            onChange={(e) => onClientChange(e.target.value)}
          >
            <option value="">Escolher um cliente…</option>
            {portfolio.map((r) => (
              <option key={r.client.id} value={r.client.id}>
                {r.client.empresa}
                {r.metaDisconnected ? ' · Meta desligada' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="trafego-dash-field">
          <label htmlFor="trafego-dash-period">Período</label>
          <select
            id="trafego-dash-period"
            value={periodKey}
            onChange={(e) => onPeriodChange(e.target.value)}
          >
            {PAINEL_PERIOD_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        {periodKey === 'custom' ? (
          <div className="trafego-dash-field is-dates">
            <PainelDatePicker
              id="trafego-dash-from"
              label="De"
              value={customFrom}
              onChange={(value) => onCustomDate('from', value)}
            />
            <PainelDatePicker
              id="trafego-dash-to"
              label="Até"
              value={customTo}
              onChange={(value) => onCustomDate('to', value)}
            />
          </div>
        ) : null}
        <div className="central-trafego-toolbar-actions trafego-dash-filter-actions">
          <Popover open={showColumnSelector} onOpenChange={setShowColumnSelector}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Columns className="h-4 w-4 mr-1" />
                Colunas
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-4" align="end">
              <div className="space-y-3 max-h-[22rem] overflow-y-auto">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-sm">Colunas do Painel</p>
                  <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={resetColumns}>
                    Restaurar
                  </button>
                </div>
                {PAINEL_COLUMN_GROUPS.map((group) => (
                  <div key={group}>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">{group}</p>
                    {allColumns
                      .filter((col) => col.group === group)
                      .map((col) => (
                        <div key={col.key} className="flex items-center space-x-2 py-0.5">
                          <Checkbox
                            id={`painel-col-${col.key}`}
                            checked={visibleKeys.includes(col.key)}
                            disabled={col.fixed}
                            onCheckedChange={() => toggleColumn(col.key)}
                          />
                          <Label htmlFor={`painel-col-${col.key}`} className="text-sm font-normal cursor-pointer" title={col.tip}>
                            {col.label}
                          </Label>
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          {selectedClient ? (
            <Button size="sm" onClick={() => setDemandOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Criar demanda
            </Button>
          ) : null}
          <Button variant="secondary" size="sm" onClick={refreshAll} disabled={refreshing || periodLoading || adsetsLoading}>
            {refreshing || periodLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" />
            )}
            Atualizar
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!clientId ? (
        <div className="trafego-dash-empty">
          <h3>Escolha um cliente</h3>
          <p>
            O painel mostra uma conta por vez. Selecione o cliente e o período para ver o que está no ar e o
            resultado da Meta.
          </p>
        </div>
      ) : !selectedClient ? (
        <div className="trafego-dash-empty">
          <h3>Cliente não está neste painel</h3>
          <p>Escolha outro da lista. Contas com Meta desligada também aparecem para vincular ou criar demanda.</p>
        </div>
      ) : metaDisconnected ? (
        <div className="trafego-dash-empty">
          <h3>Meta desligada</h3>
          <p>
            {selectedClient.empresa} está na carteira, mas não tem conta de anúncios ativa. Vincule no cadastro
            ou crie uma demanda — a fila do dia continua no Hoje.
          </p>
          {actionHint ? (
            <p className="trafego-dash-acao">
              <strong>{actionHint.title}</strong> — {actionHint.action}
            </p>
          ) : null}
          <div className="trafego-dash-empty-actions">
            <Button size="sm" asChild>
              <Link to={buildClientEditUrl(selectedClient.id)} state={{ backOnClose: true }}>Vincular no cadastro</Link>
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setDemandOpen(true)}>
              Criar demanda
            </Button>
          </div>
        </div>
      ) : (
        <>
          {actionHint ? (
            <p className="trafego-dash-acao">
              <strong>{actionHint.title}</strong> — {actionHint.action}
            </p>
          ) : null}

          <div className="planeje-clients-stats trafego-dash-stats">
            <div className="planeje-clients-stat planeje-clients-stat--spend trafego-carteira-stat-readonly">
              <p className="planeje-clients-stat-label">
                Gasto
                <span className="trafego-dash-window">{windowLabel}</span>
              </p>
              <p className="planeje-clients-stat-value">{periodLoading ? '…' : spendLabel}</p>
            </div>
            <div className="planeje-clients-stat planeje-clients-stat--value">
              <p className="planeje-clients-stat-label">
                {liveAdsets.length ? 'Conjuntos no ar' : 'No ar'}
                <span className="trafego-dash-window">{windowLabel}</span>
              </p>
              <p className="planeje-clients-stat-value">
                {periodLoading
                  ? '…'
                  : liveAdsets.length
                    ? activeAdsets
                    : liveSnapshot?.activeCount ?? 0}
              </p>
            </div>
            {resultCards.map((card) => (
              <div key={card.key} className="planeje-clients-stat planeje-clients-stat--active">
                <p className="planeje-clients-stat-label">
                  {card.label}
                  <span className="trafego-dash-window">{windowLabel}</span>
                </p>
                <p className="planeje-clients-stat-value">{periodLoading ? '…' : card.value}</p>
              </div>
            ))}
            <div
              className={`planeje-clients-stat ${
                health?.status === 'critico'
                  ? 'planeje-clients-stat--overdue'
                  : health?.status === 'ok'
                    ? 'planeje-clients-stat--value'
                    : 'planeje-clients-stat--ticket'
              }`}
            >
              <p className="planeje-clients-stat-label">Meta</p>
              <p className="planeje-clients-stat-value">{periodLoading ? '…' : health?.label || '—'}</p>
            </div>
          </div>

          {periodError ? <p className="text-sm text-destructive">{periodError}</p> : null}

          <section className="trafego-fila-col trafego-dash-panel">
              <header className="trafego-fila-col-head trafego-dash-panel-head">
                <div className="trafego-dash-panel-title">
                  <h2>{selectedClient.empresa}</h2>
                  <div className="trafego-dash-panel-meta">
                    {periodReady ? <span>{formatPainelPeriodLabel(period)}</span> : null}
                    {periodLoading || adsetsLoading ? (
                      <span>{periodLoading ? ' · buscando Meta…' : ' · buscando conjuntos…'}</span>
                    ) : null}
                    {!periodLoading && !liveSnapshot ? <span> · sem dados neste período</span> : null}
                    {!periodLoading && liveSnapshot ? <ClienteMetaResumoInline snapshot={liveSnapshot} /> : null}
                    {showingStaleData && dataFetchedAt ? (
                      <span className="trafego-dash-stale" title="Última consulta bem-sucedida">
                        {' '}
                        · última consulta {formatPainelCacheAge(dataFetchedAt)}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="trafego-dash-client-actions">
                  <Button size="sm" onClick={() => setMetaClient(selectedClient)} disabled={periodLoading}>
                    Ver campanhas
                  </Button>
                  {buildGrupoConversasUrl(selectedRow.grupo) ? (
                    <Button size="sm" variant="outline" asChild>
                      <Link to={buildGrupoConversasUrl(selectedRow.grupo)}>
                        <MessageSquare className="h-3.5 w-3.5 mr-1" />
                        Grupo
                      </Link>
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setGroupRow(selectedRow)}>
                      Vincular grupo
                    </Button>
                  )}
                </div>
              </header>
              <div className="trafego-dash-table-wrap">
                <table className="trafego-dash-table">
                  <PainelTableHead visibleKeys={visibleKeys} />
                  <PainelTableBody
                    visibleKeys={visibleKeys}
                    colSpan={visibleKeys.length}
                    periodLoading={periodLoading}
                    adsetsLoading={adsetsLoading}
                    campaignGroups={campaignGroups}
                    bloqueioLabel={bloqueioLabel}
                    actionCode={actionCode}
                    campaignStatus={campaignStatus}
                    itemResult={itemResult}
                    objectiveLabel={objectiveLabel}
                    formatMoney={formatMoney}
                    entityIsOn={entityIsOn}
                    MetaSwitch={MetaSwitch}
                    VeiculacaoCell={VeiculacaoCell}
                    CampaignMark={CampaignMark}
                    onOpenMeta={() => setMetaClient(selectedClient)}
                    onAskWrite={askStatusWrite}
                    onAskWhy={askWhy}
                    onRevealAds={revealAds}
                    onPreviewAd={setPreviewAd}
                    onBudget={(adset) =>
                      setWriteDraft(buildBudgetDraft({ clientName: selectedClient.empresa, adset }))
                    }
                  />
                </table>
              </div>
          </section>
        </>
      )}

      {metaClient ? (
        <ClientMetaDetailView
          key={metaClient.id}
          client={metaClient}
          onClose={() => setMetaClient(null)}
          initialDate={detailDate}
        />
      ) : null}
      <TrafegoMetaWriteDialog
        open={Boolean(writeDraft)}
        onOpenChange={(open) => {
          if (!open) setWriteDraft(null);
        }}
        draft={writeDraft}
        onConfirm={applyAdsetWrite}
      />
      <TrafegoMotivoParadoDialog
        open={Boolean(motivoDraft)}
        onOpenChange={(open) => {
          if (!open) setMotivoDraft(null);
        }}
        clientId={selectedClient?.id}
        clientName={selectedClient?.empresa}
        itemName={motivoDraft?.itemName}
        initialBloqueio={motivoDraft?.initialBloqueio}
        onSaved={({ bloqueio }) => {
          setLocalBloqueio(bloqueio || null);
          reload();
        }}
      />
      <TrafegoAdPreviewDialog
        open={Boolean(previewAd)}
        onOpenChange={(open) => {
          if (!open) setPreviewAd(null);
        }}
        ad={previewAd?.ad}
        objective={previewAd?.objective}
        periodLabel={formatPainelPeriodLabel(period)}
      />
      <TrafegoVincularGrupoDialog
        row={groupRow}
        open={Boolean(groupRow)}
        onOpenChange={(v) => {
          if (!v) setGroupRow(null);
        }}
        onSaved={reload}
      />
      <CentralTrafegoDemandaForm
        open={demandOpen}
        onOpenChange={setDemandOpen}
        clients={clients}
        campaigns={[]}
        team={team}
        presetClientId={selectedClient?.id}
        presetDemandType={actionHint?.demandType || 'ajuste'}
        presetTitle={actionHint?.demandTitle || ''}
        onSaved={() => {
          setDemandOpen(false);
          reload();
        }}
      />
    </div>
  );
}
