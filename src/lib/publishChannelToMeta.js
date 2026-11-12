import { supabase } from '@/lib/customSupabaseClient';
import {
  displaySocialAccount,
  fetchClienteSocialAccounts,
  platformForChannel,
} from '@/lib/clienteSocialAccounts';
import { driveFileIdFromUrl, publicationNeedsDriveStaging } from '@/lib/googleDriveMedia';
import { detectMediaKind, isStageTooLargeError, stageDriveFileForMeta } from '@/lib/metaPublishMedia';
import { publishLargeFacebookVideo, publishLargeInstagramReel } from '@/lib/metaResumableUpload';
import { describeMetaPublishError, metaPlatformSchedulesOnGraph } from '@/lib/metaInstagramSchedule';
import { futureScheduleAt, resetDispatchForRetry, scheduledDayParts } from '@/lib/scheduleSocialComposer';
import { hydratePublicationMedia, todayLocalIso } from '@/lib/taskChannelPublications';

function isVideoUrl(url) {
  return /\.(mp4|mov|m4v|webm)(\?|$)/i.test(String(url || ''));
}

function isReelFormat(publication) {
  const format = String(publication?.format || '').toLowerCase();
  const channel = String(publication?.channel || '').toLowerCase();
  return format.includes('reel') || (channel === 'instagram' && isVideoUrl(publication?.asset_url));
}

/**
 * Resolve o destino Meta do cliente a partir do canal/destination da publicação.
 */
export async function resolvePublicationMetaTarget(publication, clientId) {
  const platform = platformForChannel(publication?.channel);
  if (!platform) {
    throw new Error('Só Instagram e Facebook podem ser enviados pela Meta neste recorte.');
  }
  if (!clientId) {
    throw new Error('A tarefa precisa ter um cliente para achar a página ou o Instagram.');
  }
  const accounts = await fetchClienteSocialAccounts(supabase, clientId);
  const matching = accounts.filter((row) => row.platform === platform);
  if (!matching.length) {
    throw new Error(
      platform === 'instagram'
        ? 'Vincule o Instagram deste cliente em Clientes → Página e Instagram.'
        : 'Vincule a página do Facebook deste cliente em Clientes → Página e Instagram.'
    );
  }

  const dest = String(publication.destination || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '');
  const byName = matching.find((row) => {
    const handle = String(row.username || '')
      .toLowerCase()
      .replace(/^@/, '');
    const name = String(row.display_name || '').toLowerCase();
    const id = String(row.meta_id || '');
    return (
      (dest && (handle === dest || name.includes(dest) || dest.includes(handle) || dest === id)) ||
      false
    );
  });
  return byName || matching[0];
}

/**
 * URL pública que a Graph consegue baixar. Arquivo do Drive é copiado só na hora do envio.
 */
export async function resolvePublicationPublicAsset(publication, { clientId, media = null } = {}) {
  const hydrated = hydratePublicationMedia(publication, media);
  const url = String(hydrated?.asset_url || hydrated?.source_url || '').trim();
  if (!publicationNeedsDriveStaging(hydrated)) {
    return {
      publicUrl: url,
      kind: detectMediaKind(hydrated?.mime_type || '', url || hydrated?.format || ''),
      staged: false,
    };
  }
  const fileId = driveFileIdFromUrl(url) || driveFileIdFromUrl(hydrated?.source_url) || hydrated?.external_file_id;
  if (!fileId) {
    throw new Error('Não achei o arquivo do Drive neste material.');
  }
  if (!clientId) {
    throw new Error('A tarefa precisa ter um cliente para usar o Drive.');
  }
  try {
    const staged = await stageDriveFileForMeta(clientId, {
      id: fileId,
      name: hydrated?.name,
      mimeType: hydrated?.mime_type,
    });
    return {
      publicUrl: staged.publicUrl,
      kind: staged.kind,
      staged: true,
      storagePath: staged.storagePath,
      driveFileId: fileId,
    };
  } catch (err) {
    const kind = detectMediaKind(hydrated?.mime_type || '', url || hydrated?.format || '');
    if (isStageTooLargeError(err) && kind === 'video') {
      return {
        publicUrl: '',
        kind: 'video',
        staged: false,
        large: true,
        driveFileId: fileId,
      };
    }
    throw err;
  }
}

/**
 * Instagram Graph não agenda. O Planeje guarda e o cron envia em scheduled_at.
 */
