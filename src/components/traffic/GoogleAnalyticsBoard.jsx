import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/lib/customSupabaseClient';
import {
  analyticsCampaignLabel,
  analyticsChannelLabel,
  analyticsDelta,
  analyticsDeviceLabel,
  analyticsPageLabel,
  analyticsPlaceLabel,
  analyticsSourceLabel,
  formatDurationSeconds,
  formatRatioPercent,
  formatSignedPercent,
  googleDataProductErrorCopy,
  mapAnalyticsReport,
  shareOf,
} from '@/lib/googleDataInsightsView';

function formatNumber(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return new Intl.NumberFormat('pt-BR').format(Number(value));
}

function dayLabel(ymd) {
  const date = String(ymd || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

function SessionsBars({ series }) {
  const points = Array.isArray(series) ? series : [];
  const [hoverDate, setHoverDate] = useState('');
  if (!points.length) return null;
  const max = Math.max(0, ...points.map((point) => Number(point.sessions) || 0));
  const every = points.length <= 14 ? 1 : Math.ceil(points.length / 10);
  const tip = points.find((point) => point.date === hoverDate) || null;
  return (
    <div className="ga-daily">
      <h3>Sessões por dia</h3>
      <p>Passe o mouse no dia. Propriedade do Analytics deste cliente; não mistura com a Meta nem com o gasto do Google Ads.</p>
      <div className="ga-daily-bars" role="img" aria-label="Sessões por dia" onMouseLeave={() => setHoverDate('')}>
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
              aria-label={`${dayLabel(point.date)}: ${formatNumber(point.sessions)} sessões`}
            >
              <div className="ga-daily-track">
                <div className="ga-daily-bar" style={{ height: `${max ? Math.max(2, (point.sessions / max) * 100) : 2}%` }} />
              </div>
              <span className={show ? 'ga-daily-label' : 'ga-daily-label ga-daily-label--gap'}>{dayLabel(point.date)}</span>
              <div className="ga-daily-balloon" aria-hidden="true">
                <strong>{dayLabel(point.date)}</strong>
                <span>Sessões <b>{formatNumber(point.sessions)}</b></span>
                <span>Usuários <b>{formatNumber(point.users)}</b></span>
                <span>Eventos-chave <b>{formatNumber(point.conversions)}</b></span>
              </div>
            </div>
          );
        })}
      </div>
      <div className={tip ? 'ga-daily-readout' : 'ga-daily-readout ga-daily-readout--idle'} role="status">
        {tip ? (
          <>
            <strong>{dayLabel(tip.date)}</strong>
            <span>{formatNumber(tip.sessions)} sessões</span>
            <span>{formatNumber(tip.users)} usuários</span>
            <span>{formatNumber(tip.conversions)} eventos-chave</span>
          </>
        ) : (
          <span>Passe o mouse no dia para ver sessões, usuários e eventos-chave.</span>
        )}
      </div>
    </div>
  );
}

