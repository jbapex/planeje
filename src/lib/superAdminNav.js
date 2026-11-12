import {
  LayoutDashboard,
  Layers,
  Share2,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UserCog,
} from 'lucide-react';

/** Seções e rotas do painel Super Admin (paths relativos a /super-admin). */
export const SUPER_ADMIN_SECTIONS = [
  {
    id: 'access',
    label: 'Equipe & acesso',
    description: 'Permissões da equipe interna e logins de clientes.',
    hubAccent: 'violet',
    items: [
      {
        path: 'modules',
        label: 'Gerenciar módulos',
        description: 'Ative módulos e níveis de acesso por usuário interno.',
        icon: Layers,
      },
      {
        path: 'client-permissions',
        label: 'Permissões de campos',
        description: 'Campos visíveis no cadastro de clientes.',
        icon: ShieldCheck,
      },
      {
        path: 'client-users',
        label: 'Usuários de cliente',
        description: 'Logins, páginas permitidas e Meta WhatsApp por cliente.',
        icon: UserCog,
      },
    ],
  },
  {
    id: 'ai',
    label: 'IA & ApexIA',
    description: 'Agentes, personalidade, limites e modelos de inteligência artificial.',
    hubAccent: 'amber',
    items: [
      {
        path: 'ia',
        label: 'IA & ApexIA',
        description: 'Central de configuração: agentes, personalidade, limites, modelos e clientes.',
        icon: Sparkles,
        isHub: true,
      },
    ],
  },
  {
    id: 'diagnostic',
    label: 'Diagnóstico',
    description: 'Funil de diagnóstico, templates e captura de leads.',
    hubAccent: 'rose',
    items: [
      {
        path: 'diagnostico',
        label: 'Diagnóstico',
        description: 'Leads, templates e configurações da página de diagnóstico.',
        icon: Stethoscope,
        isHub: true,
      },
    ],
  },
  {
    id: 'system',
    label: 'Sistema',
    description: 'Dashboard do cliente, plataformas e conteúdo.',
    hubAccent: 'sky',
    items: [
      {
        path: 'dashboard-settings',
        label: 'Config. dashboard',
        description: 'Widgets e métricas na área do cliente.',
        icon: LayoutDashboard,
      },
      {
        path: 'content-platforms',
        label: 'Plataformas de conteúdo',
        description: 'Redes e canais usados em planejamento.',
        icon: Share2,
      },
    ],
  },
];

export const SUPER_ADMIN_ALL_ITEMS = SUPER_ADMIN_SECTIONS.flatMap((section) =>
  section.items.map((item) => ({ ...item, sectionId: section.id, sectionLabel: section.label }))
);

export function getSuperAdminItemByPath(pathSegment) {
  const clean = String(pathSegment || '').replace(/^\//, '').split('/')[0];
  const direct = SUPER_ADMIN_ALL_ITEMS.find((item) => item.path === clean);
  if (direct) return direct;
  if (clean === 'ia') {
    return SUPER_ADMIN_ALL_ITEMS.find((item) => item.path === 'ia');
  }
  if (clean === 'diagnostico') {
    return SUPER_ADMIN_ALL_ITEMS.find((item) => item.path === 'diagnostico');
  }
  return null;
}

export function filterSuperAdminNav(query) {
  const term = String(query || '').trim().toLowerCase();
  if (!term) return SUPER_ADMIN_SECTIONS;

  return SUPER_ADMIN_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) =>
        item.label.toLowerCase().includes(term) ||
        item.description.toLowerCase().includes(term) ||
        section.label.toLowerCase().includes(term)
    ),
  })).filter((section) => section.items.length > 0);
}

const STORAGE_KEY = 'planeje_super_admin_last_path';

export function rememberSuperAdminPath(pathSegment) {
  if (!pathSegment || pathSegment === '') return;
  try {
    localStorage.setItem(STORAGE_KEY, pathSegment);
  } catch {
    // ignore
  }
}

export function getRememberedSuperAdminPath() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
