/**
 * Ação da exceção no módulo de tráfego.
 * O gestor resolve aqui — não na lista genérica de tarefas.
 */

export function exceptionActionPlan(row = {}) {
  const code = row.code;
  const hasTask = Boolean(row.taskId);

  if (code === 'missing_gestor') {
    return { kind: 'conta', label: 'Definir gestor', focus: 'gestor' };
  }
  if (code === 'missing_budget') {
    return { kind: 'conta', label: 'Informar orçamento', focus: 'budget' };
  }
  if (code === 'missing_active_campaign') {
    return {
      kind: 'conta',
      label: 'Ajustar conta',
      focus: 'situation',
      secondary: { kind: 'demand', label: 'Nova campanha', demandType: 'nova_campanha' },
    };
  }
  if (code === 'meta_unavailable') {
    return { kind: 'ficha', label: 'Abrir ficha' };
  }
  if (code === 'waiting_client') {
    return {
      kind: 'pause',
      label: 'Pausa planejada',
      secondary: { kind: 'demand', label: 'Cobrar cliente', demandType: 'cobranca_material' },
    };
  }
  if (code === 'over_budget') {
    return {
      kind: 'conta',
      label: 'Revisar verba',
      focus: 'budget',
      secondary: { kind: 'demand', label: 'Ajuste de orçamento', demandType: 'orcamento' },
    };
  }
  if (hasTask && (code === 'overdue_tasks' || code === 'next_action_overdue' || code === 'needs_attention')) {
    return { kind: 'complete', label: 'Concluir demanda' };
  }
  if (code === 'overdue_tasks' || code === 'next_action_overdue' || code === 'needs_attention') {
    return { kind: 'demand', label: 'Criar demanda', demandType: 'ajuste' };
  }
  return hasTask
    ? { kind: 'complete', label: 'Concluir demanda' }
    : { kind: 'demand', label: 'Criar demanda', demandType: 'ajuste' };
}

export function demandClientOptions(clients) {
  return (clients || []).map((c) => ({
    id: c.clientId || c.id,
    empresa: c.empresa,
  }));
}

export function checkupSettingsClient(client) {
  if (!client) return null;
  return {
    client_id: client.clientId || client.client_id,
    empresa: client.empresa,
    gestor_id: client.gestorId || client.gestor_id,
    situation: client.situation,
    require_active_campaign: client.requireActiveCampaign !== false,
    settings: client.checkupSettings || client.settings || {},
  };
}

export function unwrapMoney(value) {
  if (value == null || value === '') return { available: false, amount: null };
  if (typeof value === 'object') {
    if (value.available === false) return { available: false, amount: null };
    const n = Number(value.value);
    if (!Number.isFinite(n)) return { available: false, amount: null };
    return { available: true, amount: n };
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return { available: false, amount: null };
  return { available: true, amount: n };
}
