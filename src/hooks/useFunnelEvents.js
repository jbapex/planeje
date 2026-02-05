import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';

/**
 * Busca eventos de funil (movimentações de leads) do cliente atual.
 * Usado para relatórios: conversão, motivo de perda, volume.
 */
export function useFunnelEvents() {
  const { profile } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);

  const clienteId = profile?.cliente_id;

  const fetchEvents = useCallback(async () => {
    if (!clienteId) {
      setEvents([]);
      return;
    }
    setLoading(true);
    try {
      const { data: leadIds } = await supabase
        .from('leads')
        .select('id')
        .eq('cliente_id', clienteId);
      const ids = (leadIds || []).map((l) => l.id);
      if (ids.length === 0) {
        setEvents([]);
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from('crm_funnel_events')
        .select('*')
        .in('lead_id', ids)
        .order('realizado_em', { ascending: false });
      if (error) throw error;
      setEvents(data || []);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [clienteId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return { events, loading, refetch: fetchEvents };
}
