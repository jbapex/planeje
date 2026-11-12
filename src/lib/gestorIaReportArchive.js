import { dateRange } from './trafficPerformanceReport.js';

export const GESTOR_PDF_BUCKET = 'gestor-ia-relatorios';
export const GESTOR_PDF_PAGE_SIZE = 25;
export const GESTOR_PDF_LABELS = { meta: 'Meta Ads', google: 'Google Ads', redes: 'Redes sociais', meta_redes: 'Meta Ads e redes sociais' };
const PDF_LIMIT = 50 * 1024 * 1024;

export function canUseGestorReportArchive(profile, modules, canViewField) {
  return Boolean(profile?.id) && profile.status === 'active' && ['admin', 'superadmin'].includes(profile.role) && modules?.paid_traffic === true &&
    modules?.reports === true && canViewField?.('meta_resumo') === true && canViewField?.('valor') === true;
}

export function gestorReportPath(clientId, ownerId, period, source, fileId) {
  const range = dateRange(period?.since, period?.until);
  if (!range || !Object.hasOwn(GESTOR_PDF_LABELS, source) || ![clientId, ownerId, fileId].every((id) => typeof id === 'string' && /^[\w-]+$/.test(id))) {
    throw new Error('Confira o cliente e o período antes de salvar o PDF.');
  }
  return `${clientId}/${ownerId}/${range.since}_${range.until}_${source}_${fileId}.pdf`;
}

async function checkedPdf(blob) {
  if (!(blob instanceof Blob) || blob.size > PDF_LIMIT || await blob.slice(0, 5).text() !== '%PDF-') {
    throw new Error('O arquivo precisa ser um PDF válido de até 50 MB.');
  }
  return blob.type === 'application/pdf' ? blob : blob.slice(0, blob.size, 'application/pdf');
}

export async function uploadGestorReportPdf(db, path, blob) {
  const bucket = db.storage.from(GESTOR_PDF_BUCKET);
  const pdf = await checkedPdf(blob);
  const { error } = await bucket.upload(path, pdf, { upsert: false, contentType: 'application/pdf', cacheControl: '0' });
  if (!error) return;
  if (Number(error.statusCode || error.status) !== 409 && !/already exists|duplicate/i.test(error.message || '')) {
    throw new Error('Não foi possível salvar o PDF no Gestor. Tente novamente.');
  }
  const previous = await readGestorReportPdf(db, path);
  if (previous.size === pdf.size) {
    const [stored, current] = await Promise.all([previous.arrayBuffer(), pdf.arrayBuffer()]);
    const bytes = new Uint8Array(current);
    if (new Uint8Array(stored).every((value, index) => value === bytes[index])) return;
  }
  throw new Error('Já existe outra versão neste endereço. Monte o relatório novamente.');
}

function validReportRow(row, clientId) {
  return typeof row?.path === 'string' && row.path.startsWith(`${clientId}/`) && typeof row.id === 'string' &&
    Object.hasOwn(GESTOR_PDF_LABELS, row.source) && Boolean(dateRange(row.period_since, row.period_until));
}

function validPublication(row) {
  return Number.isSafeInteger(row?.publication_revision) && row.publication_revision >= 0 &&
    (row.published_at === null || row.publication_revision > 0 && Number.isFinite(Date.parse(row.published_at)));
}

export async function listGestorReportPdfs(db, clientId, period, reviewed, offset) {
  const { data, error } = await db.rpc('gestor_ia_listar_pdfs', {
    p_client_id: clientId, p_since: period.since, p_until: period.until, p_reviewed: reviewed, p_offset: offset,
  });
  if (error || !Array.isArray(data) || data.some((row) => !validReportRow(row, clientId) || !Number.isFinite(Date.parse(row.generated_at)) ||
      row.reviewed_at !== null && !Number.isFinite(Date.parse(row.reviewed_at)) || row.publication_revision !== undefined && !validPublication(row))) {
    throw new Error('Não foi possível consultar os PDFs deste cliente.');
  }
  return data;
}

export async function listGestorPortalPdfs(db, clientId, offset) {
  const { data, error } = await db.rpc('gestor_ia_listar_pdfs_portal', { p_offset: offset });
  if (error || !Array.isArray(data) || data.some((row) => !validReportRow(row, clientId) || !Number.isFinite(Date.parse(row.published_at)))) {
    throw new Error('Não foi possível consultar os relatórios do portal.');
  }
  return data;
}

export async function readGestorReportPdf(db, path, signal) {
  const { data, error } = await db.storage.from(GESTOR_PDF_BUCKET).download(path, {}, { cache: 'no-store', signal });
  if (error) throw new Error('Não foi possível abrir este PDF.');
  return checkedPdf(data);
}

export async function reviewGestorReportPdf(db, { path, id }) {
  const { data, error } = await db.rpc('gestor_ia_revisar_pdf', { p_path: path, p_object_id: id });
  if (error || !Number.isFinite(Date.parse(data))) throw new Error('Não foi possível registrar a revisão.');
  return data;
}

export async function setGestorReportPublication(db, { path, id, publication_revision: revision }, publish) {
  const { data, error } = await db.rpc('gestor_ia_alterar_visibilidade_pdf', { p_path: path, p_object_id: id, p_publish: publish, p_revision: revision });
  if (error?.code === '40001') throw Object.assign(new Error('A visibilidade mudou em outra tela. Confira o estado atual.'), { conflict: true });
  if (error || !validPublication(data) || data.publication_revision !== revision + 1 || Boolean(data.published_at) !== publish) {
    throw new Error('Não foi possível confirmar a visibilidade do PDF. Confira o arquivo antes de repetir.');
  }
  return data;
}
