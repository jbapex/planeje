const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const common = new Set(['cliente', 'clientes', 'conta', 'agencia', 'noiva', 'noivas', 'moda', 'festas', 'estudio', 'studio']);

export function atlasClientCandidates(message, clients = []) {
  const text = ` ${normalize(message)} `;
  const catalogue = clients.filter(client => client.id && client.empresa);
  const full = catalogue.filter(client => text.includes(` ${normalize(client.empresa)} `));
  if (full.length) return full;
  return catalogue.filter(client => normalize(client.empresa).split(' ').some(word => word.length >= 3 && !common.has(word) && text.includes(` ${word} `)));
}

export function atlasClientQuestion(message, clients, clientId) {
  const candidates = atlasClientCandidates(message, clients);
  if (candidates.length === 1 && candidates[0].id === clientId) return null;
  if (candidates.length || /\b(?:do|da|para o|para a|sobre o|sobre a) (?:cliente|conta) [a-z0-9]/.test(normalize(message))) return { message, candidates };
  return null;
}

export function filterAtlasClients(clients = [], query = '') {
  const text = normalize(query);
  return clients.filter(client => normalize(client.empresa).includes(text)).slice(0, 8);
}
