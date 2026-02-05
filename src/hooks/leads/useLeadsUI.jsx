import React, { useMemo } from 'react';
import { Circle } from 'lucide-react';
import { useClienteCrmSettings, getStatusText as getStatusTextFromContext } from '@/contexts/ClienteCrmSettingsContext';
import { parseDate } from '@/lib/leadUtils';

export const useLeadsUI = () => {
  const { settings } = useClienteCrmSettings();

  const getStatusIcon = useMemo(() => {
    return (status) => {
      const item = settings?.statuses?.find((s) => s.name === status);
      const color = item?.color || '#6b7280';
      return (props) => <Circle className="shrink-0" size={10} fill={color} color={color} {...props} />;
    };
  }, [settings?.statuses]);

  const getStatusText = getStatusTextFromContext;

  const parseDateString = (dateString) => {
    return parseDate(dateString);
  };

  return { getStatusIcon, getStatusText, parseDateString };
};
