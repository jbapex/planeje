import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { denyModule, loadModuleAccess, type McpActorLike, type ModuleAccess } from './access.js';
import { findHubTab } from './hubCatalog.js';

type ToolPolicy = { module?: string; role?: 'admin' | 'superadmin' };

// Explicit names make new tools fail closed until their domain has been reviewed.
export const TOOL_POLICIES: Readonly<Record<string, ToolPolicy>> = Object.freeze(Object.fromEntries([
  ...['quem_sou_eu', 'meus_modulos', 'listar_abas', 'ler_aba', 'listar_paginas', 'obter_pagina',
    'listar_modulos', 'listar_ferramentas_mcp', 'resolver_pessoa', 'listar_equipe',
    'consultar_historico_cliente', 'listar_google_dados'].map(name => [name, {}]),
  ...['listar_caixa', 'agir_pendencia_caixa', 'criar_demanda_caixa', 'listar_demandas_caixa'].map(name => [name, { module: 'caixa' }]),
  ...['listar_clientes', 'criar_cliente', 'atualizar_cliente', 'ver_cliente', 'listar_briefings',
    'criar_briefing', 'atualizar_briefing', 'listar_observacoes_cliente', 'criar_observacao_cliente',
    'ver_resultados_cliente'].map(name => [name, { module: 'clients' }]),
  ...['buscar_projeto', 'listar_projetos', 'criar_projeto', 'atualizar_projeto', 'buscar_plano_campanha',
    'criar_plano_campanha'].map(name => [name, { module: 'projects' }]),
  ...['listar_tarefas', 'listar_tarefas_atrasadas', 'listar_status_tarefas', 'criar_tarefa',
    'atualizar_tarefa', 'deletar_tarefa', 'buscar_tarefas_por_texto', 'ver_anexos_tarefa',
    'ver_comentarios_tarefa', 'adicionar_comentario', 'resumo_agencia',
    'resumo_cobertura_mensal'].map(name => [name, { module: 'tasks' }]),
  ...['buscar_leads', 'ver_oportunidades_crm'].map(name => [name, { module: 'crm' }]),
  ...['listar_solicitacoes', 'criar_solicitacao', 'atualizar_solicitacao',
    'deletar_solicitacao'].map(name => [name, { module: 'requests', role: 'admin' }]),
  ...['criar_membro', 'atualizar_membro', 'invocar_meta_ads_api',
    'chamar_rpc_criar_campanha'].map(name => [name, { role: 'superadmin' }]),
  ...['ver_campanhas_pagas', 'listar_status_campanhas', 'listar_contas_meta_cliente', 'ver_rotina_semanal',
    'ver_revisao_semanal', 'ver_hoje_trafego', 'listar_contas_google_ads', 'ver_relatorio_trafego',
    'consultar_trafego', 'ver_painel_trafego', 'consultar_trafego_meta',
    'comparar_periodos_meta', 'gestor_ia_listar_painel', 'gestor_ia_ler_semana',
    'gestor_ia_salvar_semana', 'gestor_ia_sugerir_acao', 'gestor_ia_ver_leads'].map(name => [name, { module: 'paid_traffic' }]),
  ...['criar_campanha_paga', 'atualizar_campanha_paga', 'deletar_campanha_paga',
    'criar_status_campanha', 'deletar_status_campanha', 'vincular_conta_meta',
    'atualizar_conta_meta'].map(name => [name, { module: 'paid_traffic', role: 'admin' }]),
  ...['listar_conversas', 'ver_mensagens_conversa', 'atualizar_conversa', 'listar_filas_atendimento',
    'analisar_conversa_grupo', 'listar_analises_grupo', 'listar_remetentes_internos_grupo',
    'criar_remetente_interno_grupo'].map(name => [name, { module: 'atendimento' }]),
  ...['listar_publicacoes_sociais', 'listar_contas_sociais'].map(name => [name, { module: 'social_media' }]),
  ...['listar_leads_rastreamento', 'listar_eventos_rastreamento', 'listar_links_rastreaveis',
    'ver_integracoes_cliente', 'consultar_rastreamento', 'ver_mensagens_rastreamento'].map(name => [name, { module: 'rastreamento' }]),
  ...['virar_tarefa_onboarding', 'ajustar_etapa_onboarding', 'concluir_etapa_onboarding',
    'listar_checklist_onboarding', 'adicionar_item_checklist', 'ajustar_item_checklist',
    'virar_tarefa_checklist'].map(name => [name, { module: 'onboarding' }]),
  ['iniciar_onboarding', { module: 'onboarding', role: 'admin' }],
]));

