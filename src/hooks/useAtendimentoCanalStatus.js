import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import {
  canaisDesconectados,
  canaisNovosDesconectados,
  textoCanalDesconectado,
} from '@/lib/uazapiInstanceStatus';

const POLL_MS = 2 * 60 * 1000;

export function useAtendimentoCanalStatus({ clienteId, enabled }) {
  const [channels, setChannels] = useState([]);
  const previousRef = useRef(null);
  const [novos, setNovos] = useState([]);

  const probe = useCallback(async () => {
    if (!enabled || !clienteId) return;
    const { data, error } = await supabase.functions.invoke('uazapi-instance-status', {
      body: { cliente_id: clienteId },
    });
    if (error || !Array.isArray(data?.channels)) return;
    const next = data.channels;
    setNovos(canaisNovosDesconectados(previousRef.current, next));
    previousRef.current = next;
    setChannels(next);
  }, [clienteId, enabled]);

  useEffect(() => {
    previousRef.current = null;
    setChannels([]);
    setNovos([]);
    if (!enabled || !clienteId) return undefined;
    probe();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') probe();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') probe();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [clienteId, enabled, probe]);

  return {
    disconnected: canaisDesconectados(channels),
    texto: textoCanalDesconectado(channels),
    novos,
  };
}
