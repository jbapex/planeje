/**
 * Google Drive API — OAuth por cliente + listar / upload / sincronizar mídia.
 *
 * Secrets da agência (Vault / app_secrets; o superadmin cola em Configurações → Google Drive):
 * - GOOGLE_DRIVE_CLIENT_ID (fallback: GOOGLE_ADS_CLIENT_ID)
 * - GOOGLE_DRIVE_CLIENT_SECRET (fallback: GOOGLE_ADS_CLIENT_SECRET)
 * - GOOGLE_DRIVE_REDIRECT_URI (opcional; default = URL desta função, sem query)
 * - GOOGLE_DRIVE_APP_ORIGIN (opcional; origem do front para redirect pós-OAuth)
 *
 * Refresh token por cliente: app_secrets GOOGLE_DRIVE_CLIENT_<uuid>
 * sync-file só vincula o arquivo do Drive (não copia mídia para o Storage).
 * Player e miniatura usam GET action=stream (Range) e kind=thumb.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCalendarCallback, loadCalendarConfig } from "../_shared/crmIaCalendarHandler.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, HEAD, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, range, content-range",
  "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length, Range",
};

const DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.file",
  "openid",
  "email",
  "profile",
].join(" ");

const OAUTH_NOT_CONFIGURED_MESSAGE =
  "Cole o Client ID e o Secret em Configurações → Google Drive da agência.";
const GOOGLE_DRIVE_SETTINGS_PATH = "/settings/google-drive";

type Profile = { cliente_id: string | null; role: string | null };

async function getSecret(
  supabase: SupabaseClient,
  envName: string
): Promise<string | null> {
  const fromEnv = Deno.env.get(envName);
  if (fromEnv) return fromEnv;
  try {
    const { data, error } = await supabase.rpc("get_encrypted_secret", {
      p_secret_name: envName,
    });
    if (!error && data) return String(data);
  } catch {
    // ignore
  }
  return null;
}

async function readOAuthSecrets(supabase: SupabaseClient) {
  const driveClientId = await getSecret(supabase, "GOOGLE_DRIVE_CLIENT_ID");
  const driveClientSecret = await getSecret(supabase, "GOOGLE_DRIVE_CLIENT_SECRET");
  const adsClientId = await getSecret(supabase, "GOOGLE_ADS_CLIENT_ID");
  const adsClientSecret = await getSecret(supabase, "GOOGLE_ADS_CLIENT_SECRET");
  const clientId = driveClientId || adsClientId;
  const clientSecret = driveClientSecret || adsClientSecret;
  const oauthConfigured = Boolean(clientId && clientSecret);
  return {
    clientId,
    clientSecret,
    oauthConfigured,
    hasClientId: Boolean(clientId),
    hasClientSecret: Boolean(clientSecret),
    usingAdsFallback: oauthConfigured && (!driveClientId || !driveClientSecret),
  };
}

async function getOAuthClient(supabase: SupabaseClient) {
  const secrets = await readOAuthSecrets(supabase);
  return {
    clientId: secrets.clientId,
    clientSecret: secrets.clientSecret,
    oauthConfigured: secrets.oauthConfigured,
  };
}

function defaultRedirectUri(origin: string) {
  return `${String(origin || "").replace(/\/$/, "")}/functions/v1/google-drive-api`;
}

function isPublicHttpsRedirect(uri: string) {
  try {
    const parsed = new URL(uri);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (!host.includes(".")) return false;
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
    if (host === "api-gw" || host.startsWith("api-gw.") || host.includes("kong")) return false;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

function sanitizeRedirectUri(uri: string | null | undefined, fallbackOrigin: string) {
  const raw = String(uri || "").trim();
  const fallback = defaultRedirectUri(fallbackOrigin);
  if (!raw) return fallback;
  try {
    const parsed = new URL(raw);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "") || fallback;
  } catch {
    return fallback;
  }
}

function originToDriveRedirect(origin: string | null | undefined) {
  const raw = String(origin || "").trim();
  if (!raw) return "";
  try {
    return `${new URL(raw).origin}/functions/v1/google-drive-api`;
  } catch {
    return "";
  }
}

const PUBLIC_FALLBACK_ORIGIN = "https://planeje.jbapex.com.br";

async function getRedirectUri(supabase: SupabaseClient, supabaseUrl: string) {
  const explicit = await getSecret(supabase, "GOOGLE_DRIVE_REDIRECT_URI");
  const appOrigin =
    (await getSecret(supabase, "GOOGLE_DRIVE_APP_ORIGIN")) ||
    Deno.env.get("GOOGLE_DRIVE_APP_ORIGIN") ||
    "";
  const candidates = [
    sanitizeRedirectUri(explicit, PUBLIC_FALLBACK_ORIGIN),
    originToDriveRedirect(appOrigin),
    defaultRedirectUri(supabaseUrl),
    defaultRedirectUri(PUBLIC_FALLBACK_ORIGIN),
  ];
  for (const uri of candidates) {
    if (uri && isPublicHttpsRedirect(uri)) return uri;
  }
  return defaultRedirectUri(PUBLIC_FALLBACK_ORIGIN);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function htmlPage(title: string, body: string, status = 200) {
  return new Response(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:48px auto;padding:0 16px;line-height:1.5;color:#111}
a{color:#1a73e8}</style></head><body>${body}</body></html>`,
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
    }
  );
}

function secretNameForCliente(clienteId: string) {
  return `GOOGLE_DRIVE_CLIENT_${clienteId.replace(/-/g, "_")}`;
}

async function resolveUser(
  supabase: SupabaseClient,
  req: Request
): Promise<{ userId: string; profile: Profile } | Response> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return json({ error: "Não autorizado" }, 401);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);
  if (userError || !user?.id) return json({ error: "Token inválido ou expirado" }, 401);

  const { data: profile } = await supabase
    .from("profiles")
    .select("cliente_id, role")
    .eq("id", user.id)
    .single();

  if (!profile) return json({ error: "Perfil não encontrado" }, 403);

  return {
    userId: user.id,
    profile: { cliente_id: profile.cliente_id, role: profile.role || "" },
  };
}

async function resolveCaller(
  supabase: SupabaseClient,
  req: Request,
  bodyClienteId?: string | null
): Promise<{ userId: string; profile: Profile; clienteId: string } | Response> {
  const auth = await resolveUser(supabase, req);
  if (auth instanceof Response) return auth;
  const { userId, profile } = auth;

  const role = profile.role || "";
  let clienteId = profile.cliente_id as string | null;

  if (
    bodyClienteId &&
    ["admin", "colaborador", "superadmin"].includes(role)
  ) {
    clienteId = bodyClienteId.trim();
  }

  if (!clienteId) {
    return json({ error: "cliente_id não disponível" }, 400);
  }

  if (role === "cliente" && profile.cliente_id !== clienteId) {
    return json({ error: "Sem permissão para este cliente" }, 403);
  }

  if (!["superadmin", "admin", "colaborador", "cliente"].includes(role)) {
    return json({ error: "Sem permissão" }, 403);
  }

  return {
    userId,
    profile: { cliente_id: profile.cliente_id, role },
    clienteId,
  };
}

async function getClienteRefreshToken(
  supabase: SupabaseClient,
  clienteId: string
): Promise<string | null> {
  const name = secretNameForCliente(clienteId);
  const { data, error } = await supabase.rpc("get_encrypted_secret", {
    p_secret_name: name,
  });
  if (error || !data) return null;
  const token = String(data).trim();
  return token || null;
}

async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(
      data.error_description || data.error || "Falha ao renovar token Google Drive"
    );
  }
  return data.access_token as string;
}

async function exchangeCode(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string
) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(
      data.error_description || data.error || "Falha ao trocar code por token"
    );
  }
  return data as {
    access_token: string;
    refresh_token?: string;
    scope?: string;
    expires_in?: number;
    id_token?: string;
  };
}

async function fetchGoogleUser(accessToken: string) {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return { email: null, id: null };
  const data = await res.json();
  return {
    email: typeof data.email === "string" ? data.email : null,
    id: typeof data.id === "string" ? data.id : null,
  };
}

async function driveFetch(
  accessToken: string,
  path: string,
  init: RequestInit = {}
) {
  const url = path.startsWith("http")
    ? path
    : `https://www.googleapis.com/drive/v3${path}`;
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = data.error as { message?: string } | undefined;
    throw new Error(err?.message || `Drive API ${res.status}`);
  }
  return data;
}

function mapFile(f: Record<string, unknown>) {
  return {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    size: f.size ? Number(f.size) : null,
    modifiedTime: f.modifiedTime || null,
    webViewLink: f.webViewLink || null,
    webContentLink: f.webContentLink || null,
    iconLink: f.iconLink || null,
    thumbnailLink: f.thumbnailLink || null,
    parents: f.parents || [],
    isFolder: f.mimeType === "application/vnd.google-apps.folder",
  };
}

const MAX_DRIVE_THUMB_BYTES = 2 * 1024 * 1024;

function isInternalStorageOrigin(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "api-gw" || host === "kong" || host === "localhost" || host.endsWith(".internal");
  } catch {
    return true;
  }
}

function publicStorageOrigin(supabaseUrl: string): string {
  const pub = String(Deno.env.get("SUPABASE_PUBLIC_URL") || "").replace(/\/+$/, "");
  const raw = String(supabaseUrl || "").replace(/\/+$/, "");
  if (pub && !isInternalStorageOrigin(pub)) return pub;
  if (raw && !isInternalStorageOrigin(raw)) return raw;
  return PUBLIC_FALLBACK_ORIGIN;
}

function escapeDriveQueryValue(value: string) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'");
}

function isDriveFileId(id: string) {
  const v = String(id || "").trim();
  if (v === "root" || v === "shared" || v === "recent-videos") return true;
  return /^[a-zA-Z0-9_-]{8,256}$/.test(v);
}

function buildDriveListQuery(folderId: string, qExtra: string, mediaOnly: boolean) {
  const parts = ["trashed = false"];
  const folder = String(folderId || "root").trim() || "root";
  if (folder === "shared") {
    parts.push("sharedWithMe = true");
  } else if (folder === "recent-videos") {
    parts.push("(mimeType contains 'video/' or mimeType = 'application/vnd.google-apps.video')");
  } else {
    const id = isDriveFileId(folder) ? folder : "root";
    parts.push(`'${escapeDriveQueryValue(id)}' in parents`);
  }
  if (mediaOnly && folder !== "recent-videos") {
    parts.push(
      "(mimeType = 'application/vnd.google-apps.folder' or mimeType contains 'video/' or mimeType contains 'image/' or mimeType = 'application/vnd.google-apps.video')"
    );
  }
  if (qExtra) {
    parts.push(`name contains '${escapeDriveQueryValue(qExtra)}'`);
  }
  return parts.join(" and ");
}

function isVideoMime(mime: string) {
  const m = String(mime || "").toLowerCase();
  return m.startsWith("video/") || m === "application/vnd.google-apps.video";
}

function isImageMime(mime: string) {
  return String(mime || "").toLowerCase().startsWith("image/");
}

function isGoogleNative(mime: string) {
  const m = String(mime || "").toLowerCase();
  return m.startsWith("application/vnd.google-apps") && m !== "application/vnd.google-apps.folder";
}

function enlargeDriveThumb(url: string) {
  return String(url || "")
    .replace(/=s\d+/, "=s400")
    .replace(/([?&])sz=\d+/i, "$1sz=400");
}

function bytesToBase64(bytes: Uint8Array) {
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    for (let j = 0; j < slice.length; j++) {
      binary += String.fromCharCode(slice[j]);
    }
  }
  return btoa(binary);
}

function toBase64Url(bytes: Uint8Array) {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
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
  return toBase64Url(new Uint8Array(buf));
}

function streamTicketMessage(clienteId: string, fileId: string, exp: number) {
  return `v1.${clienteId}.${fileId}.${exp}`;
}

const STREAM_TTL_SEC = 6 * 60 * 60;

async function signDriveStream(secret: string, clienteId: string, fileId: string, exp: number) {
  return hmacSign(secret, streamTicketMessage(clienteId, fileId, exp));
}

function isClienteUuid(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || "").trim());
}

function driveViewUrl(fileId: string) {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

async function fetchAuthorizedBytes(url: string, accessToken: string, maxBytes: number) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const len = Number(res.headers.get("content-length") || 0);
  if (len > maxBytes) {
    try {
      await res.body?.cancel();
    } catch {
      // ignore
    }
    return { tooLarge: true as const, size: len };
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > maxBytes) return { tooLarge: true as const, size: buf.byteLength };
  return {
    bytes: buf,
    contentType: res.headers.get("content-type") || "application/octet-stream",
    size: buf.byteLength,
  };
}

async function handleDriveStream(
  req: Request,
  supabase: SupabaseClient,
  url: URL,
  serviceKey: string
) {
  const clienteId = String(url.searchParams.get("cid") || "").trim();
  const fileId = String(url.searchParams.get("fid") || "").trim();
  const exp = Number(url.searchParams.get("exp") || 0);
  const sig = String(url.searchParams.get("sig") || "").trim();
  if (!isClienteUuid(clienteId) || !fileId || !isDriveFileId(fileId) || fileId === "root" || fileId === "shared") {
    return json({ error: "Link de reprodução inválido" }, 400);
  }
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) {
    return json({ error: "Link de reprodução expirado. Recarregue o anexo." }, 401);
  }
  const expected = await signDriveStream(serviceKey, clienteId, fileId, exp);
  if (!timingSafeEqual(expected, sig)) {
    return json({ error: "Link de reprodução inválido" }, 401);
  }

  const access = await ensureDriveAccess(supabase, clienteId);
  if (access instanceof Response) return access;

  if (String(url.searchParams.get("kind") || "") === "thumb") {
    const meta = await driveFetch(
      access.accessToken,
      `/files/${encodeURIComponent(fileId)}?fields=thumbnailLink,iconLink,mimeType&supportsAllDrives=true`
    );
    const thumbLink = enlargeDriveThumb(String(meta.thumbnailLink || ""));
    if (!thumbLink) {
      return json({ error: "Sem miniatura neste arquivo" }, 404);
    }
    const downloaded = await fetchAuthorizedBytes(
      thumbLink,
      access.accessToken,
      MAX_DRIVE_THUMB_BYTES
    );
    if (!downloaded || "tooLarge" in downloaded || !("bytes" in downloaded)) {
      return json({ error: "Miniatura indisponível" }, 404);
    }
    const mime = downloaded.contentType.startsWith("image/")
      ? downloaded.contentType
      : "image/jpeg";
    const out = new Headers(corsHeaders);
    out.set("Content-Type", mime);
    out.set("Cache-Control", "private, max-age=300");
    if (req.method === "HEAD") {
      out.set("Content-Length", String(downloaded.size));
      return new Response(null, { status: 200, headers: out });
    }
    return new Response(downloaded.bytes, { status: 200, headers: out });
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${access.accessToken}`,
  };
  const range = req.headers.get("Range");
  if (range) headers.Range = range;

  const driveRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
    { method: req.method === "HEAD" ? "HEAD" : "GET", headers }
  );

  const out = new Headers(corsHeaders);
  const contentType = driveRes.headers.get("content-type");
  if (contentType) out.set("Content-Type", contentType);
  const contentLength = driveRes.headers.get("content-length");
  if (contentLength) out.set("Content-Length", contentLength);
  const contentRange = driveRes.headers.get("content-range");
  if (contentRange) out.set("Content-Range", contentRange);
  out.set("Accept-Ranges", driveRes.headers.get("accept-ranges") || "bytes");
  out.set("Cache-Control", "private, max-age=60");

  if (req.method === "HEAD") {
    return new Response(null, { status: driveRes.status, headers: out });
  }
  return new Response(driveRes.body, { status: driveRes.status, headers: out });
}

function isGoogleDriveUploadUrl(value: string) {
  try {
    const parsed = new URL(String(value || ""));
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (host !== "www.googleapis.com" && !host.endsWith(".googleapis.com")) return false;
    return parsed.pathname.includes("/upload/drive/");
  } catch {
    return false;
  }
}

function googleApiErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const err = (payload as { error?: { message?: string } | string }).error;
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object" && typeof err.message === "string" && err.message.trim()) {
    return err.message;
  }
  return fallback;
}

async function startDriveResumableSession(
  accessToken: string,
  opts: { name: string; mimeType: string; size: number; folderId: string }
) {
  const metadata: Record<string, unknown> = { name: opts.name };
  const useFolder =
    Boolean(opts.folderId) &&
    opts.folderId !== "root" &&
    opts.folderId !== "shared" &&
    opts.folderId !== "recent-videos" &&
    isDriveFileId(opts.folderId);
  if (useFolder) metadata.parents = [opts.folderId];

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,mimeType,size,webViewLink,webContentLink,thumbnailLink,iconLink,parents",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": opts.mimeType,
        "X-Upload-Content-Length": String(opts.size),
        Origin: PUBLIC_FALLBACK_ORIGIN,
      },
      body: JSON.stringify(metadata),
    }
  );
  return { res, usedFolder: useFolder };
}

async function handleDriveUploadPut(
  req: Request,
  url: URL,
  serviceKey: string
) {
  const clienteId = String(url.searchParams.get("cid") || "").trim();
  const exp = Number(url.searchParams.get("exp") || 0);
  const sig = String(url.searchParams.get("sig") || "").trim();
  const uploadUrl = String(url.searchParams.get("u") || "").trim();
  if (!isClienteUuid(clienteId) || !isGoogleDriveUploadUrl(uploadUrl)) {
    return json({ error: "Link de envio inválido" }, 400);
  }
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) {
    return json({ error: "Envio expirado. Tente de novo." }, 401);
  }
  const expected = await hmacSign(serviceKey, `v1.uploadput.${clienteId}.${exp}.${uploadUrl}`);
  if (!timingSafeEqual(expected, sig)) {
    return json({ error: "Link de envio inválido" }, 401);
  }

  const headers: Record<string, string> = {};
  const range = req.headers.get("Content-Range");
  if (range) headers["Content-Range"] = range;
  const contentType = req.headers.get("Content-Type");
  if (contentType) headers["Content-Type"] = contentType;
  const contentLength = req.headers.get("Content-Length");
  if (contentLength) headers["Content-Length"] = contentLength;

  const googleRes = await fetch(uploadUrl, {
    method: "PUT",
    headers,
    body: req.body,
  });

  const out = new Headers(corsHeaders);
  const gType = googleRes.headers.get("content-type");
  if (gType) out.set("Content-Type", gType);
  const gRange = googleRes.headers.get("range");
  if (gRange) out.set("Range", gRange);
  return new Response(googleRes.body, { status: googleRes.status, headers: out });
}

async function ensureDriveAccess(
  supabase: SupabaseClient,
  clienteId: string
): Promise<{ accessToken: string } | Response> {
  const { clientId, clientSecret } = await getOAuthClient(supabase);
  if (!clientId || !clientSecret) {
    return json({ error: OAUTH_NOT_CONFIGURED_MESSAGE }, 503);
  }
  const refreshToken = await getClienteRefreshToken(supabase, clienteId);
  if (!refreshToken) {
    return json({ error: "Google Drive não conectado para este cliente", connected: false }, 400);
  }
  try {
    const accessToken = await refreshAccessToken(clientId, clientSecret, refreshToken);
    return { accessToken };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.rpc("set_cliente_google_drive_token", {
      p_cliente_id: clienteId,
      p_refresh_token: null,
      p_status: "error",
      p_last_error: msg,
      p_update_token: false,
    });
    return json({ error: msg, connected: false }, 401);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !supabaseServiceKey) {
    return json({ error: "Configuração do servidor incompleta" }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const url = new URL(req.url);
  const actionFromQuery = url.searchParams.get("action");
  const isOauthCallback =
    req.method === "GET" &&
    (actionFromQuery === "callback" ||
      url.searchParams.has("code") ||
      url.searchParams.has("state") ||
      url.searchParams.has("error"));

  // --- OAuth callback (GET). Sem query na URI cadastrada no Google. ---
  if (isOauthCallback && (url.searchParams.get("state") || "").startsWith("crmcal1.")) {
    const config = await loadCalendarConfig(supabase, { env: name => Deno.env.get(name), supabaseUrl });
    return handleCalendarCallback(req, { service: supabase, config });
  }
  if (isOauthCallback) {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");

    if (oauthError) {
      return htmlPage(
        "Google Drive",
        `<h1>Conexão cancelada</h1><p>${oauthError}</p><p>Pode fechar esta aba.</p>`
      );
    }
    if (!code || !state) {
      return htmlPage("Google Drive", "<h1>Callback inválido</h1><p>Faltam code/state.</p>", 400);
    }

    const { data: st, error: stErr } = await supabase
      .from("google_drive_oauth_state")
      .select("*")
      .eq("state", state)
      .maybeSingle();

    if (stErr || !st) {
      return htmlPage("Google Drive", "<h1>State inválido ou expirado</h1><p>Tente conectar de novo.</p>", 400);
    }

    if (new Date(st.expires_at).getTime() < Date.now()) {
      await supabase.from("google_drive_oauth_state").delete().eq("state", state);
      return htmlPage("Google Drive", "<h1>State expirado</h1><p>Tente conectar de novo.</p>", 400);
    }

    try {
      const { clientId, clientSecret } = await getOAuthClient(supabase);
      if (!clientId || !clientSecret) throw new Error("OAuth Google não configurado no servidor");
      const redirectUri = await getRedirectUri(supabase, supabaseUrl);
      const tokens = await exchangeCode(clientId, clientSecret, code, redirectUri);

      if (!tokens.refresh_token) {
        throw new Error(
          "Google não retornou refresh_token. Revogue o acesso do app em https://myaccount.google.com/permissions e conecte novamente."
        );
      }

      const userInfo = await fetchGoogleUser(tokens.access_token);
      await supabase.rpc("set_cliente_google_drive_token", {
        p_cliente_id: st.cliente_id,
        p_refresh_token: tokens.refresh_token,
        p_google_email: userInfo.email,
        p_google_account_id: userInfo.id,
        p_scopes: tokens.scope || DRIVE_SCOPES,
        p_connected_by: st.user_id,
        p_status: "connected",
        p_last_error: null,
        p_update_token: true,
      });

      await supabase.from("google_drive_oauth_state").delete().eq("state", state);

      const appOrigin =
        (await getSecret(supabase, "GOOGLE_DRIVE_APP_ORIGIN")) ||
        Deno.env.get("GOOGLE_DRIVE_APP_ORIGIN") ||
        "";
      const returnTo = (st.return_to || "/crm/canais").replace(/[^a-zA-Z0-9/_?#&=.-]/g, "");
      const hashPath = returnTo.startsWith("/") ? returnTo : `/${returnTo}`;
      const sep = hashPath.includes("?") ? "&" : "?";
      const target = appOrigin
        ? `${appOrigin.replace(/\/$/, "")}/#${hashPath}${sep}google_drive=connected`
        : "";

      if (target) {
        return new Response(null, {
          status: 302,
          headers: { ...corsHeaders, Location: target },
        });
      }

      return htmlPage(
        "Google Drive conectado",
        `<h1>Google Drive conectado</h1>
         <p>Conta: <strong>${userInfo.email || "ok"}</strong></p>
         <p>Pode fechar esta aba e voltar ao Planeje.</p>
         <script>try{window.close()}catch(e){}</script>`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase.rpc("set_cliente_google_drive_token", {
        p_cliente_id: st.cliente_id,
        p_refresh_token: null,
        p_status: "error",
        p_last_error: msg,
        p_update_token: false,
      });
      await supabase.from("google_drive_oauth_state").delete().eq("state", state);
      return htmlPage("Erro Google Drive", `<h1>Falha na conexão</h1><p>${msg}</p>`, 500);
    }
  }

  if (
    (req.method === "GET" || req.method === "HEAD") &&
    actionFromQuery === "stream"
  ) {
    return handleDriveStream(req, supabase, url, supabaseServiceKey);
  }

  if (req.method === "PUT" && actionFromQuery === "upload-put") {
    return handleDriveUploadPut(req, url, supabaseServiceKey);
  }

  if (req.method !== "POST") {
    return json({ error: "Método não permitido" }, 405);
  }

  let body: Record<string, unknown> = {};
  try {
    const raw = await req.json();
    body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  } catch {
    return json({ error: "Body JSON inválido" }, 400);
  }

  const action = typeof body.action === "string" ? body.action : "";
  const bodyClienteId =
    typeof body.clienteId === "string"
      ? body.clienteId
      : typeof body.cliente_id === "string"
        ? body.cliente_id
        : null;

  if (action === "oauth-config") {
    const auth = await resolveUser(supabase, req);
    if (auth instanceof Response) return auth;
    if (auth.profile.role !== "superadmin") {
      return json({ error: "Somente superadmin consulta o OAuth da agência" }, 403);
    }
    const secrets = await readOAuthSecrets(supabase);
    const redirectUri = await getRedirectUri(supabase, supabaseUrl);
    const appOrigin = (await getSecret(supabase, "GOOGLE_DRIVE_APP_ORIGIN")) || "";
    return json({
      oauthConfigured: secrets.oauthConfigured,
      hasClientId: secrets.hasClientId,
      hasClientSecret: secrets.hasClientSecret,
      usingAdsFallback: secrets.usingAdsFallback,
      redirectUri,
      appOrigin,
      settingsPath: GOOGLE_DRIVE_SETTINGS_PATH,
    });
  }

  const caller = await resolveCaller(supabase, req, bodyClienteId);
  if (caller instanceof Response) return caller;
  const { userId, clienteId } = caller;

  try {
    if (action === "status" || action === "check-connection") {
      const [{ data: conn }, hasToken] = await Promise.all([
        supabase
          .from("cliente_google_drive_connection")
          .select("google_email, status, connected_at, last_error, scopes")
          .eq("cliente_id", clienteId)
          .maybeSingle(),
        supabase.rpc("cliente_has_google_drive_token", { p_cliente_id: clienteId }),
      ]);
      const connected = !!(hasToken.data && conn?.status === "connected");
      return json({
        connected,
        hasToken: !!hasToken.data,
        email: conn?.google_email || null,
        status: conn?.status || "disconnected",
        connectedAt: conn?.connected_at || null,
        lastError: conn?.last_error || null,
        scopes: conn?.scopes || null,
        oauthConfigured: (await getOAuthClient(supabase)).oauthConfigured,
      });
    }

    if (action === "get-auth-url") {
      const { clientId, clientSecret } = await getOAuthClient(supabase);
      if (!clientId || !clientSecret) {
        return json({ error: OAUTH_NOT_CONFIGURED_MESSAGE }, 503);
      }
      const redirectUri = await getRedirectUri(supabase, supabaseUrl);
      const state = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
      const returnTo =
        typeof body.returnTo === "string" && body.returnTo.trim()
          ? body.returnTo.trim()
          : typeof body.return_to === "string" && body.return_to.trim()
            ? body.return_to.trim()
            : "/crm/canais";

      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const { error: insErr } = await supabase.from("google_drive_oauth_state").insert({
        state,
        cliente_id: clienteId,
        user_id: userId,
        return_to: returnTo,
        expires_at: expiresAt,
      });
      if (insErr) throw new Error(insErr.message);

      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", DRIVE_SCOPES);
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent");
      authUrl.searchParams.set("state", state);

      return json({ url: authUrl.toString(), redirectUri });
    }

    if (action === "disconnect") {
      const { error } = await supabase.rpc("clear_cliente_google_drive_connection", {
        p_cliente_id: clienteId,
      });
      if (error) throw new Error(error.message);
      return json({ ok: true, connected: false });
    }

    if (action === "list") {
      const access = await ensureDriveAccess(supabase, clienteId);
      if (access instanceof Response) return access;

      const folderId =
        typeof body.folderId === "string" && body.folderId.trim()
          ? body.folderId.trim()
          : "root";
      const pageToken =
        typeof body.pageToken === "string" && body.pageToken.trim()
          ? body.pageToken.trim()
          : null;
      const qExtra =
        typeof body.q === "string" && body.q.trim() ? body.q.trim() : "";
      const mediaOnly = body.mediaOnly !== false;

      const params = new URLSearchParams({
        q: buildDriveListQuery(folderId, qExtra, mediaOnly),
        pageSize: "50",
        fields:
          "nextPageToken, files(id,name,mimeType,size,modifiedTime,webViewLink,webContentLink,iconLink,thumbnailLink,parents)",
        orderBy: folderId === "recent-videos" ? "modifiedTime desc" : "folder,name_natural",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
      });
      if (pageToken) params.set("pageToken", pageToken);

      const data = await driveFetch(access.accessToken, `/files?${params.toString()}`);
      const files = Array.isArray(data.files)
        ? (data.files as Record<string, unknown>[]).map(mapFile)
        : [];
      return json({
        files,
        nextPageToken: data.nextPageToken || null,
        folderId,
      });
    }

    if (action === "get-file") {
      const fileId = typeof body.fileId === "string" ? body.fileId.trim() : "";
      if (!fileId) return json({ error: "fileId obrigatório" }, 400);
      const access = await ensureDriveAccess(supabase, clienteId);
      if (access instanceof Response) return access;

      const data = await driveFetch(
        access.accessToken,
        `/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,modifiedTime,webViewLink,webContentLink,iconLink,thumbnailLink,parents&supportsAllDrives=true`
      );
      return json({ file: mapFile(data) });
    }

    if (action === "upload-session") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const mimeType =
        typeof body.mimeType === "string" && body.mimeType.trim()
          ? body.mimeType.trim()
          : "application/octet-stream";
      const folderId =
        typeof body.folderId === "string" && body.folderId.trim()
          ? body.folderId.trim()
          : "root";
      const size = Number(body.size);
      if (!name) return json({ error: "Nome do arquivo obrigatório" }, 400);
      if (!Number.isFinite(size) || size <= 0) {
        return json({ error: "Tamanho do arquivo obrigatório" }, 400);
      }
      if (size > 2 * 1024 * 1024 * 1024) {
        return json({ error: "Arquivo maior que 2 GB. Envie pelo site do Drive e escolha aqui." }, 413);
      }

      const access = await ensureDriveAccess(supabase, clienteId);
      if (access instanceof Response) return access;

      let started = await startDriveResumableSession(access.accessToken, {
        name,
        mimeType,
        size,
        folderId,
      });
      let storedInRoot = false;
      if (!started.res.ok && started.usedFolder) {
        const failText = await started.res.text();
        let failJson: unknown = {};
        try {
          failJson = JSON.parse(failText);
        } catch {
          failJson = {};
        }
        const failMsg = googleApiErrorMessage(failJson, failText || `HTTP ${started.res.status}`);
        if (/not found|insufficient|permission|forbidden/i.test(failMsg)) {
          started = await startDriveResumableSession(access.accessToken, {
            name,
            mimeType,
            size,
            folderId: "root",
          });
          storedInRoot = true;
        } else {
          return json({ error: failMsg || "Google recusou o envio" }, 400);
        }
      }
      if (!started.res.ok) {
        const failText = await started.res.text();
        let failJson: unknown = {};
        try {
          failJson = JSON.parse(failText);
        } catch {
          failJson = {};
        }
        return json(
          { error: googleApiErrorMessage(failJson, failText || `Upload falhou (${started.res.status})`) },
          400
        );
      }
      const uploadUrl = started.res.headers.get("Location") || "";
      if (!isGoogleDriveUploadUrl(uploadUrl)) {
        return json({ error: "Google não iniciou o envio" }, 502);
      }
      const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
      const exp = Math.floor(Date.now() / 1000) + 6 * 60 * 60;
      const sig = await hmacSign(secret, `v1.uploadput.${clienteId}.${exp}.${uploadUrl}`);
      const params = new URLSearchParams({
        action: "upload-put",
        cid: clienteId,
        exp: String(exp),
        sig,
        u: uploadUrl,
      });
      const origin = publicStorageOrigin(supabaseUrl);
      const proxyPath = `/functions/v1/google-drive-api?${params.toString()}`;
      return json({
        uploadUrl,
        proxyPath,
        proxyUrl: `${origin}${proxyPath}`,
        storedInRoot,
        expiresAt: exp,
      });
    }

    if (action === "upload") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const mimeType =
        typeof body.mimeType === "string" && body.mimeType.trim()
          ? body.mimeType.trim()
          : "application/octet-stream";
      const contentBase64 =
        typeof body.contentBase64 === "string" ? body.contentBase64 : "";
      const folderId =
        typeof body.folderId === "string" && body.folderId.trim()
          ? body.folderId.trim()
          : "root";

      if (!name || !contentBase64) {
        return json({ error: "name e contentBase64 são obrigatórios" }, 400);
      }

      // Limite ~8MB no corpo (base64)
      if (contentBase64.length > 11_000_000) {
        return json({ error: "Arquivo muito grande (máx. ~8 MB via upload direto)" }, 413);
      }

      const access = await ensureDriveAccess(supabase, clienteId);
      if (access instanceof Response) return access;

      const binary = Uint8Array.from(atob(contentBase64), (c) => c.charCodeAt(0));
      const metadata = {
        name,
        parents: folderId && folderId !== "root" ? [folderId] : undefined,
      };

      const boundary = "planeje_drive_" + crypto.randomUUID().replace(/-/g, "");
      const metaPart = JSON.stringify(metadata);
      const encoder = new TextEncoder();
      const preamble = encoder.encode(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaPart}\r\n` +
          `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
      );
      const epilogue = encoder.encode(`\r\n--${boundary}--`);
      const bodyBytes = new Uint8Array(preamble.length + binary.length + epilogue.length);
      bodyBytes.set(preamble, 0);
      bodyBytes.set(binary, preamble.length);
      bodyBytes.set(epilogue, preamble.length + binary.length);

      const uploadRes = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink,webContentLink,thumbnailLink,iconLink,parents&supportsAllDrives=true",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${access.accessToken}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body: bodyBytes,
        }
      );
      const uploadText = await uploadRes.text();
      let uploaded: Record<string, unknown> = {};
      try {
        uploaded = JSON.parse(uploadText);
      } catch {
        uploaded = {};
      }
      if (!uploadRes.ok) {
        const err = uploaded.error as { message?: string } | undefined;
        throw new Error(err?.message || `Upload falhou (${uploadRes.status})`);
      }

      return json({ file: mapFile(uploaded) });
    }

    if (action === "stream-url") {
      const fileId = typeof body.fileId === "string" ? body.fileId.trim() : "";
      if (!fileId || !isDriveFileId(fileId) || fileId === "root" || fileId === "shared") {
        return json({ error: "fileId obrigatório" }, 400);
      }
      const access = await ensureDriveAccess(supabase, clienteId);
      if (access instanceof Response) return access;
      const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
      const exp = Math.floor(Date.now() / 1000) + STREAM_TTL_SEC;
      const sig = await signDriveStream(secret, clienteId, fileId, exp);
      const params = new URLSearchParams({
        action: "stream",
        cid: clienteId,
        fid: fileId,
        exp: String(exp),
        sig,
      });
      const path = `/functions/v1/google-drive-api?${params.toString()}`;
      const origin = publicStorageOrigin(supabaseUrl);
      return json({ path, url: `${origin}${path}`, expiresAt: exp });
    }

    if (action === "preview-thumb") {
      const fileId = typeof body.fileId === "string" ? body.fileId.trim() : "";
      if (!fileId || !isDriveFileId(fileId) || fileId === "root" || fileId === "shared") {
        return json({ error: "fileId obrigatório" }, 400);
      }
      const access = await ensureDriveAccess(supabase, clienteId);
      if (access instanceof Response) return access;

      const meta = await driveFetch(
        access.accessToken,
        `/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,thumbnailLink,iconLink&supportsAllDrives=true`
      );
      const thumbLink = enlargeDriveThumb(String(meta.thumbnailLink || ""));
      if (!thumbLink) return json({ dataUrl: null, file: mapFile(meta) });
      const downloaded = await fetchAuthorizedBytes(
        thumbLink,
        access.accessToken,
        MAX_DRIVE_THUMB_BYTES
      );
      if (!downloaded || "tooLarge" in downloaded || !("bytes" in downloaded)) {
        return json({ dataUrl: null, file: mapFile(meta) });
      }
      const mime = downloaded.contentType.startsWith("image/")
        ? downloaded.contentType
        : "image/jpeg";
      return json({
        dataUrl: `data:${mime};base64,${bytesToBase64(downloaded.bytes)}`,
        file: mapFile(meta),
      });
    }

    if (action === "sync-file") {
      const fileId = typeof body.fileId === "string" ? body.fileId.trim() : "";
      if (!fileId || !isDriveFileId(fileId) || fileId === "root" || fileId === "shared") {
        return json({ error: "fileId obrigatório" }, 400);
      }
      const access = await ensureDriveAccess(supabase, clienteId);
      if (access instanceof Response) return access;

      const meta = await driveFetch(
        access.accessToken,
        `/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,modifiedTime,webViewLink,webContentLink,iconLink,thumbnailLink,parents&supportsAllDrives=true`
      );
      const file = mapFile(meta);
      const mime = String(file.mimeType || "");
      if (file.isFolder) {
        return json({ error: "Escolha um arquivo, não uma pasta" }, 400);
      }

      const driveUrl = String(file.webViewLink || driveViewUrl(fileId));
      const sizeKnown = Number(file.size || 0);
      let skipReason: string | null = null;
      if (isGoogleNative(mime) && !isVideoMime(mime) && !isImageMime(mime)) {
        skipReason = "google_native";
      }

      return json({
        file,
        mimeType: mime,
        size: sizeKnown || null,
        driveUrl,
        previewUrl: `https://drive.google.com/file/d/${fileId}/preview`,
        thumbnailUrl: null,
        syncedUrl: null,
        playUrl: driveUrl,
        synced: false,
        stored: false,
        skipReason,
      });
    }

    if (action === "file-info") {
      const fileId = typeof body.fileId === "string" ? body.fileId.trim() : "";
      if (!fileId || !isDriveFileId(fileId) || fileId === "root" || fileId === "shared" || fileId === "recent-videos") {
        return json({ error: "fileId obrigatório" }, 400);
      }
      const access = await ensureDriveAccess(supabase, clienteId);
      if (access instanceof Response) return access;
      const meta = await driveFetch(
        access.accessToken,
        `/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,modifiedTime,webViewLink,iconLink,thumbnailLink&supportsAllDrives=true`
      );
      return json({ file: mapFile(meta) });
    }

    if (action === "read-range") {
      const fileId = typeof body.fileId === "string" ? body.fileId.trim() : "";
      const offset = Math.max(0, Math.floor(Number(body.offset || 0)));
      const length = Math.floor(Number(body.length || 0));
      if (!fileId || !isDriveFileId(fileId) || fileId === "root" || fileId === "shared" || fileId === "recent-videos") {
        return json({ error: "fileId obrigatório" }, 400);
      }
      if (!Number.isFinite(offset) || !Number.isFinite(length) || length < 1) {
        return json({ error: "Trecho inválido" }, 400);
      }
      if (length > 8 * 1024 * 1024) {
        return json({ error: "Trecho maior que 8 MB" }, 400);
      }
      const access = await ensureDriveAccess(supabase, clienteId);
      if (access instanceof Response) return access;
      const end = offset + length - 1;
      const driveRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
        {
          headers: {
            Authorization: `Bearer ${access.accessToken}`,
            Range: `bytes=${offset}-${end}`,
          },
        }
      );
      if (!driveRes.ok && driveRes.status !== 206) {
        const errText = await driveRes.text();
        return json({ error: errText.slice(0, 220) || "Falha ao ler o Drive" }, driveRes.status === 401 ? 401 : 400);
      }
      const out = new Headers(corsHeaders);
      out.set("Content-Type", driveRes.headers.get("content-type") || "application/octet-stream");
      const contentLength = driveRes.headers.get("content-length");
      if (contentLength) out.set("Content-Length", contentLength);
      const contentRange = driveRes.headers.get("content-range");
      if (contentRange) out.set("Content-Range", contentRange);
      out.set("Cache-Control", "no-store");
      return new Response(driveRes.body, { status: driveRes.status, headers: out });
    }

    // Copia o arquivo do Drive para Storage público temporário — a Meta precisa baixar sem login.
    if (action === "stage-for-meta") {
      const fileId = typeof body.fileId === "string" ? body.fileId.trim() : "";
      if (!fileId || !isDriveFileId(fileId) || fileId === "root" || fileId === "shared" || fileId === "recent-videos") {
        return json({ error: "fileId obrigatório" }, 400);
      }
      if (!bodyClienteId || !isClienteUuid(bodyClienteId)) {
        return json({ error: "clienteId obrigatório" }, 400);
      }
      const access = await ensureDriveAccess(supabase, bodyClienteId);
      if (access instanceof Response) return access;

      const meta = await driveFetch(
        access.accessToken,
        `/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,webViewLink&supportsAllDrives=true`
      );
      const file = mapFile(meta);
      const mime = String(file.mimeType || "application/octet-stream");
      if (file.isFolder) {
        return json({ error: "Escolha um arquivo de imagem ou vídeo, não uma pasta" }, 400);
      }
      if (isGoogleNative(mime) && !isVideoMime(mime) && !isImageMime(mime)) {
        return json({ error: "Este tipo de arquivo do Drive não pode ir para a Meta. Exporte como JPG/PNG/MP4." }, 400);
      }
      if (!isImageMime(mime) && !isVideoMime(mime)) {
        return json({ error: "Só imagem ou vídeo para publicar na Meta" }, 400);
      }

      const MAX_STAGE_BYTES = 40 * 1024 * 1024;
      const sizeKnown = Number(file.size || 0);
      if (sizeKnown > MAX_STAGE_BYTES) {
        return json({ error: "Arquivo maior que 40 MB. Exporte um MP4 H.264 de até 40 MB para publicar ou agendar; o original pode ficar no Drive." }, 400);
      }

      const mediaUrl =
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}` +
        `?alt=media&supportsAllDrives=true`;
      const downloaded = await fetchAuthorizedBytes(mediaUrl, access.accessToken, MAX_STAGE_BYTES);
      if (!downloaded) {
        return json({ error: "Não foi possível baixar o arquivo do Drive" }, 502);
      }
      if ("tooLarge" in downloaded) {
        return json({ error: "Arquivo maior que 40 MB. Exporte um MP4 H.264 de até 40 MB para publicar ou agendar; o original pode ficar no Drive." }, 400);
      }

      const safeName = String(file.name || "media")
        .replace(/[^\w.\-]+/g, "_")
        .slice(0, 80) || "media";
      const storagePath = `meta-publish-temp/${bodyClienteId}/${crypto.randomUUID()}/${safeName}`;
      const uploadRes = await fetch(
        `${supabaseUrl}/storage/v1/object/task-drive/${storagePath}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseServiceKey}`,
            apikey: supabaseServiceKey,
            "Content-Type": downloaded.contentType || mime,
            "x-upsert": "true",
          },
          body: downloaded.bytes,
        }
      );
      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        console.error("stage-for-meta upload failed", uploadRes.status, errText.slice(0, 200));
        return json({ error: "Falha ao preparar mídia pública para a Meta" }, 502);
      }

      const origin = publicStorageOrigin(supabaseUrl);
      const publicUrl = `${origin}/storage/v1/object/public/task-drive/${storagePath}`;
      return json({
        publicUrl,
        storagePath,
        mimeType: downloaded.contentType || mime,
        name: file.name,
        size: downloaded.size,
        driveFileId: fileId,
        temporary: true,
      });
    }

    return json({ error: `Ação desconhecida: ${action}` }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("google-drive-api error:", msg);
    return json({ error: msg }, 500);
  }
});
