export const GESTOR_CONTEXT_FIELDS = ['logo_urls', 'responsavel', 'nicho', 'sobre_empresa', 'publico_alvo', 'tom_de_voz', 'produtos_servicos', 'objetivo_meta', 'limite_meta', 'meta_custo_mensagem', 'meta_custo_compra', 'roas_alvo', 'meta_resumo', 'entregaveis'];
export const GESTOR_PERMISSION_FIELDS = [...GESTOR_CONTEXT_FIELDS, 'valor'];

export function canUseGestorIa(profile, modules) {
  return Boolean(profile?.id && profile.status === 'active' &&
    ['superadmin', 'admin', 'colaborador'].includes(profile.role) && modules?.paid_traffic === true);
}

export function canSeeCampaignGoals(profile, modules, canViewField) {
  return canUseGestorIa(profile, modules) && modules.clients === true && ['admin', 'superadmin'].includes(profile.role) &&
    canViewField?.('meta_resumo') === true && canViewField?.('valor') === true;
}
