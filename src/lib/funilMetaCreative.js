import { supabase } from '@/lib/customSupabaseClient';
import { rewriteStoredThumbUrl } from '@/lib/adThumbnail';

const creativeCache = new Map();

/**
 * Busca miniatura e nome do anúncio Meta (Graph API via meta-ads-api).
 * @param {string} adId
 * @returns {Promise<{ thumbnailUrl: string|null, name: string|null }|null>}
 */
export async function fetchMetaAdCreative(adId) {
  if (!adId) return null;
  const key = String(adId);
  if (creativeCache.has(key)) return creativeCache.get(key);

  try {
    const { data, error } = await supabase.functions.invoke('meta-ads-api', {
      body: { action: 'get-ad-by-id', adId: key, thumbnail_size: 'large' },
    });
    if (error) throw error;
    if (data?.error?.message) throw new Error(data.error.message);

    const result = {
      thumbnailUrl: rewriteStoredThumbUrl(data?.ad?.thumbnail_stored_url || data?.ad?.thumbnail_url || '') || null,
      name: data?.ad?.name || null,
    };
    creativeCache.set(key, result);
    return result;
  } catch (err) {
    console.error('[fetchMetaAdCreative]', err);
    return { thumbnailUrl: null, name: null };
  }
}

export function clearMetaAdCreativeCache() {
  creativeCache.clear();
}

export const FUNIL_CREATIVE_NODE_TYPES = new Set([
  'video-ad',
  'image-ad',
  'story-ad',
  'copy-text',
]);

export function isFunilCreativeNodeType(type) {
  return FUNIL_CREATIVE_NODE_TYPES.has(type);
}
