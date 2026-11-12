/**
 * Envia publicações Instagram na hora marcada.
 * A Graph do Instagram não agenda; o Planeje guarda e este cron dispara.
 * Header: x-social-publish-cron-secret
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { assemblePlanSlice, loadFastStartPlan } from '../meta-ads-api/mp4FastStart.js';
import { mp4RejectedByMeta, putRupload } from '../meta-ads-api/largeMediaUpload.ts';
import { uploadOutcomeAfterProcessingFailure } from '../meta-ads-api/igUploadOutcome.js';

const GRAPH = 'https://graph.facebook.com/v24.0';
const CHUNK = 4 * 1024 * 1024;
const DRIVE_RANGE_MAX = 8 * 1024 * 1024;
const UPLOAD_BUDGET_MS = 35_000;
const LOCK_MS = 4 * 60 * 1000;
const MAX_ATTEMPTS = 120;
const IMAGE_MAX = 8 * 1024 * 1024;
const PREPARE_WINDOW_MS = 23 * 60 * 60 * 1000;
/** Depois do arquivo completo, a Meta não pode ficar “processando” em silêncio. */
const PROCESSING_MAX_MS = 15 * 60 * 1000;

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-social-publish-cron-secret',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function todayLocalIso() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

function digits(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

function asDispatch(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? { ...(raw as Record<string, unknown>) }
    : {};
}

async function getSecret(supabase: ReturnType<typeof createClient>, name: string) {
  const fromEnv = Deno.env.get(name);
  if (fromEnv) return fromEnv;
  const { data, error } = await supabase.rpc('get_encrypted_secret', { p_secret_name: name });
  if (error || !data) return null;
  const value = String(data).trim();
  return value || null;
}

async function metaToken(supabase: ReturnType<typeof createClient>) {
  const token = await getSecret(supabase, 'META_SYSTEM_USER_ACCESS_TOKEN');
  if (!token) throw new Error('Token da Meta ausente');
  return token;
}

async function driveAccessToken(supabase: ReturnType<typeof createClient>, clienteId: string) {
  const clientId = (await getSecret(supabase, 'GOOGLE_DRIVE_CLIENT_ID'))
    || (await getSecret(supabase, 'GOOGLE_ADS_CLIENT_ID'));
  const clientSecret = (await getSecret(supabase, 'GOOGLE_DRIVE_CLIENT_SECRET'))
    || (await getSecret(supabase, 'GOOGLE_ADS_CLIENT_SECRET'));
  if (!clientId || !clientSecret) throw new Error('Google Drive da agência não está configurado');
  const secretName = `GOOGLE_DRIVE_CLIENT_${String(clienteId).replace(/-/g, '_')}`;
  const refresh = await getSecret(supabase, secretName);
  if (!refresh) throw new Error('Este cliente não tem Google Drive ligado');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refresh,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Falha ao renovar o Drive');
  }
  return String(data.access_token);
}

async function driveFileMeta(accessToken: string, fileId: string) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'Não achei o arquivo no Drive');
  return data as { id: string; name?: string; mimeType?: string; size?: string };
}

async function driveRange(accessToken: string, fileId: string, offset: number, length: number) {
  const size = Math.min(Math.max(1, length), DRIVE_RANGE_MAX);
  const end = offset + size - 1;
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Range: `bytes=${offset}-${end}`,
      },
    },
  );
  if (!res.ok && res.status !== 206) {
    const text = await res.text();
    throw new Error(text.slice(0, 180) || 'Falha ao ler o Drive');
  }
  return new Uint8Array(await res.arrayBuffer());
}

async function graphJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const parsed = await res.json().catch(() => ({}));
  if (!res.ok || parsed?.error) {
    throw new Error(parsed?.error?.message || `A Meta recusou (${res.status})`);
  }
  return parsed;
}

function metaStatusMessage(detail: unknown, fallback: string) {
  const text = String(detail || '').trim();
  if (!text) return fallback;
  if (/expired/i.test(text)) {
    return 'O arquivo preparado na Meta expirou. Abra o post e envie de novo.';
  }
  if (/error|failed|recus/i.test(text)) {
    return text.length > 220 ? `${text.slice(0, 220)}…` : text;
  }
  if (/in progress|still being processed/i.test(text)) {
    return 'A Meta não terminou de processar o vídeo a tempo. Abra o post e envie de novo, ou escolha outra capa.';
  }
  return text.length > 220 ? `${text.slice(0, 220)}…` : text;
}

