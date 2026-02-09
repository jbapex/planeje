import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useClienteCrmSettings } from '@/contexts/ClienteCrmSettingsContext';

/**
 * Exibe e edita a etapa do funil (quando stages existem) ou o status legado.
 * Com pipeline: opções = etapas do funil (value = stage_id).
 * Sem pipeline: opções = settings.statuses (value = nome do status).
 */
const StatusEditor = ({ value, onChange, disabled, className, stages }) => {
  const { settings } = useClienteCrmSettings();
  const statuses = settings?.statuses || [];
  const useStages = Array.isArray(stages) && stages.length > 0;

  if (useStages) {
    return (
      <Select value={value || ''} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className={className}>
          <SelectValue placeholder="Etapa..." />
        </SelectTrigger>
        <SelectContent>
          {stages.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {(s.nome || '').replace(/_/g, ' ')}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

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
