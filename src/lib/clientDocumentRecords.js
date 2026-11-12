export const DOCUMENT_KINDS = { note: 'Documento', meeting: 'Reunião', presentation: 'Apresentação', report: 'Relatório', scope: 'Alinhamento de escopo' };
export function validHttpUrl(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}
export const DOCUMENT_STATES = { draft: 'Rascunho', presented: 'Apresentado', sent: 'Enviado', approved: 'Aprovado' };
export function documentPayload(record) {
  return { title: record.title || 'Sem título', content: record.content || {}, record_meta: record.record_meta || {}, apexia_access: Boolean(record.apexia_access), archived_at: record.archived_at || null };
}
export function documentMatches(record, query, kind, archived = false) {
  return Boolean(record.archived_at) === archived && (kind === 'all' || (record.record_meta?.kind || 'note') === kind) && `${record.title || ''} ${record.record_meta?.date || ''} ${record.record_meta?.folder || ''}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'));
}
