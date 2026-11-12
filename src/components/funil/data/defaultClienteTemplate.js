import template from './defaultClienteTemplate.json';

/** Template padrão por cliente (backup Dinamac — 28 nós, 39 conexões). */
export const CLIENTE_DEFAULT_FUNIL = {
  name: template.name || 'Funil padrão',
  nodes: template.nodes || [],
  edges: template.edges || [],
};
