import { monthKey } from './projectPeriod.js';
import { planMateriaisAsRows, pickWritableCampaignPlanPayload, mergeCronogramaWithMaterials } from './campaignPlanMateriais.js';

const suggestedMaterialTypes = new Map([
  ['arte', 'arte'], ['imagem', 'arte'], ['design', 'arte'],
  ['carrossel', 'carrossel'], ['carousel', 'carrossel'],
  ['video', 'video'], ['vídeo', 'video'],
  ['reel', 'reels'], ['reels', 'reels'],
  ['story', 'story'], ['stories', 'story'],
  ['post', 'post'], ['publicacao', 'post'], ['publicação', 'post'],
]);
const suggestedMaterialFormats = { arte: 'Arte', carrossel: 'Carrossel', video: 'Vídeo', reels: 'Reels', story: 'Story', post: 'Post', outro: 'Outro' };
const suggestedChannels = new Map([
  ['instagram', 'Instagram'], ['facebook', 'Facebook'], ['linkedin', 'LinkedIn'],
  ['tiktok', 'TikTok'], ['tik tok', 'TikTok'], ['youtube', 'YouTube'],
  ['site', 'Site'], ['google meu negócio', 'Google Meu Negócio'],
  ['google meu negocio', 'Google Meu Negócio'], ['outro', 'Outro'],
]);

const textValue = (value) => typeof value === 'string' ? value.trim() : '';
const comparableText = (value) => textValue(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
const suggestedMonths = new Map([
  ['janeiro', 1], ['jan', 1], ['fevereiro', 2], ['fev', 2], ['marco', 3], ['mar', 3],
  ['abril', 4], ['abr', 4], ['maio', 5], ['mai', 5], ['junho', 6], ['jun', 6],
  ['julho', 7], ['jul', 7], ['agosto', 8], ['ago', 8], ['setembro', 9], ['set', 9],
  ['outubro', 10], ['out', 10], ['novembro', 11], ['nov', 11], ['dezembro', 12], ['dez', 12],
]);

function validIsoDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return '';
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function normalizeSuggestedDate(value, referencePeriod = '') {
  const source = textValue(value);
  if (!source) return '';
  const referenceYear = Number.parseInt(String(referencePeriod || '').match(/\b(20\d{2})\b/)?.[1] || '', 10);
  const iso = source.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return validIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const numeric = source.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/);
  if (numeric) {
    let year = Number.parseInt(numeric[3] || referenceYear, 10);
    if (year > 0 && year < 100) year += 2000;
    return year ? validIsoDate(year, Number(numeric[2]), Number(numeric[1])) : '';
  }
  const written = comparableText(source).match(/\b(\d{1,2})(?:\s+de)?\s+(janeiro|jan|fevereiro|fev|marco|mar|abril|abr|maio|mai|junho|jun|julho|jul|agosto|ago|setembro|set|outubro|out|novembro|nov|dezembro|dez)(?:\s+de\s+(20\d{2}))?\b/);
  if (!written) return '';
  const year = Number.parseInt(written[3] || referenceYear, 10);
  const month = suggestedMonths.get(written[2]);
  return year && month ? validIsoDate(year, month, Number(written[1])) : '';
}

export function normalizePlanMaterialNumber(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  const number = Number.parseInt(digits, 10);
  if (!Number.isFinite(number) || number < 1) return '';
  return String(number).padStart(2, '0');
}

export function nextPlanMaterialNumber(materials, tipo) {
  const normalizedType = suggestedMaterialTypes.get(comparableText(tipo)) || comparableText(tipo) || 'outro';
  const matching = (materials || []).filter((item) => {
    const itemType = suggestedMaterialTypes.get(comparableText(item?.tipo)) || comparableText(item?.tipo) || 'outro';
    return itemType === normalizedType;
  });
  const numbers = matching.map((item) => {
    const explicit = normalizePlanMaterialNumber(item?.numero);
    if (explicit) return Number.parseInt(explicit, 10);
    const prefix = textValue(item?.descricao).match(/^(?:video|vídeo|arte|carrossel|reels?|stories?|post)\s+(\d+)/i)?.[1];
    return prefix ? Number.parseInt(prefix, 10) : 0;
  });
  return String(Math.max(matching.length, ...numbers, 0) + 1).padStart(2, '0');
}

export function planMaterialSequenceNumber(materials, material) {
  const explicit = normalizePlanMaterialNumber(material?.numero);
  if (explicit) return explicit;
  const prefix = textValue(material?.descricao).match(/^(?:video|vídeo|arte|carrossel|reels?|stories?|post)\s+(\d+)/i)?.[1];
  if (prefix) return normalizePlanMaterialNumber(prefix);
  const type = suggestedMaterialTypes.get(comparableText(material?.tipo)) || comparableText(material?.tipo) || 'outro';
  const index = (materials || []).findIndex((item) => item === material || (material?.id != null && String(item?.id) === String(material.id)));
  const relevant = index >= 0 ? materials.slice(0, index + 1) : [...(materials || []), material];
  const position = relevant.filter((item) => {
    const itemType = suggestedMaterialTypes.get(comparableText(item?.tipo)) || comparableText(item?.tipo) || 'outro';
    return itemType === type;
  }).length;
  return String(Math.max(position, 1)).padStart(2, '0');
}

