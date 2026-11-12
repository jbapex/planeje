import { displaySocialAccount, platformForChannel } from './clienteSocialAccounts.js';
import {
  attachmentLooksLikeVideo,
  driveFileIdFromAttachment,
  driveFileIdFromUrl,
  driveOpenUrl,
  driveViewUrl,
  isDriveImage,
  isPlayableImageUrl,
} from './googleDriveMedia.js';

export const CONTENT_TASK_TYPES = ['arte', 'carrossel', 'video', 'reels', 'post', 'story', 'social_media'];

export const META_STAGE_MAX_BYTES = 40 * 1024 * 1024;
export const META_IMAGE_SEND_MAX_BYTES = 8 * 1024 * 1024;
export const META_REELS_SEND_MAX_BYTES = 1024 * 1024 * 1024;
export const SIMPLE_META_CHANNELS = ['Instagram', 'Facebook'];

export const CHANNEL_OPTIONS = [
  'Instagram',
  'Facebook',
  'LinkedIn',
  'TikTok',
  'YouTube',
  'Site',
  'Google Meu Negócio',
  'Outro',
];

export const CHANNEL_PUBLICATION_STATUSES = [
  { value: 'pending', label: 'A publicar', color: '#7C3AED' },
  { value: 'scheduled', label: 'Agendado', color: '#2563EB' },
  { value: 'published', label: 'Publicado', color: '#16A34A' },
  { value: 'client_posts', label: 'Cliente publica', color: '#0F766E' },
  { value: 'failed', label: 'Falhou', color: '#DC2626' },
  { value: 'cancelled', label: 'Cancelado', color: '#6B7280' },
];

export const DONE_PUBLICATION_STATUSES = ['published', 'cancelled', 'client_posts'];

export const SOCIAL_PUBLICATION_STATUS_OPTIONS = CHANNEL_PUBLICATION_STATUSES.map((status) => ({
  ...status,
  value: `publication_${status.value}`,
}));

export function isContentTaskType(type) {
  return CONTENT_TASK_TYPES.includes(String(type || '').toLowerCase());
}

