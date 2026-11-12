import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/** Explicit OAuth catalog. This is product scope, not an authorization boundary.
 * The previous 53-tool catalog omitted three valid read tools. Preserve it and
 * add five traffic reads. No official fixed 55-tool limit is assumed.
 * Also exposes five Gestor IA routine tools with their own authorization policies.
 */
export const CHATGPT_TOOL_ALLOWLIST = [
  'criar_demanda_caixa',
  'listar_demandas_caixa',
  'listar_caixa',
  'agir_pendencia_caixa',
  'listar_briefings',
  'criar_briefing',
  'atualizar_briefing',
  'meus_modulos',
  'listar_abas',
  'ler_aba',
  'ver_cliente',
  'listar_projetos',
  'listar_tarefas',
  'listar_tarefas_atrasadas',
  'criar_tarefa',
  'atualizar_tarefa',
  'listar_clientes',
  'criar_cliente',
  'atualizar_cliente',
  'resolver_pessoa',
  'listar_equipe',
  'quem_sou_eu',
  'listar_ferramentas_mcp',
  'listar_paginas',
  'obter_pagina',
  'listar_modulos',
  'ver_resultados_cliente',
  'ver_campanhas_pagas',
  'listar_contas_meta_cliente',
  'consultar_trafego_meta',
  'comparar_periodos_meta',
  'consultar_trafego',
  'ver_painel_trafego',
  'consultar_rastreamento',
  'ver_rotina_semanal',
  'ver_hoje_trafego',
  'ver_revisao_semanal',
  'gestor_ia_listar_painel',
  'gestor_ia_ler_semana',
  'gestor_ia_salvar_semana',
  'gestor_ia_sugerir_acao',
  'gestor_ia_ver_leads',
  'listar_leads_rastreamento',
  'ver_mensagens_rastreamento',
  'consultar_historico_cliente',
  'iniciar_onboarding',
  'virar_tarefa_onboarding',
  'buscar_projeto',
  'listar_checklist_onboarding',
  'adicionar_item_checklist',
  'ajustar_item_checklist',
  'virar_tarefa_checklist',
  'listar_publicacoes_sociais',
  'listar_contas_sociais',
  'listar_solicitacoes',
  'criar_solicitacao',
  'atualizar_solicitacao',
  'ver_oportunidades_crm',
  'buscar_leads',
  'resumo_agencia',
  'listar_status_tarefas',
  'ver_relatorio_trafego',
  'listar_contas_google_ads',
  'ver_integracoes_cliente',
] as const;

const ALLOW = new Set<string>(CHATGPT_TOOL_ALLOWLIST);

type RegisteredToolBag = {
  enabled: boolean;
  disable: () => void;
  enable: () => void;
};

function registeredToolsMap(mcp: McpServer): Record<string, RegisteredToolBag> {
  return (mcp as unknown as { _registeredTools: Record<string, RegisteredToolBag> })._registeredTools;
}

/** Mantém o catálogo OAuth explícito; cada ferramenta valida suas permissões. */
export function applyChatgptToolBudget(mcp: McpServer): {
  enabled: string[];
  disabled: number;
  total: number;
} {
  const map = registeredToolsMap(mcp);
  const names = Object.keys(map);
  let disabled = 0;
  for (const name of names) {
    const tool = map[name];
    if (!tool) continue;
    if (ALLOW.has(name)) {
      if (!tool.enabled) tool.enable();
    } else if (tool.enabled) {
      tool.disable();
      disabled += 1;
    }
  }
  const enabled = names.filter((n) => map[n]?.enabled);
  // Garante Caixa Dot no ar mesmo se o nome sumir do register por regressão
  for (const must of ['criar_demanda_caixa', 'listar_demandas_caixa'] as const) {
    if (!enabled.includes(must)) {
      console.warn(`[planeje-mcp] ChatGPT budget: ${must} não está registrada/enabled`);
    }
  }
  console.log(
    `[planeje-mcp] ChatGPT tool budget: ${enabled.length} enabled, ${disabled} disabled (total ${names.length})`
  );
  return { enabled, disabled, total: names.length };
}

export function isChatgptOAuthActor(actor: { type: string; label?: string }): boolean {
  return actor.type === 'user' && actor.label === 'oauth';
}
