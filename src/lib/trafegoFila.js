/** Fila do gestor de tráfego: diário, rodízio e saúde vs. meta da ficha. */

export const DIARY_START = ':::planeje-diario';
export const DIARY_END = ':::';

export const TRAFEGO_ACOES = [
  { id: 'analise', label: 'Analisei a conta' },
  { id: 'pausou', label: 'Pausei / reativei anúncio' },
  { id: 'criativo', label: 'Troquei criativo' },
  { id: 'orcamento', label: 'Ajustei orçamento' },
  { id: 'campanha_nova', label: 'Campanha nova' },
  { id: 'google', label: 'Mexi no Google Ads' },
  { id: 'lead_conversa', label: 'Olhei lead / conversa' },
];

export const TRAFEGO_BLOQUEIOS = [
  { id: '', label: 'Nada — segue no ar' },
  { id: 'criativo', label: 'Aguardando criativo' },
  { id: 'acesso', label: 'Aguardando acesso Meta/Google' },
  { id: 'aprovacao', label: 'Aguardando você (aprovação)' },
  { id: 'cliente', label: 'Aguardando o cliente' },
  { id: 'comercial', label: 'Lead/conversa parada no comercial' },
  { id: 'periodo_vencido', label: 'Período ou evento encerrado' },
  { id: 'substituido', label: 'Substituído por campanha nova' },
  { id: 'teste_finalizado', label: 'Teste finalizado' },
  { id: 'estrategia', label: 'Pausado por decisão estratégica' },
];

export const BLOQUEIO_LABEL = Object.fromEntries(
  TRAFEGO_BLOQUEIOS.filter((b) => b.id).map((b) => [b.id, b.label])
);

export function isPaidTrafficPath(pathname) {
  return String(pathname || '').startsWith('/paid-traffic');
}

export function serializeTrafegoDiario({ acoes = [], bloqueio = '', visto = '', proximo = '', comentario = '' }) {
  const body = [
    DIARY_START,
    'v:1',
    `acoes:${acoes.filter(Boolean).join(',')}`,
    `bloqueio:${bloqueio || ''}`,
    `visto:${String(visto || '').replace(/\n/g, ' ').trim()}`,
    `proximo:${String(proximo || '').replace(/\n/g, ' ').trim()}`,
    DIARY_END,
    String(comentario || '').trim(),
  ];
  return body.join('\n').trim();
}

export function parseTrafegoDiario(observation, createdAt, userName) {
  const texto = String(observation || '');
  const base = {
    kind: 'nota',
    createdAt: createdAt || null,
    userName: userName || null,
    acoes: [],
    bloqueio: '',
    visto: '',
    proximo: '',
    comentario: texto,
    texto,
  };
  const start = texto.indexOf(DIARY_START);
  if (start < 0) return base;

  const after = texto.slice(start + DIARY_START.length);
  const end = after.indexOf(`\n${DIARY_END}`);
  const block = end >= 0 ? after.slice(0, end) : after;
  const rest = end >= 0 ? after.slice(end + DIARY_END.length + 1).trim() : '';
  const fields = {};
  for (const line of block.split('\n')) {
    const t = line.trim();
    const i = t.indexOf(':');
    if (i <= 0) continue;
    fields[t.slice(0, i)] = t.slice(i + 1);
  }
  const acoes = String(fields.acoes || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    kind: 'diario',
    createdAt: createdAt || null,
    userName: userName || null,
    acoes,
    bloqueio: String(fields.bloqueio || '').trim(),
    visto: String(fields.visto || '').trim(),
    proximo: String(fields.proximo || '').trim(),
    comentario: rest,
    texto,
  };
}

export function acaoLabel(id) {
  return TRAFEGO_ACOES.find((a) => a.id === id)?.label || id;
}

/** 0–3 = seg–qui, 'friday' | 'weekend' */
export function weekdaySlot(date = new Date()) {
  const d = date.getDay();
  if (d === 0 || d === 6) return 'weekend';
  if (d === 5) return 'friday';
  return d - 1;
}

