const MONTH_NUMBER = {
  JANUARY: 1,
  FEBRUARY: 2,
  MARCH: 3,
  APRIL: 4,
  MAY: 5,
  JUNE: 6,
  JULY: 7,
  AUGUST: 8,
  SEPTEMBER: 9,
  OCTOBER: 10,
  NOVEMBER: 11,
  DECEMBER: 12,
};

const MONTH_LABEL = ['', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export const KEYWORD_TREND_GEO = 'geoTargetConstants/2076';
export const KEYWORD_TREND_LANGUAGE = 'languageConstants/1014';
export const KEYWORD_TREND_MAX_SEEDS = 10;
export const KEYWORD_TREND_PAGE_SIZE = 25;

export function parseKeywordSeeds(raw, max = KEYWORD_TREND_MAX_SEEDS) {
  const parts = String(raw || '')
    .split(/[\n,;]+/)
    .map((part) => part.replace(/^["'`]+|["'`]+$/g, '').replace(/\s+/g, ' ').trim())
    .filter((part) => part.length >= 2 && part.length <= 80);
  const seen = new Set();
  const out = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(part);
    if (out.length >= max) break;
  }
  return out;
}

export function seedsFromAccountKeywords(keywords = [], max = 8) {
  return parseKeywordSeeds(
    (Array.isArray(keywords) ? keywords : []).map((row) => row?.text || row).join('\n'),
    max
  );
}

export function keywordCompetitionLabel(level) {
  const key = String(level || '').toUpperCase();
  if (key === 'HIGH') return 'Alta';
  if (key === 'MEDIUM') return 'Média';
  if (key === 'LOW') return 'Baixa';
  return '—';
}

export function monthNumber(value) {
  const key = String(value || '').toUpperCase();
  if (MONTH_NUMBER[key]) return MONTH_NUMBER[key];
  const n = Number(value);
  return n >= 1 && n <= 12 ? n : 0;
}

export function monthShortLabel(month) {
  return MONTH_LABEL[Number(month) || 0] || '';
}

export function mapKeywordIdea(row = {}) {
  const metrics = row.keywordIdeaMetrics || row.keyword_idea_metrics || row.keywordMetrics || {};
  const volumes = Array.isArray(metrics.monthlySearchVolumes || metrics.monthly_search_volumes)
    ? metrics.monthlySearchVolumes || metrics.monthly_search_volumes
    : Array.isArray(row.monthly)
      ? row.monthly
      : [];
  const monthly = volumes
    .map((point) => ({
      year: Number(point.year) || 0,
      month: monthNumber(point.month),
      searches: Number(point.searches ?? point.monthlySearches ?? point.monthly_searches) || 0,
    }))
    .filter((point) => point.year && point.month)
    .sort((a, b) => a.year - b.year || a.month - b.month);
  const avg = Number(metrics.avgMonthlySearches ?? metrics.avg_monthly_searches ?? row.avgMonthlySearches) || 0;
  const cpcMicros = Number(metrics.averageCpcMicros ?? metrics.average_cpc_micros ?? 0);
  return {
    text: String(row.text || '').trim(),
    avgMonthlySearches: avg,
    competition: String(metrics.competition || row.competition || ''),
    competitionIndex: Number(metrics.competitionIndex ?? metrics.competition_index ?? row.competitionIndex) || 0,
    averageCpc: Number.isFinite(cpcMicros) && cpcMicros > 0 ? cpcMicros / 1_000_000 : Number(row.averageCpc) || 0,
    monthly,
  };
}

export function sortKeywordIdeas(rows = []) {
  return [...(Array.isArray(rows) ? rows : [])]
    .filter((row) => row?.text)
    .sort(
      (a, b) =>
        (Number(b.avgMonthlySearches) || 0) - (Number(a.avgMonthlySearches) || 0) ||
        String(a.text).localeCompare(String(b.text), 'pt-BR')
    );
}

export function keywordTrendBarHeight(value, max) {
  const used = Number(value) || 0;
  const ceiling = Number(max) || 0;
  if (ceiling <= 0) return 8;
  if (used <= 0) return 8;
  return Math.max(10, Math.round((used / ceiling) * 100));
}

export function keywordTrendHover(point) {
  const month = monthShortLabel(point?.month);
  const year = Number(point?.year) || 0;
  const heading = month && year ? `${month}/${String(year).slice(-2)}` : 'Mês';
  return { heading, searches: Number(point?.searches) || 0 };
}

export const PLANNER_EXPLORER_COPY =
  'O Planejador de Palavras-chave pede acesso Básico da API do Google Ads. A conta da agência está no nível Explorer. Peça a atualização em ads.google.com/aw/apicenter. Enquanto isso, o Planeje mostra as palavras reais da conta (30 dias).';

export function isPlannerAccessDenied(raw) {
  const text = String(raw || '');
  return /explorer access|basic or standard access|PLANNER_EXPLORER|nível Explorer|acesso Básico da API/i.test(
    text
  );
}

export function plannerAccessCopy(raw) {
  if (isPlannerAccessDenied(raw)) return PLANNER_EXPLORER_COPY;
  return String(raw || '').trim();
}

export function sortAccountKeywordStats(rows = []) {
  return [...(Array.isArray(rows) ? rows : [])]
    .filter((row) => row?.text)
    .sort(
      (a, b) =>
        (Number(b.impressions) || 0) - (Number(a.impressions) || 0) ||
        String(a.text).localeCompare(String(b.text), 'pt-BR')
    );
}
