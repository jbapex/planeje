import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { validateLeadMove } from '@/lib/crmFunnelValidation';

const STORAGE_KEY_PREFIX = 'crm_active_pipeline_';

/**
 * Lista todos os funis do cliente, funil ativo (localStorage), CRUD de pipeline e etapas.
 * Expõe pipeline/stages do funil ativo e moveLeadToStage para compatibilidade com o resto do app.
 */
export function useCrmPipeline() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [pipelines, setPipelines] = useState([]);
  const [pipeline, setPipeline] = useState(null);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);

  const clienteId = profile?.cliente_id;
  const storageKey = clienteId ? `${STORAGE_KEY_PREFIX}${clienteId}` : null;

  const getStoredPipelineId = useCallback(() => {
    if (!storageKey) return null;
    try {
      return localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  }, [storageKey]);

  const setCurrentPipelineId = useCallback(
    (id) => {
      if (!storageKey) return;
      try {
        if (id) localStorage.setItem(storageKey, id);
        else localStorage.removeItem(storageKey);
      } catch {}
      setPipeline((prev) => (id ? pipelines.find((p) => p.id === id) || prev : null));
      if (id) fetchStagesForPipeline(id);
      else setStages([]);
    },
    [storageKey, pipelines]
  );

  const fetchStagesForPipeline = useCallback(
    async (pipelineId) => {
      const { data, error } = await supabase
        .from('crm_stages')
        .select('*')
        .eq('pipeline_id', pipelineId)
        .order('ordem', { ascending: true });
      if (error) {
        setStages([]);
        return;
      }
      setStages(data || []);
    },
    []
  );

  const fetchPipelinesAndStages = useCallback(async () => {
    if (!clienteId) {
      setPipelines([]);
      setPipeline(null);
      setStages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: pipelinesData, error: errP } = await supabase
        .from('crm_pipelines')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('created_at', { ascending: true });

      if (errP) throw errP;
      setPipelines(pipelinesData || []);

      const storedId = getStoredPipelineId();
      const firstId = pipelinesData?.[0]?.id || null;
      const activeId = storedId && pipelinesData?.some((p) => p.id === storedId) ? storedId : firstId;

      if (activeId) {
        const pip = pipelinesData?.find((p) => p.id === activeId) || pipelinesData?.[0] || null;
        setPipeline(pip);
        await fetchStagesForPipeline(pip.id);
        if (!storedId || storedId !== activeId) {
          try {
            if (storageKey) localStorage.setItem(storageKey, activeId);
          } catch {}
        }
      } else {
        setPipeline(null);
        setStages([]);
      }
    } catch (e) {
      toast({ title: 'Erro ao carregar funis', description: e.message, variant: 'destructive' });
      setPipelines([]);
      setPipeline(null);
      setStages([]);
    } finally {
      setLoading(false);
    }
  }, [clienteId, toast, getStoredPipelineId, fetchStagesForPipeline, storageKey]);

  useEffect(() => {
    fetchPipelinesAndStages();
  }, [fetchPipelinesAndStages]);

  useEffect(() => {
    if (!pipeline || !pipelines.length) return;
    const storedId = getStoredPipelineId();
    if (storedId !== pipeline.id) {
      try {
        if (storageKey) localStorage.setItem(storageKey, pipeline.id);
      } catch {}
    }
  }, [pipeline, pipelines, getStoredPipelineId, storageKey]);

  const currentPipelineId = pipeline?.id || null;

  const createPipeline = useCallback(
    async ({ nome = 'Novo funil', descricao = '' } = {}) => {
      if (!clienteId) return null;
      const { data, error } = await supabase
        .from('crm_pipelines')
        .insert({ cliente_id: clienteId, nome, descricao })
        .select('*')
        .single();
      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao criar funil', description: error.message });
        return null;
      }
      setPipelines((prev) => [...prev, data]);
      toast({ title: 'Funil criado', description: nome });
      return data;
    },
    [clienteId, toast]
  );

  const updatePipeline = useCallback(
    async (id, { nome, descricao }) => {
      const { data, error } = await supabase
        .from('crm_pipelines')
        .update({ nome, descricao, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .single();
      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao atualizar funil', description: error.message });
        return null;
      }
      setPipelines((prev) => prev.map((p) => (p.id === id ? data : p)));
      if (pipeline?.id === id) setPipeline(data);
      toast({ title: 'Funil atualizado' });
      return data;
    },
    [pipeline?.id, toast]
  );

  const deletePipeline = useCallback(
    async (id) => {
      const { error } = await supabase.from('crm_pipelines').delete().eq('id', id);
      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao excluir funil', description: error.message });
        return false;
      }
      setPipelines((prev) => prev.filter((p) => p.id !== id));
      if (pipeline?.id === id) {
        const next = pipelines.find((p) => p.id !== id);
        setPipeline(next || null);
        if (next) fetchStagesForPipeline(next.id);
        else setStages([]);
        try {
          if (storageKey) {
            if (next?.id) localStorage.setItem(storageKey, next.id);
            else localStorage.removeItem(storageKey);
          }
        } catch {}
      }
      toast({ title: 'Funil excluído' });
      return true;
    },
    [pipeline?.id, pipelines, storageKey, fetchStagesForPipeline, toast]
  );

  const createStage = useCallback(
    async (pipelineId, { nome, tipo = 'intermediaria', color = '#6b7280', ordem = 0 }) => {
      const { data, error } = await supabase
        .from('crm_stages')
        .insert({ pipeline_id: pipelineId, nome, tipo, color, ordem })
        .select('*')
        .single();
      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao criar etapa', description: error.message });
        return null;
      }
      if (pipeline?.id === pipelineId) setStages((prev) => [...prev, data].sort((a, b) => a.ordem - b.ordem));
      return data;
    },
    [pipeline?.id, toast]
  );

  const updateStage = useCallback(
    async (id, payload) => {
      const { data, error } = await supabase
        .from('crm_stages')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .single();
      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao atualizar etapa', description: error.message });
        return null;
      }
      setStages((prev) => prev.map((s) => (s.id === id ? data : s)));
      return data;
    },
    [toast]
  );

  const reorderStages = useCallback(
    async (pipelineId, stageIds) => {
      const updates = stageIds.map((id, ordem) => supabase.from('crm_stages').update({ ordem }).eq('id', id));
      for (const u of updates) {
        const { error } = await u;
        if (error) {
          toast({ variant: 'destructive', title: 'Erro ao reordenar etapas', description: error.message });
          await fetchStagesForPipeline(pipelineId);
          return false;
        }
      }
      if (pipeline?.id === pipelineId) {
        setStages((prev) => {
          const byId = Object.fromEntries(prev.map((s) => [s.id, s]));
          return stageIds.map((id) => byId[id]).filter(Boolean);
        });
      }
      return true;
    },
    [pipeline?.id, fetchStagesForPipeline, toast]
  );

  const deleteStage = useCallback(
    async (id) => {
      const stage = stages.find((s) => s.id === id);
      const { error } = await supabase.from('crm_stages').delete().eq('id', id);
      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao excluir etapa', description: error.message });
        return false;
      }
      setStages((prev) => prev.filter((s) => s.id !== id));
      return true;
    },
    [stages, toast]
  );

  const moveLeadToStage = useCallback(
    async (lead, targetStageId, options = {}) => {
      const { motivoGanhoPerdido = '' } = options;
      if (!lead?.id || !targetStageId) {
        return { success: false, message: 'Lead ou etapa de destino inválido.' };
      }

      const targetStage = stages.find((s) => s.id === targetStageId);
      if (!targetStage) {
        return { success: false, message: 'Etapa de destino não encontrada.' };
      }

      const sourceStage = lead.stage || null;

      let interacoesCount = 0;
      try {
        const { count } = await supabase
          .from('crm_lead_interacoes')
          .select('*', { count: 'exact', head: true })
          .eq('lead_id', lead.id);
        interacoesCount = count ?? 0;
      } catch {
        // ignore
      }

      const hasProximaAcao = !!(lead?.proxima_acao);

      const validation = validateLeadMove({
        sourceStage,
        targetStage,
        lead,
        interacoesCount,
        hasProximaAcao,
        motivoGanhoPerdido: motivoGanhoPerdido?.trim() || '',
      });

      if (!validation.valid) {
        return { success: false, message: validation.message };
      }

      const statusVida = (targetStage.tipo === 'ganho' && 'ganho') || (targetStage.tipo === 'perdido' && 'perdido') || 'ativo';
      const now = new Date().toISOString();

      const leadUpdate = {
        stage_id: targetStageId,
        status: targetStage.nome,
        status_vida: statusVida,
        stage_entered_at: now,
        ultima_interacao: now,
        updated_at: now,
      };
      if (targetStage.tipo === 'ganho' || targetStage.tipo === 'perdido') {
        leadUpdate.observacoes = [lead.observacoes, `[${targetStage.nome}] ${motivoGanhoPerdido}`.trim()].filter(Boolean).join('\n');
      }

      const { error: updateError } = await supabase.from('leads').update(leadUpdate).eq('id', lead.id);

      if (updateError) {
        toast({ title: 'Erro ao mover lead', description: updateError.message, variant: 'destructive' });
        return { success: false, message: updateError.message };
      }

      await supabase.from('crm_funnel_events').insert({
        lead_id: lead.id,
        stage_anterior_id: sourceStage?.id || null,
        stage_nova_id: targetStageId,
        realizado_em: now,
        user_id: profile?.id || null,
        motivo_ganho_perdido: (targetStage.tipo === 'ganho' || targetStage.tipo === 'perdido') ? motivoGanhoPerdido?.trim() : null,
      });

      toast({ title: 'Lead movido', description: `Lead atualizado para a etapa "${(targetStage.nome || '').replace(/_/g, ' ')}".` });
      return { success: true };
    },
    [stages, profile?.id, toast]
  );

  return {
    pipelines,
    pipeline,
    stages,
    loading,
    currentPipelineId,
    setCurrentPipelineId,
    refetch: fetchPipelinesAndStages,
    createPipeline,
    updatePipeline,
    deletePipeline,
    createStage,
    updateStage,
    reorderStages,
    deleteStage,
    moveLeadToStage,
    fetchStagesForPipeline,
  };
}
