import React, { useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Users, TrendingUp, Calendar as CalendarIcon, DollarSign, Loader2, ArrowLeft, Plus, Minus, Info } from 'lucide-react';
import { format, startOfMonth, endOfMonth, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function CrmVisaoGeral({ metrics, loading, filters, setFilters, refetchLeads }) {
  const hasPeriod = filters?.dateRange?.from;
  const periodStart = hasPeriod ? filters.dateRange.from : startOfMonth(new Date());
  const periodEnd = hasPeriod ? (filters.dateRange.to || filters.dateRange.from) : endOfMonth(new Date());
  const daysInPeriod = Math.max(1, differenceInDays(periodEnd, periodStart) + 1);

  useEffect(() => {
    if (!hasPeriod && setFilters) {
      const now = new Date();
      setFilters((p) => ({ ...p, month: 'all', dateRange: { from: startOfMonth(now), to: endOfMonth(now) } }));
    }
  }, [hasPeriod, setFilters]);

  if (loading) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const m = metrics || {};
  const totalLeads = m.totalLeads ?? 0;
  const vendas = m.vendas ?? 0;
  const valorTotal = m.valorTotal ?? 0;
  const agendamentos = m.agendamentos ?? 0;
  const comparecimentos = m.comparecimentos ?? 0;
  const funnelMovimentos = m.funnelMovimentos ?? 0;
  const funnelGanhos = m.funnelGanhos ?? 0;
  const funnelPerdas = m.funnelPerdas ?? 0;
  const funnelMotivosPerda = m.funnelMotivosPerda ?? [];
  const dailyData = m.dailyData ?? [];

  const concluidosNoPeriodo = funnelGanhos + funnelPerdas;
  const mediaNovosPorDia = daysInPeriod > 0 ? (totalLeads / daysInPeriod).toFixed(1) : '0';
  const mediaConcluidosPorDia = daysInPeriod > 0 ? (concluidosNoPeriodo / daysInPeriod).toFixed(1) : '0';
  const desempenho = totalLeads > 0 ? Math.round((concluidosNoPeriodo / totalLeads) * 100) : 0;
  const maxVal = Math.max(1, ...dailyData.map((d) => Math.max(d.novos, d.concluidos)));

  return (
    <div className="flex flex-col gap-6 p-4 pb-8 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-xl font-semibold text-foreground">Relatórios</h1>
        <div className="flex flex-wrap items-center gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-10 font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {hasPeriod
                  ? filters.dateRange.to
                    ? `${format(periodStart, 'dd/MM/yyyy', { locale: ptBR })} – ${format(periodEnd, 'dd/MM/yyyy', { locale: ptBR })}`
                    : format(periodStart, 'dd/MM/yyyy', { locale: ptBR })
                  : 'Período'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                locale={ptBR}
                defaultMonth={periodStart}
                selected={{ from: periodStart, to: periodEnd }}
                onSelect={(range) =>
                  setFilters?.((p) => ({
                    ...p,
                    month: 'all',
                    dateRange: range?.from ? { from: range.from, to: range.to || range.from } : undefined,
                  }))
                }
                numberOfMonths={2}
              />
              {hasPeriod && (
                <div className="p-2 border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => setFilters?.((p) => ({ ...p, month: 'all', dateRange: undefined }))}
                  >
                    Limpar período
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-slate-100 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-300 dark:bg-slate-600">
              <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-300" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Pendentes antes</p>
              <p className="text-lg font-bold text-foreground">—</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-200 dark:bg-emerald-800">
              <Plus className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Novos no período</p>
              <p className="text-lg font-bold text-foreground">{totalLeads}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-200 dark:bg-blue-800">
              <Minus className="h-5 w-5 text-blue-700 dark:text-blue-300" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Concluídos no período</p>
              <p className="text-lg font-bold text-foreground">{concluidosNoPeriodo}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-200 dark:bg-amber-800">
              <Users className="h-5 w-5 text-amber-700 dark:text-amber-300" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Pendentes após</p>
              <p className="text-lg font-bold text-foreground">—</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Capacidade do funil</CardTitle>
          <CardDescription>Novos leads x concluídos (ganhos + perdas) por dia no período selecionado.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex-1 min-w-0">
              <div className="flex items-end gap-0.5 h-48 overflow-x-auto pb-2">
                {dailyData.length === 0 ? (
                  <div className="flex items-center justify-center w-full h-full text-sm text-muted-foreground">
                    Nenhum dado no período
                  </div>
                ) : (
                  dailyData.map((d) => (
                    <div key={d.dateKey} className="flex-1 min-w-[24px] flex flex-col items-center gap-0.5" title={`${format(d.date, 'dd/MM', { locale: ptBR })}: ${d.novos} novos, ${d.concluidos} concluídos`}>
                      <div
                        className="w-full bg-blue-500/80 dark:bg-blue-500 rounded-t min-h-[2px] transition-all"
                        style={{ height: `${(d.novos / maxVal) * 60}px` }}
                      />
                      <div
                        className="w-full bg-amber-500/80 dark:bg-amber-500 rounded-t min-h-[2px] transition-all"
                        style={{ height: `${(d.concluidos / maxVal) * 60}px` }}
                      />
                      <span className="text-[10px] text-muted-foreground mt-1 truncate w-full text-center">
                        {format(d.date, 'dd/MM', { locale: ptBR })}
                      </span>
                    </div>
                  ))
                )}
              </div>
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded bg-blue-500" /> Novos
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded bg-amber-500" /> Concluídos
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-3 lg:w-48 shrink-0">
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  Novos <Info className="h-3 w-3" />
                </p>
                <p className="text-xl font-bold">{totalLeads}</p>
                <p className="text-xs text-muted-foreground">média {mediaNovosPorDia}/dia</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  Concluídos <Info className="h-3 w-3" />
                </p>
                <p className="text-xl font-bold">{concluidosNoPeriodo}</p>
                <p className="text-xs text-muted-foreground">média {mediaConcluidosPorDia}/dia</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  Desempenho <Info className="h-3 w-3" />
                </p>
                <p className="text-xl font-bold">{desempenho}%</p>
                <p className="text-xs text-muted-foreground">conversão no período</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              Agendamentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{agendamentos}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Comparecimentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{comparecimentos}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Vendas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{vendas}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              Valor total (vendas)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valorTotal))}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Movimentações (funil)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{funnelMovimentos}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Ganhos / Perdas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">
              <span className="text-emerald-600 dark:text-emerald-400">{funnelGanhos}</span>
              <span className="text-muted-foreground mx-1">/</span>
              <span className="text-red-600 dark:text-red-400">{funnelPerdas}</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {funnelMotivosPerda.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Motivos de perda (últimos)</CardTitle>
            <CardDescription>Motivos informados ao mover leads para etapas de perda.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="text-sm space-y-1 max-h-32 overflow-y-auto">
              {funnelMotivosPerda.slice(0, 10).map((motivo, i) => (
                <li key={i} className="truncate" title={motivo}>
                  {motivo}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
