/**
 * Envio de vídeo grande à Meta sem copiar o master no Storage.
 * Instagram Reels: container upload_type=resumable + rupload em pedaços.
 * Facebook página: graph-video upload_phase start/transfer/finish.
 * O token não sai da função. O Drive entra por read-range (JWT do usuário).
 */

import { assemblePlanSlice, loadFastStartPlan } from "./mp4FastStart.js";
import { uploadOutcomeAfterProcessingFailure } from "./igUploadOutcome.js";

const GRAPH = "https://graph.facebook.com/v24.0";
const GRAPH_VIDEO = "https://graph-video.facebook.com/v24.0";
const MAX_CHUNK = 32 * 1024 * 1024;
const DRIVE_RANGE_BYTES = 8 * 1024 * 1024;
const PROXY_TTL_SEC = 6 * 60 * 60;
const META_REEL_PROCESS_HINT =
  "A Meta recusou o vídeo. Use MP4 H.264 com áudio AAC, recorte 9:16, até 15 min e 1 GB.";

export const LARGE_MEDIA_ACTIONS = new Set([
  "start-ig-resumable-upload",
  "upload-ig-resumable-chunk",
  "get-ig-container-status",
  "get-ig-resumable-offset",
  "publish-ig-container",
  "start-fb-video-upload",
  "upload-fb-video-chunk",
  "finish-fb-video-upload",
]);

type Cors = Record<string, string>;

