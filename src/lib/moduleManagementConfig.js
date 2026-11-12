import {
  Activity,
  BarChart2,
  Bot,
  FolderKanban,
  Globe,
  Headphones,
  LayoutGrid,
  ListChecks,
  ListTodo,
  MessageSquare,
  MessageSquare as MessageSquareWarning,
  Radio,
  Rocket,
  Store,
  Table2,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import { ATENDIMENTO_LOJA_CLIENTE_IDS } from './atendimentoLojaAcesso.js';

/**
 * Módulos controláveis em Super Admin → Gerenciar módulos.
 * `name` deve bater com `module` na Sidebar / `requiredModule` nas rotas.
 */
export const MODULES_CONFIG = [
  { name: 'clients', label: 'Clientes', icon: Users, description: 'Gerencie clientes e prospects.' },
  {
    name: 'financeiro',
    label: 'Financeiro',
    icon: Wallet,
    description: 'Mensalidades, folha, caixa e resultado da agência.',
    hideForRoles: ['colaborador'],
  },
  {
    name: 'projects',
    label: 'Projetos / campanhas',
    icon: FolderKanban,
    description: 'Organize e acompanhe projetos e campanhas.',
  },
  { name: 'tasks', label: 'Tarefas', icon: ListTodo, description: 'Crie, delegue e acompanhe tarefas.' },
  {
    name: 'atendimento',
    label: 'Conversas (WhatsApp)',
    icon: MessageSquare,
    description: 'Inbox, filas e atendimento multicanal.',
  },
  {
    name: 'mini_crm',
    label: 'Mini CRM',
    icon: Table2,
    description: 'Leads da loja, funil e follow-up.',
  },
  { name: 'crm', label: 'CRM', icon: LayoutGrid, description: 'Leads, funil e pipeline comercial.' },
  {
    name: 'rastreamento',
    label: 'Rastreamento',
    icon: Radio,
    description: 'Contatos, origem e atribuição de resultados.',
  },
  {
    name: 'requests',
    label: 'Solicitações',
    icon: MessageSquareWarning,
    description: 'Solicitações enviadas por clientes.',
    hideForRoles: ['colaborador'],
  },
  {
    name: 'social_media',
    label: 'Redes sociais',
    icon: Globe,
    description: 'Planejamento e publicação em redes sociais.',
  },
  {
    name: 'paid_traffic',
    label: 'Tráfego pago',
    icon: Rocket,
    description: 'Campanhas Meta, Google e kanban de mídia.',
  },
  {
    name: 'reports',
    label: 'Relatórios',
    icon: BarChart2,
    description: 'Desempenho da equipe e relatórios por cliente.',
    supportsAccessLevel: true,
    defaultAccessLevel: 'all',
  },
  {
    name: 'onboarding',
    label: 'Onboarding',
    icon: ListChecks,
    description: 'Checklists e implantação de novos clientes.',
  },
  {
    name: 'automacoes',
    label: 'Automações',
    icon: Zap,
    description: 'Regras de briefing, tarefas e notificações.',
    hideForRoles: ['colaborador'],
  },
  {
    name: 'assistant',
    label: 'Assistente (ApexIA)',
    icon: Bot,
    description: 'Chat interno com IA por cliente ou geral.',
  },
  {
    name: 'client_area',
    label: 'Área do Cliente',
    icon: Store,
    description: 'Entrada da equipe na área da loja (dashboard, suporte, PGM da loja).',
  },
  {
    name: 'pgm',
    label: 'PGM',
    icon: Activity,
    description: 'Painel PGM da equipe. Na loja o PGM segue as páginas liberadas do cliente.',
  },
];

export const MODULE_NAMES = MODULES_CONFIG.map((m) => m.name);

/** Inbox da loja (Umbler). Separado de Conversas (`atendimento`) da agência.
 * O interruptor de Gerenciar módulos saiu: o Super Admin libera a página
 * em Usuários de cliente → Permissões. Esta chave segue só para IA/RPC (Ápice). */
export const ATENDIMENTO_LOJA_MODULE = 'atendimento_loja';

export const CLIENT_STORE_MODULES = [
  {
    name: ATENDIMENTO_LOJA_MODULE,
    label: 'Atendimento',
    icon: Headphones,
    description:
      'Inbox da loja. A liberação do login fica em Páginas Permitidas. Esta chave só respalda a IA da Ápice (não liga Responder sozinho).',
  },
];

export function getModuleConfig(name) {
  return MODULES_CONFIG.find((m) => m.name === name) || CLIENT_STORE_MODULES.find((m) => m.name === name);
}

export function defaultClientStoreModuleEnabled(moduleName, clienteId) {
  const id = String(clienteId || '').trim().toLowerCase();
  if (!id) return false;
  if (moduleName === ATENDIMENTO_LOJA_MODULE) return ATENDIMENTO_LOJA_CLIENTE_IDS.includes(id);
  return false;
}

/** Sem linha no banco: Ápice ligada, as outras desligadas. Linha gravada vence o padrão. */
export function effectiveClientStoreModuleEnabled(moduleName, clienteId, rowEnabled) {
  if (rowEnabled === true || rowEnabled === false) return rowEnabled;
  return defaultClientStoreModuleEnabled(moduleName, clienteId);
}

export function modulesForUserRole(role) {
  return MODULES_CONFIG.filter((m) => !(m.hideForRoles || []).includes(role));
}

export function buildGlobalSettingsMap(rows) {
  const map = {};
  for (const row of rows || []) {
    map[row.module_name] = row.is_enabled;
  }
  // Módulos sem linha no banco permanecem habilitados (compatível com instalações antigas).
  for (const mod of MODULES_CONFIG) {
    if (map[mod.name] === undefined) map[mod.name] = true;
  }
  return map;
}

export function effectiveModuleEnabled(globalSettings, userPermissions, moduleName) {
  if (userPermissions[moduleName] !== undefined) return userPermissions[moduleName];
  if (globalSettings[moduleName] !== undefined) return globalSettings[moduleName];
  return true;
}
