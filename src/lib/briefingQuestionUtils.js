export const CATEGORIAS = ['Empresa', 'Público-alvo', 'Comunicação', 'Objetivos', 'Outros'];

export const BRIEF_TIPOS = ['texto', 'multipla_escolha', 'multipla_selecao', 'arquivo', 'link'];

const CAT_ALIASES = {
  empresa: 'Empresa',
  'público-alvo': 'Público-alvo',
  'publico-alvo': 'Público-alvo',
  'publico alvo': 'Público-alvo',
  comunicacao: 'Comunicação',
  comunicação: 'Comunicação',
  objetivos: 'Objetivos',
  outros: 'Outros',
};

export function resolveTipoPergunta(p) {
  const t = p?.tipo;
  if (t && BRIEF_TIPOS.includes(t)) return t;
  return 'texto';
}

export function normalizePerguntaItem(p, idx) {
  if (!p || typeof p !== 'object') return null;
  const id = p.id != null && p.id !== '' ? String(p.id) : `q-${idx}`;
  const texto = String(p.texto ?? p.text ?? p.pergunta ?? '').trim();
  let rawCat = (p.categoria ?? p.category ?? '').toString().trim();
  let cat = CAT_ALIASES[rawCat.toLowerCase()] || rawCat;
  if (!CATEGORIAS.includes(cat)) cat = 'Outros';
  const tipo = resolveTipoPergunta(p);
  const obrigatorio = Boolean(p.obrigatorio);
  let opcoes = [];
  if (Array.isArray(p.opcoes)) {
    opcoes = p.opcoes.map((o) => String(o ?? '').trim()).filter(Boolean);
  }
  return { id, texto, categoria: cat, tipo, obrigatorio, opcoes };
}

/** jsonb: array, string JSON ou formato legado (sem tipo). */
export function normalizePerguntasFromDb(raw) {
  if (raw == null) return [];
  let data = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(data)) return [];
  return data.map((p, idx) => normalizePerguntaItem(p, idx)).filter(Boolean);
}

export function groupPerguntasOrdered(perguntas) {
  const buckets = new Map(CATEGORIAS.map((c) => [c, []]));
  for (const p of perguntas || []) {
    const cat = CATEGORIAS.includes(p.categoria) ? p.categoria : 'Outros';
    buckets.get(cat).push(p);
  }
  return CATEGORIAS.filter((c) => buckets.get(c).length > 0).map((c) => [c, buckets.get(c)]);
}

export function emptyRespostaForTipo(tipo) {
  const t = tipo || 'texto';
  if (t === 'multipla_selecao') return [];
  if (t === 'arquivo') return [];
  return '';
}

/** Lista de metadados de arquivo; aceita legado (um único objeto com url). */
export function normalizeArquivosResposta(val) {
  if (val == null) return [];
  if (Array.isArray(val)) {
    return val.filter((x) => x && typeof x === 'object' && String(x.url || '').trim() !== '');
  }
  if (typeof val === 'object' && String(val.url || '').trim() !== '') {
    return [val];
  }
  return [];
}

export function isRespostaVazia(tipo, val) {
  const t = tipo || 'texto';
  if (t === 'multipla_selecao') {
    return !Array.isArray(val) || val.length === 0;
  }
  if (t === 'multipla_escolha' || t === 'link' || t === 'texto') {
    return val == null || String(val).trim() === '';
  }
  if (t === 'arquivo') {
    return normalizeArquivosResposta(val).length === 0;
  }
  return true;
}

export function pruneRespostas(respostas, perguntas) {
  const ids = new Set(perguntas.map((p) => String(p.id)));
  const next = {};
  for (const [k, v] of Object.entries(respostas || {})) {
    if (ids.has(String(k))) next[k] = v;
  }
  for (const p of perguntas) {
    const id = String(p.id);
    if (!(id in next)) next[id] = emptyRespostaForTipo(p.tipo);
  }
  return next;
}

export function idsPerguntasObrigatoriasSemResposta(perguntas, respostas) {
  const missing = [];
  for (const p of perguntas || []) {
    if (!p.obrigatorio) continue;
    const id = String(p.id);
    const tipo = resolveTipoPergunta(p);
    if (isRespostaVazia(tipo, respostas[id])) missing.push(id);
  }
  return missing;
}

export function validateDefinicaoPerguntas(draftPerguntas) {
  for (const p of draftPerguntas) {
    if (!(p.texto || '').trim()) return { ok: false, reason: 'texto' };
    const tipo = resolveTipoPergunta(p);
    if ((tipo === 'multipla_escolha' || tipo === 'multipla_selecao') && (!p.opcoes || p.opcoes.filter(Boolean).length < 2)) {
      return { ok: false, reason: 'opcoes' };
    }
  }
  return { ok: true };
}

/** Normaliza rótulo de categoria (CSV, importações). */
export function normalizeCategoriaLabel(raw) {
  let rawCat = String(raw ?? '').trim();
  let cat = CAT_ALIASES[rawCat.toLowerCase()] || rawCat;
  if (!CATEGORIAS.includes(cat)) cat = 'Outros';
  return cat;
}

/** Uma linha CSV com separador vírgula e campos entre aspas. */
export function parseCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      fields.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

function splitOpcoesCsvField(val) {
  const s = String(val ?? '').trim();
  if (!s) return [];
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

function resolveTipoFromCsvCell(raw) {
  const t = String(raw ?? '').trim().toLowerCase();
  if (BRIEF_TIPOS.includes(t)) return t;
  return 'texto';
}

function newPerguntaId() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Importa perguntas a partir do texto de um CSV (cabeçalho na primeira linha).
 * @returns {{ ok: true, perguntas: object[] } | { ok: false, line: number, message: string }}
 */
export function importPerguntasFromBriefingCsvText(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const perguntas = [];

  for (let i = 1; i < lines.length; i++) {
    const lineNum = i + 1;
    const rawLine = lines[i];
    if (!rawLine.trim()) continue;

    const fields = parseCsvLine(rawLine);
    if (fields.length !== 5) {
      return {
        ok: false,
        line: lineNum,
        message: `Esperadas 5 colunas (categoria,texto,tipo,obrigatorio,opcoes); encontradas ${fields.length}.`,
      };
    }

    const [categoriaRaw, textoRaw, tipoRaw, obrigatorioRaw, opcoesRaw] = fields;

    const texto = String(textoRaw ?? '').trim();
    if (!texto) {
      return { ok: false, line: lineNum, message: 'Texto da pergunta vazio.' };
    }

    const tipo = resolveTipoFromCsvCell(tipoRaw);
    const obrigatorio = String(obrigatorioRaw ?? '').trim().toLowerCase() === 'sim';
    const opcoes = splitOpcoesCsvField(opcoesRaw);

    if ((tipo === 'multipla_escolha' || tipo === 'multipla_selecao') && opcoes.length < 2) {
      return {
        ok: false,
        line: lineNum,
        message: 'Perguntas de múltipla escolha/seleção precisam de pelo menos duas opções na coluna opcoes.',
      };
    }

    perguntas.push({
      id: newPerguntaId(),
      texto,
      categoria: normalizeCategoriaLabel(categoriaRaw),
      tipo,
      obrigatorio,
      opcoes: tipo === 'multipla_escolha' || tipo === 'multipla_selecao' ? opcoes : [],
    });
  }

  return { ok: true, perguntas };
}
