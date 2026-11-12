import { isMetaAdsContactForStats } from './contactFromWebhookPayload.js';
import { hasCtwaTrackingSignal, isCtwaStyleTracking } from './rastreamentoTrackableLink.js';

const CAR_NICHE = /loja de carro|revenda de veiculo|concessionaria/i;
const BRIDAL_NICHE = /noiva/i;

export const STATUS_COLOR = {
  'Novo Lead': '#3b82f6',
  'Em Atendimento': '#0284c7',
  'Follow Up': '#d97706',
  Agendado: '#7c3aed',
  'Em Negociação': '#ea580c',
  'Venda Realizada': '#059669',
  'Venda Perdida': '#e11d48',
  'Não Respondeu': '#64748b',
  'Não Compareceu': '#be123c',
  Reagendado: '#4f46e5',
  'Lead Desqualificado': '#78716c',
};

export const MINI_CRM_COLORS = [
  '#3b82f6', '#0284c7', '#0891b2', '#7c3aed', '#4f46e5',
  '#d97706', '#ea580c', '#e11d48', '#be123c', '#059669',
  '#0f766e', '#64748b', '#78716c', '#334155',
];

export function statusInk(color) {
  const hex = String(color || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return '#ffffff';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.72 ? '#1e293b' : '#ffffff';
}

function cleanColor(value, key, index) {
  const text = String(value || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(text)) return text.toLowerCase();
  return STATUS_COLOR[key] || MINI_CRM_COLORS[index % MINI_CRM_COLORS.length];
}

export const MINI_CRM_STATUSES = [
  'Novo Lead',
  'Em Atendimento',
  'Follow Up',
  'Agendado',
  'Em Negociação',
  'Venda Realizada',
  'Venda Perdida',
  'Não Respondeu',
  'Não Compareceu',
  'Reagendado',
  'Lead Desqualificado',
];

const LOCKED = [
  { key: 'data', label: 'Data', kind: 'date', locked: true },
  { key: 'origem', label: 'Origem', kind: 'text', locked: true },
  { key: 'nome', label: 'Nome', kind: 'text', locked: true },
  { key: 'telefone', label: 'Telefone', kind: 'text', locked: true },
];

const STATUS_COLUMN = { key: 'status', label: 'Status', kind: 'status' };

const CORE = [
  ...LOCKED,
  { key: 'vendedor', label: 'Vendedor', kind: 'text' },
  STATUS_COLUMN,
];

/**
 * Modelos por nicho. Servem só para loja sem mini_crm_config salvo;
 * loja que já salvou continua lendo o banco. Vendedores ficam na loja.
 * Loja de carro: desenho ao vivo da JR CAR em 24/09/2026.
 * Loja de noivas: colunas e status da planilha da Marbo Noivas; cadência padrão.
 */
export const MINI_CRM_MODELS = [
  {
    id: 'loja_carros',
    label: 'Loja de carro',
    match: CAR_NICHE,
    columns: [
      ...LOCKED,
      STATUS_COLUMN,
      { key: 'data_da_visita', label: 'Data da Visita', kind: 'day', onCard: false },
      { key: 'qualificado', label: 'Qualificado', kind: 'simnao', onCard: false },
      { key: 'compareceu', label: 'Compareceu', kind: 'simnao', onCard: false },
      { key: 'carro', label: 'Carro', kind: 'text', onCard: false },
      { key: 'vendedor', label: 'Vendedor', kind: 'text', onCard: false },
      { key: 'data_venda', label: 'Data da venda', kind: 'day', onCard: false },
      { key: 'valor', label: 'Valor venda', kind: 'money', onCard: false },
      { key: 'crm_revenda', label: 'CRM Revenda +', kind: 'simnao', onCard: false },
      { key: 'observacao', label: 'Observação', kind: 'text', onCard: false },
    ],
    statuses: [
      { key: 'Novo Lead', label: 'Novo Lead', color: '#3b82f6' },
      { key: 'Em Atendimento', label: 'Em Atendimento', color: '#0284c7' },
      { key: 'Em Negociação', label: 'Em Negociação', color: '#ea580c' },
      { key: 'Agendado', label: 'Visita Agendada', color: '#7c3aed' },
      { key: 'Reagendado', label: 'Reagendado', color: '#4f46e5' },
      { key: 'Venda Realizada', label: 'Venda Realizada', color: '#059669' },
      { key: 'Follow Up', label: 'Follow Up', color: '#d97706' },
      { key: 'Venda Perdida', label: 'Venda Perdida', color: '#e11d48' },
    ],
    cadence: {
      inicial: [1, 1, 2, 3, 5, 7],
      repescagem: [30, 5],
      sem_resposta: 'Venda Perdida',
    },
  },
  {
    id: 'loja_noivas',
    label: 'Loja de noivas',
    match: BRIDAL_NICHE,
    columns: [
      ...LOCKED,
      STATUS_COLUMN,
      { key: 'qualificado', label: 'Qualificado', kind: 'simnao', onCard: false },
      { key: 'nao_respondeu', label: 'Não respondeu', kind: 'simnao', onCard: false },
      { key: 'vendedor', label: 'Consultora', kind: 'text', onCard: false },
      { key: 'data_agendamento', label: 'Data Agendamento', kind: 'day', onCard: true },
      { key: 'compareceu', label: 'Compareceu', kind: 'simnao', onCard: false },
      { key: 'valor', label: 'Valor Venda', kind: 'money', onCard: false },
      { key: 'proxima_acao', label: 'Próxima Ação', kind: 'text', onCard: false },
      { key: 'observacao', label: 'Observação', kind: 'text', onCard: false },
    ],
    statuses: [
      { key: 'Novo Lead', label: 'Novo Lead', color: '#3b82f6' },
      { key: 'Em Atendimento', label: 'Em Atendimento', color: '#0284c7' },
      { key: 'Lead Qualificado', label: 'Lead Qualificado', color: '#d97706' },
      { key: 'Agendado', label: 'Agendado', color: '#7c3aed' },
      { key: 'Em Negociação', label: 'Em Negociação', color: '#ea580c' },
      { key: 'Venda Realizada', label: 'Venda Realizada', color: '#059669' },
      { key: 'Venda Perdida', label: 'Venda Perdida', color: '#e11d48' },
      { key: 'Follow Up', label: 'Follow Up', color: '#0891b2' },
      { key: 'Não Respondeu', label: 'Não Respondeu', color: '#64748b' },
      { key: 'Não Compareceu', label: 'Não Compareceu', color: '#be123c' },
      { key: 'Reagendado', label: 'Reagendado', color: '#4f46e5' },
      { key: 'Lead Desqualificado', label: 'Lead Desqualificado', color: '#78716c' },
    ],
  },
];

const TAIL = [
  { key: 'proxima_acao', label: 'Próxima ação', kind: 'text' },
  { key: 'observacao', label: 'Observação', kind: 'text' },
];

export function foldMiniCrm(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function presetForNicho(nicho) {
  const folded = foldMiniCrm(nicho);
  const model = MINI_CRM_MODELS.find((item) => item.match.test(folded));
  if (model) {
    const { match, ...preset } = model;
    return preset;
  }
  return {
    id: 'base',
    label: 'Geral',
    columns: [...CORE, ...TAIL],
  };
}

export function phoneDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

export function phoneKey(value) {
  const digits = phoneDigits(value);
  if (digits.length < 8) return '';
  return digits.slice(-8);
}

// Nome de apresentação: não altera atribuição, clique ou elegibilidade para CAPI.
function utmOrigin(contact) {
  const tracking = contact?.tracking_data && typeof contact.tracking_data === 'object' ? contact.tracking_data : {};
  const fromLink = Boolean(tracking.planeje_link_id || tracking.planeje_match_code || tracking.link_id || tracking.trackable_link_id);
  if (contact?.origin_source === 'google_ads' || hasCtwaTrackingSignal(tracking) || (!fromLink && isCtwaStyleTracking(tracking))) return '';
  if (contact?.origin_source === 'meta_ads' && !fromLink) return '';
  const source = [contact?.utm_source, tracking.utm_source]
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim()).find(Boolean) || '';
  return source.toLowerCase() === 'linktree' ? 'Meta Link' : source;
}

export function origemDoContato(contact) {
  const src = String(contact?.origin_source || '');
  const tracking = contact?.tracking_data && typeof contact.tracking_data === 'object' ? contact.tracking_data : {};
  const sheetOrigin = String(tracking.sheet_origem || '').trim();
  if (sheetOrigin) return sheetOrigin;
  const sourceLabel = utmOrigin(contact);
  if (sourceLabel) return sourceLabel;
  if (src === 'google_ads') return 'Google Ads';
  if (src === 'meta_ads') {
    const blob = JSON.stringify(tracking).toLowerCase();
    if (tracking.link_id || tracking.trackable_link_id || blob.includes('trackable') || blob.includes('link_rastre')) {
      return 'Meta Ads via Link Rastreável';
    }
    return 'Meta Ads via Campanha de Mensagem';
  }
  if (String(contact?.utm_source || '').toLowerCase() === 'instagram') return 'Instagram Orgânico';
  return 'Não rastreada';
}

export function miniCrmOriginBucket(contact) {
  if (utmOrigin(contact)) return 'outras';
  if (isMetaAdsContactForStats(contact)) return 'meta';
  const source = String(contact?.origin_source || '');
  if (source === 'google_ads' || (source && source !== 'nao_identificado' && source !== 'meta_ads')) return 'outras';
  return 'off';
}

export function miniCrmOriginBadge(value) {
  const text = String(value || '').trim();
  if (/^meta ads\b|^facebook ads$/i.test(text)) return { tone: 'meta', label: 'Meta Ads', title: text };
  if (/^google ads$/i.test(text)) return { tone: 'google', label: 'Google Ads', title: text };
  if (!text || /^(não|nao) rastreada$/i.test(text)) return { tone: 'off', label: 'Não rastreada', title: text || 'Não rastreada' };
  return { tone: 'site', label: text, title: text };
}

export function readMiniCrm(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return { ...raw };
}

/** Rastreamento grava boolean; Mini CRM grava Sim/Não. */
export function simNaoFromBool(value) {
  if (value === true) return 'Sim';
  if (value === false) return 'Não';
  return '';
}

export function boolFromSimNao(value) {
  const text = foldMiniCrm(value).trim();
  if (text === 'sim') return true;
  if (text === 'nao') return false;
  return null;
}

export function isSoldMiniStatus(status) {
  return String(status || '') === 'Venda Realizada';
}

export const QUALIFIED_STATUS = 'Lead Qualificado';
export const QUALIFIED_COLUMN = { key: 'qualificado', label: 'Qualificado', kind: 'simnao', onCard: false };

export function isQualifiedMiniStatus(status) {
  return String(status || '') === QUALIFIED_STATUS;
}

/** Status "Lead Qualificado" e coluna Qualificado não divergem. */
export function syncQualifiedFromStatus(mini) {
  const next = readMiniCrm(mini);
  if (isQualifiedMiniStatus(next.status)) next.qualificado = 'Sim';
  return next;
}

/** Acrescenta Qualificado antes das colunas da loja, sem duplicar nem apagar as outras. */
export function withQualifiedColumn(columns) {
  const list = Array.isArray(columns) ? [...columns] : [];
  if (list.some((column) => column?.key === QUALIFIED_COLUMN.key)) return list;
  const at = list.findIndex((column) => column?.key === 'vendedor');
  list.splice(at < 0 ? 0 : at, 0, { ...QUALIFIED_COLUMN });
  return list;
}

export const NO_ANSWER_COLUMN = { key: 'nao_respondeu', label: 'Não respondeu', kind: 'simnao', onCard: false };
export const FOLLOW_UP_STATUS = { key: 'Follow Up', label: 'Follow Up', color: '#0891b2' };

/** Acrescenta Não respondeu logo após Qualificado (ou antes das colunas da loja), sem duplicar. */
export function withNoAnswerColumn(columns) {
  const list = Array.isArray(columns) ? [...columns] : [];
  if (list.some((column) => column?.key === NO_ANSWER_COLUMN.key)) return list;
  const qual = list.findIndex((column) => column?.key === QUALIFIED_COLUMN.key);
  const seller = list.findIndex((column) => column?.key === 'vendedor');
  const at = qual >= 0 ? qual + 1 : seller >= 0 ? seller : 0;
  list.splice(at, 0, { ...NO_ANSWER_COLUMN });
  return list;
}

/** Garante um status de Follow-up antes de "Não Respondeu", sem mexer nos outros. */
export function withFollowUpStatus(statuses) {
  const list = Array.isArray(statuses) ? [...statuses] : [];
  if (followStatusKey(list)) return list;
  const at = list.findIndex((status) => status?.key === 'Não Respondeu');
  list.splice(at < 0 ? list.length : at, 0, { ...FOLLOW_UP_STATUS });
  return list;
}

/**
 * Não respondeu é marca de análise: Sim leva ao Follow-up e abre o 1º retorno
 * (sem duplicar o aberto); Não só grava, sem tirar Follow-up já programado. Nunca envia à Meta.
 */
export function applyNoAnswerMark(mini, value, statuses, today, cadence) {
  const next = patchMiniCrm(mini, NO_ANSWER_COLUMN.key, value, 'simnao');
  if (next[NO_ANSWER_COLUMN.key] !== 'Sim') return next;
  if (!followStatusKey(statuses)) return next;
  return ensureInicial(next, today, statuses, cadence);
}

/**
 * Qualificado passou a Sim (ou o banco ainda não sabe): pede QualifiedLead à Meta.
 * Não = nada; quem já tem sucesso no log é barrado na página.
 */
export function shouldSendQualified(commercialPatch) {
  return Boolean(commercialPatch && commercialPatch.qualificado === true);
}

/** Mudança de status que pede data + valor antes de gravar a venda. */
export function needsSaleConfirm(prevStatus, nextStatus) {
  return isSoldMiniStatus(nextStatus) && !isSoldMiniStatus(prevStatus);
}

/** Confirma venda só com data válida (yyyy-mm-dd) e valor > 0. */
export function canConfirmSale({ dataVenda, valor } = {}) {
  const day = String(dataVenda || '').trim();
  const match = day.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  const check = new Date(`${day}T00:00:00Z`);
  if (
    Number.isNaN(check.getTime())
    || check.getUTCFullYear() !== year
    || check.getUTCMonth() + 1 !== month
    || check.getUTCDate() !== date
  ) {
    return false;
  }
  const amount = Number(valor);
  return Number.isFinite(amount) && amount > 0;
}

/**
 * Une as colunas do Rastreamento (qualificado/comprou/valor_venda) ao jsonb mini_crm
 * do mesmo contato, sem inventar lead paralelo.
 */
export function applyTrackingToMini(miniRaw, contact) {
  const next = readMiniCrm(miniRaw);
  if (contact?.qualificado === true) next.qualificado = 'Sim';
  else if (contact?.qualificado === false) next.qualificado = 'Não';

  if (contact?.comprou === true) {
    next.status = 'Venda Realizada';
    const amount = Number(contact.valor_venda);
    if (Number.isFinite(amount) && amount > 0) next.valor = amount;
  }
  return next;
}

/** Espelha patch comercial do Rastreamento no jsonb do Mini CRM. */
export function applyCommercialPatchToMini(miniRaw, patch) {
  const next = readMiniCrm(miniRaw);
  if (!patch || typeof patch !== 'object') return next;

  if ('qualificado' in patch) {
    if (patch.qualificado === true) next.qualificado = 'Sim';
    else if (patch.qualificado === false) next.qualificado = 'Não';
    else delete next.qualificado;
  }

  if ('comprou' in patch) {
    if (patch.comprou === true) {
      next.status = 'Venda Realizada';
    } else if (patch.comprou === false && isSoldMiniStatus(next.status)) {
      delete next.status;
    }
  }

  if ('valor' in patch) {
    const amount = Number(patch.valor);
    if (Number.isFinite(amount) && amount > 0) next.valor = amount;
    else if (patch.valor === 0 || patch.valor == null) {
      /* mantém valor já digitado na loja se a ficha mandar zero */
    }
  }
  return next;
}

/**
 * Diff Mini CRM → colunas do Rastreamento no mesmo contato.
 * Não dispara CAPI; só devolve o patch de banco.
 */
export function commercialPatchFromMiniChange(prevMini, nextMini, contact = null) {
  const prev = readMiniCrm(prevMini);
  const next = readMiniCrm(nextMini);
  const patch = {};

  if (String(prev.qualificado || '') !== String(next.qualificado || '')) {
    patch.qualificado = boolFromSimNao(next.qualificado);
  } else if (
    (next.qualificado === 'Sim' || next.qualificado === 'Não')
    && boolFromSimNao(next.qualificado) !== (contact?.qualificado ?? null)
  ) {
    patch.qualificado = boolFromSimNao(next.qualificado);
  }

  const prevSold = isSoldMiniStatus(prev.status);
  const nextSold = isSoldMiniStatus(next.status);
  if (prevSold !== nextSold) {
    patch.comprou = nextSold;
    if (nextSold) patch.valor = Number(next.valor) || 0;
  } else if (nextSold && Number(prev.valor || 0) !== Number(next.valor || 0)) {
    patch.comprou = true;
    patch.valor = Number(next.valor) || 0;
  } else if (nextSold && contact?.comprou !== true) {
    patch.comprou = true;
    patch.valor = Number(next.valor) || 0;
  }

  return Object.keys(patch).length ? patch : null;
}

export function patchMiniCrm(current, key, value, kind) {
  const next = readMiniCrm(current);
  const field = kind || (key === 'valor' ? 'money' : key === 'data_venda' ? 'day' : 'text');
  if (field === 'money') {
    const cleaned = String(value ?? '').trim().replace(/\./g, '').replace(',', '.');
    if (!cleaned) {
      delete next[key];
      return next;
    }
    const amount = Number(cleaned);
    if (!Number.isFinite(amount)) return next;
    next[key] = amount;
    return next;
  }
  if (field === 'day') {
    const text = String(value ?? '').trim();
    if (!text) {
      delete next[key];
      return next;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return next;
    const parsed = new Date(`${text}T12:00:00-03:00`);
    if (Number.isNaN(parsed.getTime())) return next;
    next[key] = text;
    return next;
  }
  if (field === 'time') {
    const text = String(value ?? '').trim();
    if (!text) delete next[key];
    else if (normalizeAppointmentTime(text)) next[key] = normalizeAppointmentTime(text);
    return next;
  }
  const text = String(value ?? '').trim();
  if (!text) delete next[key];
  else next[key] = text;
  return next;
}

export function telefoneDoContato(contact) {
  const phone = String(contact?.phone || '').trim();
  if (phone) return phone;
  return String(contact?.from_jid || '').replace(/@.*/, '');
}

/* O webhook do WhatsApp regrava sender_name/phone a cada mensagem; a cópia no
   mini_crm mantém o nome e o telefone editados na loja. */
export function nomeDoLead(contact) {
  const mini = readMiniCrm(contact?.mini_crm);
  const edited = String(mini.contato_nome || '').trim();
  return edited || String(contact?.sender_name || '').trim();
}

export function telefoneDoLead(contact) {
  const mini = readMiniCrm(contact?.mini_crm);
  const edited = String(mini.contato_telefone || '').trim();
  return edited || telefoneDoContato(contact);
}

export function normalizeLeadName(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/** Aceita DDD + número (10/11 dígitos) ou já com 55; devolve só dígitos com 55, ou '' se inválido. */
export function normalizeLeadPhone(value) {
  const digits = phoneDigits(value);
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) return digits;
  return '';
}

export function withLeadIdentity(miniRaw, { nome, telefone } = {}) {
  const next = readMiniCrm(miniRaw);
  if (nome !== undefined) next.contato_nome = nome;
  if (telefone !== undefined) next.contato_telefone = telefone;
  return next;
}

export function anuncioIdDoContato(contact) {
  const tracking = contact?.tracking_data && typeof contact.tracking_data === 'object' ? contact.tracking_data : {};
  const raw = tracking.source_id ?? tracking.ad_id ?? tracking.sourceID ?? '';
  return String(raw || '').replace(/\D/g, '');
}

export function rowFromContact(contact) {
  const mini = applyTrackingToMini(contact?.mini_crm, contact);
  const row = {
    id: contact.id,
    data: contact.first_seen_at || null,
    origem: origemDoContato(contact),
    nome: nomeDoLead(contact),
    telefone: telefoneDoLead(contact),
    foto: String(contact?.profile_pic_url || '').trim(),
    anuncioId: anuncioIdDoContato(contact),
    foneKey: phoneKey(mini.contato_telefone || contact?.phone || contact?.from_jid),
    vendedor: mini.vendedor || '',
    status: mini.status || '',
    revenda: mini.revenda || '',
    qualificado: mini.qualificado || '',
    valor: mini.valor ?? '',
    data_venda: mini.data_venda || '',
    proxima_em: mini.proxima_em || '',
    proxima_acao: mini.proxima_acao || '',
    observacao: mini.observacao || '',
    mini,
  };
  Object.entries(mini).forEach(([key, value]) => {
    if (row[key] === undefined) row[key] = value ?? '';
  });
  return row;
}

export function weekStartKey(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  const [year, month, day] = parts.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const dow = utc.getUTCDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  utc.setUTCDate(utc.getUTCDate() + delta);
  return utc.toISOString().slice(0, 10);
}

export function summarizeMiniCrm(rows, columns) {
  const keys = new Set((columns || []).map((column) => column.key));
  const leads = (rows || []).filter((row) => String(row.nome || '').trim());
  const vendas = leads.filter((row) => row.status === 'Venda Realizada');
  const valor = keys.has('valor')
    ? vendas.reduce((sum, row) => sum + (Number(row.valor) || 0), 0)
    : 0;
  return {
    leads: leads.length,
    qualificados: keys.has('qualificado') ? leads.filter((row) => row.qualificado === 'Sim').length : null,
    noShow: keys.has('qualificado') ? leads.filter((row) => row.qualificado === 'Não').length : null,
    agendamentos: keys.has('revenda')
      ? leads.filter((row) => String(row.revenda || '').trim()).length
      : leads.filter((row) => row.status === 'Agendado').length,
    vendas: vendas.length,
    valor: keys.has('valor') ? valor : null,
    conversao: leads.length ? vendas.length / leads.length : 0,
    ticket: keys.has('valor') && vendas.length ? valor / vendas.length : null,
  };
}

export function countBy(rows, key) {
  const counts = new Map();
  (rows || []).filter((row) => String(row.nome || '').trim()).forEach((row) => {
    const label = String(row[key] || '').trim() || '—';
    const bucket = counts.get(label) || { label, leads: 0, vendas: 0, valor: 0 };
    bucket.leads += 1;
    if (row.status === 'Venda Realizada') {
      bucket.vendas += 1;
      bucket.valor += Number(row.valor) || 0;
    }
    counts.set(label, bucket);
  });
  return [...counts.values()].sort((a, b) => b.leads - a.leads || a.label.localeCompare(b.label, 'pt-BR'));
}

export function countByWeek(rows) {
  const counts = new Map();
  (rows || []).filter((row) => String(row.nome || '').trim() && row.data).forEach((row) => {
    const label = weekStartKey(row.data);
    if (!label) return;
    const bucket = counts.get(label) || { label, leads: 0, vendas: 0 };
    bucket.leads += 1;
    if (row.status === 'Venda Realizada') bucket.vendas += 1;
    counts.set(label, bucket);
  });
  return [...counts.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function rowMatchesPhone(row, fone) {
  const key = phoneKey(fone);
  if (!key || !row?.foneKey) return false;
  return row.foneKey === key;
}

/** Status de entrada da loja: o rotulado Novo Lead; sem ele, o primeiro da lista. */
export function defaultStatusKey(statuses = MINI_CRM_STATUSES) {
  const list = (statuses || []).map((status) => (typeof status === 'string' ? { key: status, label: status } : status));
  const found = list.find((status) => foldMiniCrm(status.label) === 'novo lead')
    || list.find((status) => foldMiniCrm(status.key) === 'novo lead');
  return found?.key || list[0]?.key || '';
}

/** Lead vazio ou com status que saiu da config vai para o status de entrada; os demais ficam iguais. */
export function withDefaultStatus(mini, statuses) {
  const base = mini && typeof mini === 'object' ? mini : {};
  const target = defaultStatusKey(statuses);
  if (!target) return base;
  const keys = new Set((statuses || []).map((status) => (typeof status === 'string' ? status : status.key)));
  const current = String(base.status || '');
  if (current && keys.has(current)) return base;
  return { ...base, status: target };
}

export function kanbanColumns(rows, statuses = MINI_CRM_STATUSES) {
  const keys = statuses.map((status) => (typeof status === 'string' ? status : status.key));
  const fallback = defaultStatusKey(statuses);
  const placed = (row) => {
    const status = String(row?.status || '');
    return keys.includes(status) || !fallback ? status : fallback;
  };
  (rows || []).forEach((row) => {
    const status = placed(row);
    if (!keys.includes(status)) keys.push(status);
  });
  return keys.map((status) => ({
    status,
    rows: (rows || []).filter((row) => placed(row) === status),
  }));
}

const COLUMN_KINDS = new Set(['text', 'simnao', 'money', 'day']);
const RESERVED_KEYS = new Set(['id', 'data', 'origem', 'nome', 'telefone', 'status', 'mini', 'foto', 'anuncioId', 'foneKey']);

export function columnKey(label, existing = []) {
  const base = foldMiniCrm(label).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || 'campo';
  const taken = new Set(existing);
  let key = base;
  let n = 2;
  while (taken.has(key) || RESERVED_KEYS.has(key)) {
    key = `${base}_${n}`;
    n += 1;
  }
  return key;
}

export function editableColumns(preset) {
  return (preset?.columns || [])
    .filter((column) => !column.locked && column.kind !== 'status')
    .map(({ key, label, kind, onCard }) => (
      onCard === undefined ? { key, label, kind } : { key, label, kind, onCard: Boolean(onCard) }
    ));
}

/** Colunas fixas que o Mini CRM mostra antes das colunas da loja. */
export function fixedColumns(preset) {
  const list = (preset?.columns || []).filter((column) => column.locked || column.kind === 'status');
  return list.length ? list : [...LOCKED, STATUS_COLUMN];
}

/** Colunas do sistema que ficam junto das da loja; o popup de venda grava data_venda. */
export const SYSTEM_COLUMNS = [
  { key: 'data_venda', label: 'Data da venda', kind: 'day' },
];

const SYSTEM_KEYS = new Set(SYSTEM_COLUMNS.map((column) => column.key));

export function isSystemColumn(key) {
  return SYSTEM_KEYS.has(String(key || ''));
}

export function ensureSystemColumns(columns) {
  const list = (columns || []).map((column) => {
    const system = SYSTEM_COLUMNS.find((item) => item.key === column.key);
    return system ? { ...column, kind: system.kind, system: true } : column;
  });
  SYSTEM_COLUMNS.forEach((system) => {
    if (list.some((column) => column.key === system.key)) return;
    const item = { ...system, onCard: false, system: true };
    const at = list.findIndex((column) => column.key === 'valor');
    if (at < 0) list.push(item);
    else list.splice(at, 0, item);
  });
  return list;
}

export function gridColumns(preset, columns) {
  const locked = (preset?.columns || []).filter((column) => column.locked);
  const status = (preset?.columns || []).find((column) => column.kind === 'status');
  const extras = (columns || []).filter((column) => column.key !== 'status' && !column.locked);
  if (!status) return [...locked, ...extras];
  return [...locked, status, ...extras];
}

function cleanStrings(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const list = [];
  value.forEach((item) => {
    const text = String(item || '').trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    list.push(text);
  });
  return list;
}

export function normalizeStatuses(value) {
  if (!Array.isArray(value)) return MINI_CRM_STATUSES.map((label) => ({ key: label, label }));
  const seen = new Set();
  const list = [];
  value.forEach((item) => {
    if (typeof item === 'string') {
      const label = item.trim();
      if (!label || seen.has(label)) return;
    seen.add(label);
    list.push({ key: label, label, color: cleanColor('', label, list.length) });
    return;
  }
  const label = String(item?.label || '').trim();
  const key = String(item?.key || label).trim();
  if (!label || !key || seen.has(key)) return;
  seen.add(key);
  list.push({ key, label, color: cleanColor(item?.color, key, list.length) });
  });
  return list;
}

export function normalizeColumns(value, fallback = []) {
  if (!Array.isArray(value)) return fallback;
  const seen = new Set();
  const list = [];
  value.forEach((item) => {
    const key = String(item?.key || '').trim();
    const label = String(item?.label || '').trim();
    const kind = COLUMN_KINDS.has(item?.kind) ? item.kind : 'text';
    if (!key || !label || seen.has(key) || RESERVED_KEYS.has(key)) return;
    seen.add(key);
    list.push({ key, label, kind, onCard: Boolean(item?.onCard) });
  });
  return list;
}

export function resolveMiniCrmSetup(preset, stored, rows) {
  const fallback = editableColumns(preset);
  if (!stored) {
    const sellers = [...new Set((rows || []).map((row) => String(row?.vendedor || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return {
      statuses: preset?.statuses
        ? normalizeStatuses(preset.statuses)
        : MINI_CRM_STATUSES.map((label) => ({ key: label, label, color: STATUS_COLOR[label] })),
      columns: ensureSystemColumns(fallback),
      sellers,
      cadence: normalizeCadence(preset?.cadence || null),
      saved: false,
    };
  }
  return {
    statuses: normalizeStatuses(stored.statuses),
    columns: ensureSystemColumns(normalizeColumns(stored.columns, fallback)),
    sellers: cleanStrings(stored.sellers),
    cadence: normalizeCadence(stored.cadence),
    saved: true,
  };
}

export function statusLabel(statuses, key) {
  return (statuses || []).find((status) => status.key === key)?.label || key || '';
}

export function isFollowStatus(key) {
  // A cadência pertence à chave do sistema; nomes de colunas manuais não a ativam.
  return key === FOLLOW_UP_STATUS.key;
}

export function followUpDay(row) {
  const explicit = String(row?.proxima_em || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(explicit)) return explicit;
  const note = String(row?.proxima_acao || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(note)) return note;
  const br = note.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return '';
}

export function addDaysYmd(ymd, days) {
  const [year, month, day] = String(ymd || '').split('-').map(Number);
  const date = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export const RETURN_CADENCE = {
  inicial: { label: 'Inicial', total: 5, gaps: [0, 1, 2, 3, 5] },
  repescagem: { label: 'Repescagem', total: 2, gaps: [30, 5] },
};

const MAX_CADENCE_STEPS = 12;

function cleanGaps(value, fallback) {
  const raw = Array.isArray(value) ? value : (Array.isArray(value?.gaps) ? value.gaps : null);
  const gaps = (raw || fallback).slice(0, MAX_CADENCE_STEPS).map((item) => {
    const days = Math.round(Number(item));
    if (!Number.isFinite(days) || days < 0) return 0;
    return Math.min(days, 365);
  });
  return gaps.length ? gaps : fallback.slice();
}

export function normalizeCadence(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    inicial: cleanGaps(source.inicial, RETURN_CADENCE.inicial.gaps),
    repescagem: cleanGaps(source.repescagem, RETURN_CADENCE.repescagem.gaps),
    sem_resposta: String(source.sem_resposta || '').trim(),
  };
}

export function noAnswerStatusKey(statuses, cadence) {
  const key = normalizeCadence(cadence).sem_resposta;
  const found = (statuses || []).find((status) => status.key === key);
  return found?.key || lostStatusKey(statuses);
}

export function cadenceSpec(cadence, kind) {
  const key = kind === 'repescagem' ? 'repescagem' : 'inicial';
  const gaps = normalizeCadence(cadence)[key];
  return { label: RETURN_CADENCE[key].label, total: gaps.length, gaps };
}

export function followStatusKey(statuses) {
  const found = (statuses || []).find((status) => isFollowStatus(status.key));
  return found?.key || '';
}

export function lostStatusKey(statuses) {
  const found = (statuses || []).find((status) => /venda perdida/.test(foldMiniCrm(status.label)) || /venda perdida/.test(foldMiniCrm(status.key)));
  return found?.key || '';
}

/** Status que o fluxo usa (venda, perda, follow-up): a loja não apaga. */
export function systemStatusKeys(statuses) {
  const keys = new Set();
  (statuses || []).forEach((status) => {
    if (isSoldMiniStatus(status.key)) keys.add(status.key);
  });
  const lost = lostStatusKey(statuses);
  if (lost) keys.add(lost);
  const follow = followStatusKey(statuses);
  if (follow) keys.add(follow);
  return keys;
}

/** Status que saíram da lista ao salvar Configurar; os fixos nunca contam como removidos. */
export function removedStatusKeys(prevStatuses, nextStatuses) {
  const next = new Set((nextStatuses || []).map((status) => status.key));
  const locked = systemStatusKeys(prevStatuses);
  return [...new Set((prevStatuses || []).map((status) => status.key))]
    .filter((key) => key && !next.has(key) && !locked.has(key));
}

/** Devolve à lista os status fixos que tenham sumido do que vai ser salvo. */
export function keepSystemStatuses(prevStatuses, nextStatuses) {
  const list = [...(nextStatuses || [])];
  const keys = new Set(list.map((status) => status.key));
  const locked = systemStatusKeys(prevStatuses);
  (prevStatuses || []).forEach((status) => {
    if (locked.has(status.key) && !keys.has(status.key)) list.push(status);
  });
  return list;
}

/** Troca só o status removido pelo de entrada; o resto do mini_crm fica igual. */
export function clearRemovedStatus(mini, removedKeys, target = '') {
  const base = mini && typeof mini === 'object' ? mini : {};
  if (!base.status || !(removedKeys || []).includes(base.status)) return base;
  return { ...base, status: target };
}

export function rescueStatusKey(statuses) {
  const found = (statuses || []).find((status) => /repescagem/.test(foldMiniCrm(status.label)) || /repescagem/.test(foldMiniCrm(status.key)));
  return found?.key || '';
}

export function ensureRescueStatus(statuses) {
  if (rescueStatusKey(statuses)) return statuses || [];
  const list = Array.isArray(statuses) ? statuses.slice() : [];
  list.push({ key: 'Repescagem', label: 'Repescagem', color: '#6d28d9' });
  return list;
}

export function formatDayBr(ymd) {
  const match = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

export function moneyAmount(value) {
  if (value === '' || value == null || typeof value === 'boolean') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value).replace(/R\$/g, '').replace(/\s/g, '');
  if (!text) return null;
  const cleaned = /^-?\d+(\.\d+)?$/.test(text) ? text : text.replace(/\./g, '').replace(',', '.');
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : null;
}

export function formatMoneyBr(value) {
  const amount = moneyAmount(value);
  if (amount == null) return '';
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function sumColumnMoney(rows, key = 'valor') {
  let total = 0;
  let found = false;
  (rows || []).forEach((row) => {
    const amount = moneyAmount(row?.[key]);
    if (!amount) return;
    total += amount;
    found = true;
  });
  return found ? Math.round(total * 100) / 100 : null;
}

export function maskDayBr(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function parseDayBr(text) {
  const match = String(text || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return '';
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) return '';
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  const check = new Date(`${iso}T00:00:00Z`);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day) return '';
  return iso;
}

export function statusKeyByName(statuses, name) {
  const target = foldMiniCrm(name);
  const found = (statuses || []).find((status) => foldMiniCrm(status.label) === target || foldMiniCrm(status.key) === target);
  return found?.key || '';
}

export function destinationStatusKey(statuses, name) {
  const exact = statusKeyByName(statuses, name);
  if (exact) return exact;
  if (foldMiniCrm(name) !== 'agendado') return '';
  const found = (statuses || []).find((status) => {
    const label = foldMiniCrm(`${status.label} ${status.key}`);
    return /agendad/.test(label) && !/reagend/.test(label);
  });
  return found?.key || '';
}

const ATTEMPT_DESTINATION_NAMES = ['Em atendimento', 'Lead qualificado', 'Em negociação', 'Agendado'];

/** Destinos de quem respondeu: só status de trabalho que existem na loja, nunca follow-up, perda, venda ou repescagem. */
export function attemptDestinationOptions(statuses) {
  const list = statuses || [];
  const blocked = new Set([followStatusKey(list), lostStatusKey(list), rescueStatusKey(list)].filter(Boolean));
  const seen = new Set();
  const options = ATTEMPT_DESTINATION_NAMES
    .map((name) => {
      const key = destinationStatusKey(list, name);
      const status = list.find((item) => item.key === key);
      return status ? { key, name: status.label || key } : null;
    })
    .filter((item) => {
      if (!item || seen.has(item.key)) return false;
      if (blocked.has(item.key) || isSoldMiniStatus(item.key) || isFollowStatus(item.key, list)) return false;
      seen.add(item.key);
      return true;
    });
  if (options.length) return options;
  const entry = defaultStatusKey(list);
  const status = list.find((item) => item.key === entry);
  return status && !blocked.has(entry) ? [{ key: entry, name: status.label || entry }] : [];
}

/** Status de compromisso marcado: rótulo com "agendad" (Agendado, Visita Agendada, Reagendado). */
export function appointmentStatusKeys(statuses) {
  return (statuses || [])
    .filter((status) => /agendad/.test(foldMiniCrm(status.label || status.key)) && !isFollowStatus(status.key, statuses))
    .map((status) => status.key);
}

/** Colunas de data do compromisso (Data Agendamento, Data da Visita); nunca venda, retorno ou entrada. */
export function appointmentDateColumns(columns) {
  return (columns || []).filter(isAppointmentDateColumn);
}

export function isAppointmentDateColumn(column) {
  return Boolean(column && (column.kind === 'day' || column.kind === 'date')
    && !isSystemColumn(column.key) && /agend|visita/.test(foldMiniCrm(`${column.label} ${column.key}`)));
}

export function appointmentTimeKey(column) {
  return `${typeof column === 'string' ? column : column.key}_hora`;
}

export function normalizeAppointmentTime(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  return match && Number(match[1]) < 24 && Number(match[2]) < 60 ? `${match[1].padStart(2, '0')}:${match[2]}` : '';
}

export function appointmentTime(mini, columns) {
  const column = appointmentDateColumns(columns).find((item) => dayFromValue(mini?.[item.key]));
  return column ? normalizeAppointmentTime(mini?.[appointmentTimeKey(column)]) : '';
}

function dayFromValue(value) {
  const text = String(value || '').trim();
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  return parseDayBr(text);
}

/** Primeira data de compromisso preenchida no lead, em aaaa-mm-dd; vazio se não houver. */
export function appointmentDay(mini, columns) {
  const base = mini && typeof mini === 'object' ? mini : {};
  for (const column of appointmentDateColumns(columns)) {
    const day = dayFromValue(base[column.key]);
    if (day) return day;
  }
  return '';
}

/** Data de entrada (first_seen_at) dentro do período do Kanban; período vazio aceita tudo. */
export function entryInPeriod(entryIso, fromYmd, toYmd) {
  if (!fromYmd && !toYmd) return true;
  const time = Date.parse(entryIso || '');
  if (!Number.isFinite(time)) return false;
  if (fromYmd && time < Date.parse(`${fromYmd}T00:00:00-03:00`)) return false;
  if (toYmd && time > Date.parse(`${toYmd}T23:59:59.999-03:00`)) return false;
  return true;
}

export function followCardColumn(columns) {
  const list = columns || [];
  const marked = list.find((column) => column.onCard);
  if (marked) return marked;
  const preferred = list.find((column) => ['veiculo', 'interesse', 'revenda'].includes(column.key));
  if (preferred) return preferred;
  return list.find((column) => column.kind === 'text' && !['vendedor', 'proxima_acao', 'observacao', 'proxima_em'].includes(column.key)) || null;
}

function cleanAction(value) {
  const text = String(value || '').trim();
  if (!text || /^follow\s*up$/i.test(text) || followUpDay({ proxima_acao: text })) return '';
  return text;
}

export function openReturn(mini, cadence) {
  const raw = mini?.retorno;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const cadencia = raw.cadencia === 'repescagem' ? 'repescagem' : 'inicial';
  const spec = cadenceSpec(cadence, cadencia);
  const passo = Math.min(spec.total, Math.max(1, Number(raw.passo) || 1));
  return {
    cadencia,
    passo,
    total: spec.total,
    acao: cleanAction(raw.acao),
    em: /^\d{4}-\d{2}-\d{2}$/.test(raw.em || '') ? raw.em : '',
    iniciada: raw.iniciada !== false && cadencia === 'inicial' ? true : Boolean(raw.iniciada),
  };
}

export function returnOfRow(row, statuses, cadence) {
  const stored = openReturn(row?.mini || row, cadence);
  if (stored) return stored;
  if (!isFollowStatus(row?.status, statuses)) return null;
  const spec = cadenceSpec(cadence, 'inicial');
  return {
    cadencia: 'inicial',
    passo: 1,
    total: spec.total,
    acao: cleanAction(row?.proxima_acao),
    em: followUpDay(row),
    iniciada: true,
    virtual: true,
  };
}

export function followColumn(retorno, today) {
  if (!retorno) return '';
  if (retorno.cadencia === 'repescagem' && !retorno.iniciada) return 'repescagem';
  if (!retorno.em) return 'open';
  if (retorno.em < today) return 'late';
  if (retorno.em === today) return 'today';
  return 'next';
}

export function attemptTitle(retorno) {
  if (!retorno) return '';
  if (retorno.cadencia === 'repescagem') {
    return retorno.passo <= 1 ? 'Retomar contato' : `${retorno.passo}º contato da repescagem`;
  }
  return `${retorno.passo}º contato`;
}

export function progressLabel(retorno) {
  if (!retorno) return '';
  const name = RETURN_CADENCE[retorno.cadencia]?.label || 'Inicial';
  return `${name} · ${retorno.passo} de ${retorno.total}`;
}

export function suggestReturnDay(cadencia, passo, fromYmd, cadence) {
  const gaps = cadenceSpec(cadence, cadencia).gaps;
  const gap = gaps[Math.max(0, passo - 1)] ?? gaps[gaps.length - 1];
  return addDaysYmd(fromYmd, gap);
}

function remember(mini, retorno, resultado) {
  const item = {
    cadencia: retorno?.cadencia || '',
    passo: retorno?.passo || 0,
    acao: retorno?.acao || '',
    em: retorno?.em || '',
    resultado,
    em_conclusao: new Date().toISOString(),
  };
  const list = Array.isArray(mini.retorno_historico) ? mini.retorno_historico.slice(-39) : [];
  list.push(item);
  mini.retorno_historico = list;
}

function mirrorReturn(mini) {
  const retorno = mini.retorno;
  if (!retorno) {
    delete mini.proxima_em;
    delete mini.proxima_acao;
    return mini;
  }
  if (retorno.em) mini.proxima_em = retorno.em;
  else delete mini.proxima_em;
  if (retorno.acao) mini.proxima_acao = retorno.acao;
  else delete mini.proxima_acao;
  return mini;
}

function putReturn(mini, retorno, cadence) {
  const spec = cadenceSpec(cadence, retorno.cadencia);
  mini.retorno = {
    cadencia: retorno.cadencia,
    passo: retorno.passo,
    total: spec.total,
    acao: retorno.acao || attemptTitle(retorno),
    em: retorno.em || '',
    iniciada: Boolean(retorno.iniciada),
  };
  return mirrorReturn(mini);
}

export function ensureInicial(mini, today, statuses, cadence) {
  const next = readMiniCrm(mini);
  const follow = followStatusKey(statuses);
  if (follow) next.status = follow;
  const current = openReturn(next, cadence);
  if (current?.cadencia === 'repescagem' && !current.iniciada) return startRepescagem(next, today, statuses, cadence);
  if (current) return mirrorReturn(next);
  return putReturn(next, {
    cadencia: 'inicial',
    passo: 1,
    acao: '1º contato',
    em: suggestReturnDay('inicial', 1, today, cadence),
    iniciada: true,
  }, cadence);
}

export function scheduleReturn(mini, { em, acao }, cadence) {
  const next = readMiniCrm(mini);
  const current = openReturn(next, cadence) || {
    cadencia: 'inicial', passo: 1, iniciada: true, acao: '1º contato', em: '',
  };
  return putReturn(next, { ...current, em: em || '', acao: acao || current.acao || attemptTitle(current) }, cadence);
}

export function startRepescagem(mini, today, statuses, cadence) {
  const next = readMiniCrm(mini);
  const follow = followStatusKey(statuses);
  if (follow) next.status = follow;
  const current = openReturn(next, cadence);
  if (!current || current.cadencia !== 'repescagem') return next;
  return putReturn(next, { ...current, iniciada: true, em: today, acao: current.acao || 'Retomar contato' }, cadence);
}

export function registerAttempt(mini, { resultado, destino, em, today, statuses, cadence }) {
  const next = readMiniCrm(mini);
  const current = openReturn(next, cadence) || returnOfRow({ mini: next, status: next.status }, statuses, cadence);
  if (!current) return next;
  if (resultado === 'respondeu') {
    const keys = new Set((statuses || []).map((status) => status.key));
    const target = destino && (!keys.size || keys.has(destino)) ? destino : defaultStatusKey(statuses);
    remember(next, current, target || 'Respondeu');
    delete next.retorno;
    if (target) next.status = target;
    return mirrorReturn(syncQualifiedFromStatus(next));
  }
  if (resultado === 'encerrar') {
    remember(next, current, 'Venda perdida');
    delete next.retorno;
    const lost = lostStatusKey(statuses);
    if (lost) next.status = lost;
    return mirrorReturn(next);
  }
  if (resultado === 'repescagem') {
    remember(next, current, 'Sem retorno');
    const rescue = rescueStatusKey(ensureRescueStatus(statuses));
    if (rescue) next.status = rescue;
    next.motivo = 'Sem retorno';
    return putReturn(next, {
      cadencia: 'repescagem',
      passo: 1,
      acao: 'Retomar contato',
      em: em || suggestReturnDay('repescagem', 1, today, cadence),
      iniciada: false,
    }, cadence);
  }
  remember(next, current, 'Não respondeu');
  if (current.passo >= current.total) {
    delete next.retorno;
    const lost = current.cadencia === 'repescagem'
      ? noAnswerStatusKey(statuses, cadence)
      : lostStatusKey(statuses);
    if (lost) next.status = lost;
    if (current.cadencia === 'repescagem') next.motivo = 'Sem retorno';
    return mirrorReturn(next);
  }
  const passo = current.passo + 1;
  return putReturn(next, {
    cadencia: current.cadencia,
    passo,
    acao: attemptTitle({ cadencia: current.cadencia, passo }),
    em: em || suggestReturnDay(current.cadencia, passo, today, cadence),
    iniciada: true,
  }, cadence);
}

export function applyStatusChange(mini, status, statuses, today, cadence) {
  const next = syncQualifiedFromStatus({ ...readMiniCrm(mini), status });
  if (isFollowStatus(status, statuses)) return ensureInicial(next, today, statuses, cadence);
  const current = openReturn(next, cadence);
  if (current) {
    remember(next, current, status || 'Status alterado');
    delete next.retorno;
  }
  next.status = status;
  return mirrorReturn(next);
}

/**
 * Monta o mini_crm da venda confirmada: status, data_venda e valor.
 * Usa applyStatusChange para fechar retorno aberto como os outros status.
 */
export function buildConfirmedSaleMini(mini, { status, dataVenda, valor }, statuses, today, cadence) {
  const next = applyStatusChange(mini, status || 'Venda Realizada', statuses, today, cadence);
  const day = String(dataVenda || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) next.data_venda = day;
  const amount = Number(valor);
  if (Number.isFinite(amount) && amount > 0) next.valor = amount;
  return next;
}

export function groupFollowUps(rows, today, statuses, cadence) {
  const open = [];
  const late = [];
  const due = [];
  const next = [];
  const repescagem = [];
  (rows || []).forEach((row) => {
    if (!String(row?.nome || '').trim() && !String(row?.telefone || '').trim()) return;
    const retorno = returnOfRow(row, statuses, cadence);
    if (!retorno) return;
    const column = followColumn(retorno, today);
    const item = { ...row, retorno };
    if (column === 'late') late.push(item);
    else if (column === 'today') due.push(item);
    else if (column === 'next') next.push(item);
    else if (column === 'repescagem') repescagem.push(item);
    else open.push(item);
  });
  const byName = (a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
  const byDay = (a, b) => String(a.retorno?.em || '').localeCompare(String(b.retorno?.em || '')) || byName(a, b);
  open.sort(byName);
  late.sort(byDay);
  due.sort(byName);
  next.sort(byDay);
  repescagem.sort(byDay);
  return {
    open,
    late,
    today: due,
    next,
    repescagem,
    counts: {
      open: open.length,
      late: late.length,
      today: due.length,
      next: next.length,
      repescagem: repescagem.length,
    },
  };
}

export function atendimentoStatusKey(statuses) {
  const found = (statuses || []).find((status) => {
    const label = foldMiniCrm(status.label);
    const key = foldMiniCrm(status.key);
    return label === 'em atendimento' || key === 'em atendimento';
  });
  return found?.key || '';
}
