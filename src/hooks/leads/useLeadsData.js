import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { startOfMonth, endOfMonth, parse } from 'date-fns';
import { normalizePhoneNumber, getPhoneVariations } from '@/lib/leadUtils';

const PAGE_SIZE = 50;

export const useLeadsData = () => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);

  const fetchLeads = useCallback(
    async (filters = {}, searchTerm = '', isNewSearch = false, pipelineId = null) => {
      if (!profile) return;

      const isClient = profile?.role === 'cliente' && profile?.cliente_id;
      if (isClient && !profile.cliente_id) return;

      if (loading && !isNewSearch) return;

      setLoading(true);
      const currentPage = isNewSearch ? 0 : page;

      try {
        let query = supabase
          .from('leads')
          .select(
            '*, product:product_id(id, name, code), pipeline:pipeline_id(id, nome, descricao), stage:stage_id(id, nome, ordem, tipo, tempo_max_horas, color, acoes_obrigatorias, etapas_permitidas), responsavel:responsavel_id(id, full_name, avatar_url)',
            { count: 'exact' }
          );

        if (isClient) query = query.eq('cliente_id', profile.cliente_id);

        if (pipelineId) query = query.eq('pipeline_id', pipelineId);

        if (filters.month && filters.month !== 'all') {
          const monthDate = parse(filters.month, 'yyyy-MM', new Date());
          const startDate = startOfMonth(monthDate);
          const endDate = endOfMonth(monthDate);
          query = query
            .gte('data_entrada', startDate.toISOString().split('T')[0])
            .lte('data_entrada', endDate.toISOString().split('T')[0]);
        } else if (filters.dateRange?.from) {
          const fromStr = filters.dateRange.from.toISOString().split('T')[0];
          const toVal = filters.dateRange.to || filters.dateRange.from;
          const toStr = toVal.toISOString().split('T')[0];
          query = query
            .gte('data_entrada', fromStr)
            .lte('data_entrada', toStr);
        }

        if (searchTerm && searchTerm.trim()) {
          const term = searchTerm.trim();
          const searchParts = term.split(/\s+/).filter(Boolean);
          const nameSearch = searchParts.map((part) => `nome.ilike.%${part}%`).join(',');
          const orConditions = [nameSearch, `whatsapp.ilike.%${term}%`, `email.ilike.%${term}%`].join(',');
          query = query.or(orConditions);
        }

        if (filters.status && filters.status !== 'todos') query = query.eq('status', filters.status);
        if (filters.vendedor && filters.vendedor !== 'todos') query = query.eq('vendedor', filters.vendedor);
        if (filters.origem && filters.origem !== 'todos') query = query.eq('origem', filters.origem);
        if (filters.product) {
          let productQuery = supabase.from('crm_produtos').select('id').ilike('name', `%${filters.product}%`);
          if (isClient) productQuery = productQuery.eq('cliente_id', profile.cliente_id);
          const { data: productData } = await productQuery;
          const productIds = (productData || []).map((p) => p.id);
          if (productIds.length > 0) query = query.in('product_id', productIds);
          else query = query.eq('id', '00000000-0000-0000-0000-000000000000');
        }

        const from = currentPage * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        query = query.range(from, to).order('created_at', { ascending: false });

        const { data, error, count } = await query;

        if (error) throw error;

        let leadsData = data || [];
        const clienteId = isClient ? profile.cliente_id : (leadsData[0]?.cliente_id || null);
        if (clienteId && leadsData.length > 0 && leadsData.some((l) => !l.profile_pic_url)) {
          const { data: contacts } = await supabase
            .from('cliente_whatsapp_contact')
            .select('from_jid, phone, profile_pic_url')
            .eq('cliente_id', clienteId)
            .not('profile_pic_url', 'is', null);
          const phoneToPic = new Map();
          (contacts || []).forEach((c) => {
            const pic = c.profile_pic_url;
            if (!pic) return;
            const fromNum = (c.phone || '').replace(/\D/g, '') || (c.from_jid || '').replace(/@.*$/, '').replace(/\D/g, '');
            if (fromNum) {
              const normalized = normalizePhoneNumber(fromNum) || fromNum;
              phoneToPic.set(normalized, pic);
              getPhoneVariations(normalized).forEach((v) => phoneToPic.set(v, pic));
            }
          });
          leadsData = leadsData.map((lead) => {
            if (lead.profile_pic_url) return lead;
            const variations = getPhoneVariations(lead.whatsapp || '');
            const pic = variations.map((v) => phoneToPic.get(v)).find(Boolean);
            return pic ? { ...lead, profile_pic_url: pic } : lead;
          });
        }

        setLeads((prev) => (isNewSearch ? leadsData : [...(prev || []), ...leadsData]));
        setHasMore((data?.length || 0) === PAGE_SIZE && (currentPage + 1) * PAGE_SIZE < (count || 0));
        setPage(currentPage + 1);
      } catch (err) {
        toast({ title: 'Erro ao buscar leads', description: err.message, variant: 'destructive' });
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    },
    [profile, toast, page, loading]
  );

  const resetAndFetch = useCallback(
    (filters, searchTerm, pipelineId = null) => {
      setPage(0);
      setHasMore(true);
      setLeads([]);
      fetchLeads(filters, searchTerm, true, pipelineId);
    },
    [fetchLeads]
  );

  return { leads, setLeads, loading, fetchLeads, hasMore, resetAndFetch };
};
