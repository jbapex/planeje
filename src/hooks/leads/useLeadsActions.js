import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { normalizePhoneNumber, getPhoneVariations } from '@/lib/leadUtils';

export const useLeadsActions = (setLeads, refetchLeads, { pipelineId = null, firstStageId = null, firstStageNome = null } = {}) => {
  const { toast } = useToast();
  const { profile } = useAuth();

  const isClient = profile?.role === 'cliente' && profile?.cliente_id;
  const effectiveClienteId = profile?.cliente_id;

  const checkForDuplicate = async (whatsapp) => {
    if (!effectiveClienteId || !whatsapp) return null;
    const formattedWhatsapp = normalizePhoneNumber(whatsapp);
    if (!formattedWhatsapp) return null;
    const phoneVariations = getPhoneVariations(formattedWhatsapp);

    let q = supabase
      .from('leads')
      .select('*, product:product_id(id, name, code)')
      .in('whatsapp', phoneVariations)
      .limit(1);
    if (isClient) q = q.eq('cliente_id', effectiveClienteId);

    const { data: existingLeads, error: fetchError } = await q;

    if (fetchError) {
      toast({ variant: 'destructive', title: 'Erro ao verificar duplicidade', description: fetchError.message });
      return null;
    }
    return existingLeads?.[0] || null;
  };

  const createNewLead = async (leadData, showToast = true) => {
    if (!effectiveClienteId) return null;
    const formattedWhatsapp = normalizePhoneNumber(leadData.whatsapp);
    const newLeadData = {
      ...leadData,
      whatsapp: formattedWhatsapp || leadData.whatsapp,
      cliente_id: effectiveClienteId,
      data_entrada: leadData.data_entrada || new Date().toISOString().split('T')[0],
      valor: leadData.valor ?? 0,
      updated_at: new Date().toISOString(),
      profile_pic_url: leadData.profile_pic_url || null,
      responsavel_id: leadData.responsavel_id || null,
      etiquetas: Array.isArray(leadData.etiquetas) ? leadData.etiquetas : [],
    };
    if (pipelineId) newLeadData.pipeline_id = pipelineId;
    if (firstStageId) {
      newLeadData.stage_id = firstStageId;
      newLeadData.status = firstStageNome ?? leadData.status ?? 'agendado';
      newLeadData.status_vida = 'ativo';
      newLeadData.stage_entered_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('leads')
      .insert([newLeadData])
      .select('*, product:product_id(id, name, code), responsavel:responsavel_id(id, full_name, avatar_url)')
      .single();

    if (error) {
      if (showToast) toast({ variant: 'destructive', title: 'Erro ao adicionar lead', description: error.message });
      return null;
    }
    refetchLeads();
    if (showToast) toast({ title: 'Lead adicionado!', description: 'Novo lead cadastrado com sucesso.' });
    return data;
  };

  const updateExistingLead = async (existingLead, leadData, showToast = true) => {
    if (!effectiveClienteId) return null;
    const formattedWhatsapp = normalizePhoneNumber(leadData.whatsapp);
    const updatedData = {
      ...existingLead,
      ...leadData,
      whatsapp: formattedWhatsapp || leadData.whatsapp,
      nome: leadData.nome || existingLead.nome,
      updated_at: new Date().toISOString(),
    };
    delete updatedData.id;
    delete updatedData.product;
    delete updatedData.responsavel;

    const { data: updatedLead, error: updateError } = await supabase
      .from('leads')
      .update(updatedData)
      .eq('id', existingLead.id)
      .select('*, product:product_id(id, name, code), responsavel:responsavel_id(id, full_name, avatar_url)')
      .single();

    if (updateError) {
      if (showToast) toast({ variant: 'destructive', title: 'Erro ao atualizar', description: updateError.message });
      return null;
    }
    refetchLeads();
    if (showToast) toast({ title: 'Lead atualizado!', description: 'O lead já existia e foi atualizado.' });
    return updatedLead;
  };

  const handleAddLead = async (leadData, showToast = true) => {
    const existingLead = await checkForDuplicate(leadData.whatsapp);
    if (existingLead) return { duplicate: true, existingLead };
    const newLead = await createNewLead(leadData, showToast);
    return { duplicate: false, newLead };
  };

  const handleUpdateLead = async (id, updatedFields) => {
    const { data, error } = await supabase
      .from('leads')
      .update(updatedFields)
      .eq('id', id)
      .select('*, product:product_id(id, name, code), responsavel:responsavel_id(id, full_name, avatar_url)')
      .single();
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao Atualizar', description: error.message });
      return { data: null, error };
    }
    setLeads((prev) => prev.map((lead) => (lead.id === id ? data : lead)));
    toast({ title: 'Lead Atualizado!', description: 'As informações do lead foram salvas.' });
    return { data, error: null };
  };

  const handleDeleteLead = async (id) => {
    const { error } = await supabase.from('leads').delete().eq('id', id);
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao Excluir', description: error.message });
    } else {
      setLeads((prev) => prev.filter((lead) => lead.id !== id));
      toast({ title: 'Lead Excluído!', description: 'O lead foi removido com sucesso.' });
    }
  };

  const handleBulkAddLeads = async (leadsData) => {
    if (!effectiveClienteId) return { success: false, createdCount: 0, createdLeads: [] };
    const leadsToInsert = [];
    const now = new Date().toISOString();
    for (const lead of leadsData) {
      const existing = await checkForDuplicate(lead.whatsapp);
      if (!existing) {
        const row = {
          ...lead,
          cliente_id: effectiveClienteId,
          data_entrada: lead.data_entrada || now.split('T')[0],
        };
        if (pipelineId) row.pipeline_id = pipelineId;
        if (firstStageId) {
          row.stage_id = firstStageId;
          row.status = firstStageNome ?? row.status ?? 'agendado';
          row.status_vida = 'ativo';
          row.stage_entered_at = now;
        }
        leadsToInsert.push(row);
      }
    }
    if (leadsToInsert.length === 0) {
      toast({
        title: 'Nenhum lead novo para adicionar',
        description: 'Todos os leads da lista já existem.',
        variant: 'default',
      });
      return { success: true, createdCount: 0, createdLeads: [] };
    }
    const { data: createdLeads, error } = await supabase.from('leads').insert(leadsToInsert).select();
    if (error) {
      toast({ variant: 'destructive', title: 'Erro na importação em massa', description: error.message });
      return { success: false, createdCount: 0, createdLeads: [] };
    }
    toast({
      title: 'Sucesso!',
      description: `${createdLeads?.length || 0} leads foram importados. ${leadsData.length - (createdLeads?.length || 0)} já existiam.`,
    });
    refetchLeads();
    return { success: true, createdCount: createdLeads?.length || 0, createdLeads: createdLeads || [] };
  };

  const handleBulkDeleteLeads = async (leadIds) => {
    const { error } = await supabase.from('leads').delete().in('id', leadIds);
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao excluir leads', description: error.message });
    } else {
      setLeads((prev) => prev.filter((lead) => !leadIds.includes(lead.id)));
      toast({ title: 'Leads excluídos', description: `${leadIds.length} leads foram removidos.` });
    }
  };

  return {
    handleAddLead,
    updateExistingLead,
    handleUpdateLead,
    handleDeleteLead,
    handleBulkAddLeads,
    handleBulkDeleteLeads,
  };
};
