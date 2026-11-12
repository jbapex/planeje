/**
 * Catálogo de módulos e abas do Planeje — o que a equipe vê no app.
 * Usado por listar_abas / ler_aba / meus_modulos.
 */

import { pageUrl } from './pages.js';

export type HubArea = 'equipe' | 'cliente' | 'super_admin' | 'publico';

export type HubTab = {
  modulo: string;
  aba: string;
  label: string;
  path: string;
  description: string;
  area: HubArea;
  roles: string[];
  /** Precisa de cliente_id para devolver dados úteis. */
  precisa_cliente?: boolean;
  ferramentas?: string[];
};

export const HUB_TABS: HubTab[] = [
  // — Tráfego pago
  {
    modulo: 'paid_traffic',
    aba: 'hoje',
    label: 'Hoje',
    path: '/paid-traffic/hoje',
    description:
      'Fila do gestor: análise da semana e otimização até concluir. Tela travada para as colunas caberem.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas: ['ver_hoje_trafego', 'ler_aba'],
  },
  {
    modulo: 'paid_traffic',
    aba: 'rotina-gestor',
    label: 'Gestor IA — Rotina semanal',
    path: '/gestor-ia/rotina',
    description: 'Planilha simplificada do Gestor IA. Mesmos registros semanais da rotina; leads por primeira entrada na semana, sem preenchimento automático.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas: ['ver_rotina_semanal', 'ver_revisao_semanal', 'ler_aba'],
  },
  {
    modulo: 'paid_traffic',
    aba: 'rotina',
    label: 'Rotina semanal',
    path: '/paid-traffic/rotina',
    description:
      'Grade por cliente/semana: análise e otimização, KPI (orçamentos, lead qualificado), ordem das colunas, data do preenchimento, rascunho grava sozinho.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas: ['ver_rotina_semanal', 'ver_revisao_semanal', 'ler_aba'],
  },
  {
    modulo: 'paid_traffic',
    aba: 'dashboard',
    label: 'Dashboard',
    path: '/paid-traffic/dashboard',
    description:
      'Painel da carteira (gasto Meta conservado). Conta Google ligada mostra barra de gasto/limite do mês.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas: ['ler_aba', 'ver_campanhas_pagas'],
  },
  {
    modulo: 'paid_traffic',
    aba: 'situacao',
    label: 'Situação',
    path: '/paid-traffic/situacao',
    description: 'Situação operacional da carteira (ativa, pausada, encerrada).',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas: ['ler_aba'],
  },
  {
    modulo: 'paid_traffic',
    aba: 'fila',
    label: 'Painel',
    path: '/paid-traffic/fila',
    description:
      'Painel do cliente: campanha, conjunto e anúncio da Meta no período, com gasto e status, mais as demandas abertas. Precisa de cliente_id.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas: ['ler_aba', 'listar_tarefas'],
  },
  {
    modulo: 'paid_traffic',
    aba: 'campaigns',
    label: 'Solicitações',
    path: '/paid-traffic/campaigns/kanban',
    description: 'Campanhas manuais / solicitações internas de mídia paga.',
    area: 'equipe',
    roles: ['superadmin', 'admin'],
    ferramentas: ['ver_campanhas_pagas', 'ler_aba'],
  },
  {
    modulo: 'paid_traffic',
    aba: 'meta-insights',
    label: 'Insights',
    path: '/paid-traffic/meta-insights',
    description: 'Campanhas e métricas Meta das contas vinculadas.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas: ['listar_contas_meta_cliente', 'invocar_meta_ads_api', 'ler_aba'],
  },
  {
    modulo: 'paid_traffic',
    aba: 'google-insights',
    label: 'Google Ads',
    path: '/paid-traffic/google-insights',
    description:
      'Google Ads, Analytics, Meu Negócio e Tag Manager do cliente. Se o número não estiver salvo, o MCP busca na hora.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas: ['listar_contas_google_ads', 'listar_google_dados', 'ler_aba'],
  },
  {
    modulo: 'paid_traffic',
    aba: 'relatorio',
    label: 'Relatório',
    path: '/paid-traffic/relatorio',
    description:
      'Slides do mês: Rotina, vendas e números da Meta. Se o resumo salvo estiver velho, o MCP busca de novo.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    precisa_cliente: true,
    ferramentas: ['ver_relatorio_trafego', 'ver_rotina_semanal', 'ler_aba'],
  },

  // — Redes sociais
  {
    modulo: 'social_media',
    aba: 'overview',
    label: 'Visão Geral',
    path: '/social-media',
    description: 'Contas Instagram/Facebook ligadas, alcance e conferência da Meta da agência.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas: ['listar_contas_sociais', 'ler_aba'],
  },
  {
    modulo: 'social_media',
    aba: 'calendar',
    label: 'Calendário',
    path: '/social-media?tab=calendar',
    description:
      'Calendário por cliente: ficha, Semanal/Mensal, preview no mouse, arrastar o dia. Continua sendo a tarefa quem executa.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    precisa_cliente: true,
    ferramentas: ['listar_publicacoes_sociais', 'ler_aba'],
  },
  {
    modulo: 'social_media',
    aba: 'pending',
    label: 'A publicar',
    path: '/social-media?tab=pending',
    description: 'Fila A publicar e Falhou (Reagendar / Enviar agora). Cartão abre o post, não a tarefa.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas: ['listar_publicacoes_sociais', 'ler_aba'],
  },
  {
    modulo: 'social_media',
    aba: 'scheduled',
    label: 'Agendados',
    path: '/social-media?tab=scheduled',
    description:
      'Publicações agendadas: miniatura, barra de envio e atraso se a Meta ainda processa. Cartão abre o post.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas: ['listar_publicacoes_sociais', 'ler_aba'],
  },
  {
    modulo: 'social_media',
    aba: 'completed',
    label: 'Concluídos',
    path: '/social-media?tab=completed',
    description: 'Publicações já enviadas / tarefas social concluídas.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas: ['listar_publicacoes_sociais', 'ler_aba'],
  },
  {
    modulo: 'social_media',
    aba: 'meta-business',
    label: 'Perfil e feed',
    path: '/social-media?tab=meta-business',
    description: 'Perfil e feed Meta (Instagram/página) do cliente com conta ligada.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    precisa_cliente: true,
    ferramentas: ['listar_contas_sociais', 'ler_aba'],
  },

  // — Rastreamento
  {
    modulo: 'rastreamento',
    aba: 'visao',
    label: 'Visão geral',
    path: '/rastreamento',
    description: 'Investimento Meta, funil e as últimas mensagens do WhatsApp da loja.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    precisa_cliente: true,
    ferramentas: ['ler_aba', 'ver_integracoes_cliente'],
  },
  {
    modulo: 'rastreamento',
    aba: 'leads',
    label: 'Leads',
    path: '/rastreamento?aba=leads',
    description: 'Leads rastreados (CTWA, Google, site) com UTM, origem e mensagens do WhatsApp. Passe telefone para a conversa de um lead.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    precisa_cliente: true,
    ferramentas: ['listar_leads_rastreamento', 'ler_aba'],
  },
  {
    modulo: 'rastreamento',
    aba: 'relatorio',
    label: 'Relatórios',
    path: '/rastreamento?aba=relatorio',
    description: 'Campanhas, conjuntos, anúncios, conversas reais e qualificados.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    precisa_cliente: true,
    ferramentas: ['ler_aba', 'listar_leads_rastreamento'],
  },
  {
    modulo: 'rastreamento',
    aba: 'eventos',
    label: 'Eventos',
    path: '/rastreamento?aba=eventos',
    description: 'Auditoria CAPI Meta e upload Google Ads (gclid).',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    precisa_cliente: true,
    ferramentas: ['listar_eventos_rastreamento', 'ler_aba'],
  },
  {
    modulo: 'rastreamento',
    aba: 'funil',
    label: 'Funil',
    path: '/rastreamento?aba=funil',
    description: 'Funil de mídia e atribuição do cliente, com o resumo de leads e eventos.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    precisa_cliente: true,
    ferramentas: ['ler_aba', 'consultar_rastreamento'],
  },
  {
    modulo: 'rastreamento',
    aba: 'links',
    label: 'Links',
    path: '/rastreamento?aba=links',
    description: 'Links /r/ rastreáveis (WhatsApp, UTM, cliques e mensagens casadas).',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    precisa_cliente: true,
    ferramentas: ['listar_links_rastreaveis', 'ler_aba'],
  },
  {
    modulo: 'rastreamento',
    aba: 'integracoes',
    label: 'Integrações',
    path: '/rastreamento?aba=integracoes',
    description:
      'Meta (BM/contas/Pixel/Página), Google Ads conversões, Analytics/Meu Negócio/GTM, WhatsApp e destino CAPI. Sem segredos.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    precisa_cliente: true,
    ferramentas: ['ver_integracoes_cliente', 'ler_aba'],
  },
  {
    modulo: 'rastreamento',
    aba: 'configuracoes',
    label: 'Configurações',
    path: '/rastreamento?aba=configuracoes',
    description: 'Jornada e gatilhos de conversão (etiqueta/frase → Qualificado/Compra).',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    precisa_cliente: true,
    ferramentas: ['ler_aba'],
  },

  // — Operação já coberta por tools antigas
  {
    modulo: 'caixa',
    aba: 'caixa',
    label: 'Minha caixa',
    path: '/caixa',
    description: 'Caixa Dot (tópicos) e Operação (pendências).',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas: [
      'listar_caixa',
      'criar_demanda_caixa',
      'listar_demandas_caixa',
      'ler_aba',
    ],
  },
  {
    modulo: 'atendimento',
    aba: 'em-atendimento',
    label: 'Conversas',
    path: '/conversas/em-atendimento',
    description: 'Inbox WhatsApp.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas: ['listar_conversas', 'ler_aba'],
  },
  {
    modulo: 'clients',
    aba: 'lista',
    label: 'Clientes — Lista',
    path: '/clients',
    description: 'Cadastro da carteira. Passe cliente_id para o dossiê completo (ver_cliente).',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas: ['listar_clientes', 'ver_cliente', 'ler_aba'],
  },
  {
    modulo: 'clients',
    aba: 'kanban',
    label: 'Clientes — Kanban',
    path: '/clients?view=kanban',
    description: 'Kanban por etapa (prospect, negotiation, closed, lost).',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas: ['listar_clientes', 'ler_aba'],
  },
  {
    modulo: 'clients',
    aba: 'resumo',
    label: 'Ficha — Resumo',
    path: '/clients/:id?aba=resumo',
    description: 'Dossiê do cliente: cadastro, projetos, tarefas, Mini CRM, reuniões e cobertura.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    precisa_cliente: true,
    ferramentas: ['ver_cliente', 'ler_aba'],
  },
  {
    modulo: 'clients',
    aba: 'escopo',
    label: 'Ficha — Escopo do mês',
    path: '/clients/:id?aba=escopo',
    description: 'Contrato, entregáveis e cobertura do mês daquele cliente.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    precisa_cliente: true,
    ferramentas: ['ver_cliente', 'ler_aba'],
  },
  {
    modulo: 'clients',
    aba: 'reunioes',
    label: 'Ficha — Reuniões',
    path: '/clients/:id?aba=reunioes',
    description: 'Reuniões da ficha (Meet e falas). A loja não vê.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    precisa_cliente: true,
    ferramentas: ['ler_aba', 'ver_cliente'],
  },
  {
    modulo: 'clients',
    aba: 'entregas',
    label: 'Ficha — Entregas',
    path: '/clients/:id?aba=entregas',
    description: 'Tarefas abertas e atrasadas daquele cliente.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    precisa_cliente: true,
    ferramentas: ['listar_tarefas', 'ler_aba'],
  },
  {
    modulo: 'clients',
    aba: 'projetos',
    label: 'Ficha — Projetos',
    path: '/clients/:id?aba=projetos',
    description: 'Projetos gravados daquele cliente.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    precisa_cliente: true,
    ferramentas: ['buscar_projeto', 'listar_projetos', 'ler_aba'],
  },
  {
    modulo: 'projects',
    aba: 'kanban',
    label: 'Projetos',
    path: '/projects',
    description: 'Quadro mensal de projetos (logo, tipo de conta, Tirar deste mês).',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas: ['listar_projetos', 'buscar_projeto', 'ler_aba'],
  },
  {
    modulo: 'projects',
    aba: 'lista',
    label: 'Projetos — Lista',
    path: '/projects?view=lista',
    description: 'Lista de projetos gravados. Filtro por cliente_id ou mes YYYY-MM.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas: ['listar_projetos', 'ler_aba'],
  },
  {
    modulo: 'projects',
    aba: 'pendentes',
    label: 'Projetos — Pendentes',
    path: '/projects',
    description: 'Planos do mês, pulados e clientes ainda sem cartão.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas: ['listar_projetos', 'ler_aba'],
  },
  {
    modulo: 'tasks',
    aba: 'list',
    label: 'Tarefas — Lista',
    path: '/tasks/list',
    description: 'Lista de tarefas. cliente_id filtra a loja; busca filtra o título.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas: ['listar_tarefas', 'ler_aba'],
  },
  {
    modulo: 'tasks',
    aba: 'kanban',
    label: 'Tarefas — Kanban',
    path: '/tasks/kanban',
    description: 'Quadro de execução. Conteúdo publicado com link vai para Redes Sociais.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas: ['listar_tarefas', 'ler_aba'],
  },
  {
    modulo: 'tasks',
    aba: 'atrasadas',
    label: 'Tarefas — Atrasadas',
    path: '/tasks/list',
    description: 'Tarefas com prazo vencido e ainda não concluídas.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas: ['listar_tarefas_atrasadas', 'ler_aba'],
  },
  {
    modulo: 'tasks',
    aba: 'concluidas',
    label: 'Tarefas — Concluídas',
    path: '/tasks/list',
    description: 'Tarefas com status completed.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas: ['listar_tarefas', 'ler_aba'],
  },
  {
    modulo: 'reports',
    aba: 'indicadores',
    label: 'Indicadores do mês',
    path: '/reports',
    description: 'Perfil de cada colaborador, metas do mês e fotos automáticas. Sem pesos.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas: ['ler_aba'],
  },
  {
    modulo: 'onboarding',
    aba: 'kanban',
    label: 'Onboarding',
    path: '/onboarding',
    description: 'Checklist em colunas da entrada. listar_checklist_onboarding lê; adicionar_item_checklist inclui a linha; virar_tarefa_checklist abre a tarefa.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas: ['ler_aba'],
  },
  {
    modulo: 'cobertura',
    aba: 'mes',
    label: 'Cobertura do mês',
    path: '/cobertura',
    description: 'Cobertura contratado × planejado por cliente. mes YYYY-MM. cliente_id opcional.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas: ['ler_aba'],
  },
  {
    modulo: 'mini_crm',
    aba: 'grade',
    label: 'Mini CRM',
    path: '/mini-crm',
    description: 'Leads do Mini CRM da loja (status, valor, qualificado). Precisa de cliente_id.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    precisa_cliente: true,
    ferramentas: ['ler_aba', 'ver_cliente'],
  },
  {
    modulo: 'dashboard',
    aba: 'inicio',
    label: 'Início',
    path: '/dashboard',
    description: 'Resumo do dia: atrasadas, solicitações, onboarding e caixa.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas: ['ler_aba'],
  },
  {
    modulo: 'requests',
    aba: 'lista',
    label: 'Solicitações',
    path: '/requests',
    description: 'Pedidos enviados pelos clientes.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas: ['listar_solicitacoes', 'ler_aba'],
  },
  {
    modulo: 'assistant',
    aba: 'chat',
    label: 'Assistente',
    path: '/assistant',
    description: 'Conversas do assistente interno (título e modo, sem o texto completo).',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas: ['ler_aba'],
  },
  {
    modulo: 'automacoes',
    aba: 'lista',
    label: 'Automações',
    path: '/automacoes',
    description: 'Regras ligadas ou desligadas (sem tokens).',
    area: 'equipe',
    roles: ['superadmin', 'admin'],
    ferramentas: ['ler_aba'],
  },
  {
    modulo: 'crm',
    aba: 'leads',
    label: 'CRM — Leads',
    path: '/crm/leads',
    description: 'Leads e funil comercial.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas: ['buscar_leads', 'ler_aba'],
  },
  {
    modulo: 'settings',
    aba: 'conta',
    label: 'Configurações — Conta',
    path: '/settings',
    description: 'Perfil e token MCP pessoal.',
    area: 'equipe',
    roles: ['superadmin', 'admin', 'colaborador'],
    ferramentas: ['quem_sou_eu', 'ler_aba'],
  },
  {
    modulo: 'settings',
    aba: 'integracoes',
    label: 'Configurações — Integrações',
    path: '/settings?tab=integracoes',
    description: 'Meta, Google Drive e Google Ads da agência (status, sem secrets).',
    area: 'equipe',
    roles: ['superadmin'],
    ferramentas: ['ler_aba'],
  },
  {
    modulo: 'settings',
    aba: 'google-drive',
    label: 'Google Drive da agência',
    path: '/settings/google-drive',
    description: 'Client ID/Secret do Drive da agência (esta tool só diz se está configurado).',
    area: 'equipe',
    roles: ['superadmin'],
    ferramentas: ['ler_aba'],
  },
  {
    modulo: 'settings',
    aba: 'google-ads',
    label: 'Google Ads da agência',
    path: '/settings/google-ads',
    description: 'OAuth/MCC da agência (status, sem secrets).',
    area: 'equipe',
    roles: ['superadmin'],
    ferramentas: ['ler_aba'],
  },
  {
    modulo: 'settings',
    aba: 'google-dados',
    label: 'Google dados da agência',
    path: '/settings/google-dados',
    description: 'OAuth Analytics, Meu Negócio e Tag Manager da agência (status, sem secrets).',
    area: 'equipe',
    roles: ['superadmin'],
    ferramentas: ['ler_aba'],
  },
];

