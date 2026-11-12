export const META_AGENCY_TOKEN_SECRET = 'META_SYSTEM_USER_ACCESS_TOKEN';

export const META_TOKEN_USES = [
  {
    id: 'ads',
    label: 'Anúncios e tráfego',
    detail: 'Puxar campanhas, gasto e resultados no Tráfego.',
    scopes: ['ads_read', 'ads_management', 'read_insights', 'business_management'],
  },
  {
    id: 'pages',
    label: 'Páginas do Facebook',
    detail: 'Listar páginas e métricas orgânicas.',
    scopes: ['pages_show_list', 'pages_read_engagement'],
  },
  {
    id: 'publish',
    label: 'Publicar no Facebook e Instagram',
    detail: 'Enviar e agendar posts/Reels pelo Planeje (tarefa ou post avulso).',
    scopes: ['pages_manage_posts', 'instagram_basic', 'instagram_content_publish'],
  },
  {
    id: 'ig_insights',
    label: 'Métricas do Instagram',
    detail: 'Alcance e desempenho das contas ligadas às páginas.',
    scopes: ['instagram_basic', 'instagram_manage_insights'],
  },
  {
    id: 'leads',
    label: 'Leads dos anúncios',
    detail: 'Formulários de Lead Ads.',
    scopes: ['leads_retrieval'],
  },
];

export function previewSecret(value) {
  const secret = String(value || '').trim();
  if (!secret) return '';
  if (secret.length <= 12) return '••••';
  return `${secret.slice(0, 6)}…${secret.slice(-4)}`;
}

export function grantedPermissions(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && item.status && item.status !== 'granted') return '';
      return String(item?.permission || item?.name || '').trim();
    })
    .filter(Boolean);
}

export function permissionChecklist(granted, uses = META_TOKEN_USES) {
  const set = new Set(grantedPermissions(granted));
  return uses.map((use) => {
    const scopes = use.scopes.map((scope) => ({ scope, ok: set.has(scope) }));
    return {
      ...use,
      scopes,
      ready: scopes.every((item) => item.ok),
      missing: scopes.filter((item) => !item.ok).map((item) => item.scope),
    };
  });
}

export function explainMetaTokenError(error) {
  const payload = error && typeof error === 'object' ? error : { message: error };
  const message = String(payload.message || payload.error_user_msg || payload.error || '').trim();
  const code = String(payload.code || '');
  if (code === 'TOKEN_NOT_FOUND' || /TOKEN_NOT_FOUND|not found in Vault/i.test(message)) {
    return 'Nenhum token da agência está salvo. Cole o token do System User e salve.';
  }
  if (/invalid|expired|session has expired|cannot parse access token/i.test(message) || code === '190') {
    return 'Token inválido ou vencido. Gere um novo no Business Manager e salve de novo.';
  }
  if (code === '200' || /permission|#200|ads_management or ads_read/i.test(message)) {
    return 'O System User não tem acesso a este ativo. No BM, atribua contas de anúncio, páginas e Instagram.';
  }
  if (code === '4' || code === '17' || /rate limit|too many calls/i.test(message)) {
    return 'A Meta limitou as chamadas agora. Espere um ou dois minutos e teste de novo.';
  }
  return message || 'Não foi possível falar com a Meta.';
}

export function summarizeInspect(data) {
  const error = data?.error;
  const connected = Boolean(data?.connected) && !error;
  return {
    connected,
    userName: data?.user?.name || '',
    userId: data?.user?.id || '',
    adAccounts: Array.isArray(data?.adAccounts) ? data.adAccounts : [],
    pages: Array.isArray(data?.pages) ? data.pages : [],
    instagramAccounts: Array.isArray(data?.instagramAccounts) ? data.instagramAccounts : [],
    permissions: grantedPermissions(data?.permissions),
    error: connected ? '' : explainMetaTokenError(error || { code: data?.error?.code, message: data?.error?.message }),
  };
}
