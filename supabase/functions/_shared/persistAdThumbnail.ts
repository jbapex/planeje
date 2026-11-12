/**
 * Copia a miniatura do anúncio uma vez para o Storage do Planeje.
 * Não grava Base64 no JSON do lead.
 */

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
  return pub || raw;
}

function toPublicThumbUrl(url: string, supabaseUrl: string): string {
  const value = String(url || "").trim();
  if (!value) return value;
  const origin = publicStorageOrigin(supabaseUrl);
  try {
    const parsed = new URL(value);
    if (isInternalStorageOrigin(`${parsed.protocol}//${parsed.host}`)) {
      return `${origin}${parsed.pathname}${parsed.search}`;
    }
  } catch {
    return value;
  }
  return value;
}

export const AD_THUMBNAIL_BUCKET = "ad-thumbnails";
const MAX_BYTES = 2 * 1024 * 1024;
const FETCH_MS = 12000;
const MIN_KEEP_BYTES = 8 * 1024;

const ALLOWED_HOST_SUFFIXES = [
  ".fbcdn.net",
  ".facebook.com",
  ".fbsbx.com",
  ".cdninstagram.com",
  ".instagram.com",
  ".whatsapp.net",
];
const ALLOWED_HOSTS = new Set(["facebook.com", "instagram.com", "whatsapp.net"]);

type SupabaseLike = {
  from: (table: string) => any;
  storage: { from: (bucket: string) => any };
};

