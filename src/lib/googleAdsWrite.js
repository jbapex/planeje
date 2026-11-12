export function parseGoogleBudgetReais(value) {
  const text = String(value ?? '').trim().replace(/\s/g, '');
  if (!text) return null;
  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : text;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

export function googleAdsWritePlan(input = {}) {
  const customerId = String(input.customerId || '').replace(/\D/g, '');
  const name = String(input.name || '').trim() || 'este item';
  if (!customerId) {
    return { valid: false, title: 'Conta ausente', detail: 'Escolha a conta Google Ads antes de alterar.' };
  }
  const kind = String(input.kind || '');
  if (kind === 'campaign-status' || kind === 'keyword-status') {
    const status = input.status === 'PAUSED' || input.status === 'ENABLED' ? input.status : '';
    const verb = status === 'PAUSED' ? 'Pausar' : 'Ligar';
    const noun = kind === 'campaign-status' ? 'campanha' : 'palavra-chave';
    if (!status) {
      return { valid: false, title: 'Alteração inválida', detail: 'Escolha pausar ou ligar.' };
    }
    if (kind === 'campaign-status' && !/^\d{1,20}$/.test(String(input.campaignId || ''))) {
      return { valid: false, title: 'Campanha inválida', detail: 'O Google não devolveu o código desta campanha.' };
    }
    if (kind === 'keyword-status' && (!/^\d{1,20}$/.test(String(input.adGroupId || '')) || !/^\d{1,20}$/.test(String(input.criterionId || '')))) {
      return { valid: false, title: 'Palavra inválida', detail: 'O Google não devolveu o código desta palavra.' };
    }
    return {
      valid: true,
      title: `${verb} ${noun} no Google Ads`,
      detail: `Só este item muda: ${name}. A Meta e as outras campanhas ficam como estão.`,
      payload: {
        customerId,
        kind,
        status,
        ...(kind === 'campaign-status' ? { campaignId: String(input.campaignId) } : {}),
        ...(kind === 'keyword-status'
          ? { adGroupId: String(input.adGroupId), criterionId: String(input.criterionId) }
          : {}),
      },
    };
  }
  if (kind === 'campaign-budget') {
    const reais = parseGoogleBudgetReais(input.budgetReais);
    const resource = String(input.budgetResource || '');
    const expected = `customers/${customerId}/campaignBudgets/`;
    if (reais == null || reais < 1 || reais > 20000) {
      return { valid: false, title: 'Orçamento inválido', detail: 'Informe um valor diário entre R$ 1 e R$ 20.000.' };
    }
    if (!resource.startsWith(expected) || !/^\d+$/.test(resource.slice(expected.length))) {
      return { valid: false, title: 'Orçamento indisponível', detail: 'O Google não devolveu o orçamento desta campanha.' };
    }
    return {
      valid: true,
      title: 'Alterar orçamento no Google Ads',
      detail: input.budgetShared
        ? `Este orçamento é compartilhado. O valor novo vale para todas as campanhas que usam o mesmo orçamento, a partir de ${name}.`
        : `Orçamento diário só desta campanha: ${name}.`,
      payload: {
        customerId,
        kind,
        budgetResource: resource,
        amountMicros: String(Math.round(reais * 1_000_000)),
      },
    };
  }
  return { valid: false, title: 'Alteração inválida', detail: 'Escolha pausar, ligar ou mudar o orçamento.' };
}