function ShareTable({ title, hint, rows, labelOf, total, valueKey = 'sessions', extra }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        {rows.length === 0 ? <p className="ga-detail-empty">Sem linhas neste período.</p> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="text-right">Sessões</TableHead>
                <TableHead>Parte</TableHead>
                {extra}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const share = shareOf(row[valueKey], total);
                return (
                  <TableRow key={`${title}-${row.key}`}>
                    <TableCell className="font-medium max-w-[280px]">{labelOf(row)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{formatNumber(row[valueKey])}</TableCell>
                    <TableCell className="min-w-[140px]">
                      <div className="ga-share" title={`${share.toFixed(0)}%`}>
                        <span style={{ width: `${share}%` }} />
                      </div>
                    </TableCell>
                    {row.tail}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export default function GoogleAnalyticsBoard({ clienteId, since, until }) {
  const [loading, setLoading] = useState(false);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState('');
  const [propertyName, setPropertyName] = useState('');
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
        .from('cliente_google_analytics_properties')
        .select('property_id, property_name')
        .eq('cliente_id', clienteId)
        .eq('is_active', true)
        .limit(1);
      if (linkError) throw linkError;
      const link = links?.[0];
      if (!link?.property_id) {
        setMissing(true);
        setReport(null);
        setPropertyName('');
        return;
      }
      setMissing(false);
      setPropertyName(link.property_name || '');
      const { data, error: fnError } = await supabase.functions.invoke('google-data-api', {
        body: { action: 'get-analytics-overview', propertyId: link.property_id, since, until },
      });
      if (fnError) throw fnError;
      if (data?.error?.message) throw new Error(googleDataProductErrorCopy(data.error.message));
      setReport(mapAnalyticsReport({ ...data, since, until }));
    } catch (err) {
      setReport(null);
      setError(err.message || 'Não foi possível ler o Analytics.');
    } finally {
      setLoading(false);
    }
  }, [clienteId, since, until]);

  useEffect(() => { void load(); }, [load]);

  if (!clienteId || clienteId === 'all') {
    return <p className="ga-board-note">Escolha o cliente. O Analytics lê a propriedade vinculada a ele, no período da data acima.</p>;
  }
  if (loading) {
    return <p className="ga-board-note"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Lendo o Analytics…</p>;
  }
  if (missing) {
    return <p className="ga-board-note">Este cliente não tem propriedade do Analytics vinculada. O vínculo fica em Rastreamento → Integrações → Analytics.</p>;
  }
  if (error) return <p className="ga-board-note">{error}</p>;
  if (!report) return null;

  const channelRows = report.channels.map((row) => ({
    key: row.channel,
    sessions: row.sessions,
    tail: (
      <>
        <TableCell className="text-right whitespace-nowrap">{formatNumber(row.users)}</TableCell>
        <TableCell className="text-right whitespace-nowrap">{formatNumber(row.conversions)}</TableCell>
        <TableCell className="text-right whitespace-nowrap">{formatRatioPercent(row.engagementRate)}</TableCell>
      </>
    ),
    label: analyticsChannelLabel(row.channel),
  }));

  return (
    <div className="space-y-4">
      <p className="ga-board-note">
        {propertyName || 'Analytics'} · {since.split('-').reverse().join('/')} a {until.split('-').reverse().join('/')}
        . Sessões, canais, páginas, dispositivos, cidades e eventos-chave. A conta de anúncios de cima não muda esta leitura.
      </p>
      {report.previous ? (
        <p className="ga-board-note">
          Período anterior de mesma duração: {report.previous.since.split('-').reverse().join('/')} a {report.previous.until.split('-').reverse().join('/')}
          {' · '}{formatNumber(report.previous.sessions)} sessões, {formatNumber(report.previous.users)} usuários, {formatNumber(report.previous.conversions)} eventos-chave.
        </p>
      ) : null}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {[
          ['Sessões', formatNumber(report.sessions), analyticsDelta(report.sessions, report.previous?.sessions)],
          ['Usuários', formatNumber(report.users), analyticsDelta(report.users, report.previous?.users)],
          ['Novos', formatNumber(report.newUsers), null],
          ['Engajamento', formatRatioPercent(report.engagementRate), null],
          ['Tempo médio', formatDurationSeconds(report.averageSessionDuration), null],
          ['Eventos-chave', formatNumber(report.conversions), analyticsDelta(report.conversions, report.previous?.conversions)],
        ].map(([label, value, delta]) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{value}</p>
              {delta != null ? <p className="text-xs text-muted-foreground mt-1">{formatSignedPercent(delta)} vs. período anterior</p> : null}
            </CardContent>
          </Card>
        ))}
      </div>
      {report.daily.length > 0 ? <Card><SessionsBars series={report.daily} /></Card> : null}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Campanhas vistas pelo Analytics</CardTitle>
          <p className="text-xs text-muted-foreground">O nome que o GA4 gravou na sessão. Pode diferir do nome da campanha no Google Ads.</p>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {report.campaigns.length === 0 ? <p className="ga-detail-empty">Nenhuma campanha neste período.</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campanha</TableHead>
                  <TableHead className="text-right">Sessões</TableHead>
                  <TableHead className="text-right">Usuários</TableHead>
                  <TableHead className="text-right">Eventos-chave</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.campaigns.map((row) => (
                  <TableRow key={row.campaign}>
                    <TableCell className="font-medium max-w-[320px]">{analyticsCampaignLabel(row.campaign)}</TableCell>
                    <TableCell className="text-right">{formatNumber(row.sessions)}</TableCell>
                    <TableCell className="text-right">{formatNumber(row.users)}</TableCell>
                    <TableCell className="text-right">{formatNumber(row.conversions)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        <ShareTable
          title="Canais"
          hint="De onde a sessão chegou."
          rows={channelRows}
          total={report.sessions}
          labelOf={(row) => row.label}
          extra={(
            <>
              <TableHead className="text-right">Usuários</TableHead>
              <TableHead className="text-right">Eventos-chave</TableHead>
              <TableHead className="text-right">Engajamento</TableHead>
            </>
          )}
        />
        <ShareTable
          title="Dispositivos"
          rows={report.devices.map((row) => ({
            key: row.device,
            sessions: row.sessions,
            label: analyticsDeviceLabel(row.device),
            tail: <TableCell className="text-right">{formatNumber(row.conversions)}</TableCell>,
          }))}
          total={report.sessions}
          labelOf={(row) => row.label}
          extra={<TableHead className="text-right">Eventos-chave</TableHead>}
        />
      </div>
      <ShareTable
        title="Origem / mídia"
        hint="A dupla que o Analytics gravou na sessão."
        rows={report.sources.map((row) => ({
          key: row.source,
          sessions: row.sessions,
          tail: (
            <>
              <TableCell className="text-right">{formatNumber(row.users)}</TableCell>
              <TableCell className="text-right">{formatNumber(row.conversions)}</TableCell>
            </>
          ),
        }))}
        total={report.sessions}
        labelOf={(row) => analyticsSourceLabel(row.key)}
        extra={(
          <>
            <TableHead className="text-right">Usuários</TableHead>
            <TableHead className="text-right">Eventos-chave</TableHead>
          </>
        )}
      />
      <ShareTable
        title="Páginas de destino"
        hint="A primeira página da sessão."
        rows={report.pages.map((row) => ({
          key: row.page,
          sessions: row.sessions,
          tail: <TableCell className="text-right">{formatNumber(row.conversions)}</TableCell>,
        }))}
        total={report.sessions}
        labelOf={(row) => analyticsPageLabel(row.key)}
        extra={<TableHead className="text-right">Eventos-chave</TableHead>}
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <ShareTable
          title="Cidades"
          rows={report.cities.map((row) => ({
            key: row.city,
            sessions: row.sessions,
            label: analyticsPlaceLabel(row.city),
            tail: <TableCell className="text-right">{formatNumber(row.users)}</TableCell>,
          }))}
          total={report.sessions}
          labelOf={(row) => row.label}
          extra={<TableHead className="text-right">Usuários</TableHead>}
        />
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Eventos</CardTitle>
            <p className="text-xs text-muted-foreground">Os 15 eventos com mais disparos no período, inclusive page_view e os eventos-chave.</p>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {report.events.length === 0 ? <p className="ga-detail-empty">Sem eventos neste período.</p> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Evento</TableHead>
                    <TableHead className="text-right">Disparos</TableHead>
                    <TableHead className="text-right">Usuários</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.events.map((row) => (
                    <TableRow key={row.event}>
                      <TableCell className="font-medium">{row.event}</TableCell>
                      <TableCell className="text-right">{formatNumber(row.count)}</TableCell>
                      <TableCell className="text-right">{formatNumber(row.users)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
