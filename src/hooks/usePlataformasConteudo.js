import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

/**
 * Plataformas ativas (para selects em plano, calendário, tarefas).
 */
export function usePlataformasConteudo() {
  const [plataformas, setPlataformas] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('plataformas_conteudo')
      .select('id,nome,sort_order,ativo')
      .eq('ativo', true)
      .order('sort_order', { ascending: true })
      .order('nome', { ascending: true });
    if (error) {
      setPlataformas([]);
    } else {
      setPlataformas(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { plataformas, loading, reload };
}

export const PLATAFORMA_SELECT_NONE = '__none__';

/** Valor seguro para <Select value={...}> quando não há escolha. */
export function plataformaSelectValue(stored, listaNomes) {
  const s = (stored || '').trim();
  if (!s) return PLATAFORMA_SELECT_NONE;
  if (listaNomes.includes(s)) return s;
  return s; /* legado: Radix precisa de SelectItem correspondente */
}
