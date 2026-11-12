import { useCallback, useState } from 'react';
import { ChevronDown, ChevronRight, Eye } from 'lucide-react';
import { PAINEL_COLUMNS, painelMetricForItem } from '@/lib/trafegoPainelMetrics';
import { formatAdsetAudience, formatAdsetAudienceFull } from '@/lib/metaAdsetAudience';
import { adsLook, listAds } from '@/lib/metaAdsetWrite';
import { adsetMatchesAction } from '@/lib/trafegoProximaAcao';
import { campaignObjectiveKey } from '@/lib/clienteMetaSnapshot';

function columnLabel(key) {
  return PAINEL_COLUMNS.find((c) => c.key === key)?.label || key;
}

function columnTip(key) {
  return PAINEL_COLUMNS.find((c) => c.key === key)?.tip || '';
}

export function PainelTableHead({ visibleKeys }) {
  return (
    <thead>
      <tr>
        {visibleKeys.map((key) => (
          <th
            key={key}
            className={key === 'ligado' ? 'trafego-dash-switch-cell' : undefined}
            title={columnTip(key)}
          >
            {columnLabel(key)}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function MetricCell({ columnKey, item, objective }) {
  return (
    <td className="trafego-dash-num" title={columnTip(columnKey)}>
      {painelMetricForItem(columnKey, item, objective)}
    </td>
  );
}

function renderStructuralCell({
  columnKey,
  level,
  item,
  objective,
  campaign,
  siblingAdsets,
  parentAdset,
  bloqueioLabel,
  campaignOff,
  ads,
  adsExpanded,
  onToggleAdsExpand,
  onOpenMeta,
  onAskWrite,
  onAskWhy,
  onRevealAds,
  onPreviewAd,
  onBudget,
  MetaSwitch,
  VeiculacaoCell,
  CampaignMark,
  objectiveLabel,
}) {
  switch (columnKey) {
    case 'ligado':
      return (
        <MetaSwitch
          key={columnKey}
          item={item}
          level={level}
          campaign={campaign}
          siblingAdsets={siblingAdsets}
          parentAdset={parentAdset}
          onAsk={onAskWrite}
        />
      );
    case 'nome':
      if (level === 'campaign') {
        return (
          <td key={columnKey}>
            <CampaignMark name={item?.name} onOpen={onOpenMeta} />
          </td>
        );
      }
      if (level === 'adset') {
        const adList = listAds(item);
        const hasAdsLoaded = item?.ads != null;
        const canExpand = hasAdsLoaded && adList.length > 0;
        return (
          <td key={columnKey}>
            <div className="trafego-dash-adset-name">
              {canExpand ? (
                <button
                  type="button"
                  className="trafego-dash-adset-toggle"
                  aria-expanded={adsExpanded}
                  aria-label={adsExpanded ? 'Recolher anúncios' : 'Expandir anúncios'}
                  onClick={() => onToggleAdsExpand?.(item.id)}
                >
                  {adsExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </button>
              ) : null}
              <span>{item?.name || 'Conjunto'}</span>
            </div>
            {campaignOff ? <small className="trafego-dash-block">Campanha desligada</small> : null}
            {hasAdsLoaded ? (
              <small className={ads.on === 0 ? 'trafego-dash-block' : 'trafego-dash-ads'}>
                {ads.total
                  ? `${ads.on}/${ads.total} anúncio${ads.total === 1 ? '' : 's'} ligado${ads.on === 1 ? '' : 's'}${canExpand && !adsExpanded ? ' · clique na seta para ver' : ''}`
                  : 'Sem anúncios'}
              </small>
            ) : (
              <button type="button" className="trafego-dash-ads-load" onClick={() => onRevealAds(item)}>
                Ver anúncios
              </button>
            )}
          </td>
        );
      }
      return (
        <td key={columnKey}>
          <span className="trafego-dash-ad-tag">Anúncio</span>
          {item?.name || 'Anúncio'}
          <button
            type="button"
            className="trafego-dash-ad-eye"
            aria-label={`Ver criativo de ${item?.name || 'anúncio'}`}
            onClick={() => onPreviewAd({ ad: item, objective })}
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        </td>
      );
    case 'veiculacao':
      return (
        <VeiculacaoCell
          key={columnKey}
          item={item}
          onAskWhy={onAskWhy}
          bloqueioLabel={bloqueioLabel}
        />
      );
    case 'objetivo':
      return (
        <td key={columnKey}>
          <span className="trafego-dash-obj">{objectiveLabel(objective)}</span>
        </td>
      );
    case 'publicos':
      return (
        <td
          key={columnKey}
          className="trafego-dash-audience"
          title={level === 'adset' ? formatAdsetAudienceFull(item?.targeting) : ''}
        >
          {level === 'adset' ? formatAdsetAudience(item?.targeting) || formatAdsetAudienceFull(item?.targeting) : '—'}
        </td>
      );
    case 'verba':
      return (
        <td key={columnKey}>
          {level === 'adset' ? (
            <div className="trafego-dash-write">
              <button type="button" onClick={() => onBudget(item)}>
                Verba
              </button>
            </div>
          ) : null}
        </td>
      );
    default:
      return <MetricCell key={columnKey} columnKey={columnKey} item={item} objective={objective} />;
  }
}

export function PainelTableBody({
  visibleKeys,
  colSpan,
  periodLoading,
  adsetsLoading,
  campaignGroups,
  bloqueioLabel,
  actionCode,
  campaignStatus,
  itemResult,
  objectiveLabel,
  formatMoney,
  entityIsOn: entityOn,
  MetaSwitch,
  VeiculacaoCell,
  CampaignMark,
  onOpenMeta,
  onAskWrite,
  onAskWhy,
  onRevealAds,
  onPreviewAd,
  onBudget,
}) {
  const [expandedAdsets, setExpandedAdsets] = useState(() => new Set());

  const toggleAdsExpand = useCallback((adsetId) => {
    const id = String(adsetId || '');
    if (!id) return;
    setExpandedAdsets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const revealAdsAndExpand = useCallback(
    async (adset) => {
      await onRevealAds?.(adset);
      if (adset?.id) {
        setExpandedAdsets((prev) => new Set(prev).add(String(adset.id)));
      }
    },
    [onRevealAds]
  );

  if (periodLoading && campaignGroups.length === 0) {
    return (
      <tbody>
        <tr>
          <td colSpan={colSpan} className="trafego-dash-table-empty">
            Carregando campanhas…
          </td>
        </tr>
      </tbody>
    );
  }

  if (campaignGroups.length === 0) {
    return (
      <tbody>
        <tr>
          <td colSpan={colSpan} className="trafego-dash-table-empty">
            Nenhuma campanha neste período.
          </td>
        </tr>
      </tbody>
    );
  }

  const cellCtx = {
    bloqueioLabel,
    onOpenMeta,
    onAskWrite,
    onAskWhy,
    onRevealAds: revealAdsAndExpand,
    onPreviewAd,
    onBudget,
    onToggleAdsExpand: toggleAdsExpand,
    MetaSwitch,
    VeiculacaoCell,
    CampaignMark,
    objectiveLabel,
  };

  return (
    <tbody>
      {campaignGroups.flatMap((group) => {
        const campaignStatusInfo = campaignStatus(group.campaign);
        const campaignResult = itemResult(group.campaign, group.campaign.objective);
        const rows = [];
        const objective = group.campaign.objective;

        if (adsetsLoading && group.adsets.length === 0) {
          rows.push(
            <tr key={`c-${group.campaign.id}`} className="trafego-dash-group">
              <td colSpan={colSpan}>
                <button type="button" className="trafego-dash-name" onClick={onOpenMeta}>
                  {group.campaign.name || 'Campanha'}
                </button>
                <span className="trafego-dash-group-meta">buscando conjuntos…</span>
              </td>
            </tr>
          );
          return rows;
        }

        if (group.adsets.length === 0) {
          rows.push(
            <tr key={`camp-${group.campaign.id}`} className="trafego-dash-group">
              {visibleKeys.map((columnKey) =>
                renderStructuralCell({
                  ...cellCtx,
                  columnKey,
                  level: 'campaign',
                  item: group.campaign,
                  objective,
                  campaign: group.campaign,
                  siblingAdsets: group.adsets,
                })
              )}
            </tr>
          );
          return rows;
        }

        rows.push(
          <tr key={`c-${group.campaign.id}`} className="trafego-dash-group">
            {visibleKeys.map((columnKey, idx) => {
              if (idx === 0) {
                return renderStructuralCell({
                  ...cellCtx,
                  columnKey,
                  level: 'campaign',
                  item: group.campaign,
                  objective,
                  campaign: group.campaign,
                  siblingAdsets: group.adsets,
                });
              }
              if (idx === 1) {
                return (
                  <td key={columnKey} colSpan={visibleKeys.length - 1}>
                    <CampaignMark name={group.campaign.name} onOpen={onOpenMeta} />
                    <span
                      className="trafego-dash-group-meta"
                      title={`${entityOn(group.campaign) ? 'Campanha ligada' : 'Campanha desligada'} · ${campaignStatusInfo.label} · ${objectiveLabel(objective)} · ${formatMoney(campaignResult.spend)}`}
                    >
                      {campaignStatusInfo.label}
                      {` · ${formatMoney(campaignResult.spend)}`}
                    </span>
                  </td>
                );
              }
              return null;
            })}
          </tr>
        );

        group.adsets.forEach((adset) => {
          const result = itemResult(adset, objective);
          const ads = adsLook(listAds(adset));
          const campaignOff = !entityOn(group.campaign);
          const focused = adsetMatchesAction(actionCode, result, campaignObjectiveKey(objective));
          const adsExpanded = expandedAdsets.has(String(adset.id));
          rows.push(
            <tr key={adset.id} className={`trafego-dash-adset${focused ? ' is-focus' : ''}`}>
              {visibleKeys.map((columnKey) =>
                renderStructuralCell({
                  ...cellCtx,
                  columnKey,
                  level: 'adset',
                  item: adset,
                  objective,
                  campaign: group.campaign,
                  siblingAdsets: group.adsets,
                  campaignOff,
                  ads,
                  adsExpanded,
                })
              )}
            </tr>
          );

          if (adsExpanded) {
            listAds(adset).forEach((ad) => {
              rows.push(
                <tr key={ad.id} className="trafego-dash-ad">
                  {visibleKeys.map((columnKey) =>
                    renderStructuralCell({
                      ...cellCtx,
                      columnKey,
                      level: 'ad',
                      item: ad,
                      objective,
                      campaign: group.campaign,
                      parentAdset: adset,
                    })
                  )}
                </tr>
              );
            });
          }
        });

        return rows;
      })}
    </tbody>
  );
}
