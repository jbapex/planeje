/** Miniatura de anúncio: um arquivo no Storage do Planeje, não Base64 no lead. */

import { rewritePublicStorageUrl } from './publicStorageUrl.js';

export const AD_THUMBNAIL_BUCKET = 'ad-thumbnails';

const ALLOWED_HOST_SUFFIXES = [
  '.fbcdn.net',
  '.facebook.com',
  '.fbsbx.com',
  '.cdninstagram.com',
  '.instagram.com',
  '.whatsapp.net',
];

const ALLOWED_HOSTS = new Set(['facebook.com', 'instagram.com', 'whatsapp.net']);

export const AD_THUMB_QUALITY_TAG = 'q2';

export function enlargePreviewUrl(url) {
  const value = String(url || '').trim();
  if (!value) return value;
  return value
    .replace(/stp=dst-jpg_s\d+x\d+/gi, 'stp=dst-jpg_s720x720')
    .replace(/([_-])p\d+x\d+/gi, '$1p720x720')
    .replace(/\/s\d+x\d+\//gi, '/s720x720/')
    .replace(/\/p\d+x\d+\//gi, '/p720x720/')
    .replace(/[_-]s\d+x\d+([./?])/gi, '_s720x720$1');
}

export function isAllowedThumbnailUrl(url) {
  try {
    const parsed = new URL(String(url || '').trim());
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (ALLOWED_HOSTS.has(host)) return true;
    return ALLOWED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
  } catch {
    return false;
  }
}

export function rewriteStoredThumbUrl(url) {
  const value = rewritePublicStorageUrl(url);
  if (!value) return value;
  let out = value;
  if (isPlanejeStoredThumb(out) && !/[?&]v=/.test(out)) {
    out += `${out.includes('?') ? '&' : '?'}v=${AD_THUMB_QUALITY_TAG}`;
  }
  return out;
}

export function isPlanejeStoredThumb(url) {
  const value = String(url || '').trim();
  if (!value) return false;
  return /\/storage\/v1\/object\/public\/ad-thumbnails\//i.test(value);
}

export function thumbnailAssetKey(adId) {
  const digits = String(adId || '').replace(/\D/g, '');
  if (digits.length >= 5) return `ad:${digits}`;
  return null;
}

export function storagePathFromAssetKey(assetKey, ext = 'jpg') {
  const safe = String(assetKey || '')
    .replace(/[^a-zA-Z0-9:_-]/g, '')
    .replace(/:/g, '_');
  const suffix = String(ext || 'jpg').replace(/[^a-z0-9]/gi, '') || 'jpg';
  return `${safe}.${suffix}`;
}

export async function thumbnailUrlAssetKey(sourceUrl) {
  const url = String(sourceUrl || '').trim();
  if (!url) return null;
  const bytes = new TextEncoder().encode(url);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
  return `url:${hex}`;
}

function firstUrl(values) {
  for (const value of values) {
    const text = value == null ? '' : String(value).trim();
    if (text) return text;
  }
  return null;
}

export function preferredThumbnailUrl(tracking) {
  const td = tracking && typeof tracking === 'object' ? tracking : {};
  const ad = td.meta_ad_details?.ad && typeof td.meta_ad_details.ad === 'object'
    ? td.meta_ad_details.ad
    : {};
  const candidates = [
    td.thumbnail_stored_url,
    ad.thumbnail_stored_url,
    ad.thumbnail_url,
    td.thumbnailURL,
    td.thumbnail_url,
    ad.image_url,
  ];
  const stored = candidates.find((item) => isPlanejeStoredThumb(item));
  if (stored) return rewriteStoredThumbUrl(String(stored).trim());
  return firstUrl(candidates);
}
