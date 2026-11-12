import React, { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/customSupabaseClient';
import { formatCount, formatMoney } from '@/lib/trafficPerformanceReport';
import { loadPortalPerformance, PORTAL_PERFORMANCE_OBJECTIVES, PORTAL_PERFORMANCE_REASONS } from '@/lib/gestorIaPortalPerformance';

const day = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit' });
const stamp = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
const periodLabel = ({ since, until }) => `${day.format(new Date(since))} a ${day.format(new Date(until))}`;
const dayCount = ({ since, until }) => (Date.parse(until) - Date.parse(since)) / 86400000 + 1;
const shown = (value, format) => value === null ? '—' : format(value);

export function PortalPerformanceSummary({ result }) {
  const p = result.performance;
  if (!p) return <p className="text-sm text-muted-foreground">{PORTAL_PERFORMANCE_REASONS[result.reason]}</p>;
  const spec = PORTAL_PERFORMANCE_OBJECTIVES[p.objective];
  const money = (value) => formatMoney(value, p.currency);
  const maxSpend = Math.max(...p.weeks.map((week) => week.spend ?? 0), 1);
  const values = (row) => [shown(row.spend, money), shown(row.result, formatCount), shown(row.cost, money)];
  const labels = ['Investimento', spec.volume, spec.cost];
  return <div className="space-y-4">
    <p className="text-xs text-muted-foreground">Meta Ads · {periodLabel(p.period)} · Leitura salva em {stamp.format(new Date(p.fetchedAt))}</p>
    <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {values(p.total).map((value, index) => <div key={labels[index]} className="rounded-lg border px-3 py-2.5">
        <dt className="text-xs text-muted-foreground">{labels[index]}</dt><dd className="text-lg font-semibold tabular-nums">{value}</dd>
      </div>)}
    </dl>
    {(p.total.measuredDays < dayCount(p.period) || p.excludedAccounts > 0) && <p className="text-xs text-muted-foreground">
      {p.total.measuredDays} de {dayCount(p.period)} dias com leitura em comum.{p.excludedAccounts > 0 && ` Contas de uso compartilhado fora do total: ${p.excludedAccounts}.`}
    </p>}
    <div className="overflow-x-auto">
      <table className="w-full min-w-[400px] text-sm">
        <caption className="pb-2 text-left font-medium">Evolução semanal</caption>
        <thead className="text-xs text-muted-foreground"><tr><th scope="col" className="pb-2 text-left font-medium">Período</th>
          {labels.map((label) => <th key={label} scope="col" className="pb-2 text-right font-medium">{label}</th>)}</tr></thead>
        <tbody className="divide-y border-t">
          {p.weeks.map((week) => <tr key={week.since}>
            <th scope="row" className="py-2 pr-3 text-left font-medium">{periodLabel(week)}
              {week.measuredDays < dayCount(week) && <small className="block font-normal text-muted-foreground">{week.measuredDays} de {dayCount(week)} dias</small>}</th>
            {values(week).map((value, index) => <td key={labels[index]} className="py-2 pl-2 text-right tabular-nums">{value}
              {index === 0 && week.spend > 0 && <div className="ml-auto mt-1 h-1 w-20 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div className="h-full rounded-full bg-primary" style={{ width: `${week.spend / maxSpend * 100}%` }} />
              </div>}</td>)}
          </tr>)}
        </tbody>
      </table>
    </div>
  </div>;
}

export default function ClientPortalPerformance({ clientId }) {
  const [result, setResult] = useState(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    loadPortalPerformance(supabase, clientId).then((data) => { if (active) setResult(data); })
      .catch(() => { if (active) setResult({ error: true }); });
    return () => { active = false; };
  }, [clientId, revision]);
  if (!result?.shared && !result?.error) return null;
  return <Card role="region" aria-label="Desempenho de mídia">
    <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-4 w-4" aria-hidden="true" />Desempenho de mídia</CardTitle></CardHeader>
    <CardContent>{result.error ? <div className="flex flex-wrap items-center gap-2"><p role="alert" className="text-sm">Não foi possível consultar os números.</p>
      <Button type="button" variant="outline" size="sm" onClick={() => { setResult(null); setRevision((n) => n + 1); }}>Tentar novamente</Button></div>
      : <PortalPerformanceSummary result={result} />}</CardContent>
  </Card>;
}
