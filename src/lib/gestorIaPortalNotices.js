export const PORTAL_NOTICE_PAGE_SIZE = 25;
export const PORTAL_NOTICE_TITLE_LIMIT = 110;
export const PORTAL_NOTICE_MESSAGE_LIMIT = 1000;

function validCopy(row) {
  return typeof row?.id === 'string' && typeof row.title === 'string' && row.title.trim().length > 0 &&
    typeof row.message === 'string' && row.message.trim().length > 0 &&
    (row.published_at === null || typeof row.published_at === 'string' && Number.isFinite(Date.parse(row.published_at)));
}

const validRevision = (row) => Number.isSafeInteger(row.revision) && row.revision > 0;

export async function listPortalNotices(db, offset, clientId) {
  const { data, error } = await db.rpc('gestor_ia_listar_avisos_portal', { p_offset: offset, ...(clientId && { p_client_id: clientId }) });
  if (error || !Array.isArray(data) || data.some((row) => !validCopy(row) || !row.published_at || (clientId && !validRevision(row)))) {
    throw new Error('Não foi possível consultar os avisos do portal.');
  }
  return data;
}

export async function loadDecisionPortalNotice(db, decisionId) {
  const { data, error } = await db.rpc('gestor_ia_aviso_portal_da_decisao', { p_decision_id: decisionId });
  if (error || data !== null && (!validCopy(data) || !validRevision(data))) throw new Error('Não foi possível consultar a visibilidade do aviso.');
  return data;
}

function confirmWrite(data, error, revision, published) {
  if (error?.code === '40001') throw new Error('O aviso mudou em outra tela. Confira a versão atual.');
  if (error || !validCopy(data) || data.revision !== revision + 1 || Boolean(data.published_at) !== published) {
    throw new Error('Não foi possível confirmar a alteração. Confira a versão atual.');
  }
  return data;
}

export async function publishPortalNotice(db, decisionId, revision, title, message) {
  const headline = typeof title === 'string' ? title.trim() : '';
  const content = typeof message === 'string' ? message.trim() : '';
  if (!headline || headline.length > PORTAL_NOTICE_TITLE_LIMIT || !content || content.length > PORTAL_NOTICE_MESSAGE_LIMIT) {
    throw new Error('Preencha um título e uma mensagem dentro dos limites do aviso.');
  }
  const { data, error } = await db.rpc('gestor_ia_publicar_aviso_portal', { p_decision_id: decisionId, p_revision: revision, p_title: headline, p_message: content });
  return confirmWrite(data, error, revision, true);
}

export async function withdrawPortalNotice(db, { id, revision }) {
  const { data, error } = await db.rpc('gestor_ia_retirar_aviso_portal', { p_notice_id: id, p_revision: revision });
  const withdrawn = confirmWrite(data, error, revision, false);
  if (withdrawn.id !== id) throw new Error('Não foi possível confirmar a retirada do aviso. Confira a versão atual.');
  return withdrawn;
}
