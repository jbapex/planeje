export const COLUMN_WIDTH_MIN = 72;
export const COLUMN_WIDTH_MAX = 560;
export const COLUMN_INDEX_WIDTH = 36;
export const COLUMN_REMOVE_WIDTH = 26;

const DEFAULTS = {
  campaign_name: 280,
  adset_name: 180,
  spend: 96,
  messages: 92,
  appointments: 110,
  conversions: 110,
  calls: 88,
  conversion_value: 100,
  daily_budget: 100,
  target_message_cost: 112,
  cpc: 84,
};

export function defaultColumnWidth(key) {
  if (DEFAULTS[key]) return DEFAULTS[key];
  if (String(key).startsWith('cost:')) return 96;
  return 92;
}

export function clampColumnWidth(value) {
  const px = Number(value);
  if (!Number.isFinite(px)) return defaultColumnWidth('spend');
  return Math.min(COLUMN_WIDTH_MAX, Math.max(COLUMN_WIDTH_MIN, Math.round(px)));
}

export function columnWidth(widths, key) {
  const stored = widths && widths[key];
  return stored == null ? defaultColumnWidth(key) : clampColumnWidth(stored);
}

export function sheetTableWidth(columns = [], widths = {}) {
  return COLUMN_INDEX_WIDTH + COLUMN_REMOVE_WIDTH + columns.reduce((sum, column) => sum + columnWidth(widths, column.key), 0);
}

export function applyColumnWidth(widths, key, value) {
  return { ...widths, [key]: clampColumnWidth(value) };
}

export function resetColumnWidth(widths, key) {
  const next = { ...widths };
  delete next[key];
  return next;
}
