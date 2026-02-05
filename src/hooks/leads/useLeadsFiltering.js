import { useMemo } from 'react';

export const useLeadsFiltering = (leads) => {
  const filteredLeads = useMemo(() => {
    if (!leads) return [];
    return [...leads].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }, [leads]);

  return { filteredLeads };
};
