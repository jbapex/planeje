/** Etiquetas só de análise no Rastreamento. Não disparam CAPI. */
export const DEFAULT_ANALYSIS_LABELS = [
  { id: 'nao_responde', name: 'Não responde', color: '#d97706' },
  { id: 'desqualificado', name: 'Desqualificado', color: '#dc2626' },
];

export const ANALYSIS_LABELS_KEY = 'planeje_labels';

function foldLabel(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function normalizeAnalysisLabelName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function isAnalysisLabel(value, extra = []) {
  const key = foldLabel(value);
  if (!key) return false;
  if (DEFAULT_ANALYSIS_LABELS.some((item) => foldLabel(item.name) === key || item.id === key)) return true;
  return (extra || []).some((item) => foldLabel(item?.name || item) === key);
}

export function labelsFromTracking(tracking) {
  const td = tracking && typeof tracking === 'object' ? tracking : {};
  const raw = td[ANALYSIS_LABELS_KEY];
  return Array.isArray(raw) ? raw.map(normalizeAnalysisLabelName).filter(Boolean) : [];
}

export function resolveAnalysisLabels({ contact = null, lead = null, extraCatalog = [] } = {}) {
  const fromTracking = [
    ...labelsFromTracking(contact?.tracking_data),
    ...labelsFromTracking(lead?.tracking_data),
  ];
  const fromLead = (Array.isArray(lead?.etiquetas) ? lead.etiquetas : [])
    .map(normalizeAnalysisLabelName)
    .filter((name) => isAnalysisLabel(name, extraCatalog));
  const seen = new Set();
  return [...fromTracking, ...fromLead].filter((name) => {
    const key = foldLabel(name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function rowHasAnalysisLabel(row, wanted, extraCatalog = []) {
  const want = foldLabel(wanted);
  if (!want) return false;
  return resolveAnalysisLabels({
    contact: row?._fromLead ? null : row,
    lead: row?._leadRef || (row?._fromLead ? row : null),
    extraCatalog,
  }).some((name) => foldLabel(name) === want);
}

export function mergeAnalysisCatalog(extra = []) {
  const items = [];
  const seen = new Set();
  for (const item of [...DEFAULT_ANALYSIS_LABELS, ...(extra || [])]) {
    const name = normalizeAnalysisLabelName(item?.name || item);
    if (!name) continue;
    const key = foldLabel(name);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      id: item?.id || key.replace(/\s+/g, '_'),
      name,
      color: item?.color || '#64748b',
    });
  }
  return items;
}

export function catalogFromRows(rows = [], extra = []) {
  const extras = [...(extra || [])];
  for (const row of rows) {
    resolveAnalysisLabels({
      contact: row?._fromLead ? null : row,
      lead: row?._leadRef || (row?._fromLead ? row : null),
    }).forEach((name) => {
      if (!DEFAULT_ANALYSIS_LABELS.some((item) => foldLabel(item.name) === foldLabel(name))) {
        extras.push({ name });
      }
    });
  }
  return mergeAnalysisCatalog(extras);
}

export function countAnalysisLabel(rows, labelName, extraCatalog = []) {
  return (rows || []).filter((row) => rowHasAnalysisLabel(row, labelName, extraCatalog)).length;
}

export function mergeTrackingAnalysisLabels(tracking, labels) {
  const current = tracking && typeof tracking === 'object' ? { ...tracking } : {};
  current[ANALYSIS_LABELS_KEY] = [...new Set((labels || []).map(normalizeAnalysisLabelName).filter(Boolean))];
  return current;
}

export function withoutAnalysisLabels(list, extraCatalog = []) {
  return (Array.isArray(list) ? list : []).filter((name) => !isAnalysisLabel(name, extraCatalog));
}

/** Linha do Relatório (contato + lead ligado) ou contato puro da conversa real. */
export function analysisLabelsForReportRow(row, extraCatalog = []) {
  return resolveAnalysisLabels({
    contact: row?._contactRow || row,
    lead: row?._detailLead || row?._leadRef || null,
    extraCatalog,
  });
}

export function reportRowHasAnalysisLabel(row, wanted, extraCatalog = []) {
  const want = foldLabel(wanted);
  if (!want) return false;
  return analysisLabelsForReportRow(row, extraCatalog).some((name) => foldLabel(name) === want);
}

export function bumpAnalysisCounts(target, row, extraCatalog = []) {
  const next = target || { naoResponde: 0, desqualificado: 0 };
  const names = analysisLabelsForReportRow(row, extraCatalog);
  if (names.some((name) => foldLabel(name) === 'nao responde')) {
    next.naoResponde = (next.naoResponde || 0) + 1;
  }
  if (names.some((name) => foldLabel(name) === 'desqualificado')) {
    next.desqualificado = (next.desqualificado || 0) + 1;
  }
  return next;
}

export function tallyAnalysisLabels(rows, extraCatalog = []) {
  const used = [];
  for (const row of rows || []) {
    analysisLabelsForReportRow(row, extraCatalog).forEach((name) => used.push({ name }));
  }
  const catalog = mergeAnalysisCatalog([...(extraCatalog || []), ...used]);
  return catalog.map((item) => ({
    ...item,
    count: (rows || []).filter((row) => reportRowHasAnalysisLabel(row, item.name, catalog)).length,
  }));
}
