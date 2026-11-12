/**
 * Baixa mídia de uma mensagem WhatsApp via uazapi POST /message/download.
 * Body: { message_id, whatsapp_config_id?, cliente_id?, generate_mp3?, return_base64? }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'Configuração do servidor incompleta' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Não autorizado' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const authToken = authHeader.slice(7);
  const { data: { user }, error: userError } = await supabase.auth.getUser(authToken);
  if (userError || !user?.id) {
    return new Response(JSON.stringify({ error: 'Token inválido ou expirado' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: Record<string, unknown>;
  try {
    const raw = await req.json();
    body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  } catch {
    return new Response(JSON.stringify({ error: 'Body JSON inválido' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const messageId = String(body.message_id ?? body.id ?? '').trim();
  const extraIds = Array.isArray(body.message_ids)
    ? body.message_ids.map((id) => String(id ?? '').trim()).filter(Boolean)
    : [];
  const idsToTry = [...new Set([messageId, ...extraIds].filter(Boolean))];

  if (!idsToTry.length) {
    return new Response(JSON.stringify({ error: 'Campo "message_id" é obrigatório' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('cliente_id, role')
    .eq('id', user.id)
    .single();

  const role = profile?.role ?? null;
  if (!role || !['superadmin', 'admin', 'colaborador'].includes(role)) {
    return new Response(JSON.stringify({ error: 'Acesso negado.' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let clienteId: string | null = profile?.cliente_id ?? null;
  if (body?.cliente_id) {
    clienteId = String(body.cliente_id).trim() || clienteId;
  }

  let whatsappConfigId = typeof body.whatsapp_config_id === 'string' ? body.whatsapp_config_id.trim() : null;

  if (!clienteId && whatsappConfigId) {
    const { data: cfgRow } = await supabase
      .from('cliente_whatsapp_config')
      .select('cliente_id')
      .eq('id', whatsappConfigId)
      .maybeSingle();
    clienteId = cfgRow?.cliente_id ?? null;
  }

  if (!clienteId) {
    return new Response(JSON.stringify({ error: 'Cliente não identificado.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let configQuery = supabase
    .from('cliente_whatsapp_config')
    .select('id, subdomain, token')
    .eq('cliente_id', clienteId);

  if (whatsappConfigId) {
    configQuery = configQuery.eq('id', whatsappConfigId);
  } else {
    configQuery = configQuery.order('created_at', { ascending: true }).limit(1);
  }

  const { data: config, error: configError } = await configQuery.maybeSingle();
  if (configError || !config?.subdomain || !config?.token) {
    return new Response(JSON.stringify({ error: 'WhatsApp não configurado para este cliente/canal.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const subdomain = String(config.subdomain).replace(/^https?:\/\//, '').split('/')[0].replace(/\.uazapi\.com$/i, '');
  const baseUrl = `https://${subdomain}.uazapi.com`;
  const instanceToken = config.token.trim();
  const preferredFileName = String(body.file_name ?? body.fileName ?? '').trim() || null;
  const mediaKind = String(body.media_kind ?? '').toLowerCase();
  const isAudioRequest = mediaKind === 'audio' || mediaKind === 'ptt' || mediaKind === 'myaudio';

  let lastError = 'Erro ao baixar mídia na uazapi.';
  let lastDetails: Record<string, unknown> | null = null;

  const isEncMediaUrl = (url: string) => /\.enc(\?|#|$)/i.test(url);

  const normalizeAudioMime = (mimetype: string | null, fileURL = '') => {
    const m = (mimetype || '').toLowerCase();
    const u = fileURL.toLowerCase();
    if (m.includes('mpeg') || m.includes('mp3') || u.includes('.mp3')) return 'audio/mpeg';
    if (m.includes('ogg') || m.includes('opus') || u.includes('.ogg')) return 'audio/ogg';
    if (m.includes('mp4') || m.includes('m4a') || u.includes('.m4a')) return 'audio/mp4';
    if (m.startsWith('audio/')) return m;
    return 'audio/mpeg';
  };

  const buildDataUrl = (mimetype: string | null, base64Data: string) => {
    const mime = mimetype || 'application/octet-stream';
    const b64 = String(base64Data).replace(/^data:[^;]+;base64,/, '');
    return `data:${mime};base64,${b64}`;
  };

  const resolveDownloadResult = (
    resData: Record<string, unknown>,
    tryId: string,
  ): { url: string; mimetype: string | null; fileName: string | null } | null => {
    const fileURL = String(resData.fileURL ?? resData.fileUrl ?? resData.url ?? '').trim();
    const mimetype = (resData.mimetype as string) ?? null;
    const base64Data = (resData.base64Data ?? resData.base64) as string | undefined;
    const responseFileName =
      String(resData.fileName ?? resData.filename ?? resData.name ?? preferredFileName ?? '').trim() || null;

    const mime = (mimetype || '').toLowerCase();
    const isDocument = mime.includes('pdf') || mime.includes('document') || mime.includes('msword') || mime.includes('sheet');
    const isAudio = isAudioRequest || mime.includes('audio') || mime.includes('ogg') || mime.includes('opus');
    const encUrl = fileURL && isEncMediaUrl(fileURL);

    if (base64Data) {
      if (encUrl || isDocument || isAudio || !fileURL || !/^https?:\/\//i.test(fileURL)) {
        const resolvedMime = isAudio ? normalizeAudioMime(mimetype, fileURL) : mimetype;
        return { url: buildDataUrl(resolvedMime, base64Data), mimetype: resolvedMime, fileName: responseFileName };
      }
    }

    if (fileURL && /^https?:\/\//i.test(fileURL) && !encUrl && !isAudio) {
      return { url: fileURL, mimetype, fileName: responseFileName };
    }

    if (base64Data) {
      return { url: buildDataUrl(mimetype, base64Data), mimetype, fileName: responseFileName };
    }

    return null;
  };

  const callUazapiDownload = async (
    tryId: string,
    opts: { returnLink: boolean; returnBase64: boolean; generateMp3?: boolean },
  ) => {
    const downloadPayload: Record<string, unknown> = {
      id: tryId,
      return_link: opts.returnLink,
      return_base64: opts.returnBase64,
      generate_mp3: opts.generateMp3 ?? (isAudioRequest ? true : body.generate_mp3 !== false),
    };
    const res = await fetch(`${baseUrl}/message/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: instanceToken },
      body: JSON.stringify(downloadPayload),
    });
    const resData = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const apiFailed = !res.ok || (typeof resData?.error === 'string' && resData.error.length > 0);
    return { apiFailed, resData, status: res.status };
  };

  const attemptsFor = () => (isAudioRequest
    ? [
        { returnLink: true, returnBase64: true, generateMp3: true },
        { returnLink: false, returnBase64: true, generateMp3: true },
      ]
    : [
        { returnLink: true, returnBase64: true, generateMp3: body.generate_mp3 !== false },
        { returnLink: false, returnBase64: true, generateMp3: body.generate_mp3 !== false },
      ]);

  const downloadFirst = async (tryIds: string[]) => {
    for (const tryId of tryIds) {
      for (const attempt of attemptsFor()) {
        const { apiFailed, resData, status } = await callUazapiDownload(tryId, {
          returnLink: attempt.returnLink,
          returnBase64: attempt.returnBase64,
          generateMp3: attempt.generateMp3,
        });

        if (apiFailed) {
          lastError = (resData?.error as string) ?? `Erro ${status}` ?? lastError;
          lastDetails = resData;
          console.warn('[uazapi-download-media] try failed', tryId, attempt, status, resData);
          continue;
        }

        const resolved = resolveDownloadResult(resData, tryId);
        if (!resolved) {
          lastError = 'Resposta da uazapi sem URL ou base64 de mídia.';
          lastDetails = resData;
          continue;
        }

        return new Response(
          JSON.stringify({
            success: true,
            message_id: tryId,
            fileURL: resolved.url.startsWith('data:') ? null : resolved.url,
            url: resolved.url,
            mimetype: resolved.mimetype,
            fileName: resolved.fileName,
            base64Data: (resData.base64Data ?? resData.base64) ?? null,
            transcription: (resData.transcription as string) ?? null,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    return null;
  };

  const direct = await downloadFirst(idsToTry);
  if (direct) return direct;

  const chatJid = String(body.chat_jid ?? body.chatJid ?? '').trim();
  const stampOf = (value: string) => {
    const match = String(value || '').match(/_(\d{12,16})$/);
    const stamp = match ? Number(match[1]) : 0;
    return Number.isFinite(stamp) ? stamp : 0;
  };
  const targetStamp = idsToTry.map(stampOf).find((stamp) => stamp > 0) || 0;
  if (chatJid && targetStamp && isAudioRequest) {
    const deltaMs = (left: number, right: number) => {
      if (!left || !right) return Number.POSITIVE_INFINITY;
      return Math.min(
        Math.abs(left - right),
        Math.abs(left * 1000 - right),
        Math.abs(left - right * 1000),
      );
    };
    let best: { delta: number; ids: string[] } | null = null;
    let offset = 0;
    for (let page = 0; page < 8; page += 1) {
      const findRes = await fetch(`${baseUrl}/message/find`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token: instanceToken },
        body: JSON.stringify({ chatid: chatJid, limit: 50, offset }),
      });
      const findData = (await findRes.json().catch(() => ({}))) as Record<string, unknown>;
      const messages = Array.isArray(findData.messages) ? findData.messages as Record<string, unknown>[] : [];
      if (!messages.length) break;
      let oldest = targetStamp;
      for (const msg of messages) {
        const ts = Number(msg.messageTimestamp ?? msg.timestamp ?? 0);
        if (Number.isFinite(ts) && ts > 0 && ts < oldest) oldest = ts;
        const type = String(msg.messageType ?? msg.type ?? '');
        if (!/audio/i.test(type)) continue;
        const delta = deltaMs(ts, targetStamp);
        if (delta > 5000 || (best && delta >= best.delta)) continue;
        const ids = [String(msg.messageid ?? '').trim(), String(msg.id ?? '').trim()].filter(Boolean);
        if (ids.length) best = { delta, ids };
      }
      const hasMore = findData.hasMore === true;
      const next = Number(findData.nextOffset);
      if (!hasMore || (oldest > 0 && oldest < targetStamp - 120000)) break;
      offset = Number.isFinite(next) && next > offset ? next : offset + messages.length;
    }
    const extra = (best?.ids || []).filter((id) => !idsToTry.includes(id));
    if (extra.length) {
      const resolved = await downloadFirst(extra);
      if (resolved) return resolved;
    }
  }

  console.error('[uazapi-download-media] all ids failed', idsToTry, lastDetails);
  return new Response(
    JSON.stringify({ error: lastError, details: lastDetails, tried_ids: idsToTry }),
    { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
