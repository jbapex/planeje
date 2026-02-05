import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useClienteCrmSettings } from '@/contexts/ClienteCrmSettingsContext';

const StatusEditor = ({ value, onChange, disabled, className }) => {
  const { settings } = useClienteCrmSettings();
  const statuses = settings?.statuses || [];

  return (
    <Select value={value || ''} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue placeholder="Status..." />
      </SelectTrigger>
      <SelectContent>
        {statuses.map((s) => (
          <SelectItem key={s.name} value={s.name}>
            {(s.name || '').replace(/_/g, ' ')}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default StatusEditor;
