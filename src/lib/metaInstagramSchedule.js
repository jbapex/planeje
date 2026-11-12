/**
 * A Graph do Instagram não agenda (published=false / scheduled_publish_time).
 * Apps comuns recebem (#3) User must be on whitelist. Página Facebook agenda.
 */

export function metaPlatformSchedulesOnGraph(platform) {
  return platform === 'facebook_page';
}

export function planejeHoldsInstagramSchedule(platform) {
  return platform === 'instagram';
}

export const META_REEL_PROCESS_HINT =
  'A Meta recusou o vídeo. Use MP4 H.264 com áudio AAC, recorte 9:16, até 15 min e 1 GB.';

function extractMetaErrorText(raw) {
  if (raw == null) return '';
  if (typeof raw === 'object') {
    const debug = raw.debug_info || raw.error?.debug_info;
    if (debug?.type || debug?.message) {
      return `${debug.type || ''} ${debug.message || ''}`.trim();
    }
    const typed = `${raw.error?.type || raw.type || ''} ${raw.error?.message || ''}`.trim();
    if (/ProcessingFailed/i.test(typed)) return typed;
    if (raw.error?.message) return extractMetaErrorText(raw.error.message);
    if (raw.message && raw.message !== raw) return extractMetaErrorText(raw.message);
  }
  const text = String(raw?.message || raw || '').trim();
  if (!text) return '';
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      return extractMetaErrorText(JSON.parse(text)) || text;
    } catch {
      return text;
    }
  }
  return text;
}

export function describeMetaPublishError(raw) {
  const message = extractMetaErrorText(raw);
  if (/\(#3\)|must be on whitelist/i.test(message)) {
    return 'O Instagram não agenda por este caminho. O post vai ao ar na hora.';
  }
  if (/ProcessingFailed|Request processing failed/i.test(message)) {
    return META_REEL_PROCESS_HINT;
  }
  return message || 'A Meta recusou a publicação.';
}
