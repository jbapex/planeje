import { buildDriveAttachmentPayload, driveViewUrl, insertTaskDriveAttachment } from './googleDriveMedia.js';
import { combineScheduledDateTime } from './taskChannelPublications.js';

export function composerTaskType(igFormat, isIg) {
  if (!isIg) return 'post';
  if (igFormat === 'REELS') return 'reels';
  return 'post';
}

export function composerPublicationFormat(igFormat) {
  if (igFormat === 'REELS') return 'Reels';
  if (igFormat === 'CAROUSEL') return 'Carrossel';
  return 'Post';
}

export function composerChannelName(isIg) {
  return isIg ? 'Instagram' : 'Facebook';
}

export function scheduledDayParts(scheduledAt) {
  const date = scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return combineScheduledDateTime(`${y}-${m}-${d}`, `${hh}:${mm}`);
}

export function carouselChildrenFromSlides(slides) {
  const list = Array.isArray(slides) ? slides : [];
  if (list.length < 2 || list.length > 10) return null;
  const children = [];
  for (const slide of list) {
    const url = String(slide?.publicUrl || '').trim();
    if (!/^https?:\/\//i.test(url)) return null;
    if (slide?.kind === 'video') children.push({ video_url: url });
    else children.push({ image_url: url });
  }
  return children;
}

export function composeDispatchPayload({
  coverMode = 'auto',
  thumbOffsetMs = 0,
  coverDriveFileId = null,
  igFormat = 'IMAGE',
  instagramAccountId = null,
  pageId = null,
  children = null,
} = {}) {
  const payload = {
    hold: true,
    coverMode,
    thumbOffsetMs: Math.max(0, Math.round(Number(thumbOffsetMs) || 0)),
    coverDriveFileId: coverDriveFileId || null,
    igFormat,
    instagramAccountId: instagramAccountId || null,
    pageId: pageId || null,
  };
  if (Array.isArray(children) && children.length) payload.children = children;
  return payload;
}

/** Tira sessão de upload falha (creation_id/offset) e guarda capa/conta. */
export function resetDispatchForRetry(raw) {
  const prev = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return composeDispatchPayload({
    coverMode: prev.coverMode,
    thumbOffsetMs: prev.thumbOffsetMs,
    coverDriveFileId: prev.coverDriveFileId,
    igFormat: prev.igFormat,
    instagramAccountId: prev.instagramAccountId,
    pageId: prev.pageId,
    children: prev.children,
  });
}

export function localDateTimeInputValue(date) {
  const next = futureScheduleAt(date instanceof Date ? date : new Date());
  const pad = (n) => String(n).padStart(2, '0');
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}T${pad(next.getHours())}:${pad(next.getMinutes())}`;
}

export function parseLocalDateTimeInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function combineLocalDateAndTime(dateValue, timeValue) {
  const day = String(dateValue || '').trim();
  const clock = String(timeValue || '').trim().slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(clock)) return '';
  return `${day}T${clock}`;
}

export function scheduleRequiresDrive(media) {
  return Boolean(media?.driveFileId);
}

/** Tarefa nova não pode nascer em Agendado: o banco pede anexo de produção nesse status. */
export function composerTaskStatus() {
  return 'todo';
}

export function futureScheduleAt(base) {
  const next = base instanceof Date ? new Date(base.getTime()) : new Date();
  if (Number.isNaN(next.getTime())) {
    const fallback = new Date();
    fallback.setHours(fallback.getHours() + 1, 0, 0, 0);
    return fallback;
  }
  if (next.getTime() <= Date.now() + 60 * 1000) {
    const bumped = new Date(Date.now() + 60 * 60 * 1000);
    const minutes = bumped.getMinutes();
    bumped.setMinutes(minutes + ((15 - (minutes % 15)) % 15), 0, 0);
    return bumped;
  }
  return next;
}

export function describeScheduleSaveError(err) {
  const raw = String(err?.message || err || '').trim();
  if (/Anexe o conteúdo produzido/i.test(raw)) {
    return 'Não deu para guardar o agendamento. Recarregue e tente de novo.';
  }
  if (/responsável interno ativo/i.test(raw)) {
    return 'Seu usuário precisa estar ativo na equipe para agendar.';
  }
  if (/hora já passou/i.test(raw)) {
    return 'A hora já passou. Escolha um horário futuro.';
  }
  return raw || 'Não deu para agendar.';
}

export async function resolveAgendadoStatus(client) {
  const { data, error } = await client.from('task_statuses').select('value, label');
  if (error) throw error;
  const rows = data || [];
  const byLabel = rows.find((row) => String(row.label || '').trim().toLowerCase() === 'agendado');
  if (byLabel?.value) return byLabel.value;
  const byValue = rows.find((row) => /scheduled/i.test(String(row.value || '')));
  return byValue?.value || 'scheduled';
}

export function scheduledTaskPayload({
  title,
  caption,
  type,
  clientId,
  userId,
  scheduledAt,
  channel,
  statusValue,
}) {
  const when = scheduledDayParts(scheduledAt);
  if (!when?.scheduled_for) throw new Error('Escolha data e hora');
  const captionText = String(caption || '').trim();
  return {
    title: String(title || captionText || 'Post').trim().slice(0, 120) || 'Post',
    description: captionText,
    status: statusValue,
    type,
    client_id: clientId,
    owner_id: userId,
    assignee_ids: userId ? [userId] : [],
    due_date: when.scheduled_for,
    post_date: when.scheduled_for,
    planned_channels: [channel],
    briefing_completo: false,
    status_history: [
      {
        status: statusValue,
        user_id: userId,
        assignee_ids: userId ? [userId] : [],
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

export async function saveScheduledComposerPublication(client, {
  userId,
  clientId,
  isIg,
  igFormat,
  destination,
  caption,
  scheduledAt,
  media,
  slides = null,
  cover = null,
  instagramAccountId = null,
  pageId = null,
} = {}) {
  if (!userId) throw new Error('Entre de novo para agendar');
  if (!clientId) throw new Error('Escolha o cliente');
  if (!destination) throw new Error('Escolha a conta');
  const carouselChildren = igFormat === 'CAROUSEL' ? carouselChildrenFromSlides(slides) : null;
  if (igFormat === 'CAROUSEL') {
    if (!carouselChildren) {
      throw new Error('O carrossel precisa de 2 a 10 slides prontos para agendar.');
    }
  } else if (!scheduleRequiresDrive(media)) {
    throw new Error('Para agendar, escolha o arquivo no Drive. Ele precisa continuar lá até a hora.');
  }
  const when = scheduledDayParts(scheduledAt);
  if (!when?.scheduled_for) throw new Error('Escolha data e hora');
  if (when.scheduled_at && new Date(when.scheduled_at).getTime() <= Date.now() + 60 * 1000) {
    throw new Error('A hora já passou. Escolha um horário futuro.');
  }

  const channel = composerChannelName(isIg);
  const statusValue = composerTaskStatus();
  const taskPayload = scheduledTaskPayload({
    title: caption || `${composerPublicationFormat(igFormat)} ${destination}`,
    caption,
    type: composerTaskType(igFormat, isIg),
    clientId,
    userId,
    scheduledAt,
    channel,
    statusValue,
  });
  const { data: task, error: taskError } = await client.from('tarefas').insert(taskPayload).select('id').single();
  if (taskError) throw taskError;

  try {
  const dispatch = composeDispatchPayload({
    coverMode: cover?.coverMode,
    thumbOffsetMs: cover?.thumbOffsetMs,
    coverDriveFileId: cover?.driveFileId,
    igFormat,
    instagramAccountId,
    pageId,
    children: carouselChildren,
  });
  const publicationPayload = {
    task_id: task.id,
    channel,
    destination,
    format: composerPublicationFormat(igFormat),
    assignee_id: userId,
    scheduled_for: when.scheduled_for,
    scheduled_at: when.scheduled_at,
    status: 'scheduled',
    caption: String(caption || '').trim() || null,
    asset_url: media?.driveFileId ? driveViewUrl(media.driveFileId) : (media?.publicUrl || carouselChildren?.[0]?.image_url || carouselChildren?.[0]?.video_url || null),
    created_by: userId,
    meta_dispatch: dispatch,
  };

  let publication;
  let pubError;
  ({ data: publication, error: pubError } = await client
    .from('task_channel_publications')
    .insert(publicationPayload)
    .select('*')
    .single());
  if (pubError && (String(pubError.message || '').includes('meta_dispatch') || pubError.code === 'PGRST204')) {
    const without = { ...publicationPayload };
    delete without.meta_dispatch;
    ({ data: publication, error: pubError } = await client
      .from('task_channel_publications')
      .insert(without)
      .select('*')
      .single());
  }
  if (pubError) throw pubError;

  if (media?.driveFileId) {
    await insertTaskDriveAttachment(client, buildDriveAttachmentPayload({
      taskId: task.id,
      publicationId: publication.id,
      file: {
        id: media.driveFileId,
        name: media.name || 'Arquivo Drive',
        mimeType: media.mimeType || (media.kind === 'video' ? 'video/mp4' : 'image/jpeg'),
        size: media.size,
      },
      sync: {
        driveUrl: driveViewUrl(media.driveFileId),
        mimeType: media.mimeType,
        size: media.size,
      },
    }));
  }

  return { task, publication, when };
  } catch (err) {
    try {
      await client.from('tarefas').delete().eq('id', task.id);
    } catch {
      /* a tarefa órfã some na exclusão da publicação em cascata */
    }
    throw err;
  }
}

/** Atualiza a publicação que já existe na tarefa. Não cria outra tarefa. */
export async function updateScheduledTaskPublication(client, {
  publicationId,
  userId,
  isIg,
  igFormat,
  destination,
  caption,
  scheduledAt,
  media,
  slides = null,
  cover = null,
  instagramAccountId = null,
  pageId = null,
} = {}) {
  if (!publicationId) throw new Error('Publicação inválida');
  if (!userId) throw new Error('Entre de novo para agendar');
  if (!destination) throw new Error('Escolha a conta');
  const carouselChildren = igFormat === 'CAROUSEL' ? carouselChildrenFromSlides(slides) : null;
  if (igFormat === 'CAROUSEL') {
    if (!carouselChildren) {
      throw new Error('O carrossel precisa de 2 a 10 slides prontos para agendar.');
    }
  } else if (!scheduleRequiresDrive(media)) {
    throw new Error('Para agendar, escolha o arquivo no Drive. Ele precisa continuar lá até a hora.');
  }
  const when = scheduledDayParts(scheduledAt);
  if (!when?.scheduled_for) throw new Error('Escolha data e hora');
  if (when.scheduled_at && new Date(when.scheduled_at).getTime() <= Date.now() + 60 * 1000) {
    throw new Error('A hora já passou. Escolha um horário futuro.');
  }
  const { data: existing, error: existingError } = await client
    .from('task_channel_publications')
    .select('id, task_id')
    .eq('id', publicationId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing?.task_id) throw new Error('Não achei a publicação nesta tarefa');

  const dispatch = composeDispatchPayload({
    coverMode: cover?.coverMode,
    thumbOffsetMs: cover?.thumbOffsetMs,
    coverDriveFileId: cover?.driveFileId,
    igFormat,
    instagramAccountId,
    pageId,
    children: carouselChildren,
  });
  const patch = {
    channel: composerChannelName(isIg),
    destination,
    format: composerPublicationFormat(igFormat),
    assignee_id: userId,
    scheduled_for: when.scheduled_for,
    scheduled_at: when.scheduled_at,
    status: 'scheduled',
    caption: String(caption || '').trim() || null,
    asset_url: media?.driveFileId ? driveViewUrl(media.driveFileId) : (media?.publicUrl || carouselChildren?.[0]?.image_url || carouselChildren?.[0]?.video_url || null),
    meta_dispatch: dispatch,
    notes: null,
  };
  let publication;
  let pubError;
  ({ data: publication, error: pubError } = await client
    .from('task_channel_publications')
    .update(patch)
    .eq('id', publicationId)
    .select('*')
    .single());
  if (pubError && (String(pubError.message || '').includes('meta_dispatch') || pubError.code === 'PGRST204')) {
    const without = { ...patch };
    delete without.meta_dispatch;
    ({ data: publication, error: pubError } = await client
      .from('task_channel_publications')
      .update(without)
      .eq('id', publicationId)
      .select('*')
      .single());
  }
  if (pubError) throw pubError;

  if (!media?.driveFileId) return { publication, when };

  const { data: prior } = await client
    .from('task_attachments')
    .select('id')
    .eq('task_id', existing.task_id)
    .eq('external_file_id', media.driveFileId)
    .maybeSingle();
  if (prior?.id) {
    await client.from('task_attachments').update({ publication_id: publicationId }).eq('id', prior.id);
  } else {
    await insertTaskDriveAttachment(client, buildDriveAttachmentPayload({
      taskId: existing.task_id,
      publicationId,
      file: {
        id: media.driveFileId,
        name: media.name || 'Arquivo Drive',
        mimeType: media.mimeType || (media.kind === 'video' ? 'video/mp4' : 'image/jpeg'),
        size: media.size,
      },
      sync: {
        driveUrl: driveViewUrl(media.driveFileId),
        mimeType: media.mimeType,
        size: media.size,
      },
    }));
  }

  return { publication, when };
}