export const HUB_MODULES = [
  { name: 'paid_traffic', label: 'Tráfego pago' },
  { name: 'social_media', label: 'Redes sociais' },
  { name: 'rastreamento', label: 'Rastreamento' },
  { name: 'caixa', label: 'Minha caixa' },
  { name: 'atendimento', label: 'Conversas' },
  { name: 'clients', label: 'Clientes' },
  { name: 'financeiro', label: 'Financeiro' },
  { name: 'tasks', label: 'Tarefas' },
  { name: 'crm', label: 'CRM' },
  { name: 'settings', label: 'Configurações' },
  { name: 'projects', label: 'Projetos' },
  { name: 'reports', label: 'Relatórios' },
  { name: 'onboarding', label: 'Onboarding' },
  { name: 'cobertura', label: 'Cobertura' },
  { name: 'mini_crm', label: 'Mini CRM' },
  { name: 'automacoes', label: 'Automações' },
  { name: 'requests', label: 'Solicitações' },
  { name: 'assistant', label: 'Assistente' },
  { name: 'dashboard', label: 'Início' },
] as const;

export function filterHubTabs(opts: {
  modulo?: string;
  busca?: string;
  papel?: string;
}): (HubTab & { url: string })[] {
  let list = [...HUB_TABS];
  const modulo = opts.modulo?.trim().toLowerCase();
  const busca = opts.busca?.trim().toLowerCase();
  const papel = opts.papel?.trim().toLowerCase();

  if (modulo) list = list.filter((t) => t.modulo === modulo);
  if (papel) list = list.filter((t) => t.roles.some((r) => r === papel));
  if (busca) {
    list = list.filter(
      (t) =>
        t.label.toLowerCase().includes(busca) ||
        t.aba.toLowerCase().includes(busca) ||
        t.description.toLowerCase().includes(busca) ||
        t.path.toLowerCase().includes(busca) ||
        t.modulo.toLowerCase().includes(busca)
    );
  }

  return list.map((t) => ({ ...t, url: pageUrl(t.path) }));
}

export function findHubTab(modulo: string, aba: string): HubTab | null {
  const m = modulo.trim().toLowerCase();
  const a = aba.trim().toLowerCase();
  return (
    HUB_TABS.find((t) => t.modulo === m && t.aba === a) ||
    HUB_TABS.find((t) => t.modulo === m && (t.aba === a || t.label.toLowerCase() === a)) ||
    null
  );
}
