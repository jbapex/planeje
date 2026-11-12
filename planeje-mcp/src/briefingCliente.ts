import { randomUUID } from 'crypto';

export const BRIEFING_CATEGORIAS = [
  'Empresa',
  'Público-alvo',
  'Comunicação',
  'Objetivos',
  'Outros',
] as const;

export const BRIEFING_TIPOS = [
  'texto',
  'multipla_escolha',
  'multipla_selecao',
  'arquivo',
  'link',
] as const;

export type BriefingCategoria = (typeof BRIEFING_CATEGORIAS)[number];
export type BriefingTipo = (typeof BRIEFING_TIPOS)[number];

export type BriefingPergunta = {
  id: string;
  texto: string;
  categoria: BriefingCategoria;
  tipo: BriefingTipo;
  obrigatorio: boolean;
  opcoes: string[];
};

const CAT_ALIASES: Record<string, BriefingCategoria> = {
  empresa: 'Empresa',
  'público-alvo': 'Público-alvo',
  'publico-alvo': 'Público-alvo',
  'publico alvo': 'Público-alvo',
  comunicacao: 'Comunicação',
  comunicação: 'Comunicação',
  objetivos: 'Objetivos',
  outros: 'Outros',
};

/** Questionário inicial da tela do cliente. Cada briefing pode trocar essas perguntas. */
export const BRIEFING_PERGUNTAS_PADRAO: BriefingPergunta[] = [
  { id: '1', texto: 'O que a empresa vende ou oferece?', categoria: 'Empresa', tipo: 'texto', obrigatorio: false, opcoes: [] },
  { id: '2', texto: 'Qual o principal diferencial em relação à concorrência?', categoria: 'Empresa', tipo: 'texto', obrigatorio: false, opcoes: [] },
  { id: '3', texto: 'Há quanto tempo está no mercado?', categoria: 'Empresa', tipo: 'texto', obrigatorio: false, opcoes: [] },
  { id: '4', texto: 'Descreva o cliente ideal (idade, perfil, comportamento)', categoria: 'Público-alvo', tipo: 'texto', obrigatorio: false, opcoes: [] },
  { id: '5', texto: 'Qual problema você resolve para esse cliente?', categoria: 'Público-alvo', tipo: 'texto', obrigatorio: false, opcoes: [] },
  { id: '6', texto: 'Onde esse público passa o tempo online?', categoria: 'Público-alvo', tipo: 'texto', obrigatorio: false, opcoes: [] },
  { id: '7', texto: 'Como a marca quer ser percebida?', categoria: 'Comunicação', tipo: 'texto', obrigatorio: false, opcoes: [] },
  { id: '8', texto: 'O que NÃO pode aparecer na comunicação?', categoria: 'Comunicação', tipo: 'texto', obrigatorio: false, opcoes: [] },
  { id: '9', texto: 'Tem alguma marca que admira? Por quê?', categoria: 'Comunicação', tipo: 'texto', obrigatorio: false, opcoes: [] },
  { id: '10', texto: 'Qual o principal objetivo com as redes sociais?', categoria: 'Objetivos', tipo: 'texto', obrigatorio: false, opcoes: [] },
  { id: '11', texto: 'Quem vai aparecer nos vídeos ou fotos?', categoria: 'Objetivos', tipo: 'texto', obrigatorio: false, opcoes: [] },
  { id: '12', texto: 'Como você mede sucesso nas redes?', categoria: 'Objetivos', tipo: 'texto', obrigatorio: false, opcoes: [] },
];

export function publicBriefingUrl(token: string): string {
  const base = (process.env.PLANEJE_APP_URL ?? 'https://planeje.jbapex.com.br').replace(/\/$/, '');
  return `${base}/#/b/${token}`;
}

function resolveCategoria(raw: unknown): BriefingCategoria {
  const s = String(raw ?? '').trim();
  if ((BRIEFING_CATEGORIAS as readonly string[]).includes(s)) return s as BriefingCategoria;
  return CAT_ALIASES[s.toLowerCase()] ?? 'Outros';
}

function resolveTipo(raw: unknown): BriefingTipo {
  const s = String(raw ?? 'texto').trim();
  return (BRIEFING_TIPOS as readonly string[]).includes(s) ? (s as BriefingTipo) : 'texto';
}

export function normalizePerguntasInput(raw: unknown): BriefingPergunta[] {
  if (!Array.isArray(raw) || raw.length === 0) return BRIEFING_PERGUNTAS_PADRAO.map((p) => ({ ...p, opcoes: [...p.opcoes] }));
  return raw.map((item, idx) => {
    const p = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const tipo = resolveTipo(p.tipo);
    const opcoesRaw = Array.isArray(p.opcoes) ? p.opcoes : [];
    const opcoes =
      tipo === 'multipla_escolha' || tipo === 'multipla_selecao'
        ? opcoesRaw.map((o) => String(o ?? '').trim()).filter(Boolean)
        : [];
    return {
      id: p.id != null && String(p.id).trim() !== '' ? String(p.id) : String(idx + 1),
      texto: String(p.texto ?? p.text ?? p.pergunta ?? '').trim(),
      categoria: resolveCategoria(p.categoria ?? p.category),
      tipo,
      obrigatorio: Boolean(p.obrigatorio),
      opcoes,
    };
  });
}

export function validatePerguntas(perguntas: BriefingPergunta[]): { ok: boolean; reason?: string } {
  if (!perguntas.length) return { ok: false, reason: 'Informe ao menos uma pergunta.' };
  for (const p of perguntas) {
    if (!p.texto) return { ok: false, reason: 'Preencha o texto de todas as perguntas.' };
    if (
      (p.tipo === 'multipla_escolha' || p.tipo === 'multipla_selecao')
      && p.opcoes.length < 2
    ) {
      return { ok: false, reason: `Pergunta "${p.texto}" precisa de pelo menos duas opções.` };
    }
  }
  return { ok: true };
}

export function emptyRespostas(perguntas: BriefingPergunta[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of perguntas) {
    out[p.id] = p.tipo === 'multipla_selecao' || p.tipo === 'arquivo' ? [] : '';
  }
  return out;
}

export function mergeRespostas(
  perguntas: BriefingPergunta[],
  incoming: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const next = emptyRespostas(perguntas);
  if (!incoming || typeof incoming !== 'object') return next;
  for (const p of perguntas) {
    if (Object.prototype.hasOwnProperty.call(incoming, p.id)) {
      next[p.id] = incoming[p.id];
    }
  }
  return next;
}

export function newBriefingToken(): string {
  return randomUUID();
}
