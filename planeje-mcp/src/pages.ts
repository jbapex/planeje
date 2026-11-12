/**
 * Catálogo estático de rotas do app Planeje — espelha Sidebar, App.jsx e Super Admin.
 * Usado por tools MCP e resources para qualquer cliente de IA navegar o sistema.
 */

export type PlanejePageArea =
  | 'equipe'
  | 'cliente'
  | 'super_admin'
  | 'publico'
  | 'auth';

export type PlanejePage = {
  id: string;
  path: string;
  label: string;
  description: string;
  area: PlanejePageArea;
  module?: string;
  roles?: string[];
  ferramentas_relacionadas?: string[];
};

const BASE_URL = () =>
  (process.env.PLANEJE_APP_URL ?? 'https://planeje.jbapex.com.br').replace(/\/$/, '');

export const PLANEJE_PAGES: PlanejePage[] = [
  // — Equipe (MainLayout)
  {
    id: 'caixa',
    path: '/caixa',
    label: 'Minha caixa',
    description:
      'Dot: tópicos e demandas (MCP criar_demanda_caixa). Operação: pedidos internos, clientes sem resposta e respondidos hoje. Só perfil active.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas_relacionadas: [
      'listar_caixa',
      'agir_pendencia_caixa',
      'criar_demanda_caixa',
      'listar_demandas_caixa',
      'adicionar_comentario',
    ],
  },
  {
    id: 'conversas',
    path: '/conversas/em-atendimento',
    label: 'Conversas',
    description: 'Inbox WhatsApp: filas aguardando, em atendimento e resolvidos.',
    area: 'equipe',
    module: 'atendimento',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas_relacionadas: [
      'listar_conversas',
      'ver_mensagens_conversa',
      'atualizar_conversa',
      'listar_filas_atendimento',
    ],
  },
  {
    id: 'conversas-aguardando',
    path: '/conversas/aguardando',
    label: 'Conversas — Aguardando',
    description: 'Fila de conversas aguardando primeira resposta ou retorno.',
    area: 'equipe',
    module: 'atendimento',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas_relacionadas: ['listar_conversas', 'atualizar_conversa'],
  },
  {
    id: 'conversas-resolvidos',
    path: '/conversas/resolvidos',
    label: 'Conversas — Resolvidos',
    description: 'Histórico de conversas encerradas.',
    area: 'equipe',
    module: 'atendimento',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas_relacionadas: ['listar_conversas'],
  },
  {
    id: 'conversas-canais',
    path: '/conversas/canais',
    label: 'Conversas — Canais',
    description: 'Status e configuração dos canais WhatsApp (uazapi).',
    area: 'equipe',
    module: 'atendimento',
    roles: ['superadmin', 'admin', 'colaborador'],
  },
  {
    id: 'conversas-envios',
    path: '/conversas/envios',
    label: 'Conversas — Envios',
    description: 'Log de materiais e envios em massa.',
    area: 'equipe',
    module: 'atendimento',
    roles: ['superadmin', 'admin', 'colaborador'],
  },
  {
    id: 'conversas-lembretes',
    path: '/conversas/lembretes',
    label: 'Conversas — Lembretes',
    description: 'Lembretes agendados por conversa.',
    area: 'equipe',
    module: 'atendimento',
    roles: ['superadmin', 'admin', 'colaborador'],
  },
  {
    id: 'conversas-config',
    path: '/conversas/config',
    label: 'Conversas — Configuração',
    description: 'Filas, permissões e SLA (somente superadmin).',
    area: 'equipe',
    module: 'atendimento',
    roles: ['superadmin'],
    ferramentas_relacionadas: ['listar_filas_atendimento'],
  },
  {
    id: 'dashboard',
    path: '/dashboard',
    label: 'Início',
    description: 'Dashboard principal da agência.',
    area: 'equipe',
    module: 'dashboard',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas_relacionadas: ['ler_aba'],
  },
  {
    id: 'clients',
    path: '/clients',
    label: 'Clientes',
    description: 'Lista, kanban e cadastro de clientes.',
    area: 'equipe',
    module: 'clients',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas_relacionadas: [
      'listar_clientes',
      'ver_cliente',
      'criar_cliente',
      'atualizar_cliente',
      'listar_briefings',
      'criar_briefing',
      'atualizar_briefing',
      'ler_aba',
    ],
  },
  {
    id: 'financeiro',
    path: '/financeiro',
    label: 'Financeiro',
    description: 'Mensalidades, folha, caixa e resultado da agência.',
    area: 'equipe',
    module: 'financeiro',
    roles: ['superadmin', 'admin'],
  },
  {
    id: 'projects',
    path: '/projects',
    label: 'Projetos',
    description: 'Projetos e campanhas por cliente.',
    area: 'equipe',
    module: 'projects',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas_relacionadas: ['listar_projetos', 'buscar_projeto', 'criar_projeto', 'atualizar_projeto', 'ler_aba'],
  },
  {
    id: 'tasks',
    path: '/tasks/list',
    label: 'Tarefas',
    description: 'Lista, kanban, calendário e timeline de tarefas.',
    area: 'equipe',
    module: 'tasks',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas_relacionadas: [
      'listar_tarefas',
      'listar_tarefas_atrasadas',
      'listar_status_tarefas',
      'criar_tarefa',
      'atualizar_tarefa',
      'buscar_tarefas_por_texto',
    ],
  },
  {
    id: 'assistant',
    path: '/assistant',
    label: 'Assistente (ApexIA)',
    description: 'Chat interno com IA por cliente ou geral.',
    area: 'equipe',
    module: 'assistant',
    roles: ['superadmin', 'admin', 'colaborador'],
  },
  {
    id: 'onboarding',
    path: '/onboarding',
    label: 'Onboarding',
    description: 'Checklist em colunas da entrada do cliente. O item vira tarefa quando alguém pede.',
    area: 'equipe',
    module: 'onboarding',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas_relacionadas: ['ler_aba', 'listar_checklist_onboarding', 'adicionar_item_checklist', 'ajustar_item_checklist', 'virar_tarefa_checklist', 'iniciar_onboarding', 'virar_tarefa_onboarding', 'ajustar_etapa_onboarding', 'concluir_etapa_onboarding'],
  },
  {
    id: 'cobertura',
    path: '/cobertura',
    label: 'Cobertura do mês',
    description: 'Contratado × planejado por cliente no mês.',
    area: 'equipe',
    module: 'cobertura',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas_relacionadas: ['ler_aba'],
  },
  {
    id: 'mini-crm',
    path: '/mini-crm',
    label: 'Mini CRM',
    description: 'Leads da loja (equipe escolhe o cliente).',
    area: 'equipe',
    module: 'mini_crm',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas_relacionadas: ['ler_aba', 'ver_cliente'],
  },
  {
    id: 'automacoes',
    path: '/automacoes',
    label: 'Automações',
    description: 'Regras de briefing, tarefas e notificações.',
    area: 'equipe',
    module: 'automacoes',
    roles: ['superadmin', 'admin'],
  },
  {
    id: 'requests',
    path: '/requests',
    label: 'Solicitações',
    description: 'Solicitações enviadas por clientes.',
    area: 'equipe',
    module: 'requests',
    roles: ['superadmin', 'admin'],
    ferramentas_relacionadas: [
      'listar_solicitacoes',
      'criar_solicitacao',
      'atualizar_solicitacao',
    ],
  },
  {
    id: 'social-media',
    path: '/social-media',
    label: 'Redes Sociais',
    description:
      'Visão Geral, Calendário por cliente, A publicar, Agendados, Concluídos, Perfil e feed Meta.',
    area: 'equipe',
    module: 'social_media',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas_relacionadas: [
      'listar_publicacoes_sociais',
      'listar_contas_sociais',
      'ler_aba',
    ],
  },
  {
    id: 'paid-traffic',
    path: '/paid-traffic/dashboard',
    label: 'Tráfego Pago',
    description:
      'Dashboard da carteira, Hoje, Rotina semanal, Relatório, Situação, Painel, Insights Meta e Google Ads.',
    area: 'equipe',
    module: 'paid_traffic',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas_relacionadas: [
      'ver_hoje_trafego',
      'ver_rotina_semanal',
      'ver_relatorio_trafego',
      'ver_campanhas_pagas',
      'listar_contas_google_ads',
      'listar_google_dados',
      'invocar_meta_ads_api',
      'ler_aba',
    ],
  },
  {
    id: 'rastreamento',
    path: '/rastreamento',
    label: 'Rastreamento',
    description:
      'Visão geral, Leads, Relatórios, Eventos CAPI/Google, Links rastreáveis, Integrações e Configurações.',
    area: 'equipe',
    module: 'rastreamento',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas_relacionadas: [
      'listar_leads_rastreamento',
      'listar_eventos_rastreamento',
      'listar_links_rastreaveis',
      'ver_integracoes_cliente',
      'listar_google_dados',
      'ler_aba',
    ],
  },
  {
    id: 'crm',
    path: '/crm/leads',
    label: 'CRM',
    description: 'Leads, funil e pipeline comercial.',
    area: 'equipe',
    module: 'crm',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas_relacionadas: ['buscar_leads', 'ver_oportunidades_crm'],
  },
  {
    id: 'reports',
    path: '/reports',
    label: 'Relatórios equipe',
    description: 'Indicadores do mês por colaborador.',
    area: 'equipe',
    module: 'reports',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas_relacionadas: ['ler_aba'],
  },
  {
    id: 'relatorios-cliente',
    path: '/relatorios-cliente',
    label: 'Relatórios por cliente',
    description: 'Resultados e métricas por cliente.',
    area: 'equipe',
    module: 'reports',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas_relacionadas: ['ver_resultados_cliente'],
  },
  {
    id: 'settings',
    path: '/settings',
    label: 'Configurações',
    description: 'Perfil, alertas, WhatsApp e token MCP pessoal.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas_relacionadas: ['quem_sou_eu', 'meus_modulos'],
  },
  {
    id: 'settings-google-drive',
    path: '/settings/google-drive',
    label: 'Google Drive da agência',
    description: 'Client ID/Secret do Drive (superadmin).',
    area: 'equipe',
    roles: ['superadmin'],
    ferramentas_relacionadas: ['ler_aba'],
  },
  {
    id: 'settings-google-ads',
    path: '/settings/google-ads',
    label: 'Google Ads da agência',
    description: 'OAuth e MCC da agência (superadmin).',
    area: 'equipe',
    roles: ['superadmin'],
    ferramentas_relacionadas: ['ler_aba'],
  },
  {
    id: 'settings-google-dados',
    path: '/settings/google-dados',
    label: 'Google dados da agência',
    description: 'OAuth Analytics, Meu Negócio e Tag Manager (superadmin).',
    area: 'equipe',
    roles: ['superadmin'],
    ferramentas_relacionadas: ['ler_aba'],
  },
  {
    id: 'paid-traffic-hoje',
    path: '/paid-traffic/hoje',
    label: 'Tráfego — Hoje',
    description: 'Fila do gestor: análise da semana e otimização.',
    area: 'equipe',
    module: 'paid_traffic',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas_relacionadas: ['ver_hoje_trafego', 'ler_aba'],
  },
  {
    id: 'gestor-ia-rotina',
    path: '/gestor-ia/rotina',
    label: 'Gestor IA — Rotina semanal',
    description: 'Planilha por cliente e semana. Compartilha a Rotina de Tráfego; recebe rascunhos IA pelo MCP e exige validação humana. Leads seguem primeira entrada na semana, com agendamento CRM e evidência da conversa separados.',
    area: 'equipe',
    module: 'paid_traffic',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas_relacionadas: ['ver_rotina_semanal', 'ver_revisao_semanal', 'listar_leads_rastreamento', 'ver_mensagens_rastreamento',
      'gestor_ia_listar_painel', 'gestor_ia_ler_semana', 'gestor_ia_salvar_semana', 'gestor_ia_sugerir_acao', 'gestor_ia_ver_leads'],
  },
  {
    id: 'paid-traffic-rotina',
    path: '/paid-traffic/rotina',
    label: 'Tráfego — Rotina semanal',
    description: 'Grade por cliente/semana com KPI e colunas extras.',
    area: 'equipe',
    module: 'paid_traffic',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas_relacionadas: ['ver_rotina_semanal', 'ver_revisao_semanal', 'ler_aba', 'gestor_ia_listar_painel',
      'gestor_ia_ler_semana', 'gestor_ia_salvar_semana', 'gestor_ia_sugerir_acao', 'gestor_ia_ver_leads'],
  },
  {
    id: 'paid-traffic-google',
    path: '/paid-traffic/google-insights',
    label: 'Tráfego — Google Ads',
    description: 'Campanhas Google só de contas vinculadas.',
    area: 'equipe',
    module: 'paid_traffic',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas_relacionadas: ['listar_contas_google_ads', 'listar_google_dados', 'ler_aba'],
  },
  {
    id: 'paid-traffic-relatorio',
    path: '/paid-traffic/relatorio',
    label: 'Tráfego — Relatório',
    description:
      'Slides do mês com Rotina, vendas e criativos. Agendamentos aparece como mensagem iniciada.',
    area: 'equipe',
    module: 'paid_traffic',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas_relacionadas: ['ver_relatorio_trafego', 'ler_aba'],
  },
  {
    id: 'client-area',
    path: '/client-area/support',
    label: 'Área do Cliente (preview)',
    description: 'Visualização interna da área do cliente.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
  },
  // — Super Admin
  {
    id: 'super-admin',
    path: '/super-admin',
    label: 'Super Admin',
    description: 'Hub de configurações avançadas da plataforma.',
    area: 'super_admin',
    roles: ['superadmin'],
  },
  {
    id: 'super-admin-modules',
    path: '/super-admin/modules',
    label: 'Gerenciar módulos',
    description: 'Ativar módulos e permissões por usuário.',
    area: 'super_admin',
    roles: ['superadmin'],
    ferramentas_relacionadas: ['listar_modulos'],
  },
  {
    id: 'super-admin-ia',
    path: '/super-admin/ia',
    label: 'IA & ApexIA',
    description: 'Agentes, personalidade, limites e modelos de IA.',
    area: 'super_admin',
    roles: ['superadmin'],
  },
  {
    id: 'super-admin-diagnostico',
    path: '/super-admin/diagnostico',
    label: 'Diagnóstico',
    description: 'Leads, templates e página de diagnóstico.',
    area: 'super_admin',
    roles: ['superadmin'],
  },
  // — Área do cliente
  {
    id: 'cliente-support',
    path: '/cliente/support',
    label: 'Cliente — Suporte',
    description: 'Dashboard do cliente logado.',
    area: 'cliente',
    roles: ['cliente'],
  },
  {
    id: 'cliente-crm',
    path: '/cliente/crm/leads',
    label: 'Cliente — CRM',
    description: 'CRM na visão do cliente.',
    area: 'cliente',
    module: 'crm',
    roles: ['cliente'],
  },
  {
    id: 'apexia',
    path: '/apexia',
    label: 'Cliente — ApexIA',
    description: 'Chat ApexIA para usuário cliente.',
    area: 'cliente',
    roles: ['cliente'],
  },
  // — Público
  {
    id: 'diagnostico-publico',
    path: '/diagnostico',
    label: 'Diagnóstico (público)',
    description: 'Landing page de diagnóstico de marketing.',
    area: 'publico',
  },
  {
    id: 'briefing-publico',
    path: '/b/:token',
    label: 'Briefing (público)',
    description: 'Formulário de briefing por token.',
    area: 'publico',
    ferramentas_relacionadas: ['listar_briefings', 'criar_briefing', 'atualizar_briefing'],
  },
];

