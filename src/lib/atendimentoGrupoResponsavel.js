const RESOLVIDO = 'resolvido';

/** O SLA vermelho mede a primeira resposta do lead. No grupo o atraso do dia é o Aguardando há. */
export function slaMedeConversa(conv) {
  return Boolean(conv) && !conv.is_group;
}

/**
 * Linha do card e do cabeçalho. Grupo encerrado não cobra responsável.
 * Sem assigned_to, a espera fica sem dono.
 */
export function grupoResponsavelLinha(conv, nameById) {
  if (!conv?.is_group) return null;
  if (conv.status === RESOLVIDO) return null;
  const assigned = conv.assigned_to || null;
  const name = assigned ? String(nameById?.[assigned] || '').trim() : '';
  if (name) return { text: `Responsável: ${name}`, missing: false };
  if (assigned) return { text: 'Responsável atribuído', missing: false };
  return { text: 'Sem responsável', missing: true };
}
