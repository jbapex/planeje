import { dateRange, monthRange, REPORT_METRICS } from './trafficPerformanceReport.js';

export const GESTOR_REPORT_WINDOWS = {
  last7: 'Últimos 7 dias', lastWeek: 'Semana anterior', month: 'Mês até ontem', lastMonth: 'Mês anterior',
};
export const DEFAULT_REPORT_MODEL = { name: '', window_key: 'last7', metrics: ['spend', 'result', 'cost'], tone: '',
  compare_previous: true, include_creatives: false, include_routine: true };
const keys = new Set(REPORT_METRICS.map(({ key }) => key));
const modelFields = 'id,revision,name,window_key,metrics,tone,compare_previous,include_creatives,include_routine';

export function reportModelPeriod(key, now = new Date()) {
  if (!Object.hasOwn(GESTOR_REPORT_WINDOWS, key)) return null;
  const formatter = new Intl.DateTimeFormat('en', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
  const { year, month, day: monthDay } = Object.fromEntries(formatter.formatToParts(now).map(({ type, value }) => [type, value]));
  const today = `${year}-${month}-${monthDay}`;
  const stamp = Date.parse(today);
  const day = (offset) => new Date(stamp + offset * 86400000).toISOString().slice(0, 10);
  if (key === 'last7') return dateRange(day(-7), day(-1));
  if (key === 'lastWeek') {
    const daysSinceMonday = (new Date(stamp).getUTCDay() + 6) % 7;
    return dateRange(day(-daysSinceMonday - 7), day(-daysSinceMonday - 1));
  }
  const first = `${today.slice(0, 7)}-01`;
  if (key === 'month') return dateRange(first, day(-1));
  return monthRange(new Date(Date.parse(first) - 86400000).toISOString().slice(0, 7));
}

function configOf(model) {
  const name = typeof model.name === 'string' ? model.name.trim() : '';
  const tone = typeof model.tone === 'string' ? model.tone.trim().replace(/\s+/g, ' ') : '';
  if (!name || name.length > 80 || tone.length > 240 || !Object.hasOwn(GESTOR_REPORT_WINDOWS, model.window_key)) throw new Error('Confira o nome, a janela e o tom do modelo.');
  if (!Array.isArray(model.metrics) || !model.metrics.length || new Set(model.metrics).size !== model.metrics.length ||
      model.metrics.some((key) => !keys.has(key))) throw new Error('Escolha pelo menos um indicador válido.');
  const { compare_previous, include_creatives, include_routine } = model;
  if (![compare_previous, include_creatives, include_routine].every((value) => typeof value === 'boolean')) throw new Error('Confira as opções do modelo.');
  return { name, window_key: model.window_key, metrics: model.metrics, tone, compare_previous, include_creatives, include_routine };
}

function savedModel(row) {
  if (typeof row?.id !== 'string' || !Number.isSafeInteger(row.revision) || row.revision < 1) throw new Error('Modelo de relatório inválido.');
  return { id: row.id, revision: row.revision, ...configOf(row) };
}

export async function loadReportModels(db) {
  const rows = [];
  for (;;) {
    const { data, error } = await db.from('gestor_ia_modelos_relatorio').select(modelFields).order('name').order('id')
      .range(rows.length, rows.length + 249);
    if (error || !Array.isArray(data)) throw new Error('Não foi possível consultar os modelos.');
    if (!data.length) return rows;
    rows.push(...data.map(savedModel));
  }
}

export async function loadClientReportModel(db, clientId) {
  const { data, error } = await db.from('gestor_ia_modelos_por_cliente').select('model_id,revision').eq('client_id', clientId).maybeSingle();
  if (error || data && (!Number.isSafeInteger(data.revision) || data.revision < 1 || data.model_id !== null && typeof data.model_id !== 'string')) {
    throw new Error('Não foi possível consultar o modelo do cliente.');
  }
  return data || { model_id: null, revision: 0 };
}

function writeError(error, message) {
  const conflict = error?.code === '40001';
  return Object.assign(new Error(conflict ? 'O modelo mudou em outra tela. Reabra para conferir a versão atual.'
    : error?.code === '23505' ? 'Já existe um modelo com esse nome.' : message), { conflict });
}

export async function saveReportModel(db, model) {
  const { data, error } = await db.rpc('gestor_ia_salvar_modelo_relatorio', { p_id: model.id || null, p_revision: model.revision || 0, p_config: configOf(model) });
  if (error || !data) throw writeError(error, 'Não foi possível salvar o modelo.');
  return savedModel(data);
}

export async function saveClientReportModel(db, clientId, modelId, revision) {
  const { data, error } = await db.rpc('gestor_ia_configurar_modelo_cliente', { p_client_id: clientId, p_model_id: modelId, p_revision: revision });
  if (error || data?.model_id !== modelId || !Number.isSafeInteger(data?.revision)) throw writeError(error, 'Não foi possível salvar o modelo do cliente.');
  return data;
}