export function planMaterialTaskType(material) {
  const type = suggestedMaterialTypes.get(comparableText(material?.tipo)) || comparableText(material?.tipo) || 'outro';
  if (['post', 'story'].includes(type)) return 'arte';
  return type;
}

export function planMaterialPreparation(material, stages = []) {
  const taskType = planMaterialTaskType(material);
  const video = taskType === 'video' || taskType === 'reels';
  const briefingStatus = material?.briefing_status === 'ready' ? 'ready' : 'needs_briefing';
  const scriptStatus = ['not_started', 'ready_for_review', 'approved'].includes(material?.script_status)
    ? material.script_status
    : 'not_started';
  const preferredKey = briefingStatus !== 'ready'
    ? 'briefing'
    : video
      ? ({ not_started: 'script', ready_for_review: 'script_review', approved: 'recording' }[scriptStatus])
      : 'art_production';
  const fallback = stages.find((stage, index) => index > 0 && stage.kind !== 'backlog') || stages[0] || null;
  const entryStage = stages.find((stage) => stage.key === preferredKey)
    || (briefingStatus !== 'ready' ? stages.find((stage) => stage.kind === 'planning') : null)
    || (preferredKey === 'script_review' ? stages.find((stage) => stage.kind === 'review') : null)
    || (briefingStatus === 'ready' ? stages.find((stage) => stage.kind === 'production') : null)
    || fallback;
  const label = entryStage?.label || ({
    briefing: 'Briefing',
    art_production: 'Produção da arte',
    script: 'Roteiro',
    script_review: 'Aprovação do roteiro',
    recording: 'Gravação',
  }[preferredKey] || 'Primeira etapa');
  return { taskType, video, briefingStatus, scriptStatus, preferredKey, entryStage, entryStageKey: entryStage?.key || preferredKey, label };
}

export function planMaterialTaskTitle(clientName, material, materials = []) {
  const type = suggestedMaterialTypes.get(comparableText(material?.tipo)) || comparableText(material?.tipo) || 'outro';
  const label = { arte: 'Arte', carrossel: 'Carrossel', video: 'Video', reels: 'Reels', story: 'Story', post: 'Post' }[type] || 'Outro';
  const number = planMaterialSequenceNumber(materials, material);
  const name = textValue(material?.descricao)
    .replace(/^\[[^\]]+\]\s*/i, '')
    .replace(/^(?:video|vídeo|videos|arte|carrossel|reels?|stories?|post|posts)\s+\d+\s*(?:[-–—:]\s*)?/i, '')
    .trim();
  return `[${textValue(clientName) || 'Cliente'}] ${label}${number ? ` ${number}` : ''}${name ? ` - ${name}` : ''}`;
}

function parseSuggestionJson(raw) {
  if (raw && typeof raw === 'object') return raw;
  const source = textValue(raw);
  if (!source) throw new Error('A IA não retornou materiais.');
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
  const candidate = fenced || source.slice(source.indexOf('{'), source.lastIndexOf('}') + 1);
  try { return JSON.parse(candidate); }
  catch { throw new Error('A IA respondeu em um formato que não pôde ser conferido. Tente novamente.'); }
}