function markProcessingSince(dispatch: Record<string, unknown>) {
  if (!dispatch.processing_since) {
    dispatch.processing_since = new Date().toISOString();
  }
}

function isProcessingStale(dispatch: Record<string, unknown>) {
  const since = Date.parse(String(dispatch.processing_since || ''));
  if (!Number.isFinite(since)) return false;
  return Date.now() - since > PROCESSING_MAX_MS;
}

async function waitContainer(token: string, creationId: string, tries = 4) {
  let detail = '';
  for (let i = 0; i < tries; i += 1) {
    const parsed = await graphJson(
      `${GRAPH}/${encodeURIComponent(creationId)}?fields=status_code,status&access_token=${encodeURIComponent(token)}`,
    );
    const code = String(parsed.status_code || '').toUpperCase()
      || String(parsed.status || '').toUpperCase();
    detail = String(parsed.status || parsed.status_code || '');
    if (code === 'FINISHED' || code === 'PUBLISHED') return { code, detail };
    if (code === 'ERROR' || code === 'EXPIRED' || /EXPIRED/i.test(detail)) {
      throw new Error(metaStatusMessage(detail, 'A Meta recusou o arquivo'));
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return { code: 'IN_PROGRESS', detail: detail || 'IN_PROGRESS' };
}

async function publishContainer(token: string, igUserId: string, creationId: string) {
  const parsed = await graphJson(`${GRAPH}/${igUserId}/media_publish`, {
    method: 'POST',
    body: new URLSearchParams({
      creation_id: creationId,
      access_token: token,
    }),
  });
  const mediaId = String(parsed.id || '');
  let permalink = '';
  if (mediaId) {
    try {
      const perma = await graphJson(
        `${GRAPH}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(token)}`,
      );
      permalink = String(perma.permalink || '');
    } catch {
      permalink = `https://www.instagram.com/`;
    }
  }
  return { mediaId, permalink: permalink || `https://www.instagram.com/` };
}

function isVideoMime(mime: string, format: string) {
  const m = String(mime || '').toLowerCase();
  const f = String(format || '').toLowerCase();
  return m.startsWith('video/') || f.includes('reel') || /\.mp4($|\?)/i.test(format);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const cronSecret = Deno.env.get('SOCIAL_PUBLISH_CRON_SECRET') ?? '';
  const supplied = req.headers.get('x-social-publish-cron-secret') ?? '';
  if (!cronSecret || supplied !== cronSecret) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'Missing Supabase env' }, 500);

  const supabase = createClient(supabaseUrl, serviceKey);
  const results: Array<{ id: string; ok: boolean; phase?: string; error?: string }> = [];

  const prepareUntil = new Date(Date.now() + PREPARE_WINDOW_MS).toISOString();
  const { data: dueRows, error: fetchError } = await supabase
    .from('task_channel_publications')
    .select('*, tarefas:task_id (id, client_id, title)')
    .eq('status', 'scheduled')
    .ilike('channel', 'instagram')
    .lte('scheduled_at', prepareUntil)
    .order('scheduled_at', { ascending: true })
    .limit(6);

  if (fetchError) return json({ error: fetchError.message }, 500);

  for (const row of dueRows || []) {
    const dispatch = asDispatch(row.meta_dispatch);
    const dueAt = Date.parse(String(row.scheduled_at || ''));
    const due = Number.isFinite(dueAt) && dueAt <= Date.now();
    const phase = String(dispatch.phase || '');
    const videoRow = /reel/i.test(String(row.format || ''))
      || String(dispatch.igFormat || '').toUpperCase() === 'REELS';
    if (!due && phase === 'ready') {
      results.push({ id: row.id, ok: true, phase: 'ready' });
      continue;
    }
    if (!due && !videoRow) {
      results.push({ id: row.id, ok: true, phase: 'waiting' });
      continue;
    }
    const lockedUntil = dispatch.locked_until ? Date.parse(String(dispatch.locked_until)) : 0;
    if (lockedUntil && lockedUntil > Date.now()) {
      results.push({ id: row.id, ok: true, phase: 'locked' });
      continue;
    }
    const attempts = Number(dispatch.attempts || 0) + 1;
    if (attempts > MAX_ATTEMPTS) {
      await failRow(supabase, row.id, dispatch, 'Passou do limite de tentativas. Abra a tarefa e envie de novo.');
      results.push({ id: row.id, ok: false, error: 'max attempts' });
      continue;
    }
    dispatch.attempts = attempts;
    dispatch.locked_until = new Date(Date.now() + LOCK_MS).toISOString();
    dispatch.hold = true;
    const { error: lockError } = await supabase
      .from('task_channel_publications')
      .update({ meta_dispatch: dispatch })
      .eq('id', row.id);
    if (lockError) {
      results.push({ id: row.id, ok: false, error: lockError.message });
      continue;
    }

    try {
      const outcome = await processRow(supabase, supabaseUrl, serviceKey, row, dispatch, due);
      results.push({ id: row.id, ok: true, phase: outcome });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await failRow(supabase, row.id, dispatch, message);
      results.push({ id: row.id, ok: false, error: message.slice(0, 220) });
    }
  }

  return json({ ok: true, count: results.length, results });
});