export function todayLocalIso(now = new Date()) {
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function createEmptyPublication(taskId, assigneeId = '') {
  return {
    task_id: taskId,
    channel: '',
    destination: '',
    format: '',
    assignee_id: assigneeId,
    scheduled_for: '',
    status: 'pending',
    published_on: '',
    evidence_url: '',
    caption: '',
    asset_url: '',
    notes: '',
    material_version: 1,
    meta_post_id: '',
  };
}

function optionalText(value) {
  const text = String(value || '').trim();
  return text || null;
}

export function buildPublicationPayload(form, taskId) {
  return {
    task_id: taskId,
    channel: String(form.channel || '').trim(),
    destination: String(form.destination || '').trim(),
    format: optionalText(form.format),
    assignee_id: form.assignee_id || null,
    scheduled_for: form.scheduled_for || datePartFromDateTime(form.scheduled_at) || null,
    scheduled_at: toScheduledAtIso(form.scheduled_at, form.scheduled_for),
    status: form.status || 'pending',
    published_on: form.published_on || null,
    evidence_url: optionalText(form.evidence_url),
    caption: optionalText(form.caption),
    asset_url: optionalText(form.asset_url),
    notes: optionalText(form.notes),
    material_version: Math.max(1, Number.parseInt(form.material_version, 10) || 1),
    meta_post_id: optionalText(form.meta_post_id),
  };
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Marca o canal como publicado sem enviar para a Meta. Exige o link http(s). */
export function manualPublishedFields(publication, now = new Date()) {
  const url = String(publication?.evidence_url || '').trim();
  if (!isHttpUrl(url)) {
    return { ok: false, error: 'Cole o link da publicação, começando com http:// ou https://.' };
  }
  const day = String(publication?.published_on || publication?.scheduled_for || '').slice(0, 10);
  const published_on = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : todayLocalIso(now);
  return { ok: true, patch: { status: 'published', published_on, evidence_url: url } };
}

export function validatePublication(payload) {
  const errors = [];
  if (!payload.channel) errors.push('Escolha o canal.');
  if (!payload.destination) errors.push('Informe o perfil, página ou destino.');
  if (!payload.assignee_id) errors.push('Escolha o responsável pela postagem.');
  if (!payload.scheduled_for) errors.push('Escolha a data e o horário da postagem.');
  if (!CHANNEL_PUBLICATION_STATUSES.some((status) => status.value === payload.status)) {
    errors.push('Escolha um status válido.');
  }
  if (payload.status === 'published') {
    if (!payload.published_on) errors.push('Informe a data em que foi publicado.');
    if (!payload.evidence_url) errors.push('Cole o link de comprovação da publicação.');
    else if (!isHttpUrl(payload.evidence_url)) errors.push('O link de comprovação precisa começar com http:// ou https://.');
  }
  if (payload.asset_url && !isHttpUrl(payload.asset_url)) {
    errors.push('O link do material precisa começar com http:// ou https://.');
  }
  return errors;
}

export function getPublicationProgress(publications) {
  const active = (publications || []).filter((item) => item.status !== 'cancelled');
  const published = active.filter((item) => item.status === 'published' || item.status === 'client_posts').length;
  return { published, total: active.length, complete: active.length > 0 && published === active.length };
}

export function getBlockingPublications(publications) {
  return (publications || []).filter((item) => !DONE_PUBLICATION_STATUSES.includes(item.status));
}

/** Marca o canal como postagem do cliente. Sem link e sem envio à Meta. */
export function clientPostsFields(publication, now = new Date()) {
  const day = String(publication?.published_on || publication?.scheduled_for || '').slice(0, 10);
  const published_on = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : todayLocalIso(now);
  return { ok: true, patch: { status: 'client_posts', published_on } };
}

/** Conteúdo só sai de Tarefas para Redes Sociais (Concluídos) com canal publicado e link, ou postagem do cliente. */
export function contentSocialArchiveBlockers(publications, options = {}) {
  if (options.clientPosts) return [];
  const rows = Array.isArray(publications) ? publications : [];
  if (!rows.length) {
    return ['Cadastre as publicações por canal e cole o link de cada uma publicada. Se o cliente posta, marque Cliente publica.'];
  }
  const blockers = [];
  for (const item of getBlockingPublications(rows)) {
    const name = String(item.channel || '').trim() || 'Um canal';
    blockers.push(`${name} ainda precisa ser publicado, cancelado ou marcado como Cliente publica.`);
  }
  const settled = rows.filter((item) => item.status === 'published' || item.status === 'client_posts');
  if (!settled.length) blockers.push('Nenhum canal está publicado.');
  for (const item of rows.filter((row) => row.status === 'published')) {
    const url = String(item.evidence_url || '').trim();
    const name = String(item.channel || '').trim() || 'Um canal';
    if (!url || !isHttpUrl(url)) blockers.push(`${name} está sem o link da publicação.`);
  }
  return blockers;
}

export async function checkTaskPublicationCompletion(client, taskId, nextStatus) {
  if (!taskId || nextStatus !== 'published') return { hasPublications: false, blocking: [] };
  const { data, error } = await client
    .from('task_channel_publications')
    .select('id, status, channel, destination')
    .eq('task_id', taskId);
  if (error) throw error;
  return { hasPublications: (data || []).length > 0, blocking: getBlockingPublications(data || []) };
}

export function firstAssigneeId(task, users = []) {
  const ids = Array.isArray(task?.assignee_ids) ? task.assignee_ids.filter(Boolean) : [];
  if (ids[0]) return ids[0];
  return users[0]?.id || '';
}

export function defaultPublicationDate(task, now = new Date()) {
  const fromTask = String(task?.post_date || task?.due_date || '').slice(0, 10);
  return fromTask || todayLocalIso(now);
}

/** Perfil vazio não trava. O canal ocupa o lugar só para o registro. */
export function fallbackPublicationDestination(value, channel) {
  const text = String(value || '').trim();
  return text || String(channel || '').trim();
}

export function defaultPublicationTime() {
  return '10:00';
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

export function localDateTimeValue(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function datePartFromDateTime(value) {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return localDateTimeValue(parsed).slice(0, 10);
}

export function timePartFromDateTime(value, fallback = defaultPublicationTime()) {
  const raw = String(value || '').trim();
  const localMatch = raw.match(/T(\d{2}:\d{2})/);
  if (localMatch) return localMatch[1];
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return localDateTimeValue(parsed).slice(11, 16);
}

export function combineScheduledDateTime(dateIso, timeHm = defaultPublicationTime()) {
  const date = String(dateIso || '').slice(0, 10);
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(timeHm || '')) ? timeHm : defaultPublicationTime();
  if (!date) return { scheduled_for: null, scheduled_at: null, local: '' };
  const local = `${date}T${time}`;
  return {
    scheduled_for: date,
    scheduled_at: new Date(`${local}:00`).toISOString(),
    local,
  };
}

export function toScheduledAtIso(scheduledAt, scheduledFor) {
  if (scheduledAt) {
    const parsed = new Date(scheduledAt);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    const fromLocal = combineScheduledDateTime(datePartFromDateTime(scheduledAt), timePartFromDateTime(scheduledAt));
    if (fromLocal.scheduled_at) return fromLocal.scheduled_at;
  }
  const date = datePartFromDateTime(scheduledFor);
  return date ? combineScheduledDateTime(date).scheduled_at : null;
}

export function splitScheduledDateTime(publication, fallbackTime = defaultPublicationTime()) {
  const at = publication?.scheduled_at;
  if (at) {
    const parsed = new Date(at);
    if (!Number.isNaN(parsed.getTime())) {
      const local = localDateTimeValue(parsed);
      return { date: local.slice(0, 10), time: local.slice(11, 16), local };
    }
  }
  const date = datePartFromDateTime(publication?.scheduled_for || publication?.scheduled_at);
  return {
    date,
    time: fallbackTime,
    local: date ? `${date}T${fallbackTime}` : '',
  };
}

export function displayPublicationWhen(publication) {
  const { local, date } = splitScheduledDateTime(publication);
  if (!local && !date) return 'Sem data';
  const parsed = new Date(local || `${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return date ? new Date(`${date}T00:00:00`).toLocaleDateString('pt-BR') : 'Sem data';
  }
  return parsed.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function activePublications(publications = []) {
  return (publications || []).filter((item) => item.status !== 'cancelled');
}

export function destinationForChannel(channel, accounts = []) {
  const platform = platformForChannel(channel);
  if (!platform) return '';
  const match = (accounts || []).find((row) => row.platform === platform);
  return displaySocialAccount(match);
}

export function linkedMetaChannels(accounts = []) {
  const list = [];
  if ((accounts || []).some((row) => row.platform === 'instagram')) list.push('Instagram');
  if ((accounts || []).some((row) => row.platform === 'facebook_page')) list.push('Facebook');
  return list;
}

export function defaultMetaChannels({ plannedChannels = [], accounts = [] } = {}) {
  const linked = linkedMetaChannels(accounts);
  const planned = (plannedChannels || []).filter((channel) => linked.includes(channel));
  return planned.length ? planned : linked;
}

export function defaultPublicationChannels({ plannedChannels = [], accounts = [] } = {}) {
  const planned = [...new Set((plannedChannels || []).filter((channel) => CHANNEL_OPTIONS.includes(channel)))];
  if (planned.length) return planned;
  return defaultMetaChannels({ plannedChannels, accounts });
}

export function remainingPublicationChannels({
  plannedChannels = [],
  accounts = [],
  publications = [],
} = {}) {
  const taken = new Set(activePublications(publications).map((item) => item.channel));
  return defaultPublicationChannels({ plannedChannels, accounts }).filter((channel) => !taken.has(channel));
}

export function isTaskPublicationMedia(item) {
  if (!item) return false;
  if (item.provider === 'google_drive' && driveFileIdFromAttachment(item)) return true;
  if (attachmentLooksLikeVideo(item) || isDriveImage(item)) return true;
  return isPlayableImageUrl(item.url, item.mime_type);
}

export function preferredTaskMedia(attachments = []) {
  const list = (attachments || []).filter(isTaskPublicationMedia);
  const main = list.filter((item) => !item.publication_id);
  return main.find((item) => item.provider === 'google_drive')
    || main[0]
    || list.find((item) => item.provider === 'google_drive')
    || list[0]
    || null;
}

export function mediaMatchesPublication(item, publication) {
  if (!item || !publication) return false;
  const asset = assetUrlFromTaskMedia(item);
  if (publication.asset_url && asset && publication.asset_url === asset) return true;
  const fileId = driveFileIdFromAttachment(item);
  return Boolean(fileId && driveFileIdFromUrl(publication.asset_url) === fileId);
}

export function mediaForChannel(channel, { attachments = [], publications = [] } = {}) {
  const publication = activePublications(publications).find((item) => item.channel === channel);
  if (!publication) return null;
  const linked = (attachments || []).find((item) => item.publication_id === publication.id && isTaskPublicationMedia(item));
  if (linked) return linked;
  return (attachments || []).find((item) => mediaMatchesPublication(item, publication)) || null;
}

export function assetUrlFromTaskMedia(item) {
  if (!item) return '';
  return driveOpenUrl(item) || String(item.url || '').trim();
}

/**
 * Completa a publicação com o arquivo do Drive já ligado na tarefa
 * (o cartão mostra o anexo; Agendar na Meta precisa desse vínculo).
 */
export function hydratePublicationMedia(publication, media) {
  if (!publication) return publication;
  const fromMedia = assetUrlFromTaskMedia(media);
  const asset = String(publication.asset_url || '').trim() || fromMedia;
  const fileId =
    driveFileIdFromAttachment(media)
    || driveFileIdFromUrl(asset)
    || driveFileIdFromAttachment(publication);
  return {
    ...publication,
    asset_url: asset || (fileId ? driveViewUrl(fileId) : ''),
    name: publication.name || media?.name || null,
    mime_type: publication.mime_type || media?.mime_type || media?.mimeType || null,
    size: publication.size ?? media?.size_bytes ?? media?.size ?? null,
    external_file_id: publication.external_file_id || fileId || null,
    source_url: publication.source_url || media?.source_url || media?.url || asset || null,
  };
}

export function attachmentExceedsMetaStage(item, max = META_STAGE_MAX_BYTES) {
  const size = Number(item?.size_bytes ?? item?.size ?? 0);
  return Number.isFinite(size) && size > max;
}

/** Imagem acima de 8 MB ou vídeo acima de 1 GB não vão à Meta. Vídeo grande usa envio direto. */
export function attachmentBlocksMetaSend(item) {
  if (!item) return false;
  const size = Number(item.size_bytes ?? item.size ?? 0);
  if (!Number.isFinite(size) || size <= 0) return false;
  if (mediaLooksLikeVideo(item)) return size > META_REELS_SEND_MAX_BYTES;
  return size > META_IMAGE_SEND_MAX_BYTES;
}

export function mediaLooksLikeVideo(item) {
  if (!item) return false;
  if (attachmentLooksLikeVideo(item)) return true;
  const name = `${item.name || ''} ${item.url || ''}`.toLowerCase();
  return /\.(mp4|mov|m4v|webm)(\?|$)/i.test(name);
}

export function metaScheduleAt(dateIso, now = new Date()) {
  const raw = String(dateIso || '').trim();
  let scheduled;
  if (!raw) {
    scheduled = new Date(now.getTime() + 15 * 60 * 1000);
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw) || /(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) {
    scheduled = new Date(raw);
  } else {
    scheduled = new Date(`${raw.slice(0, 10)}T10:00:00`);
  }
  if (Number.isNaN(scheduled.getTime()) || scheduled.getTime() < now.getTime() + 10 * 60 * 1000) {
    return new Date(now.getTime() + 15 * 60 * 1000);
  }
  return scheduled;
}

export function publicationScheduleInstant(publication) {
  return publication?.scheduled_at || splitScheduledDateTime(publication).local || publication?.scheduled_for;
}

export function publicationToSocialTask(publication) {
  const parent = publication.task || {};
  return {
    id: publication.id,
    title: `${publication.channel} · ${parent.title || 'Material'}`,
    due_date: publication.scheduled_for,
    post_date: publication.scheduled_for,
    status: `publication_${publication.status}`,
    client_id: parent.client_id || null,
    project_id: parent.project_id || null,
    clientes: parent.clientes || null,
    projetos: parent.projetos || null,
    assignee_ids: publication.assignee_id ? [publication.assignee_id] : [],
    created_at: publication.created_at,
    isChannelPublication: true,
    publication,
    parentTask: parent,
  };
}
