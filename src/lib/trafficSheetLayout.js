const COUNT_FIELDS = new Set(['messages', 'appointments', 'conversions', 'calls', 'simulacoes', 'cpf_bom', 'compras', 'orcamentos', 'lead_qualificado']);
const ALLOWED_METRICS = [
  'spend', 'messages', 'appointments', 'conversions', 'calls', 'simulacoes', 'cpf_bom', 'compras',
  'orcamentos', 'lead_qualificado', 'conversion_value', 'daily_budget', 'target_message_cost', 'cpc',
];

export const RESULT_KPI_PRESETS = [
  { id: 'agendamentos', label: 'Agendamentos' },
  { id: 'mensagens', label: 'Mensagens' },
  { id: 'compras', label: 'Compras no site' },
  { id: 'simulacoes', label: 'Simulações' },
  { id: 'cpf_bom', label: 'CPF bom' },
  { id: 'orcamentos', label: 'Orçamentos' },
  { id: 'lead_qualificado', label: 'Lead qualificado' },
  { id: 'ligacoes', label: 'Ligações' },
  { id: 'leads', label: 'Leads' },
];

export const SHEET_METRIC_OPTIONS = [
  { id: 'spend', label: 'Gasto', always: true },
  { id: 'messages', label: 'Mensagens' },
  { id: 'calls', label: 'Ligações' },
  { id: 'appointments', label: 'Agendamentos' },
  { id: 'conversions', label: 'Resultado principal' },
  { id: 'simulacoes', label: 'Simulações' },
  { id: 'cpf_bom', label: 'CPF bom' },
  { id: 'compras', label: 'Compras' },
  { id: 'orcamentos', label: 'Orçamentos' },
  { id: 'lead_qualificado', label: 'Lead qualificado' },
  { id: 'conversion_value', label: 'Valor das conversões' },
  { id: 'daily_budget', label: 'Orçamento diário' },
  { id: 'target_message_cost', label: 'Meta de custo' },
  { id: 'cpc', label: 'CPC médio' },
];

function foldLabel(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function shortResult(resultLabel) {
  const folded = foldLabel(resultLabel);
  if (/agend/.test(folded)) return 'agend.';
  if (/mensagem/.test(folded)) return 'msg.';
  if (/simulac/.test(folded)) return 'sim.';
  if (/cpf/.test(folded)) return 'cpf';
  if (/compr/.test(folded)) return 'compra';
  if (/orcament/.test(folded)) return 'orç.';
  if (/qualific/.test(folded)) return 'quali';
  if (/lead/.test(folded)) return 'lead';
  if (/liga/.test(folded)) return 'lig.';
  const label = String(resultLabel || 'resultado').trim().split(/[\s/]+/)[0] || 'resultado';
  return label.length > 8 ? `${label.slice(0, 7).toLowerCase()}.` : label.toLowerCase();
}

export function matchResultKpiPreset(resultLabel) {
  const folded = foldLabel(resultLabel);
  if (/agend/.test(folded)) return 'agendamentos';
  if (/mensagem|whats|wpp/.test(folded)) return 'mensagens';
  if (/simulac/.test(folded)) return 'simulacoes';
  if (/cpf/.test(folded)) return 'cpf_bom';
  if (/compr|venda|receita|fatur/.test(folded)) return 'compras';
  if (/orcament/.test(folded)) return 'orcamentos';
  if (/qualific/.test(folded)) return 'lead_qualificado';
  if (/liga/.test(folded)) return 'ligacoes';
  if (/lead/.test(folded)) return 'leads';
  return '';
}

function extraDuplicatesPrimary(id, resultLabel) {
  const preset = matchResultKpiPreset(resultLabel);
  return (id === 'simulacoes' && preset === 'simulacoes')
    || (id === 'cpf_bom' && preset === 'cpf_bom')
    || (id === 'compras' && preset === 'compras')
    || (id === 'orcamentos' && preset === 'orcamentos')
    || (id === 'lead_qualificado' && preset === 'lead_qualificado');
}

export function sheetMetricOptions(resultLabel) {
  const primary = String(resultLabel || '').trim() || 'Resultado principal';
  const folded = foldLabel(primary);
  const conversionLabel = /agend|mensagem|whats|wpp|liga/.test(folded) ? 'Conversões' : primary;
  return SHEET_METRIC_OPTIONS.filter((option) => !extraDuplicatesPrimary(option.id, resultLabel)).map((option) => (
    option.id === 'conversions' ? { ...option, label: conversionLabel } : option
  ));
}

export function inferSheetMetrics(resultLabel) {
  const label = foldLabel(resultLabel);
  if (/agend/.test(label)) return ['spend', 'messages', 'appointments', 'daily_budget', 'target_message_cost'];
  if (/simulac/.test(label)) return ['spend', 'conversions', 'daily_budget', 'target_message_cost'];
  if (/cpf/.test(label)) return ['spend', 'conversions', 'daily_budget', 'target_message_cost'];
  if (/compr|venda|receita|fatur/.test(label)) return ['spend', 'conversions', 'conversion_value', 'daily_budget', 'target_message_cost'];
  if (/orcament/.test(label)) return ['spend', 'conversions', 'daily_budget', 'target_message_cost'];
  if (/qualific/.test(label)) return ['spend', 'messages', 'conversions', 'daily_budget', 'target_message_cost'];
  if (/mensagem|whats|wpp/.test(label)) return ['spend', 'messages', 'daily_budget', 'target_message_cost'];
  if (/lead/.test(label)) return ['spend', 'messages', 'conversions', 'daily_budget', 'target_message_cost'];
  if (/liga/.test(label)) return ['spend', 'calls', 'daily_budget', 'target_message_cost'];
  return ['spend', 'messages', 'appointments', 'conversions', 'daily_budget', 'target_message_cost'];
}

export function normalizeSheetMetrics(raw, resultLabel) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.visible) ? raw.visible : [];
  if (!list.length) return inferSheetMetrics(resultLabel);
  const cleaned = [];
  for (const item of list) {
    const id = String(item || '');
    if (ALLOWED_METRICS.includes(id) && !cleaned.includes(id)) cleaned.push(id);
  }
  if (!cleaned.includes('spend')) cleaned.unshift('spend');
  return cleaned.filter((id) => !extraDuplicatesPrimary(id, resultLabel));
}

