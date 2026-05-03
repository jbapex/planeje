/**
 * Utilitários compartilhados entre Plano de Campanha e Calendário de materiais.
 */

/** Colunas que o PostgREST aceita em PATCH em `campaign_plans` (evita PGRST204 por chaves extra). */
export const CAMPAIGN_PLAN_UPDATE_KEYS = [
  'objetivo',
  'estrategia_comunicacao',
  'conteudo_criativos',
  'trafego_pago',
  'materiais',
  'cronograma',
  'contexto_ia',
];

export function pickWritableCampaignPlanPayload(row) {
  if (!row || typeof row !== 'object') return {};
  const out = {};
  for (const k of CAMPAIGN_PLAN_UPDATE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(row, k) && row[k] !== undefined) {
      out[k] = row[k];
    }
  }
  return out;
}

/** Clona para envio HTTP (remove referências partilhadas e valores não-JSON). */
export function deepCloneForJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

/**
 * Tenta extrair o nome da coluna desconhecida em erros PostgREST / Supabase (ex.: PGRST204).
 * Prioriza o formato explícito de `campaign_plans` para não confundir com texto de JSON/IA.
 */
export function extractPostgrestUnknownColumn(error, tableName = 'campaign_plans') {
  const msg = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ');
  const esc = tableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const strictSingle = new RegExp(`Could not find the '([^']+)' column of '${esc}'`, 'i');
  const m1 = msg.match(strictSingle);
  if (m1?.[1]) return m1[1];

  const strictDouble = new RegExp(`Could not find the "([^"]+)" column of "${esc}"`, 'i');
  const m2 = msg.match(strictDouble);
  if (m2?.[1]) return m2[1];

  const code = String(error?.code || '');
  const allowLoose = code === 'PGRST204' || msg.includes('schema cache');
  if (!allowLoose) return null;

  const patterns = [
    /Could not find the ['"]([^'"]+)['"] column/i,
    /column ['"]([^'"]+)['"] of relation/i,
    /unknown column ['"]([^'"]+)['"]/i,
  ];
  for (const re of patterns) {
    const m = msg.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

/**
 * PATCH em `campaign_plans` com retentativas: coluna inexistente (PGRST204) ou `contexto_ia` ausente no cache.
 */
export async function patchCampaignPlanRow(supabase, planId, planRowLike, { maxRetries = 14 } = {}) {
  let body = deepCloneForJson(pickWritableCampaignPlanPayload(planRowLike));
  let lastError = null;

  for (let guard = 0; guard < maxRetries; guard++) {
    if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
      lastError = lastError || { message: 'Payload de atualização vazio após ajustes ao esquema.' };
      break;
    }

    const { error } = await supabase.from('campaign_plans').update(body).eq('id', planId);
    if (!error) return { error: null };

    lastError = error;
    const code = String(error.code || '');
    const msg = [error.message, error.details, error.hint].filter(Boolean).join(' ');

    const ctxErr =
      /contexto_ia/i.test(msg) && Object.prototype.hasOwnProperty.call(body, 'contexto_ia');
    if (ctxErr) {
      const { contexto_ia: _c, ...rest } = body;
      body = deepCloneForJson(pickWritableCampaignPlanPayload(rest));
      continue;
    }

    const isUnknownCol =
      code === 'PGRST204' ||
      new RegExp(`Could not find the '[^']+' column of 'campaign_plans'`, 'i').test(msg) ||
      new RegExp(`Could not find the "[^"]+" column of "campaign_plans"`, 'i').test(msg) ||
      (msg.includes('schema cache') && msg.includes('campaign_plans'));

    if (isUnknownCol) {
      const badCol = extractPostgrestUnknownColumn(error, 'campaign_plans');
      if (badCol && Object.prototype.hasOwnProperty.call(body, badCol)) {
        const { [badCol]: _removed, ...rest } = body;
        body = deepCloneForJson(pickWritableCampaignPlanPayload(rest));
        continue;
      }
    }

    break;
  }

  return { error: lastError };
}

/** Marca linhas no JSONB array que representam ideias de story (texto curto). */
export const PJ_STORY_MARKER = '__pj_story_idea';

/** Título da tarefa criada a partir de um material: [Empresa do cliente] descrição */
export function buildTaskTitleFromPlanMaterial(clientEmpresa, materialDescricao) {
  const nome = (clientEmpresa || '').trim() || 'Cliente';
  const titulo = (materialDescricao || '').trim() || '—';
  return `[${nome}] ${titulo}`;
}

export function getPlanItemTaskWarnings(item) {
  const blocking = [];
  const optional = [];
  const desc = (item?.descricao || '').trim();
  const entrega = (item?.data_entrega || '').trim();
  const postagem = (item?.data_postagem || '').trim();
  const isFasePlanejamento = String(item?.tipo || '').trim() === 'Planejamento';

  if (!desc) blocking.push('Descrição (vira o título da tarefa)');

  /** Fases do plano são estratégicas: tarefa só precisa de título; datas e responsável são opcionais. */
  if (isFasePlanejamento) {
    if (!(item?.detalhes || '').trim()) optional.push('Texto da fase no plano (recomendado)');
    if (!item?.responsavel_id) optional.push('Responsável na tarefa (opcional)');
    return { blocking, optional };
  }

  if (!entrega) blocking.push('Data de entrega');
  if (!postagem) blocking.push('Data de postagem');
  if (!item?.responsavel_id) optional.push('Responsável');
  if (!(item?.detalhes || '').trim()) optional.push('Detalhes ou roteiro no plano');
  return { blocking, optional };
}

/** Data exibida no calendário: postagem tem prioridade, senão entrega. */
export function getMaterialCalendarDateKey(m) {
  const post = (m?.data_postagem || '').trim();
  const ent = (m?.data_entrega || '').trim();
  return post || ent || null;
}

/** Forma do editor → array plano (JSONB no Postgres); o calendário e o PostgREST esperam array. */
export function editorMateriaisShapeToDbRows(input) {
  if (Array.isArray(input)) {
    return input.filter((m) => m && typeof m === 'object').map((m) => ({ ...m }));
  }
  if (!input || typeof input !== 'object') return [];

  const carrosseis = Array.isArray(input.carrosseis) ? input.carrosseis : [];
  const posts = Array.isArray(input.posts) ? input.posts : [];
  const videos = Array.isArray(input.videos) ? input.videos : [];
  const stories = Array.isArray(input.stories_ideias) ? input.stories_ideias : [];
  const legados = Array.isArray(input._legados) ? input._legados : [];

  const rows = [];
  let i = 0;
  const nextId = (m) => (m?.id != null ? m.id : Date.now() + ++i);

  for (const m of carrosseis) {
    if (!m || typeof m !== 'object') continue;
    const { [PJ_STORY_MARKER]: _s, ...rest } = m;
    rows.push({
      ...rest,
      id: nextId(m),
      tipo: rest.tipo && rest.tipo !== 'video' && rest.tipo !== 'post' ? rest.tipo : 'arte',
    });
  }
  for (const m of posts) {
    if (!m || typeof m !== 'object') continue;
    const { [PJ_STORY_MARKER]: _s, ...rest } = m;
    rows.push({
      ...rest,
      id: nextId(m),
      tipo: 'post',
      formato: (rest.formato && String(rest.formato).trim()) || 'Post',
    });
  }
  for (const m of videos) {
    if (!m || typeof m !== 'object') continue;
    const { [PJ_STORY_MARKER]: _s, ...rest } = m;
    rows.push({ ...rest, id: nextId(m), tipo: 'video' });
  }
  for (const line of stories) {
    if (typeof line !== 'string' || !line.trim()) continue;
    rows.push({
      id: Date.now() + ++i,
      tipo: 'arte',
      formato: 'Story',
      descricao: line.trim(),
      detalhes: '',
      data_entrega: '',
      data_postagem: '',
      responsavel_id: null,
      plataforma: 'Instagram',
      [PJ_STORY_MARKER]: true,
    });
  }
  for (const m of legados) {
    if (!m || typeof m !== 'object') continue;
    if (m[PJ_STORY_MARKER]) continue;
    rows.push({ ...m });
  }
  return rows;
}

/** Valor vindo do JSONB → forma do editor (objeto com carrosseis / posts / vídeos / stories / legados). */
export function dbMateriaisToEditorShape(raw) {
  const empty = { carrosseis: [], posts: [], videos: [], stories_ideias: [], _legados: [] };
  if (raw == null) return empty;
  if (!Array.isArray(raw)) {
    if (typeof raw === 'object') {
      return {
        carrosseis: Array.isArray(raw.carrosseis) ? raw.carrosseis : [],
        posts: Array.isArray(raw.posts) ? raw.posts : [],
        videos: Array.isArray(raw.videos) ? raw.videos : [],
        stories_ideias: Array.isArray(raw.stories_ideias) ? raw.stories_ideias : [],
        _legados: Array.isArray(raw._legados) ? raw._legados : [],
      };
    }
    return empty;
  }

  const hasStoryMarker = raw.some((m) => m && m[PJ_STORY_MARKER] === true);
  const allHaveTipo =
    raw.length > 0 &&
    raw.every((m) => m && typeof m === 'object' && String((m.tipo || '').trim()).length > 0);

  if (!hasStoryMarker && raw.length > 0 && !allHaveTipo) {
    return { ...empty, _legados: [...raw] };
  }

  const carrosseis = [];
  const posts = [];
  const videos = [];
  const stories_ideias = [];
  for (const m of raw) {
    if (!m || typeof m !== 'object') continue;
    if (m[PJ_STORY_MARKER] === true) {
      const d = (m.descricao || '').trim();
      if (d) stories_ideias.push(d);
      continue;
    }
    const tipo = String(m.tipo || '').trim();
    if (tipo === 'video') videos.push(m);
    else if (tipo === 'post') posts.push(m);
    else carrosseis.push(m);
  }
  return { carrosseis, posts, videos, stories_ideias, _legados: [] };
}

/** Lista plana para o calendário / merge de cronograma (sempre array). */
export function planMateriaisAsRows(plan) {
  const m = plan?.materiais;
  if (Array.isArray(m)) return m;
  if (m && typeof m === 'object') return editorMateriaisShapeToDbRows(m);
  return [];
}

export function mergeCronogramaWithMaterials(plan) {
  const materiais = planMateriaisAsRows(plan);
  const fromMat = materiais
    .filter((m) => (m.data_postagem || '').trim())
    .map((m) => ({
      id: `material-${m.id}`,
      data: m.data_postagem,
      acao: m.descricao || 'Ação do material',
      source: 'material',
    }));
  const other = (plan.cronograma || []).filter((c) => c.source !== 'material');
  return [...other, ...fromMat].sort((a, b) => new Date(a.data) - new Date(b.data));
}
