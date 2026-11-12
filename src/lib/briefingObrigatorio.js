/**
 * Briefing Obrigatório v1.1 — estágio A
 * Validação retorna avisos; nunca bloqueia atribuição/conclusão.
 */

export const BRIEFING_STAGES = ['A', 'B', 'C'];

export const OBJETIVO_OPTIONS = [
  { value: 'vender', label: 'Vender' },
  { value: 'agendar', label: 'Agendar' },
  { value: 'autoridade', label: 'Autoridade' },
  { value: 'engajamento', label: 'Engajamento' },
  { value: 'institucional', label: 'Institucional' },
  { value: 'recuperacao', label: 'Recuperação' },
];

const BLOCKLIST = new Set([
  'ok',
  'a definir',
  'conforme combinado',
  'padrão',
  'padrao',
  'mesmo de sempre',
  '-',
  'x',
  '.',
  'teste',
  'n/a',
  'na',
]);

const REPEAT_CHAR_RE = /^(.)\1{2,}$/;

/** Tipos isentos do gate (permanentes). */
export function isBriefingExempt(type) {
  const t = normalizeType(type);
  return [
    'trafego_recorrente',
    'paid_traffic',
    'trafego',
    'reuniao',
    'reunião',
    'financeiro',
    'interno',
    'administrativo',
    'onboarding',
  ].includes(t);
}

