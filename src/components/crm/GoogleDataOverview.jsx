import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/customSupabaseClient';
import {
  googleDataProductErrorCopy,
  mapAnalyticsReport,
  mapBusinessPerformance,
  mapTagManagerOverview,
} from '@/lib/googleDataInsightsView';

function formatNumber(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return new Intl.NumberFormat('pt-BR').format(Number(value));
}

export default function GoogleDataOverview({ clienteId, compact = false }) {
  const [loading, setLoading] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [business, setBusiness] = useState(null);
  const [tagmanager, setTagmanager] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!clienteId || clienteId === 'all') {
      setAnalytics(null);
      setBusiness(null);
      setTagmanager(null);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [gaRes, bizRes, gtmRes] = await Promise.all([
        supabase.from('cliente_google_analytics_properties').select('*').eq('cliente_id', clienteId).eq('is_active', true).limit(1),
        supabase.from('cliente_google_business_locations').select('*').eq('cliente_id', clienteId).eq('is_active', true).limit(1),
        supabase.from('cliente_google_tag_containers').select('*').eq('cliente_id', clienteId).eq('is_active', true).limit(1),
      ]);
      if (gaRes.error) throw gaRes.error;
      if (bizRes.error) throw bizRes.error;
      if (gtmRes.error) throw gtmRes.error;
      const ga = gaRes.data?.[0];
      const biz = bizRes.data?.[0];
      const gtm = gtmRes.data?.[0];
      if (!ga && !biz && !gtm) {
        setAnalytics(null);
        setBusiness(null);
        setTagmanager(null);
        return;
      }
      const calls = [];
      if (ga) {
        calls.push(
          supabase.functions.invoke('google-data-api', {
            body: { action: 'get-analytics-overview', propertyId: ga.property_id },
          }).then(({ data, error: fnError }) => {
            if (fnError) throw fnError;
            if (data?.error?.message) setError(googleDataProductErrorCopy(data.error.message));
            setAnalytics({ name: ga.property_name, ...mapAnalyticsReport(data) });
          }),
        );
      } else setAnalytics(null);
      if (biz) {
        calls.push(
          supabase.functions.invoke('google-data-api', {
            body: { action: 'get-business-overview', locationName: biz.location_name },
          }).then(({ data, error: fnError }) => {
            if (fnError) throw fnError;
            if (data?.error?.message) setError(googleDataProductErrorCopy(data.error.message));
            setBusiness({ name: biz.location_title, ...mapBusinessPerformance(data) });
          }),
        );
      } else setBusiness(null);
      if (gtm) {
        calls.push(
          supabase.functions.invoke('google-data-api', {
            body: { action: 'get-tagmanager-overview', accountId: gtm.account_id, containerId: gtm.container_id },
          }).then(({ data, error: fnError }) => {
            if (fnError) throw fnError;
            if (data?.error?.message) setError(googleDataProductErrorCopy(data.error.message));
            setTagmanager({ ...mapTagManagerOverview({ ...gtm, ...data, publicId: data?.publicId || gtm.public_id }) });
          }),
        );
      } else setTagmanager(null);
      await Promise.all(calls);
    } catch (err) {
      setError(err.message || 'Não foi possível ler Analytics, Meu Negócio ou Tag Manager.');
    } finally {
      setLoading(false);
    }
  }, [clienteId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!clienteId || clienteId === 'all') return null;
  if (!loading && !analytics && !business && !tagmanager && !error) return null;

  return (
    <div className={compact ? 'space-y-3' : 'grid gap-3 md:grid-cols-3'}>
      {loading ? <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Lendo Google dados…</p> : null}
      {error ? <p className="text-xs text-muted-foreground md:col-span-3">{error}</p> : null}
      {analytics ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Analytics · 30 dias</CardTitle>
            <p className="text-xs text-muted-foreground">{analytics.name || 'GA4'} · não mistura com a Meta</p>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <p><strong>{formatNumber(analytics.sessions)}</strong> sessões · {formatNumber(analytics.users)} usuários</p>
            <p>{formatNumber(analytics.conversions)} conversões / eventos-chave</p>
            {analytics.channels?.[0] ? <p className="text-xs text-muted-foreground">Topo: {analytics.channels[0].channel}</p> : null}
          </CardContent>
        </Card>
      ) : null}
      {business ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Meu Negócio · 30 dias</CardTitle>
            <p className="text-xs text-muted-foreground">{business.name || 'Ficha'}</p>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <p>{formatNumber(business.impressions)} buscas · {formatNumber(business.maps)} Maps</p>
            <p>{formatNumber(business.calls)} ligações · {formatNumber(business.directions)} rotas · {formatNumber(business.website)} site</p>
          </CardContent>
        </Card>
      ) : null}
      {tagmanager ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Tag Manager</CardTitle>
            <p className="text-xs text-muted-foreground">{tagmanager.publicId || tagmanager.containerName || 'Contêiner'}</p>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <p>{formatNumber(tagmanager.tags)} tags · {formatNumber(tagmanager.triggers)} acionadores na versão publicada</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
