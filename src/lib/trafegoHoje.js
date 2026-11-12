import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatMoney } from '@/lib/trafegoFila';
import {
  campaignObjectiveKey,
  entityResultLine,
  extractEntityMetrics,
  metaToggleStatus,
  metaVeiculacaoStatus,
  OBJECTIVE_LABELS,
} from '@/lib/clienteMetaSnapshot';
import { NEXT_ACTIONS, classifyQuality } from '@/lib/trafegoProximaAcao';

function ymdInSaoPaulo(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function weekdayInSaoPaulo(date = new Date()) {
  const wd = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
  }).format(date);
  return { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[wd] || 1;
}

function shiftYmd(ymd, days) {
  const d = parseISO(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + days);
  return format(d, 'yyyy-MM-dd');
}

export function hojePeriods(now = new Date()) {
  const today = ymdInSaoPaulo(now);
  const isMonday = weekdayInSaoPaulo(now) === 1;
  // Recorte móvel de 7 dias todo dia — qualidade/fila; tráfego do dia continua sendo hoje.
  const week = { since: shiftYmd(today, -7), until: shiftYmd(today, -1) };
  return {
    today: { since: today, until: today },
    week,
    showWeekTab: isMonday,
    isMonday,
    todayYmd: today,
  };
}

export function formatHojeHeadline(ymd) {
  const d = parseISO(`${ymd}T12:00:00`);
  const label = format(d, "EEEE, d 'de' MMMM", { locale: ptBR });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatHojeRange(period) {
  if (!period?.since || !period?.until) return '';
  const from = parseISO(`${period.since}T12:00:00`);
  const to = parseISO(`${period.until}T12:00:00`);
  if (period.since === period.until) return format(from, "d 'de' MMM", { locale: ptBR });
  return `${format(from, 'd MMM', { locale: ptBR })} – ${format(to, 'd MMM', { locale: ptBR })}`;
}

function adsetRelevant(adset) {
  const toggle = metaToggleStatus(adset);
  const delivery = metaVeiculacaoStatus(adset);
  const spend = extractEntityMetrics(adset).spend;
  if (delivery.active || spend > 0) return true;
  return toggle.on && delivery.tone === 'issue';
}

function lineForItem(item, objective) {
  const metrics = extractEntityMetrics(item);
  const result = entityResultLine(objective || item.campaign_objective || item.objective, metrics);
  return { ...metrics, ...result };
}

export function buildHojeAccountBrief({ client, campaigns = [], adsets = [], errorMessage = null } = {}) {
  const byCampaign = new Map();
  for (const campaign of campaigns || []) {
    byCampaign.set(String(campaign.id), { campaign, adsets: [] });
  }
  for (const adset of adsets || []) {
    const cid = String(adset.campaign_id || '');
    if (!cid) continue;
    if (!byCampaign.has(cid)) {
      byCampaign.set(cid, {
        campaign: { id: cid, name: adset.campaign_name || 'Campanha', objective: adset.objective },
        adsets: [],
      });
    }
    if (adsetRelevant(adset)) byCampaign.get(cid).adsets.push(adset);
  }

  const groups = [...byCampaign.values()]
    .map((group) => {
      const objective = group.campaign.objective;
      const rows = (group.adsets.length ? group.adsets : adsetRelevant(group.campaign) ? [group.campaign] : [])
        .map((item) => {
          const toggle = metaToggleStatus(item);
          const delivery = metaVeiculacaoStatus(item);
          const result = lineForItem(item, objective);
          return {
            id: item.id,
            name: item.name || 'Conjunto',
            toggle,
            delivery,
            result,
          };
        })
        .sort((a, b) => Number(b.result.spend || 0) - Number(a.result.spend || 0));
      const spend = rows.reduce((sum, row) => sum + Number(row.result.spend || 0), 0);
      let objectiveKey = campaignObjectiveKey(objective);
      const rowMessages = rows.reduce((sum, row) => sum + Number(row.result.messages || 0), 0);
      const rowLeads = rows.reduce((sum, row) => sum + Number(row.result.leads || 0), 0);
      if (objectiveKey === 'leads' && rowMessages > 0 && rowLeads === 0) objectiveKey = 'mensagens';
      return {
        campaignId: group.campaign.id,
        campaignName: group.campaign.name || 'Campanha',
        objectiveKey,
        objective: OBJECTIVE_LABELS[objectiveKey] || 'Outros',
        spend,
        rows,
      };
    })
    .filter((group) => group.rows.length)
    .sort((a, b) => b.spend - a.spend);

  const allRows = groups.flatMap((group) => group.rows);
  const spend = allRows.reduce((sum, row) => sum + Number(row.result.spend || 0), 0);
  const totals = {
    spend,
    leads: 0,
    messages: 0,
    purchases: 0,
    purchaseValue: 0,
    engagements: 0,
    byObjective: {},
  };
  for (const group of groups) {
    const key = group.objectiveKey || 'outros';
    if (!totals.byObjective[key]) {
      totals.byObjective[key] = { spend: 0, leads: 0, messages: 0, purchases: 0, purchaseValue: 0 };
    }
    totals.byObjective[key].spend += Number(group.spend || 0);
    for (const row of group.rows) {
      totals.byObjective[key].leads += Number(row.result.leads || 0);
      totals.byObjective[key].messages += Number(row.result.messages || 0);
      totals.byObjective[key].purchases += Number(row.result.purchases || 0);
      totals.byObjective[key].purchaseValue += Number(row.result.purchaseValue || 0);
    }
  }
  for (const row of allRows) {
    totals.leads += Number(row.result.leads || 0);
    totals.messages += Number(row.result.messages || 0);
    totals.purchases += Number(row.result.purchases || 0);
    totals.purchaseValue += Number(row.result.purchaseValue || 0);
    totals.engagements += Number(row.result.engagements || 0);
  }
  const quality = errorMessage ? null : classifyQuality(totals);
  const delivering = allRows.filter((row) => row.delivery.active).length;
  const issues = allRows.filter((row) => row.delivery.tone === 'issue');
  const issueLabels = [...new Set(issues.map((row) => row.delivery.label))];
  const resultLines = groups
    .map((group) => {
      const first = group.rows[0];
      if (!first?.result?.line || first.result.line === '—') return null;
      return `${group.objective}: ${first.result.line}`;
    })
    .filter(Boolean)
    .slice(0, 2);

  let alert = null;
  let alertKind = null;
  if (errorMessage) {
    alert = errorMessage;
    alertKind = 'error';
  } else if (!allRows.length) {
    alert = 'Sem conjunto com gasto ou interruptor ligado neste recorte';
    alertKind = 'empty';
  } else if (!delivering && issues.length) {
    alert = issueLabels[0] || 'Nada veiculando';
    alertKind = 'issue';
  } else if (!delivering) {
    alert = 'Nada veiculando';
    alertKind = 'idle';
  }

  return {
    client,
    spend,
    delivering,
    sets: allRows.length,
    resultLines,
    alert,
    alertKind,
    issueLabels,
    totals,
    quality,
    groups,
  };
}

/** Alerta que pede ação (pagamento, limite, API), não só “nada veiculando”. */
export function isHardHojeAlert(brief) {
  if (!brief?.alert) return false;
  if (brief.alertKind === 'issue' || brief.alertKind === 'error') return true;
  if (brief.alertKind === 'idle' || brief.alertKind === 'empty') return false;
  return Boolean(brief.issueLabels?.length);
}

/** Dia ganha; se o dia não trouxe o problema da conta, herda o alerta duro da semana. */
export function mergeHojeBriefs(dayRows = [], weekRows = []) {
  const byId = new Map((dayRows || []).filter((brief) => brief?.client?.id).map((brief) => [brief.client.id, { ...brief }]));
  for (const week of weekRows || []) {
    const id = week?.client?.id;
    if (!id) continue;
    let day = byId.get(id);
    if (!day) {
      byId.set(id, { ...week });
      continue;
    }
    if (!isHardHojeAlert(day) && isHardHojeAlert(week)) {
      day = {
        ...day,
        alert: week.alert,
        alertKind: week.alertKind,
        issueLabels: week.issueLabels?.length ? week.issueLabels : day.issueLabels,
      };
    }
    if (!day.quality && week.quality) {
      day = { ...day, quality: week.quality, totals: day.totals?.spend ? day.totals : week.totals };
    } else if (day.quality && week.quality) {
      const dayRank = NEXT_ACTIONS[day.quality.code]?.rank ?? 9;
      const weekRank = NEXT_ACTIONS[week.quality.code]?.rank ?? 9;
      if (weekRank < dayRank) day = { ...day, quality: week.quality };
    }
    byId.set(id, day);
  }
  return sortHojeBriefs([...byId.values()]);
}

export function sortHojeBriefs(list) {
  return [...(list || [])].sort((a, b) => {
    const aAlert = a.alert || a.quality ? 0 : 1;
    const bAlert = b.alert || b.quality ? 0 : 1;
    if (aAlert !== bAlert) return aAlert - bAlert;
    return Number(b.spend || 0) - Number(a.spend || 0);
  });
}

export function hojeBriefStats(list) {
  const rows = list || [];
  return {
    contas: rows.length,
    noAr: rows.filter((row) => row.delivering > 0).length,
    alertas: rows.filter((row) => row.alert || row.quality).length,
    spend: rows.reduce((sum, row) => sum + Number(row.spend || 0), 0),
  };
}

export function formatHojeSpend(value) {
  return formatMoney(value);
}
