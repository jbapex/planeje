import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/customSupabaseClient';
import { googleDataProductErrorCopy, mapBusinessBoard } from '@/lib/googleDataInsightsView';

function formatNumber(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return new Intl.NumberFormat('pt-BR').format(Number(value));
}

function dayLabel(ymd) {
  const date = String(ymd || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

function SearchBars({ series }) {
  const points = Array.isArray(series) ? series : [];
  const [hoverDate, setHoverDate] = useState('');
  if (!points.length) return null;
  const max = Math.max(0, ...points.map((point) => Number(point.impressions) || 0));
  const every = points.length <= 14 ? 1 : Math.ceil(points.length / 10);
  const tip = points.find((point) => point.date === hoverDate) || null;
  return (
    <div className="ga-daily">
      <h3>Impressões na Pesquisa por dia</h3>
      <p>Passe o mouse no dia. A ficha do Meu Negócio deste cliente; não mistura com a Meta nem com o gasto do Google Ads.</p>
      <div className="ga-daily-bars" role="img" aria-label="Impressões na Pesquisa por dia" onMouseLeave={() => setHoverDate('')}>
        {points.map((point, index) => {
          const show = index === 0 || index === points.length - 1 || index % every === 0;
          const on = hoverDate === point.date;
          return (
            <div
              key={point.date}
              className={on ? 'ga-daily-col is-on' : 'ga-daily-col'}
              tabIndex={0}
              onMouseEnter={() => setHoverDate(point.date)}
              onFocus={() => setHoverDate(point.date)}
              aria-label={`${dayLabel(point.date)}: ${formatNumber(point.impressions)} impressões`}
            >
              <div className="ga-daily-track">
                <div className="ga-daily-bar" style={{ height: `${max ? Math.max(2, ((Number(point.impressions) || 0) / max) * 100) : 2}%` }} />
              </div>
              <span className={show ? 'ga-daily-label' : 'ga-daily-label ga-daily-label--gap'}>{dayLabel(point.date)}</span>
            </div>
          );
        })}
      </div>
      <div className={tip ? 'ga-daily-readout' : 'ga-daily-readout ga-daily-readout--idle'} role="status">
        {tip ? (
          <>
            <strong>{dayLabel(tip.date)}</strong>
            <span>{formatNumber(tip.impressions)} na Pesquisa</span>
            <span>{formatNumber(tip.maps)} no Maps</span>
            <span>{formatNumber(tip.calls)} ligações</span>
          </>
        ) : (
          <span>Passe o mouse no dia para ver Pesquisa, Maps e ligações.</span>
        )}
      </div>
    </div>
  );
}

export default function GoogleBusinessBoard({ clienteId, since, until }) {
  const [loading, setLoading] = useState(false);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [report, setReport] = useState(null);

  const load = useCallback(async () => {
    if (!clienteId || clienteId === 'all' || !since || !until) {
      setReport(null);
      setMissing(false);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data: links, error: linkError } = await supabase
        .from('cliente_google_business_locations')
        .select('location_name, location_title')
        .eq('cliente_id', clienteId)
        .eq('is_active', true)
        .limit(1);
      if (linkError) throw linkError;
      const link = links?.[0];
      if (!link?.location_name) {
        setMissing(true);
        setReport(null);
        setTitle('');
        return;
      }
      setMissing(false);
      setTitle(link.location_title || '');
      const { data, error: fnError } = await supabase.functions.invoke('google-data-api', {
        body: { action: 'get-business-overview', locationName: link.location_name, since, until },
      });
      if (fnError) throw fnError;
      if (data?.error?.message) throw new Error(googleDataProductErrorCopy(data.error.message));
      setReport(mapBusinessBoard(data));
    } catch (err) {
      setReport(null);
      setError(err.message || 'Não foi possível ler o Meu Negócio.');
    } finally {
      setLoading(false);
    }
  }, [clienteId, since, until]);

  useEffect(() => { void load(); }, [load]);

  if (!clienteId || clienteId === 'all') {
    return <p className="ga-board-note">Escolha o cliente. O Meu Negócio lê a ficha vinculada a ele, no período da data acima.</p>;
  }
  if (loading) {
    return <p className="ga-board-note"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Lendo o Meu Negócio…</p>;
  }
  if (missing) {
    return <p className="ga-board-note">Este cliente não tem ficha do Meu Negócio vinculada. O vínculo fica em Rastreamento → Integrações → Analytics.</p>;
  }
  if (error) return <p className="ga-board-note">{error}</p>;
  if (!report) return null;

  return (
    <div className="space-y-4">
      <p className="ga-board-note">
        {title || 'Meu Negócio'} · {since.split('-').reverse().join('/')} a {until.split('-').reverse().join('/')}
        . Impressões, ligações, rotas e cliques no site da ficha. Não entra no gasto da Meta nem do Google Ads.
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          ['Pesquisa', formatNumber(report.impressions)],
          ['Maps', formatNumber(report.maps)],
          ['Ligações', formatNumber(report.calls)],
          ['Rotas', formatNumber(report.directions)],
          ['Site', formatNumber(report.website)],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent><p className="text-2xl font-bold">{value}</p></CardContent>
          </Card>
        ))}
      </div>
      {report.daily.some((point) => point.impressions > 0) ? (
        <Card><SearchBars series={report.daily} /></Card>
      ) : null}
    </div>
  );
}
