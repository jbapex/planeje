import React, { useEffect, useState } from 'react';
import { format, isValid } from 'date-fns';
import { ExternalLink, Rocket } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { emptyPaid, fetchPaidTraffic } from '@/lib/metaPaidTrafficInsights';

const formatNumber = (value) => {
  const num = typeof value === 'number' ? value : parseFloat(value);
  if (!Number.isFinite(num)) return '—';
  return new Intl.NumberFormat('pt-BR').format(num);
};

const formatMoney = (value) => {
  const num = typeof value === 'number' ? value : parseFloat(value);
  if (!Number.isFinite(num)) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
};

export default function PaidTrafficPanel({
  paid: paidProp = null,
  clientId = null,
  dateRange = null,
}) {
  const [paid, setPaid] = useState(paidProp || emptyPaid());

  useEffect(() => {
    if (paidProp) {
      setPaid(paidProp);
      return undefined;
    }
    if (!clientId || !dateRange?.from || !dateRange?.to || !isValid(dateRange.from) || !isValid(dateRange.to)) {
      return undefined;
    }
    let active = true;
    const timeRange = {
      since: format(dateRange.from, 'yyyy-MM-dd'),
      until: format(dateRange.to, 'yyyy-MM-dd'),
    };
    fetchPaidTraffic({ clientId, timeRange }).then((next) => {
      if (active) setPaid(next);
    });
    return () => { active = false; };
  }, [paidProp, clientId, dateRange]);

  return (
    <Card className="dark:bg-gray-800">
      <CardHeader>
        <CardTitle className="dark:text-white flex items-center gap-2">
          <Rocket className="h-4 w-4" />
          Tráfego pago (Meta Ads)
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Contas de anúncio ligadas a este cliente · mesmo período da Análise
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {paid.note && !(paid.spend || paid.impressions) ? (
          <p className="text-sm text-muted-foreground">
            {paid.note}{' '}
            <Link to="/paid-traffic/dashboard" className="text-violet-600 font-semibold inline-flex items-center gap-1">
              Abrir Tráfego <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="ig-paid-stat">
            <span>Gasto</span>
            <strong>{formatMoney(paid.spend)}</strong>
          </div>
          <div className="ig-paid-stat">
            <span>Impressões</span>
            <strong>{formatNumber(paid.impressions)}</strong>
          </div>
          <div className="ig-paid-stat">
            <span>Cliques</span>
            <strong>{formatNumber(paid.clicks)}</strong>
          </div>
          <div className="ig-paid-stat">
            <span>Alcance pago</span>
            <strong>{formatNumber(paid.reach)}</strong>
          </div>
          <div className="ig-paid-stat">
            <span>Cliques no link</span>
            <strong>{formatNumber(paid.linkClicks)}</strong>
          </div>
          <div className="ig-paid-stat">
            <span>Visitas perfil (ads)</span>
            <strong>{formatNumber(paid.profileVisits)}</strong>
          </div>
        </div>

        {paid.conversations > 0 ? (
          <p className="text-xs text-muted-foreground">
            Conversas iniciadas no período: <strong>{formatNumber(paid.conversations)}</strong>
          </p>
        ) : null}

        {paid.accounts?.length ? (
          <p className="text-xs text-muted-foreground">
            Contas: {paid.accounts.map((acc) => acc.name).join(' · ')}
          </p>
        ) : null}

        {paid.campaigns?.length ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="dark:border-gray-700">
                  <TableHead className="dark:text-white">Campanha</TableHead>
                  <TableHead className="dark:text-white">Gasto</TableHead>
                  <TableHead className="dark:text-white">Impressões</TableHead>
                  <TableHead className="dark:text-white">Cliques</TableHead>
                  <TableHead className="dark:text-white">Link</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paid.campaigns.map((row) => (
                  <TableRow key={`${row.account}-${row.id}`} className="dark:border-gray-700">
                    <TableCell className="dark:text-gray-300 max-w-xs">
                      <div className="font-medium truncate">{row.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{row.account}</div>
                    </TableCell>
                    <TableCell className="dark:text-gray-300">{formatMoney(row.spend)}</TableCell>
                    <TableCell className="dark:text-gray-300">{formatNumber(row.impressions)}</TableCell>
                    <TableCell className="dark:text-gray-300">{formatNumber(row.clicks)}</TableCell>
                    <TableCell className="dark:text-gray-300">{formatNumber(row.linkClicks)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
