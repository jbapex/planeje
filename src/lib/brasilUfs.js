export const BRASIL_UFS = [
  { uf: 'AC', nome: 'Acre', regio: 'Norte', x: 52, y: 168 },
  { uf: 'AP', nome: 'Amapá', regio: 'Norte', x: 228, y: 48 },
  { uf: 'AM', nome: 'Amazonas', regio: 'Norte', x: 108, y: 108 },
  { uf: 'PA', nome: 'Pará', regio: 'Norte', x: 198, y: 108 },
  { uf: 'RO', nome: 'Rondônia', regio: 'Norte', x: 108, y: 168 },
  { uf: 'RR', nome: 'Roraima', regio: 'Norte', x: 128, y: 42 },
  { uf: 'TO', nome: 'Tocantins', regio: 'Norte', x: 228, y: 178 },
  { uf: 'AL', nome: 'Alagoas', regio: 'Nordeste', x: 318, y: 198 },
  { uf: 'BA', nome: 'Bahia', regio: 'Nordeste', x: 268, y: 218 },
  { uf: 'CE', nome: 'Ceará', regio: 'Nordeste', x: 308, y: 128 },
  { uf: 'MA', nome: 'Maranhão', regio: 'Nordeste', x: 258, y: 128 },
  { uf: 'PB', nome: 'Paraíba', regio: 'Nordeste', x: 338, y: 158 },
  { uf: 'PE', nome: 'Pernambuco', regio: 'Nordeste', x: 308, y: 168 },
  { uf: 'PI', nome: 'Piauí', regio: 'Nordeste', x: 268, y: 158 },
  { uf: 'RN', nome: 'Rio Grande do Norte', regio: 'Nordeste', x: 338, y: 128 },
  { uf: 'SE', nome: 'Sergipe', regio: 'Nordeste', x: 308, y: 218 },
  { uf: 'DF', nome: 'Distrito Federal', regio: 'Centro-Oeste', x: 228, y: 238 },
  { uf: 'GO', nome: 'Goiás', regio: 'Centro-Oeste', x: 198, y: 238 },
  { uf: 'MT', nome: 'Mato Grosso', regio: 'Centro-Oeste', x: 158, y: 198 },
  { uf: 'MS', nome: 'Mato Grosso do Sul', regio: 'Centro-Oeste', x: 158, y: 268 },
  { uf: 'ES', nome: 'Espírito Santo', regio: 'Sudeste', x: 288, y: 268 },
  { uf: 'MG', nome: 'Minas Gerais', regio: 'Sudeste', x: 238, y: 268 },
  { uf: 'RJ', nome: 'Rio de Janeiro', regio: 'Sudeste', x: 268, y: 308 },
  { uf: 'SP', nome: 'São Paulo', regio: 'Sudeste', x: 198, y: 308 },
  { uf: 'PR', nome: 'Paraná', regio: 'Sul', x: 178, y: 348 },
  { uf: 'RS', nome: 'Rio Grande do Sul', regio: 'Sul', x: 168, y: 408 },
  { uf: 'SC', nome: 'Santa Catarina', regio: 'Sul', x: 198, y: 378 },
];

export const BRASIL_UF_BY_CODE = Object.fromEntries(BRASIL_UFS.map((item) => [item.uf, item]));

function fold(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function normalizeUf(value) {
  const raw = fold(value);
  if (!raw) return '';
  if (BRASIL_UF_BY_CODE[raw]) return raw;
  const byName = BRASIL_UFS.find((item) => fold(item.nome) === raw);
  return byName?.uf || '';
}

export function formatClientLocalidade(client) {
  const cidade = String(client?.cidade || '').trim();
  const uf = normalizeUf(client?.estado);
  if (cidade && uf) return `${cidade} · ${uf}`;
  if (cidade) return cidade;
  if (uf) return BRASIL_UF_BY_CODE[uf]?.nome || uf;
  return '';
}