export async function holdInstagramPublication(publication, { clientId, scheduledAt = null, media = null } = {}) {
  if (!publication?.id) throw new Error('Publicação inválida.');
  const hydrated = hydratePublicationMedia(publication, media);
  const requested = scheduledAt instanceof Date && !Number.isNaN(scheduledAt.getTime())
    ? scheduledAt
    : (hydrated.scheduled_at ? new Date(hydrated.scheduled_at) : null);
  const when = futureScheduleAt(requested);
  if (!when || Number.isNaN(when.getTime())) {
    throw new Error('Escolha data e hora para o Instagram receber.');
  }
  const fileId = driveFileIdFromUrl(hydrated.asset_url)
    || driveFileIdFromUrl(hydrated.source_url)
    || hydrated.external_file_id
    || media?.driveFileId
    || media?.external_file_id
    || null;
  if (!fileId) {
    throw new Error('Para agendar no Instagram, o arquivo precisa estar no Drive.');
  }
  const target = await resolvePublicationMetaTarget(hydrated, clientId);
  const dispatch = {
    ...resetDispatchForRetry(publication.meta_dispatch),
    igFormat: isReelFormat(hydrated) ? 'REELS' : (publication.meta_dispatch?.igFormat || 'IMAGE'),
    instagramAccountId: target.meta_id,
    hold: true,
    phase: 'queued',
  };
  const parts = scheduledDayParts(when);
  const patch = {
    status: 'scheduled',
    scheduled_at: parts?.scheduled_at || when.toISOString(),
    scheduled_for: parts?.scheduled_for || null,
    destination: displaySocialAccount(target) || hydrated.destination || publication.destination,
    meta_dispatch: dispatch,
    published_on: null,
    notes: null,
  };
  let { data, error } = await supabase
    .from('task_channel_publications')
    .update(patch)
    .eq('id', publication.id)
    .select('*')
    .maybeSingle();
  if (error && (error.code === 'PGRST204' || String(error.message || '').includes('meta_dispatch'))) {
    const without = { ...patch };
    delete without.meta_dispatch;
    ({ data, error } = await supabase
      .from('task_channel_publications')
      .update(without)
      .eq('id', publication.id)
      .select('*')
      .maybeSingle());
  }
  if (error) throw error;
  return {
    publication: data,
    target,
    postId: null,
    permalink: null,
    scheduled: true,
    held: true,
  };
}

/**
 * Envia ou agenda a publicação na Graph e devolve o patch para task_channel_publications.
 * @param {{ publishNow?: boolean, scheduledAt?: Date|null }} options
 */
export async function publishChannelToMeta(publication, { clientId, publishNow = true, scheduledAt = null, media = null } = {}) {
  if (!publication?.id) throw new Error('Publicação inválida.');
  const hydrated = hydratePublicationMedia(publication, media);
  const platform = platformForChannel(hydrated.channel);
  if (!publishNow && platform === 'instagram') {
    return holdInstagramPublication(publication, { clientId, scheduledAt, media });
  }
  const target = await resolvePublicationMetaTarget(hydrated, clientId);
  const caption = hydrated.caption || '';
  const resolved = await resolvePublicationPublicAsset(hydrated, { clientId, media });
  const assetUrl = resolved.publicUrl || '';
  const video = resolved.kind === 'video' || isReelFormat({ ...hydrated, asset_url: assetUrl || hydrated.asset_url });
  const graphSchedules = metaPlatformSchedulesOnGraph(platform);
  const scheduledUnix = !publishNow && scheduledAt && graphSchedules
    ? Math.floor(scheduledAt.getTime() / 1000)
    : null;

  let response;
  if (resolved.large && video) {
    if (platform === 'facebook_page') {
      const data = await publishLargeFacebookVideo({
        pageId: target.meta_id,
        clienteId: clientId,
        driveFileId: resolved.driveFileId,
        fileSize: hydrated.size || publication.size || publication.file_size,
        message: caption,
        scheduledUnix,
      });
      response = { data, error: null };
    } else {
      const data = await publishLargeInstagramReel({
        instagramAccountId: target.meta_id,
        clienteId: clientId,
        driveFileId: resolved.driveFileId,
        fileSize: hydrated.size || publication.size || publication.file_size,
        caption,
        scheduledUnix,
      });
      response = { data, error: null };
    }
  } else if (platform === 'facebook_page') {
    if (!caption && !assetUrl) {
      throw new Error('Informe a legenda ou um link/material na publicação.');
    }
    const body = {
      action: 'publish-page-post',
      page_id: target.meta_id,
      message: caption || undefined,
      link: assetUrl && !video ? assetUrl : undefined,
      file_url: assetUrl && video ? assetUrl : undefined,
    };
    if (!publishNow && scheduledAt) {
      body.scheduled_publish_time = Math.floor(scheduledAt.getTime() / 1000);
    }
    response = await supabase.functions.invoke('meta-ads-api', { body });
  } else {
    if (!assetUrl) {
      throw new Error('Escolha o arquivo do Drive desta tarefa para postar no Instagram.');
    }
    const reels = video || isReelFormat(hydrated);
    const body = {
      action: 'publish-instagram-content',
      instagram_account_id: target.meta_id,
      caption,
      media_type: reels ? 'REELS' : 'IMAGE',
    };
    if (reels) body.video_url = assetUrl;
    else body.image_url = assetUrl;
    response = await supabase.functions.invoke('meta-ads-api', { body });
  }

  if (response.error) throw new Error(describeMetaPublishError(response.error));
  if (response.data?.error) {
    throw new Error(describeMetaPublishError(response.data.error.message || 'A Meta recusou a publicação.'));
  }

  const scheduled = Boolean(response.data?.scheduled) || Boolean(scheduledUnix);
  const postId = response.data?.post_id || response.data?.media_id || null;
  const permalink = response.data?.permalink || null;

  const patch = {
    meta_post_id: postId,
    destination: hydrated.destination || publication.destination || displaySocialAccount(target),
    status: scheduled ? 'scheduled' : 'published',
    published_on: scheduled ? null : todayLocalIso(),
    evidence_url: permalink || publication.evidence_url || null,
    asset_url: hydrated.asset_url || publication.asset_url || null,
  };

  const { data, error } = await supabase
    .from('task_channel_publications')
    .update(patch)
    .eq('id', publication.id)
    .select('*')
    .maybeSingle();
  if (error) throw error;

  return {
    publication: data,
    target,
    postId,
    permalink,
    scheduled,
  };
}