async function failRow(
  supabase: ReturnType<typeof createClient>,
  id: string,
  dispatch: Record<string, unknown>,
  message: string,
) {
  await supabase
    .from('task_channel_publications')
    .update({
      status: 'failed',
      notes: message.slice(0, 500),
      meta_dispatch: {
        ...dispatch,
        phase: 'failed',
        last_error: message.slice(0, 400),
        locked_until: null,
      },
    })
    .eq('id', id);
}

async function saveDispatch(
  supabase: ReturnType<typeof createClient>,
  id: string,
  dispatch: Record<string, unknown>,
) {
  const { error } = await supabase
    .from('task_channel_publications')
    .update({
      meta_dispatch: {
        ...dispatch,
        locked_until: null,
      },
    })
    .eq('id', id);
  if (error) throw error;
}

async function markPublished(
  supabase: ReturnType<typeof createClient>,
  id: string,
  dispatch: Record<string, unknown>,
  mediaId: string,
  permalink: string,
) {
  const { error } = await supabase
    .from('task_channel_publications')
    .update({
      status: 'published',
      published_on: todayLocalIso(),
      evidence_url: permalink,
      meta_post_id: mediaId,
      meta_dispatch: {
        ...dispatch,
        phase: 'done',
        locked_until: null,
        last_error: null,
      },
    })
    .eq('id', id);
  if (error) throw error;
}

async function resolveIgAccount(
  supabase: ReturnType<typeof createClient>,
  row: Record<string, unknown>,
  dispatch: Record<string, unknown>,
  clienteId: string,
) {
  const stored = digits(dispatch.instagramAccountId);
  if (stored) return stored;
  const { data } = await supabase
    .from('cliente_social_accounts')
    .select('meta_id, username, display_name')
    .eq('cliente_id', clienteId)
    .eq('platform', 'instagram')
    .eq('is_active', true);
  const dest = String(row.destination || '').trim().toLowerCase().replace(/^@/, '');
  const match = (data || []).find((acc) => {
    const handle = String(acc.username || '').toLowerCase().replace(/^@/, '');
    const name = String(acc.display_name || '').toLowerCase();
    const id = String(acc.meta_id || '');
    return dest && (handle === dest || dest === id || name.includes(dest) || dest.includes(handle));
  });
  return digits((match || data?.[0])?.meta_id);
}

async function resolveDriveFile(
  supabase: ReturnType<typeof createClient>,
  row: Record<string, unknown>,
) {
  const { data } = await supabase
    .from('task_attachments')
    .select('external_file_id, mime_type, size_bytes, url, name')
    .eq('publication_id', row.id)
    .order('created_at', { ascending: false })
    .limit(1);
  const att = data?.[0];
  const fromUrl = String(att?.url || row.asset_url || '').match(/\/d\/([a-zA-Z0-9_-]{8,})/);
  const fileId = String(att?.external_file_id || fromUrl?.[1] || '').trim();
  if (!fileId) throw new Error('Não achei o arquivo do Drive nesta publicação');
  return {
    fileId,
    mime: String(att?.mime_type || ''),
    size: Number(att?.size_bytes || 0),
    name: String(att?.name || 'media'),
  };
}