function json(data: unknown, cors: Cors, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function ruploadFailed(payload: unknown, text = ""): string | null {
  const body = payload as {
    error?: { message?: string; type?: string; debug_info?: { message?: string; type?: string } };
    debug_info?: { message?: string; type?: string };
    message?: string;
    type?: string;
  } | null;
  const debug = body?.debug_info || body?.error?.debug_info;
  const blob = [
    debug?.type,
    debug?.message,
    body?.error?.type,
    body?.error?.message,
    body?.type,
    body?.message,
    text,
  ]
    .filter(Boolean)
    .join(" ");
  if (/ProcessingFailed|Request processing failed/i.test(blob)) return META_REEL_PROCESS_HINT;
  return null;
}

function graphError(payload: unknown, fallback: string) {
  const failed = ruploadFailed(payload);
  if (failed) return failed;
  const err = (payload as { error?: { message?: string } } | null)?.error;
  return err?.message || fallback;
}

export function looksLikeMp4(bytes: Uint8Array) {
  return Boolean(
    bytes &&
      bytes.byteLength >= 12 &&
      bytes[4] === 0x66 &&
      bytes[5] === 0x74 &&
      bytes[6] === 0x79 &&
      bytes[7] === 0x70
  );
}

function hasFourcc(bytes: Uint8Array, code: string) {
  const a = code.charCodeAt(0);
  const b = code.charCodeAt(1);
  const c = code.charCodeAt(2);
  const d = code.charCodeAt(3);
  const last = bytes.byteLength - 4;
  for (let i = 0; i <= last; i += 1) {
    if (bytes[i] === a && bytes[i + 1] === b && bytes[i + 2] === c && bytes[i + 3] === d) return true;
  }
  return false;
}

export function mp4RejectedByMeta(bytes: Uint8Array): string | null {
  if (!looksLikeMp4(bytes)) {
    return "O arquivo não parece um MP4. Exporte de novo em MP4 H.264 com áudio AAC.";
  }
  const hevc = hasFourcc(bytes, "hvc1") || hasFourcc(bytes, "hev1") || hasFourcc(bytes, "dvhe");
  const avc = hasFourcc(bytes, "avc1") || hasFourcc(bytes, "avc3");
  if (hevc && !avc) {
    return "Este vídeo está em HEVC. A Meta pede MP4 H.264 com áudio AAC. Exporte de novo nesse formato.";
  }
  return null;
}

export function isAllowedRuploadUri(value: string) {
  try {
    const u = new URL(String(value || ""));
    return (
      u.protocol === "https:" &&
      u.hostname === "rupload.facebook.com" &&
      u.pathname.includes("/ig-api-upload/")
    );
  } catch {
    return false;
  }
}

async function hmacSign(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const buf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function fetchDriveRangeBytes(opts: {
  supabaseUrl: string;
  authHeader: string;
  anonKey: string;
  clienteId: string;
  fileId: string;
  offset: number;
  length: number;
}) {
  const base = String(opts.supabaseUrl || "").replace(/\/+$/, "");
  const readOnce = async (offset: number, length: number) => {
    const res = await fetch(`${base}/functions/v1/google-drive-api`, {
      method: "POST",
      headers: {
        Authorization: opts.authHeader,
        apikey: opts.anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "read-range",
        clienteId: opts.clienteId,
        fileId: opts.fileId,
        offset,
        length,
      }),
    });
    if (!res.ok) {
      let msg = `Drive recusou o trecho (${res.status})`;
      try {
        const parsed = await res.json();
        if (parsed?.error) msg = String(parsed.error);
      } catch {
        // ignore
      }
      throw new Error(msg);
    }
    return new Uint8Array(await res.arrayBuffer());
  };
  const readExact = async (offset: number, length: number) => {
    let part = await readOnce(offset, length);
    if (part.byteLength !== length) {
      part = await readOnce(offset, length);
    }
    if (part.byteLength !== length) {
      throw new Error("O Drive devolveu um trecho incompleto. Tente de novo.");
    }
    return part;
  };
  if (opts.length <= DRIVE_RANGE_BYTES) {
    return readExact(opts.offset, opts.length);
  }
  const parts: Uint8Array[] = [];
  let got = 0;
  while (got < opts.length) {
    const n = Math.min(DRIVE_RANGE_BYTES, opts.length - got);
    const part = await readExact(opts.offset + got, n);
    parts.push(part);
    got += part.byteLength;
  }
  const out = new Uint8Array(opts.length);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out.subarray(0, at);
}

export async function putRupload(
  uri: string,
  token: string,
  bytes: Uint8Array,
  offset: number,
  fileSize: number
) {
  const res = await fetch(uri, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${token}`,
      offset: String(offset),
      file_size: String(fileSize),
      "Content-Type": "application/octet-stream",
    },
    body: bytes,
  });
  const text = await res.text();
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  const failed = ruploadFailed(parsed, text);
  if (failed) {
    const reported = Number(parsed?.offset);
    return {
      next_offset: Number.isFinite(reported) ? reported : offset + bytes.byteLength,
      done: false,
      processing_failed: true,
      message: failed,
    };
  }
  if (!res.ok) {
    throw new Error(graphError(parsed, text.slice(0, 220) || `Falha no envio à Meta (${res.status})`));
  }
  const nextRaw = parsed?.offset;
  const next =
    nextRaw != null && Number.isFinite(Number(nextRaw))
      ? Number(nextRaw)
      : offset + bytes.byteLength;
  return {
    next_offset: next,
    done: next >= fileSize,
    raw: parsed,
  };
}

async function ruploadOffset(uri: string, token: string) {
  const res = await fetch(uri, {
    method: "GET",
    headers: { Authorization: `OAuth ${token}` },
  });
  const parsed = await res.json().catch(() => ({}));
  const failed = ruploadFailed(parsed);
  if (failed) throw new Error(failed);
  if (!res.ok) {
    throw new Error(graphError(parsed, "Não deu para conferir o envio na Meta"));
  }
  return Number(parsed?.offset || 0);
}

async function igContainerPhase(creationId: string, metaToken: string) {
  const res = await fetch(
    `${GRAPH}/${encodeURIComponent(creationId)}?fields=status_code,status&access_token=${encodeURIComponent(metaToken)}`
  );
  const parsed = await res.json().catch(() => ({}));
  return {
    code: String(parsed?.status_code || ""),
    detail: String(parsed?.status || parsed?.error?.message || ""),
  };
}

async function settleIgChunk(opts: {
  result: { next_offset: number; done: boolean; processing_failed?: boolean; message?: string };
  creationId: string;
  metaToken: string;
  offset: number;
  byteLength: number;
  fileSize: number;
}) {
  if (!opts.result.processing_failed) {
    return { success: true, next_offset: opts.result.next_offset, done: opts.result.done };
  }
  const phase = await igContainerPhase(opts.creationId, opts.metaToken);
  const outcome = uploadOutcomeAfterProcessingFailure({
    chunkEnd: opts.offset + opts.byteLength,
    fileSize: opts.fileSize,
    statusCode: phase.code,
  });
  if (outcome === "fail") {
    const detail = phase.detail && !/processing failed/i.test(phase.detail) ? phase.detail : opts.result.message;
    return { error: { message: detail || META_REEL_PROCESS_HINT } };
  }
  return {
    success: true,
    next_offset: opts.fileSize,
    done: outcome === "ready",
    processing: outcome === "wait",
  };
}

async function signIgProxy(secret: string, uri: string, creationId: string, exp: number) {
  return hmacSign(secret, `v1.igrupload.${creationId}.${exp}.${uri}`);
}

export async function handleIgRuploadPut(
  req: Request,
  url: URL,
  metaToken: string,
  serviceKey: string,
  cors: Cors
) {
  const creationId = String(url.searchParams.get("id") || "").trim();
  const exp = Number(url.searchParams.get("exp") || 0);
  const sig = String(url.searchParams.get("sig") || "").trim();
  const uri = String(url.searchParams.get("u") || "").trim();
  if (!creationId || !isAllowedRuploadUri(uri)) {
    return json({ error: { message: "Link de envio inválido" } }, cors, 400);
  }
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) {
    return json({ error: { message: "Envio expirado. Publique de novo." } }, cors, 401);
  }
  const expected = await signIgProxy(serviceKey, uri, creationId, exp);
  if (!timingSafeEqual(expected, sig)) {
    return json({ error: { message: "Link de envio inválido" } }, cors, 401);
  }
  const range = req.headers.get("Content-Range") || "";
  const rangeMatch = range.match(/bytes\s+(\d+)-(\d+)\/(\d+)/i);
  const offset = rangeMatch
    ? Number(rangeMatch[1])
    : Math.max(0, Math.floor(Number(req.headers.get("offset") || req.headers.get("x-upload-offset") || 0)));
  const fileSize = rangeMatch
    ? Number(rangeMatch[3])
    : Math.floor(Number(req.headers.get("file_size") || req.headers.get("x-file-size") || 0));
  if (!fileSize || fileSize < 1) {
    return json({ error: { message: "Tamanho do arquivo ausente" } }, cors, 400);
  }
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.byteLength) {
    return json({ error: { message: "Trecho vazio" } }, cors, 400);
  }
  if (offset === 0) {
    const reject = mp4RejectedByMeta(bytes);
    if (reject) return json({ error: { message: reject } }, cors);
  }
  try {
    const result = await putRupload(uri, metaToken, bytes, offset, fileSize);
    return json(
      await settleIgChunk({
        result,
        creationId,
        metaToken,
        offset,
        byteLength: bytes.byteLength,
        fileSize,
      }),
      cors
    );
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Falha no envio à Meta";
    return json(
      { error: { message: ruploadFailed({ message: raw }, raw) || raw } },
      cors,
      200
    );
  }
}

async function pageAccessToken(pageId: string, metaToken: string) {
  const res = await fetch(
    `${GRAPH}/${encodeURIComponent(pageId)}?fields=access_token&access_token=${encodeURIComponent(metaToken)}`
  );
  const parsed = await res.json();
  if (parsed?.error || !parsed?.access_token) {
    throw new Error(graphError(parsed, "Não foi possível obter o token da página"));
  }
  return String(parsed.access_token);
}

function digits(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

export async function handleLargeMediaAction(opts: {
  action: string;
  body: Record<string, unknown>;
  req: Request;
  metaToken: string;
  corsHeaders: Cors;
  supabaseUrl: string;
  serviceKey: string;
}): Promise<Response> {
  const { action, body, req, metaToken, corsHeaders: cors, supabaseUrl, serviceKey } = opts;
  const authHeader = req.headers.get("Authorization") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

  try {
    if (action === "start-ig-resumable-upload") {
      const igUserId = digits(body.instagram_account_id);
      const fileSize = Math.floor(Number(body.file_size || 0));
      if (!igUserId) {
        return json({ error: { message: "instagram_account_id is required" } }, cors);
      }
      if (!fileSize || fileSize < 1) {
        return json({ error: { message: "file_size is required" } }, cors);
      }
      const params = new URLSearchParams();
      params.set("media_type", "REELS");
      params.set("upload_type", "resumable");
      params.set("share_to_feed", "true");
      params.set("caption", String(body.caption || ""));
      params.set("access_token", metaToken);
      const cover = String(body.cover_url || "").trim();
      if (cover) params.set("cover_url", cover);
      else if (body.thumb_offset != null && String(body.thumb_offset).trim() !== "") {
        const offsetMs = Number(body.thumb_offset);
        if (Number.isFinite(offsetMs) && offsetMs >= 0) {
          params.set("thumb_offset", String(Math.floor(offsetMs)));
        }
      }
      const res = await fetch(`${GRAPH}/${igUserId}/media`, { method: "POST", body: params });
      const parsed = await res.json();
      if (parsed?.error || !parsed?.id) {
        return json({ error: parsed?.error || { message: "A Meta não iniciou o envio do Reels" } }, cors);
      }
      const uri = String(parsed.uri || "");
      const uploadUri = isAllowedRuploadUri(uri)
        ? uri
        : `https://rupload.facebook.com/ig-api-upload/v24.0/${parsed.id}`;
      if (!isAllowedRuploadUri(uploadUri)) {
        return json({ error: { message: "A Meta devolveu um endereço de envio inválido" } }, cors);
      }
      const exp = Math.floor(Date.now() / 1000) + PROXY_TTL_SEC;
      const sig = await signIgProxy(serviceKey, uploadUri, String(parsed.id), exp);
      const qs = new URLSearchParams({
        action: "ig-rupload",
        id: String(parsed.id),
        exp: String(exp),
        sig,
        u: uploadUri,
      });
      return json(
        {
          creation_id: String(parsed.id),
          uri: uploadUri,
          file_size: fileSize,
          scheduled: false,
          proxyPath: `/functions/v1/meta-ads-api?${qs.toString()}`,
          success: true,
        },
        cors
      );
    }

    if (action === "upload-ig-resumable-chunk") {
      const creationId = String(body.creation_id || "").trim();
      const uriRaw = String(body.uri || "").trim();
      const uri = isAllowedRuploadUri(uriRaw)
        ? uriRaw
        : `https://rupload.facebook.com/ig-api-upload/v24.0/${creationId}`;
      const offset = Math.max(0, Math.floor(Number(body.offset || 0)));
      const length = Math.floor(Number(body.length || 0));
      const fileSize = Math.floor(Number(body.file_size || 0));
      const clienteId = String(body.clienteId || body.cliente_id || "").trim();
      const fileId = String(body.driveFileId || body.fileId || "").trim();
      if (!creationId || !isAllowedRuploadUri(uri)) {
        return json({ error: { message: "Sessão de envio inválida" } }, cors);
      }
      if (!fileSize || length < 1 || length > MAX_CHUNK) {
        return json({ error: { message: "Trecho inválido (máx. 32 MB)" } }, cors);
      }
      if (!clienteId || !fileId) {
        return json({ error: { message: "Informe o arquivo do Drive" } }, cors);
      }
      if (!authHeader) {
        return json({ error: { message: "Sessão expirada. Entre de novo." } }, cors);
      }
      const readSource = (from: number, size: number) =>
        fetchDriveRangeBytes({
          supabaseUrl,
          authHeader,
          anonKey,
          clienteId,
          fileId,
          offset: from,
          length: size,
        });
      const plan = await loadFastStartPlan(fileSize, readSource);
      const bytes = plan
        ? await assemblePlanSlice(plan, offset, length, readSource)
        : await readSource(offset, length);
      if (offset === 0) {
        const reject = mp4RejectedByMeta(bytes);
        if (reject) return json({ error: { message: reject } }, cors);
      }
      const result = await putRupload(uri, metaToken, bytes, offset, plan?.newFileSize || fileSize);
      return json(
        {
          creation_id: creationId,
          ...(await settleIgChunk({
            result,
            creationId,
            metaToken,
            offset,
            byteLength: bytes.byteLength,
            fileSize: plan?.newFileSize || fileSize,
          })),
        },
        cors
      );
    }

    if (action === "get-ig-resumable-offset") {
      const creationId = String(body.creation_id || "").trim();
      const uriRaw = String(body.uri || "").trim();
      const uri = isAllowedRuploadUri(uriRaw)
        ? uriRaw
        : `https://rupload.facebook.com/ig-api-upload/v24.0/${creationId}`;
      if (!creationId || !isAllowedRuploadUri(uri)) {
        return json({ error: { message: "Sessão de envio inválida" } }, cors);
      }
      const offset = await ruploadOffset(uri, metaToken);
      return json({ success: true, offset, creation_id: creationId }, cors);
    }

    if (action === "get-ig-container-status") {
      const creationId = String(body.creation_id || "").trim();
      if (!creationId) {
        return json({ error: { message: "creation_id is required" } }, cors);
      }
      const res = await fetch(
        `${GRAPH}/${encodeURIComponent(creationId)}?fields=status_code,status&access_token=${encodeURIComponent(metaToken)}`
      );
      const parsed = await res.json();
      if (parsed?.error) {
        return json({ error: parsed.error }, cors);
      }
      return json(
        {
          success: true,
          creation_id: creationId,
          status_code: String(parsed.status_code || parsed.status || ""),
        },
        cors
      );
    }

    if (action === "publish-ig-container") {
      const igUserId = digits(body.instagram_account_id);
      const creationId = String(body.creation_id || "").trim();
      if (!igUserId || !creationId) {
        return json({ error: { message: "instagram_account_id e creation_id são obrigatórios" } }, cors);
      }
      const res = await fetch(`${GRAPH}/${igUserId}/media_publish`, {
        method: "POST",
        body: new URLSearchParams({
          creation_id: creationId,
          access_token: metaToken,
        }),
      });
      const parsed = await res.json();
      if (parsed?.error) {
        return json({ error: parsed.error, media_id: null }, cors);
      }
      let permalink: string | null = null;
      try {
        const permalinkRes = await fetch(
          `${GRAPH}/${parsed.id}?fields=permalink&access_token=${encodeURIComponent(metaToken)}`
        );
        const permalinkJson = await permalinkRes.json();
        if (!permalinkJson.error && permalinkJson.permalink) {
          permalink = String(permalinkJson.permalink);
        }
      } catch {
        // opcional
      }
      return json(
        {
          media_id: parsed.id,
          permalink,
          scheduled: false,
          success: true,
        },
        cors
      );
    }

    if (action === "start-fb-video-upload") {
      const pageId = digits(body.page_id);
      const fileSize = Math.floor(Number(body.file_size || 0));
      if (!pageId) return json({ error: { message: "page_id is required" } }, cors);
      if (!fileSize) return json({ error: { message: "file_size is required" } }, cors);
      const pageToken = await pageAccessToken(pageId, metaToken);
      const params = new URLSearchParams();
      params.set("upload_phase", "start");
      params.set("file_size", String(fileSize));
      params.set("access_token", pageToken);
      const res = await fetch(`${GRAPH_VIDEO}/${pageId}/videos`, { method: "POST", body: params });
      const parsed = await res.json();
      if (parsed?.error || !parsed?.upload_session_id) {
        return json({ error: parsed?.error || { message: "A Meta não iniciou o vídeo da página" } }, cors);
      }
      return json(
        {
          success: true,
          upload_session_id: String(parsed.upload_session_id),
          video_id: parsed.video_id ? String(parsed.video_id) : null,
          start_offset: String(parsed.start_offset ?? "0"),
          end_offset: String(parsed.end_offset ?? "0"),
        },
        cors
      );
    }

    if (action === "upload-fb-video-chunk") {
      const pageId = digits(body.page_id);
      const sessionId = String(body.upload_session_id || "").trim();
      const startOffset = Math.max(0, Math.floor(Number(body.start_offset || 0)));
      const endOffset = Math.floor(Number(body.end_offset || 0));
      const length = endOffset > startOffset ? endOffset - startOffset : Math.floor(Number(body.length || 0));
      const clienteId = String(body.clienteId || body.cliente_id || "").trim();
      const fileId = String(body.driveFileId || body.fileId || "").trim();
      if (!pageId || !sessionId) {
        return json({ error: { message: "Sessão de vídeo inválida" } }, cors);
      }
      if (!length || length < 1 || length > MAX_CHUNK) {
        return json({ error: { message: "Trecho inválido (máx. 32 MB)" } }, cors);
      }
      if (!clienteId || !fileId) {
        return json({ error: { message: "Informe o arquivo do Drive" } }, cors);
      }
      if (!authHeader) {
        return json({ error: { message: "Sessão expirada. Entre de novo." } }, cors);
      }
      const bytes = await fetchDriveRangeBytes({
        supabaseUrl,
        authHeader,
        anonKey,
        clienteId,
        fileId,
        offset: startOffset,
        length,
      });
      const pageToken = await pageAccessToken(pageId, metaToken);
      const form = new FormData();
      form.set("upload_phase", "transfer");
      form.set("upload_session_id", sessionId);
      form.set("start_offset", String(startOffset));
      form.set("access_token", pageToken);
      form.set("file", new Blob([bytes], { type: "application/octet-stream" }), "chunk.mp4");
      const res = await fetch(`${GRAPH_VIDEO}/${pageId}/videos`, { method: "POST", body: form });
      const parsed = await res.json();
      if (parsed?.error) {
        return json({ error: parsed.error }, cors);
      }
      return json(
        {
          success: true,
          start_offset: String(parsed.start_offset ?? startOffset + bytes.byteLength),
          end_offset: String(parsed.end_offset ?? parsed.start_offset ?? startOffset + bytes.byteLength),
        },
        cors
      );
    }

    if (action === "finish-fb-video-upload") {
      const pageId = digits(body.page_id);
      const sessionId = String(body.upload_session_id || "").trim();
      if (!pageId || !sessionId) {
        return json({ error: { message: "Sessão de vídeo inválida" } }, cors);
      }
      const pageToken = await pageAccessToken(pageId, metaToken);
      const params = new URLSearchParams();
      params.set("upload_phase", "finish");
      params.set("upload_session_id", sessionId);
      params.set("access_token", pageToken);
      const description = String(body.description || body.message || "");
      if (description) params.set("description", description);
      const scheduleUnix = body.scheduled_publish_time ? Number(body.scheduled_publish_time) : null;
      if (scheduleUnix && Number.isFinite(scheduleUnix)) {
        params.set("published", "false");
        params.set("scheduled_publish_time", String(Math.floor(scheduleUnix)));
      } else if (body.published === false) {
        params.set("published", "false");
      } else {
        params.set("published", "true");
      }
      const res = await fetch(`${GRAPH_VIDEO}/${pageId}/videos`, { method: "POST", body: params });
      const parsed = await res.json();
      if (parsed?.error) {
        return json({ error: parsed.error, post_id: null }, cors);
      }
      return json(
        {
          success: true,
          post_id: parsed.id || parsed.post_id || null,
          video_id: parsed.id || null,
          scheduled: Boolean(scheduleUnix && Number.isFinite(scheduleUnix)),
        },
        cors
      );
    }
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Falha no envio grande à Meta";
    return json(
      {
        error: {
          message: ruploadFailed({ message: raw }, raw) || raw,
        },
      },
      cors
    );
  }

  return json({ error: { message: "Ação de mídia grande desconhecida" } }, cors);
}
