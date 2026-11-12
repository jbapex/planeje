import { useState, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { mergePixelEvents } from '@/lib/funilPixelMeta';

async function invokeMeta(action, body) {
  const { data, error } = await supabase.functions.invoke('meta-ads-api', {
    body: { action, ...body },
  });
  if (error) throw error;
  if (data?.error?.message) throw new Error(data.error.message);
  return data;
}

/**
 * Pixels, públicos e eventos Meta para o nó pixel-meta do funil.
 */
export function useFunilPixelMeta({ clienteId, adAccountId, pixelId }) {
  const [pixels, setPixels] = useState([]);
  const [loadingPixels, setLoadingPixels] = useState(false);
  const [pixelsError, setPixelsError] = useState(null);

  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);

  const fetchPixels = useCallback(
    async ({ force = false } = {}) => {
      if (!adAccountId) {
        setPixels([]);
        return [];
      }
      setLoadingPixels(true);
      setPixelsError(null);
      try {
        const data = await invokeMeta('get-ad-pixels', { adAccountId });
        const list = data?.pixels || [];
        setPixels(list);
        return list;
      } catch (err) {
        setPixelsError(err.message || 'Erro ao carregar pixels');
        setPixels([]);
        return [];
      } finally {
        setLoadingPixels(false);
      }
    },
    [adAccountId]
  );

  const syncPixelMeta = useCallback(
    async (selectedPixelId, selectedPixelName) => {
      if (!adAccountId || !selectedPixelId) {
        throw new Error('Selecione um pixel e conecte à campanha Meta.');
      }
      setSyncing(true);
      setSyncError(null);
      try {
        const [audiencesData, eventsData] = await Promise.all([
          invokeMeta('get-custom-audiences', {
            adAccountId,
            pixelId: selectedPixelId,
          }),
          invokeMeta('get-pixel-events-summary', {
            pixelId: selectedPixelId,
            clienteId: clienteId || undefined,
          }),
        ]);

        const events = mergePixelEvents(
          eventsData?.apiEvents || [],
          eventsData?.logEvents || []
        );

        const pixelMeta = {
          pixelId: selectedPixelId,
          pixelName: selectedPixelName || eventsData?.pixel?.name || selectedPixelId,
          events,
          customAudiences: (audiencesData?.audiences || []).map((a) => ({
            id: a.id,
            name: a.name,
            subtype: a.subtype,
            approximateCount: a.approximateCount,
            deliveryStatus: a.deliveryStatus,
          })),
          fetchedAt: new Date().toISOString(),
        };

        return pixelMeta;
      } catch (err) {
        const msg = err.message || 'Erro ao atualizar pixel';
        setSyncError(msg);
        throw err;
      } finally {
        setSyncing(false);
      }
    },
    [adAccountId, clienteId]
  );

  return {
    pixels,
    loadingPixels,
    pixelsError,
    fetchPixels,
    syncing,
    syncError,
    syncPixelMeta,
  };
}
