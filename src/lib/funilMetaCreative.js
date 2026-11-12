import { supabase } from '@/lib/customSupabaseClient';
import { rewriteStoredThumbUrl } from '@/lib/adThumbnail';
import { mergeMetaAdEnrichment, metaAdIdentity, metaAdIds } from '../../supabase/functions/_shared/metaAdEnrichment.js';

const creativeCache = new Map();

/**
 * Busca miniatura e nome do anúncio Meta (Graph API via meta-ads-api).
 * @param {string} adId
 * @returns {Promise<{ thumbnailUrl: string|null, name: string|null, ad: object|null, accountName: string|null }|null>}
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
      ad: data?.ad || null,
      accountName: data?.accountName || null,
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

/** A RLS vigente decide a escrita; conflito ou falta de acesso não interrompem a ficha. */
export async function persistContactMetaAdIdentity({ clienteId, contactId, ad, accountName }) {
  if (!clienteId || !contactId || !ad) return false;
  try {
    const { data: current, error } = await supabase.from('cliente_whatsapp_contact')
      .select('id,tracking_data,updated_at').eq('cliente_id', clienteId).eq('id', contactId).maybeSingle();
    if (error || !current?.updated_at) return false;
    const ids = metaAdIds(current.tracking_data);
    if (ids.length !== 1 || ids[0] !== ad.id) return false;
    const next = mergeMetaAdEnrichment(current.tracking_data, { ad, accountName }, new Date().toISOString());
    if (next.status !== 'changed') return false;
    const account = metaAdIdentity(ad).account_id;
    const { data: links, error: linkError } = await supabase.from('cliente_meta_accounts').select('meta_account_id')
      .eq('cliente_id', clienteId).eq('is_active', true).in('meta_account_id', [account, `act_${account}`]).limit(1);
    if (linkError || !links?.length) return false;
    const { data: saved, error: saveError } = await supabase.from('cliente_whatsapp_contact')
      .update({ tracking_data: next.tracking, updated_at: new Date().toISOString() })
      .eq('cliente_id', clienteId).eq('id', contactId).eq('updated_at', current.updated_at).select('id').maybeSingle();
    return !saveError && Boolean(saved);
  } catch { return false; }
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
