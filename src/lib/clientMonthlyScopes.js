export const SCOPE_DELIVERABLES = [
  ['posts', 'Posts'],
  ['carrosseis', 'Carrosséis'],
  ['videos', 'Vídeos'],
  ['stories', 'Stories'],
  ['anuncios', 'Anúncios'],
];

export const SCOPE_PRODUCTS = {
  execucao_completa: 'Execução completa',
  execucao_parcial: 'Execução parcial',
  apenas_consultoria: 'Apenas consultoria',
  trafego: 'Tráfego',
  indefinido: 'A definir',
};

export function scopeReferenceMonth(value) {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-01`;
  }
  const match = String(value).match(/^(\d{4})-(0[1-9]|1[0-2])(?:$|-)/);
  return match ? `${match[1]}-${match[2]}-01` : null;
}

export function clientScopeUrl(clientId, referenceMonth) {
  if (!clientId) return '/clients';
  const month = scopeReferenceMonth(referenceMonth);
  return `/clients/${encodeURIComponent(clientId)}?section=escopo${month ? `&month=${month.slice(0, 7)}` : ''}`;
}

export function formatScopeMonth(referenceMonth) {
  const month = scopeReferenceMonth(referenceMonth);
  return month ? new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(`${month}T12:00:00`)) : 'Período não definido';
}

export function scopeDeliverables(values) {
  return Object.fromEntries(SCOPE_DELIVERABLES.map(([key]) => {
    const value = Number(values?.[key]);
    return [key, Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0];
  }));
}

export function clientScopeReference(client) {
  return {
    product: client?.tipo_servico || 'indefinido',
    deliverables: scopeDeliverables(client?.entregaveis),
    channels: [],
    meta_ads: Number(client?.entregaveis?.anuncios) > 0,
    google_ads: /google/i.test(client?.tipo_contrato || ''),
    media_goals: {
      objetivo_meta: client?.objetivo_meta || '',
      meta_custo_mensagem: client?.meta_custo_mensagem ?? '',
      meta_custo_compra: client?.meta_custo_compra ?? '',
      roas_alvo: client?.roas_alvo ?? '',
    },
  };
}

export function newClientMonthlyScope(client, referenceMonth, previous) {
  const base = previous || clientScopeReference(client);
  return {
    client_id: client.id,
    reference_month: scopeReferenceMonth(referenceMonth),
    product: base.product || 'indefinido',
    deliverables: scopeDeliverables(base.deliverables),
    channels: [...(base.channels || [])],
    meta_ads: Boolean(base.meta_ads),
    google_ads: Boolean(base.google_ads),
    media_goals: { ...(base.media_goals || {}) },
    account_owner_id: previous?.account_owner_id || null,
    // Exceções e aprovação não são transferidas para outro mês.
    scope_exceptions: '',
    plan_status: 'planning',
    cloned_from_scope_id: previous?.id || null,
  };
}
