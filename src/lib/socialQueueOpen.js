import { futureScheduleAt } from './scheduleSocialComposer.js';
import { driveFileIdFromAttachment, driveFileIdFromUrl } from './googleDriveMedia.js';

/** Ação do clique no cartão das filas A publicar / Agendados / Concluídos. */
export function socialQueueCardAction(task) {
  const publication = task?.publication || null;
  if (!publication) return { type: 'task' };

  if (publication.status === 'published') {
    const url = publication.evidence_url || publication.permalink || null;
    if (url) return { type: 'evidence', url };
    return { type: 'composer', publication };
  }

  return { type: 'composer', publication };
}

export function socialQueueFooterLabel(task) {
  const action = socialQueueCardAction(task);
  if (action.type === 'evidence') return 'Ver comprovante';
  if (action.type === 'composer') return 'Abrir post';
  return 'Abrir tarefa';
}

/** Horário futuro para o compositor; se o agendamento ainda vale, conserva. */
export function futurePublicationSchedule(publication, now = new Date()) {
  const raw = publication?.scheduled_at;
  const date = raw ? new Date(raw) : null;
  if (date && !Number.isNaN(date.getTime()) && date.getTime() > now.getTime() + 60 * 1000) {
    return date;
  }
  return futureScheduleAt(now);
}

export function publicationLooksLikeVideo(publication) {
  const format = String(publication?.format || '').toLowerCase();
  if (format.includes('reel') || format.includes('vídeo') || format.includes('video') || format.includes('story')) {
    return true;
  }
  const mime = String(publication?.mime_type || '').toLowerCase();
  if (mime.startsWith('video/')) return true;
  const url = String(publication?.asset_url || publication?.source_url || '');
  return /\.(mp4|mov|m4v|webm)(\?|$)/i.test(url);
}

export function publicationIgFormat(publication) {
  const format = String(publication?.format || '').toLowerCase();
  if (format.includes('carrossel') || format.includes('carousel')) return 'CAROUSEL';
  if (format.includes('reel')) return 'REELS';
  if (publicationLooksLikeVideo(publication)) return 'REELS';
  return 'IMAGE';
}

/** Arquivo do Drive a partir da publicação (sem anexo carregado). */
export function driveFileFromPublication(publication) {
  if (!publication) return null;
  const id = driveFileIdFromAttachment(publication)
    || driveFileIdFromUrl(publication.asset_url)
    || driveFileIdFromUrl(publication.source_url);
  if (!id) return null;
  return {
    id,
    name: publication.name || 'Arquivo Drive',
    mimeType: publication.mime_type || (publicationLooksLikeVideo(publication) ? 'video/mp4' : 'image/jpeg'),
    thumbnailLink: publication.thumbnail_url || '',
    size: publication.size ?? null,
  };
}

export function composerWhenFromPublication(publication, now = new Date()) {
  const raw = publication?.scheduled_at;
  const date = raw ? new Date(raw) : null;
  const stillFuture = date && !Number.isNaN(date.getTime()) && date.getTime() > now.getTime() + 60 * 1000;
  if (stillFuture || publication?.status === 'scheduled') {
    return {
      whenMode: 'schedule',
      scheduledTime: futurePublicationSchedule(publication, now),
    };
  }
  return { whenMode: 'now', scheduledTime: null };
}
