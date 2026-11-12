import { saoPauloDate, shiftDate } from '../../lib/trafficWeeklyReview.js';

export const HEALTH = {
  saudavel: 'Saudável',
  resultado: 'Com resultado',
  atencao: 'Atenção',
  critico: 'Crítico',
  sem_leitura: 'Sem leitura',
};

export const SIGNAL = {
  critico: 'Saúde crítica',
  cancelamento: 'Possível cancelamento',
  resposta_pendente: 'Resposta pendente',
  inatividade: 'Grupo sem atividade recente',
  queda: 'Queda na nota',
  atencao: 'Acompanhar saúde',
  sem_grupo: 'Sem grupo vinculado',
  sem_dados: 'Sem leitura do grupo',
  reclamacao: 'Reclamação na conversa',
  pedido_sem_solucao: 'Pedido sem solução',
  retorno_cliente: 'Retorno do cliente pendente no grupo',
  saida_participante: 'Saída de participante',
  em_dia: 'Em dia',
};

export const READING_TONE = { positive: 'Positivo', neutral: 'Neutro', negative: 'Negativo', mixed: 'Misto', unknown: 'Indeterminado' };

const groupKeys = ['conversation_id', 'wa_client_id', 'channel_id', 'group_jid'];

export function sameCsGroup(a, b) {
  return groupKeys.every(key => (a[key] ?? null) === (b[key] ?? null));
}

export function conversationSignals(reading) {
  return [reading?.cancellation === true && 'cancelamento', reading?.complaint === true && 'reclamacao',
    reading?.unresolved === true && 'pedido_sem_solucao', reading?.awaiting_client_reply === true && 'retorno_cliente'].filter(Boolean);
}

export function readingInChannelWindow(row, reading) {
  return row.channel_following !== false && (!row.channel_following_since ||
    Date.parse(reading?.source_at) >= Date.parse(row.channel_following_since));
}

export function attachCsReadings(rows, readings) {
  const byClient = new Map(readings.map((reading) => [reading.client_id, reading]));
  return rows.map((row) => {
    const reading = byClient.get(row.client_id);
    if (row.group_status !== 'linked' || !row.conversation_id || reading?.conversation_id !== row.conversation_id ||
      !readingInChannelWindow(row, reading)) return row;
    const exact = Boolean(reading.wa_client_id && reading.channel_id && reading.group_jid && sameCsGroup(row, reading));
    if (reading.channel_id && !exact) return row;
    return { ...row, reading_signals: conversationSignals({ ...reading, awaiting_client_reply: exact && reading.awaiting_client_reply }) };
  });
}

export const GROUP_STATUS = {
  linked: 'Vinculado',
  unlinked: 'Sem vínculo',
  unavailable: 'Leitura indisponível',
};

export const groupStatus = (row) => row.channel_following === false ? 'Acompanhamento pausado' : GROUP_STATUS[row.group_status];

const dates = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

export function groupLabel(row) {
  if (row.group_status === 'linked' && row.group_name) return row.group_name;
  return GROUP_STATUS[row.group_status] || GROUP_STATUS.unavailable;
}

export function ownerLabel(row) {
  return row.owner_name || (row.owner_id ? 'Responsável indisponível' : 'Sem responsável');
}

export function dateTime(value) {
  if (!value) return 'Sem registro';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? dates.format(date) : 'Sem registro';
}

export function historyWindow(rows, count, now = new Date()) {
  const today = saoPauloDate(now);
  const firstDay = shiftDate(today, 1 - count);
  return rows.filter(({ operational_date }) => operational_date >= firstDay && operational_date <= today)
    .sort((a, b) => b.operational_date.localeCompare(a.operational_date));
}

export function clientTimeline(row, history, source, now = Date.now()) {
  const entries = (history?.daily || []).map((entry) => ({
    id: `saude:${entry.operational_date}`, source: 'saude', at: entry.captured_at, title: 'Avaliação diária', entry,
  }));
  if (row.group_status === 'linked') {
    entries.push({ id: 'atividade', source: 'whatsapp', at: row.last_activity_at, title: 'Última atividade do grupo' },
      { id: 'espera', source: 'whatsapp', at: row.awaiting_since, title: 'Início da espera por resposta' },
      { id: 'saida-participante', source: 'whatsapp', at: row.group_departure_at, title: SIGNAL.saida_participante });
  }
  entries.push({ id: 'cadastro', source: 'cadastro', at: history?.createdAt, title: 'Cliente cadastrado' });
  return entries.filter((event) => (!source || event.source === source) && Date.parse(event.at) <= now)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim().replace(/\s+/g, ' ');
}

function csSegmentKey(value) {
  if (value === undefined) return null;
  const name = normalize(value);
  return name ? `nicho:${name}` : 'sem-segmento';
}

export function portfolioSegmentOptions(rows, selected) {
  const labels = new Map();
  for (const { segment } of rows) {
    const key = csSegmentKey(segment);
    if (segment?.trim() && !labels.has(key)) labels.set(key, segment.trim());
  }
  const options = [['', 'Todos os segmentos'], ['sem-segmento', 'Sem segmento'],
    ...[...labels].sort(([, a], [, b]) => a.localeCompare(b, 'pt-BR'))];
  if (selected && !options.some(([key]) => key === selected)) options.push([selected, 'Segmento indisponível']);
  return options;
}