export function pageUrl(path: string): string {
  return `${BASE_URL()}${path.startsWith('/') ? path : `/${path}`}`;
}

export function filterPages(opts: {
  busca?: string;
  modulo?: string;
  area?: PlanejePageArea;
  papel?: string;
}): PlanejePage[] {
  let list = [...PLANEJE_PAGES];
  const { busca, modulo, area, papel } = opts;

  if (modulo) {
    const m = modulo.trim().toLowerCase();
    list = list.filter((p) => p.module?.toLowerCase() === m);
  }
  if (area) {
    list = list.filter((p) => p.area === area);
  }
  if (papel) {
    const r = papel.trim().toLowerCase();
    list = list.filter((p) => !p.roles || p.roles.some((role) => role.toLowerCase() === r));
  }
  if (busca) {
    const t = busca.trim().toLowerCase();
    list = list.filter(
      (p) =>
        p.label.toLowerCase().includes(t) ||
        p.description.toLowerCase().includes(t) ||
        p.path.toLowerCase().includes(t) ||
        p.id.toLowerCase().includes(t)
    );
  }

  return list.map((p) => ({
    ...p,
    url: pageUrl(p.path),
  })) as (PlanejePage & { url: string })[];
}

export function getPageById(id: string): (PlanejePage & { url: string }) | null {
  const page = PLANEJE_PAGES.find((p) => p.id === id);
  if (!page) return null;
  return { ...page, url: pageUrl(page.path) };
}
