import { eachMonthOfInterval, format, parseISO, startOfMonth, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BRASIL_UF_BY_CODE, normalizeUf } from '@/lib/brasilUfs';

function parseDate(raw) {
  if (!raw) return null;
  try {
    const text = String(raw);
    const datePart = text.length >= 10 ? text.slice(0, 10) : text;
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return parseISO(datePart);
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

export function buildMonthlySeries(clients, months = 12, today = new Date()) {
  const end = startOfMonth(today);
  const start = subMonths(end, months - 1);
  const buckets = eachMonthOfInterval({ start, end }).map((month) => ({
    key: format(month, 'yyyy-MM'),
    label: format(month, 'MMM', { locale: ptBR }).replace('.', ''),
    novos: 0,
    churn: 0,
    estoque: 0,
  }));
  const byKey = Object.fromEntries(buckets.map((bucket) => [bucket.key, bucket]));

  for (const client of clients || []) {
    const created = parseDate(client.created_at);
    if (created) {
      const key = format(startOfMonth(created), 'yyyy-MM');
      if (byKey[key]) byKey[key].novos += 1;
    }
    if (client.etapa === 'lost') {
      const lostAt = parseDate(client.updated_at) || created;
      if (lostAt) {
        const key = format(startOfMonth(lostAt), 'yyyy-MM');
        if (byKey[key]) byKey[key].churn += 1;
      }
    }
  }

  for (const bucket of buckets) {
    const [year, month] = bucket.key.split('-').map(Number);
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);
    bucket.estoque = (clients || []).filter((client) => {
      const created = parseDate(client.created_at);
      if (!created || created > monthEnd) return false;
      if (client.etapa !== 'lost') return true;
      const lostAt = parseDate(client.updated_at) || created;
      return lostAt > monthEnd;
    }).length;
  }

  return buckets;
}

export function buildGeoBreakdown(clients) {
  const ufCounts = {};
  const cityMap = {};
  let withGeo = 0;
  let withoutGeo = 0;

  for (const client of clients || []) {
    if (client.etapa === 'lost') continue;
    const uf = normalizeUf(client.estado);
    const cidade = String(client.cidade || '').trim();
    if (!uf && !cidade) {
      withoutGeo += 1;
      continue;
    }
    withGeo += 1;
    if (uf) ufCounts[uf] = (ufCounts[uf] || 0) + 1;
    if (cidade) {
      const key = uf ? `${foldCity(cidade)}|${uf}` : foldCity(cidade);
      if (!cityMap[key]) cityMap[key] = { cidade, uf, count: 0 };
      cityMap[key].count += 1;
    }
  }

  const ufs = Object.entries(ufCounts)
    .map(([uf, count]) => ({
      uf,
      nome: BRASIL_UF_BY_CODE[uf]?.nome || uf,
      count,
    }))
    .sort((a, b) => b.count - a.count || a.uf.localeCompare(b.uf));

  const cidades = Object.values(cityMap).sort(
    (a, b) => b.count - a.count || a.cidade.localeCompare(b.cidade, 'pt-BR'),
  );

  return {
    ufs,
    cidades,
    withGeo,
    withoutGeo,
    maxUf: ufs[0]?.count || 0,
  };
}

function foldCity(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function buildRiskBreakdown(accounts) {
  const counts = { ok: 0, warn: 0, danger: 0 };
  for (const account of accounts || []) {
    const tone = account?.mood?.tone;
    if (tone === 'danger') counts.danger += 1;
    else if (tone === 'warn') counts.warn += 1;
    else counts.ok += 1;
  }
  return { ...counts, total: counts.ok + counts.warn + counts.danger };
}

export function buildOwnerBreakdown(clients, users) {
  const nameById = new Map((users || []).map((user) => [user.id, user.full_name || 'Sem nome']));
  const groups = {};
  for (const client of clients || []) {
    if (client.etapa === 'lost') continue;
    const id = client.responsavel || '__none__';
    if (!groups[id]) {
      groups[id] = {
        id,
        name: id === '__none__' ? 'Sem responsável' : nameById.get(id) || 'Sem responsável',
        count: 0,
        mrr: 0,
      };
    }
    groups[id].count += 1;
    if (client.etapa === 'closed') groups[id].mrr += Number(client.valor) || 0;
  }
  return Object.values(groups).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'));
}

export function buildPriorityAccounts(accounts, limit = 6) {
  return [...(accounts || [])]
    .sort((a, b) => (a.score ?? 101) - (b.score ?? 101) || (a.empresa || '').localeCompare(b.empresa || '', 'pt-BR'))
    .slice(0, limit);
}
