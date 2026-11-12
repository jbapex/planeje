/**
 * Qualificação e compra (tri-state boolean + valor).
 * Usado em Contatos, Rastreamento e Relatório Meta.
 */

export const COMERCIAL_PENDENTE = 'pendente';
export const COMERCIAL_SIM = 'sim';
export const COMERCIAL_NAO = 'nao';

export function boolToComercialOption(v) {
  if (v === true) return COMERCIAL_SIM;
  if (v === false) return COMERCIAL_NAO;
  return COMERCIAL_PENDENTE;
}

export function comercialOptionToBool(opt) {
  if (opt === COMERCIAL_SIM) return true;
  if (opt === COMERCIAL_NAO) return false;
  return null;
}

export function comercialLabel(opt) {
  if (opt === COMERCIAL_SIM) return 'Sim';
  if (opt === COMERCIAL_NAO) return 'Não';
  return 'Pendente';
}

/** Valor em reais > 0; aceita vírgula. Zero ou vazio não conta. */
export function parseComercialValor(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : 0;
  const n = parseFloat(String(value).trim().replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Ao marcar Comprou = Sim, pedir o valor se ainda não houver reais. */
export function needsPurchaseValuePrompt(valor) {
  return parseComercialValor(valor) <= 0;
}

/** Resolve estado comercial unindo lead (prioridade) e contato WhatsApp. */
export function resolveComercialState({ lead, contact } = {}) {
  const qualificado = lead?.qualificado !== undefined && lead?.qualificado !== null
    ? lead.qualificado
    : contact?.qualificado ?? null;
  const comprou = lead?.comprou !== undefined && lead?.comprou !== null
    ? lead.comprou
    : contact?.comprou ?? null;
  const valor = lead?.valor != null && lead?.valor !== ''
    ? Number(lead.valor)
    : contact?.valor_venda != null
      ? Number(contact.valor_venda)
      : null;
  const status = lead?.status ?? null;
  return {
    leadId: lead?.id ?? null,
    contactId: contact?.id ?? null,
    qualificado,
    comprou,
    valor: Number.isFinite(valor) ? valor : null,
    status,
  };
}

/** Conta como venda no relatório Meta. */
export function isVendaComercial(state) {
  if (!state) return false;
  if (state.comprou === true) return true;
  if (state.comprou === false) return false;
  if (state.status === 'vendeu') return true;
  return (state.valor ?? 0) > 0;
}

export function isQualificadoComercial(state) {
  if (!state) return null;
  if (state.qualificado === true) return true;
  if (state.qualificado === false) return false;
  return null;
}

export function vendaValorComercial(state) {
  if (!isVendaComercial(state)) return 0;
  return state.valor ?? 0;
}