function isCarouselRow(row: Record<string, unknown>, dispatch: Record<string, unknown>) {
  return String(dispatch.igFormat || '').toUpperCase() === 'CAROUSEL'
    || /carrossel/i.test(String(row.format || ''));
}

function carouselItems(dispatch: Record<string, unknown>) {
  return Array.isArray(dispatch.children) ? dispatch.children as Array<Record<string, unknown>> : [];
}

async function publishScheduledCarousel(
  supabase: ReturnType<typeof createClient>,
  row: Record<string, unknown>,
  dispatch: Record<string, unknown>,
  token: string,
  igUserId: string,
) {
  const children = carouselItems(dispatch);
  if (children.length < 2 || children.length > 10) {
    throw new Error('Carrossel precisa de 2 a 10 slides prontos.');
  }
  const childIds = Array.isArray(dispatch.carousel_child_ids)
    ? (dispatch.carousel_child_ids as unknown[]).map((id) => String(id)).filter(Boolean)
    : [];

  if (dispatch.carousel_pending_id) {
    const pendingId = String(dispatch.carousel_pending_id);
    const status = await waitContainer(token, pendingId, 8);
    if (status.code === 'IN_PROGRESS') {
      dispatch.phase = 'processing';
      markProcessingSince(dispatch);
      await saveDispatch(supabase, String(row.id), dispatch);
      return 'processing';
    }
    if (!childIds.includes(pendingId)) childIds.push(pendingId);
    dispatch.carousel_child_ids = childIds;
    dispatch.carousel_pending_id = null;
    await saveDispatch(supabase, String(row.id), dispatch);
  }

  for (let i = childIds.length; i < children.length; i += 1) {
    const item = children[i] || {};
    const image = String(item.image_url || '').trim();
    const video = String(item.video_url || '').trim();
    if (!/^https?:\/\//i.test(image) && !/^https?:\/\//i.test(video)) {
      throw new Error(`Slide ${i + 1} sem arquivo público.`);
    }
    const params = new URLSearchParams();
    params.set('is_carousel_item', 'true');
    params.set('access_token', token);
    if (/^https?:\/\//i.test(video)) {
      params.set('media_type', 'VIDEO');
      params.set('video_url', video);
    } else {
      params.set('image_url', image);
    }
    const created = await graphJson(`${GRAPH}/${igUserId}/media`, { method: 'POST', body: params });
    const id = String(created.id || '');
    if (!id) throw new Error(`A Meta não criou o slide ${i + 1}`);
    dispatch.carousel_pending_id = id;
    dispatch.phase = 'processing';
    markProcessingSince(dispatch);
    await saveDispatch(supabase, String(row.id), dispatch);
    const status = await waitContainer(token, id, 8);
    if (status.code === 'IN_PROGRESS') {
      await saveDispatch(supabase, String(row.id), dispatch);
      return 'processing';
    }
    childIds.push(id);
    dispatch.carousel_child_ids = childIds;
    dispatch.carousel_pending_id = null;
    await saveDispatch(supabase, String(row.id), dispatch);
  }

  const parentParams = new URLSearchParams();
  parentParams.set('media_type', 'CAROUSEL');
  parentParams.set('children', childIds.join(','));
  parentParams.set('caption', String(row.caption || ''));
  parentParams.set('access_token', token);
  const parent = await graphJson(`${GRAPH}/${igUserId}/media`, { method: 'POST', body: parentParams });
  const creationId = String(parent.id || '');
  if (!creationId) throw new Error('A Meta não criou o carrossel');
  dispatch.creation_id = creationId;
  dispatch.phase = 'processing';
  markProcessingSince(dispatch);
  await saveDispatch(supabase, String(row.id), dispatch);
  const parentStatus = await waitContainer(token, creationId, 8);
  if (parentStatus.code === 'IN_PROGRESS') return 'processing';
  const published = await publishContainer(token, igUserId, creationId);
  await markPublished(supabase, String(row.id), dispatch, published.mediaId, published.permalink);
  return 'published';
}

