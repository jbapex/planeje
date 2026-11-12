/** Dias que o Planeje mantém arquivos de mídia no servidor (alinhado ao job atendimento-media-purge). */
export const ATENDIMENTO_MEDIA_RETENTION_DAYS = 35;

export function isInboxMediaPurged(row) {
  if (!row) return false;
  if (row.media_purged_at) return true;
  const raw = row.raw_payload;
  return Boolean(raw && typeof raw === 'object' && raw._mediaPurged === true);
}
