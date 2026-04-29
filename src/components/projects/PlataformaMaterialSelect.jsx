import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PLATAFORMA_SELECT_NONE, plataformaSelectValue } from '@/hooks/usePlataformasConteudo';

/**
 * Select de plataforma alinhado à tabela `plataformas_conteudo` (com opção vazia e valor legado).
 */
export default function PlataformaMaterialSelect({
  value,
  onChange,
  plataformas,
  loading,
  disabled,
  triggerClassName,
  placeholder = 'Plataforma',
}) {
  const names = (plataformas || []).map((p) => p.nome);
  const trimmed = (value || '').trim();
  const unknown = trimmed && !names.includes(trimmed);
  const selectValue = unknown ? trimmed : plataformaSelectValue(value, names);

  return (
    <Select
      value={selectValue}
      onValueChange={(v) => onChange(v === PLATAFORMA_SELECT_NONE ? '' : v)}
      disabled={disabled || loading}
    >
      <SelectTrigger className={triggerClassName}>
        <SelectValue placeholder={loading ? 'Carregando…' : placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={PLATAFORMA_SELECT_NONE}>—</SelectItem>
        {unknown ? <SelectItem value={trimmed}>{trimmed} (cadastro antigo)</SelectItem> : null}
        {(plataformas || []).map((p) => (
          <SelectItem key={p.id} value={p.nome}>
            {p.nome}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