function enlargePreviewUrl(url: string): string {
  const value = String(url || "").trim();
  if (!value) return value;
  // A Meta assina o tamanho. Trocar p64/p1080 na query invalida oh/oe e a foto não abre.
  if (/[?&](?:oh|oe|_nc_ohc)=/i.test(value)) return value;
  return value
    .replace(/stp=dst-jpg_s\d+x\d+/gi, "stp=dst-jpg_s720x720")
    .replace(/([_-])p\d+x\d+/gi, "$1p720x720")
    .replace(/\/s\d+x\d+\//gi, "/s720x720/")
    .replace(/\/p\d+x\d+\//gi, "/p720x720/")
    .replace(/[_-]s\d+x\d+([./?])/gi, "_s720x720$1");
}

function withCacheBust(url: string, byteSize: number | null | undefined): string {
  const value = String(url || "").trim();
  if (!value) return value;
  const version = Number(byteSize) > 0 ? String(byteSize) : String(Date.now());
  try {
    const parsed = new URL(value);
    parsed.searchParams.set("v", version);
    return parsed.toString();
  } catch {
    return `${value}${value.includes("?") ? "&" : "?"}v=${version}`;
  }
}

export function isAllowedThumbnailUrl(url: string): boolean {
  try {
    const parsed = new URL(String(url || "").trim());
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (ALLOWED_HOSTS.has(host)) return true;
    return ALLOWED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
  } catch {
    return false;
  }
}

export function isPlanejeStoredThumb(url: string): boolean {
  return /\/storage\/v1\/object\/public\/ad-thumbnails\//i.test(String(url || "").trim());
}

function storagePathFromAssetKey(assetKey: string, ext: string): string {
  const safe = String(assetKey || "")
    .replace(/[^a-zA-Z0-9:_-]/g, "")
    .replace(/:/g, "_");
  const suffix = String(ext || "jpg").replace(/[^a-z0-9]/gi, "") || "jpg";
  return `${safe}.${suffix}`;
}

function extFromContentType(contentType: string, bytes: Uint8Array): string {
  const type = String(contentType || "").toLowerCase();
  if (type.includes("png") || looksPng(bytes)) return "png";
  if (type.includes("webp") || looksWebp(bytes)) return "webp";
  if (type.includes("gif") || looksGif(bytes)) return "gif";
  return "jpg";
}

function looksJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}
function looksPng(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}
function looksGif(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46;
}
function looksWebp(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  const webp = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  return riff === "RIFF" && webp === "WEBP";
}

function looksLikeImage(bytes: Uint8Array): boolean {
  return looksJpeg(bytes) || looksPng(bytes) || looksGif(bytes) || looksWebp(bytes);
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function thumbnailAssetKey(adId?: string | null, sourceUrl?: string | null): Promise<string | null> {
  const digits = String(adId || "").replace(/\D/g, "");
  if (digits.length >= 5) return `ad:${digits}`;
  const url = String(sourceUrl || "").trim();
  if (!url) return null;
  return `url:${(await sha256Hex(url)).slice(0, 32)}`;
}

async function readLimitedBody(res: Response): Promise<Uint8Array | null> {
  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    return buf.byteLength > MAX_BYTES ? null : buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      try { await reader.cancel(); } catch { /* ignore */ }
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

async function downloadImage(url: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  if (!url || !isAllowedThumbnailUrl(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { Accept: "image/*,*/*;q=0.8" },
    });
    if (!res.ok) return null;
    const finalUrl = String(res.url || url);
    if (finalUrl && !isAllowedThumbnailUrl(finalUrl) && !isPlanejeStoredThumb(finalUrl)) return null;
    const bytes = await readLimitedBody(res);
    if (!bytes || bytes.byteLength < 32 || !looksLikeImage(bytes)) return null;
    const contentType = String(res.headers.get("content-type") || "image/jpeg").split(";")[0].trim() || "image/jpeg";
    return { bytes, contentType };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function existingIsLargeEnough(byteSize: unknown): boolean {
  return Number(byteSize) >= MIN_KEEP_BYTES;
}

export async function persistAdThumbnail(
  supabase: SupabaseLike,
  opts: { adId?: string | null; sourceUrl?: string | null; supabaseUrl: string }
): Promise<string | null> {
  const originalUrl = String(opts.sourceUrl || "").trim();
  if (isPlanejeStoredThumb(originalUrl)) {
    return withCacheBust(toPublicThumbUrl(originalUrl, opts.supabaseUrl), null);
  }

  if (!originalUrl || !isAllowedThumbnailUrl(originalUrl)) {
    const keyOnly = await thumbnailAssetKey(opts.adId, null);
    if (keyOnly) {
      const { data } = await supabase
        .from("meta_ad_thumbnails")
        .select("public_url, byte_size")
        .eq("asset_key", keyOnly)
        .maybeSingle();
      if (data?.public_url) {
        return withCacheBust(toPublicThumbUrl(String(data.public_url), opts.supabaseUrl), data.byte_size);
      }
    }
    return null;
  }

  try {
    const assetKey = await thumbnailAssetKey(opts.adId, originalUrl);
    if (!assetKey) return null;

    const { data: existing } = await supabase
      .from("meta_ad_thumbnails")
      .select("public_url, byte_size")
      .eq("asset_key", assetKey)
      .maybeSingle();
    if (existing?.public_url && existingIsLargeEnough(existing.byte_size)) {
      return withCacheBust(toPublicThumbUrl(String(existing.public_url), opts.supabaseUrl), existing.byte_size);
    }

    const enlarged = enlargePreviewUrl(originalUrl);
    const downloaded = await downloadImage(enlarged)
      || (enlarged !== originalUrl ? await downloadImage(originalUrl) : null);
    if (!downloaded) {
      if (existing?.public_url) {
        return withCacheBust(toPublicThumbUrl(String(existing.public_url), opts.supabaseUrl), existing.byte_size);
      }
      return null;
    }

    const { bytes, contentType } = downloaded;
    const ext = extFromContentType(contentType, bytes);
    const path = storagePathFromAssetKey(assetKey, ext);
    const mime = contentType.startsWith("image/") ? contentType : `image/${ext === "jpg" ? "jpeg" : ext}`;

    const { error: upErr } = await supabase.storage.from(AD_THUMBNAIL_BUCKET).upload(path, bytes, {
      contentType: mime,
      upsert: true,
      cacheControl: "86400",
    });
    if (upErr) {
      console.error("[persistAdThumbnail] upload", upErr.message || upErr);
      if (existing?.public_url) {
        return withCacheBust(toPublicThumbUrl(String(existing.public_url), opts.supabaseUrl), existing.byte_size);
      }
      return null;
    }

    const base = publicStorageOrigin(opts.supabaseUrl);
    const publicUrl = `${base}/storage/v1/object/public/${AD_THUMBNAIL_BUCKET}/${path}`;
    const adDigits = String(opts.adId || "").replace(/\D/g, "") || null;

    const { error: insErr } = await supabase.from("meta_ad_thumbnails").upsert(
      {
        asset_key: assetKey,
        ad_id: adDigits && adDigits.length >= 5 ? adDigits : null,
        storage_path: path,
        public_url: publicUrl,
        source_url: originalUrl.slice(0, 2000),
        byte_size: bytes.byteLength,
        content_type: mime,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "asset_key" }
    );
    if (insErr) {
      console.error("[persistAdThumbnail] row", insErr.message || insErr);
    }
    return withCacheBust(publicUrl, bytes.byteLength);
  } catch (err) {
    console.error("[persistAdThumbnail]", err?.message || err);
    return null;
  }
}

export async function attachStoredThumbnail(
  supabase: SupabaseLike,
  tracking: Record<string, unknown> | null | undefined,
  supabaseUrl: string
): Promise<Record<string, unknown> | null> {
  if (!tracking || typeof tracking !== "object") return tracking ?? null;
  const details = tracking.meta_ad_details && typeof tracking.meta_ad_details === "object"
    ? tracking.meta_ad_details as Record<string, unknown>
    : null;
  const ad = details?.ad && typeof details.ad === "object" ? details.ad as Record<string, unknown> : null;
  const source = String(
    tracking.thumbnailURL || tracking.thumbnail_url || ad?.thumbnail_url || ad?.image_url || ad?.thumbnail_stored_url || ""
  ).trim();
  const adId = String(tracking.source_id || tracking.ad_id || tracking.sourceID || ad?.id || "").replace(/\D/g, "");
  if (!source && !adId) return tracking;
  const stored = await persistAdThumbnail(supabase, { adId, sourceUrl: source, supabaseUrl });
  if (!stored) return tracking;
  return { ...tracking, thumbnail_stored_url: stored };
}
