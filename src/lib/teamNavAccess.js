const TEAM = ['superadmin', 'admin', 'colaborador'];
const ADMIN = ['superadmin', 'admin'];

/** Páginas da equipe. A lateral e o celular usam a mesma lista. */
export const TEAM_NAV_SPEC = [
  { id: 'caixa', to: '/caixa', label: 'Minha caixa', shortLabel: 'Caixa', roles: TEAM },
  { id: 'conversas', to: '/conversas/em-atendimento', label: 'Conversas', roles: TEAM, match: 'conversas', module: 'atendimento' },
  { id: 'dashboard', to: '/dashboard', label: 'Início', roles: TEAM, module: 'dashboard' },
  { id: 'clients', to: '/clients', label: 'Clientes', roles: TEAM, module: 'clients' },
  { id: 'financeiro', to: '/financeiro', label: 'Financeiro', roles: ADMIN, module: 'financeiro' },
  { id: 'projects', to: '/projects', label: 'Projetos', roles: TEAM, module: 'projects' },
  { id: 'tasks', to: '/tasks', label: 'Tarefas', roles: TEAM, module: 'tasks' },
  { id: 'cobertura', to: '/cobertura', label: 'Cobertura', roles: TEAM, module: 'tasks' },
  { id: 'assistant', to: '/assistant', label: 'Assistente', roles: TEAM, module: 'assistant' },
  { id: 'onboarding', to: '/onboarding', label: 'Onboarding', roles: TEAM, module: 'onboarding' },
  { id: 'automacoes', to: '/automacoes', label: 'Automações', roles: ADMIN, module: 'automacoes' },
  { id: 'requests', to: '/requests', label: 'Solicitações', roles: ADMIN, module: 'requests' },
  { id: 'social', to: '/social-media', label: 'Redes Sociais', shortLabel: 'Social', roles: TEAM, module: 'social_media' },
  { id: 'traffic', to: '/paid-traffic/dashboard', label: 'Tráfego Pago', shortLabel: 'Tráfego', roles: TEAM, match: 'traffic', module: 'paid_traffic' },
  { id: 'rastreamento', to: '/rastreamento', label: 'Rastreamento', roles: TEAM, module: 'rastreamento' },
  { id: 'mini_crm', to: '/mini-crm', label: 'Mini CRM', roles: TEAM, module: 'mini_crm' },
  { id: 'crm', to: '/crm', label: 'CRM', roles: TEAM, module: 'crm' },
  { id: 'reports', to: '/reports', label: 'Relatórios equipe', shortLabel: 'Relatórios', roles: TEAM, module: 'reports' },
  { id: 'client_area', to: '/client-area', label: 'Área do Cliente', shortLabel: 'Área', roles: TEAM, module: 'client_area' },
];

export const TEAM_NAV_SHORTCUT_IDS = ['dashboard', 'caixa', 'conversas'];
export const TEAM_NAV_MOBILE_SHORTCUT_IDS = [...TEAM_NAV_SHORTCUT_IDS, 'tasks'];

const TEAM_NAV_GROUPS = [
  { id: 'operations', label: 'Operação', itemIds: ['tasks', 'projects', 'cobertura', 'requests'] },
  { id: 'clients', label: 'Clientes e vendas', itemIds: ['clients', 'onboarding', 'crm', 'mini_crm', 'client_area'] },
  { id: 'marketing', label: 'Marketing', itemIds: ['traffic', 'social', 'rastreamento'] },
  { id: 'ai', label: 'IA e automações', itemIds: ['assistant', 'automacoes'] },
  { id: 'management', label: 'Gestão', itemIds: ['financeiro', 'reports'] },
];

/** Organiza somente os destinos que já passaram pelo filtro de acesso. */
export function groupTeamNav(items, shortcutIds = TEAM_NAV_SHORTCUT_IDS) {
  const byId = new Map(items.map(item => [item.id, item]));
  const shortcuts = shortcutIds.map(id => byId.get(id)).filter(Boolean);
  const groups = TEAM_NAV_GROUPS.map(({ itemIds, ...group }) => ({
    ...group,
    items: itemIds.filter(id => !shortcutIds.includes(id)).map(id => byId.get(id)).filter(Boolean),
  })).filter(group => group.items.length > 0);
  return { shortcuts, groups };
}

export function isTeamNavItemActive(item, pathname) {
  const base = item.match === 'conversas' ? '/conversas' : item.match === 'traffic' ? '/paid-traffic' : item.to;
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function filterTeamNav(items, role, moduleSettings) {
  return (items || []).filter((item) => {
    const roleMatch = Boolean(role) && item.roles.includes(role);
    const moduleEnabled = !item.module || item.module === 'dashboard' || moduleSettings?.[item.module] === true;
    return roleMatch && moduleEnabled;
  });
}

/** Troca o ?v= e conserva o hash, para o celular buscar o index.html novo. */
export function cacheBustHref(href, stamp = Date.now().toString(36)) {
  const url = new URL(href, 'https://planeje.jbapex.com.br');
  url.searchParams.set('v', String(stamp));
  return url.toString();
}

export function reloadCurrentPage() {
  window.location.assign(cacheBustHref(window.location.href));
}