export function parseSuggestedPlanMaterials(raw, existingMaterials = [], options = {}) {
  const parsed = parseSuggestionJson(raw);
  const candidates = parsed?.fields?.materiais ?? parsed?.materiais ?? parsed?.items;
  if (!Array.isArray(candidates)) throw new Error('A IA não encontrou uma lista de materiais no plano.');

  const materialMonth = (item) => monthKey(item?.data_postagem || item?.data_publicacao) || monthKey(item?.mes_referencia) || monthKey(options.referencePeriod);
  const known = new Set((existingMaterials || []).map((item) => `${comparableText(item?.tipo)}|${comparableText(item?.descricao)}|${materialMonth(item)}`));
  const result = [];
  for (const item of candidates) {
    if (!item || typeof item !== 'object') continue;
    const descricao = textValue(item.descricao ?? item.titulo ?? item.title ?? item.nome);
    if (!descricao) continue;
    const requestedType = comparableText(item.tipo ?? item.type ?? item.formato);
    const tipo = suggestedMaterialTypes.get(requestedType) || 'outro';
    const key = `${comparableText(tipo)}|${comparableText(descricao)}|${materialMonth(item)}`;
    if (known.has(key)) continue;
    known.add(key);
    const rawChannels = Array.isArray(item.canais) ? item.canais : textValue(item.canais).split(/[,;|]/);
    const canais = [...new Set(rawChannels.map((channel) => suggestedChannels.get(comparableText(channel))).filter(Boolean))];
    const priorMaterials = [...(existingMaterials || []), ...result];
    const requestedNumber = normalizePlanMaterialNumber(item.numero ?? item.number ?? item.sequencia);
    const numberAlreadyUsed = requestedNumber && priorMaterials.some((material) => {
      const materialType = suggestedMaterialTypes.get(comparableText(material?.tipo)) || comparableText(material?.tipo) || 'outro';
      return materialType === tipo && normalizePlanMaterialNumber(material?.numero) === requestedNumber;
    });
    const number = requestedNumber && !numberAlreadyUsed ? requestedNumber : nextPlanMaterialNumber(priorMaterials, tipo);
    result.push({
      id: globalThis.crypto?.randomUUID?.() || `ai-material-${Date.now()}-${result.length + 1}`,
      tipo,
      formato: suggestedMaterialFormats[tipo],
      numero: number,
      mes_referencia: materialMonth(item) ? `${materialMonth(item)}-01` : '',
      descricao,
      detalhes: textValue(item.detalhes ?? item.briefing),
      roteiro: textValue(item.roteiro ?? item.texto ?? item.script),
      legenda: textValue(item.legenda),
      cta: textValue(item.cta),
      referencias: textValue(item.referencias ?? item.links),
      canais,
      data_entrega: normalizeSuggestedDate(item.data_entrega ?? item.data_criacao ?? item.prazo_producao ?? item.prazo, options.referencePeriod),
      data_postagem: normalizeSuggestedDate(item.data_postagem ?? item.data_publicacao ?? item.publicacao ?? item.postagem, options.referencePeriod),
      briefing_status: 'needs_briefing',
      script_status: 'not_started',
      status_material: 'rascunho',
    });
  }
  return result;
}

export function emptyProjectPlan(projectId) {
  return { project_id: projectId, objetivo: '', contexto_ia: '', estrategia_comunicacao: {}, conteudo_criativos: { fases: [] }, trafego_pago: {}, materiais: [], cronograma: [] };
}

export function normalizeProjectPlan(row) {
  if (!row) return null;
  return { ...row, materiais: planMateriaisAsRows(row).map((item) => ({ ...item, id: item.id ?? crypto.randomUUID() })) };
}

export function projectPlanPayload(plan) {
  return pickWritableCampaignPlanPayload({ ...plan, cronograma: mergeCronogramaWithMaterials(plan) });
}

function reusePlanItem(item) {
  const content = structuredClone(item);
  // These are prior execution records, not references or reusable creative text.
  for (const key of ['task_id', 'tarefa_id', 'link_publicacao', 'url_publicacao', 'data_uso', 'data_gravacao', 'mes_referencia']) delete content[key];
  return {
    ...content,
    id: crypto.randomUUID(),
    data_entrega: '',
    data_postagem: '',
    responsavel_id: null,
    briefing_status: 'needs_briefing',
    script_status: 'not_started',
  };
}

export function reuseProjectPlan(source, projectId) {
  const plan = normalizeProjectPlan(source);
  return {
    ...emptyProjectPlan(projectId),
    ...projectPlanPayload(plan),
    materiais: plan.materiais.map((m) => ({ ...reusePlanItem(m), status_material: 'rascunho' })),
    conteudo_criativos: { ...plan.conteudo_criativos, fases: (plan.conteudo_criativos?.fases || []).map(reusePlanItem) },
    cronograma: [],
  };
}

export function applyProjectPlanSuggestion(plan, updates) {
  const next = structuredClone(plan);
  const editable = new Set(['objetivo', 'contexto_ia', 'estrategia_comunicacao', 'conteudo_criativos', 'trafego_pago', 'materiais', 'cronograma']);
  for (const [key, value] of Object.entries(updates || {})) {
    const [field, nested] = key.split('.');
    if (!editable.has(field)) continue;
    if (field === 'materiais') {
      const incoming = planMateriaisAsRows({ materiais: nested ? { [nested]: value } : value });
      const merged = [...planMateriaisAsRows(next)];
      for (const item of incoming) {
        const index = item.id == null ? -1 : merged.findIndex((m) => String(m.id) === String(item.id));
        if (index >= 0) merged[index] = { ...merged[index], ...item, id: merged[index].id };
        else merged.push({ ...item, id: item.id ?? crypto.randomUUID() });
      }
      next.materiais = merged;
      continue;
    }
    if (nested && !['__proto__', 'constructor', 'prototype'].includes(nested)) next[field] = { ...next[field], [nested]: value };
    else if (!nested) next[field] = value;
  }
  return normalizeProjectPlan(next);
}
