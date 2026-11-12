/**
 * Remove mídia antiga (imagem, áudio, PDF, vídeo) do banco após retenção configurável.
 * Mantém metadados da mensagem; arquivos permanecem no celular/WhatsApp.
 *
 * Arquivo único (sem _shared/) para deploy pelo painel Supabase ou CLI.
 *
 * Secrets:
 *   ATENDIMENTO_MEDIA_PURGE_CRON_SECRET — header x-atendimento-media-purge-secret
 *   ATENDIMENTO_MEDIA_RETENTION_DAYS — padrão 35
 *
 * Agendar na Supabase (1x/dia) com o header acima.
 * Teste manual: POST { "force": true } com JWT de superadmin/admin.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const DEFAULT_MEDIA_RETENTION_DAYS = 35;

const MEDIA_TYPES = new Set([
  'image',
  'sticker',
  'video',
  'videoplay',
  'ptv',
  'audio',
  'ptt',
  'myaudio',
  'voice',
  'voicemessage',
  'document',
  'file',
]);

function isAtendimentoMediaType(type: string | null | undefined): boolean {
  const t = String(type || '').toLowerCase().trim();
  return MEDIA_TYPES.has(t);
}

function payloadRoot(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.data && typeof obj.data === 'object') return obj.data as Record<string, unknown>;
  return obj;
}

function rowLooksLikeMedia(row: { type?: string | null; raw_payload?: unknown }): boolean {
  if (isAtendimentoMediaType(row.type)) return true;
  const payload = payloadRoot(row.raw_payload);
  if (!payload) return false;
  if (isAtendimentoMediaType(String(payload.type ?? ''))) return true;

  const content = payload.content;
  if (content && typeof content === 'object') {
    const c = content as Record<string, unknown>;
    const mime = String(c.mimetype || '').toLowerCase();
    if (mime.startsWith('image/') || mime.startsWith('audio/') || mime.startsWith('video/')) return true;
    if (mime.includes('pdf') || mime.includes('document')) return true;
    if (c.ptt === true || c.audio === true || c.voice === true) return true;
  }

  const msg = payload.message;
  if (msg && typeof msg === 'object') {
    const m = msg as Record<string, unknown>;
    if (m.imageMessage || m.videoMessage || m.audioMessage || m.pttMessage || m.documentMessage || m.stickerMessage) {
      return true;
    }
  }

  return false;
}

function pickStr(...values: unknown[]): string | null {
  for (const v of values) {
    const s = String(v ?? '').trim();
    if (s) return s;
  }
  return null;
}

function buildPurgedMediaPayload(
  row: { type?: string | null; body?: string | null; message_id?: string | null },
  raw: unknown,
): Record<string, unknown> {
  const payload = payloadRoot(raw);
  const content =
    payload?.content && typeof payload.content === 'object' ? (payload.content as Record<string, unknown>) : null;
  const msg = payload?.message && typeof payload.message === 'object' ? (payload.message as Record<string, unknown>) : null;
  const key = payload?.key && typeof payload.key === 'object' ? (payload.key as Record<string, unknown>) : null;
  const msgKey = msg?.key && typeof msg.key === 'object' ? (msg.key as Record<string, unknown>) : null;

  const type = pickStr(row.type, payload?.type, content?.type) || 'file';
  const fileName = pickStr(content?.fileName, content?.title, payload?.fileName, payload?.title);
  const mimetype = pickStr(content?.mimetype, payload?.mimetype);
  const caption = pickStr(content?.caption, content?.text, payload?.caption, row.body);

  const minimalData: Record<string, unknown> = {
    id: pickStr(payload?.id, row.message_id),
    messageid: pickStr(payload?.messageid, payload?.messageId),
    messageId: pickStr(payload?.messageId, payload?.messageid),
    type,
    owner: pickStr(payload?.owner, payload?.instance),
    chatid: pickStr(payload?.chatid, payload?.chatId),
    fileName,
    mimetype,
    caption,
  };

  if (content) {
    minimalData.content = {
      type: pickStr(content.type, type),
      fileName,
      mimetype,
      caption,
      text: pickStr(content.text),
    };
  }

  if (key?.id) {
    minimalData.key = { id: key.id, fromMe: key.fromMe ?? null };
  }
  if (msgKey?.id) {
    minimalData.message = { key: { id: msgKey.id, fromMe: msgKey.fromMe ?? null } };
  }

  return {
    _mediaPurged: true,
    data: minimalData,
  };
}

function isPayloadAlreadyPurged(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  return (raw as Record<string, unknown>)._mediaPurged === true;
}

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-atendimento-media-purge-secret',
};

const BATCH_LIMIT = 400;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    let body: { force?: boolean; retention_days?: number; batch_limit?: number } = {};
    try {
      const t = await req.text();
      if (t) body = JSON.parse(t);
    } catch {
      body = {};
    }

    const cronSecret = Deno.env.get('ATENDIMENTO_MEDIA_PURGE_CRON_SECRET') ?? '';
    const suppliedCron = req.headers.get('x-atendimento-media-purge-secret') ?? '';
    const isCron = cronSecret.length > 0 && suppliedCron === cronSecret;
    const isForce = body?.force === true;
    const authHeader = req.headers.get('Authorization') ?? '';

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: 'SUPABASE_URL / SERVICE_ROLE_KEY em falta' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    let allowRun = false;
    let reason = '';

    if (isCron) {
      allowRun = true;
      reason = 'cron';
    } else if (isForce && authHeader.startsWith('Bearer ') && anonKey) {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: ue } = await userClient.auth.getUser();
      if (ue || !user) {
        return new Response(JSON.stringify({ error: 'JWT inválido' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (!profile?.role || !['superadmin', 'admin'].includes(String(profile.role))) {
        return new Response(JSON.stringify({ error: 'Apenas superadmin ou admin' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      allowRun = true;
      reason = 'force_admin';
    } else {
      return new Response(
        JSON.stringify({
          error:
            'Use header x-atendimento-media-purge-secret (cron) ou POST {"force":true} com Authorization Bearer (admin).',
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!allowRun) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const envDays = parseInt(Deno.env.get('ATENDIMENTO_MEDIA_RETENTION_DAYS') ?? '', 10);
    const retentionDays =
      Number.isFinite(body.retention_days) && body.retention_days! > 0
        ? Math.floor(body.retention_days!)
        : Number.isFinite(envDays) && envDays > 0
          ? envDays
          : DEFAULT_MEDIA_RETENTION_DAYS;

    const batchLimit =
      Number.isFinite(body.batch_limit) && body.batch_limit! > 0
        ? Math.min(1000, Math.floor(body.batch_limit!))
        : BATCH_LIMIT;

    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
    const cutoffIso = cutoff.toISOString();
    const nowIso = new Date().toISOString();

    const { data: inboxRows, error: inboxErr } = await admin
      .from('cliente_whatsapp_inbox')
      .select('id, type, body, message_id, raw_payload, created_at')
      .is('media_purged_at', null)
      .not('raw_payload', 'is', null)
      .lt('created_at', cutoffIso)
      .order('created_at', { ascending: true })
      .limit(batchLimit * 3);

    if (inboxErr) throw inboxErr;

    let inboxPurged = 0;
    let inboxSkipped = 0;

    for (const row of inboxRows || []) {
      if (inboxPurged >= batchLimit) break;
      if (!rowLooksLikeMedia(row)) {
        inboxSkipped += 1;
        continue;
      }
      if (isPayloadAlreadyPurged(row.raw_payload)) {
        await admin.from('cliente_whatsapp_inbox').update({ media_purged_at: nowIso }).eq('id', row.id);
        inboxSkipped += 1;
        continue;
      }

      const purgedPayload = buildPurgedMediaPayload(row, row.raw_payload);
      const { error: upErr } = await admin
        .from('cliente_whatsapp_inbox')
        .update({
          raw_payload: purgedPayload,
          media_purged_at: nowIso,
          profile_pic_url: null,
        })
        .eq('id', row.id);

      if (upErr) {
        console.error('[atendimento-media-purge] inbox update', row.id, upErr);
        continue;
      }
      inboxPurged += 1;
    }

    const { data: logRows, error: logErr } = await admin
      .from('cliente_whatsapp_webhook_log')
      .select('id, type, raw_payload, created_at')
      .not('raw_payload', 'is', null)
      .lt('created_at', cutoffIso)
      .order('created_at', { ascending: true })
      .limit(batchLimit);

    if (logErr) throw logErr;

    let webhookLogsPurged = 0;
    for (const row of logRows || []) {
      if (!rowLooksLikeMedia(row)) continue;
      if (isPayloadAlreadyPurged(row.raw_payload)) {
        webhookLogsPurged += 1;
        continue;
      }
      const { error: logUpErr } = await admin
        .from('cliente_whatsapp_webhook_log')
        .update({ raw_payload: { _mediaPurged: true } })
        .eq('id', row.id);
      if (!logUpErr) webhookLogsPurged += 1;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        reason,
        retention_days: retentionDays,
        cutoff: cutoffIso,
        inbox_purged: inboxPurged,
        inbox_skipped: inboxSkipped,
        webhook_logs_purged: webhookLogsPurged,
        batch_limit: batchLimit,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    console.error('[atendimento-media-purge]', e);
    return new Response(JSON.stringify({ error: (e as Error)?.message ?? String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
