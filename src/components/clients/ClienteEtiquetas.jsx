import React, { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { etiquetaCor, etiquetaNome } from '@/lib/clienteEtiquetas';

export function EtiquetaDot({ chave, catalog }) {
  const color = catalog.find((item) => item.chave === chave)?.color || etiquetaCor(chave);
  return <span className={`mr-2 inline-block h-2 w-2 shrink-0 rounded-full ${color}`} />;
}

export function EtiquetaBadges({ etiquetas = [], catalog = [] }) {
  if (!etiquetas.length) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex max-w-[16rem] flex-wrap gap-1">
      {etiquetas.map((chave) => (
        <span key={chave} className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200/90 bg-slate-50 px-1.5 py-px text-[10px] font-normal leading-4 text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${etiquetaCor(chave)}`} />
          <span className="truncate">{etiquetaNome(chave, catalog)}</span>
        </span>
      ))}
    </div>
  );
}

export function EtiquetaCreateRow({ onCreate, disabled }) {
  const [nome, setNome] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving || disabled || nome.trim().length < 2) return;
    setSaving(true);
    try {
      const created = await onCreate(nome);
      if (created) setNome('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-1 border-t p-2">
      <input
        value={nome}
        onChange={(event) => setNome(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            submit();
          }
        }}
        placeholder="Nova etiqueta"
        maxLength={40}
        aria-label="Nome da nova etiqueta"
        className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
        disabled={disabled || saving}
      />
      <Button type="button" size="sm" className="h-8 px-2" disabled={disabled || saving || nome.trim().length < 2} onClick={submit}>
        <Plus className="mr-1 h-3.5 w-3.5" />
        {saving ? '…' : 'Criar'}
      </Button>
    </div>
  );
}

export function ClienteEtiquetaAssign({ client, catalog = [], onChange, onCreate }) {
  const selected = client.etiquetas || [];
  const toggle = (chave) => {
    const next = selected.includes(chave) ? selected.filter((item) => item !== chave) : [...selected, chave];
    onChange(next);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="rounded-md text-left hover:bg-muted/40" aria-label={`Etiquetas de ${client.empresa || 'cliente'}`}>
          <EtiquetaBadges etiquetas={selected} catalog={catalog} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0" align="start" onClick={(event) => event.stopPropagation()}>
        <div className="max-h-56 overflow-y-auto p-1">
          {catalog.map((option) => {
            const on = selected.includes(option.chave);
            return (
              <button
                key={option.chave}
                type="button"
                className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() => toggle(option.chave)}
              >
                <EtiquetaDot chave={option.chave} catalog={catalog} />
                <span className="min-w-0 flex-1 truncate">{option.nome}</span>
                {on && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            );
          })}
        </div>
        <EtiquetaCreateRow
          onCreate={async (nome) => {
            const created = await onCreate(nome);
            if (created && !selected.includes(created.chave)) onChange([...selected, created.chave]);
            return created;
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
