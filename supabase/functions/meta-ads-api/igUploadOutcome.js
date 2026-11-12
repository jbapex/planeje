/**
 * Quando o último pedaço do Reels volta "ProcessingFailed", a Meta
 * às vezes já aceitou o arquivo. Só falha se o container estiver em erro.
 */
export function uploadOutcomeAfterProcessingFailure({ chunkEnd, fileSize, statusCode } = {}) {
  const code = String(statusCode || '').toUpperCase();
  const end = Number(chunkEnd);
  const size = Number(fileSize);
  if (code === 'FINISHED' || code === 'PUBLISHED') return 'ready';
  if (code === 'IN_PROGRESS' && Number.isFinite(end) && Number.isFinite(size) && size > 0 && end >= size) {
    return 'wait';
  }
  return 'fail';
}
