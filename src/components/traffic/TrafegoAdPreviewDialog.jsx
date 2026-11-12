import { useEffect, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { fetchMetaAdCreative } from '@/lib/funilMetaCreative';
import { formatMoney } from '@/lib/trafegoFila';
import { entityResultLine, extractEntityMetrics } from '@/lib/clienteMetaSnapshot';

function formatCtr(metrics) {
  const impressions = Number(metrics?.impressions) || 0;
  const clicks = Number(metrics?.clicks) || 0;
  if (!impressions) return '—';
  return `${((clicks / impressions) * 100).toFixed(2).replace('.', ',')}%`;
}

/**
 * Olho no anúncio: criativo + métricas do período já carregado no Painel.
 */
export default function TrafegoAdPreviewDialog({ open, onOpenChange, ad, objective, periodLabel }) {
  const [loading, setLoading] = useState(false);
  const [creative, setCreative] = useState(null);

  useEffect(() => {
    if (!open || !ad?.id) {
      setCreative(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchMetaAdCreative(ad.id).then((result) => {
      if (cancelled) return;
      setCreative(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, ad?.id]);

  const metrics = extractEntityMetrics(ad || {});
  const result = entityResultLine(objective || ad?.objective, metrics);
  const adsManagerUrl = ad?.id
    ? `https://www.facebook.com/adsmanager/manage/ads?act=&selected_ad_ids=${encodeURIComponent(ad.id)}`
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{ad?.name || 'Anúncio'}</DialogTitle>
          <DialogDescription>
            {periodLabel ? `Resultado ${periodLabel}` : 'Resultado no período do Painel'}
          </DialogDescription>
        </DialogHeader>
        <div className="trafego-ad-preview">
          <div className="trafego-ad-preview-media">
            {loading ? (
              <div className="trafego-ad-preview-empty">
                <Loader2 className="h-5 w-5 animate-spin" />
                Buscando criativo…
              </div>
            ) : creative?.thumbnailUrl ? (
              <img src={creative.thumbnailUrl} alt="" className="trafego-ad-preview-thumb" />
            ) : (
              <div className="trafego-ad-preview-empty">Sem preview do criativo nesta conta</div>
            )}
          </div>
          <dl className="trafego-ad-preview-kpis">
            <div>
              <dt>Resultado</dt>
              <dd>{result.line || '—'}</dd>
            </div>
            <div>
              <dt>Gasto</dt>
              <dd>{formatMoney(metrics.spend)}</dd>
            </div>
            <div>
              <dt>CTR</dt>
              <dd>{formatCtr(metrics)}</dd>
            </div>
            <div>
              <dt>Impressões</dt>
              <dd>{Number(metrics.impressions || 0).toLocaleString('pt-BR')}</dd>
            </div>
            <div>
              <dt>Cliques</dt>
              <dd>{Number(metrics.clicks || 0).toLocaleString('pt-BR')}</dd>
            </div>
          </dl>
          {adsManagerUrl ? (
            <Button type="button" variant="outline" size="sm" asChild>
              <a href={adsManagerUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                Abrir no Ads Manager
              </a>
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
