import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { ClienteCrmSettingsProvider } from '@/contexts/ClienteCrmSettingsContext';
import { useCrmRefresh } from '@/contexts/CrmRefreshContext';
import { useCrmPipeline } from '@/hooks/useCrmPipeline';
import { useClientMembers } from '@/hooks/useClientMembers';
import LeadDetailContent from '@/components/crm/LeadDetailContent';
import EditLeadModal from '@/components/crm/EditLeadModal';

const LeadDetailPage = () => {
  const { leadId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { setRefreshFn } = useCrmRefresh() || {};
  const { pipelines } = useCrmPipeline();
  const { members: clientMembers } = useClientMembers();

  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [editingLead, setEditingLead] = useState(null);

  const backPath = location.pathname.replace(/\/[^/]+$/, '');

  const fetchLead = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    setNotFound(false);
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('*, product:product_id(id, name, code), pipeline:pipeline_id(id, nome, descricao), stage:stage_id(id, nome, ordem, tipo, tempo_max_horas, color, acoes_obrigatorias, etapas_permitidas), responsavel:responsavel_id(id, full_name, avatar_url)')
        .eq('id', leadId)
        .single();
      if (error) {
        if (error.code === 'PGRST116') setNotFound(true);
        else throw error;
        setLead(null);
        return;
      }
      setLead(data);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro ao carregar lead', description: err?.message });
      setLead(null);
    } finally {
      setLoading(false);
    }
  }, [leadId, toast]);

  useEffect(() => {
    fetchLead();
  }, [fetchLead]);
  useEffect(() => {
    if (setRefreshFn) setRefreshFn(() => fetchLead);
  }, [setRefreshFn, fetchLead]);

  const handleUpdateLead = async (id, payload) => {
    const { data, error } = await supabase
      .from('leads')
      .update(payload)
      .eq('id', id)
      .select('*, product:product_id(id, name, code), pipeline:pipeline_id(id, nome, descricao), stage:stage_id(id, nome, ordem, tipo, tempo_max_horas, color, acoes_obrigatorias, etapas_permitidas), responsavel:responsavel_id(id, full_name, avatar_url)')
      .single();
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao atualizar', description: error.message });
      return { data: null, error };
    }
    setLead(data);
    toast({ title: 'Lead atualizado', description: 'As informações foram salvas.' });
    return { data, error: null };
  };

  const handleTransfer = async (lead, { pipeline_id, stage_id, status: stage_nome, status_vida, stage_entered_at }) => {
    await handleUpdateLead(lead.id, {
      pipeline_id,
      stage_id,
      status: stage_nome,
      status_vida: status_vida || 'ativo',
      stage_entered_at: stage_entered_at || new Date().toISOString(),
    });
    navigate(backPath);
  };

  const handleEditSave = (payload) => {
    if (!payload?.id) return;
    handleUpdateLead(payload.id, {
      nome: payload.nome,
      whatsapp: payload.whatsapp,
      email: payload.email,
      data_entrada: payload.data_entrada,
      origem: payload.origem,
      sub_origem: payload.sub_origem,
      agendamento: payload.agendamento,
      status: payload.status,
      vendedor: payload.vendedor,
      responsavel_id: payload.responsavel_id,
      valor: payload.valor,
      observacoes: payload.observacoes,
      etiquetas: payload.etiquetas,
    });
    setEditingLead(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !lead) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <p className="text-muted-foreground mb-4">Lead não encontrado ou você não tem permissão para visualizá-lo.</p>
        <Button variant="outline" onClick={() => navigate(backPath)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar ao funil
        </Button>
      </div>
    );
  }

  return (
    <ClienteCrmSettingsProvider clienteIdOverride={lead?.cliente_id}>
      <div className="flex flex-col flex-1 min-h-0 w-full">
        <header className="sticky top-0 z-10 shrink-0 flex items-center gap-6 w-full min-w-0 py-4 bg-white dark:bg-card border-b border-gray-200/80 dark:border-gray-800 shadow-[0_4px_12px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.35)] px-4 sm:px-6 md:px-8">
          <Button variant="ghost" size="sm" className="shrink-0" onClick={() => navigate(backPath)}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar ao funil
          </Button>
          <nav className="text-sm text-muted-foreground flex items-center gap-1.5 flex-wrap min-w-0">
            <span>CRM</span>
            <span aria-hidden>/</span>
            <span>Leads</span>
            {lead.nome && (
              <>
                <span aria-hidden>/</span>
                <span className="text-foreground/90 truncate max-w-[200px]">{lead.nome}</span>
              </>
            )}
          </nav>
        </header>

        <div className="flex-1 min-h-0 overflow-auto">
          <div className="w-full max-w-7xl mx-auto px-4 md:px-6 py-6">
                <LeadDetailContent
              lead={lead}
              onClose={() => navigate(backPath)}
              onEdit={setEditingLead}
              onUpdateLead={handleUpdateLead}
              members={clientMembers}
              pipelines={pipelines || []}
              onTransfer={handleTransfer}
              isOpen={true}
              isPage={true}
            />

            <EditLeadModal
              lead={editingLead}
              isOpen={!!editingLead}
              onClose={() => setEditingLead(null)}
              onSave={handleEditSave}
              members={clientMembers}
            />
          </div>
        </div>
      </div>
    </ClienteCrmSettingsProvider>
  );
};

export default LeadDetailPage;
