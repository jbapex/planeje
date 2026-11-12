import municipiosPorUf from '@/lib/data/municipios-ibge.json';

function fold(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function getCidadesByUf(uf) {
  const code = String(uf || '').trim().toUpperCase();
  return municipiosPorUf[code] || [];
}

export function matchCidade(uf, cidade) {
  const list = getCidadesByUf(uf);
  const wanted = fold(cidade);
  if (!wanted) return '';
  return list.find((name) => fold(name) === wanted) || '';
}
