import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

/**
 * Carrega vendas de um lead (crm_vendas + itens com produto).
 * @param {string|null} leadId - id do lead
 * @returns {{ vendas: Array, loading: boolean, refetch: function }}
 */
export function useLeadVendas(leadId) {
  const [vendas, setVendas] = useState([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!leadId) {
      setVendas([]);
      return;
    }
    setLoading(true);
    try {
      const selectWithServicos = `
        id,
        lead_id,
        cliente_id,
        data_venda,
        valor_total,
        observacoes,
        created_at,
        crm_venda_itens (
          id,
          venda_id,
          item_tipo,
          product_id,
          service_id,
          descricao,
          quantidade,
          valor_unitario,
          valor_total,
          product:product_id (id, name, code),
          service:service_id (id, name, code)
        )
      `;
      let { data, error } = await supabase
        .from('crm_vendas')
        .select(selectWithServicos)
        .eq('lead_id', leadId)
        .order('data_venda', { ascending: false });
      if (error) {
        const selectLegacy = `
          id,
          lead_id,
          cliente_id,
          data_venda,
          valor_total,
          observacoes,
          created_at,
          crm_venda_itens (
            id,
            venda_id,
            product_id,
            descricao,
            quantidade,
            valor_unitario,
            valor_total,
            product:product_id (id, name, code)
          )
        `;
        const fallback = await supabase.from('crm_vendas').select(selectLegacy).eq('lead_id', leadId).order('data_venda', { ascending: false });
        if (fallback.error) throw fallback.error;
        data = fallback.data;
      }
      setVendas(data || []);
    } catch (err) {
      console.error('[useLeadVendas]', err);
      setVendas([]);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { vendas, loading, refetch };
}
