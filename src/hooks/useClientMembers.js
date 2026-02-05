import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';

/**
 * Lista os membros (profiles com role=cliente e mesmo cliente_id) para o cliente logado.
 * Usado para preencher o seletor de "Responsável" nos leads.
 */
export function useClientMembers() {
  const { profile } = useAuth();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    const clienteId = profile?.cliente_id;
    if (!clienteId) {
      setMembers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .eq('cliente_id', clienteId)
      .eq('role', 'cliente')
      .order('full_name');
    setLoading(false);
    if (!error) setMembers(data || []);
    else setMembers([]);
  }, [profile?.cliente_id]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { members, loading, refetch };
}