export function denyTool(access: ModuleAccess, name: string, args: Record<string, unknown> = {}): string | null {
  if (!access.is_team) return 'Acesso autenticado da equipe obrigatório.';
  if (access.role === 'superadmin') return null;
  const policy = Object.hasOwn(TOOL_POLICIES, name) ? TOOL_POLICIES[name] : undefined;
  if (!policy) return 'Ferramenta sem política de autorização. Acesso negado.';
  if (policy.role === 'superadmin' || (policy.role === 'admin' && !access.is_admin)) {
    return 'Esta ferramenta não está disponível para o papel da sessão.';
  }
  if (policy.module) {
    const denied = denyModule(access, policy.module);
    if (denied) return denied;
  }
  if (name === 'resumo_cobertura_mensal') return denyModule(access, 'projects');
  if (name === 'gestor_ia_ver_leads') return denyModule(access, 'rastreamento');
  if (name === 'listar_equipe' && args.papel && args.papel !== 'equipe' && !access.is_admin) {
    return 'Somente gestores podem listar perfis fora da equipe.';
  }
  if (name === 'consultar_historico_cliente') {
    if (args.tipo === 'observacoes') return denyModule(access, 'mini_crm');
    if (args.tipo === 'origens' || args.tipo === 'canais') return denyModule(access, 'rastreamento');
    return 'Tipo de histórico sem política de autorização.';
  }
  if (name === 'listar_google_dados') {
    return denyModule(access, 'rastreamento') && denyModule(access, 'paid_traffic');
  }
  if (['ler_aba', 'consultar_trafego', 'consultar_rastreamento'].includes(name)) {
    const module = name === 'consultar_trafego' ? 'paid_traffic'
      : name === 'consultar_rastreamento' ? 'rastreamento' : String(args.modulo ?? '');
    const tab = findHubTab(module, String(args.aba ?? ''));
    if (!tab) return 'Aba sem política de autorização. Acesso negado.';
    if (!tab.roles.includes(access.role ?? '')) return 'Aba não disponível para o papel da sessão.';
    const denied = denyModule(access, tab.modulo);
    if (denied) return denied;
    if (tab.modulo === 'clients' && ['entregas', 'projetos'].includes(tab.aba)) {
      return denyModule(access, tab.aba === 'entregas' ? 'tasks' : 'projects');
    }
  }
  return null;
}

const installed = new WeakSet<McpServer>();

/** Install before registration so SDK transports and tools registered later share the same gate. */
export function installToolAuthorization(mcp: McpServer, supabase: SupabaseClient, actor?: McpActorLike): void {
  if (installed.has(mcp)) return;
  installed.add(mcp);
  const register = mcp.registerTool.bind(mcp);
  mcp.registerTool = ((name, config, callback) => {
    const handler = callback as (...args: unknown[]) => CallToolResult | Promise<CallToolResult>;
    return register(name, config, (async (...args: unknown[]) => {
      try {
        const access = await loadModuleAccess(supabase, actor);
        const input = config.inputSchema && args[0] && typeof args[0] === 'object'
          ? args[0] as Record<string, unknown> : {};
        const denied = denyTool(access, name, input);
        if (denied) return { content: [{ type: 'text', text: denied }], isError: true };
      } catch {
        return { content: [{ type: 'text', text: 'Não foi possível validar a conta e as permissões desta sessão.' }], isError: true };
      }
      return handler(...args);
    }) as typeof callback);
  }) as McpServer['registerTool'];
}
