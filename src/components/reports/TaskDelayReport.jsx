import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, CalendarClock, Users } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { DELAY_REASON_LABELS } from '@/lib/taskDeliveryAccountability';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const formatDate = (value) => value
  ? new Intl.DateTimeFormat('pt-BR').format(new Date(`${String(value).slice(0, 10)}T00:00:00`))
  : '—';

export default function TaskDelayReport({ reportAccess = 'self', profileId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      let query = supabase
        .from('task_delay_report')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (reportAccess === 'self' && profileId) query = query.eq('created_by', profileId);
      const { data, error: queryError } = await query;
      if (!active) return;
      setRows(data || []);
      setError(queryError?.message || '');
      setLoading(false);
    };
    void load();
    return () => { active = false; };
  }, [profileId, reportAccess]);

  const summary = useMemo(() => {
    const reasons = rows.reduce((acc, row) => {
      acc[row.reason_code] = (acc[row.reason_code] || 0) + 1;
      return acc;
    }, {});
    const mainReason = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0];
    return {
      total: rows.length,
      days: rows.reduce((sum, row) => sum + Number(row.production_days_late || row.stage_days_late || 0), 0),
      clients: new Set(rows.map((row) => row.client_id).filter(Boolean)).size,
      mainReason: mainReason ? DELAY_REASON_LABELS[mainReason[0]] || mainReason[0] : 'Sem dados',
    };
  }, [rows]);

  return (
    <Card className="overflow-hidden border-border/70 bg-card/95 shadow-sm">
      <CardHeader className="border-b bg-muted/20 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl"><BarChart3 className="h-5 w-5 text-violet-500" />Motivos de atraso</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Registro das justificativas informadas ao confirmar entregas atrasadas.</p>
          </div>
          <Badge variant="outline">Últimos {Math.min(rows.length, 200)} registros</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid border-b sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Justificativas', value: summary.total, icon: AlertTriangle },
            { label: 'Dias de atraso', value: summary.days, icon: CalendarClock },
            { label: 'Clientes afetados', value: summary.clients, icon: Users },
            { label: 'Causa mais frequente', value: summary.mainReason, icon: BarChart3 },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="border-b p-4 last:border-b-0 sm:border-r xl:border-b-0">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Icon className="h-4 w-4" />{label}</div>
              <p className="mt-2 text-xl font-bold">{value}</p>
            </div>
          ))}
        </div>

        {loading ? (
          <p className="p-5 text-sm text-muted-foreground">Carregando justificativas…</p>
        ) : error ? (
          <p className="p-5 text-sm text-destructive">Não foi possível carregar o relatório: {error}</p>
        ) : rows.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">Nenhum atraso justificado ainda.</p>
        ) : (
          <div className="max-h-[360px] overflow-auto">
            <table className="w-full min-w-[840px] text-left text-sm">
              <thead className="sticky top-0 bg-muted/90 text-xs uppercase tracking-wide text-muted-foreground backdrop-blur">
                <tr>
                  <th className="px-4 py-3">Prazo</th>
                  <th className="px-4 py-3">Cliente e tarefa</th>
                  <th className="px-4 py-3">Motivo</th>
                  <th className="px-4 py-3">Atraso</th>
                  <th className="px-4 py-3">Registrado por</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr key={row.id} className="align-top hover:bg-muted/20">
                    <td className="whitespace-nowrap px-4 py-3">{formatDate(row.due_on)}</td>
                    <td className="max-w-[360px] px-4 py-3"><strong className="block">{row.client_name || 'Sem cliente'}</strong><span className="text-muted-foreground">{row.task_title}</span></td>
                    <td className="max-w-[360px] px-4 py-3"><Badge variant="secondary">{DELAY_REASON_LABELS[row.reason_code] || row.reason_code}</Badge><p className="mt-1.5 text-muted-foreground">{row.details}</p></td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold">{Number(row.delay_days || row.production_days_late || row.stage_days_late || 0)} dia(s)</td>
                    <td className="whitespace-nowrap px-4 py-3">{row.justified_by_name || 'Usuário'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
