import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useLeadsData } from '@/hooks/leads/useLeadsData';
import { useLeadsFiltering } from '@/hooks/leads/useLeadsFiltering';
import { useLeadsActions } from '@/hooks/leads/useLeadsActions';
import useLeadsMetrics from '@/hooks/leads/useLeadsMetrics';
import { useLeadsExport } from '@/hooks/leads/useLeadsExport';
import { useLeadsUI } from '@/hooks/leads/useLeadsUI';
import { useCrmPipeline } from '@/hooks/useCrmPipeline';
import { useFunnelEvents } from '@/hooks/useFunnelEvents';

const SEARCH_DEBOUNCE_MS = 400;

export const useLeads = () => {
  const { profile } = useAuth();
  const { leads, setLeads, loading, fetchLeads, hasMore, resetAndFetch } = useLeadsData();
  const [filters, setFilters] = useState({
    status: 'todos',
    vendedor: 'todos',
    product: '',
    month: 'all',
    dateRange: undefined,
    origem: 'todos',
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const searchDebounceRef = useRef(null);

  const {
    pipelines,
    pipeline,
    stages,
    loading: pipelineLoading,
    currentPipelineId,
    setCurrentPipelineId,
    refetch: refetchPipeline,
    moveLeadToStage,
  } = useCrmPipeline();
  const { events: funnelEvents } = useFunnelEvents();

  const refetchLeads = useCallback(() => {
    fetchLeads(filters, searchTerm, true, currentPipelineId);
  }, [fetchLeads, filters, searchTerm, currentPipelineId]);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      searchDebounceRef.current = null;
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchTerm]);

  useEffect(() => {
    if (profile !== undefined) fetchLeads(filters, debouncedSearchTerm, true, currentPipelineId);
  }, [profile?.cliente_id, profile?.role, filters.month, filters.dateRange, filters.status, filters.vendedor, filters.product, filters.origem, currentPipelineId, debouncedSearchTerm]);

  const loadMoreLeads = useCallback(() => {
    fetchLeads(filters, searchTerm, false, currentPipelineId);
  }, [fetchLeads, filters, searchTerm, currentPipelineId]);

  const { filteredLeads } = useLeadsFiltering(leads);
  const metrics = useLeadsMetrics(leads, { dateRange: filters.dateRange }, { funnelEvents, stages });
  const actions = useLeadsActions(setLeads, refetchLeads, {
    pipelineId: pipeline?.id ?? null,
    firstStageId: stages?.[0]?.id ?? null,
    firstStageNome: stages?.[0]?.nome ?? null,
  });
  const { exportData } = useLeadsExport(filteredLeads);
  const { getStatusIcon, getStatusText, parseDateString } = useLeadsUI();

  const moveLeadToStageAndRefetch = useCallback(
    async (lead, targetStageId, options) => {
      const result = await moveLeadToStage(lead, targetStageId, options);
      if (result.success) refetchLeads();
      return result;
    },
    [moveLeadToStage, refetchLeads]
  );

  const resetAndFetchWithPipeline = useCallback(
    (filtersArg, searchTermArg) => {
      resetAndFetch(filtersArg ?? filters, searchTermArg ?? searchTerm, currentPipelineId);
    },
    [resetAndFetch, filters, searchTerm, currentPipelineId]
  );

  return {
    leads,
    setLeads,
    loading,
    refetchLeads,
    loadMoreLeads,
    hasMore,
    metrics,
    filteredLeads,
    filters,
    setFilters,
    searchTerm,
    setSearchTerm,
    resetAndFetch: resetAndFetchWithPipeline,
    pipelines,
    pipeline,
    stages,
    pipelineLoading,
    currentPipelineId,
    setCurrentPipelineId,
    refetchPipeline,
    moveLeadToStage: moveLeadToStageAndRefetch,
    ...actions,
    exportData,
    getStatusIcon,
    getStatusText,
    parseDateString,
  };
};