export function filterGroupInventory(groups, search) {
  const needle = normalize(search);
  return groups.filter((group) => [group.display_name, group.channel_name].some((value) => normalize(value).includes(needle)));
}

function matches(row, needle) {
  return [row.client_name, row.owner_name, row.segment, row.group_status === 'linked' && row.group_name].some((value) => normalize(value || '').includes(needle));
}

function byName(a, b) {
  return a.client_name.localeCompare(b.client_name, 'pt-BR');
}

function byScore(a, b, direction = 1) {
  if (a.score == null) return Number(b.score != null);
  if (b.score == null) return -1;
  return (a.score - b.score) * direction;
}

const priorityRanks = { critico: 0, cancelamento: 0, resposta_pendente: 1, inatividade: 2, em_dia: 4 };
const healthRanks = { critico: 0, atencao: 1, resultado: 2, saudavel: 3 };

export function primaryCsSignal(row) {
  return row.reading_signals?.find((signal) => (priorityRanks[signal] ?? 3) <= (priorityRanks[row.signal] ?? 3)) ||
    (row.signal === 'em_dia' && row.group_status === 'linked' && row.group_departure_at ? 'saida_participante' : row.signal);
}

export function csSignalRules(settings, now = new Date()) {
  if (!settings) return null;
  const { score_drop, quiet_days } = settings;
  return { scoreDrop: score_drop, now: now.valueOf(),
    quietBefore: Number.isInteger(quiet_days) && quiet_days > 0 ? shiftDate(saoPauloDate(now), -quiet_days) : null };
}

export function visibleCsSignals(row, rules) {
  const linked = row.group_status === 'linked';
  const activity = linked && Date.parse(row.last_activity_at);
  const quiet = rules?.quietBefore && Number.isFinite(activity) && activity <= rules.now &&
    saoPauloDate(new Date(activity)) <= rules.quietBefore;
  const drop = Number.isFinite(rules?.scoreDrop) && Number.isFinite(row.score_delta) && row.score_delta < -rules.scoreDrop;
  const signals = [primaryCsSignal(row), row.signal, linked && row.awaiting_since && 'resposta_pendente',
    drop && 'queda', quiet && 'inatividade', linked && row.group_departure_at && 'saida_participante', ...(row.reading_signals || [])];
  return [...new Set(signals.filter(signal => signal !== 'em_dia' && Object.hasOwn(SIGNAL, signal)))];
}

export function priorityRows(rows, { search = '', signal = '', priority = '', rules } = {}) {
  const needle = normalize(search);
  const rank = (row) => priorityRanks[primaryCsSignal(row)] ?? 3;
  return rows.filter((row) => row.signal && primaryCsSignal(row) !== 'em_dia' && (!signal || visibleCsSignals(row, rules).includes(signal))
    && (!priority || (priority === 'critical') === (rank(row) === 0)) && matches(row, needle))
    .sort((a, b) => rank(a) - rank(b) || byScore(a, b) || byName(a, b));
}

export function filterPortfolio(rows, { search = '', health = '', signal = '', owner = '', group = '', segment = '', sort = 'client_name', descending = false } = {}) {
  const needle = normalize(search);
  const direction = descending ? -1 : 1;
  return rows.filter((row) => (!health || row.health === health) && (!signal || row.signal === signal)
    && (!owner || (row.owner_id || 'unassigned') === owner) && (!group || row.group_status === group)
    && (!segment || csSegmentKey(row.segment) === segment) && matches(row, needle))
    .sort((a, b) => {
      if (sort === 'health') {
        return byScore({ score: healthRanks[a.health] }, { score: healthRanks[b.health] }, direction) || byName(a, b);
      }
      const result = sort === 'score'
        ? byScore(a, b, direction)
        : (a[sort] ?? '').localeCompare(b[sort] ?? '', 'pt-BR') * direction;
      return result || byName(a, b);
    });
}

export const SETTING_LIMITS = {
  healthy_min: [1, 100], result_min: [1, 100], attention_min: [1, 100], score_drop: [1, 100],
  quiet_days: [1, 90], critical_quiet_days: [1, 90], start_hour: [0, 23], end_hour: [1, 24],
};

export function prepareSettings(draft) {
  const fields = {};
  for (const [key, [min, max]] of Object.entries(SETTING_LIMITS)) {
    const input = String(draft[key] ?? '').trim();
    const value = Number(input);
    if (!input || !Number.isInteger(value) || value < min || value > max) {
      throw new Error('Preencha os limites com números inteiros dentro das faixas indicadas.');
    }
    fields[key] = value;
  }
  if (fields.healthy_min <= fields.result_min || fields.result_min <= fields.attention_min) {
    throw new Error('Os limites de saúde devem aumentar de Atenção até Saudável.');
  }
  if (fields.critical_quiet_days <= fields.quiet_days) {
    throw new Error('O limite crítico de inatividade precisa ser maior que o limite de atenção.');
  }
  if (fields.end_hour <= fields.start_hour) {
    throw new Error('O fim do expediente deve ser posterior ao início.');
  }
  return { ...fields, weekends: draft.weekends === true, radar_enabled: draft.radar_enabled === true };
}