export function normalizeType(type) {
  return String(type || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/** Família de regras de formulário. */
export function briefingFamily(type) {
  const t = normalizeType(type);
  if (isBriefingExempt(type)) return 'isento';
  if (['video', 'videos', 'reels', 'story', 'stories'].includes(t)) return 'video';
  if (['planejamento', 'planejamento_mensal'].includes(t)) return 'planejamento';
  if (['arte', 'carrossel', 'social_media', 'post'].includes(t)) return 'arte';
  return 'generico';
}

export function trimText(v) {
  return String(v ?? '').trim();
}

function isBlocklisted(text) {
  const t = trimText(text).toLowerCase();
  if (!t) return false;
  if (BLOCKLIST.has(t)) return true;
  if (REPEAT_CHAR_RE.test(t)) return true;
  return false;
}

/**
 * @returns {{ ok: boolean, missing: string[], warnings: string[], completo: boolean }}
 */
export function validateBriefing({
  type,
  title,
  description,
  payload = {},
  briefingLegado = false,
  estado = 'rascunho',
}) {
  const missing = [];
  const warnings = [];
  const family = briefingFamily(type);
  const p = payload && typeof payload === 'object' ? payload : {};

  if (family === 'isento') {
    return { ok: true, missing: [], warnings: [], completo: true };
  }

  if (briefingLegado) {
    const hasDesc = trimText(description).length > 0;
    if (!hasDesc) {
      missing.push('description');
      warnings.push('Tarefa legada: preencha a descrição.');
    }
    return { ok: hasDesc, missing, warnings, completo: hasDesc };
  }

  // Rascunho: sempre pode salvar; completude falsa se incompleto
  const requireField = (key, label, minLen = 1) => {
    const raw = p[key];
    const text = trimText(raw);
    if (!text || text.length < minLen) {
      missing.push(key);
      warnings.push(`${label} incompleto (mín. ${minLen} caracteres).`);
      return null;
    }
    if (isBlocklisted(text)) {
      missing.push(key);
      warnings.push(`${label} inválido (anti-burla): "${text}".`);
      return null;
    }
    return text;
  };

  // Campos comuns
  const objetivoEnum = trimText(p.objetivo);
  const objetivoTxt = trimText(p.objetivo_texto);
  const isEnum = OBJETIVO_OPTIONS.some((o) => o.value === objetivoEnum);
  if (isEnum) {
    // ok
  } else if (objetivoTxt.length >= 20 && !isBlocklisted(objetivoTxt)) {
    // ok texto livre
  } else if (objetivoEnum.length >= 20 && !isBlocklisted(objetivoEnum)) {
    // ok
  } else {
    missing.push('objetivo');
    warnings.push('Objetivo: escolha da lista ou texto ≥ 20 caracteres (anti-burla).');
  }

  requireField('data_uso', 'Data de uso', 8);
  if (!p.responsavel_id) {
    missing.push('responsavel_id');
    warnings.push('Responsável do briefing não informado.');
  }
  const criterio = requireField('criterio_pronto', 'Critério de pronto', 15);

  const objetivoCompare = (isEnum ? objetivoEnum : objetivoTxt || objetivoEnum).toLowerCase();
  if (criterio && objetivoCompare && criterio.toLowerCase() === objetivoCompare) {
    missing.push('criterio_pronto');
    warnings.push('Critério de pronto não pode ser igual ao objetivo.');
  }

  if (family === 'arte') {
    requireField('formato', 'Formato', 2);
    const copy = requireField('copy_final', 'Copy final', 40);
    requireField('cta', 'CTA', 5);
    if (copy && trimText(title) && copy.toLowerCase() === trimText(title).toLowerCase()) {
      missing.push('copy_final');
      warnings.push('Copy final não pode ser igual ao título.');
    }
    if (normalizeType(type) === 'carrossel') {
      const slides = Number(p.qtd_slides);
      if (!Number.isFinite(slides) || slides < 2 || slides > 10) {
        missing.push('qtd_slides');
        warnings.push('Carrossel exige qtd_slides entre 2 e 10.');
      }
    }
  }

  if (family === 'video') {
    requireField('gancho', 'Gancho', 20);
    requireField('roteiro', 'Roteiro', 80);
    requireField('quem_grava', 'Quem grava', 2);
    requireField('data_gravacao', 'Data de gravação', 8);
    const dataUso = trimText(p.data_uso);
    const dataGrav = trimText(p.data_gravacao);
    if (dataUso && dataGrav && dataGrav > dataUso) {
      missing.push('data_gravacao');
      warnings.push('Data de gravação não pode ser depois da data de uso.');
    }
    const quem = trimText(p.quem_grava).toLowerCase();
    if (quem && quem !== 'cliente') {
      requireField('local_gravacao', 'Local de gravação', 2);
    }
    const dur = Number(p.duracao_alvo_seg);
    if (!Number.isFinite(dur) || dur <= 0 || dur > 90) {
      missing.push('duracao_alvo_seg');
      warnings.push('Duração alvo deve ser ≤ 90 segundos.');
    }
  }

  if (family === 'planejamento') {
    requireField('mes_referencia', 'Mês de referência', 7);
    const qtd = Number(p.qtd_entregas_contratadas);
    if (!Number.isFinite(qtd) || qtd <= 0) {
      missing.push('qtd_entregas_contratadas');
      warnings.push('Informe a quantidade de entregas contratadas.');
    }
    requireField('pauta_resumo', 'Pauta resumo', 60);
  }

  // Deduplicate
  const uniqMissing = [...new Set(missing)];
  const uniqWarnings = [...new Set(warnings)];
  const camposOk = uniqMissing.length === 0;

  // Cobertura só conta completo quando estado === 'completo' E campos ok
  // (rascunho com campos preenchidos ainda é rascunho)
  const isCompleteForCoverage = estado === 'completo' && camposOk;

  return {
    ok: true, // estágio A: nunca bloqueia
    missing: uniqMissing,
    warnings: uniqWarnings,
    completo: isCompleteForCoverage,
    camposOk,
  };
}

/**
 * Prepara colunas de briefing para insert/update.
 * Novas tarefas: legado=false, estado rascunho por padrão.
 */
export function buildBriefingColumns({
  type,
  title,
  description,
  payload,
  estado,
  briefingLegado = false,
  existingLegado = false,
  isNew = false,
}) {
  const legado = isNew ? false : Boolean(existingLegado || briefingLegado);
  const family = briefingFamily(type);
  const est = estado || 'rascunho';

  if (family === 'isento') {
    return {
      briefing_estado: 'completo',
      briefing_completo: true,
      briefing_legado: legado,
      briefing_payload: payload || {},
      briefing_validado_em: new Date().toISOString(),
      _warnings: [],
    };
  }

  const result = validateBriefing({
    type,
    title,
    description,
    payload,
    briefingLegado: legado,
    estado: est,
  });

  let briefing_completo = false;
  if (legado) {
    briefing_completo = trimText(description).length > 0;
  } else if (est === 'completo' && result.camposOk) {
    briefing_completo = true;
  } else if (est === 'completo' && !result.camposOk) {
    // força rascunho se tentou marcar completo sem campos
    return {
      briefing_estado: 'rascunho',
      briefing_completo: false,
      briefing_legado: legado,
      briefing_payload: payload || {},
      briefing_validado_em: new Date().toISOString(),
      _warnings: result.warnings,
      _missing: result.missing,
    };
  }

  return {
    briefing_estado: est,
    briefing_completo,
    briefing_legado: legado,
    briefing_payload: payload || {},
    briefing_validado_em: new Date().toISOString(),
    _warnings: result.warnings,
    _missing: result.missing,
  };
}

/** Conta como planejado na cobertura? */
export function countsAsPlanejado({ briefing_completo, briefing_legado, briefing_estado, type, description }) {
  if (isBriefingExempt(type)) return true;
  if (briefing_legado) return true; // histórico pré-deploy
  if (briefing_completo) return true;
  // rascunho novo não conta
  if (briefing_estado === 'rascunho' || !briefing_completo) return false;
  return false;
}

/**
 * Legenda pronta para o post: copy da tarefa, senão a do material do plano.
 */
export function taskPostCaption(source) {
  if (!source || typeof source !== 'object') return '';
  const payload = source.briefing_payload && typeof source.briefing_payload === 'object'
    ? source.briefing_payload
    : source;
  const planned = payload.plan_material && typeof payload.plan_material === 'object'
    ? payload.plan_material
    : {};
  return (
    trimText(payload.copy_final)
    || trimText(payload.legenda)
    || trimText(planned.legenda)
    || trimText(planned.copy_final)
  );
}

export function emptyBriefingPayload() {
  return {
    objetivo: '',
    objetivo_texto: '',
    data_uso: '',
    responsavel_id: '',
    criterio_pronto: '',
    formato: '',
    copy_final: '',
    cta: '',
    referencia_url: '',
    qtd_slides: '',
    gancho: '',
    roteiro: '',
    quem_grava: '',
    data_gravacao: '',
    local_gravacao: '',
    duracao_alvo_seg: '',
    mes_referencia: '',
    qtd_entregas_contratadas: '',
    pauta_resumo: '',
  };
}
