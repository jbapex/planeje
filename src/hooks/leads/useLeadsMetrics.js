import { useMemo } from 'react';
import { parseISO, startOfMonth, endOfMonth, isWithinInterval, startOfWeek, endOfWeek, getWeek, getYear, eachDayOfInterval, startOfDay, format } from 'date-fns';
import { useClienteCrmSettings } from '@/contexts/ClienteCrmSettingsContext';

export default function useLeadsMetrics(leads, filters, extra = {}) {
  const { settings } = useClienteCrmSettings();
  const { funnelEvents = [], stages = [] } = extra;

  const metrics = useMemo(() => {
    const now = new Date();
    const startDate = filters?.dateRange?.from || startOfMonth(now);
    const endDate = filters?.dateRange?.to || endOfMonth(now);

    const leadsInDateRange = (leads || []).filter((lead) => {
      if (!lead.data_entrada) return false;
      try {
        const leadDate = typeof lead.data_entrada === 'string' && lead.data_entrada.includes('T')
          ? parseISO(lead.data_entrada)
          : new Date(lead.data_entrada);
        return isWithinInterval(leadDate, { start: startDate, end: endDate });
      } catch {
        return false;
      }
    });

    const totalLeads = leadsInDateRange.length;
    const agendamentos = leadsInDateRange.filter((l) => l.agendamento).length;
    const comparecimentos = leadsInDateRange.filter((l) => ['compareceu', 'vendeu'].includes(l.status)).length;
    const vendas = leadsInDateRange.filter((l) => l.status === 'vendeu').length;
    const noShow = leadsInDateRange.filter((l) => l.status === settings?.noshow_status).length;
    const valorTotal = leadsInDateRange
      .filter((l) => l.status === 'vendeu')
      .reduce((sum, lead) => sum + (Number(lead.valor) || 0), 0);

    const weeklyData = (leads || []).reduce((acc, lead) => {
      if (!lead.data_entrada) return acc;
      let leadDate;
      try {
        leadDate = typeof lead.data_entrada === 'string' && lead.data_entrada.includes('T')
          ? parseISO(lead.data_entrada)
          : new Date(lead.data_entrada);
      } catch {
        return acc;
      }
      const year = getYear(leadDate);
      const week = getWeek(leadDate, { weekStartsOn: 1 });
      const weekKey = `${year}-W${String(week).padStart(2, '0')}`;
      if (!acc[weekKey]) {
        const start = startOfWeek(leadDate, { weekStartsOn: 1 });
        const end = endOfWeek(leadDate, { weekStartsOn: 1 });
        acc[weekKey] = { week: weekKey, startDate: start, endDate: end, leads: 0, agendados: 0, compareceu: 0, vendeu: 0, noShow: 0, valor: 0 };
      }
      acc[weekKey].leads++;
      if (lead.agendamento) acc[weekKey].agendados++;
      if (['compareceu', 'vendeu'].includes(lead.status)) acc[weekKey].compareceu++;
      if (lead.status === 'vendeu') {
        acc[weekKey].vendeu++;
        acc[weekKey].valor += Number(lead.valor) || 0;
      }
      if (lead.status === settings?.noshow_status) acc[weekKey].noShow++;
      return acc;
    }, {});

    const ganhoStageIds = new Set(stages.filter((s) => s.tipo === 'ganho').map((s) => s.id));
    const perdidoStageIds = new Set(stages.filter((s) => s.tipo === 'perdido').map((s) => s.id));
    const concluidoStageIds = new Set([...ganhoStageIds, ...perdidoStageIds]);
    const funnelGanhos = funnelEvents.filter((e) => e.stage_nova_id && ganhoStageIds.has(e.stage_nova_id)).length;
    const funnelPerdas = funnelEvents.filter((e) => e.stage_nova_id && perdidoStageIds.has(e.stage_nova_id)).length;
    const funnelMotivosPerda = funnelEvents
      .filter((e) => e.stage_nova_id && perdidoStageIds.has(e.stage_nova_id) && e.motivo_ganho_perdido)
      .map((e) => e.motivo_ganho_perdido);

    const startDay = startOfDay(startDate);
    const endDay = startOfDay(endDate);
    const days = eachDayOfInterval({ start: startDay, end: endDay });
    const dailyData = days.map((day) => {
      const dayStr = format(day, 'yyyy-MM-dd');
      const novos = (leads || []).filter((lead) => {
        if (!lead.data_entrada) return false;
        try {
          const d = typeof lead.data_entrada === 'string' && lead.data_entrada.includes('T')
            ? parseISO(lead.data_entrada)
            : new Date(lead.data_entrada);
          return format(startOfDay(d), 'yyyy-MM-dd') === dayStr;
        } catch {
          return false;
        }
      }).length;
      const concluidos = funnelEvents.filter((e) => {
        if (!e.realizado_em || !e.stage_nova_id || !concluidoStageIds.has(e.stage_nova_id)) return false;
        try {
          const d = typeof e.realizado_em === 'string' ? parseISO(e.realizado_em) : new Date(e.realizado_em);
          return format(startOfDay(d), 'yyyy-MM-dd') === dayStr;
        } catch {
          return false;
        }
      }).length;
      return { dateKey: dayStr, date: day, novos, concluidos };
    });

    return {
      totalLeads,
      agendamentos,
      comparecimentos,
      vendas,
      noShow,
      valorTotal,
      weeklyData: Object.values(weeklyData).sort((a, b) => b.week.localeCompare(a.week)),
      funnelMovimentos: funnelEvents.length,
      funnelGanhos,
      funnelPerdas,
      funnelMotivosPerda,
      dailyData,
    };
  }, [leads, filters?.dateRange, settings?.noshow_status, funnelEvents, stages]);

  return metrics;
}