async function processRow(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceKey: string,
  row: Record<string, unknown>,
  dispatch: Record<string, unknown>,
  due = true,
) {
  const task = row.tarefas as { id?: string; client_id?: string } | null;
  const clienteId = String(task?.client_id || '');
  if (!clienteId) throw new Error('A tarefa precisa ter um cliente');
  const igUserId = await resolveIgAccount(supabase, row, dispatch, clienteId);
  if (!igUserId) throw new Error('Vincule o Instagram deste cliente');
  dispatch.instagramAccountId = igUserId;

  const token = await metaToken(supabase);
  const phase = String(dispatch.phase || 'queued');

  if ((phase === 'processing' || phase === 'ready') && dispatch.creation_id) {
    if (phase === 'ready' && !due) return 'ready';
    markProcessingSince(dispatch);
    const status = await waitContainer(token, String(dispatch.creation_id));
    if (status.code === 'IN_PROGRESS') {
      dispatch.phase = 'processing';
      dispatch.meta_status = status.code;
      dispatch.meta_status_detail = String(status.detail || '').slice(0, 240);
      if (isProcessingStale(dispatch)) {
        throw new Error(metaStatusMessage(status.detail, 'A Meta não terminou de processar o vídeo a tempo.'));
      }
      await saveDispatch(supabase, String(row.id), dispatch);
      return 'processing';
    }
    if (!due) {
      dispatch.phase = 'ready';
      dispatch.meta_status = status.code;
      await saveDispatch(supabase, String(row.id), dispatch);
      return 'ready';
    }
    const published = await publishContainer(token, igUserId, String(dispatch.creation_id));
    await markPublished(supabase, String(row.id), dispatch, published.mediaId, published.permalink);
    return 'published';
  }

  if (isCarouselRow(row, dispatch)) {
    if (!due) return 'waiting';
    return await publishScheduledCarousel(supabase, row, dispatch, token, igUserId);
  }

  const drive = await resolveDriveFile(supabase, row);
  const access = await driveAccessToken(supabase, clienteId);
  const meta = await driveFileMeta(access, drive.fileId);
  const mime = String(meta.mimeType || drive.mime || '');
  const fileSize = Number(meta.size || drive.size || 0);
  const video = isVideoMime(mime, String(row.format || dispatch.igFormat || ''));

  if (!video) {
    if (!fileSize || fileSize > IMAGE_MAX) {
      throw new Error('Imagem no Instagram até 8 MB. Deixe o original no Drive.');
    }
    const bytes = await driveRange(access, drive.fileId, 0, fileSize);
    const safeName = String(meta.name || drive.name || 'image.jpg').replace(/[^\w.\-]+/g, '_').slice(0, 80);
    const storagePath = `meta-publish-temp/${clienteId}/${crypto.randomUUID()}/${safeName}`;
    const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/task-drive/${storagePath}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'Content-Type': mime || 'image/jpeg',
        'x-upsert': 'true',
      },
      body: bytes,
    });
    if (!uploadRes.ok) throw new Error('Falha ao preparar a imagem para a Meta');
    const origin = supabaseUrl.replace(/\/$/, '');
    const publicUrl = `${origin}/storage/v1/object/public/task-drive/${storagePath}`;
    const created = await graphJson(`${GRAPH}/${igUserId}/media`, {
      method: 'POST',
      body: new URLSearchParams({
        image_url: publicUrl,
        caption: String(row.caption || ''),
        access_token: token,
      }),
    });
    const creationId = String(created.id || '');
    if (!creationId) throw new Error('A Meta não criou o container da imagem');
    const status = await waitContainer(token, creationId);
    if (status.code === 'IN_PROGRESS') {
      dispatch.phase = 'processing';
      dispatch.creation_id = creationId;
      markProcessingSince(dispatch);
      if (isProcessingStale(dispatch)) {
        throw new Error(metaStatusMessage(status.detail, 'A Meta não terminou de processar o vídeo a tempo.'));
      }
      await saveDispatch(supabase, String(row.id), dispatch);
      return 'processing';
    }
    const published = await publishContainer(token, igUserId, creationId);
    await markPublished(supabase, String(row.id), dispatch, published.mediaId, published.permalink);
    return 'published';
  }

  if (!fileSize) throw new Error('Não achei o tamanho do vídeo no Drive');
  let plan = await loadFastStartPlan(fileSize, (from, size) => driveRange(access, drive.fileId, from, size));
  let creationId = String(dispatch.creation_id || '');
  let uri = String(dispatch.uri || '');
  let offset = Math.max(0, Number(dispatch.offset || 0));
  if (plan && offset > 0 && !dispatch.faststart) plan = null;
  const uploadSize = plan?.newFileSize || Number(dispatch.file_size || fileSize);

  if (!creationId || !uri) {
    const params = new URLSearchParams();
    params.set('media_type', 'REELS');
    params.set('upload_type', 'resumable');
    params.set('share_to_feed', 'true');
    params.set('caption', String(row.caption || ''));
    params.set('access_token', token);
    const thumb = Number(dispatch.thumbOffsetMs);
    if (Number.isFinite(thumb) && thumb >= 0) params.set('thumb_offset', String(Math.floor(thumb)));
    const created = await graphJson(`${GRAPH}/${igUserId}/media`, { method: 'POST', body: params });
    creationId = String(created.id || '');
    uri = String(created.uri || `https://rupload.facebook.com/ig-api-upload/v24.0/${creationId}`);
    if (!creationId) throw new Error('A Meta não iniciou o envio do Reels');
    offset = 0;
    dispatch.creation_id = creationId;
    dispatch.uri = uri;
    dispatch.file_size = uploadSize;
    dispatch.faststart = Boolean(plan);
    dispatch.phase = 'uploading';
  }

  const budgetStart = Date.now();
  while (offset < uploadSize && Date.now() - budgetStart < UPLOAD_BUDGET_MS) {
    const length = Math.min(CHUNK, uploadSize - offset, DRIVE_RANGE_MAX);
    const bytes = plan
      ? await assemblePlanSlice(plan, offset, length, (from, size) => driveRange(access, drive.fileId, from, size))
      : await driveRange(access, drive.fileId, offset, length);
    if (offset === 0) {
      const reject = mp4RejectedByMeta(bytes);
      if (reject) throw new Error(reject);
    }
    const result = await putRupload(uri, token, bytes, offset, uploadSize);
    if (result.processing_failed) {
      const peek = await fetch(
        `${GRAPH}/${encodeURIComponent(creationId)}?fields=status_code,status&access_token=${encodeURIComponent(token)}`
      ).then((res) => res.json()).catch(() => ({}));
      const outcome = uploadOutcomeAfterProcessingFailure({
        chunkEnd: offset + bytes.byteLength,
        fileSize: uploadSize,
        statusCode: String(peek?.status_code || ''),
      });
      if (outcome === 'fail') {
        const detail = String(peek?.status || '');
        throw new Error(detail && !/processing failed/i.test(detail) ? detail : String(result.message || 'A Meta recusou o vídeo.'));
      }
      dispatch.offset = uploadSize;
      dispatch.phase = outcome === 'ready' && !due ? 'ready' : 'processing';
      if (dispatch.phase === 'processing') markProcessingSince(dispatch);
      await saveDispatch(supabase, String(row.id), dispatch);
      if (outcome === 'ready' && due) {
        const published = await publishContainer(token, igUserId, creationId);
        await markPublished(supabase, String(row.id), dispatch, published.mediaId, published.permalink);
        return 'published';
      }
      return dispatch.phase === 'ready' ? 'ready' : 'processing';
    }
    offset = Number(result.next_offset || offset + bytes.byteLength);
    dispatch.offset = offset;
    dispatch.phase = 'uploading';
    await saveDispatch(supabase, String(row.id), dispatch);
  }

  if (offset < uploadSize) {
    await saveDispatch(supabase, String(row.id), dispatch);
    return 'uploading';
  }

  dispatch.phase = 'processing';
  markProcessingSince(dispatch);
  await saveDispatch(supabase, String(row.id), dispatch);
  return 'processing';
}
