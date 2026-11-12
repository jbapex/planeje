export const BUILTIN_ETIQUETAS = [
  { chave: 'vip', nome: 'VIP', color: 'bg-purple-500' },
  { chave: 'inativo', nome: 'Inativo', color: 'bg-gray-600' },
  { chave: 'novo', nome: 'Novo', color: 'bg-cyan-500' },
];

const CUSTOM_COLORS = ['bg-sky-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-indigo-500', 'bg-teal-500'];

export function etiquetaCor(chave) {
  const known = BUILTIN_ETIQUETAS.find((item) => item.chave === chave);
  if (known) return known.color;
  const text = String(chave || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash + text.charCodeAt(i)) % CUSTOM_COLORS.length;
  return CUSTOM_COLORS[hash];
}

export function normalizeEtiquetaNome(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

export function etiquetaChave(nome) {
  return normalizeEtiquetaNome(nome)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function prepareEtiqueta(nome, catalog = []) {
  const label = normalizeEtiquetaNome(nome);
  if (label.length < 2) return { ok: false, error: 'A etiqueta precisa de pelo menos 2 letras.' };
  const chave = etiquetaChave(label);
  if (!chave) return { ok: false, error: 'Use letras ou números no nome.' };
  const existing = catalog.find((item) => item.chave === chave || item.nome.toLowerCase() === label.toLowerCase());
  if (existing) return { ok: true, existing: true, etiqueta: existing };
  return { ok: true, existing: false, etiqueta: { chave, nome: label, color: etiquetaCor(chave) } };
}

export function mergeEtiquetaCatalog(rows = [], clients = []) {
  const map = new Map(BUILTIN_ETIQUETAS.map((item) => [item.chave, item]));
  for (const row of rows) {
    const chave = String(row?.chave || '').trim();
    const nome = normalizeEtiquetaNome(row?.nome);
    if (!chave || !nome) continue;
    map.set(chave, { chave, nome, color: etiquetaCor(chave) });
  }
  for (const client of clients) {
    for (const tag of client?.etiquetas || []) {
      const chave = String(tag || '').trim();
      if (chave && !map.has(chave)) map.set(chave, { chave, nome: chave, color: etiquetaCor(chave) });
    }
  }
  const rest = [...map.values()]
    .filter((item) => !BUILTIN_ETIQUETAS.some((builtin) => builtin.chave === item.chave))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return [...BUILTIN_ETIQUETAS.map((item) => map.get(item.chave)), ...rest];
}

export function etiquetaNome(chave, catalog = []) {
  return catalog.find((item) => item.chave === chave)?.nome || BUILTIN_ETIQUETAS.find((item) => item.chave === chave)?.nome || chave;
}

export async function fetchEtiquetaRows(supabase) {
  const { data, error } = await supabase.from('cliente_etiquetas').select('chave, nome').order('nome');
  return { rows: data || [], error };
}

export async function saveEtiqueta(supabase, nome, catalog = [], userId) {
  const prepared = prepareEtiqueta(nome, catalog);
  if (!prepared.ok || prepared.existing) return prepared;
  const { error } = await supabase.from('cliente_etiquetas').insert({
    chave: prepared.etiqueta.chave,
    nome: prepared.etiqueta.nome,
    created_by: userId || null,
  });
  if (error?.code === '23505') return { ...prepared, existing: true };
  if (error) return { ok: false, error: error.message };
  return prepared;
}