export function weekMonday(date = new Date()) {
  const x = new Date(date);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

export function assignRodizioSlot(sortedIds, clienteId) {
  const i = sortedIds.indexOf(clienteId);
  if (i < 0) return 0;
  return i % 4;
}

export function isRodizioToday(sortedIds, clienteId, date = new Date()) {
  const slot = weekdaySlot(date);
  if (slot === 'weekend' || slot === 'friday') return false;
  return assignRodizioSlot(sortedIds, clienteId) === slot;
}

export function daysSince(iso, now = new Date()) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((startOfDay(now) - startOfDay(new Date(iso))) / 86400000);
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

export function visitTone(days) {
  if (days == null) return 'danger';
  if (days <= 2) return 'ok';
  if (days <= 6) return 'warn';
  return 'danger';
}

export function lastDiaryPreview(diary, max = 140) {
  if (!diary || diary.kind !== 'diario') return '';
  const t = String(diary.visto || diary.comentario || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return '';
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export function visitLabel(days) {
  if (days == null) return 'Nunca registrado';
  if (days === 0) return 'Passou hoje';
  if (days === 1) return 'Ontem';
  return `Há ${days} dias`;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function actionValue(list, keys) {
  if (!Array.isArray(list)) return 0;
  const row = list.find((a) => keys.some((k) => String(a?.action_type || '').toLowerCase().includes(k)));
  return num(row?.value);
}

export function normalizeAccountInsights(insights) {
  const ins = insights && !Array.isArray(insights) ? insights : insights?.[0] || {};
  const actions = ins.actions || [];
  const values = ins.action_values || [];
  const messages =
    actionValue(actions, ['onsite_messaging_conversation_started', 'messaging_conversation_started']) ||
    actionValue(actions, ['onsite_messaging_conversation']);
  const purchases = actionValue(actions, ['omni_purchase', 'purchase']);
  const purchaseValue = actionValue(values, ['omni_purchase', 'purchase']);
  const leads = actionValue(actions, ['lead']);
  const engagements =
    actionValue(actions, ['post_engagement']) ||
    actionValue(actions, ['page_engagement']) ||
    actionValue(actions, ['post_reaction']) ||
    actionValue(actions, ['post_comment']);
  const videoViews = actionValue(actions, ['video_view']);
  return {
    spend: num(ins.spend),
    impressions: num(ins.impressions),
    clicks: num(ins.clicks),
    reach: num(ins.reach),
    messages,
    purchases,
    purchaseValue,
    leads,
    engagements,
    videoViews,
  };
}

function packHealth({
  status,
  label,
  tone,
  budgetStatus,
  budgetLabel,
  resultStatus,
  resultLabel,
  costPerMessage,
  costPerPurchase,
  roas,
  spend,
  limitUsage,
  overTeto,
}) {
  return {
    status,
    label,
    tone,
    budgetStatus,
    budgetLabel,
    resultStatus,
    resultLabel,
    costPerMessage,
    costPerPurchase,
    roas,
    spend,
    limitUsage,
    overTeto,
  };
}

export function clientHealth(client, metrics) {
  if (!metrics) {
    return packHealth({
      status: 'sem_dados',
      label: 'Sem dado Meta',
      tone: 'muted',
      budgetStatus: 'sem_dados',
      budgetLabel: 'Sem dado Meta',
      resultStatus: 'sem_dados',
      resultLabel: 'Sem dado Meta',
      costPerMessage: 0,
      costPerPurchase: 0,
      roas: 0,
      spend: 0,
      limitUsage: 0,
      overTeto: false,
    });
  }
  const limite = num(client?.limite_meta);
  const spend = num(metrics.spend);
  const limitUsage = limite > 0 ? spend / limite : 0;
  const overTeto = limite > 0 && spend > limite;
  const objetivoRaw = String(client?.objetivo_meta || '').toLowerCase().trim();
  const metaMensagem = client?.meta_custo_mensagem ? num(client.meta_custo_mensagem) : null;
  const metaCompra = client?.meta_custo_compra ? num(client.meta_custo_compra) : null;
  const roasAlvo = client?.roas_alvo ? num(client.roas_alvo) : null;
  const objetivoMensagens =
    /^mensagem|^lead|mensagens|misto/.test(objetivoRaw) ||
    (!objetivoRaw && metaMensagem != null && metaCompra == null && roasAlvo == null);
  const objetivoCompras =
    /^compra|e-commerce|roas|vendas/.test(objetivoRaw) ||
    (!objetivoRaw && (roasAlvo != null || metaCompra != null) && !objetivoMensagens);
  const resultCount = num(metrics.messages) || num(metrics.leads);
  const costPerMessage = resultCount > 0 ? spend / resultCount : 0;
  const costPerPurchase = metrics.purchases > 0 ? spend / metrics.purchases : 0;
  const roas = spend > 0 ? metrics.purchaseValue / spend : 0;

  let budgetStatus = 'ok';
  let budgetLabel = limite > 0 ? 'Dentro do teto' : 'Sem teto';
  if (limite <= 0) budgetStatus = 'sem_teto';
  else if (limitUsage > 1) {
    budgetStatus = 'critico';
    budgetLabel = 'Acima do teto';
  } else if (limitUsage >= 0.8) {
    budgetStatus = 'atencao';
    budgetLabel = `Orçamento em ${Math.round(limitUsage * 100)}%`;
  }

  let resultStatus = 'ok';
  let resultLabel = 'Na meta';
  if (objetivoMensagens) {
    if (!metaMensagem) {
      resultStatus = 'sem_meta';
      resultLabel = 'Sem meta';
    } else if (resultCount === 0) {
      resultStatus = 'atencao';
      resultLabel = 'Sem resultado ainda';
    } else if (costPerMessage > metaMensagem * 1.2) {
      resultStatus = 'critico';
      resultLabel = `Fora da meta · ${formatMoney(costPerMessage)} / ${formatMoney(metaMensagem)}`;
    } else if (costPerMessage > metaMensagem) {
      resultStatus = 'atencao';
      resultLabel = 'Atenção no resultado';
    } else {
      resultLabel = `Na meta · ${formatMoney(costPerMessage)}`;
    }
  } else if (objetivoCompras) {
    if (!roasAlvo && !metaCompra) {
      resultStatus = 'sem_meta';
      resultLabel = 'Sem meta';
    } else if ((roasAlvo && roas < roasAlvo * 0.7) || (metaCompra && costPerPurchase > metaCompra * 1.2)) {
      resultStatus = 'critico';
      resultLabel = roasAlvo
        ? `Fora da meta · ROAS ${roas.toFixed(1)}x / ${roasAlvo}x`
        : 'Fora da meta';
    } else if ((roasAlvo && roas < roasAlvo) || (metaCompra && costPerPurchase > metaCompra)) {
      resultStatus = 'atencao';
      resultLabel = 'Atenção no resultado';
    }
  } else {
    resultStatus = 'sem_meta';
    resultLabel = 'Sem meta';
  }

  let status = 'ok';
  let label = resultStatus === 'sem_meta' ? 'Sem meta' : resultLabel === 'Na meta' || resultLabel.startsWith('Na meta') ? resultLabel : 'Na meta';
  let tone = 'ok';
  if (resultStatus === 'critico') {
    status = 'critico';
    label = resultLabel.startsWith('Fora') ? resultLabel : 'Fora da meta';
    tone = 'danger';
  } else if (budgetStatus === 'critico') {
    status = 'atencao';
    label = 'Acima do teto';
    tone = 'warn';
  } else if (resultStatus === 'atencao' || budgetStatus === 'atencao') {
    status = 'atencao';
    label = budgetStatus === 'critico' ? 'Acima do teto' : resultStatus === 'atencao' ? resultLabel : budgetLabel;
    tone = 'warn';
  } else if (resultStatus === 'sem_meta' && budgetStatus === 'ok') {
    status = 'ok';
    label = 'Sem meta';
    tone = 'muted';
  }

  return packHealth({
    status,
    label,
    tone,
    budgetStatus,
    budgetLabel,
    resultStatus,
    resultLabel,
    costPerMessage,
    costPerPurchase,
    roas,
    spend,
    limitUsage,
    overTeto,
  });
}

export function formatMoney(n) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n) || 0);
}

export const FILA_BUCKETS = {
  urgente: { title: 'Urgente', hint: 'Fora da meta, sem visita longa ou sem dado' },
  bloqueado: { title: 'Bloqueado', hint: 'Espera criativo, acesso, você ou o cliente' },
  rodizio: { title: 'Rodízio de hoje', hint: 'Clientes deste dia da semana' },
  folga: { title: 'Sexta / folga da semana', hint: 'Quem ainda não teve visita desde segunda' },
};