/** Move uma coluna numérica. A coluna calculada (R$ / …) permanece grudada nela. */
export function reorderSheetMetrics(metrics, resultLabel, fromId, toId) {
  const current = normalizeSheetMetrics(metrics, resultLabel);
  const from = current.indexOf(fromId);
  const to = current.indexOf(toId);
  if (from < 0 || to < 0 || from === to) return current;
  const next = [...current];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return normalizeSheetMetrics(next, resultLabel);
}

function metricHeader(id, resultLabel) {
  if (id === 'spend') return 'Gasto R$';
  if (id === 'messages') return 'Mensagens';
  if (id === 'calls') return 'Ligações';
  if (id === 'appointments') return 'Agendamentos';
  if (id === 'simulacoes') return 'Simulações';
  if (id === 'cpf_bom') return 'CPF bom';
  if (id === 'compras') return 'Compras';
  if (id === 'orcamentos') return 'Orçamentos';
  if (id === 'lead_qualificado') return 'Lead qualificado';
  if (id === 'conversions') {
    const label = String(resultLabel || 'Resultado').trim() || 'Resultado';
    if (/agend|mensagem|whats|wpp|liga/.test(foldLabel(label))) return 'Conversões';
    return label;
  }
  if (id === 'conversion_value') return 'Valor R$';
  if (id === 'daily_budget') return 'Orçam. / dia';
  if (id === 'target_message_cost') return `Meta R$ / ${shortResult(resultLabel)}`;
  if (id === 'cpc') return 'CPC médio';
  return id;
}

function costColumn(id, resultLabel) {
  if (id === 'messages') return { key: `cost:${id}`, label: 'R$ / msg.', of: 'messages' };
  if (id === 'appointments') return { key: `cost:${id}`, label: 'R$ / agend.', of: 'appointments' };
  if (id === 'conversions') return { key: `cost:${id}`, label: `R$ / ${shortResult(resultLabel)}`, of: 'conversions' };
  if (id === 'calls') return { key: `cost:${id}`, label: 'R$ / lig.', of: 'calls' };
  if (id === 'simulacoes') return { key: `cost:${id}`, label: 'R$ / sim.', of: 'simulacoes' };
  if (id === 'cpf_bom') return { key: `cost:${id}`, label: 'R$ / cpf', of: 'cpf_bom' };
  if (id === 'compras') return { key: `cost:${id}`, label: 'R$ / compra', of: 'compras' };
  if (id === 'orcamentos') return { key: `cost:${id}`, label: 'R$ / orç.', of: 'orcamentos' };
  if (id === 'lead_qualificado') return { key: `cost:${id}`, label: 'R$ / quali', of: 'lead_qualificado' };
  return null;
}

export function buildSheetColumns(metrics, resultLabel, contextOnly = false) {
  const columns = [
    { key: 'campaign_name', label: 'Campanha', role: 'name' },
    { key: 'adset_name', label: 'Conjunto', role: 'name' },
  ];
  if (!contextOnly) {
    for (const id of normalizeSheetMetrics(metrics, resultLabel)) {
      columns.push({ key: id, label: metricHeader(id, resultLabel), role: 'input', numeric: true });
      const cost = costColumn(id, resultLabel);
      if (cost) columns.push({ ...cost, role: 'calc' });
    }
  }
  return columns.map((column, index) => ({ ...column, index }));
}

export function sheetNavIndexes(columns) {
  return columns.filter((column) => column.role !== 'calc').map((column) => column.index);
}

export function requiredCountFields(metrics, resultLabel) {
  return normalizeSheetMetrics(metrics, resultLabel).filter((id) => COUNT_FIELDS.has(id));
}

export function applyConversionLabel(rows = [], resultLabel) {
  const label = String(resultLabel || '').trim();
  if (!label) return rows;
  return rows.map((row) => (row.conversion_label ? row : { ...row, conversion_label: label }));
}
