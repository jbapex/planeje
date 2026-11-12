import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getPublishedFunilDiagram } from '@/lib/funilDiagramApi';
import { supabase } from '@/lib/customSupabaseClient';
import {
  aggregateSpendFromCampaignNodes,
  buildAttributionPayload,
  defaultMetricsDateRange,
  formatFunilSpend,
} from '@/lib/funilMetrics';
import { hasMetaLink } from '@/lib/funilMetaLink';
import { hasGoogleLink } from '@/lib/funilGoogleLink';

export default function FunilHubSummary({ clienteId, onOpenFunil, embedded = false }) {
  const [diagram, setDiagram] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uniqueLeads, setUniqueLeads] = useState(null);

  const load = async () => {
    if (!clienteId) return;
    setLoading(true);
    try {
      const row = await getPublishedFunilDiagram(clienteId);
      setDiagram(row);
      const nodes = row?.nodes || [];
      const edges = row?.edges || [];
      if (nodes.length > 0) {
        const tr = defaultMetricsDateRange();
        const { data, error } = await supabase.functions.invoke('funil-metrics-api', {
          body: {
            action: 'count-contacts-attribution',
            cliente_id: clienteId,
            nodes: buildAttributionPayload(nodes, edges),
            time_range: { since: tr.since, until: tr.until },
          },
        });
        if (!error && data?.uniqueContactCount != null) {
          setUniqueLeads(data.uniqueContactCount);
        } else {
          setUniqueLeads(null);
        }
      } else {
        setUniqueLeads(null);
      }
    } catch {
      setDiagram(null);
      setUniqueLeads(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [clienteId]);

  const summary = useMemo(() => {
    const nodes = diagram?.nodes || [];
    const edges = diagram?.edges || [];
    const spendAgg = aggregateSpendFromCampaignNodes(nodes, edges);
    let linkedAds = 0;
    for (const n of nodes) {
      if (hasMetaLink(n.data?.metaLink) || hasGoogleLink(n.data?.googleLink)) linkedAds += 1;
    }
    return {
      totalSpend: spendAgg.total,
      totalLeads: uniqueLeads ?? 0,
      linkedAds,
      nodeCount: nodes.length,
    };
  }, [diagram, uniqueLeads]);

  if (!clienteId) return null;

  if (embedded) {
    return (
      <div className="funil-hub-summary funil-hub-summary--embedded">
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
        ) : diagram ? (
          <>
            <span className="funil-hub-summary__tag">Publicado</span>
            <span className="font-medium text-foreground truncate">{diagram.name}</span>
            <span className="text-muted-foreground shrink-0">
              {summary.nodeCount} nós · {summary.linkedAds} mídia
              {summary.totalLeads > 0 ? ` · ${summary.totalLeads} leads` : ''}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground text-xs">
            Nenhum funil publicado — use &quot;Publicado&quot; no diagrama ativo
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 ml-auto"
          onClick={load}
          title="Recarregar resumo"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className="funil-hub-summary rounded-lg border border-slate-200/80 dark:border-slate-700/60 bg-slate-50/80 dark:bg-slate-900/40 px-4 py-3 mb-4 flex flex-wrap items-center gap-4 text-sm">
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : diagram ? (
        <>
          <span className="font-medium text-foreground">{diagram.name}</span>
          <span className="text-muted-foreground">
            {summary.nodeCount} nós · {summary.linkedAds} com mídia
          </span>
          {summary.totalSpend > 0 && (
            <span className="text-muted-foreground">
              Gasto (cache): {formatFunilSpend(summary.totalSpend)}
            </span>
          )}
          {summary.totalLeads > 0 && (
            <span className="text-emerald-700 dark:text-emerald-400 font-medium">
              {summary.totalLeads} leads no período
            </span>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            Atualize métricas no editor do funil
          </span>
        </>
      ) : (
        <span className="text-muted-foreground">
          Nenhum funil publicado — marque um diagrama como &quot;Publicado&quot; no editor.
        </span>
      )}
      {onOpenFunil && (
        <Button type="button" variant="outline" size="sm" className="h-8" onClick={onOpenFunil}>
          Abrir funil
        </Button>
      )}
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={load} title="Recarregar resumo">
        <RefreshCw className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
