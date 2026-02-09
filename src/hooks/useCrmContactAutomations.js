import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';

/**
 * CRUD de regras de automação (contato novo -> funil/etapa).
 * Retorna lista de regras com pipeline e stage expandidos.
 */
export function useCrmContactAutomations() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [automations, setAutomations] = useState([]);
  const [loading, setLoading] = useState(true);

  const clienteId = profile?.cliente_id;

  const fetchAutomations = useCallback(async () => {
    if (!clienteId) {
      setAutomations([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('crm_contact_automations')
      .select(`
        id,
        cliente_id,
        trigger_type,
        pipeline_id,
        stage_id,
        is_active,
        created_at,
        updated_at,
        pipeline:crm_pipelines(id, nome),
        stage:crm_stages(id, nome, pipeline_id)
      `)
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: false });

    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao carregar automações', description: error.message });
      setAutomations([]);
    } else {
      setAutomations(data || []);
    }
    setLoading(false);
  }, [clienteId, toast]);

  useEffect(() => {
    fetchAutomations();
  }, [fetchAutomations]);

  const create = useCallback(
    async ({ pipeline_id, stage_id, is_active = true, trigger_type = 'new_contact' }) => {
      if (!clienteId) return null;
      const triggerLabel = trigger_type === 'new_contact_meta_ads' ? 'Novo contato Meta Ads' : 'Novo contato';
      const { data, error } = await supabase
        .from('crm_contact_automations')
        .insert({
          cliente_id: clienteId,
          trigger_type: trigger_type || 'new_contact',
          pipeline_id,
          stage_id,
          is_active,
        })
        .select('*, pipeline:crm_pipelines(id, nome), stage:crm_stages(id, nome, pipeline_id)')
        .single();

      if (error) {
        if (error.code === '23505') {
          toast({
            variant: 'destructive',
            title: 'Já existe uma automação ativa',
            description: `Desative a atual ou edite-a. Só é permitida uma regra ativa por "${triggerLabel}".`,
          });
        } else {
          toast({ variant: 'destructive', title: 'Erro ao criar automação', description: error.message });
        }
        return null;
      }
      setAutomations((prev) => [data, ...prev]);
      toast({ title: 'Automação criada', description: 'Os contatos serão exportados para o funil escolhido.' });
      return data;
    },
    [clienteId, toast]
  );

  const update = useCallback(
    async (id, { pipeline_id, stage_id, is_active }) => {
      const payload = {};
      if (pipeline_id !== undefined) payload.pipeline_id = pipeline_id;
      if (stage_id !== undefined) payload.stage_id = stage_id;
      if (is_active !== undefined) payload.is_active = is_active;
      if (Object.keys(payload).length === 0) return null;

      const { data, error } = await supabase
        .from('crm_contact_automations')
        .update(payload)
        .eq('id', id)
        .select('*, pipeline:crm_pipelines(id, nome), stage:crm_stages(id, nome, pipeline_id)')
        .single();

      if (error) {
        if (error.code === '23505') {
          toast({
            variant: 'destructive',
            title: 'Conflito',
            description: 'Já existe outra automação ativa para "Novo contato". Desative-a primeiro.',
          });
        } else {
          toast({ variant: 'destructive', title: 'Erro ao atualizar automação', description: error.message });
        }
        return null;
      }
      setAutomations((prev) => prev.map((a) => (a.id === id ? data : a)));
      toast({ title: 'Automação atualizada' });
      return data;
    },
    [toast]
  );

  const setActive = useCallback(
    async (id, is_active) => {
      return update(id, { is_active });
    },
    [update]
  );

  const remove = useCallback(
    async (id) => {
      const { error } = await supabase.from('crm_contact_automations').delete().eq('id', id);
      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao excluir automação', description: error.message });
        return false;
      }
      setAutomations((prev) => prev.filter((a) => a.id !== id));
      toast({ title: 'Automação excluída' });
      return true;
    },
    [toast]
  );

  return {
    automations,
    loading,
    refetch: fetchAutomations,
    create,
    update,
    setActive,
    remove,
  };
}
