import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, TrendingUp, Calendar, DollarSign, Loader2 } from 'lucide-react';

export default function CrmVisaoGeral({ metrics, loading }) {
  if (loading) {
    return (
      <Card className="dark:bg-gray-800/50 dark:border-gray-700/50 border border-gray-200/50 shadow-sm rounded-xl">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
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

  const cards = [
    { title: 'Total de leads', value: totalLeads, icon: Users },
    { title: 'Agendamentos', value: agendamentos, icon: Calendar },
    { title: 'Comparecimentos', value: comparecimentos, icon: TrendingUp },
    { title: 'Vendas', value: vendas, icon: TrendingUp },
    { title: 'Valor total (vendas)', value: valorTotal, format: 'currency', icon: DollarSign },
  ];

  if (funnelMovimentos > 0 || funnelGanhos > 0 || funnelPerdas > 0) {
    cards.push(
      { title: 'Movimentações (funil)', value: funnelMovimentos, icon: TrendingUp },
      { title: 'Ganhos (eventos)', value: funnelGanhos, icon: TrendingUp },
      { title: 'Perdas (eventos)', value: funnelPerdas, icon: TrendingUp }
    );
  }

  return (
    <Card className="dark:bg-gray-800/50 dark:border-gray-700/50 border border-gray-200/50 shadow-sm rounded-xl">
      <CardHeader className="p-3 sm:p-4">
        <CardTitle className="text-sm font-semibold dark:text-white">Visão geral</CardTitle>
        <CardDescription className="text-xs text-muted-foreground dark:text-gray-400 mt-0.5">
          Resumo dos leads com base nos filtros atuais. Altere os filtros na aba Leads para refinar os números.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-3 sm:p-4 pt-0">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => {
            const Icon = c.icon;
            const display =
              c.format === 'currency'
                ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(c.value))
                : String(c.value);
            return (
              <Card
                key={c.title}
                className="dark:bg-gray-800/50 dark:border-gray-700/50 border border-gray-200/50 shadow-sm rounded-lg"
              >
                <CardHeader className="flex flex-row items-center justify-between pb-1 p-3">
                  <CardTitle className="text-xs font-medium text-muted-foreground dark:text-gray-400">{c.title}</CardTitle>
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <div className="text-lg font-bold dark:text-white">{display}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        {funnelMotivosPerda.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <h4 className="text-xs font-medium text-muted-foreground dark:text-gray-400 mb-2">Motivos de perda (últimos)</h4>
            <ul className="text-xs space-y-1 max-h-32 overflow-y-auto">
              {funnelMotivosPerda.slice(0, 10).map((motivo, i) => (
                <li key={i} className="truncate" title={motivo}>
                  {motivo}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
