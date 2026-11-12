import React, { useMemo, useState } from 'react';
import { Check, Loader2, Plus, Tag } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import {
  mergeAnalysisCatalog,
  normalizeAnalysisLabelName,
  resolveAnalysisLabels,
} from '@/lib/rastreamentoAnalysisLabels';
import { persistAnalysisLabels } from '@/lib/persistAnalysisLabels';

function chipStyle(color) {
  return {
    borderColor: `${color}55`,
    background: `${color}18`,
    color,
  };
}

export default function LeadAnalysisLabels({
  clienteId,
  contact,
  lead,
  catalog = [],
  disabled = false,
  onSaved,
  apiceStatus = '',
  compact = false,
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const selected = useMemo(
    () => resolveAnalysisLabels({ contact, lead, extraCatalog: catalog }),
    [contact, lead, catalog],
  );
  const options = useMemo(() => mergeAnalysisCatalog([...catalog, ...selected.map((name) => ({ name }))]), [catalog, selected]);

  const persist = async (next) => {
    if (!clienteId || disabled) return;
    setSaving(true);
    try {
      await persistAnalysisLabels({
        clienteId,
        contact,
        lead,
        labels: next,
        extraCatalog: catalog,
      });
      onSaved?.(next);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Não gravou a etiqueta', description: error?.message || String(error) });
    } finally {
      setSaving(false);
    }
  };

  const toggle = (name) => {
    const key = normalizeAnalysisLabelName(name);
    const has = selected.some((item) => item.toLowerCase() === key.toLowerCase());
    void persist(has ? selected.filter((item) => item.toLowerCase() !== key.toLowerCase()) : [...selected, key]);
  };

  const addCustom = () => {
    const name = normalizeAnalysisLabelName(draft);
    if (!name) return;
    setDraft('');
    if (!selected.some((item) => item.toLowerCase() === name.toLowerCase())) {
      void persist([...selected, name]);
    }
  };

  return (
    <div className={`flex flex-wrap items-center gap-1 ${compact ? 'min-w-0' : 'min-w-[8rem]'}`} onClick={(event) => event.stopPropagation()}>
      {apiceStatus ? (
        <span className="inline-flex items-center rounded-full border border-violet-300 bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-900 dark:bg-violet-950/50 dark:text-violet-200 dark:border-violet-800">
          CRM-Apice: {apiceStatus}
        </span>
      ) : null}
      {selected.map((name) => {
        const option = options.find((item) => item.name.toLowerCase() === name.toLowerCase());
        return (
          <span
            key={name}
            className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium"
            style={chipStyle(option?.color || '#64748b')}
          >
            {name}
          </span>
        );
      })}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-[11px] rounded-lg"
            disabled={disabled || saving || !clienteId}
            title="Marcar etiqueta de análise. Não envia à Meta."
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Tag className="h-3 w-3 mr-1" />}
            {selected.length ? 'Editar' : 'Marcar'}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-3 space-y-2">
          <p className="text-[11px] text-muted-foreground">Só para análise. Não envia conversão à Meta.</p>
          <ul className="space-y-1">
            {options.map((option) => {
              const on = selected.some((item) => item.toLowerCase() === option.name.toLowerCase());
              return (
                <li key={option.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
                    onClick={() => toggle(option.name)}
                    disabled={saving}
                  >
                    <span
                      className="flex h-4 w-4 items-center justify-center rounded border"
                      style={{ borderColor: option.color, color: option.color }}
                    >
                      {on ? <Check className="h-3 w-3" /> : null}
                    </span>
                    {option.name}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center gap-1 pt-1">
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addCustom();
                }
              }}
              placeholder="Nova etiqueta"
              className="h-8 text-xs"
              disabled={saving}
            />
            <Button type="button" size="icon" className="h-8 w-8 shrink-0" onClick={addCustom} disabled={saving || !draft.trim()}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
