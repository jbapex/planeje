/** Campos de insights da Marketing API: `actions:omni_purchase` não é field válido. */

export function adsInsightFields(metrics, fallback = 'spend,impressions,clicks') {
  const raw = Array.isArray(metrics)
    ? metrics.map(String)
    : String(metrics || fallback).split(',');
  const out = new Set();
  for (const item of raw) {
    const field = String(item || '').trim();
    if (!field) continue;
    if (field.includes(':')) {
      out.add(field.split(':')[0]);
      continue;
    }
    out.add(field);
  }
  return [...out];
}

export function adsInsightFieldsParam(metrics, fallback = 'spend,impressions,clicks') {
  const fields = adsInsightFields(metrics, fallback);
  return fields.length ? fields.join(',') : fallback;
}

export function actionMetric(list, types) {
  if (!Array.isArray(list)) return 0;
  const wanted = (types || []).map((t) => String(t).toLowerCase());
  const row = list.find((item) => wanted.includes(String(item?.action_type || '').toLowerCase()));
  const n = Number(row?.value);
  return Number.isFinite(n) ? n : 0;
}
